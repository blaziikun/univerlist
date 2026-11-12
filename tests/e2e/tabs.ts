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
    // remember tab per mode
    await ev(() => {
        __ulTest.setMode("universal");
        __ulTest.goTab("overview");
        __ulTest.setMode("animanga");
        __ulTest.goTab("stats");
        __ulTest.setMode("novels");
        __ulTest.setMode("animanga");
    });
    ok("culture back on stats", await ev(() => __ulTest.ui.tab === "stats"), await ev(() => __ulTest.ui.tab));
    await ev(() => __ulTest.setMode("universal"));
    ok("hub on overview", await ev(() => __ulTest.ui.tab === "overview"), await ev(() => __ulTest.ui.tab));
    // tab editor
    await page.click(".tabedit");
    await page.waitForTimeout(200);
    await page.screenshot({ path: ENV.OUT + `/s_tabedit_${W}.png` });
    await page.uncheck('#ctx [data-tabon="favourites"]');
    await page.waitForTimeout(150);
    ok(
        "removed Favourites from hub",
        await ev(
            () =>
                !__ulTest.tabsFor().includes("favourites") &&
                __ulTest.tabsFor(__ulTest.modeById("animanga")).includes("favourites")
        )
    );
    await page.check('#ctx [data-tabon="diary"]');
    await page.waitForTimeout(150);
    ok("added Diary to hub", await ev(() => __ulTest.tabsFor().includes("diary")));
    await page.click('#ctx [data-act="tab-move"][data-k="stats"][data-d="-1"]');
    await page.waitForTimeout(150);
    ok(
        "moved Stats earlier",
        await ev(() => __ulTest.tabsFor().indexOf("stats") < __ulTest.tabsFor().indexOf("library")),
        await ev(() => __ulTest.tabsFor().join())
    );
    await page.click('#ctx [data-act="tab-home"][data-k="stats"]');
    await page.waitForTimeout(150);
    ok("home tab", await ev(() => __ulTest.curMode().homeTab === "stats"));
    ok("menu still open", await ev(() => !document.getElementById("ctx")!.hidden));
    // drag tab in bar
    if (W > 800) {
        await page.mouse.click(5, 300);
        await page.dragAndDrop('.ptabs [data-k="discover"]', '.ptabs [data-k="overview"]', {
            targetPosition: { x: 4, y: 10 },
        });
        await page.waitForTimeout(200);
        ok(
            "drag tab to front",
            await ev(() => __ulTest.tabsFor()[0] === "discover"),
            await ev(() => __ulTest.tabsFor().join())
        );
    }
    // refresh keeps place
    await ev(() => {
        __ulTest.setMode("animanga");
        __ulTest.goTab("stats");
    });
    await ev(() => window.scrollTo(0, 300));
    await page.reload();
    await page.waitForTimeout(2500);
    ok(
        "refresh keeps mode+tab",
        await ev(
            () => __ulTest.ui.mode === "animanga" && __ulTest.ui.tab === "stats" && __ulTest.ui.page === "profile"
        ),
        await ev(() => __ulTest.ui.mode + "/" + __ulTest.ui.tab + "/" + __ulTest.ui.page)
    );
    await ev(() => {
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    await page.reload();
    await page.waitForTimeout(2500);
    ok("refresh keeps watch page", await ev(() => __ulTest.ui.page === "watch"));
    await ev(() => __ulTest.goSettings("library"));
    await page.waitForTimeout(200);
    await page.screenshot({ path: ENV.OUT + `/s_setlib_${W}.png`, fullPage: true });
    ok(
        "no Tabs row in settings",
        await ev(() => ![...document.querySelectorAll(".srow b")].some(b => /^Tabs$|Its own tabs/.test(b.textContent)))
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
