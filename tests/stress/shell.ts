// Stress: the shell and Connections with a big library (10,000 made-up items, no export needed). How long a whole
// redraw takes (sidebar, top bar, profile header and the page), the sidebar on its own, a key typed in the search box,
// Favourites, Lists, a long list, Stats › Compare, Franchises and People, and Rank take to draw; how long a burst of
// 300 changes (covers arriving) takes with Insights or Favourites open; and whether going round them leaves anything
// behind. Prints the numbers, and fails past the budget below.
import ENV from "../e2e/env.ts";
import { chromium } from "playwright";
import { setup } from "../e2e/mocks.ts";
import { ok, evaluator } from "../e2e/helpers.ts";
import type { Item } from "../../src/features/core/model";
// Rank is a page like the others: its Seasons panel asks for every show's seasons, which watch-read's seasonChain finds
// through an index of the library made once per change (it used to go through all 10,000 for each show, about 2 s)
const BUDGET = { render: 400, side: 150, key: 150, page: 700, burst: 1500 }; // ms
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
    await p.waitForFunction(() => window.__ulTest?.booted);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');

    // 10,000 items (300 favourites, crowd scores, creators shared, linked in franchises), 60 characters, 40 lists (one
    // with 500 entries), a queue of 50, rankings
    await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        if (__ulTest.auto.ctl) __ulTest.auto.ctl.abort();
        __ulTest.auto.paused = true;
        const M = ["anime", "manga", "book", "film", "tv", "game", "comic", "novel"],
            S = ["active", "done", "want", "paused", "dnf", "done"],
            G = ["Drama", "Action", "Mystery", "Romance", "Fantasy", "Comedy", "Sci-Fi", "Horror"],
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
                total: 12 + (i % 40),
                prog: i % 12,
                copy: "none",
                source: "you",
                creator: "Maker " + (i % 700),
                fav: i % 33 === 0,
                scores: i % 2 ? { anilist: 40 + (i % 60) } : {},
                franchise: i % 9 === 0 ? "World " + (i % 300) : undefined,
                elo: i % 5 === 0 ? 1400 + (i % 300) : undefined,
                h2h: i % 5 === 0 ? 1 + (i % 7) : undefined,
                addedAt: new Date(Date.UTC(2020, i % 12, 1 + (i % 27))).toISOString(),
            });
        }
        __ulTest.change("Add 10,000", Object.keys(add), (_, id) => add[id]);
        const ids = Object.keys(add);
        __ulTest.meta.favOrder = ids.filter((_, i) => i % 33 === 0);
        __ulTest.meta.chars = Array.from({ length: 60 }, (_, i) => ({
            id: "c" + i,
            name: "Character " + i,
            gender: i % 2 ? "Female" : "Male",
            media: [{ id: ids[i * 7], title: "Item " + i * 7, medium: "anime" }],
            rank: i + 1,
        }));
        __ulTest.meta.lists = Array.from({ length: 40 }, (_, i) => ({
            id: "l" + i,
            name: "List " + i,
            desc: "",
            numbered: i % 2 === 0,
            mode: "",
            ids: ids.slice(i * 50, i * 50 + (i ? 30 : 500)),
            notes: {},
            created: new Date().toISOString(),
        }));
        __ulTest.meta.queue = ids.filter((_, i) => i % 200 === 1);
        __ulTest.markDirty();
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "library";
        __ulTest.render();
    });
    await p.waitForTimeout(1500);

    // the whole app drawn again, and the sidebar on its own (pinned, every section shown)
    const whole = await ev(() => {
        __ulTest.meta.layout.side.pinned = true;
        __ulTest.meta.layout.side.hide = [];
        __ulTest.ui.tab = "library";
        __ulTest.render();
        const t = performance.now();
        __ulTest.render();
        return Math.round(performance.now() - t);
    });
    ok(
        `the whole app drawn again (sidebar, top bar, header, the library) in under ${BUDGET.render} ms`,
        whole < BUDGET.render,
        whole + " ms"
    );
    const side = await ev(() => {
        const t = performance.now();
        for (let i = 0; i < 5; i++) __ulTest.renderSide();
        return {
            ms: Math.round((performance.now() - t) / 5),
            lists: document.querySelectorAll('#side [data-act="go-list"]').length,
        };
    });
    ok(
        `the sidebar drawn again in under ${BUDGET.side} ms`,
        side.ms < BUDGET.side && side.lists === 41,
        side.ms + " ms"
    );
    // a key typed in the search box (offline: the library's results only)
    await c.setOffline(true);
    await ev(() => __ulTest.focusSearch());
    const key = await ev(() => {
        const box = document.querySelector<HTMLInputElement>("#gq"),
            ms = [];
        for (const q of ["i", "it", "ite", "item", "item 1", "item 12"]) {
            box!.value = q;
            const t = performance.now();
            box!.dispatchEvent(new Event("input", { bubbles: true }));
            ms.push(performance.now() - t);
        }
        return { ms: Math.round(Math.max(...ms)), rows: document.querySelectorAll("#gsres [data-gs]").length };
    });
    ok(
        `each key typed in the search box shows its results in under ${BUDGET.key} ms`,
        key.ms < BUDGET.key && key.rows > 3,
        key.ms + " ms, " + key.rows + " rows"
    );
    const keys = await ev(() => {
        const box = document.querySelector("#gq"),
            t = performance.now();
        for (let i = 0; i < 10; i++)
            box!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        return Math.round((performance.now() - t) / 10);
    });
    ok(`…and ↓ moves the mark in under ${BUDGET.key} ms`, keys < BUDGET.key, keys + " ms");
    await ev(() => __ulTest.closeSearch());
    await c.setOffline(false);

    // each page drawn fresh from another tab: done by the time render() comes back
    const draw = (set: Partial<typeof __ulTest.ui>) =>
        ev(set => {
            __ulTest.ui.tab = "library";
            __ulTest.ui.listId = null;
            __ulTest.render();
            Object.assign(__ulTest.ui, set);
            const t = performance.now();
            __ulTest.render();
            return {
                ms: Math.round(performance.now() - t),
                drawn: document.querySelector(".tabbody")!.children.length > 1,
            };
        }, set);
    const P: [string, Partial<typeof __ulTest.ui>][] = [
        ["Favourites (300, and 60 characters)", { tab: "favourites" }],
        ["Lists (40)", { tab: "lists" }],
        ["a list of 500", { tab: "lists", listId: "l0" }],
        ["Up next", { tab: "lists", listId: "queue" }],
        ["Stats › Compare", { tab: "stats", statsView: "compare" }],
        ["Stats › Franchises", { tab: "stats", statsView: "franchises" }],
        ["Stats › People", { tab: "stats", statsView: "people", peopleAll: true }],
        ["Rank", { tab: "rank", seasonsOpen: true }],
    ];
    for (const [name, set] of P) {
        const r = await draw(set);
        ok(`${name} draws in under ${BUDGET.page} ms`, r.drawn && r.ms < BUDGET.page, r.ms + " ms");
    }
    // 300 changes one after another (covers arriving), with a page that works a lot out from the whole library open
    for (const [name, tab] of [
        ["Insights", "discover"],
        ["Favourites", "favourites"],
    ]) {
        const burst = await ev(async tab => {
            __ulTest.ui.statsView = "charts";
            __ulTest.ui.tab = tab;
            __ulTest.render();
            const ids = [...__ulTest.items.keys()].slice(0, 300),
                t = performance.now();
            for (const id of ids) {
                __ulTest.items.get(id)!.coverChecked = !__ulTest.items.get(id)!.coverChecked;
                __ulTest.markDirty(id);
                await Promise.resolve();
            }
            await new Promise(r => setTimeout(r, 0));
            __ulTest.render();
            await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
            return Math.round(performance.now() - t);
        }, tab);
        ok(
            `300 changes one after another with ${name} open take under ${BUDGET.burst} ms`,
            burst < BUDGET.burst,
            burst + " ms"
        );
    }

    // round the pages a few times: nothing kept once you've left them
    const round = () =>
        ev(async () => {
            const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
            const R: [string, (string | null)?][] = [
                ["favourites"],
                ["lists", "l0"],
                ["lists", null],
                ["stats", "compare"],
                ["stats", "people"],
                ["rank"],
                ["library"],
            ];
            for (const [tab, x] of R) {
                __ulTest.ui.tab = tab;
                if (tab === "lists") __ulTest.ui.listId = x;
                if (tab === "stats" && x) __ulTest.ui.statsView = x;
                __ulTest.render();
                __ulTest.focusSearch();
                __ulTest.closeSearch();
                await wait(60);
            }
        });
    await round();
    const first = await measure();
    for (let i = 0; i < 4; i++) await round();
    const after = await measure();
    ok(
        "four more rounds of these pages add under 6 MB",
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
