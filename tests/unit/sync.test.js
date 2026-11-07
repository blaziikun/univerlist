// Account & sync on the server: sign-in, sessions, nobody reaching anyone else's data, versions, limits, deleting everything.
// The database is a real SQLite (node:sqlite) with the real schema; the passkey checks are stand-ins (tested in the browser).
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import site from "../../worker/index.js";
import { DAILY, LIMITS } from "../../worker/sync.js";

// every migration, in order, as `wrangler d1 migrations apply` runs them
const MIG = new URL("../../worker/migrations/", import.meta.url);
const SCHEMA = fs
    .readdirSync(MIG)
    .filter(f => f.endsWith(".sql"))
    .sort()
    .map(f => fs.readFileSync(new URL(f, MIG), "utf8"))
    .join("\n");
function fakeD1() {
    const db = new DatabaseSync(":memory:");
    db.exec(SCHEMA);
    const stmt = (sql, a = []) => ({
        bind: (...x) => stmt(sql, x),
        first: async () => db.prepare(sql).get(...a) ?? null,
        all: async () => ({ results: db.prepare(sql).all(...a) }),
        run: async () => {
            const r = db.prepare(sql).run(...a);
            return { meta: { changes: Number(r.changes) } };
        },
    });
    return {
        db,
        prepare: sql => stmt(sql),
        batch: async L => {
            for (const s of L) await s.run();
        },
    };
}
function fakeR2() {
    const m = new Map();
    return {
        m,
        put: async (k, v) => {
            m.set(k, new Uint8Array(v));
        },
        get: async k => (m.has(k) ? { body: m.get(k) } : null),
        head: async k => (m.has(k) ? { size: m.get(k).length, uploaded: new Date() } : null),
        delete: async k => {
            m.delete(k);
        },
    };
}
// stand-in passkeys: a "response" says which challenge and origin it signed, as a real authenticator's would
let n = 0;
const WA = {
    generateRegistrationOptions: async o => ({ challenge: "c" + ++n, rp: { id: o.rpID }, user: { name: o.userName } }),
    generateAuthenticationOptions: async o => ({ challenge: "c" + ++n, allowCredentials: o.allowCredentials }),
    verifyRegistrationResponse: async ({ response, expectedChallenge, expectedOrigin }) =>
        response.challenge === expectedChallenge && response.origin === expectedOrigin
            ? {
                  verified: true,
                  registrationInfo: {
                      credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
                  },
              }
            : { verified: false },
    verifyAuthenticationResponse: async ({ response, expectedChallenge, expectedOrigin, credential }) => ({
        verified:
            response.challenge === expectedChallenge &&
            response.origin === expectedOrigin &&
            credential.id === response.id,
        authenticationInfo: { newCounter: 1 },
    }),
};
import * as S from "../../worker/sync.js";
Object.assign(S.WEBAUTHN, WA);

const O = "https://u.dev";
let env;
beforeEach(() => {
    env = { ACCOUNTS: fakeD1(), LIBRARIES: fakeR2(), ASSETS: { fetch: () => new Response("file") } };
});
const call = (path, { method = "GET", body, cookie, headers = {}, origin = O, raw } = {}) =>
    site.fetch(
        new Request(O + "/api/sync" + path, {
            method,
            headers: {
                ...(method !== "GET" ? { "X-UL-Sync": "1", Origin: origin } : {}),
                ...(cookie ? { Cookie: cookie } : {}),
                ...(body && !raw ? { "Content-Type": "application/json" } : {}),
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/140",
                ...headers,
            },
            body: raw ? body : body ? JSON.stringify(body) : undefined,
        }),
        env
    );
const cookieOf = r => (/__Host-ul_s=([^;]+)/.exec(r.headers.get("Set-Cookie") || "") || [])[1];
async function signUp(name = "Ana", cred = "cred-" + name) {
    const o = await (await call("/register/options", { method: "POST", body: { name } })).json();
    const r = await call("/register/verify", {
        method: "POST",
        body: { id: o.id, response: { id: cred, challenge: o.options.challenge, origin: O } },
    });
    return { r, cookie: "__Host-ul_s=" + cookieOf(r), cred };
}
const KEYBOX = { v: 1, kdf: "PBKDF2-SHA256", iter: 600000, salt: "AAAA", iv: "BBBB", wrapped: "CCCC", kid: "K1" };
const PASSKEY_BOX = { v: 1, kdf: "PRF-HKDF-SHA256", iv: "DDDD", wrapped: "EEEE", kid: "K1" };
/** turn sync on: with a passphrase box, or (passkey: its id) a passkey box */
const setUp = (cookie, passkey) =>
    call("/setup", {
        method: "POST",
        cookie,
        body: passkey ? { kid: "K1", passkey: { id: passkey, box: PASSKEY_BOX } } : { kid: "K1", keybox: KEYBOX },
    });
