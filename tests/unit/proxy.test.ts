// The proxy: password, routes, and keys never leaking into answers.
import { describe, it, expect, vi, afterEach } from "vitest";
import site from "../../worker/index";
import { proxy } from "../../worker/proxy";
import proxyScript from "virtual:proxy-script";

// the proxy password, sent the only way it's accepted: in a header
const PW = { "X-Pass": "pw" };

const env: Env = { PASS: "pw", SGDB_KEY: "sgdb-secret", ASSETS: { fetch: async () => new Response("file") } };
afterEach(() => vi.restoreAllMocks());

describe("the site's Worker", () => {
    it("hands /api to the proxy and everything else to the files", async () => {
        expect(await (await site.fetch(new Request("https://u.dev/index.html"), env)).text()).toBe("file");
        expect((await site.fetch(new Request("https://u.dev/api/sgdb/x"), env)).status).toBe(401);
    });
});

describe("the site's Worker, hardened", () => {
    it("puts security headers on every /api answer", async () => {
        const r = await site.fetch(new Request("https://u.dev/api/status"), env);
        expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
        expect(r.headers.get("Strict-Transport-Security")).toContain("max-age=");
    });
    it("only answers GET, POST and OPTIONS", async () => {
        expect((await site.fetch(new Request("https://u.dev/api/status", { method: "DELETE" }), env)).status).toBe(405);
        expect(
            (await site.fetch(new Request("https://u.dev/api/status", { method: "PUT", body: "x" }), env)).status
        ).toBe(405);
    });
    it("slows down one address that asks too often", async () => {
        let n = 0;
        const RL = { limit: async () => ({ success: ++n <= 2 }) };
        const e2 = { ...env, API_RL: RL };
        expect((await site.fetch(new Request("https://u.dev/api/status", { headers: PW }), e2)).status).toBe(200);
        expect((await site.fetch(new Request("https://u.dev/api/status", { headers: PW }), e2)).status).toBe(200);
        const r = await site.fetch(new Request("https://u.dev/api/status", { headers: PW }), e2);
        expect(r.status).toBe(429);
        expect(r.headers.get("Retry-After")).toBe("60");
    });
    it("takes the password from a header too, so it needn't sit in addresses", async () => {
        expect(
            (await proxy(new Request("https://u.dev/api/status", { headers: { "X-Pass": "pw" } }), env, "/api")).status
        ).toBe(200);
    });
    it('never says more than "something went wrong" when it fails', async () => {
        const big = "x".repeat(20000);
        const r = await site.fetch(new Request("https://u.dev/api/hc", { method: "POST", body: big, headers: PW }), {
            ...env,
            HC_KEY: "k",
        });
        expect(r.status).toBe(502);
        expect(await r.text()).toBe("something went wrong");
    });
});

describe("the proxy, against path tricks", () => {
    // (the URL itself already folds "..", even written %2e%2e; this catches what is left: encoded slashes, dot-names, odd bytes)
    it("won't let a path climb out of the API it's for", async () => {
        for (const p of ["/api/sgdb/a%2F..%2Fadmin", "/api/tgdb/a%2Fb", "/api/cv/.hidden", "/api/sgdb/x%00y"])
            expect(
                (
                    await proxy(
                        new Request("https://u.dev" + p, { headers: PW }),
                        { ...env, TGDB_KEY: "t", CV_KEY: "c" },
                        "/api"
                    )
                ).status
            ).toBe(400);
    });
    it("fetches ScreenScraper pictures from ScreenScraper only, over https", async () => {
        const e = { ...env, SS_DEVID: "d", SS_DEVPASS: "p" };
        for (const u of ["https://evilscreenscraper.fr/x.png", "http://screenscraper.fr/x.png"])
            expect(
                (
                    await proxy(
                        new Request("https://u.dev/api/ssimg?u=" + encodeURIComponent(u), { headers: PW }),
                        e,
                        "/api"
                    )
                ).status
            ).toBe(400);
    });
});

