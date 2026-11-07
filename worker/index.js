// worker/index.js
// ─────────────────────────────────────────────────────────────────
//  The site's Worker: the website's files, plus /api
//
//  Files are served straight from dist/ by Cloudflare (wrangler.jsonc → assets, with public/_headers); only /api/* runs
//  this code. Here: only GET, POST and OPTIONS (and PUT for sync); at most 60 requests a minute from one address (API_RL in
//  wrangler.jsonc, when set up); security headers on every answer; /api/sync is Account & sync (sign-in, the encrypted
//  library); TMDB and IGDB shared with the site's own pages (worker/proxy.js); and an error never says more than
//  "something went wrong".
// ─────────────────────────────────────────────────────────────────
// @ts-check

import { addressKey, proxy } from "./proxy.js";
import { sync } from "./sync.js";

const SEC = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
/** @param {Response} r */
const secure = r => {
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(SEC)) h.set(k, v);
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
};
const plain = (/** @type {number} */ s, /** @type {string} */ t, /** @type {Record<string, string>} */ x = {}) =>
    secure(
        new Response(t, {
            status: s,
            headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*", ...x },
        })
    );

export default {
    /** @param {Request} req  @param {Record<string, any>} env */
    async fetch(req, env) {
        const path = new URL(req.url).pathname;
        if (path === "/api" || path.startsWith("/api/")) {
            const isSync = path === "/api/sync" || path.startsWith("/api/sync/");
            if (!(isSync ? ["GET", "POST", "PUT"] : ["GET", "POST", "OPTIONS"]).includes(req.method))
                return plain(405, "no", { Allow: isSync ? "GET, POST, PUT" : "GET, POST, OPTIONS" });
            if (env.API_RL && req.method !== "OPTIONS") {
                const { success } = await env.API_RL.limit({ key: addressKey(req) });
                if (!success) return plain(429, "slow down", { "Retry-After": "60" });
            }
            // Account & sync: same-origin only (no CORS), its own checks and rate limits (worker/sync.js)
            if (isSync) return secure(await sync(req, env, path.slice("/api/sync".length) || "/"));
            try {
                return secure(await proxy(req, env, "/api"));
            } catch {
                return plain(502, "something went wrong");
            }
        }
        return env.ASSETS.fetch(req);
    },
};
