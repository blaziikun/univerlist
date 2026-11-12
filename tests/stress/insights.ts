// Stress: Insights and the mode pages beside it with a big library (10,000 made-up items, no export needed). How long
// Insights (with Your taste), This season, Series, Quotes, Diary and Playing take to draw, how long Discover takes to
// open, and whether going round them leaves anything behind. Prints the numbers, and fails past the budget below.
import ENV from "../e2e/env.ts";
import { chromium } from "playwright";
import { setup } from "../e2e/mocks.ts";
import { ok, evaluator } from "../e2e/helpers.ts";
import type { Item } from "../../src/features/core/model";
const BUDGET = { insights: 700, page: 400, discover: 400 }; // ms
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    const cdp = await c.newCDPSession(p);
    await cdp.send("Performance.enable");
    const measure = async () => {
        await cdp.send("HeapProfiler.collectGarbage");
        await p.waitForTimeout(300);
        await cdp.send("HeapProfiler.collectGarbage");
        const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(x => [x.name, x.value]));
        return { heap: m.JSHeapUsedSize, nodes: m.Nodes, listeners: m.JSEventListeners };
    };
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');

    // 10,000 items, most of them scored, with genres, themes, dates, quotes, series, logs and platforms, in one go
    await ev(() => {
        const M = ["anime", "manga", "book", "film", "tv", "game", "comic", "novel"],
            S = ["active", "done", "want", "paused", "dnf", "done"],
            G = ["Drama", "Action", "Mystery", "Romance", "Fantasy", "Comedy", "Sci-Fi", "Horror"],
            T = ["Detective", "School", "Revenge", "Magic", "Tragedy", "Time Travel"],
            day = (i: number) => new Date(Date.UTC(2015 + (i % 10), i % 12, 1 + (i % 27))).toISOString(),
            add: Record<string, Item> = {};
        for (let i = 0; i < 10000; i++) {
            const medium = M[i % M.length],
                status = S[i % S.length];
            add[__ulTest.newId("Item " + i, medium)] = __ulTest.migrateItem({
                medium,
                title: "Item " + i,
                status,
                rating: status === "want" ? 0 : 1 + (i % 10),
                year: 1980 + (i % 45),
                cover: `https://s4.anilist.co/cover/${i}.jpg`,
                genres: [G[i % 8], G[(i * 3) % 8]],
                themes: [T[i % 6], T[(i * 5) % 6]],
                kind: medium === "anime" ? "TV" : undefined,
                total: 12 + (i % 40),
                prog: i % 12,
                copy: "none",
                notes: "",
                addedAt: day(i + 3),
                startedAt: status === "want" ? null : day(i),
                finishedAt: status === "done" ? day(i + 1) : null,
                source: "you",
                series: medium === "book" && i % 3 === 0 ? "Saga " + (i % 200) : undefined,
                seriesNo: (i % 7) + 1,
                quotes: medium === "book" && i % 5 === 0 ? [{ text: "A line from item " + i, date: day(i) }] : [],
                log: medium === "film" ? [{ date: day(i), from: 0, to: 1 }] : [],
                platform: medium === "game" ? ["PC", "Switch", "PS5"][i % 3] : undefined,
            });
        }
        __ulTest.change("Add 10,000", Object.keys(add), (_, id) => add[id]);
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "library";
        __ulTest.render();
    });
    await p.waitForTimeout(1500);

    // each page drawn fresh from another tab: done by the time render() comes back, so the time is the whole draw
    const draw = (mode: string, tab: string) =>
        ev(
            ([mode, tab]) => {
                __ulTest.setMode(mode);
                const md = __ulTest.curMode();
                md.tabs = [...new Set([...(md.tabs || __ulTest.tabsFor(md)), "library", tab])];
                __ulTest.ui.tab = "library";
                __ulTest.render();
                const t = performance.now();
                __ulTest.ui.tab = tab;
                __ulTest.render();
                const ms = performance.now() - t;
                return {
                    ms: Math.round(ms),
                    drawn: !!document.querySelector(".tabbody .ph, .tabbody .empty, .tabbody .ihero"),
                };
            },
            [mode, tab]
        );
    const pages: [string, string, number][] = [
        ["universal", "discover", BUDGET.insights],
        ["animanga", "seasonal", BUDGET.page],
        ["novels", "series", BUDGET.page],
        ["novels", "quotes", BUDGET.page],
        ["screen", "diary", BUDGET.page],
        ["games", "playing", BUDGET.page],
    ];
    for (const [mode, tab, limit] of pages) {
        const r = await draw(mode, tab);
        ok(`${tab} (${mode}) draws in under ${limit} ms`, r.drawn && r.ms < limit, r.ms + " ms");
    }
    const again = await ev(() => {
        __ulTest.setMode("universal");
        __ulTest.ui.tab = "discover";
        __ulTest.render();
        const t = performance.now();
        __ulTest.render();
        return Math.round(performance.now() - t);
    });
    ok(`Insights drawn again in place in under ${BUDGET.insights} ms`, again < BUDGET.insights, again + " ms");
    const taste = await ev(() => !!document.querySelector(".taste .tgrid"));
    ok("…with Your taste read from the scores", taste);
    const disc = await ev(() => {
        const t = performance.now();
        __ulTest.openModal("discover", { mode: "versions" });
        const ms = performance.now() - t;
        __ulTest.closeModal();
        return Math.round(ms);
    });
    ok(`Discover opens in under ${BUDGET.discover} ms`, disc < BUDGET.discover, disc + " ms");

    // round the pages a few times: nothing kept once you've left them
    const round = () =>
        ev(async () => {
            const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
            for (const [mode, tab] of [
                ["universal", "discover"],
                ["novels", "series"],
                ["novels", "quotes"],
                ["screen", "diary"],
                ["games", "playing"],
                ["universal", "library"],
            ]) {
                __ulTest.setMode(mode);
                __ulTest.ui.tab = tab;
                __ulTest.render();
                await wait(60);
            }
            __ulTest.openModal("discover", { mode: "books" });
            await wait(40);
            __ulTest.closeModal();
            await wait(40);
        });
    await round();
    const first = await measure();
    for (let i = 0; i < 4; i++) await round();
    const after = await measure();
    ok(
        "four more rounds of the Insights pages add under 6 MB",
        after.heap - first.heap < 6e6,
        ((after.heap - first.heap) / 1048576).toFixed(1) + " MB"
    );
    ok(
        "…and leave no extra page elements or listeners behind",
        after.nodes <= first.nodes * 1.05 && after.listeners <= first.listeners * 1.05,
        `${first.nodes} → ${after.nodes} nodes, ${first.listeners} → ${after.listeners} listeners`
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
