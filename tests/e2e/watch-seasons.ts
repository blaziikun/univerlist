import ENV from "./env.ts";
ENV.needExport();
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
const ZIP = ENV.EXPORT,
    W = +(process.argv[2] || 1440);
(async () => {
    const browser = await chromium.launch(ENV.launch);
    const ctx = await browser.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 } });
    await setup(ctx);
    const page = await ctx.newPage(),
        errs: string[] = [];
    page.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(page);
    await page.goto(ENV.APP);
    await page.waitForTimeout(1000);
    await page.fill("#wl-name", "Sam");
    await page.click('[data-act="welcome-done"]');
    await page.setInputFiles("#file-import", ZIP);
    await page.waitForSelector('[data-act="import-replace"]');
    await page.click('[data-act="import-replace"]');
    await page.waitForTimeout(3000);
    // Little Busters in watch: together
    const lb = await ev(() =>
        [...__ulTest.items.entries()]
            .filter(([, b]) => /^Little Busters/.test(b.title) && b.medium === "anime")
            .map(([id, b]) => id + ":" + b.kind)
    );
    console.log(lb.join(" , "));
    await ev(() => {
        const id = [...__ulTest.items.entries()].find(
            ([, b]) => /^Little Busters!$/.test(b.title) || /^Little Busters/.test(b.title)
        )![0];
        __ulTest.watchFromItem(id);
    });
    await page.waitForTimeout(1500);
    ok(
        "LB seasons together",
        await ev(() => __ulTest.W.seasons.length),
        await ev(() => JSON.stringify(__ulTest.W.seasons.map(s => s.title || s.label)))
    );
    await page.click('[data-act="wp-opts"]');
    await page.waitForTimeout(200);
    await ev(() => {
        __ulTest.meta.settings.seasonsMode = "together";
        __ulTest.meta.settings.watchPage = {};
    });
    // combine across library
    await ev(() => __ulTest.seasonsAcrossLibrary(true));
    ok(
        "combined across library",
        await ev(() => __ulTest.all().filter(b => __ulTest.partsOf(b).length).length > 0),
        await ev(() => __ulTest.all().filter(b => __ulTest.partsOf(b).length).length + "")
    );
    ok(
        "LB combined parts",
        await ev(() => {
            const p = [...__ulTest.items.values()].find(
                b => /^Little Busters/.test(b.title) && __ulTest.partsOf(b).length
            );
            return p ? __ulTest.partsOf(p).length : 0;
        })
    );
    // search pick with a linked source autoplays
    await ev(() => {
        const id =
            [...__ulTest.items.entries()].find(([, b]) => b.title === "White Collar")?.[0] ||
            [...__ulTest.items.entries()].find(([, b]) => b.medium === "tv")![0];
        __ulTest.quietPatch(id, { sources: { S1E1: "http://192.168.1.20/a.mp4" } });
        __ulTest.ui.page = "watch";
        __ulTest.W.show = null;
        __ulTest.W.view = "home";
        __ulTest.render();
    });
    await page.fill("#wq", "White Collar");
    await page.waitForFunction(() => (__ulTest.W.results || []).length > 0 && !__ulTest.W.busy, null, {
        timeout: 8000,
    });
    console.log(
        await ev(() =>
            JSON.stringify({
                page: __ulTest.ui.page,
                q: __ulTest.W.q,
                busy: __ulTest.W.busy,
                wq: !!document.querySelector("#wq"),
                loc: __ulTest.all().filter(b => b.title === "White Collar").length,
                mode: __ulTest.ui.mode,
            })
        )
    );
    ok(
        "results",
        await ev(() => (__ulTest.W.results || []).length > 0),
        await ev(() => JSON.stringify((__ulTest.W.results || []).slice(0, 3).map(r => r.title + "|" + r.medium)))
    );
    console.log(
        "focus",
        await ev(() => document.activeElement && (document.activeElement.id || document.activeElement.className))
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    ok(
        "search → plays straight away",
        await ev(() => !!__ulTest.W.player && !!document.querySelector("#cinema")),
        await ev(() =>
            JSON.stringify({
                v: __ulTest.W.view,
                p: !!__ulTest.W.player,
                s: __ulTest.W.seasons.length,
                e: (__ulTest.W.seasons[__ulTest.W.si] || {}).eps && __ulTest.W.seasons[__ulTest.W.si].eps!.length,
            })
        )
    );
    await page.screenshot({ path: ENV.OUT + `/s_autoplay_${W}.png` });
    // read: item page shows only the item
    await page.click('[data-act="cin-close"]').catch(() => {});
    await page.waitForTimeout(200);
    await ev(() => {
        const id = [...__ulTest.items.entries()].find(([, b]) => b.medium === "manga" && b.status === "active")![0];
        __ulTest.readFromItem(id);
    });
    await page.waitForTimeout(500);
    ok(
        "read item page: no continue rows",
        await ev(() => ![...document.querySelectorAll(".wrow h3")].some(h => /Continue|Planned/.test(h.textContent)))
    );
    await page.screenshot({ path: ENV.OUT + `/s_readitem_${W}.png` });
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
