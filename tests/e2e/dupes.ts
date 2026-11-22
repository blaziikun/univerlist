// The same show can arrive as TV (TMDB, TVmaze) and as anime (AniList). Search and the review step say so, and a live-action remake years later isn't flagged.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok } from "./helpers.ts";
import type { Candidate, Modal } from "../../src/features/core/model";
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
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
        __ulTest.addItem({ medium: "tv", title: "Spy x Family", year: 2022, status: "want" }); // added from the TV search
        __ulTest.addItem({ medium: "tv", title: "Cowboy Bebop", year: 2021, status: "want" }); // the live-action one
        __ulTest.addItem({
            medium: "anime",
            title: "Frieren: Beyond Journey’s End",
            alt: { en: "Frieren: Beyond Journey’s End", romaji: "Sousou no Frieren" },
            year: 2023,
            status: "want",
        });
        // the Add dialog as it shows (library/add/, drawn by Svelte)
        const shown = (m: Partial<Modal>) => {
            __ulTest.openModal("add", m);
            const t = document.querySelector("#overlay .modal")!.textContent;
            __ulTest.closeModal();
            return t;
        };
        const html = (medium: string, c: Candidate) =>
            shown({ step: "search", medium, results: [c], q: "x", busy: false });
        return {
            sameShow: !!__ulTest.findSibling("Spy x Family", "anime", 2022),
            yearOff1: !!__ulTest.findSibling("Spy x Family", "anime", 2023),
            remake: !!__ulTest.findSibling("Cowboy Bebop", "anime", 1998),
            otherTitle: !!__ulTest.findSibling("Spy x Family Code: White", "anime", 2023),
            other: !!__ulTest.findSibling("Sousou no Frieren", "tv", 2023),
            notBooks: __ulTest.findSibling("Spy x Family", "book", 2022) === null,
            listMarked: /In your library as show/.test(
                html("anime", {
                    title: "Spy x Family",
                    medium: "anime",
                    year: 2022,
                    total: 25,
                    ext: { anilist: 140960 },
                    src: "anilist",
                })
            ),
            listClean: !/In your library/.test(
                html("anime", {
                    title: "Cowboy Bebop",
                    medium: "anime",
                    year: 1998,
                    total: 26,
                    ext: { anilist: 1 },
                    src: "anilist",
                })
            ),
            eps: /25 eps/.test(
                html("anime", {
                    title: "Spy x Family",
                    medium: "anime",
                    year: 2022,
                    total: 25,
                    ext: { anilist: 140960 },
                    src: "anilist",
                })
            ),
            review: /already in your library as show/.test(
                shown({
                    step: "review",
                    medium: "anime",
                    draft: { title: "Spy x Family", medium: "anime", year: 2022, ext: { anilist: 140960 } },
                })
            ),
        };
    });
    ok("same show, TV then anime, is spotted", r.sameShow);
    ok("a year apart still counts", r.yearOff1);
    ok("a live-action remake decades later does not", !r.remake);
    ok("a different title does not", !r.otherTitle);
    ok("the romaji / English names count", r.other);
    ok("it only looks across anime and TV", r.notBooks);
    ok("the search result says where you have it", r.listMarked);
    ok("an unrelated result is left alone", r.listClean);
    ok("results show the episode count", r.eps);
    ok("the review step warns before a second entry", r.review);
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
})();
