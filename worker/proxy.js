// worker/proxy.js
// ─────────────────────────────────────────────────────────────────
//  The catalogue proxy: asks the catalogues whose keys must stay secret
//
//  Runs inside the site's own Worker under /api (worker/index.js), or on its own: paste this file into a new
//  Cloudflare Worker (the app shows it under Settings › Data, sources & keys › Your proxy).
//
//  Its secrets, all optional:
//    TMDB_KEY                  TMDB (themoviedb.org → Settings → API): the short key or the long read access token
//    CLIENT_ID, CLIENT_SECRET  IGDB, from dev.twitch.tv
//    SGDB_KEY                  SteamGridDB (steamgriddb.com → Preferences → API)
//    TGDB_KEY                  TheGamesDB (forums.thegamesdb.net → request a public API key)
//    CV_KEY                    Comic Vine (comicvine.gamespot.com/api)
//    HC_KEY                    Hardcover (hardcover.app → Settings → API)
//    SS_DEVID, SS_DEVPASS      ScreenScraper developer access (screenscraper.fr forum)
//    SS_USER, SS_PASS          your ScreenScraper account
//    PASS                      a password for your own keys; the app sends it in an X-Pass header
//
//  Inside the site, TMDB and IGDB are lent to every visitor, so nobody needs keys of their own. Those two refuse other
//  websites (a script can still pretend to be the site, so the limits below are what really protect them), make only
//  the lookups the app makes, keep each answer for a day so a lookup is made once for everyone, and cap new lookups per
//  address and in total (SHARED_RL, SHARED_ALL in wrangler.jsonc). Every other key is yours alone: inside the site it
//  answers only with PASS. Keys never leave this Worker.
//
//  Needs no key: /status (which sources are set up) and /page (a university or reading-list page, for the Learning
//  Centre; handed back as plain text, so nothing fetched can ever run or display as a page of this site).
// ─────────────────────────────────────────────────────────────────
// @ts-check

// ═══════════════════════════════════════════
//  WHAT IT ANSWERS
// ═══════════════════════════════════════════

const OPEN = ["page", "status"];
const LENT = ["tmdb", "igdb"];
const OWN = ["sgdb", "tgdb", "cv", "hc", "ss"];
// only the lookups the app makes, with only the settings it sends
const TMDB_PATHS = /^(configuration|search\/(movie|tv)|(movie|tv)\/\d+(\/images)?)$/;
/** @type {Record<string, (v: string) => boolean>} */
const TMDB_PARAMS = {
    query: v => v.length <= 200,
    include_adult: v => v === "true" || v === "false",
    append_to_response: v =>
        v === "external_ids,credits,recommendations" || v === "external_ids,aggregate_credits,recommendations",
    include_image_language: v => v === "en,null",
};
const IGDB_ENDPOINTS = ["games", "game_time_to_beats", "characters"];
const SS_CRED = ["devid", "devpassword", "softname", "ssid", "sspassword"];
const DAY = 86400;
// a request's body: a query to IGDB or Hardcover is a few hundred bytes
const MAX_BODY = 16384;
const MAX_PAGE = 6e6;

