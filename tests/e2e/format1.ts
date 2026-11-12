// An export in the oldest layout (everything under data/) imports whole: library, favourites, lists, preferences, themes, profile. (Its old academic part comes into the Learning Centre as a path.)
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await p.setInputFiles("#file-import", ENV.FIX + "/format1.zip");
    await p.waitForSelector('[data-act="import-replace"]');
    const parts = await p.evaluate(() =>
        [...document.querySelectorAll(".part")].map(x => x.querySelector("b")!.innerText)
    );
    ok(
        "every part is offered",
        ["Library", "Favourites & characters", "Lists", "Preferences", "Themes", "Profile"].every(n =>
            parts.includes(n)
        ) && parts.includes("Learning Centre"),
        parts.join(", ")
    );
    await p.click('[data-act="import-replace"]');
    await p.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 60000 });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => ({
        n: __ulTest.items.size,
        fav: __ulTest.meta.favOrder.length,
        queue: __ulTest.meta.queue.length,
        lists: __ulTest.meta.lists.length,
        prog:
            __ulTest.meta.courses.v === 2
                ? __ulTest.meta.courses.paths.length
                : JSON.stringify(__ulTest.meta.courses).slice(0, 80),
        theme: !!(__ulTest.meta.themes || {}).mine,
        name: (__ulTest.meta.profile || {}).name,
    }));
    ok(
        "everything came in",
        r.n === 4 && r.fav === 1 && r.queue === 1 && r.lists >= 1 && r.prog === 1 && r.theme && r.name === "Test",
        JSON.stringify(r)
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
})();
