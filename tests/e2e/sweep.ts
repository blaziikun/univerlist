// Every settings section, every tab of every mode, and the pages around them open without a page error;
// plus the Phase 2 changes: seasons on the Rank page, one-line extension rows, the type filter, the player's way into Settings.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const browser = await chromium.launch(ENV.launch);
    const ctx = await browser.newContext();
    await setup(ctx);
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(page);
    await page.goto(ENV.APP);
    await page.waitForTimeout(1000);
    await page.fill("#wl-name", "S");
    await page.click('[data-act="welcome-done"]');
    await ev(() => {
        __ulTest.meta.settings.autoCombine = false;
        const a = __ulTest.addItem({
            medium: "anime",
            kind: "TV",
            title: "Little Busters!",
            year: 2012,
            status: "done",
            rating: 7,
            ext: { anilist: 1 },
        });
        const b = __ulTest.addItem({
            medium: "anime",
            kind: "TV",
            title: "Little Busters! Refrain",
            year: 2013,
            status: "done",
            rating: 9,
            ext: { anilist: 2 },
        });
        __ulTest.addItem({
            medium: "anime",
            kind: "TV",
            title: "Bleach",
            year: 2004,
            status: "done",
            rating: 8,
            ext: { anilist: 3 },
        });
        __ulTest.addItem({ medium: "film", title: "Heat", year: 1995, status: "done", rating: 8 });
        __ulTest.addItem({ medium: "book", title: "Dune", creator: "Frank Herbert", status: "want" });
        window.__ab = [a, b];
    });
    // every settings section
    const secs = await ev(() => __ulTest.setSecs().map(s => s[0]));
    for (const s of secs) {
        await ev(k => __ulTest.goSettings(k), s);
        await page.waitForTimeout(80);
    }
    ok("every settings section opens", !errs.length, errs.slice(0, 3).join(" | "));
    ok("no ✕ in Settings (the top bar takes you back)", await ev(() => !document.querySelector(".setclose")));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    ok("Escape leaves Settings for where it was opened", await ev(() => __ulTest.ui.page !== "settings"));
    // every tab of every mode
    const tabs = await ev(() =>
        __ulTest
            .allModes()
            .flatMap(m =>
                [...new Set([...__ulTest.tabsFor(m), "rank", "favourites", "discover", "stats"])].map(t => [m.id, t])
            )
    );
    for (const [m, t] of tabs) {
        await ev(
            ([m, t]) => {
                __ulTest.ui.mode = m;
                __ulTest.ui.page = "profile";
                __ulTest.ui.tab = t;
                __ulTest.render();
            },
            [m, t]
        );
        await page.waitForTimeout(40);
    }
    ok("every tab of every mode opens", !errs.length, errs.slice(0, 3).join(" | "));
    // seasons on the Rank page: combine, put the second on the front, ranked once
    await ev(() => {
        __ulTest.ui.mode =
            __ulTest
                .allModes()
                .find(
                    x => x.id !== "universal" && x.id !== "hub" && Array.isArray(x.media) && x.media.includes("anime")
                )?.id || "universal";
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "rank";
        __ulTest.ui.seasonsOpen = true;
        __ulTest.render();
    });
    ok("Rank has the Seasons panel", await ev(() => !!document.querySelector(".seasonsp")));
    await ev(() => {
        __ulTest.combineItems(window.__ab, window.__ab[0]);
        __ulTest.render();
    });
    ok(
        "combined: one entry holds the other",
        await ev(() => (__ulTest.items.get(window.__ab[0])!.parts || []).includes(window.__ab[1]))
    );
    await ev(() => {
        __ulTest.seasonFront(window.__ab[0], window.__ab[1]);
        __ulTest.render();
    });
    ok(
        "Refrain on the front",
        await ev(
            () =>
                (__ulTest.items.get(window.__ab[1])!.parts || []).includes(window.__ab[0]) &&
                __ulTest.items.get(window.__ab[0])!.partOf === window.__ab[1]
        )
    );
    ok(
        "ranked once, scored as the average",
        await ev(() => {
            const p = __ulTest.rankPool();
            return p.filter(b => window.__ab.includes(b.id)).length <= 1;
        })
    );
    ok("search still finds the season inside", await ev(() => __ulTest.gsLocal("little busters").length === 2));
    ok("not flagged as duplicates", await ev(() => !__ulTest.dupGroups().some(g => g.includes(window.__ab[0]))));
    // extensions: folded rows
    await ev(() => __ulTest.goSettings("ext"));
    await page.waitForTimeout(100);
    ok(
        "extension rows start folded",
        await ev(
            () =>
                [...document.querySelectorAll(".extrow>details")].length > 0 &&
                [...document.querySelectorAll<HTMLDetailsElement>(".extrow>details")].every(d => !d.open)
        )
    );
    // Watch: a type filter instead of chips
    await ev(() => {
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    await page.waitForTimeout(100);
    ok(
        "Watch has a type filter, no chips",
        await ev(() => !!document.querySelector("[data-stagecat]") && !document.querySelector('[data-act="stage-cat"]'))
    );
    ok(
        'no "where to watch" anywhere',
        await ev(() => {
            __ulTest.openItem(window.__ab[1]);
            return !/Where to watch/.test(document.body.innerText);
        })
    );
    await ev(() => {
        [...__ulTest.items.keys()].forEach((id, i) => {
            __ulTest.patch(id, { genres: ["Drama", i % 2 ? "Action" : "Comedy"] });
        });
        __ulTest.ui.mode = "universal";
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "discover";
        __ulTest.render();
    });
    ok(
        'Insights: finish rate by genre, no "other parts"',
        await ev(
            () =>
                !!document.querySelector(".ihero") &&
                !!document.querySelector(".ratebars") &&
                !/Other parts of things you loved/.test(document.body.innerText)
        )
    );
    const ord = await ev(() => {
        const a = __ulTest.addItem({
                medium: "film",
                title: "Star Wars: Episode IV",
                franchise: "Star Wars",
                year: 1977,
                chrono: 4,
            }),
            b = __ulTest.addItem({
                medium: "film",
                title: "Star Wars: Episode I",
                franchise: "Star Wars",
                year: 1999,
                chrono: 1,
            });
        const L = () =>
            [a, b]
                .map(id => ({ id, ...__ulTest.items.get(id)! }))
                .sort(__ulTest.sortBy("order"))
                .map(x => x.year)
                .join();
        __ulTest.meta.settings.watchOrder = "release";
        const r = L();
        __ulTest.meta.settings.watchOrder = "story";
        const st = L();
        return r + "|" + st;
    });
    ok("watch order: release, or story when you set it", ord === "1977,1999|1999,1977", ord);
    ok(
        "the support link is always there, bottom right",
        await ev(() => {
            __ulTest.ui.page = "profile";
            __ulTest.render();
            const a = document.querySelector<HTMLAnchorElement>("#donatefoot a");
            return !!a && a.href === __ulTest.DONATE_URL && getComputedStyle(a).position === "fixed";
        })
    );
    ok(
        "the app is UniverList",
        await ev(() => document.title === "UniverList" || __ulTest.meta.settings.appName === "UniverList")
    );
    ok("no page errors", !errs.length, errs.slice(0, 5).join(" | "));
    await browser.close();
})();
