import ENV from "./env.ts";
ENV.needExport();
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
const ZIP = ENV.EXPORT;
(async () => {
    const browser = await chromium.launch(ENV.launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    for (const z of ["lbweird.zip", "lb1.zip", "lb2.zip"]) {
        await ev(() => {
            for (const [id, b] of __ulTest.items)
                if (b.medium === "game")
                    __ulTest.quietPatch(id, { lbArt: undefined, spineArt: undefined, coverPicked: false });
            const g = [...__ulTest.items.entries()].find(([, b]) => b.title === "Super Mario Galaxy");
            __ulTest.quietPatch(g![0], { platform: "Wii" });
            Object.assign(__ulTest.LB, { done: false, matched: 0 });
            __ulTest.goSettings("data");
        });
        await page.waitForTimeout(300);
        const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click('[data-act="lb-pick"]')]);
        const t0 = Date.now();
        await fc.setFiles(ENV.FIX + "/" + z);
        await page.waitForFunction(() => __ulTest.LB.done || __ulTest.LB.err, null, { timeout: 120000 });
        const r = await ev(() => {
            const g = [...__ulTest.items.values()].find(b => b.title === "Super Mario Galaxy"),
                a = [...__ulTest.items.values()].find(b => b.title === "Apex Legends");
            return {
                err: __ulTest.LB.err,
                m: __ulTest.LB.matched,
                cover: g!.cover,
                spine: g!.spineArt,
                art: ((g!.lbArt || []) as { label: string }[]).map(
                    x => x.label
                ) /* cast: LaunchBox's pictures for a game, as lbimport.ts keeps them */,
                apex: a && a.cover,
            };
        });
        ok(
            z + " Wii box EU + spine",
            /SMG-eu.jpg$/.test(r.cover!) && /SMG\.jpg$/.test(r.spine || "") && /apex/.test(r.apex || ""),
            JSON.stringify(r) + " " + (Date.now() - t0) + "ms"
        );
    }
    await page.screenshot({ path: ENV.OUT + "/s_lb_1440.png" });
    ok("slim copy kept", await ev(async () => !!(await __ulTest.idbGet("x", "idx", await __ulTest.lbStore()))));
    await page.reload();
    await page.waitForTimeout(2500);
    const nid = await ev(() =>
        __ulTest.addItem(
            { medium: "game", title: "Super Mario Galaxy", platform: "Nintendo Switch", status: "want" },
            "Add"
        )
    );
    await page.waitForTimeout(3000);
    ok(
        "new game boxed from the slim copy",
        await ev(i => /SMGsw\.jpg$/.test(__ulTest.items.get(i)!.cover || ""), nid),
        await ev(i => __ulTest.items.get(i)!.cover + " " + __ulTest.items.get(i)!.lbChecked, nid)
    );
    await ev(i => {
        __ulTest.openItem(i);
        __ulTest.ui.modal!.tab = "art";
        __ulTest.renderOverlay();
    }, nid);
    await page.waitForTimeout(300);
    ok("spine controls", !!(await page.$('[data-act="spine-upload"]')));
    await page.click('[data-act="find-art"]');
    await page.waitForTimeout(2500);
    const sp = await page.$('[data-act="pick-art"][data-as="spine"]');
    if (sp) {
        await sp.click();
        await page.waitForTimeout(200);
    }
    ok("pick a spine", await ev(i => !!__ulTest.items.get(i)!.spinePicked && !!__ulTest.items.get(i)!.spineArt, nid));
    await page.screenshot({ path: ENV.OUT + "/s_spine_1440.png" });
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
