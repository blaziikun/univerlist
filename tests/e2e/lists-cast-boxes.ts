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
    // list multi add
    const lid = await ev(() => {
        const id = __ulTest.newListId();
        __ulTest.changeMeta("New", "lists", L => [...L, { id, name: "Test", ids: [], numbered: true }]);
        __ulTest.setMode("universal");
        __ulTest.goTab("lists");
        __ulTest.ui.listId = id;
        __ulTest.render();
        return id;
    });
    await page.click('[data-act="li-add"]');
    await page.waitForTimeout(300);
    await page.click('[data-act="pi-scope"][data-k="all"]');
    await page.waitForTimeout(200);
    const ids = await ev(() =>
        [...document.querySelectorAll<HTMLElement>(".pigrid .pirow")].slice(0, 5).map(b => b.dataset.id)
    );
    for (const i of ids) await page.click(`.pirow[data-id="${i}"]`);
    await page.screenshot({ path: ENV.OUT + `/s_pick_${W}.png` });
    await page.click('[data-act="pi-add"]');
    await page.waitForTimeout(200);
    ok("added 5 at once", await ev(l => __ulTest.meta.lists.find(x => x.id === l)!.ids.length === 5, lid));
    await ev(() => __ulTest.closeModal());
    // characters → a list
    await ev(() => {
        const id = [...__ulTest.items.entries()].find(([, b]) => b.medium === "tv" && b.title === "White Collar")![0];
        __ulTest.openItem(id);
        __ulTest.ui.modal!.itab = "chars";
        __ulTest.renderOverlay();
    });
    await page.waitForTimeout(300);
    const tabBtn = await page.$('[data-act="itab"][data-k="chars"], [data-k="chars"][data-act*="tab"]');
    if (tabBtn) await tabBtn.click();
    await page.waitForTimeout(200);
    const load = await page.$('[data-act="cast-load"]');
    if (load) {
        await load.click();
        await page.waitForTimeout(2500);
    }
    const b2 = await page.$('[data-act="cast-tolist"]');
    ok("cast → list button", !!b2);
    if (b2) {
        await b2.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: ENV.OUT + `/s_castlist_${W}.png` });
        await page.click('[data-act="cl-add"]');
        await page.waitForTimeout(300);
        ok(
            "ranked list of characters made",
            await ev(() =>
                __ulTest.meta.lists.some(l => l.kind === "tier" && l.what === "chars" && l.rows![0].ids.length > 0)
            )
        );
    }
    // castSplit
    ok(
        "cast split",
        await ev(
            () =>
                JSON.stringify(
                    __ulTest
                        .castSplit([
                            { name: "Homer Simpson / Grampa (voice)", va: "Dan", image: "x" },
                            { name: "Marge Simpson (voice)", va: "Julie" },
                        ])
                        .map(c => c.name)
                ) === '["Homer Simpson","Grampa","Marge Simpson"]'
        )
    );
    // game boxes
    await ev(() => {
        __ulTest.closeModal();
        __ulTest.setMode("games");
        __ulTest.goTab("library");
        __ulTest.ui.view = "cover";
        __ulTest.curMode().view = "cover";
        __ulTest.renderMain();
    });
    await page.waitForTimeout(500);
    ok(
        "game box shapes",
        await ev(() => document.querySelectorAll(".libbody .gbox").length > 3),
        await ev(() => document.querySelectorAll(".libbody .gbox").length + "")
    );
    await page.screenshot({ path: ENV.OUT + `/s_boxes_${W}.png` });
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
