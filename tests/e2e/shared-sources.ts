// On a site that runs the Worker, films, TV and games work with no key: the app asks the site's own /api, which adds
// the site's keys. Your own key, once added, is used instead. With no /api (the one-file version), nothing is assumed.
import fs from "node:fs";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { Route } from "playwright";
const SITE = "https://univerlist.test";
const html = fs.readFileSync(ENV.APP.replace(/^file:\/\//, ""), "utf8");
const json = (r: Route, body: unknown) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const asked: string[] = [];
    // the site: the app itself, and an /api that shares TMDB and IGDB
    await c.route(SITE + "/**", r => {
        const u = new URL(r.request().url());
        if (!u.pathname.startsWith("/api/")) return r.fulfill({ status: 200, contentType: "text/html", body: html });
        asked.push(r.request().method() + " " + u.pathname + u.search);
        if (u.pathname === "/api/status") return json(r, { tmdb: true, igdb: true, shared: ["tmdb", "igdb"] });
        if (u.pathname === "/api/tmdb/search/movie")
            return json(r, {
                results: [
                    {
                        id: 438631,
                        title: "Dune",
                        release_date: "2021-09-15",
                        poster_path: "/d.jpg",
                        original_language: "en",
                        genre_ids: [878],
                    },
                ],
            });
        if (u.pathname === "/api/igdb/games")
            return json(r, [
                {
                    id: 7346,
                    name: "The Legend of Zelda: Breath of the Wild",
                    slug: "zelda-botw",
                    first_release_date: 1488499200,
                    cover: { image_id: "co3p2d" },
                },
            ]);
        return json(r, {});
    });
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(SITE + "/");
    await p.waitForTimeout(900);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await p
        .waitForFunction(() => __ulTest.siteShares.tmdb && __ulTest.siteShares.igdb, null, { timeout: 5000 })
        .catch(() => {});

    const st = await ev(() => ({
        tmdb: __ulTest.TMDB_ON(),
        igdb: __ulTest.IGDB_ON(),
        keys: !!(__ulTest.KEYS.tmdb || __ulTest.KEYS.igdb),
    }));
    ok("with no keys of your own, the site's TMDB and IGDB are on", st.tmdb && st.igdb && !st.keys, JSON.stringify(st));

    const st2 = await ev(async () => (await __ulTest.tmdbSearch("dune", "film")).map(x => x.title));
    ok(
        "a film search goes through the site's /api, with no key",
        st2.join() === "Dune" && asked.some(a => a.startsWith("GET /api/tmdb/search/movie?query=dune")),
        asked.join(" · ")
    );
    ok("…and never straight to TMDB, and never with a key in the address", !asked.some(a => /api_key/.test(a)));

    const st3 = await ev(
        async () =>
            ((await __ulTest.igdbQ("games", 'fields name; search "zelda";')) as { name: string }[]).map(
                x => x.name
            ) /* cast: IGDB's answer, as the stand-in server gives it */
    );
    ok(
        "a game lookup goes through the site's /api too",
        /Zelda/.test(st3.join()) && asked.includes("POST /api/igdb/games"),
        st3.join()
    );

    await ev(() => __ulTest.goSettings("data"));
    await p.waitForTimeout(300);
    const st4 = await ev(() => (document.querySelector<HTMLElement>(".settings") || document.body).innerText);
    ok(
        "Settings says the site already brings films, TV and games, and your keys are optional",
        /Your own keys \(optional\)/.test(st4) && /already brings films and TV \(TMDB\) and games \(IGDB\)/.test(st4)
    );

    // your own key wins
    asked.length = 0;
    await ev(() => {
        __ulTest.KEYS.tmdb = "my-own-key";
    });
    await ev(async () => {
        try {
            await __ulTest.tmdbSearch("dune", "film");
        } catch (_) {}
    });
    ok(
        "with your own TMDB key, your browser asks TMDB itself, not the site",
        !asked.some(a => a.includes("/api/tmdb")),
        asked.join(" · ")
    );

    // the one-file version has no /api: nothing is assumed
    const p2 = await c.newPage();
    await p2.goto(ENV.APP);
    await p2.waitForTimeout(900);
    const st5 = await p2.evaluate(() => ({ tmdb: __ulTest.siteShares.tmdb, igdb: __ulTest.siteShares.igdb }));
    ok("the one-file version doesn't look for a site to borrow from", !st5.tmdb && !st5.igdb, JSON.stringify(st5));

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