async function signIn(cred) {
    const o = await (await call("/login/options", { method: "POST" })).json();
    return call("/login/verify", {
        method: "POST",
        body: { id: o.id, response: { id: cred, challenge: o.options.challenge, origin: O } },
    });
}
const blob = (k = 64) => crypto.getRandomValues(new Uint8Array(k));

describe("Account & sync: signing in", () => {
    it("says it isn't set up when the database isn't there", async () => {
        env = { ASSETS: env.ASSETS };
        expect((await call("/me")).status).toBe(501);
    });
    it("signs you up with a passkey, in a cookie no script can read", async () => {
        const { r } = await signUp();
        expect(r.status).toBe(200);
        const c = r.headers.get("Set-Cookie");
        expect(c).toMatch(/^__Host-ul_s=[A-Za-z0-9_-]{43};/);
        expect(c).toContain("HttpOnly");
        expect(c).toContain("Secure");
        expect(c).toContain("SameSite=Strict");
        expect(c).toContain("Path=/");
    });
    it("keeps only the hash of a session, never the token", async () => {
        const { cookie } = await signUp();
        const tok = cookie.split("=")[1];
        const rows = env.ACCOUNTS.db.prepare("SELECT token_hash FROM sessions").all();
        expect(rows.length).toBe(1);
        expect(rows[0].token_hash).not.toBe(tok);
    });
    it("refuses requests from other sites, and ones without its header", async () => {
        expect(
            (
                await site.fetch(
                    new Request(O + "/api/sync/login/options", { method: "POST", headers: { Origin: O } }),
                    env
                )
            ).status
        ).toBe(403);
        expect((await call("/login/options", { method: "POST", origin: "https://evil.example" })).status).toBe(403);
    });
    it("offers no CORS at all", async () => {
        const { cookie } = await signUp();
        const r = await call("/me", { cookie });
        expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
    it("uses a challenge once, and not after it expires", async () => {
        const o = await (await call("/register/options", { method: "POST", body: { name: "B" } })).json();
        const resp = { id: "k1", challenge: o.options.challenge, origin: O };
        expect((await call("/register/verify", { method: "POST", body: { id: o.id, response: resp } })).status).toBe(
            200
        );
        expect(
            (await call("/register/verify", { method: "POST", body: { id: o.id, response: { ...resp, id: "k2" } } }))
                .status
        ).toBe(400);
        const o2 = await (
            await call("/register/verify".replace("verify", "options"), { method: "POST", body: { name: "C" } })
        ).json();
        env.ACCOUNTS.db.prepare("UPDATE challenges SET expires = 1").run();
        expect(
            (
                await call("/register/verify", {
                    method: "POST",
                    body: { id: o2.id, response: { id: "k3", challenge: o2.options.challenge, origin: O } },
                })
            ).status
        ).toBe(400);
    });
    it("won't accept a passkey signed for another site", async () => {
        const o = await (await call("/register/options", { method: "POST", body: { name: "D" } })).json();
        expect(
            (
                await call("/register/verify", {
                    method: "POST",
                    body: {
                        id: o.id,
                        response: { id: "k", challenge: o.options.challenge, origin: "https://evil.example" },
                    },
                })
            ).status
        ).toBe(400);
    });
    it("signs you in with your passkey, and not with one it doesn't know", async () => {
        const { cred } = await signUp("Ana");
        let o = await (await call("/login/options", { method: "POST" })).json();
        expect(
            (
                await call("/login/verify", {
                    method: "POST",
                    body: { id: o.id, response: { id: "nope", challenge: o.options.challenge, origin: O } },
                })
            ).status
        ).toBe(401);
        o = await (await call("/login/options", { method: "POST" })).json();
        const r = await call("/login/verify", {
            method: "POST",
            body: { id: o.id, response: { id: cred, challenge: o.options.challenge, origin: O } },
        });
        expect(r.status).toBe(200);
        expect(cookieOf(r)).toBeTruthy();
    });
    it("slows down an address that tries too often", async () => {
        let k = 0;
        env.AUTH_RL = { limit: async () => ({ success: ++k <= 2 }) };
        expect((await call("/login/options", { method: "POST" })).status).toBe(200);
        expect((await call("/login/options", { method: "POST" })).status).toBe(200);
        expect((await call("/login/options", { method: "POST" })).status).toBe(429);
    });
    it("stops taking new accounts at the cap you set", async () => {
        env.MAX_USERS = "1";
        await signUp("A");
        expect((await call("/register/options", { method: "POST", body: { name: "B" } })).status).toBe(503);
    });
    it("needs you signed in for anything about your account", async () => {
        for (const p of ["/me", "/data", "/audit", "/versions"]) expect((await call(p)).status).toBe(401);
        expect((await call("/me", { cookie: "__Host-ul_s=" + "x".repeat(43) })).status).toBe(401);
    });
});

describe("Account & sync: your data and nobody else's", () => {
    it("stores what you send and gives the same bytes back", async () => {
        const { cookie } = await signUp();
        expect(
            (await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } }))
                .status
        ).toBe(409); // no key yet
        expect((await setUp(cookie)).status).toBe(200);
        const b = blob(100),
            r = await call("/data", { method: "PUT", cookie, raw: true, body: b, headers: { "If-Match": "0" } });
        expect(await r.json()).toMatchObject({ version: 1 });
        const g = await call("/data", { cookie });
        expect(new Uint8Array(await g.arrayBuffer())).toEqual(b);
        expect(g.headers.get("X-Version")).toBe("1");
        expect(JSON.parse(decodeURIComponent(g.headers.get("X-Keybox")))).toMatchObject({ wrapped: "CCCC" });
    });
    it("never lets one account read or change another's", async () => {
        const a = await signUp("A"),
            b = await signUp("B");
        await setUp(a.cookie);
        await call("/data", { method: "PUT", cookie: a.cookie, raw: true, body: blob(), headers: { "If-Match": "0" } });
        const g = await call("/data", { cookie: b.cookie });
        expect(await g.json()).toMatchObject({ version: 0, keybox: null });
        // there's no way to name another account: ids in the path or body are ignored
        expect((await call("/data?user=" + "anything", { cookie: b.cookie })).headers.get("X-Version")).toBeNull();
        await call("/passkey/remove", { method: "POST", cookie: b.cookie, body: { id: a.cred } });
        expect(env.ACCOUNTS.db.prepare("SELECT COUNT(*) AS n FROM credentials WHERE id = ?").get(a.cred).n).toBe(1);
        await call("/sessions/revoke", { method: "POST", cookie: b.cookie, body: { others: true } });
        expect((await call("/me", { cookie: a.cookie })).status).toBe(200);
    });
    it("won't overwrite a newer version from another device", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } });
        const r = await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } });
        expect(r.status).toBe(409);
        expect(await r.json()).toMatchObject({ version: 1 });
        expect((await call("/data", { method: "PUT", cookie, raw: true, body: blob() })).status).toBe(428);
    });
    it("keeps the last few versions, so a bad sync can be undone", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        for (let v = 0; v < 5; v++)
            await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": String(v) } });
        const L = await (await call("/versions", { cookie })).json();
        expect(L.map(x => x.version)).toEqual([5, 4, 3]);
        expect(env.LIBRARIES.m.size).toBe(LIMITS.keep);
        expect((await call("/data/version?v=4", { cookie })).status).toBe(200);
        expect((await call("/data/version?v=1", { cookie })).status).toBe(404);
    });
    it("also keeps the newest version from over a day ago, so a burst of bad saves can't push every good copy out", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } });
        // version 1 was saved two days ago
        const row = env.ACCOUNTS.db.prepare("SELECT id, blobs FROM users").get();
        const B = JSON.parse(row.blobs).map(b => ({ ...b, at: b.at - 2 * 864e5 }));
        env.ACCOUNTS.db.prepare("UPDATE users SET blobs = ? WHERE id = ?").run(JSON.stringify(B), row.id);
        for (let v = 1; v < 6; v++)
            await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": String(v) } });
        const L = await (await call("/versions", { cookie })).json();
        expect(L.map(x => x.version)).toEqual([6, 5, 4, 1]);
        expect(env.LIBRARIES.m.size).toBe(LIMITS.keep + 1);
    });
    it("refuses an upload past the limit while it's still arriving, even without saying its size", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        const chunk = new Uint8Array(1024 * 1024);
        let sent = 0;
        const body = new ReadableStream({
            pull(c) {
                if (sent++ > LIMITS.blob / chunk.length + 2) c.close();
                else c.enqueue(chunk);
            },
        });
        const r = await site.fetch(
            new Request(O + "/api/sync/data", {
                method: "PUT",
                headers: { "X-UL-Sync": "1", Origin: O, Cookie: cookie, "If-Match": "0" },
                body,
                duplex: "half",
            }),
            env
        );
        expect(r.status).toBe(413);
        expect(env.LIBRARIES.m.size).toBe(0);
    });
    it("refuses what's too big, or isn't encrypted data", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        expect(
            (await call("/data", { method: "PUT", cookie, raw: true, body: blob(10), headers: { "If-Match": "0" } }))
                .status
        ).toBe(400);
        expect(
            (
                await call("/data", {
                    method: "PUT",
                    cookie,
                    raw: true,
                    body: blob(64),
                    headers: { "If-Match": "0", "Content-Length": String(LIMITS.blob + 1) },
                })
            ).status
        ).toBe(413);
        expect(
            (
                await call("/key", {
                    method: "PUT",
                    cookie,
                    body: { keybox: { wrapped: "x".repeat(5000), salt: "a", iv: "b" } },
                })
            ).status
        ).toBe(400);
    });
    it("signs a device out, or every other one", async () => {
        const a = await signUp("A");
        const o = await (await call("/login/options", { method: "POST" })).json();
        const second =
            "__Host-ul_s=" +
            cookieOf(
                await call("/login/verify", {
                    method: "POST",
                    body: { id: o.id, response: { id: a.cred, challenge: o.options.challenge, origin: O } },
                })
            );
        await call("/sessions/revoke", { method: "POST", cookie: second, body: { others: true } });
        expect((await call("/me", { cookie: a.cookie })).status).toBe(401);
        expect((await call("/me", { cookie: second })).status).toBe(200);
        const out = await call("/logout", { method: "POST", cookie: second });
        expect(out.headers.get("Set-Cookie")).toContain("Max-Age=0");
        expect((await call("/me", { cookie: second })).status).toBe(401);
    });
    it("keeps your own audit list, without addresses", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        const L = await (await call("/audit", { cookie })).json();
        expect(L.map(x => x.kind)).toEqual(["sync set up", "account created"]);
        expect(JSON.stringify(env.ACCOUNTS.db.prepare("SELECT * FROM audit").all())).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    });
    it("deletes everything when you delete your account", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } });
        expect((await call("/delete", { method: "POST", cookie, body: {} })).status).toBe(400);
        expect((await call("/delete", { method: "POST", cookie, body: { confirm: "DELETE" } })).status).toBe(200);
        for (const t of ["users", "credentials", "sessions", "audit"])
            expect(env.ACCOUNTS.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n).toBe(0);
        expect(env.LIBRARIES.m.size).toBe(0);
    });
});

