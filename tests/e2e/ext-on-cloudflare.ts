// An extension starts on the site as Cloudflare really serves it (wrangler dev: its redirects and public/_headers), and
// its code reaches its companion. Cloudflare answers ext-host.html with a redirect to /ext-host, so the rules for that
// page must cover /ext-host too, or it gets the app's own (no framing, no inline code) and no extension ever starts.
// Needs the site's test build: pnpm build:e2e (pnpm test:e2e makes it; skips without it).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { startSyncServer, until } from "./sync-server.ts";
import { ok, evaluator, listen } from "./helpers.ts";
if (!fs.existsSync(path.join(ENV.SITE, "ext-host.html"))) {
    console.log("skip  needs the site's test build (pnpm build:e2e)");
    process.exit(0);
}
(async () => {
    const srv = await startSyncServer(8794);
    const hits: string[] = [];
    const comp = http.createServer((req, res) => {
        hits.push(req.url || "");
        res.writeHead(200, { "access-control-allow-origin": "*", "content-type": "application/json" });
        res.end("[]");
    });
    const cport = await listen(comp);
    // what Cloudflare sends for the page an extension runs in, after any redirect
    const r = await fetch(srv.base + "/ext-host.html");
    const csp = r.headers.get("content-security-policy") || "";
    ok(
        "the extension page arrives with its own rules (inline code, framed by the app), not the app's",
        r.ok &&
            /script-src 'unsafe-inline'/.test(csp) &&
            /frame-ancestors 'self'/.test(csp) &&
            !r.headers.get("x-frame-options"),
        `${r.url} · ${csp.slice(0, 90)} · x-frame-options ${r.headers.get("x-frame-options")}`
    );
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(srv.base + "/");
    await p.waitForTimeout(1200);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const code = `fetch("http://127.0.0.1:${cport}/from-extension").catch(() => {}); univerlist.provide("watch.sources", async () => []);`;
    await ev(
        a =>
            __ulTest.extInstall(
                new File(
                    [
                        JSON.stringify({
                            id: "cf-test",
                            name: "CF test",
                            permissions: ["watch.sources", "companion"],
                            companion: { url: a.url },
                            code: a.code,
                        }),
                    ],
                    "cf-test.json",
                    { type: "application/json" }
                )
            ),
        { code, url: `http://127.0.0.1:${cport}` }
    ).catch(() => {});
    const started = await until(
        () => ev(() => [...__ulTest.EXT.frames.values()].some(F => F.jobs.has("watch.sources"))),
        8000
    ).catch(() => false);
    ok("an extension starts on the site as Cloudflare serves it", !!started);
    await until(() => hits.length, 5000).catch(() => {});
    ok("and its code reaches its companion", hits.includes("/from-extension"), JSON.stringify(hits));
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    comp.close();
    srv.stop();
    process.exit(0);
})();