describe("the proxy", () => {
    it("needs its password for your own keys, but not to say what it has", async () => {
        expect((await proxy(new Request("https://u.dev/api/sgdb/x"), env, "/api")).status).toBe(401);
        const r = await proxy(new Request("https://u.dev/api/status"), env, "/api");
        expect(await r.json()).toMatchObject({ sgdb: true, igdb: false });
    });
    it("says what's missing instead of failing", async () => {
        const r = await proxy(new Request("https://u.dev/cv/search", { headers: PW }), env, "");
        expect(r.status).toBe(501);
        expect(await r.json()).toMatchObject({ need: "CV_KEY" });
    });
    it("adds the key on the way out, and never sends the password on", async () => {
        const f = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response("{}", { headers: { "Content-Type": "application/json" } }));
        await proxy(new Request("https://u.dev/api/sgdb/search/autocomplete/zelda", { headers: PW }), env, "/api");
        const [url, init] = f.mock.calls[0];
        expect(String(url)).toBe("https://www.steamgriddb.com/api/v2/search/autocomplete/zelda?");
        expect(new Headers(init!.headers).get("Authorization")).toBe("Bearer sgdb-secret");
    });
});

// a fetched page, as if it ended up at "url" (after any redirects)
const at = (url: string, body: string, type: string) => {
    const r = new Response(body, { headers: { "Content-Type": type } });
    Object.defineProperty(r, "url", { value: url });
    return r;
};
describe("/page, for the Learning Centre", () => {
    const ask = (u: string) =>
        proxy(new Request("https://u.dev/api/page?u=" + encodeURIComponent(u), { headers: PW }), env, "/api");
    it("only reaches university and reading-list sites", async () => {
        const f = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async u => at(String(u), "<h1>Modules</h1>", "text/html"));
        for (const ok of [
            "https://www.imperial.ac.uk/a",
            "https://catalog.mit.edu/b",
            "https://ox.rl.talis.com/lists/x.html",
            "https://www.ethz.ch/c",
            "https://www.uni-heidelberg.de/d",
            "https://www.universiteitleiden.nl/e",
        ])
            expect((await ask(ok)).status, ok).toBe(200);
        for (const no of [
            "https://example.com/",
            "https://notauniversity-films.example/",
            "https://universityfilms.com/",
            "http://127.0.0.1/",
            "https://evil.dev/ac.uk",
            "file:///etc/passwd",
            "https://localhost/",
        ])
            expect((await ask(no)).status, no).toBe(403);
        expect(f).toHaveBeenCalledTimes(6);
    });
    it("refuses a redirect that leaves for another kind of site, before following it", async () => {
        const f = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://example.com/" } }));
        expect((await ask("https://www.ucl.ac.uk/go")).status).toBe(403);
        expect(f).toHaveBeenCalledTimes(1); // example.com itself was never asked
    });
    it("follows a redirect that stays on university sites, checking each hop", async () => {
        const f = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(null, { status: 301, headers: { Location: "/modules" } }))
            .mockResolvedValueOnce(at("https://www.ucl.ac.uk/modules", "<h1>Modules</h1>", "text/html"));
        expect((await ask("https://www.ucl.ac.uk/go")).status).toBe(200);
        expect(String(f.mock.calls[1][0])).toBe("https://www.ucl.ac.uk/modules");
    });
    it("gives up after five redirects", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async () => new Response(null, { status: 302, headers: { Location: "/again" } })
        );
        expect((await ask("https://www.ucl.ac.uk/loop")).status).toBe(508);
    });
    it("hands back pages only, not files", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(at("https://www.ucl.ac.uk/f.zip", "x", "application/zip"));
        expect((await ask("https://www.ucl.ac.uk/f.zip")).status).toBe(415);
    });
});

// ----- TMDB and IGDB, lent to the site's own pages -----
const shared = { ...env, TMDB_KEY: "tmdb-secret", CLIENT_ID: "cid", CLIENT_SECRET: "csec" };
const own = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    new Request("https://u.dev" + path, {
        ...init,
        headers: { "Sec-Fetch-Site": "same-origin", ...(init.headers || {}) },
    });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
