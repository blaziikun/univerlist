// A show's seasons on its card: "+ Season" adds one to that show, and the seasonal chart's own add button (a
// different name) still adds the anime it's on. They once shared a name, and the chart's handler won.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import fs from "node:fs";
import path from "node:path";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const id = await ev(() => __ulTest.addItem({ medium: "tv", title: "Severance", status: "active" }));
    await ev(id => {
        __ulTest.openItem(id);
        __ulTest.patch(id, { bySeason: true }, "Seasons");
        __ulTest.renderOverlay();
    }, id);
    await p.waitForSelector('.modal [data-act="season-add"]');
    await p.click('.modal [data-act="season-add"]');
    await p.click('.modal [data-act="season-add"]');
    await p.waitForTimeout(150);
    const st = await ev(id => ({ n: (__ulTest.items.get(id)!.seasons || []).length, count: __ulTest.items.size }), id);
    ok('"+ Season" adds a season to the show', st.n === 2, JSON.stringify(st));
    ok("…and adds nothing else to the library", st.count === 1, JSON.stringify(st));
    // the seasonal chart: its page and its block on the overview
    const read = (f: string) =>
            fs.readFileSync(path.join(import.meta.dirname, "../../src/features/insights/pages", f), "utf8"),
        chart = ["SeasonalPage.svelte", "SeasonalMini.svelte"].map(read);
    ok(
        "the seasonal chart's add button has its own name",
        chart.every(c => c.includes('data-act="seasonal-add"') && !c.includes('data-act="season-add"'))
    );

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