describe("Account & sync: passkeys that unlock your library", () => {
    it("lets a passkey carry the sealed key, so sync works with no passphrase", async () => {
        const { cookie, cred } = await signUp();
        expect((await (await call("/me", { cookie })).json()).has_key).toBe(0);
        expect((await setUp(cookie, cred)).status).toBe(200);
        const me = await (await call("/me", { cookie })).json();
        expect(me).toMatchObject({ has_key: 1, has_pass: 0 });
        expect(me.passkeys[0].box).toEqual(PASSKEY_BOX);
        const r = await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } });
        expect(r.status).toBe(200);
    });
    it("hands a passkey its own box when it signs in, and only its own", async () => {
        const { cookie, cred } = await signUp("Ana");
        await setUp(cookie, cred);
        expect(await (await signIn(cred)).json()).toMatchObject({ ok: true, passkey: cred, box: PASSKEY_BOX });
        const other = await signUp("Ben");
        expect(await (await signIn(other.cred)).json()).toMatchObject({ box: null });
    });
    it("won't put a box on someone else's passkey, or take one that isn't a box", async () => {
        const a = await signUp("A"),
            b = await signUp("B");
        await setUp(b.cookie);
        expect(
            (await call("/passkey/box", { method: "POST", cookie: b.cookie, body: { id: a.cred, box: PASSKEY_BOX } }))
                .status
        ).toBe(404);
        expect(
            (
                await call("/setup", {
                    method: "POST",
                    cookie: a.cookie,
                    body: { kid: "K1", passkey: { id: b.cred, box: PASSKEY_BOX } },
                })
            ).status
        ).toBe(404);
        expect(
            env.ACCOUNTS.db.prepare("SELECT unlock_box FROM credentials WHERE id = ?").get(a.cred).unlock_box
        ).toBeNull();
        for (const box of [
            null,
            "x",
            { ...PASSKEY_BOX, kdf: "PBKDF2-SHA256" },
            { ...PASSKEY_BOX, wrapped: "x".repeat(5000) },
            { ...PASSKEY_BOX, iv: 5 },
        ])
            expect(
                (await call("/passkey/box", { method: "POST", cookie: a.cookie, body: { id: a.cred, box } })).status
            ).toBe(400);
    });
    it("won't remove the last thing that can unlock your library", async () => {
        const { cookie, cred } = await signUp();
        await setUp(cookie, cred);
        env.ACCOUNTS.db
            .prepare(
                "INSERT INTO credentials (id, user_id, public_key, created, last_used) SELECT 'second', user_id, 'pk', 1, 1 FROM credentials"
            )
            .run();
        expect((await call("/passkey/remove", { method: "POST", cookie, body: { id: cred } })).status).toBe(400);
        await call("/key", { method: "PUT", cookie, body: { keybox: KEYBOX } }); // a recovery passphrase
        expect((await call("/passkey/remove", { method: "POST", cookie, body: { id: cred } })).status).toBe(200);
        const kinds = (await (await call("/audit", { cookie })).json()).map(x => x.kind);
        expect(kinds).toEqual(["passkey removed", "recovery passphrase set", "sync set up", "account created"]);
    });
});

