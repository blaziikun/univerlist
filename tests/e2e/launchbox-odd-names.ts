import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok } from "./helpers.ts";
(async () => {
    const browser = await chromium.launch(ENV.launch);
    const ctx = await browser.newContext();
    await setup(ctx);
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", e => errs.push(e.message));
    await page.goto(ENV.APP);
    await page.waitForTimeout(1000);
    await page.fill("#wl-name", "S");
    await page.click('[data-act="welcome-done"]');
    await page.evaluate(() => {
        __ulTest.addItem({ medium: "game", title: "Constructor", platform: "PC" });
        __ulTest.addItem({ medium: "game", title: "toString" });
        __ulTest.goSettings("data");
    });
    await page.waitForTimeout(300);
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click('[data-act="lb-pick"]')]);
    await fc.setFiles(ENV.FIX + "/lbweird.zip");
    await page.waitForFunction(() => __ulTest.LB.done || __ulTest.LB.err, null, { timeout: 60000 });
    const r = await page.evaluate(() => ({
        err: __ulTest.LB.err,
        m: __ulTest.LB.matched,
        c: [...__ulTest.items.values()].find(b => b.title === "Constructor")!.cover,
    }));
    ok('a game called "Constructor" matches', !r.err && r.m === 1 && /launchbox/.test(r.c!), JSON.stringify(r));
    ok("no page errors", !errs.length, errs.join("|"));
    await browser.close();
})();
