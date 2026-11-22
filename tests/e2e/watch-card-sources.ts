// Watch from a card in your library asks extensions for exactly what a Watch search does (same title, season, episode and ids)
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { ExtRecord } from "../../src/features/extensions/extensions";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const p = await c.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await ev(() => {
        window.__ctx = [];
        __ulTest.EXT.list.push({
            manifest: { id: "fake", name: "Fake", permissions: ["watch.sources"] },
            data: {},
            on: true,
        } as ExtRecord); // cast: a stand-in extension, with only what Watch reads
        __ulTest.EXT.frames.set("fake", { jobs: new Set(["watch.sources"]) } as Parameters<
            typeof __ulTest.EXT.frames.set
        >[1]); // cast: a stand-in frame (extCall is replaced, so nothing is sent to it)
        __ulTest.extCall = async (_id, _job, args) => {
            window.__ctx.push(Object.assign({ path: window.__path }, args[0]));
            return [];
        };
        window.__id = __ulTest.addItem({
            medium: "anime",
            kind: "TV",
            title: "Bleach",
            year: 2004,
            ext: { anilist: 269 },
            total: 366,
        });
    });
    await ev(() => {
        window.__path = "card";
        __ulTest.watchFromItem(window.__id);
    });
    await p.waitForTimeout(3000);
    await ev(() => {
        __ulTest.W.player = null;
        __ulTest.renderPlayer();
        window.__path = "search";
        __ulTest.ui.page = "watch";
        __ulTest.render();
        __ulTest.watchOpen(
            { title: "Bleach", medium: "anime", kind: "TV", year: 2004, ext: { anilist: 269 } },
            { play: true }
        );
    });
    await p.waitForTimeout(3000);
    const C = await ev(() =>
        window.__ctx.map(c => ({
            path: c.path,
            title: c.title,
            st: c.seasonTitle,
            season: c.season,
            ep: c.episode,
            ids: c.ids,
            film: c.film,
        }))
    );
    const card = C.find(c => c.path === "card"),
        srch = C.find(c => c.path === "search"),
        strip = (x?: object) => x && JSON.stringify({ ...x, path: 0 });
    ok("extensions are asked from a card", !!card, JSON.stringify(C));
    ok("the card asks for the same thing as search", !!card && strip(card) === strip(srch), JSON.stringify(C));
    ok("no page errors", !errs.length, errs.join(" | "));
    await b.close();
})();