describe("Account & sync: one sync key per account, whatever happens at once", () => {
    it("sets sync up once: a second device setting it up a moment later is refused, not mixed in", async () => {
        const { cookie, cred } = await signUp();
        expect(
            (await call("/passkey/box", { method: "POST", cookie, body: { id: cred, box: PASSKEY_BOX } })).status
        ).toBe(409); // setup first
        expect((await setUp(cookie, cred)).status).toBe(200);
        const other = { kid: "K2", keybox: { ...KEYBOX, kid: "K2" } };
        expect((await call("/setup", { method: "POST", cookie, body: other })).status).toBe(409);
        expect(env.ACCOUNTS.db.prepare("SELECT kid, keybox FROM users").get()).toEqual({ kid: "K1", keybox: null });
    });
    it("only takes boxes for that key", async () => {
        const { cookie, cred } = await signUp();
        await setUp(cookie, cred);
        expect((await call("/key", { method: "PUT", cookie, body: { keybox: { ...KEYBOX, kid: "K2" } } })).status).toBe(
            409
        );
        expect(
            (
                await call("/passkey/box", {
                    method: "POST",
                    cookie,
                    body: { id: cred, box: { ...PASSKEY_BOX, kid: "K2" } },
                })
            ).status
        ).toBe(409);
        expect((await call("/key", { method: "PUT", cookie, body: { keybox: KEYBOX } })).status).toBe(200);
    });
    it("an account from before key ids learns its key from its first new box", async () => {
        const { cookie, cred } = await signUp();
        env.ACCOUNTS.db.prepare("UPDATE users SET keybox = ?").run(JSON.stringify({ ...KEYBOX, kid: undefined }));
        expect(
            (await call("/passkey/box", { method: "POST", cookie, body: { id: cred, box: PASSKEY_BOX } })).status
        ).toBe(200);
        expect(env.ACCOUNTS.db.prepare("SELECT kid FROM users").get().kid).toBe("K1");
    });
    it("two devices saving at once: one wins, and the cloud copy is whole", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        const a = blob(80),
            b = blob(90);
        const put = body => call("/data", { method: "PUT", cookie, raw: true, body, headers: { "If-Match": "0" } });
        const [ra, rb] = await Promise.all([put(a), put(b)]);
        expect([ra.status, rb.status].sort()).toEqual([200, 409]);
        const got = new Uint8Array(await (await call("/data", { cookie })).arrayBuffer());
        expect(got).toEqual(ra.status === 200 ? a : b);
        expect(env.LIBRARIES.m.size).toBe(1); // the loser's file is gone, the winner's isn't
    });
    it("can't be squeezed past the account cap by finishing many sign-ups at once", async () => {
        env.MAX_USERS = "1";
        const opts = await Promise.all(
            ["A", "B"].map(async name => (await call("/register/options", { method: "POST", body: { name } })).json())
        );
        const done = await Promise.all(
            opts.map((o, i) =>
                call("/register/verify", {
                    method: "POST",
                    body: { id: o.id, response: { id: "k" + i, challenge: o.options.challenge, origin: O } },
                })
            )
        );
        expect(done.map(r => r.status).sort()).toEqual([200, 503]);
        expect(env.ACCOUNTS.db.prepare("SELECT COUNT(*) AS n FROM credentials").get().n).toBe(1);
    });
});

