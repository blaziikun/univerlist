// worker/sync.js
// ─────────────────────────────────────────────────────────────────
//  Account & sync: passkey sign-in, and your library kept in the cloud, end-to-end encrypted
//
//  What the server knows: an account id you never see, the name you gave, your passkeys' public keys, when you signed
//  in, and a blob it cannot read. Your library is encrypted in your browser (AES-256-GCM) with a random sync key. That
//  key is stored here only sealed ("a box"), in up to two kinds of box, neither of which the server can open:
//    - a passkey box per passkey: sealed by a secret the passkey itself produces (WebAuthn PRF), so signing in unlocks
//    it
//    - a passphrase box (optional, the way back if every passkey is lost): sealed by your sync passphrase
//  The secrets that open them never leave the browser. Losing all of them means losing the cloud copy, never your own.
//
//  How it's kept safe (each point is tested in tests/unit/sync.test.js):
//    - sign-in is a passkey (WebAuthn): nothing to guess, steal or reuse; verified here with @simplewebauthn/server
//    - a session is a random 256-bit token in a __Host- cookie (HttpOnly, Secure, SameSite=Strict); only its hash is
//    stored
//    - every change needs the X-UL-Sync header and this site's Origin (no cross-site requests), and no CORS is offered
//    - nothing takes an account id from the request: every query uses the session's own (no reading someone else's
//    data)
//    - sign-in and sign-up are rate-limited per address; accounts, sizes and versions have limits; errors say little
//    - every sign-in, new passkey, revoke and deletion is in your audit list; deleting your account deletes everything
//
//  Bindings (wrangler.jsonc): ACCOUNTS (D1, schema in worker/migrations), LIBRARIES (R2), AUTH_RL (rate limit). Optional vars:
//  RP_ID and ORIGIN (default: the request's own), MAX_USERS (how many accounts this site takes; default 100, see
//  below).
// ─────────────────────────────────────────────────────────────────
// @ts-check

import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { addressKey, readBytesUpTo, readUpTo } from "./proxy.js";

export const LIMITS = {
    blob: 20 * 1024 * 1024,
    keybox: 2048,
    name: 40,
    sessionDays: 30,
    challengeMin: 5,
    keep: 3,
    passkeys: 10,
    linkMin: 10, // how long an "add a device" QR code works
    freshMin: 5, // how long "confirm it's you" lasts: the moments that change who can get in (see FRESH)
};
const RENEW_AFTER = 3600e3; // a session in use is extended (to sessionDays from now) at most once an hour

// What keeps this free to run, whatever anyone does. R2 (where the libraries are kept) is the only part that can bill:
// past 10 GB stored, 1 million writes or 10 million reads a month. So, unless you set them otherwise:
//   at most MAX_USERS accounts (default 100), each holding at most 4 versions of 20 MB      →  8 GB at the very most
//   each account saving at most 300 times a day and reading 1,000 times                   →  0.9M writes, 3M reads a month
// Real use is far below that (a library is usually well under 1 MB, and it's saved only when something changed).
// Workers and D1 never bill on the free plan: past their daily limits they refuse requests until midnight UTC.
const MAX_USERS = 100; // and accounts that never turned sync on (a day) or never saved a library (a week) are cleared
// (clearAbandoned), so bots can't fill it
export const DAILY = { writes: 300, reads: 1000 };
const COOKIE = "__Host-ul_s";
const now = () => Date.now();
const b64u = (/** @type {Uint8Array} */ u) =>
    btoa(String.fromCharCode(...u))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
const unb64u = (/** @type {string} */ s) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c =>
        c.charCodeAt(0)
    );
const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function sha(/** @type {string} */ s) {
    return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

const HDR = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (/** @type {any} */ o, s = 200, /** @type {Record<string,string>} */ h = {}) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...HDR, "Content-Type": "application/json", ...h } });
const no = (/** @type {number} */ s, /** @type {string} */ msg) => json({ error: msg }, s);

/** the real WebAuthn checks; tests swap in their own */
export const WEBAUTHN = {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
};

/**
 * One request under /api/sync.
 * @param {Request} req  @param {Record<string, any>} env  @param {string} path  the part after /api/sync
 * @param {typeof WEBAUTHN} [wa]
 */
export async function sync(req, env, path, wa = WEBAUTHN) {
    if (!env.ACCOUNTS || !env.LIBRARIES) return no(501, "sync isn't set up on this site");
    const me = await session(req, env),
        res = await route(req, env, path, wa, me);
    // a session in use was renewed: send its cookie again, unless this answer sets one itself (signing in or out)
    if (me && me.renewCookie && !res.headers.has("Set-Cookie")) res.headers.set("Set-Cookie", me.renewCookie);
    return res;
}

/**
 * @param {Request} req  @param {Record<string, any>} env  @param {string} path  @param {typeof WEBAUTHN} wa
 * @param {Record<string, any> | null} me  your session, if you're signed in
 */