// university and reading-list sites: .ac.xx and .edu addresses, reading-list services, and universities whose address
// says so or that are well known without it. Anything else is refused, after redirects too.
const PAGE_HOSTS = [
    /(^|\.)ac\.[a-z]{2}$/,
    /(^|\.)edu(\.[a-z]{2})?$/,
    /(^|\.)(rl\.talis\.com|talisaspire\.com|leganto\.exlibrisgroup\.com|exlibrisgroup\.com)$/,
    /(^|\.)(uni|tu|th|hs|fh)-[a-z0-9-]+\.(de|at|ch)$/,
    // a name that starts with "universi" (university, universität, universiteit, universidad…) under a country's ending
    /(^|\.)universi[a-z0-9-]*\.([a-z]{2}|(edu|ac)\.[a-z]{2})$/,
    /(^|\.)univ-[a-z0-9-]+\.fr$/,
    /(^|\.)(ethz\.ch|epfl\.ch|uzh\.ch|unibas\.ch|tudelft\.nl|tue\.nl|uva\.nl|vu\.nl|leidenuniv\.nl|uu\.nl|rug\.nl|ru\.nl|tum\.de|lmu\.de|kit\.edu|rwth-aachen\.de|kth\.se|chalmers\.se|lu\.se|uu\.se|su\.se|ku\.dk|dtu\.dk|aau\.dk|au\.dk|helsinki\.fi|aalto\.fi|uio\.no|ntnu\.no|kuleuven\.be|ugent\.be|polimi\.it|unibo\.it|unimi\.it|sorbonne-universite\.fr|polytechnique\.fr|ens\.fr|psl\.eu|utoronto\.ca|ubc\.ca|mcgill\.ca|uwaterloo\.ca|ualberta\.ca|queensu\.ca|nus\.edu\.sg|ntu\.edu\.sg|hku\.hk|tcd\.ie|ucd\.ie|ucc\.ie)$/,
];
// who's asking, for the limits: one address, or for IPv6 one connection's whole block (a home or a server gets a
// /64, so counting each address in it separately would let one person look like millions)
/** @param {Request} req */
export function addressKey(req) {
    const ip = (req.headers.get("CF-Connecting-IP") || "unknown").toLowerCase();
    if (!ip.includes(":")) return ip;
    // written out in full first: "2001:db8::1" and "2001:db8:0:0::2" are the same block
    const [head, tail] = ip.split("::"),
        left = head ? head.split(":") : [],
        right = tail ? tail.split(":") : [],
        full = ip.includes("::")
            ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
            : left;
    return `${full
        .slice(0, 4)
        .map(h => (Number.parseInt(h, 16) || 0).toString(16))
        .join(":")}::/64`;
}
/**
 * Whether two secrets match, taking the same time wherever they differ (so timing the answers can't reveal one a
 * character at a time): both are hashed to the same length, then every byte is compared.
 * @param {string} a  @param {string} b
 */
async function same(a, b) {
    const enc = new TextEncoder(),
        [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest("SHA-256", enc.encode(String(s))))),
        u = new Uint8Array(x),
        v = new Uint8Array(y);
    let diff = 0;
    for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
    return diff === 0;
}
/** @param {string} host */
export const pageAllowed = host =>
    !/^[\d.]+$|^\[|^localhost$/i.test(host) && PAGE_HOSTS.some(r => r.test(host.toLowerCase()));

// ═══════════════════════════════════════════
//  ANSWERS
// ═══════════════════════════════════════════

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Pass",
    "Access-Control-Expose-Headers": "X-Page-Type",
    "Access-Control-Max-Age": String(DAY),
};
/** @param {number} status  @param {string} text  @param {Record<string, string>} [extra] */
const say = (status, text, extra = {}) => new Response(text, { status, headers: { ...cors, ...extra } });
/** @param {Response} r  @param {Record<string, string>} extra */
const withHeaders = (r, extra) => {
    for (const [k, v] of Object.entries(extra)) r.headers.set(k, v);
    return r;
};
/** @param {number} status  @param {object} body */
const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
/** @param {string} key */
const need = key => json(501, { error: "not set up", need: key });
// a catalogue's answer, passed on; only a good one may be kept by the browser
/** @param {Response} r  @param {string} [type] */
const pass = (r, type) =>
    new Response(r.body, {
        status: r.status,
        headers: {
            ...cors,
            "Content-Type": type || r.headers.get("Content-Type") || "application/json",
            "Cache-Control": r.ok ? `public, max-age=${DAY}` : "no-store",
        },
    });

// a body read only up to its limit, so a huge or endlessly unpacking one can't exhaust the Worker
/** @param {ReadableStream | null} stream  @param {number} max  @returns {Promise<string | null>} null when too big */
export async function readUpTo(stream, max) {
    const bytes = await readBytesUpTo(stream, max);
    return bytes === null ? null : new TextDecoder().decode(bytes);
}
/**
 * The same, as bytes.
 * @param {ReadableStream<Uint8Array> | null} stream  @param {number} max
 */
export async function readBytesUpTo(stream, max) {
    if (!stream) return new Uint8Array(0);
    const reader = stream.getReader(),
        chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
        all.set(c, at);
        at += c.byteLength;
    }
    return all;
}
/** @param {Request} req */
async function smallBody(req) {
    if (Number(req.headers.get("Content-Length") || 0) > MAX_BODY) throw new Error("too big");
    const text = await readUpTo(req.body, MAX_BODY);
    if (text === null) throw new Error("too big");
    return text;
}