describe("Account & sync: staying signed in", () => {
    it("renews a session you keep using, cookie included", async () => {
        const { cookie } = await signUp();
        expect((await call("/me", { cookie })).headers.get("Set-Cookie")).toBeNull(); // just signed in: nothing to renew
        env.ACCOUNTS.db.prepare("UPDATE sessions SET last_seen = 0, expires = ?").run(Date.now() + 864e5);
        const r = await call("/me", { cookie });
        expect(r.status).toBe(200);
        expect(r.headers.get("Set-Cookie")).toContain(cookie.split("=")[1]);
        const { expires } = env.ACCOUNTS.db.prepare("SELECT expires FROM sessions").get();
        expect(expires).toBeGreaterThan(Date.now() + (LIMITS.sessionDays - 1) * 864e5);
    });
    it("still ends one that's gone unused", async () => {
        const { cookie } = await signUp();
        env.ACCOUNTS.db.prepare("UPDATE sessions SET expires = 1").run();
        expect((await call("/me", { cookie })).status).toBe(401);
    });
});

describe("Account & sync: it can't run up a bill", () => {
    it("takes at most 100 accounts unless you say otherwise", async () => {
        env.ACCOUNTS.db.exec(
            "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 100) INSERT INTO users (id, name, created, updated, kid, version) SELECT 'u' || i, 'x', 1, 1, 'K', 1 FROM n"
        );
        expect((await call("/register/options", { method: "POST", body: { name: "B" } })).status).toBe(503);
        env.MAX_USERS = "200";
        expect((await call("/register/options", { method: "POST", body: { name: "B" } })).status).toBe(200);
    });
    it("caps each account's saves and reads per day, and starts again the next day", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        env.ACCOUNTS.db
            .prepare("UPDATE users SET day = ?, writes = ?, reads = ?")
            .run(Math.floor(Date.now() / 864e5), DAILY.writes, DAILY.reads);
        expect(
            (await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } }))
                .status
        ).toBe(429);
        expect(env.LIBRARIES.m.size).toBe(0);
        env.ACCOUNTS.db.prepare("UPDATE users SET day = day - 1").run(); // yesterday's
        expect(
            (await call("/data", { method: "PUT", cookie, raw: true, body: blob(), headers: { "If-Match": "0" } }))
                .status
        ).toBe(200);
        expect(env.ACCOUNTS.db.prepare("SELECT writes FROM users").get().writes).toBe(1);
        expect((await call("/data", { cookie })).status).toBe(200);
        env.ACCOUNTS.db.prepare("UPDATE users SET reads = ?").run(DAILY.reads);
        expect((await call("/data", { cookie })).status).toBe(429);
    });
});

