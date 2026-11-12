import ENV from "./env.ts";
ENV.needExport();
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { ShelfDef } from "../../src/features/core/model";
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
    ok(
        "Learning Centre tabs",
        (
            await ev(() => {
                __ulTest.setMode("academic");
                return __ulTest.tabsFor().join(",");
            })
        ).startsWith("learn,paths"),
        await ev(() => __ulTest.tabsFor().join(","))
    );
    ok(
        "no Dramas mode: dramas are Film & TV shelves",
        await ev(
            () =>
                !__ulTest.meta.modes.some(x => x.id === "dramas") &&
                // cast: this mode has shelves of its own
                (__ulTest.modeById("screen").shelves as ShelfDef[]).some(s => s.name === "K-drama" && s.ifAny) &&
                !__ulTest.modeById("screen").match!.includes("!tv:K-drama")
        ),
        await ev(() => __ulTest.meta.modes.map(x => x.id).join(","))
    );
    await ev(() => __ulTest.goTab("learn"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: ENV.OUT + `/s_learn_${W}.png` });
    await page.click('[data-act="learn-open"][data-k="maths"]');
    await page.waitForTimeout(200);
    await page.click('[data-act="learn-lvl"][data-f="Real & functional analysis"][data-l="2"]');
    await page.waitForTimeout(100);
    await page.click('[data-act="pw-new"][data-k="maths-phd"]');
    await page.waitForTimeout(400);
    ok(
        "maths-phd pathway",
        await ev(() => __ulTest.pwCur()!.template === "maths-phd" && __ulTest.pwCur()!.books.length > 55),
        await ev(() => __ulTest.pwCur()!.books.length + "")
    );
    ok("stages computed", (await ev(() => Math.max(...Object.values(__ulTest.pwStages(__ulTest.pwCur()!))))) >= 5);
    await page.screenshot({ path: ENV.OUT + `/s_phd_${W}.png`, fullPage: false });
    await ev(() => {
        __ulTest.ui.learnSub = "maths";
        __ulTest.goTab("learn");
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: ENV.OUT + `/s_subj_${W}.png` });
    // discover taste
    await ev(() => {
        __ulTest.setMode("animanga");
        __ulTest.goTab("discover");
    });
    await page.waitForTimeout(400);
    ok("taste section", !!(await page.$(".taste .tchips")));
    await page.screenshot({ path: ENV.OUT + `/s_taste_${W}.png` });
    // stats custom block
    await ev(() => {
        __ulTest.setMode("universal");
        __ulTest.goTab("overview");
        __ulTest.setBlocks(__ulTest.curMode(), B => [
            ...B,
            { k: "custom", w: 6, metric: "avg", by: "genre" },
            { k: "timetype", w: 6 },
            { k: "crowdgap", w: 6 },
        ]);
    });
    await page.waitForTimeout(300);
    ok(
        "custom blocks render",
        await ev(() =>
            [
                ...document.querySelectorAll(
                    '.blk[data-bk="custom"] .bbody, .blk[data-bk="timetype"] .bbody, .blk[data-bk="crowdgap"] .bbody'
                ),
            ].every(x => !/couldn't load/.test(x.textContent))
        )
    );
    await ev(() => document.querySelector('.blk[data-bk="custom"]')!.scrollIntoView());
    await page.waitForTimeout(200);
    await page.screenshot({ path: ENV.OUT + `/s_blocks_${W}.png` });
    // watch & read page
    await ev(() => __ulTest.actOn(new Event("click"), document.body, "go-stage", "", "", null));
    await page.waitForTimeout(300);
    await page.fill("#wq", "Bungo");
    await page.waitForTimeout(3000);
    ok(
        "stage live results",
        await ev(() => (__ulTest.W.results || []).length > 0 && !!document.querySelector("#sres .sli")),
        await ev(() => (__ulTest.W.results || []).length + "")
    );
    ok("stage input kept focus", await ev(() => document.activeElement && document.activeElement.id === "wq"));
    await page.screenshot({ path: ENV.OUT + `/s_stage_${W}.png` });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);
    ok("stage open show", await ev(() => __ulTest.W.view === "show"));
    await page.screenshot({ path: ENV.OUT + `/s_show_${W}.png` });
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await browser.close();
})();