async function route(req, env, path, wa, me) {
    const url = new URL(req.url),
        origin = env.ORIGIN || url.origin,
        rpID = env.RP_ID || url.hostname,
        ip = addressKey(req);
    // no cross-site requests: changes need our own header and our own origin (a form or another site can't send both)
    if (req.method !== "GET") {
        if (req.headers.get("X-UL-Sync") !== "1") return no(403, "no");
        if (req.headers.get("Origin") !== origin) return no(403, "no");
    }
    const limited = async (/** @type {string} */ k) =>
        env.AUTH_RL ? !(await env.AUTH_RL.limit({ key: k + ":" + ip })).success : false;
    // a request's JSON is small (names, keys locked to a passkey): past 64 KB it's refused while it's still arriving
    const body = async () => {
        if (Number(req.headers.get("Content-Length") || 0) > 64 * 1024) throw new Error("big");
        const t = await readUpTo(req.body, 64 * 1024);
        if (t === null) throw new Error("big");
        return t ? JSON.parse(t) : {};
    };
    const what = req.method + " " + path;
    try {
        switch (what) {
            // ── sign up: a name, then a passkey ──
            case "POST /register/options": {
                if (await limited("reg")) return no(429, "slow down");
                await clearAbandoned(env);
                const c = await env.ACCOUNTS.prepare("SELECT COUNT(*) AS n FROM users").first();
                if (c && c.n >= Number(env.MAX_USERS || MAX_USERS)) return no(503, "no new accounts right now");
                const { name = "" } = await body(),
                    nm = String(name).trim().slice(0, LIMITS.name) || "Me";
                const userId = rand(16),
                    opts = await wa.generateRegistrationOptions({
                        rpName: "UniverList",
                        rpID,
                        userName: nm,
                        userID: unb64u(userId),
                        userDisplayName: nm,
                        attestationType: "none",
                        authenticatorSelection: { residentKey: "required", userVerification: "required" },
                        supportedAlgorithmIDs: [-7, -257],
                    });
                const id = rand(16);
                await env.ACCOUNTS.prepare(
                    "INSERT INTO challenges (id, challenge, user_id, kind, name, expires) VALUES (?, ?, ?, 'reg', ?, ?)"
                )
                    .bind(id, opts.challenge, userId, nm, now() + LIMITS.challengeMin * 60e3)
                    .run();
                return json({ id, options: opts });
            }
            case "POST /register/verify": {
                if (await limited("reg")) return no(429, "slow down");
                const { id, response } = await body(),
                    ch = await takeChallenge(env, id, "reg");
                if (!ch) return no(400, "start again");
                const v = await wa.verifyRegistrationResponse({
                    response,
                    expectedChallenge: ch.challenge,
                    expectedOrigin: origin,
                    expectedRPID: rpID,
                    requireUserVerification: true,
                });
                if (!v.verified || !v.registrationInfo) return no(400, "that passkey didn't check out");
                const c = v.registrationInfo.credential,
                    t = now();
                // the cap is checked again here, in the insert itself: many sign-ups started at once can't all get past it
                const made = await env.ACCOUNTS.prepare(
                    "INSERT INTO users (id, name, created, version, size, updated) SELECT ?1, ?2, ?3, 0, 0, ?3 WHERE (SELECT COUNT(*) FROM users) < ?4"
                )
                    .bind(ch.user_id, ch.name, t, Number(env.MAX_USERS || MAX_USERS))
                    .run();
                if (!made.meta || made.meta.changes !== 1) return no(503, "no new accounts right now");
                await env.ACCOUNTS.batch([
                    env.ACCOUNTS.prepare(
                        "INSERT INTO credentials (id, user_id, public_key, counter, transports, created, last_used, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                    ).bind(
                        c.id,
                        ch.user_id,
                        b64u(c.publicKey),
                        c.counter || 0,
                        JSON.stringify(c.transports || []),
                        t,
                        t,
                        device(req)
                    ),
                ]);
                await audit(env, ch.user_id, "account created", device(req));
                return startSession(env, req, ch.user_id, { ok: true, name: ch.name }, true);
            }
            // ── sign in: any passkey this site knows ──
            case "POST /login/options": {
                if (await limited("login")) return no(429, "slow down");
                const opts = await wa.generateAuthenticationOptions({ rpID, userVerification: "required" }),
                    id = rand(16);
                await env.ACCOUNTS.prepare(
                    "INSERT INTO challenges (id, challenge, user_id, kind, name, expires) VALUES (?, ?, NULL, 'login', NULL, ?)"
                )
                    .bind(id, opts.challenge, now() + LIMITS.challengeMin * 60e3)
                    .run();
                return json({ id, options: opts });
            }
            case "POST /login/verify": {
                if (await limited("login")) return no(429, "slow down");
                const { id, response } = await body(),
                    ch = await takeChallenge(env, id, "login");
                if (!ch) return no(400, "start again");
                const cred =
                    response && typeof response.id === "string"
                        ? await env.ACCOUNTS.prepare("SELECT * FROM credentials WHERE id = ?").bind(response.id).first()
                        : null;
                if (!cred) return no(401, "that passkey isn't known here");
                const v = await wa.verifyAuthenticationResponse({
                    response,
                    expectedChallenge: ch.challenge,
                    expectedOrigin: origin,
                    expectedRPID: rpID,
                    requireUserVerification: true,
                    credential: {
                        id: cred.id,
                        publicKey: unb64u(cred.public_key),
                        counter: cred.counter,
                        transports: JSON.parse(cred.transports || "[]"),
                    },
                });
                if (!v.verified) return no(401, "that passkey didn't check out");
                await env.ACCOUNTS.prepare("UPDATE credentials SET counter = ?, last_used = ? WHERE id = ?")
                    .bind(v.authenticationInfo.newCounter, now(), cred.id)
                    .run();
                await audit(env, cred.user_id, "signed in", device(req));
                const u = await env.ACCOUNTS.prepare("SELECT name FROM users WHERE id = ?").bind(cred.user_id).first();
                // this passkey's box, if it has one: the browser opens it with the secret it just got from the passkey
                const box = cred.unlock_box ? JSON.parse(cred.unlock_box) : null;
                return startSession(
                    env,
                    req,
                    cred.user_id,
                    { ok: true, name: u ? u.name : "", passkey: cred.id, box },
                    true
                );
            }
            // ----- signing a device in with a QR code (or its link): no passkey needed, and none is made. The code was shown
            // on a device you're already signed in on, so scanning it is that device saying "let this one in" -----
            case "POST /link/join": {
                if (await limited("login")) return no(429, "slow down");
                const { token } = await body();
                if (typeof token !== "string" || token.length < 20)
                    return no(404, "that code has expired: make a new one");
                const h = await sha(token);
                // used once: two devices opening the same code, only the first gets in
                const use = await env.ACCOUNTS.prepare(
                    "UPDATE links SET used = 1 WHERE token_hash = ? AND used = 0 AND expires > ?"
                )
                    .bind(h, now())
                    .run();
                if (!use.meta || use.meta.changes !== 1) return no(404, "that code has expired: make a new one");
                const L = await env.ACCOUNTS.prepare("SELECT user_id, box FROM links WHERE token_hash = ?")
                        .bind(h)
                        .first(),
                    u = await env.ACCOUNTS.prepare("SELECT name FROM users WHERE id = ?").bind(L.user_id).first();
                if (!u) return no(404, "that code has expired: make a new one");
                await audit(env, L.user_id, "signed in with a QR code", device(req));
                return startSession(env, req, L.user_id, { ok: true, name: u.name, linkBox: JSON.parse(L.box) });
            }
            // ── signing in with the recovery code (lost your passkey): the browser sends a key made from the code ──
            case "POST /recover": {
                if (await limited("login")) return no(429, "slow down");
                const { auth } = await body();
                if (typeof auth !== "string" || auth.length < 40 || auth.length > 64)
                    return no(401, "that recovery code doesn't open an account here");
                const u = await env.ACCOUNTS.prepare("SELECT id, name FROM users WHERE recovery_auth = ?")
                    .bind(await sha(auth))
                    .first();
                if (!u) return no(401, "that recovery code doesn't open an account here");
                await audit(env, u.id, "signed in with the recovery code", device(req));
                return startSession(env, req, u.id, { ok: true, name: u.name }, true);
            }
        }
        // everything below needs you signed in, and only ever touches your own account
        if (!me) return no(401, "sign in first");
        const U = me.user_id;
        // the moments that change who can get in need "confirm it's you" (a passkey or the recovery code) in the last few
        // minutes, not only a session: so a device that got in some other way (a QR code someone else scanned, say) can't
        // delete the account, set its own recovery code, or swap in its own passkey
        const fresh = Number(me.fresh_until || 0) > now();
        const firstPasskey =
            what === "POST /passkey/options" &&
            !(await env.ACCOUNTS.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?").bind(U).first())?.n;
        if (FRESH.has(what) && !fresh && !firstPasskey) return no(403, "confirm it's you first");
        // signed-in steps that write to the database count toward the account's daily allowance too, so one account
        // (or someone holding its session) can't use up the database's free daily writes for everyone
        if (DAILY_STEPS.has(what) && !(await spend(env, U, "writes"))) return no(429, "that's enough for today");
        switch (what) {
            // ── confirm it's you: your passkey (options, then verify), or the key made from your recovery code ──
            case "POST /confirm/options": {
                if (await limited("login")) return no(429, "slow down");
                const ex = (
                    await env.ACCOUNTS.prepare("SELECT id, transports FROM credentials WHERE user_id = ?").bind(U).all()
                ).results;
                const opts = await wa.generateAuthenticationOptions({
                    rpID,
                    userVerification: "required",
                    allowCredentials: ex.map((/** @type {any} */ c) => ({
                        id: c.id,
                        transports: JSON.parse(c.transports || "[]"),
                    })),
                });
                const id = rand(16);
                await env.ACCOUNTS.prepare(
                    "INSERT INTO challenges (id, challenge, user_id, kind, name, expires) VALUES (?, ?, ?, 'confirm', NULL, ?)"
                )
                    .bind(id, opts.challenge, U, now() + LIMITS.challengeMin * 60e3)
                    .run();
                return json({ id, options: opts });
            }
            case "POST /confirm": {
                if (await limited("login")) return no(429, "slow down");
                const { id, response, code } = await body();
                let ok = false;
                if (typeof code === "string" && code) {
                    const u = await env.ACCOUNTS.prepare("SELECT recovery_auth FROM users WHERE id = ?")
                        .bind(U)
                        .first();
                    ok = !!(u && u.recovery_auth && u.recovery_auth === (await sha(code)));
                } else {
                    const ch = await takeChallenge(env, id, "confirm"),
                        cred =
                            ch && ch.user_id === U && response && typeof response.id === "string"
                                ? await env.ACCOUNTS.prepare("SELECT * FROM credentials WHERE id = ? AND user_id = ?")
                                      .bind(response.id, U)
                                      .first()
                                : null;
                    if (cred) {
                        const v = await wa.verifyAuthenticationResponse({
                            response,
                            expectedChallenge: ch.challenge,
                            expectedOrigin: origin,
                            expectedRPID: rpID,
                            requireUserVerification: true,
                            credential: {
                                id: cred.id,
                                publicKey: unb64u(cred.public_key),
                                counter: cred.counter,
                                transports: JSON.parse(cred.transports || "[]"),
                            },
                        });
                        if (v.verified) {
                            ok = true;
                            await env.ACCOUNTS.prepare("UPDATE credentials SET counter = ?, last_used = ? WHERE id = ?")
                                .bind(v.authenticationInfo.newCounter, now(), cred.id)
                                .run();
                        }
                    }
                }
                if (!ok) return no(401, "that didn't check out");
                await env.ACCOUNTS.prepare("UPDATE sessions SET fresh_until = ? WHERE token_hash = ?")
                    .bind(now() + LIMITS.freshMin * 60e3, me.token_hash)
                    .run();
                return json({ ok: true });
            }
            case "GET /me": {
                const u = await env.ACCOUNTS.prepare(
                    "SELECT name, created, version, size, updated, kid, keybox, recovery_auth IS NOT NULL AS recovery_signin FROM users WHERE id = ?"
                )
                    .bind(U)
                    .first();
                const creds = (
                    await env.ACCOUNTS.prepare(
                        "SELECT id, label, created, last_used, unlock_box FROM credentials WHERE user_id = ? ORDER BY created"
                    )
                        .bind(U)
                        .all()
                ).results;
                const sess = (
                    await env.ACCOUNTS.prepare(
                        "SELECT token_hash, label, created, last_seen FROM sessions WHERE user_id = ? AND expires > ? ORDER BY last_seen DESC"
                    )
                        .bind(U, now())
                        .all()
                ).results;
                const { keybox, ...rest } = u;
                return json({
                    ...rest,
                    rp_id: rpID, // what the browser asks passkeys for, when the page checks one itself
                    user_handle: U, // your account's passkey user id (not secret): lets the page tell password managers which passkeys still count
                    // sync is set up once there's at least one box to open the key with
                    has_key: keybox || creds.some((/** @type {any} */ c) => c.unlock_box) ? 1 : 0,
                    has_pass: keybox ? 1 : 0,
                    pass_box: keybox ? JSON.parse(keybox) : null, // sealed; only your passphrase opens it
                    passkeys: creds.map((/** @type {any} */ c) => ({
                        id: c.id,
                        label: c.label,
                        created: c.created,
                        used: c.last_used,
                        box: c.unlock_box ? JSON.parse(c.unlock_box) : null, // sealed; only that passkey's secret opens it
                    })),
                    sessions: sess.map((/** @type {any} */ s) => ({
                        id: s.token_hash.slice(0, 12),
                        label: s.label,
                        created: s.created,
                        seen: s.last_seen,
                        current: s.token_hash === me.token_hash,
                    })),
                });
            }
            case "POST /logout": {
                await env.ACCOUNTS.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(me.token_hash).run();
                return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
            }
            case "POST /sessions/revoke": {
                const { id, others } = await body();
                if (others)
                    await env.ACCOUNTS.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
                        .bind(U, me.token_hash)
                        .run();
                else if (typeof id === "string" && id.length >= 8)
                    await env.ACCOUNTS.prepare(
                        "DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, 12) = ?"
                    )
                        .bind(U, id.slice(0, 12))
                        .run();
                await audit(env, U, others ? "signed out everywhere else" : "signed a device out", device(req));
                return json({ ok: true });
            }
            case "GET /audit":
                return json(
                    (
                        await env.ACCOUNTS.prepare(
                            "SELECT at, kind, detail FROM audit WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT 200"
                        )
                            .bind(U)
                            .all()
                    ).results
                );
            // ── another passkey for another device ──
            case "POST /passkey/options": {
                const n = await env.ACCOUNTS.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?")
                    .bind(U)
                    .first();
                if (n && n.n >= LIMITS.passkeys) return no(400, "that's enough passkeys");
                const u = await env.ACCOUNTS.prepare("SELECT name FROM users WHERE id = ?").bind(U).first(),
                    ex = (await env.ACCOUNTS.prepare("SELECT id FROM credentials WHERE user_id = ?").bind(U).all())
                        .results;
                const opts = await wa.generateRegistrationOptions({
                    rpName: "UniverList",
                    rpID,
                    userName: u.name,
                    userID: unb64u(U),
                    userDisplayName: u.name,
                    attestationType: "none",
                    excludeCredentials: ex.map((/** @type {any} */ c) => ({ id: c.id })),
                    authenticatorSelection: { residentKey: "required", userVerification: "required" },
                    supportedAlgorithmIDs: [-7, -257],
                });
                const id = rand(16);
                await env.ACCOUNTS.prepare(
                    "INSERT INTO challenges (id, challenge, user_id, kind, name, expires) VALUES (?, ?, ?, 'add', NULL, ?)"
                )
                    .bind(id, opts.challenge, U, now() + LIMITS.challengeMin * 60e3)
                    .run();
                return json({ id, options: opts });
            }
            case "POST /passkey/verify": {
                const { id, response } = await body(),
                    ch = await takeChallenge(env, id, "add");
                if (!ch || ch.user_id !== U) return no(400, "start again");
                const v = await wa.verifyRegistrationResponse({
                    response,
                    expectedChallenge: ch.challenge,
                    expectedOrigin: origin,
                    expectedRPID: rpID,
                    requireUserVerification: true,
                });
                if (!v.verified || !v.registrationInfo) return no(400, "that passkey didn't check out");
                const c = v.registrationInfo.credential;
                await env.ACCOUNTS.prepare(
                    "INSERT INTO credentials (id, user_id, public_key, counter, transports, created, last_used, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                )
                    .bind(
                        c.id,
                        U,
                        b64u(c.publicKey),
                        c.counter || 0,
                        JSON.stringify(c.transports || []),
                        now(),
                        now(),
                        device(req)
                    )
                    .run();
                await audit(env, U, "passkey added", device(req));
                return json({ ok: true });
            }
            case "POST /passkey/remove": {
                const { id } = await body(),
                    n = await env.ACCOUNTS.prepare("SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?")
                        .bind(U)
                        .first();
                if (n && n.n <= 1) return no(400, "keep at least one passkey");
                // never remove the last way to open the sync key: that would lock the cloud copy for good. Checked inside the
                // delete itself, so removing two passkeys at once can't take both
                const r = await env.ACCOUNTS.prepare(
                    `DELETE FROM credentials WHERE user_id = ?1 AND id = ?2 AND (unlock_box IS NULL OR ${UNLOCKERS} > 1)`
                )
                    .bind(U, String(id))
                    .run();
                if (!r.meta || r.meta.changes !== 1)
                    return no(400, "this is the only thing that unlocks your library: add a recovery passphrase first");
                await audit(env, U, "passkey removed", "");
                return json({ ok: true });
            }
            case "POST /passkey/box": {
                // one of your passkeys can now unlock your library: the sync key, sealed by that passkey's own secret
                const { id, box } = await body();
                if (!isBox(box, "PRF-HKDF-SHA256")) return no(400, "not a key");
                const bad = await sameKey(env, U, box.kid);
                if (bad) return bad;
                const r = await env.ACCOUNTS.prepare(
                    "UPDATE credentials SET unlock_box = ? WHERE user_id = ? AND id = ?"
                )
                    .bind(JSON.stringify(box), U, String(id))
                    .run();
                if (!r.meta || r.meta.changes !== 1) return no(404, "no such passkey");
                await audit(env, U, "passkey unlocks your library", "");
                return json({ ok: true });
            }
            // ── a QR code to add another device: made here, finished on the new device (above) ──
            case "POST /link/start": {
                const { box } = await body();
                if (!isBox(box, "LINK-AES-GCM")) return no(400, "not a key");
                const bad = await sameKey(env, U, box.kid);
                if (bad) return bad;
                const token = rand(24);
                // one code at a time: making a new one ends any earlier one (and expired ones are cleared out)
                await env.ACCOUNTS.batch([
                    env.ACCOUNTS.prepare("DELETE FROM links WHERE user_id = ? OR expires < ?").bind(U, now()),
                    env.ACCOUNTS.prepare(
                        "INSERT INTO links (token_hash, user_id, box, expires) VALUES (?, ?, ?, ?)"
                    ).bind(await sha(token), U, JSON.stringify(box), now() + LIMITS.linkMin * 60e3),
                ]);
                return json({ token, expires: now() + LIMITS.linkMin * 60e3 });
            }
            case "GET /link/state": {
                // the device showing the code asks: has it been used yet?
                const L = await env.ACCOUNTS.prepare(
                    "SELECT used, expires FROM links WHERE user_id = ? ORDER BY expires DESC"
                )
                    .bind(U)
                    .first();
                return json({ used: !!(L && L.used), live: !!(L && !L.used && L.expires > now()) });
            }
            case "POST /link/cancel": {
                await env.ACCOUNTS.prepare("DELETE FROM links WHERE user_id = ?").bind(U).run();
                return json({ ok: true });
            }
            // ── turning sync on: the first boxes for a new sync key, all at once or not at all ──
            case "POST /setup": {
                const { kid, passkey, keybox, auth } = await body();
                if (auth !== undefined && !isAuth(auth)) return no(400, "not a key");
                if (typeof kid !== "string" || !kid || kid.length > 64) return no(400, "not a key");
                if (passkey && (typeof passkey.id !== "string" || !isBox(passkey.box, "PRF-HKDF-SHA256", kid)))
                    return no(400, "not a key");
                if (keybox && !isPassBox(keybox, kid)) return no(400, "not a key");
                if (!passkey && !keybox) return no(400, "nothing to unlock it with");
                if (passkey) {
                    const c = await env.ACCOUNTS.prepare("SELECT id FROM credentials WHERE user_id = ? AND id = ?")
                        .bind(U, passkey.id)
                        .first();
                    if (!c) return no(404, "no such passkey");
                }
                // only while nothing unlocks this account yet: if another device set it up a moment ago, this one loses
                const claim = await env.ACCOUNTS.prepare(
                    `UPDATE users SET kid = ?2, keybox = ?3, recovery_auth = ?4 WHERE id = ?1 AND kid IS NULL AND ${UNLOCKERS} = 0`
                )
                    .bind(U, kid, keybox ? JSON.stringify(keybox) : null, auth ? await sha(auth) : null)
                    .run();
                if (!claim.meta || claim.meta.changes !== 1)
                    return no(409, "sync was already set up, from another device");
                if (passkey)
                    await env.ACCOUNTS.prepare("UPDATE credentials SET unlock_box = ? WHERE user_id = ? AND id = ?")
                        .bind(JSON.stringify(passkey.box), U, passkey.id)
                        .run();
                await audit(env, U, "sync set up", "");
                return json({ ok: true });
            }
            // ── the encrypted library ──
            case "PUT /key": {
                // the wrapped key: salt, iv and the data key sealed by your passphrase; useless without it
                const { keybox, auth } = await body();
                if (!isPassBox(keybox) || (auth !== undefined && !isAuth(auth))) return no(400, "not a key");
                const bad = await sameKey(env, U, keybox.kid);
                if (bad) return bad;
                const u = await env.ACCOUNTS.prepare("SELECT keybox FROM users WHERE id = ?").bind(U).first();
                // changing the passphrase re-seals the same key: allowed only while you're signed in, and it's in the audit list
                // a new code replaces the old one entirely: its sign-in key too (cleared if this browser didn't send one)
                await env.ACCOUNTS.prepare("UPDATE users SET keybox = ?, recovery_auth = ? WHERE id = ?")
                    .bind(JSON.stringify(keybox), auth ? await sha(auth) : null, U)
                    .run();
                await audit(env, U, u && u.keybox ? "passphrase changed" : "recovery passphrase set", "");
                return json({ ok: true });
            }
            case "GET /data": {
                const u = await env.ACCOUNTS.prepare("SELECT version, size, keybox, blobs FROM users WHERE id = ?")
                    .bind(U)
                    .first();
                if (!u || !u.version) return json({ version: 0, keybox: u && u.keybox ? JSON.parse(u.keybox) : null });
                if (!(await spend(env, U, "reads"))) return no(429, "that's enough for today");
                const o = await env.LIBRARIES.get(stored(U, u)[0].key);
                if (!o) return no(404, "nothing stored");
                return new Response(o.body, {
                    headers: {
                        ...HDR,
                        "Content-Type": "application/octet-stream",
                        "X-Version": String(u.version),
                        "X-Keybox": encodeURIComponent(u.keybox || ""),
                    },
                });
            }
            case "PUT /data": {
                const im = req.headers.get("If-Match"),
                    want = im == null || im === "" ? NaN : Number(im),
                    len = Number(req.headers.get("Content-Length") || 0);
                if (!Number.isInteger(want) || want < 0) return no(428, "say which version you're replacing");
                if (len > LIMITS.blob) return no(413, "too big");
                // refused while it's still arriving, whether or not it said its size
                const buf = await readBytesUpTo(req.body, LIMITS.blob);
                if (buf === null) return no(413, "too big");
                if (buf.byteLength < 28) return no(400, "not encrypted data");
                const u = await env.ACCOUNTS.prepare("SELECT version, size, blobs FROM users WHERE id = ?")
                    .bind(U)
                    .first();
                if (!u || !(await unlockers(env, U))) return no(409, "set up sync first");
                if (u.version !== want) return json({ error: "changed elsewhere", version: u.version }, 409);
                if (!(await spend(env, U, "writes"))) return no(429, "that's enough saving for today");
                // a file of its own (two devices saving at once never write the same one), then compare-and-set: only one
                // device's save becomes the next version, and the other's file is deleted
                const next = want + 1,
                    t = now(),
                    key = `u/${U}/${next}-${rand(6)}`;
                await env.LIBRARIES.put(key, buf);
                // the last few versions, so a bad sync can be undone, and the newest one from more than a day ago, so a
                // burst of bad saves (a broken device, or someone with your session) can't push every good copy out
                const before = stored(U, u),
                    all = [{ v: next, key, size: buf.byteLength, at: t }, ...before],
                    recent = all.slice(0, LIMITS.keep),
                    dayOld = all.find(b => !b.at || t - b.at > 864e5),
                    keep = dayOld && !recent.includes(dayOld) ? [...recent, dayOld] : recent;
                let r;
                try {
                    r = await env.ACCOUNTS.prepare(
                        "UPDATE users SET version = ?, size = ?, updated = ?, blobs = ? WHERE id = ? AND version = ?"
                    )
                        .bind(next, buf.byteLength, t, JSON.stringify(keep), U, want)
                        .run();
                } catch (e) {
                    await env.LIBRARIES.delete(key).catch(() => {}); // never a file the account doesn't know about
                    throw e;
                }
                if (!r.meta || r.meta.changes !== 1) {
                    await env.LIBRARIES.delete(key).catch(() => {});
                    return json({ error: "changed elsewhere" }, 409);
                }
                for (const b of before) if (!keep.includes(b)) await env.LIBRARIES.delete(b.key).catch(() => {});
                return json({ ok: true, version: next });
            }
            case "GET /versions": {
                const u = await env.ACCOUNTS.prepare("SELECT version, size, blobs FROM users WHERE id = ?")
                        .bind(U)
                        .first(),
                    out = [];
                for (const b of stored(U, u)) {
                    if (b.at) out.push({ version: b.v, size: b.size, at: new Date(b.at) });
                    else {
                        // an older account's file: ask R2 when it was saved (and count that read)
                        if (!(await spend(env, U, "reads"))) return no(429, "that's enough for today");
                        const h = await env.LIBRARIES.head(b.key);
                        if (h) out.push({ version: b.v, size: h.size, at: h.uploaded });
                    }
                }
                return json(out);
            }
            case "GET /data/version": {
                const v = Number(url.searchParams.get("v")),
                    u = await env.ACCOUNTS.prepare("SELECT version, size, blobs FROM users WHERE id = ?")
                        .bind(U)
                        .first(),
                    b = stored(U, u).find(x => x.v === v);
                if (!b) return no(404, "no such version");
                if (!(await spend(env, U, "reads"))) return no(429, "that's enough for today");
                const o = await env.LIBRARIES.get(b.key);
                if (!o) return no(404, "no such version");
                return new Response(o.body, {
                    headers: { ...HDR, "Content-Type": "application/octet-stream", "X-Version": String(v) },
                });
            }
            // ── leave: everything goes ──
            case "POST /delete": {
                const { confirm } = await body();
                if (confirm !== "DELETE") return no(400, "type DELETE to confirm");
                const u = await env.ACCOUNTS.prepare("SELECT version, size, blobs FROM users WHERE id = ?")
                    .bind(U)
                    .first();
                for (const b of stored(U, u)) await env.LIBRARIES.delete(b.key).catch(() => {});
                await env.ACCOUNTS.batch(
                    ["sessions", "credentials", "audit", "challenges", "links"]
                        .map(t => env.ACCOUNTS.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(U))
                        .concat([env.ACCOUNTS.prepare("DELETE FROM users WHERE id = ?").bind(U)])
                );
                return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
            }
        }
        return no(404, "no such thing");
    } catch {
        return no(400, "something went wrong");
    }
}

// ── the sealed key ("a box") ──
/** a box is small, of a kind we know, and holds only strings: it's stored as given and handed back the same way.
 * Its kid says which sync key it seals (older boxes have none); with `kid`, it must be that one
 * @param {any} box  @param {string} kdf  @param {string} [kid] */
function isBox(box, kdf, kid) {
    if (!box || typeof box !== "object" || box.v !== 1 || box.kdf !== kdf) return false;
    if (typeof box.iv !== "string" || typeof box.wrapped !== "string") return false;
    if (box.kid !== undefined && typeof box.kid !== "string") return false;
    if (kid !== undefined && box.kid !== kid) return false;
    return JSON.stringify(box).length <= LIMITS.keybox;
}
/** the sign-in key made from a recovery code: 32 bytes, base64url @param {any} a */
const isAuth = a => typeof a === "string" && /^[A-Za-z0-9_-]{43}$/.test(a);
/** @param {any} box  @param {string} [kid] */
const isPassBox = (box, kid) =>
    isBox(box, "PBKDF2-SHA256", kid) &&
    typeof box.salt === "string" &&
    Number.isInteger(box.iter) &&
    box.iter >= 100_000 &&
    box.iter <= 10_000_000;
/** the SQL for how many boxes can open account ?1's sync key (passkeys that unlock, plus the passphrase) */
const UNLOCKERS =
    "((SELECT COUNT(*) FROM credentials WHERE user_id = ?1 AND unlock_box IS NOT NULL) + (SELECT COUNT(*) FROM users WHERE id = ?1 AND keybox IS NOT NULL))";
/** @param {Record<string, any>} env  @param {string} U */
async function unlockers(env, U) {
    const r = await env.ACCOUNTS.prepare(`SELECT ${UNLOCKERS} AS n`).bind(U).first();
    return r ? r.n : 0;
}
/** a new box must seal the account's one sync key: refused before sync is set up (that's /setup's job) and for any
 * other key. An older account learns its key's id from its first box that carries one
 * @param {Record<string, any>} env  @param {string} U  @param {string | undefined} kid  @returns {Promise<Response | null>} */
async function sameKey(env, U, kid) {
    if (!(await unlockers(env, U))) return no(409, "set up sync first");
    if (typeof kid !== "string" || !kid) return no(400, "not a key");
    const r = await env.ACCOUNTS.prepare("UPDATE users SET kid = ?2 WHERE id = ?1 AND (kid IS NULL OR kid = ?2)")
        .bind(U, kid)
        .run();
    return r.meta && r.meta.changes === 1 ? null : no(409, "that's not this account's sync key");
}
/** the versions kept for an account, newest first, and the R2 file each is in
 * @param {string} U  @param {any} u  its row (version, size, blobs) @returns {{ v: number, key: string, size: number, at: number | null }[]} */
function stored(U, u) {
    if (!u || !u.version) return [];
    if (u.blobs) return JSON.parse(u.blobs);
    // an account from before: its files are named by version alone, and when each was saved is only in R2
    const out = [];
    for (let v = u.version; v > 0 && v > u.version - LIMITS.keep; v--)
        out.push({ v, key: `u/${U}/${v}`, size: v === u.version ? u.size : 0, at: null });
    return out;
}

// ── today's R2 use, per account (see DAILY at the top) ──
/** count n R2 operations against today's allowance; false (and nothing counted) once it's used up
 * @param {Record<string, any>} env  @param {string} U  @param {"reads" | "writes"} kind  @param {number} [n] */
async function spend(env, U, kind, n = 1) {
    const today = Math.floor(now() / 864e5);
    // one statement, so two devices at once can't both squeeze past the limit. In SQLite, everything on the right of
    // SET sees the row as it was, so `day = ?2` and the CASEs (a new day starts from 0) don't trip over each other.
    const r = await env.ACCOUNTS.prepare(
        `UPDATE users SET day = ?2,
       reads = (CASE WHEN day = ?2 THEN reads ELSE 0 END) + ?3,
       writes = (CASE WHEN day = ?2 THEN writes ELSE 0 END) + ?4
     WHERE id = ?1 AND (CASE WHEN day = ?2 THEN ${kind} ELSE 0 END) + ?5 <= ?6`
    )
        .bind(U, today, kind === "reads" ? n : 0, kind === "writes" ? n : 0, n, DAILY[kind])
        .run();
    return !!r.meta && r.meta.changes === 1;
}

// ── sessions ──
// A session lasts sessionDays from when you last used it, like staying signed in anywhere else: in use, it's renewed
// (at most hourly), and the cookie with it; unused for that long, it ends.
/** @param {Request} req  @param {Record<string, any>} env */
export async function session(req, env) {
    const m = /(?:^|;\s*)__Host-ul_s=([A-Za-z0-9_-]{40,})/.exec(req.headers.get("Cookie") || "");
    if (!m) return null;
    const h = await sha(m[1]),
        s = await env.ACCOUNTS.prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires > ?")
            .bind(h, now())
            .first();
    if (!s) return null;
    if (now() - s.last_seen > RENEW_AFTER) {
        await env.ACCOUNTS.prepare("UPDATE sessions SET last_seen = ?, expires = ? WHERE token_hash = ?")
            .bind(now(), now() + LIMITS.sessionDays * 864e5, h)
            .run();
        s.renewCookie = sessionCookie(m[1]);
    }
    return s;
}
// the routes that change who can get into an account: they need "confirm it's you" (see the top of the signed-in routes)
const FRESH = new Set(["PUT /key", "POST /delete", "POST /passkey/remove", "POST /passkey/options", "POST /passkey/box"]);
// signed-in steps that write but aren't a sync (those count already): see the top of the signed-in routes
const DAILY_STEPS = new Set([
    "POST /link/start",
    "POST /passkey/options",
    "POST /confirm/options",
    "POST /passkey/box",
]);
/** a new session. `confirmed`: you signed in with your passkey or recovery code just now, so it starts confirmed
 * @param {Record<string, any>} env  @param {Request} req  @param {string} userId  @param {any} out  @param {boolean} [confirmed] */
async function startSession(env, req, userId, out, confirmed = false) {
    const token = rand(32),
        t = now(),
        exp = t + LIMITS.sessionDays * 864e5;
    await env.ACCOUNTS.prepare(
        "INSERT INTO sessions (token_hash, user_id, created, expires, last_seen, label, fresh_until) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
        .bind(await sha(token), userId, t, exp, t, device(req), confirmed ? t + LIMITS.freshMin * 60e3 : 0)
        .run();
    await env.ACCOUNTS.prepare("DELETE FROM sessions WHERE expires < ?").bind(t).run();
    return json(out, 200, { "Set-Cookie": sessionCookie(token) });
}
const sessionCookie = (/** @type {string} */ token) =>
    `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${LIMITS.sessionDays * 86400}`;
const clearCookie = () => `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
/** a challenge is used once, and only before it expires @param {Record<string, any>} env  @param {any} id  @param {string} kind */
async function takeChallenge(env, id, kind) {
    if (typeof id !== "string") return null;
    const c = await env.ACCOUNTS.prepare("SELECT * FROM challenges WHERE id = ? AND kind = ?").bind(id, kind).first();
    await env.ACCOUNTS.prepare("DELETE FROM challenges WHERE id = ? OR expires < ?").bind(id, now()).run();
    return c && c.expires > now() ? c : null;
}
// "Chrome on Mac": enough to recognise your own devices in the list, nothing more
const device = (/** @type {Request} */ req) => {
    const a = req.headers.get("User-Agent") || "";
    const b = /Edg\//.test(a)
        ? "Edge"
        : /Firefox\//.test(a)
          ? "Firefox"
          : /Chrome\//.test(a)
            ? "Chrome"
            : /Safari\//.test(a)
              ? "Safari"
              : "A browser";
    const o = /iPhone|iPad/.test(a)
        ? "iPhone or iPad"
        : /Android/.test(a)
          ? "Android"
          : /Mac OS X/.test(a)
            ? "Mac"
            : /Windows/.test(a)
              ? "Windows"
              : /Linux/.test(a)
                ? "Linux"
                : "";
    return o ? `${b} on ${o}` : b;
};
/** add to your own list of what happened; it keeps the latest AUDIT_KEEP, so it can't grow forever
 * @param {Record<string, any>} env  @param {string} userId  @param {string} kind  @param {string} detail */
async function audit(env, userId, kind, detail) {
    await env.ACCOUNTS.batch([
        env.ACCOUNTS.prepare("INSERT INTO audit (user_id, at, kind, detail) VALUES (?, ?, ?, ?)").bind(
            userId,
            now(),
            kind,
            detail
        ),
        env.ACCOUNTS.prepare(
            "DELETE FROM audit WHERE user_id = ?1 AND id NOT IN (SELECT id FROM audit WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2)"
        ).bind(userId, AUDIT_KEEP),
    ]);
}
const AUDIT_KEEP = 200;
/** accounts that hold nothing are cleared out, so bots signing up can't fill the account limit for real people: made
 * more than a day ago and sync never turned on, or a week ago and no library ever saved (turning sync on saves one
 * straight away, even an empty library, so a real account always has one) @param {Record<string, any>} env */
async function clearAbandoned(env) {
    const empty =
        "SELECT id FROM users WHERE (kid IS NULL AND keybox IS NULL AND COALESCE(version, 0) = 0 AND created < ?1) OR (COALESCE(version, 0) = 0 AND created < ?2)";
    const day = now() - 864e5,
        week = now() - 7 * 864e5;
    await env.ACCOUNTS.batch(
        ["credentials", "sessions", "audit", "challenges", "links"]
            .map(t => env.ACCOUNTS.prepare(`DELETE FROM ${t} WHERE user_id IN (${empty})`).bind(day, week))
            .concat([env.ACCOUNTS.prepare(`DELETE FROM users WHERE id IN (${empty})`).bind(day, week)])
    );
}