/** @param {string} text */
const sha256 = async text =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
/** @param {string} secret  @param {string} text */
async function sign(secret, text) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
    return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ═══════════════════════════════════════════
//  LENT LOOKUPS: ONE ANSWER FOR EVERYONE
// ═══════════════════════════════════════════

/**
 * A lookup already made in the last day comes from Cloudflare's cache. A new one first counts against the asker's
 * address, then against everyone's (IGDB allows only a few requests a second for the whole site).
 * @param {string} cacheKey               a GET address, even for IGDB's POSTs
 * @param {string} service                "tmdb" or "igdb"
 * @param {Request} req
 * @param {Record<string, any>} env
 * @param {() => Promise<Response>} lookUp
 */
async function once(cacheKey, service, req, env, lookUp) {
    const cache = typeof caches === "undefined" ? null : /** @type {any} */ (caches).default;
    const hit = cache && (await cache.match(cacheKey));
    if (hit) return hit;
    for (const [limit, key] of [
        [env.SHARED_RL, addressKey(req)],
        [env.SHARED_ALL, service],
    ])
        if (limit && !(await limit.limit({ key })).success) return say(429, "slow down", { "Retry-After": "60" });
    const r = await lookUp();
    const answer = pass(r, "application/json");
    if (cache && r.ok) await cache.put(cacheKey, answer.clone());
    return answer;
}

/** @type {{ value: string, expires: number } | null} */
let igdbToken = null;
/** @param {Record<string, any>} env */
async function igdbAccess(env) {
    if (igdbToken && igdbToken.expires > Date.now()) return igdbToken.value;
    const t = await fetch(
        "https://id.twitch.tv/oauth2/token?" +
            new URLSearchParams({
                client_id: env.CLIENT_ID,
                client_secret: env.CLIENT_SECRET,
                grant_type: "client_credentials",
            }),
        { method: "POST" }
    ).then(r => r.json());
    if (!t.access_token) throw new Error("IGDB refused the keys");
    igdbToken = { value: t.access_token, expires: Date.now() + (t.expires_in - 600) * 1000 };
    return igdbToken.value;
}
/** @param {Record<string, any>} env  @param {string} endpoint  @param {string} body */
async function askIgdb(env, endpoint, body) {
    const send = async () =>
        fetch("https://api.igdb.com/v4/" + endpoint, {
            method: "POST",
            headers: {
                "Client-ID": env.CLIENT_ID,
                Authorization: "Bearer " + (await igdbAccess(env)),
                "Content-Type": "text/plain",
            },
            body,
        });
    const r = await send();
    if (r.status !== 401) return r;
    // Twitch can withdraw a token early: get a new one, once
    igdbToken = null;
    return send();
}

// ═══════════════════════════════════════════
//  /page, FOR THE LEARNING CENTRE
// ═══════════════════════════════════════════

/** @param {string} raw */
async function page(raw) {
    let u;
    try {
        u = new URL(raw);
    } catch {
        return json(400, { error: "bad address" });
    }
    if (!/^https?:$/.test(u.protocol) || !pageAllowed(u.hostname))
        return json(403, { error: "not a university or reading-list site" });
    // redirects are followed by hand, so every hop is checked before it's fetched, not just where it ends up
    let r;
    for (let hop = 0; ; hop++) {
        r = await fetch(u.toString(), {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; UniverList reading lists)",
                Accept: "text/html,application/json;q=0.9,text/plain;q=0.8",
            },
            redirect: "manual",
        });
        const next = r.status >= 300 && r.status < 400 && r.headers.get("Location");
        if (!next) break;
        if (hop >= 5) return json(508, { error: "too many redirects" });
        try {
            u = new URL(next, u);
        } catch {
            return json(502, { error: "a bad redirect" });
        }
        if (!/^https?:$/.test(u.protocol) || !pageAllowed(u.hostname))
            return json(403, { error: "it led somewhere else" });
    }
    const type = r.headers.get("Content-Type") || "text/html";
    if (!/text\/|json|xml/.test(type)) return json(415, { error: "not a page" });
    const body = await readUpTo(r.body, MAX_PAGE);
    if (body === null) return json(413, { error: "too big" });
    return new Response(body, {
        status: r.status,
        headers: {
            ...cors,
            "Content-Type": "text/plain; charset=utf-8",
            "X-Page-Type": type,
            "Cache-Control": r.ok ? "public, max-age=3600" : "no-store",
        },
    });
}

