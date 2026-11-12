// The overview, Stats and tier lists, drawn by Svelte, and the last two dialogs that moved: the overview's blocks in every
// mode, adding, removing (and undoing), resizing and dragging them into place, the quick log, Next up's suggestions, a
// chart drawn each way; Stats' views and its own blocks; a tier list's tiers, selecting, sending, dragging, the box you
// drag around several, keys and quick rank; adjusting a picture; a show's servers.
// What it once got wrong: a redraw from elsewhere (covers arriving, a sync) emptied the quick log's box while you typed
// in it, a column chart's tooltip showed "&amp;" for a genre with "&" in it, and Stats › Log put a session's lane (from
// a backup or an import) into the page as HTML.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await p.waitForTimeout(200);

    ok(
        "with nothing in it, the overview welcomes you",
        await ev(() => {
            __ulTest.goTab("overview");
            return /Welcome|Nothing in/.test(document.querySelector(".empty.hello h3")!.textContent);
        })
    );
    const ids = await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        const a = __ulTest.addItem({
            medium: "anime",
            title: "Lantern Signal",
            status: "active",
            total: 12,
            prog: 3,
            genres: ["Drama", "Rock & Roll"],
            rating: 8,
        });
        const f = __ulTest.addItem({
            medium: "film",
            title: "Quiet Harbour",
            status: "done",
            finishedAt: new Date().toISOString(),
            genres: ["Drama"],
            rating: 7,
        });
        const w = __ulTest.addItem({ medium: "book", title: "Paper Comet", status: "want", genres: ["Rock & Roll"] });
        __ulTest.addItem({ medium: "film", title: "Slow Afternoon", status: "paused", genres: ["Drama"] }); // paused: Next up suggests it
        __ulTest.items.get(a)!.genres = ["Drama", "Rock & Roll"];
        __ulTest.items.get(w)!.genres = ["Rock & Roll"]; // as an import can bring them
        __ulTest.meta.queue = [w];
        __ulTest.markDirty();
        __ulTest.render();
        return { a, f, w };
    });
    await p.waitForTimeout(200);
    const st = await ev(() => ({
        svelte: document.querySelector(".tabbody")!.hasAttribute("data-svelte"),
        blocks: [...document.querySelectorAll<HTMLElement>(".blocks .blk")].map(x => x.dataset.bk),
    }));
    ok(
        "the overview is drawn by Svelte, with the mode's default blocks",
        st.svelte && st.blocks[0] === "summary" && st.blocks.includes("nextup") && st.blocks.includes("health"),
        JSON.stringify(st)
    );
    await p.waitForTimeout(800); // the numbers count up the first time
    const st2 = await ev(() =>
        [...document.querySelectorAll(".sumtiles .tile .v")]
            .slice(0, 3)
            .map(x => x.textContent)
            .join()
    );
    ok("…the summary counts what's there (counting up the first time)", st2 === "4,1,1", st2);
    for (const m of ["animanga", "novels", "screen", "games"]) {
        await ev(m => {
            __ulTest.setMode(m);
            __ulTest.goTab("overview");
        }, m);
        await p.waitForTimeout(150);
        ok(
            `…and in ${m}, its own`,
            await ev(
                () => document.querySelectorAll(".blocks .blk").length > 3 || !!document.querySelector(".empty.hello")
            )
        );
    }
    await ev(() => {
        __ulTest.setMode("universal");
        __ulTest.goTab("overview");
    });
    await p.waitForTimeout(150);

    // adding, removing and undoing, resizing
    await p.click('[data-act="blk-addopen"]');
    await p.waitForSelector(".blkpick");
    await p.click('.blkopt[data-k="quote"]');
    await p.waitForTimeout(200);
    const st3 = await ev(() => ({
        last: [...document.querySelectorAll<HTMLElement>(".blocks .blk")].pop()!.dataset.bk,
        own: /own/.test(document.querySelector(".blksrc")!.textContent),
        picker: !!document.querySelector(".blkpick"),
    }));
    ok(
        '"+ Add a block" adds it at the end, and the layout is the mode\'s own',
        st3.last === "quote" && st3.own && !st3.picker,
        JSON.stringify(st3)
    );
    const n = await ev(() => document.querySelectorAll(".blocks .blk").length);
    await ev(() => document.querySelector<HTMLElement>('.blk[data-bk="quote"] [data-act="blk-del"]')!.click());
    await p.waitForTimeout(150);
    ok(
        "− removes it",
        await ev(
            n =>
                document.querySelectorAll(".blocks .blk").length === n - 1 &&
                !document.querySelector('.blk[data-bk="quote"]'),
            n
        )
    );
    await p.click(".toast button");
    await p.waitForTimeout(150);
    ok("…and Undo brings it back", await ev(() => !!document.querySelector('.blk[data-bk="quote"]')));
    await ev(() => {
        const i = __ulTest.blocksOf(__ulTest.curMode()).findIndex(x => x.k === "quote");
        document.querySelector<HTMLElement>(`.blk[data-bi="${i}"] [data-act="blk-menu"]`)!.click();
    });
    await p.waitForSelector('#ctx [data-act="blk-w"]');
    await p.click('#ctx [data-act="blk-w"][data-w="12"]');
    await p.waitForTimeout(150);
    ok(
        "the block's menu sets its width",
        await ev(() => document.querySelector('.blk[data-bk="quote"]')!.classList.contains("w12"))
    );
    await ev(() => __ulTest.closeCtx());

    // dragging into place, while arranging
    await p.click('[data-act="blk-edit"]');
    await p.waitForTimeout(150);
    ok(
        "Arrange makes the blocks draggable",
        await ev(
            () =>
                document.querySelector(".blocks")!.classList.contains("editing") &&
                document.querySelector(".blk")!.getAttribute("draggable") === "true" &&
                !!document.querySelector(".bdrag")
        )
    );
    const before = await ev(() => __ulTest.blocksOf(__ulTest.curMode()).map(x => x.k));
    await p.dragAndDrop('.blk[data-bi="0"] .bh', '.blk[data-bi="2"] .bh');
    await p.waitForTimeout(200);
    const st4 = await ev(() => ({
        order: __ulTest.blocksOf(__ulTest.curMode()).map(x => x.k),
        drawn: [...document.querySelectorAll<HTMLElement>(".blocks .blk")].map(x => x.dataset.bk),
        marks: document.querySelectorAll(".blk.drag, .blk.over").length,
    }));
    ok(
        "a block dragged onto another takes its place",
        st4.order[2] === before[0] && st4.order[0] === before[1] && st4.drawn.join() === st4.order.join() && !st4.marks,
        JSON.stringify({ before, st: st4 })
    );
    await p.click('[data-act="blk-edit"]');
    await p.waitForTimeout(100);
    ok(
        "…and Done arranging stops it",
        await ev(
            () =>
                !document.querySelector(".blocks.editing") &&
                document.querySelector(".blk")!.getAttribute("draggable") === "false"
        )
    );
    await ev(() => {
        __ulTest.curMode().blocks = null;
        __ulTest.markDirty();
        __ulTest.renderMain();
    });
    await p.waitForTimeout(150);

    // the quick log keeps what you type while the page redraws, and logs a finish
    await ev(() => {
        __ulTest.curMode().blocks = [
            { k: "quicklog", w: 6 },
            { k: "nextup", w: 6, n: 3 },
            { k: "genres", w: 6, type: "cols" },
        ];
        __ulTest.markDirty();
        __ulTest.renderMain();
    });
    await p.waitForTimeout(200);
    await p.fill("#ql-q", "Paper");
    await ev(() => {
        __ulTest.markDirty();
        __ulTest.renderMain();
    });
    await p.waitForTimeout(150);
    ok(
        "a redraw keeps what you typed in the quick log",
        await ev(() => document.querySelector<HTMLInputElement>("#ql-q")!.value === "Paper")
    );
    await p.click('[data-act="ql-log"]');
    await p.waitForTimeout(150);
    ok(
        "…Log with nothing picked says so",
        await ev(() => /Pick something/.test((document.querySelector(".toast") || {}).textContent || ""))
    );
    const opt = await ev(() =>
        [...document.querySelectorAll<HTMLInputElement>("#ql-opts option")]
            .map(o => o.value)
            .find(v => v.startsWith("Paper Comet"))
    );
    await p.fill("#ql-q", opt!);
    await p.click('[data-act="ql-log"]');
    await p.waitForTimeout(200);
    ok(
        "…and logs a finish of what's picked, then empties",
        await ev(
            w =>
                __ulTest.items.get(w)!.status === "done" &&
                document.querySelector<HTMLInputElement>("#ql-q")!.value === "",
            ids.w
        )
    );
    await ev(w => {
        __ulTest.items.get(w)!.status = "want";
        __ulTest.meta.queue = [];
        __ulTest.markDirty(w);
        __ulTest.renderMain();
    }, ids.w);
    await p.waitForTimeout(150);
    await ev(
        () =>
            document.querySelector('.blk[data-bk="nextup"] [data-act="q-add"]') &&
            document.querySelector<HTMLElement>('.blk[data-bk="nextup"] [data-act="q-add"]')!.click()
    );
    await p.waitForTimeout(150);
    ok(
        "Next up's + puts a suggestion in your queue, and it moves up",
        await ev(
            () =>
                __ulTest.meta.queue.length === 1 &&
                document.querySelectorAll('.blk[data-bk="nextup"] .qi').length === 1 &&
                /Slow Afternoon/.test(document.querySelector('.blk[data-bk="nextup"] .qi')!.textContent)
        )
    );
    const st5 = await ev(() =>
        [...document.querySelectorAll<HTMLElement>('.blk[data-bk="genres"] .cols > span')].map(s => s.title)
    );
    ok(
        'a column chart\'s tooltip shows a genre with "&" as it is',
        st5.some(t => /^Rock & Roll: \d+$/.test(t)),
        JSON.stringify(st5)
    );
    for (const t of ["bars", "donut", "list"]) {
        await ev(t => {
            __ulTest.curMode().blocks![2].type = t;
            __ulTest.markDirty();
            __ulTest.renderMain();
        }, t);
        await p.waitForTimeout(100);
        ok(
            `…and the chart draws as ${t}`,
            await ev(
                t =>
                    !!document.querySelector(
                        `.blk[data-bk="genres"] ${{ bars: ".hbars", donut: ".donut", list: "table.ranked" }[t]}`
                    ),
                t
            )
        );
    }
    // a block that fails draws a note, not a blank page
    await ev(() => {
        __ulTest.BLOCKS.broken = {
            name: "Broken",
            d: "",
            w: 4,
            chart: () => {
                throw new Error("test");
            },
        };
        __ulTest.curMode().blocks = [
            { k: "summary", w: 12 },
            { k: "broken", w: 4 },
        ];
        __ulTest.markDirty();
        __ulTest.renderMain();
    });
    await p.waitForTimeout(150);
    ok(
        "a block that fails says so, and the rest still draw",
        await ev(
            () =>
                /couldn't load/.test(document.querySelector('.blk[data-bk="broken"]')!.textContent) &&
                !!document.querySelector(".sumtiles")
        )
    );
    await ev(() => {
        delete __ulTest.BLOCKS.broken;
        __ulTest.curMode().blocks = null;
        __ulTest.markDirty();
        __ulTest.renderMain();
    });

    // ---- Stats: every view, finished only, its blocks arranged like the overview's ----
    await ev(() => {
        __ulTest.setMode("universal");
        __ulTest.ui.statsView = "charts";
        __ulTest.goTab("stats");
    });
    await p.waitForTimeout(250);
    const st6 = await ev(() => ({
        svelte: document.querySelector(".tabbody")!.hasAttribute("data-svelte"),
        blocks: [...document.querySelectorAll<HTMLElement>('.blocks[data-bkind="st"] .blk')].map(x => x.dataset.bk),
        tiles: [...document.querySelectorAll('.blk[data-bk="tiles"] .tile .v')].map(x => x.textContent),
    }));
    ok(
        "Stats is drawn by Svelte, with its blocks",
        st6.svelte &&
            st6.blocks[0] === "tiles" &&
            st6.blocks.includes("month") &&
            st6.blocks.includes("heat") &&
            st6.tiles[0] === "4",
        JSON.stringify(st6)
    );
    await p.click('[data-act="stats-basis"][data-k="done"]');
    await p.waitForTimeout(150);
    ok(
        '…"Finished only" counts only what\'s finished',
        await ev(
            () =>
                document.querySelector('.blk[data-bk="tiles"] .tile .v')!.textContent === "1" &&
                document.querySelector('[data-act="stats-basis"][data-k="done"]')!.getAttribute("aria-pressed") ===
                    "true"
        )
    );
    await p.click('[data-act="stats-basis"][data-k="all"]');
    await p.waitForTimeout(100);
    await ev(() =>
        document
            .querySelector<HTMLElement>('.blocks[data-bkind="st"] .blk[data-bk="genres"] [data-act="blk-del"]')!
            .click()
    );
    await p.waitForTimeout(150);
    ok(
        "…a stats block can be removed, and the overview's layout is left alone",
        await ev(
            () =>
                !document.querySelector('.blk[data-bk="genres"]') &&
                !(__ulTest.curMode().blocks || []).length &&
                __ulTest.curMode().statBlocks!.every(b => b.k !== "genres")
        )
    );
    await p.click('[data-act="blk-edit"][data-bkind="st"]');
    await p.waitForTimeout(100);
    const sb = await ev(() => __ulTest.blocksOf(__ulTest.curMode(), "st").map(x => x.k));
    await p.dragAndDrop(
        '.blocks[data-bkind="st"] .blk[data-bi="1"] .bh',
        '.blocks[data-bkind="st"] .blk[data-bi="0"] .bh'
    );
    await p.waitForTimeout(200);
    ok(
        "…and dragged into place",
        await ev(sb => {
            const now = __ulTest.blocksOf(__ulTest.curMode(), "st").map(x => x.k);
            return now[0] === sb[1] && now[1] === sb[0];
        }, sb)
    );
    await ev(() => {
        __ulTest.ui.blocksEdit = null;
        __ulTest.curMode().statBlocks = null;
        __ulTest.markDirty();
    });
    for (const [k, sel] of [
        ["wrapped", ".wrapped"],
        ["taste", ".taste"],
        ["compare", ".chart.scatter, .dash"],
        ["franchises", ".ph, .empty"],
        ["people", ".ph, .empty, .people"],
        ["log", ".sessions, .empty"],
        ["dupes", ".ph"],
    ]) {
        await p.click(`[data-act="stats-view"][data-k="${k}"]`);
        await p.waitForTimeout(150);
        ok(
            `Stats › ${k} draws`,
            await ev(
                ([k, sel]) =>
                    __ulTest.ui.statsView === k &&
                    !!document.querySelector(".tabbody " + sel.split(", ").join(", .tabbody ")),
                [k, sel]
            )
        );
    }
    await p.click('[data-act="stats-view"][data-k="wrapped"]');
    await p.waitForTimeout(150);
    await ev(a => {
        const it = __ulTest.items.get(a);
        it!.log = [
            ...(it!.log || []),
            { date: new Date().toISOString(), from: 3, to: 4, lane: '<img src=x onerror="window.__laned=1">Side B' },
        ];
        __ulTest.markDirty(a);
        __ulTest.ui.statsView = "log";
        __ulTest.render();
    }, ids.a);
    await p.waitForTimeout(300);
    ok(
        "Stats › Log shows a session's lane as text, never as part of the page",
        await ev(
            () =>
                !document.querySelector(".sessions img") &&
                !window.__laned &&
                [...document.querySelectorAll(".sessions span")].some(x => x.textContent.includes("<img src=x"))
        )
    );
    await p.click('[data-act="stats-view"][data-k="wrapped"]');
    await p.waitForTimeout(150);
    const yrs = await ev(() =>
        [...document.querySelectorAll<HTMLElement>('[data-act="wrap-year"]')].map(b => b.dataset.k)
    );
    ok(
        "Year in review shows this year, with its numbers",
        yrs.length >= 1 &&
            (await ev(
                () =>
                    /1 finished/.test(document.querySelector(".whero h2")!.textContent) &&
                    !!document.querySelector(".wrapped .hbars")
            ))
    );
    await ev(() => {
        __ulTest.addItem({ medium: "film", title: "Quiet Harbour", status: "want" });
        __ulTest.ui.statsView = "dupes";
        __ulTest.render();
    });
    await p.waitForTimeout(150);
    await ev(() => document.querySelector<HTMLElement>('[data-act="dup-keep"]')!.click());
    await p.waitForTimeout(200);
    ok(
        'Duplicates: "Keep this one" folds the other in',
        await ev(
            () =>
                [...__ulTest.items.values()].filter(b => b.title === "Quiet Harbour").length === 1 &&
                /No duplicates/.test(document.querySelector(".tabbody")!.textContent)
        )
    );
    await ev(() => {
        __ulTest.ui.statsView = "charts";
        __ulTest.render();
    });

    // ---- a tier list ----
    const L = await ev(() => {
        const id = __ulTest.newTierList({ name: "My tiers", onlyDone: false });
        __ulTest.setMode("universal");
        __ulTest.goTab("lists");
        __ulTest.ui.listId = id;
        __ulTest.render();
        return id;
    });
    await p.waitForTimeout(250);
    const st7 = await ev(() => ({
        svelte: document.querySelector(".tabbody")!.hasAttribute("data-svelte"),
        rows: document.querySelectorAll(".trow").length,
        pool: document.querySelectorAll(".tpool [data-tkey]").length,
    }));
    ok(
        "a tier list is drawn by Svelte: its tiers and everything unplaced",
        st7.svelte && st7.rows >= 4 && st7.pool >= 4,
        JSON.stringify(st7)
    );
    await p.click(`.tpool [data-tkey="${ids.a}"]`);
    await p.click(`.tpool [data-tkey="${ids.f}"]`, { modifiers: ["Shift"] });
    await p.waitForTimeout(150);
    const st8 = await ev(() => ({
        n: __ulTest.tierSel.size,
        bar: (document.querySelector(".tselbar b") || {}).textContent,
    }));
    ok(
        "click and Shift-click select a run, and say how many",
        st8.n >= 2 && /selected/.test(st8.bar!),
        JSON.stringify(st8)
    );
    await p.keyboard.press("1");
    await p.waitForTimeout(150);
    ok(
        "…1 sends them to the first tier",
        await ev(
            ([L, a]) => __ulTest.meta.lists.find(l => l.id === L)!.rows![0].ids.includes(a) && !__ulTest.tierSel.size,
            [L, ids.a]
        )
    );
    await p.dragAndDrop(`.trow[data-trow="0"] [data-tkey="${ids.a}"]`, '.trow[data-trow="2"] .tzone');
    await p.waitForTimeout(200);
    const st9 = await ev(
        ([L, a]) => ({
            in2: __ulTest.meta.lists.find(l => l.id === L)!.rows![2].ids.includes(a),
            marks: document.querySelectorAll(".tierboard .over, .tierboard .drag").length,
        }),
        [L, ids.a]
    );
    ok(
        "an entry dragged to another tier moves there, and nothing stays marked",
        st9.in2 && !st9.marks,
        JSON.stringify(st9)
    );
    await p.setViewportSize({ width: 1280, height: 1800 });
    await p.waitForTimeout(150); // all of the board on screen
    const hb = await (await p.$(".tpool h3"))!.boundingBox(),
        zb = await (await p.$(".tpool .tzone"))!.boundingBox();
    await p.mouse.move(hb!.x + 3, hb!.y + hb!.height / 2);
    await p.mouse.down();
    await p.mouse.move(zb!.x + zb!.width - 2, zb!.y + zb!.height - 2, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    ok(
        "a box dragged around the unplaced selects them",
        await ev(() => __ulTest.tierSel.size >= 1 && !document.querySelector(".marq") && !document.querySelector(".mq"))
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    await p.setViewportSize({ width: 1280, height: 900 });
    ok("…Esc clears the selection", await ev(() => !__ulTest.tierSel.size && !document.querySelector(".tselbar")));
    await p.fill('[data-tllabel="1"]', "Great");
    await p.press('[data-tllabel="1"]', "Enter");
    await p.waitForTimeout(150);
    ok(
        "a tier is renamed in place",
        await ev(L => __ulTest.meta.lists.find(l => l.id === L)!.rows![1].label === "Great", L)
    );
    await p.fill("#tier-q", "Paper");
    await p.press("#tier-q", "Tab");
    await p.waitForTimeout(150);
    ok(
        "the unplaced are filtered",
        await ev(
            () =>
                [...document.querySelectorAll<HTMLElement>(".tpool [data-tkey]")].every(c => /Paper/.test(c.title)) &&
                __ulTest.ui.tierQ === "Paper"
        )
    );
    await p.fill("#tier-q", "");
    await p.press("#tier-q", "Tab");
    await p.waitForTimeout(100);
    await ev(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await p.keyboard.press("q");
    await p.waitForTimeout(150);
    ok("Q starts quick rank", await ev(() => !!document.querySelector(".tquick")));
    const first = await ev(() => document.querySelector(".tquick b")!.textContent);
    await p.keyboard.press("2");
    await p.waitForTimeout(150);
    ok(
        "…a number places the one shown, and the next comes up",
        await ev(
            ([L, f]) => {
                const T = __ulTest.meta.lists.find(l => l.id === L);
                return (
                    T!.rows![1].ids.some(k => __ulTest.titleOf(__ulTest.items.get(k)!) === f) &&
                    (!document.querySelector(".tquick") || document.querySelector(".tquick b")!.textContent !== f)
                );
            },
            [L, first]
        )
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok("…and Esc stops it", await ev(() => !document.querySelector(".tquick") && !__ulTest.ui.tquick));
    await p.click('[data-act="tl-layout"][data-k="rank"]');
    await p.waitForTimeout(150);
    ok(
        "Ranked shows one numbered column",
        await ev(
            () =>
                document.querySelectorAll(".rankboard .rkrow").length >= 2 &&
                document.querySelector(".rankboard .rkn")!.textContent === "1"
        )
    );
    await p.click('[data-act="tl-layout"][data-k="tiers"]');
    await p.waitForTimeout(100);
    await ev(() => {
        __ulTest.ui.listId = null;
        __ulTest.render();
    });
    await p.waitForTimeout(100);
    ok(
        "back on Lists, the lists are drawn (by Svelte too)",
        await ev(
            () =>
                document.querySelector(".tabbody")!.hasAttribute("data-svelte") &&
                !!document.querySelector(".frgrid .lcard") &&
                !document.querySelector(".tierboard")
        )
    );

    // ---- adjusting a picture ----
    await ev(f => {
        const c = document.createElement("canvas");
        c.width = 300;
        c.height = 200;
        const g = c.getContext("2d");
        g!.fillStyle = "#c83";
        g!.fillRect(0, 0, 300, 200);
        g!.fillStyle = "#38c";
        g!.fillRect(100, 50, 100, 100);
        __ulTest.openFrame(c.toDataURL("image/png"), { t: "cover", id: f });
    }, ids.f); // a picture of our own: nothing to fetch
    await p.waitForSelector("#fimg");
    await p.waitForFunction(() => document.querySelector("#fimg")!.getAttribute("style"));
    const st10 = await ev(() => ({
        svelte: document.querySelector("#overlay .modal")!.hasAttribute("data-svelte"),
        w: parseFloat(document.querySelector<HTMLElement>("#fimg")!.style.width),
        vw: document.querySelector("#fview")!.clientWidth,
    }));
    ok(
        "Adjust a picture is drawn by Svelte, the picture covering the frame",
        st10.svelte && st10.w >= st10.vw - 1,
        JSON.stringify(st10)
    );
    await p.fill("#fzoom", "2");
    await p.dispatchEvent("#fzoom", "input");
    await p.waitForTimeout(100);
    const st11 = await ev(() => ({
        z: __ulTest.ui.modal!.z,
        w: parseFloat(document.querySelector<HTMLElement>("#fimg")!.style.width),
        vw: document.querySelector("#fview")!.clientWidth,
    }));
    ok("…the slider zooms", st11.z === 2 && st11.w >= st11.vw * 1.9, JSON.stringify(st11));
    const fv = await (await p.$("#fview"))!.boundingBox();
    await p.mouse.move(fv!.x + fv!.width / 2, fv!.y + fv!.height / 2);
    await p.mouse.down();
    await p.mouse.move(fv!.x + fv!.width / 2 + 40, fv!.y + fv!.height / 2 + 10, { steps: 4 });
    await p.mouse.up();
    await p.waitForTimeout(100);
    ok("…dragging moves it", await ev(() => __ulTest.ui.modal!.x! > 0));
    await p.mouse.move(fv!.x + 20, fv!.y + 20);
    await p.mouse.wheel(0, -200);
    await p.waitForTimeout(100);
    ok("…scrolling zooms, and doesn't scroll the page", await ev(() => __ulTest.ui.modal!.z! > 2));
    await p.click('[data-act="frame-reset"]');
    await p.waitForTimeout(100);
    ok(
        "…Centre puts it back",
        await ev(
            () =>
                __ulTest.ui.modal!.z === 1 &&
                __ulTest.ui.modal!.x === 0 &&
                __ulTest.ui.modal!.y === 0 &&
                document.querySelector<HTMLInputElement>("#fzoom")!.value === "1"
        )
    );
    await p.click('[data-act="frame-save"]');
    await p.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 10000 }).catch(() => {});
    ok(
        "…and Save keeps the framed copy",
        await ev(f => /^data:image\/jpeg/.test(__ulTest.items.get(f)!.coverData || ""), ids.f)
    );

    // ---- a show's servers ----
    await ev(() => {
        __ulTest.W.show = { title: "Lantern Signal", medium: "anime", year: 2024 };
        __ulTest.openModal("seriesservers", {});
    });
    await p.waitForSelector("#ss-in");
    ok(
        "a show's servers are drawn by Svelte, with the paste box ready",
        await ev(
            () =>
                document.querySelector("#overlay .modal")!.hasAttribute("data-svelte") &&
                document.activeElement === document.querySelector("#ss-in") &&
                /None yet/.test(document.querySelector(".ssl")!.textContent)
        )
    );
    await p.fill("#ss-in", "not a link");
    await p.click('[data-act="ss-add"]');
    await p.waitForTimeout(150);
    ok(
        "…something that isn't a link is refused, and kept to fix",
        await ev(
            () =>
                document.querySelector<HTMLInputElement>("#ss-in")!.value === "not a link" &&
                !document.querySelector(".srvrow")
        )
    );
    await p.fill("#ss-in", "http://192.168.1.20/videos/{title}/E{e2}.mp4");
    await p.fill("#ss-name", "Shelf NAS");
    await p.click('[data-act="ss-add"]');
    await p.waitForTimeout(200);
    const st12 = await ev(() => ({
        rows: [...document.querySelectorAll(".srvrow b")].map(b => b.textContent),
        box: document.querySelector<HTMLInputElement>("#ss-in")!.value,
        name: document.querySelector<HTMLInputElement>("#ss-name")!.value,
    }));
    ok(
        "…an address on your own network is added, named, and the boxes empty",
        st12.rows.join() === "Shelf NAS" && !st12.box && !st12.name,
        JSON.stringify(st12)
    );
    await p.click('[data-act="ss-del"][data-k="0"]');
    await p.waitForTimeout(200);
    ok(
        "…and ✕ removes it",
        await ev(
            () => !document.querySelector(".srvrow") && /None yet/.test(document.querySelector(".ssl")!.textContent)
        )
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok("…Escape closes it", await ev(() => !__ulTest.ui.modal));

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})();
