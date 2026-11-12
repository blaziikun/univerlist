// The Watch search finds shows in the catalogues only (never your library), lists one entry per show,
// and keeps different shows that only share a name apart.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok } from "./helpers.ts";
import type { Candidate } from "../../src/features/core/model";
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
    const merge = (q: string, an: Candidate[], tv: Candidate[], fl: Candidate[]) =>
        p.evaluate(
            ([q, an, tv, fl]) =>
                __ulTest.mergeWatchResults(q, an, tv, fl).map(r => ({
                    t: r.title,
                    m: r.medium,
                    k: r.kind,
                    y: r.year,
                    tvmaze: (r.ext || {}).tvmaze,
                    anilist: (r.ext || {}).anilist,
                })),
            [q, an, tv, fl] as const
        );
    const A = (id: number, title: string, year: number, season: string, kind = "TV"): Candidate => ({
        src: "anilist",
        medium: "anime",
        kind,
        title,
        year,
        season,
        ext: { anilist: id },
    });
    const T = (id: number, title: string, year: number): Candidate => ({
        src: "tvmaze",
        medium: "tv",
        kind: "Scripted",
        title,
        year,
        ext: { tvmaze: id },
    });
    const F = (title: string, year: number): Candidate => ({
        src: "tmdb",
        medium: "film",
        kind: "Film",
        title,
        year,
        ext: { tmdb: 1 },
    });

    // one franchise: three seasons and a film on AniList, one listing on TVmaze
    let r = await merge(
        "bungo stray dogs",
        [
            A(1, "Bungo Stray Dogs", 2016, "SPRING"),
            A(2, "Bungo Stray Dogs 2nd Season", 2016, "FALL"),
            A(3, "Bungo Stray Dogs 3rd Season", 2019, "SPRING"),
            A(4, "Bungo Stray Dogs: Dead Apple", 2018, "SPRING", "Movie"),
        ],
        [T(77, "Bungo Stray Dogs", 2016)],
        []
    );
    ok(
        "seasons and the TV listing are one entry",
        r.filter(x => x.k !== "Movie").length === 1 && r[0].t === "Bungo Stray Dogs" && r[0].m === "anime",
        JSON.stringify(r)
    );
    ok("it keeps what TVmaze knows (for episode titles)", r[0].tvmaze === 77 && r[0].anilist === 1);
    ok(
        "its film stays its own entry",
        r.some(x => x.k === "Movie")
    );

    // different shows that only share a name
    r = await merge("monster", [A(10, "Monster", 2004, "FALL")], [T(5, "Monster", 2010)], []);
    ok(
        "same name, different years: two shows",
        r.length === 2 &&
            r
                .map(x => x.m)
                .sort()
                .join() === "anime,tv",
        JSON.stringify(r)
    );

    // an anime film that is also listed as a film
    r = await merge("your name", [A(20, "Your Name.", 2016, "SUMMER", "Movie")], [], [F("Your Name.", 2016)]);
    ok(
        "anime film and film listing are one entry, as the film",
        r.length === 1 && r[0].m === "film" && r[0].anilist === 20,
        JSON.stringify(r)
    );

    // best matches first, fuzzy leftovers dropped when there are enough real ones
    r = await merge(
        "white collar",
        [],
        [
            T(1, "The White Collar Gang", 2020),
            T(2, "Blue Collar TV", 2002),
            T(3, "White Collar", 2009),
            T(4, "White Collar Blues", 2001),
        ],
        []
    );
    ok(
        "exact name first, then names starting with it",
        r[0].t === "White Collar" && r[1].t === "White Collar Blues",
        r.map(x => x.t).join(" | ")
    );
    ok("loose matches are left out when there are real ones", !r.some(x => x.t === "Blue Collar TV"));
    r = await merge("zzz", [], [T(1, "Blue Collar TV", 2002)], []);
    ok("with nothing better, the loose match is still shown", r.length === 1);

    // a big franchise, as one search returned it: series, OVA, specials, trailer, TV listings of two parts, a pile of films
    const FA = (title: string, year: number, kind: string): Candidate => ({
        src: "wikidata",
        medium: "film",
        kind,
        title,
        year,
        ext: { wikidata: title + year },
    });
    const tvz = (id: number, title: string, year: number, genres: string[]): Candidate => ({
        ...T(id, title, year),
        kind: "Western animation",
        genres,
    });
    r = await merge(
        "bleach",
        [
            A(1, "Bleach", 2004, "FALL"),
            A(2, "Bleach: Thousand-Year Blood War", 2022, "FALL"),
            A(3, "Bleach Colorful!: Gotei Juusan Yatai Daisakusen!", 2008, "FALL", "OVA"),
            A(4, "BLEACH: memories in the rain", 2004, "FALL", "Special"),
            A(5, "BLEACH: The Sealed Sword Frenzy", 2006, "FALL", "Special"),
            A(6, "BLEACH 20th Anime Anniversary Official Trailer", 2024, "FALL", "Special"),
            A(7, "Bleach the Movie: Memories of Nobody", 2006, "SUMMER", "Movie"),
        ],
        [tvz(8, "Bleach", 2004, ["Anime"]), tvz(9, "Bleach: Thousand-Year Blood War", 2022, ["Anime"])],
        [
            FA("Bleach", 2018, "World cinema"),
            FA("Bleach", 2023, "Hollywood"),
            FA("Bleach", 2021, "Hollywood"),
            FA("Bleach", 2016, "Hollywood"),
            FA("Bleach", 1998, "Hollywood"),
            FA("Bleach the Movie: Hell Verse", 2010, "Anime film"),
            FA("Bleach the Movie: Fade to Black", 2008, "Anime film"),
            FA("Bleach Bone", 2015, "Hollywood"),
            FA("Bleach the Movie: The DiamondDust Rebellion", 2007, "Anime film"),
        ]
    );
    ok(
        "the series is first and is one entry",
        r[0].t === "Bleach" && r[0].m === "anime" && r[0].tvmaze === 8 && r.filter(x => x.m === "tv").length === 0,
        r.map(x => x.t + " " + x.y).join(" | ")
    );
    ok(
        "OVAs, specials and the trailer are hidden",
        !r.some(x => /Colorful|memories in the rain|Sealed Sword|Trailer/i.test(x.t))
    );
    ok(
        "the franchise's movies are all there, before unrelated films",
        ["Hell Verse", "Fade to Black", "DiamondDust", "Memories of Nobody"].every(n => r.some(x => x.t.includes(n))) &&
            r.findIndex(x => x.m === "film" && x.t === "Bleach") > r.findIndex(x => /DiamondDust/.test(x.t))
    );
    ok(
        "a film that only shares the start of the name comes after the franchise's movies",
        r.findIndex(x => /Bleach Bone/.test(x.t)) > r.findIndex(x => /DiamondDust/.test(x.t))
    );
    ok(
        "unrelated films called Bleach are kept to two",
        r.filter(x => x.m === "film" && x.t === "Bleach").length === 2 && r.length <= 10,
        r.length + " results"
    );
    r = await merge(
        "bleach the sealed sword frenzy",
        [A(1, "Bleach", 2004, "FALL"), A(5, "BLEACH: The Sealed Sword Frenzy", 2006, "FALL", "Special")],
        [],
        []
    );
    ok(
        "search for a special by name and it is there",
        r.some(x => /Sealed Sword/.test(x.t)),
        r.map(x => x.t).join(" | ")
    );

    // adult titles stay hidden unless the private collection is open
    r = await merge("x", [{ ...A(30, "X Show", 2020, "FALL"), flag: true }], [], []);
    ok("flagged titles are hidden", r.length === 0);

    // the library has no say: a show only in your library isn't found, and results don't mark what you own
    await p.evaluate(() => {
        __ulTest.addItem({ medium: "tv", title: "Zzyzx Library Only", status: "active" });
        __ulTest.goWatch();
    });
    await p.waitForSelector("#wq");
    await p.fill("#wq", "Zzyzx");
    await p.waitForTimeout(1500);
    const res = await p.evaluate(() => ({
        list: (__ulTest.W.results || []).map(x => x.title),
        pills: document.querySelectorAll("#sres .pill").length,
    }));
    ok(
        "a show only in your library isn't in the results",
        !res.list.some(t => /Zzyzx/.test(t)),
        JSON.stringify(res.list)
    );
    await p.fill("#wq", "Frieren");
    await p.waitForTimeout(1500);
    const res2 = await p.evaluate(() => ({
        list: (__ulTest.W.results || []).map(x => x.title),
        pills: document.querySelectorAll("#sres .pill").length,
    }));
    ok(
        "results show no library marks",
        res2.list.some(t => /Frieren/.test(t)) && res2.pills === 0,
        JSON.stringify(res2)
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
})();