describe("Account & sync: signing a device in with a QR code (no new passkey)", () => {
    const LINK_BOX = { v: 1, kdf: "LINK-AES-GCM", iv: "FFFF", wrapped: "GGGG", kid: "K1" };
    const startLink = cookie => call("/link/start", { method: "POST", cookie, body: { box: LINK_BOX } });
    const join = token => call("/link/join", { method: "POST", body: { token } });
    it("needs you signed in, with sync on, and a box for this account's key", async () => {
        expect((await call("/link/start", { method: "POST", body: { box: LINK_BOX } })).status).toBe(401);
        const { cookie } = await signUp();
        expect((await startLink(cookie)).status).toBe(409); // sync isn't set up yet
        await setUp(cookie);
        expect(
            (await call("/link/start", { method: "POST", cookie, body: { box: { ...LINK_BOX, kid: "K2" } } })).status
        ).toBe(409);
        expect((await startLink(cookie)).status).toBe(200);
    });
    it("signs the new device in with the sealed key, and makes no passkey", async () => {
        const { cookie } = await signUp("Ana");
        await setUp(cookie);
        const { token } = await (await startLink(cookie)).json();
        expect(JSON.stringify(env.ACCOUNTS.db.prepare("SELECT * FROM links").all())).not.toContain(token); // only its hash
        const r = await join(token);
        expect(r.status).toBe(200);
        expect(await r.json()).toMatchObject({ ok: true, name: "Ana", linkBox: LINK_BOX });
        const me = await (await call("/me", { cookie: "__Host-ul_s=" + cookieOf(r) })).json();
        expect(me.passkeys.map(p => p.id)).toEqual(["cred-Ana"]); // still the one passkey
        expect(me.sessions.length).toBe(2);
        expect(await (await call("/link/state", { cookie })).json()).toEqual({ used: true, live: false });
    });
    it("works once, and not after ten minutes", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        const { token } = await (await startLink(cookie)).json();
        expect((await join(token)).status).toBe(200);
        expect((await join(token)).status).toBe(404);
        const second = await (await startLink(cookie)).json();
        env.ACCOUNTS.db.prepare("UPDATE links SET expires = 1").run();
        expect((await join(second.token)).status).toBe(404);
        expect((await join("x".repeat(32))).status).toBe(404);
    });
    it("a new code ends the old one, and cancelling ends it too", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        const first = await (await startLink(cookie)).json();
        const second = await (await startLink(cookie)).json();
        expect((await join(first.token)).status).toBe(404);
        await call("/link/cancel", { method: "POST", cookie });
        expect((await join(second.token)).status).toBe(404);
    });
});

