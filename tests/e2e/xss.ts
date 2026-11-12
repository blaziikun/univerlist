// Hostile text everywhere a name or note can come from (imports, catalogues, extensions, other people's lists): it shows as
// text on every page and never runs. This is the one-file build, with no security headers, so escaping is all that stops it.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { PathModule } from "../../src/features/core/model";
const X = `"><img src=x onerror="window.__x=(window.__x||0)+1"><svg onload="window.__x=1">'\``;
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const p = await c.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", X);
    await p.click('[data-act="welcome-done"]');
    await ev(X => {
        __ulTest.meta.profile.bio = X;
        for (const m of ["anime", "film", "book", "game", "tv", "manga"])
            __ulTest.addItem({
                medium: m,
                title: X,
                creator: X,
                kind: X,
                notes: X,
                about: X,
                genres: [X, "Drama"],
                themes: [X],
                tags: [X],
                status: "done",
                rating: 7,
                year: 2001,
                series: X,
                franchise: X,
                favWhy: X,
                fav: 1,
                cover: 'https://x.test/"><img src=x onerror=window.__x=9>.jpg',
                streams: [{ site: X, url: "javascript:window.__x=5" }],
            });
        __ulTest.meta.lists.push({
            id: "l1",
            name: X,
            desc: X,
            ids: [...__ulTest.items.keys()],
            notes: {},
            created: __ulTest.nowISO(),
        });
        __ulTest.meta.chars.push({ id: "c1", name: X, why: X, tags: [X], media: [], rank: 1 });
        __ulTest.ensureTag(X);
        const C = __ulTest.ACS();
        C.subjects.push({
            id: "s-x",
            name: X,
            g: X,
            fields: { [X]: { lvl: 1 } },
            order: [X],
            sources: [{ id: "q", kind: "uni", name: X, url: "javascript:window.__x=7", note: X }],
            opps: [{ id: "o", t: X, url: "javascript:window.__x=8", note: X }],
        });
        const P = __ulTest.lcNewPath({ name: X, sub: "s-x", uni: X, about: X, method: X });
        P.books.push({ id: "k", t: X, a: X, th: X, st: "reading", note: X, top: true });
        P.modules = [
            { id: "m", name: X, code: X, status: "taking", topics: [{ t: X, done: false }] } as PathModule,
        ]; /* cast: a module without a stage, as one from a file might be */
    }, X);
    await ev(() => {
        window.__bad = [];
        new MutationObserver(() => {
            for (const a of document.querySelectorAll(
                'a[href^="javascript:" i], img[src="x"], svg[onload], [onerror], [onload]'
            ))
                window.__bad.push(a.outerHTML.slice(0, 120));
        }).observe(document.body, { childList: true, subtree: true });
    });
    const pages = [];
    for (const m of await ev(() => __ulTest.allModes().map(x => x.id)))
        for (const t of [
            "overview",
            "library",
            "favourites",
            "stats",
            "lists",
            "discover",
            "rank",
            "learn",
            "curricula",
            "diary",
            "series",
            "quotes",
            "seasonal",
            "playing",
        ])
            pages.push(["tab", m, t]);
    for (const [, m, t] of pages) {
        await ev(
            ([m, t]) => {
                __ulTest.ui.mode = m;
                __ulTest.ui.page = "profile";
                __ulTest.ui.tab = t;
                if (t === "learn") __ulTest.ui.learnSub = "s-x";
                __ulTest.render();
            },
            [m, t]
        ).catch(e => errs.push(m + "/" + t + ": " + e.message));
        await p.waitForTimeout(30);
    }
    await ev(() => {
        __ulTest.ui.pwId = __ulTest.PWS()[0].id;
        __ulTest.ui.lcOpen = "m";
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(100);
    for (const s of await ev(() => __ulTest.setSecs().map(x => x[0]))) {
        await ev(k => __ulTest.goSettings(k), s);
        await p.waitForTimeout(40);
    }
    for (const id of await ev(() => [...__ulTest.items.keys()])) {
        await ev(i => {
            __ulTest.ui.page = "profile";
            __ulTest.render();
            __ulTest.openItem(i);
        }, id);
        await p.waitForTimeout(60);
        await ev(() => __ulTest.closeModal());
    }
    await ev(() => {
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    await p.waitForTimeout(100);
    await ev(X => {
        const i = document.querySelector<HTMLInputElement>("#gq");
        if (i) {
            __ulTest.focusSearch();
            i.value = X;
            i.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }, X);
    await p.waitForTimeout(400);
    const r = await ev(() => ({
        bad: [...new Set(window.__bad)].slice(0, 5),
        x: window.__x || 0,
        imgs: document.querySelectorAll('img[src="x"]').length,
        svg: document.querySelectorAll("svg[onload]").length,
        js: [...document.querySelectorAll('a[href^="javascript:"]')].length,
    }));
    ok("nothing hostile ran", r.x === 0, JSON.stringify(r));
    ok(
        "no injected elements anywhere, on any page along the way",
        !r.imgs && !r.svg && !r.bad.length,
        JSON.stringify(r)
    );
    ok("no javascript: links made from data", !r.js, JSON.stringify(r));
    ok("no page errors", !errs.length, errs.slice(0, 4).join(" | "));
    await b.close();
})();
