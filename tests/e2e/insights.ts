// Insights and the pages each mode has for what it's for (core/pages.ts: drawn by Svelte), and Discover: what they
// show, their own buttons and boxes, and that the library's buttons on them still work.
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
    const wait = (ms = 150) => p.waitForTimeout(ms);
    await p.goto(ENV.APP);
    await p.waitForFunction(() => window.__ulTest?.booted);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const ids = await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        const d = (s: string) => new Date(s + "T12:00:00Z").toISOString(),
            G = ["Drama", "Mystery", "Comedy", "Fantasy"],
            T = ["Detective", "School", "Magic"];
        for (let i = 0; i < 30; i++) {
            const g = [G[i % 4], G[(i + 1) % 4]],
                t = [T[i % 3]],
                r = 5 + (g.includes("Mystery") ? 3 : 0) - (g.includes("Comedy") ? 3 : 0) + (i % 2);
            __ulTest.addItem({
                medium: i % 2 ? "anime" : "manga",
                title: "Lantern " + i,
                ext: i < 3 ? { anilist: i + 1 } : {},
                status: i % 5 === 4 ? "dnf" : "done",
                rating: r,
                genres: g,
                themes: t,
                startedAt: d("2024-01-02"),
                finishedAt: d("2024-01-1" + (i % 9)),
            });
        }
        const film = __ulTest.addItem({
            medium: "film",
            title: "Night Harbour",
            year: 2011,
            status: "done",
            rating: 7,
            finishedAt: d("2024-03-04"),
            log: [
                { date: d("2024-03-04"), from: 0, to: 1 },
                { date: d("2024-06-01"), from: 0, to: 1 },
            ],
        });
        const b1 = __ulTest.addItem({
            medium: "book",
            title: "The Glass Orchard",
            creator: "Ivo Penn",
            series: "Orchards",
            seriesNo: 1,
            status: "done",
            quotes: [
                { text: "Every orchard keeps a secret.", page: "12", date: d("2024-02-02") },
                { text: "Glass remembers.", date: d("2024-03-03") },
            ],
        });
        const b2 = __ulTest.addItem({
            medium: "book",
            title: "The Iron Orchard",
            creator: "Ivo Penn",
            series: "Orchards",
            seriesNo: 2,
            status: "want",
        });
        const game = __ulTest.addItem({
            medium: "game",
            title: "Pocket Courier",
            status: "active",
            total: 10,
            prog: 2,
            platform: "Switch",
        });
        if (__ulTest.auto.ctl) __ulTest.auto.ctl.abort();
        __ulTest.auto.paused = true;
        return { film, b1, b2, game };
    });
    const svelte = () => ev(() => document.querySelector("#main .tabbody")?.hasAttribute("data-svelte"));

    // ── Insights ──
    await ev(() => __ulTest.goTab("discover"));
    await wait();
    ok(
        "Insights is drawn by Svelte, with how often you finish and your taste read closely",
        (await svelte()) &&
            (await ev(
                () =>
                    /of what you start, you finish/.test(document.querySelector(".ihero")!.textContent) &&
                    !!document.querySelector(".taste .tgrid")
            ))
    );
    ok(
        "…what lifts and sinks your scores comes from them",
        await ev(
            () =>
                [...document.querySelectorAll(".tchip2.up")].some(x => /Mystery/.test(x.textContent)) &&
                [...document.querySelectorAll(".tchip2.down")].some(x => /Comedy/.test(x.textContent))
        )
    );
    ok(
        "…and a title in it opens its card",
        await (async () => {
            await p.click('.taste .linkbtn[data-act="open"]');
            await wait();
            const k = await ev(() => __ulTest.ui.modal && __ulTest.ui.modal.kind);
            await ev(() => __ulTest.closeModal());
            return k === "item";
        })()
    );
    const more = await p.$('[data-act="taste-more"]');
    if (more) {
        await more.click();
        await p
            .waitForFunction(
                () => {
                    const s = (__ulTest.ui.tasteMore || {})[0];
                    return s && !s.busy;
                },
                null,
                { timeout: 5000 }
            )
            .catch(() => {});
        ok(
            '"Find more" asks AniList and says what it found',
            await ev(() =>
                /Nothing new with exactly this mix|\+ Plan/.test(document.querySelector(".tcl")!.textContent)
            )
        );
    } else ok('"Find more" is offered for a mix of your favourites', false, "no button");
    await p.click('.engine[data-act="disc-open"][data-k="versions"]');
    await wait();
    ok(
        "Look further opens Discover on that search",
        await ev(
            () =>
                __ulTest.ui.modal &&
                __ulTest.ui.modal.kind === "discover" &&
                __ulTest.ui.modal.mode === "versions" &&
                document.querySelector("#overlay .modal")!.hasAttribute("data-svelte")
        )
    );

    // ── Discover ──
    await p.click('[data-act="disc-mode"][data-k="books"]');
    await wait();
    ok(
        "Discover: another search shows its own choices",
        await ev(
            () =>
                __ulTest.ui.modal!.mode === "books" &&
                !!document.querySelector('[data-act="disc-shelf"]') &&
                document.querySelector<HTMLElement>('.modal [role="tab"][aria-selected="true"]')!.dataset.k === "books"
        )
    );
    await p.click('[data-act="disc-shelf"][data-k="academic"]');
    await wait();
    ok(
        "…the shelf changes which sources it offers, and picks one that suits it",
        await ev(
            () =>
                __ulTest.ui.modal!.shelf === "academic" &&
                ["reddit", "openlibrary", "hn", "stack"].includes(__ulTest.ui.modal!.source!) &&
                ![...document.querySelectorAll<HTMLElement>('[data-act="disc-source"]')].some(
                    x => x.dataset.k === "awards"
                )
        )
    );
    await p.click('[data-act="disc-shelf"][data-k="fiction"]');
    await p.click('[data-act="disc-source"][data-k="awards"]');
    await wait();
    await p.click('[data-act="award-toggle"][data-k="Booker"]');
    await wait();
    ok(
        "…an award can be left out",
        await ev(
            () =>
                __ulTest.ui.modal!.offAwards!.has("Booker") &&
                document.querySelector('[data-act="award-toggle"][data-k="Booker"]')!.getAttribute("aria-pressed") ===
                    "false"
        )
    );
    await p.click('[data-act="disc-source"][data-k="reddit"]');
    await wait();
    await p.selectOption("#d-seed", ids.b1);
    await wait();
    ok(
        "…and it can start from one of your books, with links to search elsewhere for it",
        await ev(
            i =>
                __ulTest.ui.modal!.seed === i &&
                /The Glass Orchard/.test(document.querySelector(".modal")!.textContent),
            ids.b1
        )
    );
    await p.click('[data-act="disc-mode"][data-k="fans"]');
    await wait();
    await p.click('[data-act="disc-target"][data-k="anime"]');
    await p.click('[data-act="disc-go"]');
    await p
        .waitForFunction(() => __ulTest.ui.modal && !__ulTest.ui.modal.busy && __ulTest.ui.modal.results, null, {
            timeout: 8000,
        })
        .catch(() => {});
    ok(
        "Fans also liked finds recommendations from AniList",
        await ev(() => document.querySelectorAll(".modal .rec").length > 0),
        await ev(() => document.querySelector(".modal")!.textContent.slice(0, 200))
    );
    const n0 = await ev(() => __ulTest.items.size);
    await p.click('.modal .rec [data-act="rec-add"]');
    await wait(400);
    ok(
        '…"+ Add as planned" adds it, and the card says so',
        await ev(n => __ulTest.items.size === n + 1 && !!document.querySelector(".modal .rec .pill.own"), n0)
    );
    await p.click('.modal .rec [data-act="rec-no"]');
    await wait();
    ok(
        '…"Not for me" dismisses one, and remembers it',
        await ev(() => !!document.querySelector(".modal .rec .pill:not(.own)") && __ulTest.meta.dismissed.length > 0)
    );
    await p.keyboard.press("Escape");
    await wait();
    ok(
        "Escape closes Discover",
        await ev(() => !__ulTest.ui.modal && !document.querySelector<HTMLElement>("#app")!.inert)
    );

    // ── This season ──
    await ev(() => {
        __ulTest.setMode("animanga");
        __ulTest.ui.season = { season: "FALL", year: 2025 };
        Object.assign(__ulTest.seasonState, {
            key: "FALL-2025",
            busy: false,
            err: "",
            list: [
                {
                    title: "Velvet Engine",
                    medium: "anime",
                    kind: "TV",
                    ext: { anilist: 7001 },
                    genres: ["Drama"],
                    scores: { anilist: 80 },
                },
                { title: "Paper Comet", medium: "anime", kind: "Movie", ext: { anilist: 7002 }, genres: [] },
            ],
        });
        __ulTest.goTab("seasonal");
    });
    await wait();
    ok(
        "This season: the season, as TV and films",
        (await svelte()) &&
            (await ev(
                () =>
                    /Autumn 2025/.test(document.querySelector(".ltitle")!.textContent) &&
                    document.querySelectorAll(".scard").length === 2 &&
                    document.querySelectorAll("section.group").length === 2
            ))
    );
    await p.click('[data-act="season-only"][data-k="mine"]');
    await wait();
    ok(
        '…"In my list" shows only what you have',
        await ev(() => __ulTest.ui.seasonOnly === "mine" && !document.querySelector(".scard"))
    );
    await p.click('[data-act="season-only"][data-k=""]');
    await p.click('[data-act="season-step"][data-k="1"]');
    await wait();
    ok(
        '…"Later" goes to the next season, and asks AniList for it',
        await ev(
            () =>
                __ulTest.ui.season!.season === "WINTER" &&
                __ulTest.ui.season!.year === 2026 &&
                /Winter 2026/.test(document.querySelector(".ltitle")!.textContent)
        )
    );
    await p.click('[data-act="season-step"][data-k="0"]');
    await wait();
    ok('…"Now" goes back to this one', await ev(() => __ulTest.ui.season === null));

    // ── Series, Quotes, Diary, Playing ──
    await ev(() => {
        __ulTest.setMode("novels");
        __ulTest.goTab("series");
    });
    await wait();
    ok(
        "Series: the books of a series together, in order, with the next one",
        (await svelte()) &&
            (await ev(
                () =>
                    /Orchards/.test(document.querySelector(".series h3")!.textContent) &&
                    document.querySelectorAll(".series .sitem").length === 2 &&
                    /The Iron Orchard/.test(document.querySelector(".series p.hint")!.textContent)
            ))
    );
    await ev(() => __ulTest.goTab("quotes"));
    await wait();
    ok(
        "Quotes: every line saved, newest first",
        await ev(
            () =>
                [...document.querySelectorAll(".qcard blockquote")].map(x => x.textContent).join("|") ===
                "Glass remembers.|Every orchard keeps a secret."
        )
    );
    await p.click("#quote-q");
    await p.keyboard.type("orch");
    await wait();
    ok(
        "…searching narrows them as you type, and the box keeps its cursor",
        await ev(
            () =>
                document.querySelectorAll(".qcard").length === 2 &&
                document.activeElement!.id === "quote-q" &&
                (document.activeElement as HTMLInputElement).value === "orch" /* cast: the box that has focus */
        )
    );
    await p.fill("#quote-q", "secret");
    await wait();
    ok(
        "…and what you searched for is kept when you come back",
        (await ev(() => document.querySelectorAll(".qcard").length === 1)) &&
            (await (async () => {
                await ev(() => {
                    __ulTest.goTab("series");
                    __ulTest.goTab("quotes");
                });
                await wait();
                return ev(
                    () =>
                        document.querySelector<HTMLInputElement>("#quote-q")!.value === "secret" &&
                        document.querySelectorAll(".qcard").length === 1
                );
            })())
    );
    await ev(() => {
        __ulTest.setMode("screen");
        __ulTest.goTab("diary");
    });
    await wait();
    ok(
        "Diary: each watch by month, a rewatch marked",
        (await svelte()) &&
            (await ev(
                () =>
                    document.querySelectorAll(".drow2").length === 2 &&
                    [...document.querySelectorAll(".drow2 .dx")].some(x => x.textContent.includes("↻"))
            ))
    );
    await ev(() => {
        __ulTest.setMode("games");
        __ulTest.goTab("playing");
    });
    await wait();
    ok(
        "Playing: what you play, with hours",
        (await svelte()) &&
            (await ev(
                () =>
                    /Pocket Courier/.test(document.querySelector(".gcard")!.textContent) &&
                    /2 h played/.test(document.querySelector(".gcard .pg")!.textContent)
            ))
    );
    await p.click('.gcard [data-act="log-add"][data-k="2"]');
    await wait(300);
    ok(
        '…"+2 h" logs it, and the page shows it',
        await ev(
            i =>
                __ulTest.items.get(i)!.prog === 4 &&
                /4 h played/.test(document.querySelector(".gcard .pg")!.textContent),
            ids.game
        )
    );
    await ev(() => {
        __ulTest.ui.hiddenView = true;
        __ulTest.render();
    });
    await wait();
    ok(
        "a mode page says when you're looking at what you hid",
        await ev(() => /Hidden: these are left out/.test(document.querySelector(".tabbody .note")?.textContent || ""))
    );
    await ev(() => {
        __ulTest.ui.hiddenView = false;
        __ulTest.render();
    });

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