describe("Account & sync: signing in with the recovery code", () => {
    const AUTH = "A".repeat(43),
        AUTH2 = "B".repeat(43);
    it("signs you in with the key made from your code, and keeps only its hash", async () => {
        const { cookie } = await signUp("Ana");
        await call("/setup", { method: "POST", cookie, body: { kid: "K1", keybox: KEYBOX, auth: AUTH } });
        expect(JSON.stringify(env.ACCOUNTS.db.prepare("SELECT * FROM users").all())).not.toContain(AUTH);
        const r = await call("/recover", { method: "POST", body: { auth: AUTH } });
        expect(r.status).toBe(200);
        expect(await r.json()).toMatchObject({ ok: true, name: "Ana" });
        const me = await (await call("/me", { cookie: "__Host-ul_s=" + cookieOf(r) })).json();
        expect(me).toMatchObject({ recovery_signin: 1, has_pass: 1 });
        expect((await call("/recover", { method: "POST", body: { auth: AUTH2 } })).status).toBe(401);
    });
    it("a new code replaces the old one's sign-in too", async () => {
        const { cookie } = await signUp();
        await call("/setup", { method: "POST", cookie, body: { kid: "K1", keybox: KEYBOX, auth: AUTH } });
        await call("/key", { method: "PUT", cookie, body: { keybox: KEYBOX, auth: AUTH2 } });
        expect((await call("/recover", { method: "POST", body: { auth: AUTH } })).status).toBe(401);
        expect((await call("/recover", { method: "POST", body: { auth: AUTH2 } })).status).toBe(200);
    });
    it("is slowed down like any sign-in, and takes only a well-formed key", async () => {
        let k = 0;
        env.AUTH_RL = { limit: async () => ({ success: ++k <= 1 }) };
        expect((await call("/recover", { method: "POST", body: { auth: "short" } })).status).toBe(401);
        expect((await call("/recover", { method: "POST", body: { auth: AUTH } })).status).toBe(429);
    });
});

describe("Account & sync: confirm it's you (for what changes who can get in)", () => {
    const LINK_BOX = { v: 1, kdf: "LINK-AES-GCM", iv: "FFFF", wrapped: "GGGG", kid: "K1" };
    const AUTH = "A".repeat(43);
    /** a device signed in by a QR code: in, but not confirmed */
    async function qrDevice() {
        const { cookie, cred } = await signUp("Ana");
        await call("/setup", { method: "POST", cookie, body: { kid: "K1", keybox: KEYBOX, auth: AUTH } });
        const { token } = await (await call("/link/start", { method: "POST", cookie, body: { box: LINK_BOX } })).json();
        const r = await call("/link/join", { method: "POST", body: { token } });
        return { owner: cookie, qr: "__Host-ul_s=" + cookieOf(r), cred };
    }
    const SENSITIVE = [
        ["/key", "PUT", { keybox: KEYBOX, auth: "C".repeat(43) }],
        ["/passkey/options", "POST", {}],
        ["/passkey/remove", "POST", { id: "cred-Ana" }],
        ["/delete", "POST", { confirm: "DELETE" }],
        [
            "/passkey/box",
            "POST",
            { id: "cred-Ana", box: { v: 1, kdf: "PRF-HKDF-SHA256", iv: "X", wrapped: "Y", kid: "K1" } },
        ],
    ];
    it("a device signed in by a QR code can't delete the account, set a recovery code or change passkeys", async () => {
        const { qr } = await qrDevice();
        for (const [path, method, body] of SENSITIVE) {
            const r = await call(path, { method, cookie: qr, body });
            expect([path, r.status]).toEqual([path, 403]);
        }
        expect((await call("/me", { cookie: qr })).status).toBe(200); // but it's signed in, and syncs
    });
    it("…until it confirms with the recovery code, for a few minutes", async () => {
        const { qr } = await qrDevice();
        expect((await call("/confirm", { method: "POST", cookie: qr, body: { code: "Z".repeat(43) } })).status).toBe(
            401
        );
        expect((await call("/confirm", { method: "POST", cookie: qr, body: { code: AUTH } })).status).toBe(200);
        expect((await call("/key", { method: "PUT", cookie: qr, body: SENSITIVE[0][2] })).status).toBe(200);
        env.ACCOUNTS.db.prepare("UPDATE sessions SET fresh_until = 1").run(); // the few minutes are up
        expect((await call("/key", { method: "PUT", cookie: qr, body: SENSITIVE[0][2] })).status).toBe(403);
    });
    it("…or with its own passkey, and only one of this account's", async () => {
        const { qr, cred } = await qrDevice();
        await signUp("Bo", "cred-Bo");
        const ask = async id => {
            const o = await (await call("/confirm/options", { method: "POST", cookie: qr })).json();
            expect(o.options.allowCredentials.map(c => c.id)).toEqual([cred]); // only this account's passkeys are asked for
            return call("/confirm", {
                method: "POST",
                cookie: qr,
                body: { id: o.id, response: { id, challenge: o.options.challenge, origin: O } },
            });
        };
        expect((await ask("cred-Bo")).status).toBe(401); // someone else's passkey proves nothing here
        expect((await ask(cred)).status).toBe(200);
        expect((await call("/delete", { method: "POST", cookie: qr, body: { confirm: "DELETE" } })).status).toBe(200);
    });
    it("signing in with the passkey or the recovery code counts as confirming", async () => {
        const { owner } = await qrDevice(); // signed up just now: confirmed
        expect((await call("/key", { method: "PUT", cookie: owner, body: SENSITIVE[0][2] })).status).toBe(200);
        const r = await call("/recover", { method: "POST", body: { auth: "C".repeat(43) } });
        const rec = "__Host-ul_s=" + cookieOf(r);
        expect((await call("/passkey/options", { method: "POST", cookie: rec })).status).toBe(200); // a new passkey
    });
});

