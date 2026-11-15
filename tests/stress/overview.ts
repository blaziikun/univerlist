// Stress: the overview (every block at once) and the Learning Centre with big data (10,000 made-up items; 40 courses
// with long pathways and a curriculum of 20 programmes over 200 topics, made up too). How long the overview takes to
// draw and to catch up after a change, how long a burst of changes (covers arriving) takes, how long the Courses page,
// a course and Curricula take, and whether going round them leaves anything behind. Fails past the budget below.
import ENV from "../e2e/env.ts";
import { chromium } from "playwright";
import { setup } from "../e2e/mocks.ts";
import { ok, evaluator } from "../e2e/helpers.ts";
import type { Courses, Item } from "../../src/features/core/model";
const BUDGET = { overview: 900, change: 400, burst: 1000, courses: 400, course: 600, curricula: 4000 }; // ms (Curricula: about 2.7 s on the old HTML page too: it looks every set book up in your library)
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

    await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        const M = ["anime", "manga", "book", "film", "tv", "game", "comic", "novel"],
            S = ["active", "done", "want", "paused", "dnf", "done"],
            G = ["Drama", "Action", "Mystery", "Romance", "Fantasy", "Comedy", "Sci-Fi", "Horror"],
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
                total: 12 + (i % 40),
                prog: i % 12,
                copy: "none",
                notes: "",
                addedAt: day(i + 3),
                startedAt: status === "want" ? null : day(i),
                finishedAt: status === "done" ? day(i + 1) : null,
                source: "you",
                fav: i % 97 === 0,
                repeat: i % 50 === 0 ? 1 : 0,
                quotes: medium === "book" && i % 5 === 0 ? [{ text: "A line from item " + i, date: day(i) }] : [],
                log: [{ date: day(i), from: 0, to: 1, min: 30 }],
                series: medium === "book" && i % 3 === 0 ? "Saga " + (i % 200) : undefined,
                seriesNo: (i % 7) + 1,
                platform: medium === "game" ? "PC" : undefined,
            });
        }
        __ulTest.change("Add 10,000", Object.keys(add), (_, id) => add[id]);
        __ulTest.meta.queue = Object.keys(add)
            .filter((_, i) => i % 400 === 2)
            .slice(0, 20);
        // the Learning Centre: 40 courses, each with 300 books over 50 topics and four levels that wait on each other,
        // a degree of 60 modules over 4 years, and 20 programmes of 30 modules with their reading lists
        const courses: Courses["courses"] = [];
        for (let s = 0; s < 40; s++) {
            const id = "s" + s,
                books = [],
                modules = [],
                stages = [0, 1, 2, 3].map(y => ({ id: id + "y" + y, name: "Year " + (y + 1) })),
                topics = Array.from({ length: 50 }, (_, t) => ({
                    id: id + "t" + t,
                    name: "Topic " + t,
                    area: "Area " + (t % 8),
                }));
            for (let m = 0; m < 60; m++)
                modules.push({
                    id: id + "m" + m,
                    stage: stages[m % 4].id,
                    code: "C" + m,
                    name: "Module " + m,
                    credits: "15",
                    core: m % 3 > 0,
                    status: ["planned", "taking", "done"][m % 3],
                    grade: m % 3 === 2 ? "65" : "",
                    term: "",
                });
            for (let k = 0; k < 300; k++)
                books.push({
                    id: id + "b" + k,
                    t: "Reading " + k + " of " + s,
                    a: "Author " + (k % 37),
                    topic: id + "t" + (k % 50),
                    tops: k % 9 === 0 ? [id + "t" + ((k + 7) % 50)] : undefined,
                    lvl: 1 + (k % 4),
                    ord: k,
                    mod: id + "m" + (k % 60),
                    st: ["todo", "reading", "done"][k % 3],
                    after: k > 2 ? [{ k: id + "b" + (k - 3), s: k % 2 ? "done" : "start" }] : [],
                    opt: k % 11 === 0,
                    top: k % 50 === 0,
                });
            courses.push({
                id,
                name: "Course " + s,
                g: "C",
                fields: Object.fromEntries([0, 1, 2, 3, 4, 5].map(f => ["Field " + f, { lvl: f % 6 }])),
                order: [0, 1, 2, 3, 4, 5].map(f => "Field " + f),
                goal: 3,
                kind: s % 2 ? "arts" : "sci",
                degree: true,
                uni: "University " + s,
                stages,
                modules,
                topics,
                books,
                progs: Array.from({ length: s ? 0 : 20 }, (_, g) => ({
                    id: "g" + g,
                    uni: "Uni " + (g % 7),
                    name: "Programme " + g,
                    modules: Array.from({ length: 30 }, (_, m) => ({
                        name: "Module " + m,
                        core: m % 2 === 0,
                        topics: [id + "t" + ((g * 7 + m * 3) % 50), id + "t" + ((g + m * 11) % 50)],
                        books: [
                            ["Book " + ((g * 13 + m) % 400), "Author " + (m % 50)],
                            ["Reading " + m + " of 0", "Author " + (m % 37)],
                        ] as [string, string][],
                    })),
                })),
            });
        }
        __ulTest.meta.courses = { v: 3, courses, gone: {} };
        const md = __ulTest.curMode();
        md.blocks = Object.keys(__ulTest.BLOCKS)
            .filter(k => (__ulTest.BLOCKS[k].only ? __ulTest.BLOCKS[k].only(md) : true))
            .map(k => ({ k, w: __ulTest.BLOCKS[k].w, rows: __ulTest.BLOCKS[k].rows }));
        __ulTest.markDirty();
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "library";
        __ulTest.render();
    });
    await p.waitForTimeout(1500);

    // the overview with every block, drawn fresh from another tab: done by the time render() comes back
    const ov = await ev(() => {
        __ulTest.ui.tab = "library";
        __ulTest.render();
        const t = performance.now();
        __ulTest.ui.tab = "overview";
        __ulTest.render();
        return { ms: Math.round(performance.now() - t), n: document.querySelectorAll(".blocks .blk").length };
    });
    ok(
        `the overview with every block (${ov.n}) draws in under ${BUDGET.overview} ms`,
        ov.n > 20 && ov.ms < BUDGET.overview,
        ov.ms + " ms"
    );
    const ch = await ev(() => {
        const id = [...__ulTest.items.keys()][5];
        const t = performance.now();
        __ulTest.items.get(id)!.prog = (__ulTest.items.get(id)!.prog || 0) + 1;
        __ulTest.markDirty(id);
        __ulTest.render();
        return Math.round(performance.now() - t);
    });
    ok(`…catches up after a change in under ${BUDGET.change} ms`, ch < BUDGET.change, ch + " ms");
    const burst = await ev(async () => {
        const ids = [...__ulTest.items.keys()].slice(0, 300),
            t = performance.now();
        for (const id of ids) {
            __ulTest.items.get(id)!.coverChecked = true;
            __ulTest.markDirty(id);
            await Promise.resolve();
        }
        await new Promise(r => setTimeout(r, 0));
        __ulTest.render();
        return Math.round(performance.now() - t);
    });
    ok(
        `…and 300 changes one after another (covers arriving) in under ${BUDGET.burst} ms`,
        burst < BUDGET.burst,
        burst + " ms"
    );

    // set: what to put in ui first; tab: the page drawn
    const lc = (set: Partial<typeof __ulTest.ui>, tab = "learn") =>
        ev(
            ([set, tab]) => {
                __ulTest.setMode("academic");
                Object.assign(__ulTest.ui, set);
                __ulTest.ui.tab = "library";
                __ulTest.render();
                const t = performance.now();
                __ulTest.ui.tab = tab;
                __ulTest.render();
                return { ms: Math.round(performance.now() - t), drawn: !!document.querySelector(".learn, .curr") };
            },
            [set, tab]
        );
    let r = await lc({ lcHub: true, lcOpen: null });
    ok(`Courses with 40 courses draws in under ${BUDGET.courses} ms`, r.drawn && r.ms < BUDGET.courses, r.ms + " ms");
    r = await lc({ lcHub: false, learnSub: "s0", lcOpen: "s0m1" });
    ok(
        `a course with 300 books on its map, and a degree of 60 modules, draws in under ${BUDGET.course} ms`,
        r.drawn && r.ms < BUDGET.course,
        r.ms + " ms"
    );
    r = await lc({ learnSub: "s0" }, "curricula");
    ok(
        `Curricula with 20 programmes of 30 modules draws in under ${BUDGET.curricula} ms`,
        r.drawn && r.ms < BUDGET.curricula,
        r.ms + " ms"
    );
    const round = () =>
        ev(async () => {
            const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
            const R: [string, string, (string | null)?][] = [
                ["universal", "overview"],
                ["academic", "learn", "s0"],
                ["academic", "curricula"],
                ["academic", "learn", "s1"],
                ["universal", "library"],
            ];
            for (const [mode, tab, x] of R) {
                __ulTest.setMode(mode);
                if (x !== undefined) __ulTest.ui.learnSub = x;
                __ulTest.ui.tab = tab;
                __ulTest.render();
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