// ═══════════════════════════════════════════
//  ONE REQUEST
// ═══════════════════════════════════════════

/**
 * Answers one proxy request.
 * @param {Request} req
 * @param {Record<string, any>} env      the secrets above, and the limits
 * @param {string} base                  the path it's mounted under ("" on its own, "/api" inside the site)
 */
export async function proxy(req, env, base = "") {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url),
        parts = url.pathname.slice(base.length).split("/").filter(Boolean),
        q = new URLSearchParams(url.search);
    const route = parts[0] || "",
        rest = parts.slice(1).join("/"),
        // anything not named is IGDB: a standalone proxy also takes POST /<endpoint>
        service = [...OPEN, ...LENT, ...OWN, "ssimg"].includes(route) ? route : "igdb",
        // the password only ever comes in a header: an address ends up in logs and browser history
        passed = !!env.PASS && (await same(req.headers.get("X-Pass") || "", env.PASS)),
        inSite = !!base,
        ownPage = req.headers.get("Sec-Fetch-Site") === "same-origin" || req.headers.get("Origin") === url.origin;
    q.delete("pass");

    if (LENT.includes(service)) {
        if (inSite ? !ownPage && !passed : env.PASS && !passed) return say(403, "only for this site's own pages");
    } else if (OWN.includes(service)) {
        // inside the site these are yours alone, so they need the password to exist and be sent
        if (inSite ? !passed : env.PASS && !passed) return say(401, "no");
    }
    // the rest of the path goes on to the catalogue: plain names only, so nothing can climb out of it with our key
    if (parts.slice(1).some(x => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(x) || /^\.+$/.test(x)))
        return say(400, "bad path");

    // fetching a page uses no key, but it's still the Worker's work: inside the site, only for its own pages
    if (route === "page") {
        if (inSite && !ownPage && !passed) return say(403, "only for this site's own pages");
        return page(q.get("u") || "");
    }
    // the same for every visit, so each browser keeps it for an hour rather than asking every time the app opens
    if (route === "status")
        return withHeaders(
            json(200, {
                igdb: !!env.CLIENT_ID,
                tmdb: !!env.TMDB_KEY,
                sgdb: !!env.SGDB_KEY,
                tgdb: !!env.TGDB_KEY,
                ss: !!env.SS_DEVID,
                cv: !!env.CV_KEY,
                hc: !!env.HC_KEY,
                shared: inSite ? LENT.filter(k => (k === "tmdb" ? env.TMDB_KEY : env.CLIENT_ID)) : [],
            }),
            { "Cache-Control": "private, max-age=3600" }
        );

    if (route === "tmdb") {
        if (!env.TMDB_KEY) return need("TMDB_KEY");
        if (req.method !== "GET" || !TMDB_PATHS.test(rest)) return say(400, "bad request");
        const params = new URLSearchParams();
        for (const [k, ok] of Object.entries(TMDB_PARAMS)) {
            const v = q.get(k);
            if (v !== null && ok(v)) params.set(k, v);
        }
        params.sort();
        const key = String(env.TMDB_KEY),
            bearer = key.startsWith("eyJ"),
            upstream = new URLSearchParams(params);
        if (!bearer) upstream.set("api_key", key);
        return once(`${url.origin}${base}/tmdb/${rest}?${params}`, "tmdb", req, env, () =>
            fetch(`https://api.themoviedb.org/3/${rest}?${upstream}`, {
                headers: bearer ? { Authorization: "Bearer " + key } : {},
            })
        );
    }
    if (route === "sgdb") {
        if (!env.SGDB_KEY) return need("SGDB_KEY");
        return pass(
            await fetch("https://www.steamgriddb.com/api/v2/" + rest + "?" + q, {
                headers: { Authorization: "Bearer " + env.SGDB_KEY },
            })
        );
    }
    if (route === "tgdb") {
        if (!env.TGDB_KEY) return need("TGDB_KEY");
        q.set("apikey", env.TGDB_KEY);
        // its answers link to further pages with the key in them: hand those back without it
        const r = await fetch("https://api.thegamesdb.net/" + rest + "?" + q);
        const text = (await r.text()).split(env.TGDB_KEY).join("");
        return pass(new Response(text, { status: r.status }), "application/json");
    }
    if (route === "cv") {
        if (!env.CV_KEY) return need("CV_KEY");
        q.set("api_key", env.CV_KEY);
        q.set("format", "json");
        return pass(
            await fetch("https://comicvine.gamespot.com/api/" + rest + "/?" + q, {
                headers: { "User-Agent": "UniverList-proxy" },
            })
        );
    }
    if (route === "hc") {
        if (!env.HC_KEY) return need("HC_KEY");
        // Hardcover's key is your account: reading only, never a change
        let query = "",
            variables = {};
        const raw = await smallBody(req);
        try {
            const asked = JSON.parse(raw);
            query = String(asked.query || "");
            variables = asked.variables && typeof asked.variables === "object" ? asked.variables : {};
        } catch {
            return say(400, "bad request");
        }
        if (!/^\s*(query\b|\{)/.test(query) || /\b(mutation|subscription)\b/i.test(query))
            return say(400, "reading only");
        // what's sent on is exactly what was checked: the query and its values, nothing else from the request
        const body = JSON.stringify({ query, variables });
        return pass(
            await fetch("https://api.hardcover.app/v1/graphql", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: env.HC_KEY.startsWith("Bearer") ? env.HC_KEY : "Bearer " + env.HC_KEY,
                },
                body,
            })
        );
    }
    if (route === "ss" || route === "ssimg") {
        if (!env.SS_DEVID) return need("SS_DEVID");
        const C = {
            devid: env.SS_DEVID,
            devpassword: env.SS_DEVPASS,
            softname: "univerlist",
            ssid: env.SS_USER || "",
            sspassword: env.SS_PASS || "",
            output: "json",
        };
        const secret = String(env.SS_DEVPASS || env.SS_DEVID);
        if (route === "ssimg") {
            // only a picture address this proxy handed out itself (signed below), so the credentials it adds can't be
            // spent on anything else
            const raw = q.get("u") || "";
            let u;
            try {
                u = new URL(raw);
            } catch {
                return say(400, "bad");
            }
            if (u.protocol !== "https:" || !/(^|\.)screenscraper\.fr$/.test(u.hostname)) return say(400, "bad");
            if (!(await same(q.get("sig") || "", await sign(secret, raw))))
                return say(403, "not a picture from this proxy");
            for (const k of SS_CRED) u.searchParams.set(k, C[/** @type {keyof typeof C} */ (k)]);
            const r = await fetch(u);
            if (!/^image\//.test(r.headers.get("Content-Type") || "")) return say(415, "not a picture");
            return pass(r);
        }
        for (const [k, v] of Object.entries(C)) q.set(k, v);
        const r = await fetch("https://api.screenscraper.fr/api2/" + rest + "?" + q);
        const text = await r.text();
        // its picture addresses carry your credentials: hand back signed addresses on this proxy instead
        const found = [...new Set(text.match(/https?:\\?\/\\?\/[a-z0-9.-]*screenscraper\.fr\\?\/[^"]+/gi) || [])];
        const swaps = await Promise.all(
            found.map(async m => {
                const u = new URL(m.replace(/\\\//g, "/"));
                for (const k of SS_CRED) u.searchParams.delete(k);
                const clean = String(u);
                return [
                    m,
                    `${url.origin}${base}/ssimg?u=${encodeURIComponent(clean)}&sig=${await sign(secret, clean)}`,
                ];
            })
        );
        let out = text;
        for (const [from, to] of swaps) out = out.split(from).join(to);
        return pass(new Response(out, { status: r.status }), "application/json");
    }

    // IGDB: POST /igdb/<endpoint>, or POST /<endpoint> on a standalone proxy
    const endpoint = route === "igdb" ? parts[1] : parts[parts.length - 1] || "games";
    if (!env.CLIENT_ID) return need("CLIENT_ID");
    if (req.method !== "POST" || !IGDB_ENDPOINTS.includes(endpoint)) return say(400, "bad request");
    const body = await smallBody(req);
    return once(`${url.origin}${base}/igdb/${endpoint}/${await sha256(body)}`, "igdb", req, env, () =>
        askIgdb(env, endpoint, body)
    );
}

// on its own, as a whole Worker
export default {
    /** @param {Request} req  @param {Record<string, any>} env */
    fetch(req, env) {
        return proxy(req, env, "");
    },
};
