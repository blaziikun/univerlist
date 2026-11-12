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
    await ev(() => {
        const id = [...__ulTest.items.entries()].find(([, b]) => /^Bungo Stray Dogs$/i.test(b.title))![0];
        __ulTest.watchFromItem(id);
    });
    await page.waitForFunction(() => __ulTest.W.seasons.length > 3, null, { timeout: 9000 }).catch(() => {});
    ok("item opens player page", await ev(() => !!document.querySelector("#cinema .cin-side .cs-eps")));
    await page.screenshot({ path: ENV.OUT + `/s_player0_${W}.png` });
    ok(
        "BSD seasons by release name",
        await ev(() => __ulTest.W.seasons.length >= 4),
        await ev(() => JSON.stringify(__ulTest.W.seasons.map(s => s.label)))
    );
    ok("numbers by default", await ev(() => document.querySelectorAll("#cinema .cs-num").length > 5));
    ok("empty stage", await ev(() => !!document.querySelector("#cinema .cin-empty")));
    await page.screenshot({ path: ENV.OUT + `/s_player_${W}.png` });
    await page.click('#cinema [data-act="wp-opts"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: ENV.OUT + `/s_wpopts_${W}.png` });
    await page.click('#cinema [data-act="wp-eps"][data-k="detailed"]');
    await page.waitForTimeout(150);
    ok("detailed", await ev(() => document.querySelectorAll("#cinema .cs-ep2").length > 5));
    await page.click('#cinema [data-act="wp-place"][data-k="eps"][data-v="main"]');
    await page.waitForTimeout(200);
    ok("episodes under the player", await ev(() => !!document.querySelector("#cinema .cin-mb .cb-eps")));
    await page.click('#cinema [data-act="wp-spot"][data-k="lights"][data-v="off"]');
    await page.waitForTimeout(200);
    ok("toolbar: lights off", await ev(() => !document.querySelector('#cinema .cin-under [data-act="cin-lights"]')));
    await page.click('#cinema [data-act="wp-tool"][data-k="next"][data-d="-1"]');
    await page.waitForTimeout(200);
    ok("toolbar order", await ev(() => __ulTest.WP().tools.indexOf("next") < __ulTest.WP().tools.indexOf("mark")));
    await page.screenshot({ path: ENV.OUT + `/s_player2_${W}.png` });
    await page.screenshot({ path: ENV.OUT + `/s_bento_${W}.png` });
    await ev(() => {
        __ulTest.meta.settings.stageTheme = Object.keys(__ulTest.meta.themes!).find(
            k => k !== __ulTest.curMode().theme
        );
    });
    await page.selectOption("#cinema [data-stagetheme]", String(await ev(() => __ulTest.meta.settings.stageTheme)));
    await page.waitForTimeout(200);
    ok(
        "stage theme applied",
        await ev(
            () =>
                getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() ===
                __ulTest.resolveTheme(__ulTest.meta.settings.stageTheme).bg
        )
    );
    await page.selectOption("#cinema [data-cinseason]", "1");
    await page.waitForTimeout(1200);
    ok(
        "season switch keeps page",
        await ev(() => !!document.querySelector("#cinema") && __ulTest.W.player!.listSi === 1)
    );
    await page.click('#cinema [data-act="cin-close"]');
    await page.waitForTimeout(300);
    ok(
        "close → the show (one level up)",
        await ev(() => !document.querySelector("#cinema") && __ulTest.W.view === "show" && !!__ulTest.W.show)
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    ok("…and Escape → watch home", await ev(() => __ulTest.W.view === "home" && __ulTest.ui.page === "watch"));
    ok(
        "mode theme back after leaving",
        await ev(() => {
            __ulTest.goTab("overview");
            __ulTest.ui.page = "profile";
            __ulTest.render();
            return (
                getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() === __ulTest.modeTheme().bg
            );
        })
    );
    // One Piece once
    await ev(() => {
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    await page.fill("#wq", "One Piece");
    await page
        .waitForFunction(() => (__ulTest.W.results || []).length && !__ulTest.W.busy, null, { timeout: 8000 })
        .catch(() => {});
    ok(
        "One Piece once",
        await ev(() => (__ulTest.W.results || []).filter(r => /^one piece$/i.test(r.title)).length <= 1),
        await ev(() => JSON.stringify((__ulTest.W.results || []).slice(0, 5).map(r => r.title + "|" + r.medium)))
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
