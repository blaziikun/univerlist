// The hosted site keeps working with no internet: it opens, imports an export, and exports again.
// Run against the served test build (it has the test hook):  pnpm build:e2e, then
//   pnpm exec wrangler dev --config tests/e2e/wrangler.test.jsonc   and   APP_URL=http://127.0.0.1:8787 node tests/e2e/run.ts offline
import ENV from "./env.ts";
if (!/^https?:/.test(ENV.APP)) {
    console.log("skip  needs APP_URL=http://… (the served test build: see above)");
    process.exit(0);
}
ENV.needExport();
import { chromium } from "playwright";
import fs from "node:fs";
import { ok } from "./helpers.ts";
(async () => {
    const browser = await chromium.launch(ENV.launch),
        ctx = await browser.newContext({ acceptDownloads: true }),
        page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", e => errs.push(e.message));
    await page.goto(ENV.APP);
    await page
        .waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 })
        .catch(() => {});
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
        await page.reload();
        await page.waitForTimeout(1500);
    }
    ok("installed for offline", await page.evaluate(() => !!navigator.serviceWorker.controller));
    ok(
        "fonts bundled",
        await page.evaluate(async () => {
            await document.fonts.ready;
            return [...document.fonts].some(f => /Inter/.test(f.family) && f.status === "loaded");
        })
    );

    await ctx.setOffline(true);
    await page.reload();
    await page.waitForTimeout(1500);
    ok(
        "opens with no internet",
        await page.evaluate(() => typeof __ulTest.items === "object" && !!document.querySelector("#main"))
    );
    await page.setInputFiles("#file-import", ENV.EXPORT);
    await page.waitForSelector('[data-act="import-replace"]');
    await page.click('[data-act="import-replace"]');
    await page.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    const n = await page.evaluate(() => __ulTest.items.size);
    ok("imports an export offline", n > 100, n + " items");
    await page.evaluate(() => __ulTest.goSettings("io"));
    await page.waitForTimeout(300);
    const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 120000 }),
        page.click('[data-act="export-open"]').then(() => page.click('.modal [data-act="export-zip"]')),
    ]);
    const size = fs.statSync(await dl.path()).size;
    ok("exports offline", size > 10000, Math.round(size / 1024) + " KB");
    await page.reload();
    await page.waitForTimeout(1500);
    ok("still there after reload, offline", (await page.evaluate(() => __ulTest.items.size)) === n);
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
