// Connections and Rank, drawn by Svelte (library/favourites/, lists/, connections/, rank/): Favourites (layouts,
// dragging into place, the characters' filter), the Lists tab (a list's boxes, Up next, dragging rows into place),
// Stats › Compare, Franchises and People, and Rank (picking with the keys, a shelf, the Seasons panel). And what they
// once got wrong:
//  · a franchise's card, pressed in Stats › Franchises, went to the mode's first tab instead of opening the franchise
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
    await p.waitForFunction(() => window.__ulTest?.booted);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const ids = await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        if (__ulTest.auto.ctl) __ulTest.auto.ctl.abort();
        __ulTest.auto.paused = true;
        const o = {
            a: __ulTest.addItem({
                medium: "anime",
                title: "Lantern Garden",
                status: "done",
                rating: 9,
                fav: 1,
                year: 2010,
                scores: { anilist: 70 },
                genres: ["Drama"],
            }),
            m: __ulTest.addItem({
                medium: "manga",
                title: "Lantern Garden",
                status: "done",
                rating: 7,
                year: 2008,
                scores: { anilist: 85 },
                genres: ["Drama"],
            }),
            f: __ulTest.addItem({
                medium: "film",
                title: "Quiet Harbour",
                status: "done",
                rating: 6,
                fav: 1,
                creator: "Ora Quill",
                year: 2019,
                scores: { imdb: 8.1 },
            }),
            k: __ulTest.addItem({
                medium: "book",
                title: "Paper Moons",
                status: "active",
                creator: "Ora Quill",
                year: 2001,
            }),
            w: __ulTest.addItem({
                medium: "book",
                title: "Iron Orchard",
                status: "want",
                creator: "Ora Quill",
                year: 2003,
            }),
        };
        __ulTest.linkItems(o.a, o.m, "adaptation");
        __ulTest.meta.favOrder = [o.a, o.f];
        __ulTest.meta.chars = [
            { id: "c1", name: "Mira Vale", gender: "Female", media: [], rank: 1 },
            { id: "c2", name: "Tobin", gender: "Male", media: [], rank: 2 },
        ];
        __ulTest.meta.queue = [o.k, o.w];
        __ulTest.markDirty();
        __ulTest.render();
        return o;
    });
    const drag = (from: string, to: string) =>
        ev(
            ([a, b]) => {
                const src = document.querySelector(a)!,
                    dst = document.querySelector(b)!,
                    dt = new DataTransfer();
                const r = dst.getBoundingClientRect(),
                    x = r.left + r.width * 0.75,
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
            [from, to]
        );
    const wait = (ms = 120) => p.waitForTimeout(ms);

    // ── Favourites ──
    await ev(() => __ulTest.goTab("favourites"));
    await wait();
    ok(
        "Favourites is drawn by Svelte, your favourites in your order",
        await ev(
            () =>
                document.querySelector(".tabbody")!.hasAttribute("data-svelte") &&
                [...document.querySelectorAll<HTMLElement>(".favgrid [data-favid]")]
                    .map(x => x.dataset.favid)
                    .join() === __ulTest.meta.favOrder.join()
        )
    );
    await drag(`[data-favid="${ids.a}"]`, `[data-favid="${ids.f}"]`);
    await wait();
    ok(
        "a favourite dragged onto another goes there, and the marks go",
        await ev(
            i =>
                __ulTest.meta.favOrder[0] === i.f &&
                __ulTest.meta.favOrder[1] === i.a &&
                !document.querySelector(".ftile2.drag, .ftile2.over"),
            ids
        )
    );
    await p.click('[data-act="layout-view"][data-key="favView"][data-k="large"]');
    await wait();
    ok(
        'Large shows each with its details and "Picture & why"',
        await ev(
            () =>
                document.querySelectorAll('.favgrid.large .ftile2.large [data-act="fav-edit"]').length === 2 &&
                __ulTest.meta.layout.favView === "large"
        )
    );
    await p.click('[data-act="layout-view"][data-key="favView"][data-k="grid"]');
    await wait();
    await p.click('[data-act="fav-nums"]');
    await wait();
    ok(
        "№ hides the numbers",
        await ev(() => !!document.querySelector(".favgrid.nonum") && __ulTest.meta.layout.favNums === false)
    );
    await p.click('[data-act="fav-nums"]');
    await wait();
    await p.fill("#char-q", "mir");
    await wait();
    ok(
        "the characters' filter keeps what's typed, and the box keeps focus",
        await ev(
            () =>
                document.querySelectorAll(".chargrid2 [data-charid]").length === 1 &&
                document.activeElement!.id === "char-q" &&
                document.querySelector<HTMLInputElement>("#char-q")!.value === "mir"
        )
    );
    await p.fill("#char-q", "");
    await wait();
    await drag('[data-charid="c1"]', '[data-charid="c2"]');
    await wait();
    ok(
        "a character dragged onto another goes there",
        await ev(
            () =>
                __ulTest.meta.chars.find(c => c.id === "c2")!.rank === 1 &&
                __ulTest.meta.chars.find(c => c.id === "c1")!.rank === 2
        )
    );
    await p.click('[data-act="layout-view"][data-key="charSplit"][data-k="group"]');
    await wait();
    ok(
        "By gender groups the characters",
        await ev(
            () =>
                [...document.querySelectorAll(".chars .label.sub")].map(x => x.textContent).join() ===
                "Female · 1,Male · 1"
        )
    );

    // ── Lists ──
    const lid = await ev(() => __ulTest.createList({ name: "Rainy days", ids: [], numbered: true }));
    await ev(
        ([l, i]) => {
            __ulTest.listAdd(l, [i.a, i.f, i.k]);
            __ulTest.ui.listId = null;
            __ulTest.goTab("lists");
        },
        [lid, ids]
    );
    await wait();
    ok(
        "the Lists tab shows Up next and the list as cards",
        await ev(
            l =>
                !!document.querySelector('.frgrid [data-act="go-list"][data-k="queue"]') &&
                !!document.querySelector(`.frgrid [data-act="go-list"][data-k="${l}"]`),
            lid
        )
    );
    await p.click(`.frgrid [data-act="go-list"][data-k="${lid}"]`);
    await wait();
    ok(
        "a list opens with its entries in order, numbered",
        await ev(
            i =>
                [...document.querySelectorAll<HTMLElement>(".queue .qi")].map(x => x.dataset.qid).join() ===
                    [i.a, i.f, i.k].join() && document.querySelector(".qi .num")!.textContent === "1",
            ids
        )
    );
    await p.fill("#list-name", "Rainy afternoons");
    await p.press("#list-name", "Tab");
    await wait();
    ok(
        "its name is saved as you leave the box",
        await ev(l => __ulTest.meta.lists.find(x => x.id === l)!.name === "Rainy afternoons", lid)
    );
    await p.fill("#list-name", "  ");
    await p.press("#list-name", "Tab");
    await wait();
    ok(
        "…an empty name isn't kept, and the box shows the name again",
        await ev(
            l =>
                __ulTest.meta.lists.find(x => x.id === l)!.name === "Rainy afternoons" &&
                document.querySelector<HTMLInputElement>("#list-name")!.value === "Rainy afternoons",
            lid
        )
    );
    await p.fill(`.lnote[data-id="${ids.f}"]`, "Watch with tea");
    await p.press(`.lnote[data-id="${ids.f}"]`, "Tab");
    await wait();
    ok(
        "a note is saved for its entry",
        await ev(([l, i]) => __ulTest.meta.lists.find(x => x.id === l)!.notes![i.f] === "Watch with tea", [lid, ids])
    );
    await p.selectOption("#list-sort", "title");
    await wait();
    ok(
        "sorting once orders it, and the menu goes back to its first line",
        await ev(
            ([l, i]) =>
                __ulTest.meta.lists.find(x => x.id === l)!.ids.join() === [i.a, i.k, i.f].join() &&
                document.querySelector<HTMLInputElement>("#list-sort")!.value === "",
            [lid, ids]
        )
    );
    await drag(`.qi[data-qid="${ids.a}"]`, `.qi[data-qid="${ids.f}"]`);
    await wait();
    ok(
        "a row dragged onto another goes there",
        await ev(
            ([l, i]) =>
                __ulTest.meta.lists.find(x => x.id === l)!.ids.join() === [i.k, i.f, i.a].join() &&
                !document.querySelector(".qi.drag, .qi.over"),
            [lid, ids]
        )
    );
    await p.click(`[data-act="li-move"][data-id="${ids.a}"][data-k="-1"]`);
    await wait();
    ok(
        "↑ moves one up",
        await ev(
            ([l, i]) => __ulTest.meta.lists.find(x => x.id === l)!.ids.join() === [i.k, i.a, i.f].join(),
            [lid, ids]
        )
    );
    await p.uncheck("#list-numbered");
    await wait();
    ok(
        "Numbered order can be turned off",
        await ev(l => !__ulTest.meta.lists.find(x => x.id === l)!.numbered && !document.querySelector(".qi .num"), lid)
    );
    await p.click('[data-act="list-del"]');
    await wait();
    ok("Delete asks first", await ev(() => !!document.querySelector('[data-act="list-del-yes"]')));
    await p.click('[data-act="list-del-no"]');
    await wait();
    await ev(() => __ulTest.goList("queue"));
    await wait();
    ok(
        "Up next shows the queue, with Start",
        await ev(
            i =>
                [...document.querySelectorAll<HTMLElement>(".queue .qi")].map(x => x.dataset.qid).join() ===
                    [i.k, i.w].join() && document.querySelectorAll('.qi [data-act="start"]').length === 2,
            ids
        )
    );
    await drag(`.qi[data-qid="${ids.k}"]`, `.qi[data-qid="${ids.w}"]`);
    await wait();
    ok(
        "…and its rows are dragged into place too",
        await ev(i => __ulTest.meta.queue.join() === [i.w, i.k].join(), ids)
    );
    // the overview's Next up block: the same queue, dragged there
    await ev(() => {
        const md = __ulTest.curMode();
        md.blocks = [{ k: "nextup", w: 12, n: 3 }];
        __ulTest.goTab("overview");
    });
    await wait(200);
    await drag(`.nq .qi[data-qid="${ids.w}"]`, `.nq .qi[data-qid="${ids.k}"]`);
    await wait();
    ok(
        "the overview's Next up is dragged into place on its own",
        await ev(i => __ulTest.meta.queue.join() === [i.k, i.w].join(), ids)
    );

    // ── Stats › Compare, Franchises, People ──
    await ev(() => {
        __ulTest.ui.statsView = "compare";
        __ulTest.goTab("stats");
    });
    await wait();
    ok(
        "Compare is drawn by Svelte: the scatter, with a dot for everything scored by you and the crowd",
        await ev(
            () =>
                document.querySelectorAll(".chart.scatter .dotg").length === 3 &&
                !!document.querySelector(".tabbody[data-svelte] .dash")
        )
    );
    await p.fill("#cmp-a", "Lantern Garden · Anime");
    await p.press("#cmp-a", "Tab");
    await p.fill("#cmp-b", "Quiet Harbour · Film");
    await p.press("#cmp-b", "Tab");
    await wait();
    ok(
        "two things picked are shown side by side",
        await ev(
            i =>
                __ulTest.ui.cmpA === i.a &&
                __ulTest.ui.cmpB === i.f &&
                document.querySelectorAll(".sbs tbody tr").length === 12,
            ids
        )
    );
    await ev(() => {
        __ulTest.ui.statsView = "franchises";
        __ulTest.render();
    });
    await wait();
    ok(
        "Franchises shows the two joined across media",
        await ev(
            () =>
                /Across media · 1/.test(document.querySelector(".tabbody")!.textContent) &&
                !!document.querySelector(".frcard")
        )
    );
    await p.click(".frcard");
    await wait();
    ok(
        "a franchise's card opens it, in Stats (it went to the first tab)",
        await ev(
            () =>
                __ulTest.ui.tab === "stats" &&
                __ulTest.ui.statsView === "franchises" &&
                !!document.querySelector("#fr-name") &&
                document.querySelectorAll(".timeline .tl").length === 2
        ),
        await ev(() => __ulTest.ui.tab + " " + __ulTest.ui.statsView)
    );
    await p.fill("#fr-name", "Lanterns");
    await p.press("#fr-name", "Tab");
    await wait();
    ok(
        "…and renaming it names every entry in it",
        await ev(
            i => __ulTest.items.get(i.a)!.franchise === "Lanterns" && __ulTest.items.get(i.m)!.franchise === "Lanterns",
            ids
        )
    );
    await ev(() => {
        __ulTest.ui.franchise = null;
        __ulTest.ui.statsView = "people";
        __ulTest.render();
    });
    await wait();
    ok(
        "People shows who made more than one thing",
        await ev(() => [...document.querySelectorAll(".pcard .t")].map(x => x.textContent).join() === "Ora Quill")
    );
    await p.check("#people-all");
    await wait();
    ok(
        "…everyone, with the tick",
        await ev(() => __ulTest.ui.peopleAll && document.querySelectorAll(".pcard").length >= 1)
    );
    await p.fill("#people-q", "zzz");
    await wait();
    ok(
        "…filtered by what's typed, which keeps focus",
        await ev(
            () =>
                !document.querySelector(".pcard") &&
                !!document.querySelector(".tabbody .empty") &&
                document.activeElement!.id === "people-q"
        )
    );
    await p.fill("#people-q", "");
    await p.uncheck("#people-all");
    await wait();

    // ── Rank ──
    await ev(i => {
        __ulTest.rankState.pair = [i.a, i.f];
        __ulTest.goTab("rank");
    }, ids);
    await wait();
    ok(
        "Rank shows the two to pick between",
        await ev(() => document.querySelectorAll(".duel .contender").length === 2)
    );
    await ev(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await p.keyboard.press("ArrowLeft");
    await wait();
    ok(
        "← picks the left one: its ranking goes up, and the ranking is shown",
        await ev(
            i =>
                (__ulTest.items.get(i.a)!.h2h || 0) === 1 &&
                __ulTest.items.get(i.a)!.elo! > __ulTest.items.get(i.f)!.elo! &&
                document.querySelectorAll(".board button").length === 2,
            ids
        )
    );
    await p.keyboard.press("ArrowDown");
    await wait();
    ok("↓ is a draw", await ev(() => [...__ulTest.items.values()].reduce((a, x) => a + (x.h2h || 0), 0) === 4));
    await p.focus("#rank-shelf");
    await p.keyboard.press("ArrowLeft");
    await wait();
    ok(
        "…but not while a box has focus",
        await ev(() => [...__ulTest.items.values()].reduce((a, x) => a + (x.h2h || 0), 0) === 4)
    );
    await p.click('[data-act="rank-mode"][data-k="want"]');
    await wait();
    ok(
        "Backlog ranks what's planned",
        await ev(
            () =>
                __ulTest.rankState.mode === "want" &&
                /Pick the one you want to start more/.test(document.querySelector(".tabbody")!.textContent)
        )
    );
    await p.click('[data-act="rank-mode"][data-k="liked"]');
    await wait();
    ok("the Seasons panel is there in a mode with anime", await ev(() => !!document.querySelector("details.seasonsp")));
    await p.click("details.seasonsp summary");
    await wait();
    ok(
        "…it opens, and stays open",
        await ev(() => document.querySelector<HTMLDetailsElement>("details.seasonsp")!.open && __ulTest.ui.seasonsOpen)
    );
    await p.check('.seasonsp [data-seasons="tv"]');
    await wait();
    ok("…its ticks are saved", await ev(() => __ulTest.meta.settings.seasons!.tv === true));

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
