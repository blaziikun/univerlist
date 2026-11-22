// The library page (library/page/, Svelte): its views, filter and sort, grouping, selecting several and what can be
// done to them, dragging, and a 10,000-entry library that draws only what's near the window yet keeps every entry
// reachable, to the very last.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { Item, ItemDraft } from "../../src/features/core/model";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForFunction(() => window.__ulTest?.booted);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const ids = await ev(() => {
        // the page scrolls smoothly; here every scroll lands at once, so a drag starts where the pointer is
        document.documentElement.style.scrollBehavior = "auto";
        __ulTest.meta.settings.autoFetch = false;
        const add = (x: ItemDraft) => __ulTest.addItem({ coverChecked: true, genreChecked: true, ...x });
        const o = {
            dune: add({
                medium: "book",
                title: "Dune",
                year: 1965,
                status: "done",
                rating: 9,
                genres: ["Science Fiction"],
                kind: "Novel",
            }),
            emma: add({
                medium: "book",
                title: "Emma",
                year: 1815,
                status: "want",
                genres: ["Romance"],
                kind: "Novel",
            }),
            ghibli: add({
                medium: "film",
                title: "Spirited Away",
                year: 2001,
                status: "done",
                rating: 10,
                fav: 1,
                genres: ["Fantasy"],
            }),
            heat: add({ medium: "film", title: "Heat", year: 1995, status: "want", genres: ["Crime"] }),
            fma: add({
                medium: "anime",
                title: "Fullmetal Alchemist",
                year: 2009,
                total: 64,
                prog: 20,
                status: "active",
                genres: ["Fantasy", "Action"],
            }),
            saga: add({ medium: "comic", title: "Saga", year: 2012, status: "paused", genres: ["Science Fiction"] }),
            mushi: add({
                medium: "manga",
                title: "Mushishi",
                year: 1999,
                vols: 10,
                status: "active",
                prog: 3,
                total: 50,
                genres: ["Mystery"],
            }),
        };
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "library";
        __ulTest.curMode().group = "status";
        __ulTest.curMode().sort = "rank";
        __ulTest.curMode().view = "cover";
        __ulTest.render();
        return o;
    });
    const n = Object.keys(ids).length;
    // drag one element onto another: the browser's drag events, as a drag with the mouse sends them (at: how far across
    // the target it's dropped). Sent here rather than by moving the mouse, which starts a drag only some of the time
    const drag = (from: string, to: string, at = 0.5) =>
        ev(
            ([a, b, at]) => {
                const src = document.querySelector(a)!,
                    dst = document.querySelector(b)!,
                    dt = new DataTransfer();
                const r = dst.getBoundingClientRect(),
                    x = r.left + r.width * at,
                    y = r.top + r.height / 2;
                const send = (el: Element, type: string) =>
                    el.dispatchEvent(
                        new DragEvent(type, {
                            bubbles: true,
                            cancelable: true,
                            dataTransfer: dt,
                            clientX: x,
                            clientY: y,
                        })
                    );
                send(src, "dragstart");
                send(dst, "dragenter");
                send(dst, "dragover");
                send(dst, "drop");
                send(src, "dragend");
            },
            [from, to, at]
        );

    // ── views: the buttons and the keys 1 to 4 ──
    const TILE = { cover: ".fo", grid: ".card", spine: ".spine", list: "tr.tr" };
    for (const v of ["cover", "grid", "spine", "list"] as const) {
        await p.click(`.libbar [data-act="view"][data-k="${v}"]`);
        const r = await ev(
            ([v, sel]) => ({
                body: !!document.querySelector(`.libbody.v-${v}`),
                tiles: document.querySelectorAll(`.libbody ${sel}`).length,
                on: document.querySelector(`[data-act="view"][data-k="${v}"]`)!.getAttribute("aria-pressed"),
            }),
            [v, TILE[v]]
        );
        ok(`the ${v} view shows every entry`, r.body && r.tiles === n && r.on === "true", JSON.stringify(r));
    }
    await p.mouse.click(5, 790);
    await p.keyboard.press("3");
    ok(
        "the key 3 switches to spines",
        await ev(() => !!document.querySelector(".libbody.v-spine") && __ulTest.curMode().view === "spine")
    );
    await p.keyboard.press("2");
    ok("…and 2 to the grid", await ev(() => !!document.querySelector(".libbody.v-grid")));

    // ── dragging: onto a plaque moves to that status; while arranging, onto another cover puts it there ──
    const done = await ev(() =>
        document.querySelector('.libbody .plaque[data-gdrop="status:done"]') ? "status:done" : ""
    );
    await drag(`.libbody [data-id="${ids.emma}"]`, `.libbody .plaque[data-gdrop="${done}"]`);
    ok(
        "a cover dragged onto the Finished plaque is finished",
        await ev(id => __ulTest.items.get(id)!.status === "done", ids.emma)
    );
    await ev(() => {
        __ulTest.curMode().sort = "shelf";
        __ulTest.ui.arrange = true;
        __ulTest.render();
    });
    const before = await ev(() => __ulTest.listOrder.slice());
    const [from, to] = await ev(() => {
        const g = [
            ...document
                .querySelector(".libbody section.group [data-gsort]")!
                .querySelectorAll<HTMLElement>("[data-oid]"),
        ].map(e => e.dataset.oid);
        return [g[0], g[g.length - 1]];
    });
    await drag(`.libbody [data-oid="${from}"]`, `.libbody [data-oid="${to}"]`, 0.8);
    const after = await ev(() => __ulTest.listOrder.slice());
    ok(
        "arranging: a cover dragged onto the last one in its group goes after it",
        after.indexOf(from!) > after.indexOf(to!) && before.indexOf(from!) < before.indexOf(to!),
        JSON.stringify({ before, after })
    );
    await ev(() => {
        __ulTest.ui.arrange = false;
        __ulTest.curMode().sort = "rank";
        __ulTest.render();
    });

    await ev(() => {
        __ulTest.curMode().view = "grid";
        __ulTest.render();
    });
    // ── grouping and sort ──
    await p.selectOption("#group", "none");
    ok(
        "No grouping: one shelf, no plaques",
        await ev(
            () =>
                !document.querySelector(".libbody .plaque") &&
                document.querySelectorAll(".libbody section.group").length === 1
        )
    );
    await p.selectOption("#sort", "title");
    const titles = await ev(() => [...document.querySelectorAll(".libbody .card .t")].map(e => e.textContent));
    ok(
        "sorted by title",
        JSON.stringify(titles) === JSON.stringify([...titles].sort((a, b) => a.localeCompare(b))) &&
            titles.length === n,
        titles.join(", ")
    );
    await p.selectOption("#group", "status");
    const plaques = await ev(() => [...document.querySelectorAll(".libbody .plaque h3")].map(e => e.textContent));
    ok("grouped by status again, a plaque for each", plaques.length === 4, plaques.join(", "));
    await p.click('.libbar [data-act="view"][data-k="list"]');
    await p.click('.libbody th [data-act="lsort"][data-k="release"]');
    const years = await ev(() =>
        [...document.querySelectorAll<HTMLTableElement>(".libbody table.lib")].map(t =>
            [...t.querySelectorAll("tr.tr td.num:nth-of-type(7)")].map(td => +td.textContent)
        )
    );
    ok(
        "a column heading sorts the table (newest first in each group)",
        (await ev(() => __ulTest.curMode().sort === "release")) &&
            years.every(g => g.every((y, i) => !i || g[i - 1] >= y)),
        JSON.stringify(years)
    );
    ok(
        "…and the sorted column tells screen readers so",
        await ev(() => {
            const th = document.querySelector(".libbody th[aria-sort]");
            return !!th && th.getAttribute("aria-sort") === "descending" && th.textContent === "Year";
        })
    );
    await p.click('.libbar [data-act="view"][data-k="cover"]');

    // ── filter ──
    await p.click('.libbar [data-act="filter-toggle"]');
    ok("the filter opens", await ev(() => !!document.querySelector(".filtpanel")));
    await p.click('.filtpanel [data-act="filt-tog"][data-f="genres"][data-k="Fantasy"]');
    let shown = await ev(() =>
        [...document.querySelectorAll<HTMLElement>(".libbody .fo")].map(e => e.dataset.id).sort()
    );
    ok(
        "a genre chip shows only that genre",
        JSON.stringify(shown) === JSON.stringify([ids.ghibli, ids.fma].sort()),
        shown.join()
    );
    ok(
        "…and the Filter button counts it",
        await ev(() => document.querySelector(".libbar .fcount")?.textContent === "1")
    );
    await p.fill('.filtpanel [data-filt="smin"]', "10");
    await p.press('.filtpanel [data-filt="smin"]', "Tab");
    shown = await ev(() => [...document.querySelectorAll<HTMLElement>(".libbody .fo")].map(e => e.dataset.id));
    ok(
        "a score from 10 narrows it to the one scored 10",
        JSON.stringify(shown) === JSON.stringify([ids.ghibli]),
        shown.join()
    );
    await p.click('.filtpanel [data-act="filt-adv"][data-k="1"]');
    await p.click('.filtpanel [data-act="rule-add"]');
    await p.selectOption('.filtpanel .rule select[data-rk="f"]', "year");
    ok(
        "Advanced: a rule picks its field, and its test starts afresh",
        await ev(
            () =>
                __ulTest.ui.filt.rules![0].f === "year" &&
                __ulTest.ui.filt.rules![0].op === "ge" &&
                document.querySelector<HTMLInputElement>('.filtpanel .rule [data-rk="v"]')!.placeholder === "number"
        )
    );
    await p.fill('.filtpanel .rule [data-rk="v"]', "2050");
    await p.press('.filtpanel .rule [data-rk="v"]', "Tab");
    ok(
        "nothing passes: it says so, with a way out",
        await ev(() => /Nothing matches these filters/.test(document.querySelector(".empty")?.textContent || ""))
    );
    await p.click('.empty [data-act="clear-filters"]');
    ok(
        "Clear filters shows everything again",
        await ev(
            n => document.querySelectorAll(".libbody .fo").length === n && !document.querySelector(".libbar .fcount"),
            n
        )
    );
    await p.click('.filtpanel [data-act="f-status"][data-k="active"]');
    ok(
        "a status chip shows only that status, and the bar says which",
        await ev(
            () =>
                [...document.querySelectorAll<HTMLElement>(".libbody .fo")].every(
                    e => __ulTest.items.get(e.dataset.id!)!.status === "active"
                ) && !!document.querySelector(".libbar .stchip")
        )
    );
    await p.click(".libbar .stchip");
    ok(
        "…✕ shows everything",
        await ev(n => document.querySelectorAll(".libbody .fo").length === n && __ulTest.ui.status === "all", n)
    );
    await p.click('.filtpanel [data-act="filter-toggle"]');
    ok("Done closes the filter", await ev(() => !document.querySelector(".filtpanel")));
    await ev(() => {
        __ulTest.ui.q = "fantasy";
        __ulTest.render();
    });
    ok(
        "searching shows what matches, and how many",
        await ev(
            () =>
                /2 matches for “fantasy”/.test(document.querySelector(".tabbody .note")?.textContent || "") &&
                document.querySelectorAll(".libbody .fo").length === 2
        ),
        await ev(() => document.querySelector(".tabbody .note")?.textContent)
    );
    await p.click('.tabbody .note [data-act="search-clear"]');

    // ── size and spacing ──
    await p.click(".libbar .lb-more");
    await p.$eval('.popbody [data-vz="z"]', (el: HTMLInputElement) => {
        el.value = "1.5";
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    ok(
        "the size slider resizes the shelf as it moves",
        await ev(
            () =>
                document.querySelector<HTMLElement>(".libbody")!.style.getPropertyValue("--z") === "1.5" &&
                document.querySelector(".popbody output")!.textContent === "150%"
        )
    );
    await p.$eval('.popbody [data-vz="z"]', el => el.dispatchEvent(new Event("change", { bubbles: true })));
    ok("…and letting go keeps it for the mode", await ev(() => __ulTest.viewOpts().z === 1.5));
    await p.click('.popbody [data-vzc="true"]');
    ok("True size", await ev(() => !!document.querySelector(".libbody .faceout.truesize")));
    await ev(() => {
        __ulTest.ui.pop = null;
        __ulTest.curMode().vz = {};
        __ulTest.render();
    });

    // ── selecting several, and what can be done to them ──
    await p.click('.libbar [data-act="select-toggle"]');
    ok(
        "Select: the bar for what you pick appears",
        await ev(() => /0 selected/.test(document.querySelector("#bulk")?.textContent || ""))
    );
    await p.click(`.libbody [data-id="${ids.dune}"]`);
    await p.click(`.libbody [data-id="${ids.heat}"]`);
    ok(
        "two picked",
        await ev(
            ([a, b]) =>
                __ulTest.ui.sel.size === 2 &&
                __ulTest.ui.sel.has(a) &&
                __ulTest.ui.sel.has(b) &&
                document.querySelectorAll(".libbody .fo.sel").length === 2 &&
                /2 selected/.test(document.querySelector("#bulk .n")!.textContent),
            [ids.dune, ids.heat]
        )
    );
    await p.selectOption("#bulk-status", "paused");
    ok(
        "a status for both, and the menu goes back to its first line",
        await ev(
            ([a, b]) =>
                __ulTest.items.get(a)!.status === "paused" &&
                __ulTest.items.get(b)!.status === "paused" &&
                document.querySelector<HTMLInputElement>("#bulk-status")!.value === "",
            [ids.dune, ids.heat]
        )
    );
    await p.fill("#bulk-tag", "rainy");
    await p.press("#bulk-tag", "Enter");
    ok(
        "a tag for both, and the box empties",
        await ev(
            ([a, b]) =>
                __ulTest.items.get(a)!.tags.includes("rainy") &&
                __ulTest.items.get(b)!.tags.includes("rainy") &&
                document.querySelector<HTMLInputElement>("#bulk-tag")!.value === "",
            [ids.dune, ids.heat]
        )
    );
    await p.click('#bulk [data-act="bulk-delete"]');
    ok("Delete asks first", await ev(() => /Delete 2\?/.test(document.querySelector("#bulk")!.textContent)));
    await p.click('#bulk [data-act="bulk-delete-no"]');
    ok(
        "…Keep keeps them",
        await ev(
            ([a, b]) => __ulTest.items.has(a) && __ulTest.items.has(b) && !document.querySelector("#bulk .err"),
            [ids.dune, ids.heat]
        )
    );
    await p.click('#bulk [data-act="sel-all"]');
    ok("Select all", await ev(n => __ulTest.ui.sel.size === n, n));
    await p.click('#bulk [data-act="sel-none"]');
    const order = await ev(() => [...document.querySelectorAll<HTMLElement>(".libbody .fo")].map(e => e.dataset.id));
    await p.click(`.libbody [data-id="${order[1]}"]`);
    await p.click(`.libbody [data-id="${order[4]}"]`, { modifiers: ["Shift"] });
    ok(
        "Shift-click picks the range between",
        await ev(
            want => __ulTest.ui.sel.size === want.length && want.every(id => __ulTest.ui.sel.has(id!)),
            order.slice(1, 5)
        ),
        await ev(() => [...__ulTest.ui.sel].join())
    );
    await p.keyboard.press("Escape");
    ok(
        "Escape stops selecting, and the bar goes",
        await ev(() => !__ulTest.ui.selecting && !document.querySelector("#bulk"))
    );
    // a box dragged over covers selects them
    await p.waitForTimeout(100); // a redraw puts the page back where it was on the next frame: after that
    await ev(() => scrollTo({ top: 0, behavior: "instant" }));
    await p.waitForTimeout(50);
    const r = await ev(() => {
        const a = [...document.querySelectorAll(".libbody .fo")].slice(0, 2).map(x => x.getBoundingClientRect());
        const body = document.querySelector(".libbody")!.getBoundingClientRect();
        return { x: body.left - 14, y: a[0].top - 4, x2: a[1].right - 10, y2: a[1].bottom - 10 };
    });
    await p.mouse.move(r.x, r.y);
    await p.mouse.down();
    await p.mouse.move(r.x + 40, r.y + 40, { steps: 4 });
    await p.mouse.move(r.x2, r.y2, { steps: 6 });
    await p.mouse.up();
    ok(
        "a box dragged over covers selects them",
        await ev(
            () =>
                __ulTest.ui.selecting &&
                __ulTest.ui.sel.size === 2 &&
                document.querySelectorAll(".libbody .fo.sel").length === 2 &&
                !document.querySelector(".lbox")
        ),
        await ev(() => __ulTest.ui.sel.size + "")
    );
    await ev(() => {
        __ulTest.ui.selecting = false;
        __ulTest.ui.sel.clear();
        __ulTest.render();
    });

    // ── a spine picture whose address has an apostrophe still shows ──
    await ev(id => {
        __ulTest.quietPatch(id, { spineArt: "https://s4.anilist.co/cover/it's.jpg" });
        __ulTest.curMode().view = "spine";
        __ulTest.render();
    }, ids.mushi);
    ok(
        "a spine's picture with an apostrophe in its address still shows",
        await ev(id => {
            const a = document.querySelector(`.libbody .spine[data-id="${id}"] .art`);
            return !!a && /it%27s\.jpg/.test(getComputedStyle(a).backgroundImage);
        }, ids.mushi),
        await ev(id => {
            const a = document.querySelector(`.libbody .spine[data-id="${id}"] .art`);
            return a ? getComputedStyle(a).backgroundImage : "no art";
        }, ids.mushi)
    );

    // ── 10,000 entries: only what's near the window is drawn, and the last one is still there to open ──
    await ev(() => {
        const M = ["anime", "manga", "book", "film", "tv", "comic"],
            S = ["active", "done", "want", "paused"],
            add: Record<string, Item> = {};
        for (let i = 0; i < 10000 - Object.keys(Object.fromEntries(__ulTest.items)).length; i++)
            add[__ulTest.newId("Entry " + i, M[i % M.length])] = __ulTest.migrateItem({
                medium: M[i % M.length],
                title: "Entry " + String(i).padStart(5, "0"),
                status: S[i % S.length],
                rating: i % 10,
                year: 1980 + (i % 45),
                coverChecked: true,
                genres: ["Drama"],
                copy: "none",
                addedAt: __ulTest.nowISO(),
                source: "you",
            });
        __ulTest.change("Add", Object.keys(add), (_, id) => add[id]);
        __ulTest.curMode().view = "grid";
        __ulTest.curMode().group = "status";
        __ulTest.curMode().sort = "title";
        __ulTest.render();
    });
    await p.waitForTimeout(150);
    await ev(() => scrollTo({ top: 0, behavior: "instant" }));
    await p.waitForTimeout(200);
    const big = await ev(() => ({
        listed: __ulTest.listOrder.length,
        drawn: document.querySelectorAll(".libbody [data-oid]").length,
    }));
    ok(
        "10,000 entries listed, only a few hundred drawn",
        big.listed === 10000 && big.drawn > 20 && big.drawn < 600,
        JSON.stringify(big)
    );
    const toEnd = async (view: string) => {
        await ev(v => {
            __ulTest.curMode().view = v;
            __ulTest.render();
            scrollTo({ top: 0, behavior: "instant" });
        }, view);
        await p.waitForTimeout(200);
        // a table's columns and rows, as drawn: the title column's width in each group, and the drawn rows' heights
        const table = () =>
            ev(() => ({
                title: [...document.querySelectorAll<HTMLTableElement>(".libbody table.lib")].map(
                    t => Math.round(t.tHead!.rows[0].cells[2].getBoundingClientRect().width * 10) / 10
                ),
                rows: [
                    ...new Set(
                        [...document.querySelectorAll(".libbody tr.tr[data-id]")].map(r =>
                            Math.round(r.getBoundingClientRect().height)
                        )
                    ),
                ],
            }));
        const atTop = view === "list" ? await table() : null;
        const last = await ev(() => __ulTest.listOrder[__ulTest.listOrder.length - 1]);
        let found = false;
        for (let i = 0; i < 20 && !found; i++) {
            await p.keyboard.press("End");
            await ev(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
            await p.waitForTimeout(200);
            found = await ev(id => {
                const el = document.querySelector(`.libbody [data-id="${CSS.escape(id)}"]`);
                if (!el) return false;
                const r = el.getBoundingClientRect();
                return r.bottom > 0 && r.top < innerHeight;
            }, last);
        }
        ok(
            `${view}: scrolled to the end, the last entry is there`,
            found,
            await ev(() => scrollY + " / " + document.documentElement.scrollHeight)
        );
        if (atTop) {
            const atEnd = await table();
            ok(
                `${view}: the columns are as wide at the end as at the top`,
                JSON.stringify(atEnd.title) === JSON.stringify(atTop.title),
                JSON.stringify({ atTop: atTop.title, atEnd: atEnd.title })
            );
            ok(
                `${view}: …and the rows as tall`,
                atEnd.rows.every(h => atTop.rows.includes(h)),
                JSON.stringify({ atTop: atTop.rows, atEnd: atEnd.rows })
            );
        }
        await p.click(`.libbody [data-id="${last}"]`);
        await p.waitForSelector(".item7", { timeout: 5000 }).catch(() => {});
        ok(
            `${view}: …and it opens`,
            await ev(
                id =>
                    __ulTest.ui.modal &&
                    __ulTest.ui.modal.id === id &&
                    document.querySelector(".item7 h2")!.textContent === __ulTest.items.get(id)!.title,
                last
            )
        );
        await ev(() => __ulTest.closeModal());
        ok(
            `${view}: …with still only a few hundred drawn`,
            await ev(() => document.querySelectorAll(".libbody [data-id]").length < 600),
            await ev(() => document.querySelectorAll(".libbody [data-id]").length + "")
        );
    };
    await toEnd("grid");
    await toEnd("list");
    ok(
        'no "Showing 2,000 of…": every row of a long table can be reached',
        await ev(() => !/Showing 2,000/.test(document.querySelector(".libbody")!.textContent))
    );
    // scrolling back up, every window has tiles in it
    let holes = 0;
    await ev(() => {
        __ulTest.curMode().view = "cover";
        __ulTest.render();
        scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    });
    for (let k = 0; k < 12; k++) {
        await ev(() => scrollBy({ top: -Math.round(innerHeight * 7.3), behavior: "instant" }));
        await p.waitForTimeout(120);
        const seen = await ev(() =>
            [...document.querySelectorAll(".libbody [data-oid]")].some(e => {
                const r = e.getBoundingClientRect();
                return r.bottom > 120 && r.top < innerHeight - 120;
            })
        );
        if (!seen) holes++;
    }
    ok("scrolling back up, every window shows covers", holes === 0, holes + " empty");
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
