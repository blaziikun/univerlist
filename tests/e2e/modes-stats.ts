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
    // framing a data-url cover
    const id = await ev(() => [...__ulTest.items.entries()].find(([, b]) => b.medium === "anime")![0]);
    await ev(id => {
        const c = document.createElement("canvas");
        c.width = 400;
        c.height = 600;
        const x = c.getContext("2d");
        const g = x!.createLinearGradient(0, 0, 400, 600);
        g.addColorStop(0, "red");
        g.addColorStop(1, "blue");
        x!.fillStyle = g;
        x!.fillRect(0, 0, 400, 600);
        __ulTest.openFrame(c.toDataURL("image/jpeg"), { t: "cover", id });
    }, id);
    await page.waitForTimeout(500);
    await page.screenshot({ path: ENV.OUT + `/s_frame_${W}.png` });
    const box = await ev(() => {
        const r = document.getElementById("fview")!.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await page.mouse.wheel(0, -400);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.click('[data-act="frame-save"]');
    await page.waitForTimeout(800);
    ok("frame saved cover", await ev(id => /^data:image\/jpeg/.test(__ulTest.items.get(id)!.coverData || ""), id));
    // character gallery
    await ev(() => {
        __ulTest.closeModal();
        const c = __ulTest.meta.chars[0];
        __ulTest.openModal("char", { id: c.id });
    });
    await page.waitForTimeout(300);
    ok("char gallery", !!(await page.$(".cgal")));
    await page.screenshot({ path: ENV.OUT + `/s_char_${W}.png` });
    // profile edit scope
    await ev(() => {
        __ulTest.closeModal();
        __ulTest.setMode("animanga");
    });
    await page.click('[data-act="profile-edit"]');
    await page.waitForTimeout(300);
    ok(
        "profile scope bar",
        !!(await page.$(".scopebar")),
        await ev(() => __ulTest.ui.modal!.mode + "/" + __ulTest.ui.modal!.scope)
    );
    await page.screenshot({ path: ENV.OUT + `/s_prof_${W}.png` });
    // delete keeps More open
    await ev(id => {
        __ulTest.closeModal();
        __ulTest.openItem(id);
    }, id);
    await page.waitForTimeout(200);
    await page.click("details.imore > summary");
    await page.waitForTimeout(100);
    await ev(() => document.querySelector(".modal")!.scrollTop);
    await page.click('[data-act="delete"]');
    await page.waitForTimeout(200);
    ok(
        "More stays open on delete",
        await ev(
            () =>
                document.querySelector<HTMLDetailsElement>("details.imore")!.open &&
                !!document.querySelector('[data-act="delete-yes"]')
        )
    );
    await page.screenshot({ path: ENV.OUT + `/s_del_${W}.png` });
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await browser.close();
})();