describe("Account & sync: it tidies up after itself", () => {
    it("clears accounts that never turned sync on after a day, so bots can't fill the limit", async () => {
        const idle = await signUp("Idle"),
            real = await signUp("Real");
        await setUp(real.cookie);
        env.ACCOUNTS.db.prepare("UPDATE users SET version = 1 WHERE name = 'Real'").run(); // it saved its library
        env.ACCOUNTS.db.prepare("UPDATE users SET created = 1").run(); // both made long ago
        await call("/register/options", { method: "POST", body: { name: "New" } });
        const names = env.ACCOUNTS.db
            .prepare("SELECT name FROM users")
            .all()
            .map(u => u.name);
        expect(names).toEqual(["Real"]);
        expect(env.ACCOUNTS.db.prepare("SELECT COUNT(*) AS n FROM credentials WHERE id = ?").get(idle.cred).n).toBe(0);
        expect((await call("/me", { cookie: idle.cookie })).status).toBe(401);
    });
    it("clears accounts that turned sync on but never saved a library, after a week", async () => {
        const ghost = await signUp("Ghost"),
            fresh = await signUp("Fresh");
        await setUp(ghost.cookie);
        await setUp(fresh.cookie);
        env.ACCOUNTS.db.prepare("UPDATE users SET created = ? WHERE name = 'Ghost'").run(Date.now() - 8 * 864e5);
        await call("/register/options", { method: "POST", body: { name: "New" } });
        const names = env.ACCOUNTS.db
            .prepare("SELECT name FROM users")
            .all()
            .map(u => u.name);
        expect(names).toEqual(["Fresh"]); // a new one gets its week
    });
    it("counts signed-in steps that write toward the day's allowance", async () => {
        const { cookie } = await signUp();
        await setUp(cookie);
        env.ACCOUNTS.db
            .prepare("UPDATE users SET day = ?, writes = ?")
            .run(Math.floor(Date.now() / 864e5), DAILY.writes);
        const LINK_BOX = { v: 1, kdf: "LINK-AES-GCM", iv: "FFFF", wrapped: "GGGG", kid: "K1" };
        expect((await call("/link/start", { method: "POST", cookie, body: { box: LINK_BOX } })).status).toBe(429);
        expect((await call("/confirm/options", { method: "POST", cookie })).status).toBe(429);
        expect((await call("/sessions/revoke", { method: "POST", cookie, body: { others: true } })).status).toBe(200); // never blocked
    });
    it("keeps the latest 200 entries of your own list", async () => {
        const { cookie, cred } = await signUp();
        for (let i = 0; i < 205; i++) await signIn(cred);
        expect(env.ACCOUNTS.db.prepare("SELECT COUNT(*) AS n FROM audit").get().n).toBe(200);
        expect((await (await call("/audit", { cookie })).json())[0].kind).toBe("signed in");
    });
});
