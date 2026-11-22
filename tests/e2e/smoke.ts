// The basics, with no personal data (so it can run anywhere, including on GitHub):
// opens, adds things, exports, and a fresh browser imports that export back.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import fs from "node:fs";
import { ok } from "./helpers.ts";
(async () => {
    const errs: string[] = []; // either page's
    const browser = await chromium.launch(ENV.launch);
    const open = async () => {
        const ctx = await browser.newContext({ acceptDownloads: true });
        await setup(ctx);
        const p = await ctx.newPage();
        p.on("pageerror", e => errs.push(e.message));
        await p.goto(ENV.APP);
        await p.waitForTimeout(800);
        await p.fill("#wl-name", "Test");
        await p.click('[data-act="welcome-done"]');
        return p;
    };
    const a = await open();
    ok(
        "opens",
        await a.evaluate(
            () => typeof __ulTest.items === "object" && document.querySelector("#main")!.children.length > 0
        )
    );
    await a.evaluate(() => {
        __ulTest.addItem({ medium: "anime", title: "Frieren", status: "done", rating: 10 });
        __ulTest.addItem({ medium: "book", title: "Dune", creator: "Frank Herbert", status: "active" });
        __ulTest.addItem({ medium: "game", title: "Hades", platform: "Switch" });
    });
    ok("adds", (await a.evaluate(() => __ulTest.items.size)) === 3);
    await a.evaluate(() => __ulTest.goSettings("io"));
    await a.waitForTimeout(300);
    const [dl] = await Promise.all([
        a.waitForEvent("download", { timeout: 60000 }),
        a.click('[data-act="export-open"]').then(() => a.click('.modal [data-act="export-zip"]')),
    ]);
    const zip = ENV.OUT + "/smoke-export.zip";
    await dl.saveAs(zip);
    ok(
        "exports a zip",
        fs.statSync(zip).size > 500 && /^profile-export_.+_\d{4}-\d\d-\d\d\.zip$/.test(dl.suggestedFilename()),
        dl.suggestedFilename()
    );
    const b = await open();
    await b.setInputFiles("#file-import", zip);
    await b.waitForSelector('[data-act="import-replace"]');
    await b.click('[data-act="import-replace"]');
    await b.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 60000 });
    await b.waitForTimeout(500);
    ok(
        "imports it back",
        (await b.evaluate(() =>
            [...__ulTest.items.values()]
                .map(x => x.title)
                .sort()
                .join()
        )) === "Dune,Frieren,Hades"
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