describe("TMDB and IGDB, shared with the site's own pages", () => {
    it("says which it shares, and only inside the site", async () => {
        expect(await (await proxy(new Request("https://u.dev/api/status"), shared, "/api")).json()).toMatchObject({
            shared: ["tmdb", "igdb"],
        });
        expect(await (await proxy(new Request("https://u.dev/status"), shared, "")).json()).toMatchObject({
            shared: [],
        });
    });
    it("answers the site's own pages without a password", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ results: [] }));
        expect((await proxy(own("/api/tmdb/search/movie?query=dune"), shared, "/api")).status).toBe(200);
        const fromOrigin = new Request("https://u.dev/api/tmdb/search/movie?query=dune", {
            headers: { Origin: "https://u.dev" },
        });
        expect((await proxy(fromOrigin, shared, "/api")).status).toBe(200);
    });
    it("refuses other websites and bare requests, so nobody else can borrow the keys", async () => {
        const f = vi.spyOn(globalThis, "fetch");
        for (const headers of [{}, { "Sec-Fetch-Site": "cross-site" }, { Origin: "https://evil.example" }] as Record<
            string,
            string
        >[]) // cast: three kinds of headers, one list
            expect(
                (await proxy(new Request("https://u.dev/api/tmdb/search/movie?query=x", { headers }), shared, "/api"))
                    .status
            ).toBe(403);
        const igdb = new Request("https://u.dev/api/games", { method: "POST", body: "fields name;" });
        expect((await proxy(igdb, shared, "/api")).status).toBe(403);
        expect(f).not.toHaveBeenCalled();
    });
    it("lets you through from anywhere with the password", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}));
        expect(
            (await proxy(new Request("https://u.dev/api/tmdb/configuration", { headers: PW }), shared, "/api")).status
        ).toBe(200);
    });
    it("only makes the lookups the app makes", async () => {
        const f = vi.spyOn(globalThis, "fetch");
        for (const p of [
            "/api/tmdb/account/1",
            "/api/tmdb/movie/1/videos",
            "/api/tmdb/search/person",
            "/api/tmdb/movie/abc",
        ])
            expect((await proxy(own(p), shared, "/api")).status, p).toBe(400);
        expect(
            (await proxy(own("/api/igdb/companies", { method: "POST", body: "fields *;" }), shared, "/api")).status
        ).toBe(400);
        expect(
            (await proxy(own("/api/tmdb/configuration", { method: "POST", body: "x" }), shared, "/api")).status
        ).toBe(400);
        expect(f).not.toHaveBeenCalled();
    });
    it("adds the key itself, passes on only known settings, and never hands the key back", async () => {
        const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ results: [] }));
        const r = await proxy(
            own("/api/tmdb/search/movie?query=dune&api_key=mine&evil=1&include_adult=false"),
            shared,
            "/api"
        );
        const [url, init] = f.mock.calls[0];
        expect(String(url)).toBe(
            "https://api.themoviedb.org/3/search/movie?include_adult=false&query=dune&api_key=tmdb-secret"
        );
        expect(init!.headers).toEqual({});
        expect(JSON.stringify([...r.headers]) + (await r.text())).not.toContain("tmdb-secret");
        f.mockClear();
        await proxy(own("/api/tmdb/movie/1"), { ...shared, TMDB_KEY: "eyJlong" }, "/api");
        expect(f.mock.calls[0][1]!.headers).toEqual({ Authorization: "Bearer eyJlong" });
        expect(String(f.mock.calls[0][0])).not.toContain("api_key");
    });
    it("makes each lookup once for everyone, and limits new lookups per address", async () => {
        const store = new Map<string, Response>();
        globalThis.caches = {
            default: {
                match: async (k: RequestInfo | URL) => store.get(String(k))?.clone(),
                put: async (k: RequestInfo | URL, r: Response) => void store.set(String(k), r),
            },
        } as unknown as CacheStorage; // cast: Cloudflare's edge cache, only the two calls the proxy makes
        try {
            const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ id: 1 }));
            let n = 0;
            const RL = { limit: async () => ({ success: ++n <= 1 }) };
            const e = { ...shared, SHARED_RL: RL };
            expect((await proxy(own("/api/tmdb/movie/1"), e, "/api")).status).toBe(200);
            expect((await proxy(own("/api/tmdb/movie/1"), e, "/api")).status).toBe(200);
            expect(f).toHaveBeenCalledTimes(1);
            expect((await proxy(own("/api/tmdb/movie/2"), e, "/api")).status).toBe(429);
            expect(f).toHaveBeenCalledTimes(1);
        } finally {
            Reflect.deleteProperty(globalThis, "caches");
        }
    });
    it("asks IGDB with its own token, and the same question twice only once", async () => {
        const store = new Map<string, Response>();
        globalThis.caches = {
            default: {
                match: async (k: RequestInfo | URL) => store.get(String(k))?.clone(),
                put: async (k: RequestInfo | URL, r: Response) => void store.set(String(k), r),
            },
        } as unknown as CacheStorage; // cast: Cloudflare's edge cache, only the two calls the proxy makes
        try {
            const f = vi
                .spyOn(globalThis, "fetch")
                .mockImplementation(async u =>
                    String(u).startsWith("https://id.twitch.tv")
                        ? json({ access_token: "t", expires_in: 3600 })
                        : json([{ id: 1 }])
                );
            const ask = () =>
                proxy(own("/api/igdb/games", { method: "POST", body: "fields name; where id = 1;" }), shared, "/api");
            expect(await (await ask()).json()).toEqual([{ id: 1 }]);
            await ask();
            const igdbCalls = f.mock.calls.filter(([u]) => String(u).startsWith("https://api.igdb.com"));
            expect(igdbCalls).toHaveLength(1);
            expect(new Headers(igdbCalls[0][1]!.headers).get("Client-ID")).toBe("cid");
        } finally {
            Reflect.deleteProperty(globalThis, "caches");
        }
    });
});

