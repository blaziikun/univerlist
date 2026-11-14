// The deployed site under its real security headers (public/_headers): nothing the app does is blocked by its own
// Content-Security-Policy, the page can't be framed, and an extension still runs (in ext-host.html, its own sandbox).
// Needs the site's test build: pnpm build:e2e (pnpm test:e2e makes it; skips without it).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator, listen } from "./helpers.ts";
const DIST = ENV.SITE;
if (!fs.existsSync(path.join(DIST, "ext-host.html"))) {
    console.log("skip  needs the site's test build (pnpm build:e2e)");
    process.exit(0);
}
// _headers, read the way Cloudflare does: rules in order, "! Name" takes a header back off
type Rule = { pat: string; set: [string, string][]; del: string[] };
const rules: Rule[] = [];
let cur: Rule | null = null;
for (const line of fs.readFileSync(path.join(DIST, "_headers"), "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
        cur = { pat: line.trim(), set: [], del: [] };
        rules.push(cur);
        continue;
    }
    const t = line.trim();
    if (t.startsWith("!")) cur!.del.push(t.slice(1).trim().toLowerCase());
    else {
        const i = t.indexOf(":");
        cur!.set.push([t.slice(0, i).toLowerCase(), t.slice(i + 1).trim()]);
    }
}
const headersFor = (p: string) => {
    const h: Record<string, string> = {};
    for (const r of rules) {
        const re = new RegExp("^" + r.pat.replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$");
        if (!re.test(p)) continue;
        for (const d of r.del) delete h[d];
        for (const [k, v] of r.set) h[k] = v;
    }
    return h;
};
const TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".zip": "application/zip",
};
const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url!, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        return res.end();
    }
    res.writeHead(200, {
        "content-type":
            TYPES[path.extname(f) as keyof typeof TYPES] /* cast: a type it doesn't list falls back below */ ||
            "application/octet-stream",
        ...headersFor(p),
    });
    res.end(fs.readFileSync(f));
});
(async () => {
    const base = `http://127.0.0.1:${await listen(srv)}`;
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    await c.addInitScript(() => {
        window.__csp = [];
        document.addEventListener("securitypolicyviolation", e =>
            window.__csp.push(e.violatedDirective + " " + e.blockedURI)
        );
    });
    const p = await c.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message + " @ " + String(e.stack).split("\n").slice(1, 3).join(" ")));
    const ev = evaluator(p);
    await p.goto(base + "/");
    await p.waitForTimeout(1200);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await ev(() => {
        __ulTest.addItem({ medium: "anime", title: "A", status: "done", rating: 8, genres: ["Drama"] });
        __ulTest.addItem({ medium: "film", title: "B", status: "want" });
    });
    for (const s of await ev(() => __ulTest.setSecs().map(x => x[0]))) {
        await ev(k => __ulTest.goSettings(k), s);
        await p.waitForTimeout(60);
    }
    for (const t of ["overview", "library", "rank", "discover", "favourites", "stats", "lists"]) {
        await ev(t => {
            __ulTest.ui.page = "profile";
            __ulTest.ui.tab = t;
            __ulTest.render();
        }, t);
        await p.waitForTimeout(60);
    }
    await ev(() => {
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    await p.waitForTimeout(100);
    // an extension, the way it really runs on the site
    const fake = `univerlist.provide("watch.sources", async () => [{ name: "csp-ok", url: "http://127.0.0.1:9/v.mp4" }]);`;
    await ev(
        code =>
            __ulTest.extInstall(
                new File(
                    [JSON.stringify({ id: "csp-test", name: "CSP test", permissions: ["watch.sources"], code })],
                    "csp-test.json",
                    { type: "application/json" }
                )
            ),
        fake
    ).catch(() => {});
    await p.waitForTimeout(1500);
    ok(
        "an extension still runs, in its own sandboxed page",
        await ev(
            () =>
                [...__ulTest.EXT.frames.values()].some(F => F.jobs.has("watch.sources")) &&
                !!document.querySelector('iframe[src="ext-host.html"]')
        )
    );
    // Firefox and Zen (not run here) read 'self' as nothing on a page whose own policy sandboxes it, so ext-host.html's
    // frame-ancestors 'self' would then refuse the app and no extension would start. The app's frame does the sandboxing
    // and the offline copy (sw.js) never keeps ext-host.html: a kept copy carries the headers it came with until the file
    // itself changes, so a fix to its headers wouldn't reach anyone who had visited before
    const sw = fs.readFileSync(path.join(DIST, "sw.js"), "utf8");
    ok(
        "ext-host.html isn't kept offline, and is never answered with the app",
        !/url:\s*"ext-host\.html"/.test(sw) && sw.includes("/^\\/ext-host(\\.html)?$/"),
        (sw.match(/denylist:\[[^\]]*\]/) || [""])[0]
    );
    // on both paths: Cloudflare sends /ext-host.html on to /ext-host (tests/e2e/ext-on-cloudflare.ts checks it for real)
    const host = headersFor("/ext-host.html")["content-security-policy"] || "",
        pretty = headersFor("/ext-host")["content-security-policy"] || "";
    ok(
        "ext-host.html doesn't sandbox itself (the app's frame does), so Firefox lets the app frame it",
        host === pretty && /frame-ancestors 'self'/.test(host) && !/(^|;)\s*sandbox\b/.test(host),
        host
    );
    // an extension's own code reaches its companion and nothing else (its policy, extPolicy): here the companion is a small
    // server at 127.0.0.1, and "elsewhere" is the same server under another name, which the site's policy alone allows
    const comp = http.createServer((_req, res) => {
        res.writeHead(200, { "access-control-allow-origin": "*" });
        res.end("ok");
    });
    const port = await listen(comp);
    const probe = `univerlist.provide("watch.sources", async () => {
    const tryIt = u => fetch(u).then(() => "reached", () => "blocked");
    return [{ name: "companion " + await tryIt("http://127.0.0.1:${port}/health"), url: "x" }, { name: "elsewhere " + await tryIt("http://localhost:${port}/health"), url: "x" }];
  });`;
    await ev(
        ([code, url]) =>
            __ulTest.extInstall(
                new File(
                    [
                        JSON.stringify({
                            id: "net-test",
                            name: "Net test",
                            permissions: ["watch.sources", "companion"],
                            companion: { url },
                            code,
                        }),
                    ],
                    "net-test.json",
                    { type: "application/json" }
                )
            ),
        [probe, `http://127.0.0.1:${port}`]
    ).catch(() => {});
    await p.waitForTimeout(1500);
    const reach = await ev(() =>
        __ulTest
            .extCall("net-test", "watch.sources", [{}])
            .then(r => (Array.isArray(r) ? r : []).map(s => s.name))
            .catch(e => ["error " + e.message])
    );
    ok("an extension's own code reaches its companion", reach.includes("companion reached"), reach.join(", "));
    ok(
        "…and nowhere else, whatever the site's policy would allow",
        reach.includes("elsewhere blocked"),
        reach.join(", ")
    );
    // every page the app frames from elsewhere (each <iframe src="https://…"> in its source: the player's YouTube embed)
    // is allowed by the site's frame-src, and really loads in a frame under it
    const framed = new Set<string>();
    for (const f of fs.readdirSync(path.join(ENV.ROOT, "src"), { recursive: true, encoding: "utf8" }))
        if (/\.(svelte|ts)$/.test(f))
            for (const m of fs
                .readFileSync(path.join(ENV.ROOT, "src", f), "utf8")
                .matchAll(/<iframe\b[^>]*?\bsrc="(https:\/\/[^/"{]+)/g))
                framed.add(m[1]);
    const frameSrc =
        (/frame-src ([^;]*)/.exec(headersFor("/index.html")["content-security-policy"] || "") || [])[1] || "";
    ok(
        "the app frames pages from elsewhere (the player's YouTube embed), and the site's frame-src allows each",
        framed.has("https://www.youtube-nocookie.com") && [...framed].every(o => frameSrc.split(/\s+/).includes(o)),
        [...framed].join(", ") + " · frame-src " + frameSrc
    );
    await c.route(/^https:\/\/[^/]+\/embed\//, r => r.fulfill({ contentType: "text/html", body: "<p>embed</p>" }));
    const embeds = await ev(
        origins =>
            Promise.all(
                origins.map(
                    o =>
                        new Promise<string>(done => {
                            const f = document.createElement("iframe");
                            const blocked = (e: SecurityPolicyViolationEvent) => {
                                if (e.blockedURI.startsWith(o)) done(o + " blocked");
                            };
                            document.addEventListener("securitypolicyviolation", blocked);
                            f.onload = () => setTimeout(() => done(o + " loaded"), 200);
                            f.src = o + "/embed/aaaaaaaaaaa";
                            document.body.append(f);
                        })
                )
            ),
        [...framed]
    );
    ok(
        "…and each embed loads on the site, under its real headers",
        embeds.length > 0 && embeds.every(x => x.endsWith(" loaded")),
        embeds.join(", ")
    );
    const v = await ev(() => window.__csp);
    ok("nothing the app does is blocked by its own policy", !v.length, v.slice(0, 6).join(" | "));
    const h = await (await fetch(base + "/")).headers;
    ok(
        "the page refuses to be framed",
        /frame-ancestors 'none'/.test(h.get("content-security-policy") || "") && h.get("x-frame-options") === "DENY"
    );
    ok("scripts only from the site itself", /script-src 'self'(;|$)/.test(h.get("content-security-policy") || ""));
    ok(
        "HSTS, nosniff, COOP",
        !!h.get("strict-transport-security") &&
            h.get("x-content-type-options") === "nosniff" &&
            h.get("cross-origin-opener-policy") === "same-origin"
    );
    // an injected inline script is refused
    const inj = await ev(() => {
        window.__pwned = 0;
        const s = document.createElement("script");
        s.textContent = "window.__pwned = 1";
        document.body.append(s);
        return new Promise(r => setTimeout(() => r(window.__pwned), 100));
    });
    ok("an injected inline script doesn't run", inj === 0);
    ok("no page errors", !errs.length, errs.join(" | "));
    await b.close();
    srv.close();
    comp.close();
})();