describe("/page and /status", () => {
    it("/page needs no password from the site's own pages, and answers nobody else", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(at("https://www.ucl.ac.uk/a", "<h1>x</h1>", "text/html"));
        const u = "https://u.dev/api/page?u=" + encodeURIComponent("https://www.ucl.ac.uk/a");
        const fromSite = new Request(u, { headers: { "Sec-Fetch-Site": "same-origin" } });
        expect((await proxy(fromSite, env, "/api")).status).toBe(200);
        expect(
            (await proxy(new Request(u, { headers: { Origin: "https://other.example" } }), env, "/api")).status
        ).toBe(403);
    });
});

describe("the proxy, hardened for a public site", () => {
    it("inside the site, your own keys answer only with the password, even if you never set one", async () => {
        const noPass = { SGDB_KEY: "s" };
        expect(
            (
                await proxy(
                    new Request("https://u.dev/api/sgdb/x", { headers: { "Sec-Fetch-Site": "same-origin" } }),
                    noPass,
                    "/api"
                )
            ).status
        ).toBe(401);
    });
    it("counts one IPv6 connection as one asker, not millions", async () => {
        const { addressKey } = await import("../../worker/proxy");
        const at = (ip: string) => addressKey(new Request("https://u.dev/", { headers: { "CF-Connecting-IP": ip } }));
        expect(at("2001:db8:1:2:aaaa::1")).toBe(at("2001:db8:1:2:bbbb::9"));
        expect(at("2001:db8:1:3::1")).not.toBe(at("2001:db8:1:2::1"));
        // the same block written short and long, and with capitals
        expect(at("2001:db8::1")).toBe(at("2001:0db8:0000:0000:ffff::2"));
        expect(at("2001:DB8::1")).toBe(at("2001:db8:0:0:1:2:3:4"));
        expect(at("2001:db8::1")).not.toBe(at("2001:db8:0:1::1"));
        expect(at("203.0.113.7")).toBe("203.0.113.7");
    });
    it("caps new lookups for everyone together too", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({}));
        const e = {
            ...shared,
            SHARED_ALL: { limit: async ({ key }: { key: string }) => ({ success: key !== "tmdb" }) },
        };
        expect((await proxy(own("/api/tmdb/movie/9"), e, "/api")).status).toBe(429);
    });
    it("only lets through the exact settings the app sends to TMDB", async () => {
        const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({}));
        await proxy(
            own("/api/tmdb/movie/1?append_to_response=videos,credits&include_adult=maybe&language=xx"),
            shared,
            "/api"
        );
        expect(String(f.mock.calls[0][0])).toBe("https://api.themoviedb.org/3/movie/1?api_key=tmdb-secret");
    });
    it("gets IGDB a new token once if Twitch withdrew the old one", async () => {
        let first = true;
        const f = vi.spyOn(globalThis, "fetch").mockImplementation(async u => {
            if (String(u).startsWith("https://id.twitch.tv"))
                return json({ access_token: "t" + Math.random(), expires_in: 3600 });
            if (first) {
                first = false;
                return new Response("expired", { status: 401 });
            }
            return json([{ id: 2 }]);
        });
        const r = await proxy(
            own("/api/igdb/characters", { method: "POST", body: "fields name; where id = 2;" }),
            shared,
            "/api"
        );
        expect(await r.json()).toEqual([{ id: 2 }]);
        expect(
            f.mock.calls.filter(([u]) => String(u).startsWith("https://id.twitch.tv")).length
        ).toBeGreaterThanOrEqual(1);
    });
    it("refuses a body that says it's too big without reading it", async () => {
        const r = await site.fetch(
            own("/api/igdb/games", { method: "POST", body: "x", headers: { "Content-Length": "999999999" } }),
            shared
        );
        expect(r.status).toBe(502);
    });
    it("only reads from Hardcover, never changes your account", async () => {
        const f = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ data: {} }));
        const e = { ...env, HC_KEY: "k" };
        const ask = (q: string) =>
            proxy(
                new Request("https://u.dev/api/hc", {
                    method: "POST",
                    headers: { "X-Pass": "pw" },
                    body: JSON.stringify({ query: q }),
                }),
                e,
                "/api"
            );
        expect((await ask("mutation { delete_user_book(id: 1) { id } }")).status).toBe(400);
        expect((await ask("query { me { id } } mutation x { y }")).status).toBe(400);
        expect((await ask("query($q:String!){ search(query:$q){ results } }")).status).toBe(200);
        expect(f).toHaveBeenCalledTimes(1);
        // only the checked query and its values go on: nothing else from the request rides along
        await proxy(
            new Request("https://u.dev/api/hc", {
                method: "POST",
                headers: { "X-Pass": "pw" },
                body: '{"query":"query { me { id } }","variables":{"a":1},"operationName":"x","extensions":{"p":1}}',
            }),
            e,
            "/api"
        );
        const sent = f.mock.calls.at(-1);
        expect(sent && JSON.parse(String(sent[1]?.body))).toEqual({
            query: "query { me { id } }",
            variables: { a: 1 },
        });
    });
    it("hands back ScreenScraper pictures as signed links, never with your password or credentials", async () => {
        const e = { ...env, SS_DEVID: "dev", SS_DEVPASS: "devpw", SS_USER: "me", SS_PASS: "mypw" };
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async () =>
                new Response(
                    JSON.stringify({
                        url: "https://neoclone.screenscraper.fr/api2/mediaJeu.php?devid=dev&sspassword=mypw&media=box",
                    })
                )
        );
        const text = await (
            await proxy(new Request("https://u.dev/api/ss/jeuInfos.php", { headers: { "X-Pass": "pw" } }), e, "/api")
        ).text();
        expect(text).toContain("/api/ssimg?u=");
        expect(text).toContain("&sig=");
        for (const secret of ["pw", "mypw", "devpw"]) expect(text).not.toContain("=" + secret);
        const link = new URL(JSON.parse(text).url);
        vi.restoreAllMocks();
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async () => new Response("png", { headers: { "Content-Type": "image/png" } })
        );
        expect((await proxy(new Request(link), e, "/api")).status).toBe(200);
        const forged = new URL(link);
        forged.searchParams.set("u", "https://api.screenscraper.fr/api2/ssuserInfos.php");
        expect((await proxy(new Request(forged), e, "/api")).status).toBe(403);
    });
    it("hands pages back as plain text, so nothing fetched can show as a page of this site", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            at("https://www.ucl.ac.uk/a", "<form>log in</form>", "text/html")
        );
        const r = await proxy(
            new Request("https://u.dev/api/page?u=" + encodeURIComponent("https://www.ucl.ac.uk/a"), {
                headers: { "Sec-Fetch-Site": "same-origin" },
            }),
            env,
            "/api"
        );
        expect(r.headers.get("Content-Type")).toContain("text/plain");
        expect(r.headers.get("X-Page-Type")).toBe("text/html");
        const s = await site.fetch(new Request("https://u.dev/api/status"), env);
        expect(s.headers.get("Content-Security-Policy")).toContain("sandbox");
    });
    it("never lets a browser keep a failed answer", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("down", { status: 503 }));
        const r = await proxy(new Request("https://u.dev/api/sgdb/x", { headers: { "X-Pass": "pw" } }), env, "/api");
        expect(r.headers.get("Cache-Control")).toBe("no-store");
    });
});

describe("ScreenScraper with only a developer id", () => {
    it("never sends the word undefined as a password", async () => {
        const e = { ...env, SS_DEVID: "dev" };
        const asked: URL[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(async u => {
            asked.push(new URL(String(u)));
            return new Response("{}");
        });
        await proxy(new Request("https://u.dev/api/ss/jeuInfos.php", { headers: PW }), e, "/api");
        expect(asked).toHaveLength(1);
        for (const k of ["devpassword", "ssid", "sspassword"]) expect(asked[0].searchParams.get(k)).toBe("");
    });
});

describe("the proxy to copy (Settings › Data, sources & keys › Your proxy)", () => {
    it("is plain JavaScript that runs on its own as a whole Worker", async () => {
        expect(proxyScript).toContain("Its secrets, all optional");
        expect(proxyScript).not.toMatch(/\binterface\b|: Request\b|: ProxyEnv\b/);
        const worker = await import(`data:text/javascript,${encodeURIComponent(proxyScript)}`);
        const r = await worker.default.fetch(new Request("https://p.dev/status"), { SGDB_KEY: "k" });
        expect(await r.json()).toMatchObject({ sgdb: true, tmdb: false, shared: [] });
    });
});
