// The Watch and Read pages with invented data (what watch-page, watch-seasons and search-watch-read check against one
// of your own exports): searching as you type with the keys, a show's page and its seasons, Continue watching, your
// media servers set up (add, test, a pattern that isn't yours refused), browsing a server and picking the right title by
// hand; then Read: its search, a reading server (an OPDS catalogue) browsed down to a chapter, a book's page with what
// the server has, and Watch & read's own look.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { Route } from "playwright";
import type { MediaServer } from "../../src/features/core/model";
const J = (r: Route, b: unknown) =>
    r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(b),
        headers: { "access-control-allow-origin": "*" },
    });
const X = (r: Route, b: string) =>
    r.fulfill({
        status: 200,
        contentType: "application/atom+xml",
        body: b,
        headers: { "access-control-allow-origin": "*" },
    });
const feed = (t: string, e: string) =>
    `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:pse="http://vaemendis.net/opds-pse/ns"><title>${t}</title>${e}</feed>`;
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await setup(c);
    // a media server on your own network, and a reading server
    await c.route(/192\.168\.1\.30:8096/, r => {
        const u = r.request().url();
        if (/System\/Info/.test(u)) return J(r, { ServerName: "Living room" });
        if (/\/Episodes/.test(u))
            return J(r, {
                Items: [1, 2, 3].map(i => ({
                    Id: "e" + i,
                    IndexNumber: i,
                    ParentIndexNumber: 1,
                    Name: "Episode " + i,
                })),
            });
        if (/searchTerm=/.test(u))
            return J(r, {
                Items: [
                    { Id: "jf1", Name: "White Collar", ProductionYear: 2009, Type: "Series" },
                    { Id: "jf2", Name: "White Collar Extras", ProductionYear: 2010, Type: "Series" },
                    { Id: "jf3", Name: "Quiet Harbour", ProductionYear: 2019, Type: "Movie" },
                ],
            });
        J(r, {
            Items: [
                { Id: "jf1", Name: "White Collar", ProductionYear: 2009, Type: "Series" },
                { Id: "jf3", Name: "Quiet Harbour", ProductionYear: 2019, Type: "Movie" },
            ],
        });
    });
    await c.route(/192\.168\.1\.40:25600/, r => {
        const u = r.request().url();
        if (/series\/s1/.test(u))
            return X(
                r,
                feed(
                    "Paper Lanterns",
                    [1, 2, 3]
                        .map(
                            i =>
                                `<entry><title>Paper Lanterns Chapter ${i}</title><link rel="http://opds-spec.org/acquisition" type="application/zip" href="/opds/ch${i}.cbz"/><link rel="http://vaemendis.net/opds-pse/stream" type="image/jpeg" href="/opds/pse/${i}/{pageNumber}" pse:count="12"/></entry>`
                        )
                        .join("")
                )
            );
        X(
            r,
            feed(
                "Komga at home",
                `<entry><title>Paper Lanterns</title><link rel="subsection" type="application/atom+xml;profile=opds-catalog;kind=navigation" href="/opds/series/s1"/></entry>`
            )
        );
    });
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const ids = await ev(() => ({
        tv: __ulTest.addItem({
            medium: "tv",
            title: "Long Road",
            year: 2015,
            total: 20,
            prog: 2,
            status: "active",
            lastAt: "2024-06-02T00:00:00Z",
        }),
        film: __ulTest.addItem({
            medium: "film",
            title: "Quiet Harbour",
            year: 2019,
            status: "redo",
            lastAt: "2024-06-01T00:00:00Z",
        }),
        comic: __ulTest.addItem({
            medium: "comic",
            title: "Paper Lanterns",
            year: 2019,
            total: 30,
            prog: 1,
            status: "active",
            lastAt: "2024-06-03T00:00:00Z",
        }),
    }));

    // ── Watch ──
    await ev(() => __ulTest.actOn(new Event("click"), document.body, "go-stage", "", "", null));
    await p.waitForSelector("#wq");
    ok(
        "Watch shows what you're in the middle of",
        await ev(
            () =>
                [...document.querySelectorAll(".stcont .sli .st")].map(x => x.textContent).join() ===
                "Long Road,Quiet Harbour"
        ),
        await ev(() => [...document.querySelectorAll(".stcont .sli .st")].map(x => x.textContent).join())
    );
    await p.click(".stcont summary");
    await p.waitForTimeout(100);
    ok("…folded away, and that's remembered", await ev(() => __ulTest.meta.settings.stageCont === false));
    await p.click(".stcont summary");
    await p.fill("#wq", "White");
    await p.waitForFunction(() => (__ulTest.W.results || []).length && !__ulTest.W.busy, null, { timeout: 8000 });
    ok(
        "typing searches as you go, and the box keeps your cursor",
        await ev(
            () =>
                document.activeElement!.id === "wq" &&
                !!document.querySelector("#sres .sli") &&
                document.querySelector<HTMLElement>(".stcont")!.hidden
        ),
        await ev(() => document.activeElement!.id)
    );
    ok("…with a ✕ to clear it", await ev(() => !!document.querySelector(".sq .sqx")));
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("ArrowUp");
    ok(
        "↓ ↑ move the mark through the results",
        await ev(() => document.querySelector("#sres .sli")!.classList.contains("on"))
    );
    await p.click(".stog input");
    ok("Covers shows them as covers", await ev(() => !!document.querySelector("#sres .wgrid .wtile")));
    await p.click(".stog input");
    await p.keyboard.press("Escape");
    await p.focus("#wq");
    await p.keyboard.press("Escape");
    ok(
        "Escape empties the box and puts the page back, Continue watching too (after switching to covers and back)",
        await ev(() => {
            const s = document.querySelector<HTMLElement>(".stcont");
            return (
                !__ulTest.W.q &&
                !document.querySelector("#sres .sli") &&
                !!s &&
                !s.hidden &&
                document.querySelector<HTMLInputElement>("#wq")!.value === ""
            );
        })
    );
    await p.fill("#wq", "White");
    await p.waitForFunction(() => (__ulTest.W.results || []).length && !__ulTest.W.busy, null, { timeout: 8000 });
    await p.focus("#wq");
    await p.keyboard.press("Enter");
    await p.waitForSelector("#cinema");
    await p.waitForFunction(() => __ulTest.W.seasons.length === 2, null, { timeout: 8000 });
    ok(
        "Enter opens the show, its player on the first episode",
        await ev(
            () =>
                __ulTest.W.view === "show" &&
                __ulTest.W.player &&
                __ulTest.W.player.e === 1 &&
                !!document.querySelector("#cinema .cs-eps")
        )
    );
    await ev(() => (document.activeElement as HTMLElement).blur()); /* cast: the box just typed in */
    await p.keyboard.press("Escape");
    await p.waitForTimeout(200);
    ok(
        "Escape: the show's page, its seasons and episodes",
        await ev(
            () =>
                !document.querySelector("#cinema") &&
                document.querySelectorAll(".wseasons .chip").length === 2 &&
                document.querySelectorAll(".weps .wep").length === 14
        )
    );
    await p.click('.wseasons .chip[data-k="1"]');
    await p.waitForTimeout(200);
    ok(
        "a season chip shows that season",
        await ev(
            () =>
                __ulTest.W.si === 1 &&
                document.querySelector('.wseasons .chip[data-k="1"]')!.getAttribute("aria-pressed") === "true"
        )
    );
    await p.click('[data-act="watch-add"]');
    await p.waitForTimeout(200);
    ok(
        "+ Add to my list adds it, and its card is a press away",
        await ev(() => !!__ulTest.W.show!.id && !!document.querySelector('.wshow [data-act="open"]'))
    );
    await p.click('.weps .wep [data-act="watch-mark"][data-k="2"]');
    await p.waitForTimeout(200);
    ok(
        "ticking an episode watched saves it",
        await ev(
            () =>
                (__ulTest.items.get(__ulTest.W.show!.id!)!.epsSeen || []).includes("2x2") &&
                document.querySelector('.weps [data-act="watch-mark"][data-k="2"]')!.getAttribute("aria-pressed") ===
                    "true"
        ),
        await ev(() => JSON.stringify(__ulTest.items.get(__ulTest.W.show!.id!)!.epsSeen))
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    ok("Escape again: back to Watch", await ev(() => __ulTest.W.view === "home"));
    await p.click('[data-act="stage-clear"]');
    ok(
        "✕ clears the search, and the box is ready to type in",
        await ev(
            () =>
                !__ulTest.W.q &&
                document.activeElement!.id === "wq" &&
                document.querySelector<HTMLInputElement>("#wq")!.value === ""
        )
    );

    // ── your media servers ──
    await p.click('[data-act="watch-servers"]');
    ok("Servers opens your media servers", await ev(() => !!document.querySelector(".wservers .libs")));
    await p.click('[data-act="lib-add"][data-k="jellyfin"]');
    await p.waitForTimeout(120);
    ok(
        "+ Jellyfin adds one, its address box ready to type in",
        await ev(
            () =>
                Array.isArray(__ulTest.meta.settings.libs) &&
                __ulTest.meta.settings.libs.length === 1 &&
                document.activeElement instanceof HTMLElement &&
                document.activeElement.dataset.f === "url"
        )
    );
    await p.keyboard.type("http://192.168.1.30:8096");
    await p.fill('[data-lib][data-f="key"]', "abc");
    await p.fill('[data-lib][data-f="name"]', "Living room");
    await p.click(".wservers h3");
    ok(
        "its address, name and key are kept (the key with your keys)",
        await ev(() => {
            const l = (
                __ulTest.meta.settings.libs as MediaServer[]
            )[0]; /* cast: Settings keep the servers list unchecked */
            return (
                l.url === "http://192.168.1.30:8096" && l.name === "Living room" && __ulTest.KEYS.libs![l.id] === "abc"
            );
        })
    );
    await p.click('[data-act="lib-test"]');
    await p.waitForSelector(".libst.ok");
    ok(
        "Test reaches it and says so",
        await ev(() => document.querySelector(".libst.ok")!.textContent === "✓ Living room")
    );
    await p.click(".wpat summary");
    await p.click('[data-act="srv-add"]');
    await p.waitForTimeout(100);
    await p.fill('[data-srv="0"][data-f="pattern"]', "https://elsewhere.example/{title}.mp4");
    await p.click(".wservers h3");
    await p.waitForTimeout(100);
    ok(
        "a link pattern that isn't one of your own sources isn't kept",
        await ev(
            () =>
                !__ulTest.meta.settings.servers![0].pattern &&
                document.querySelector<HTMLInputElement>('[data-srv="0"][data-f="pattern"]')!.value === "" &&
                /your own videos/.test((document.querySelector(".toast") || {}).textContent || "")
        )
    );
    await p.fill('[data-srv="0"][data-f="pattern"]', "http://nas.local/{title}/S{s2}E{e2}.mp4");
    await p.click(".wservers h3");
    ok(
        "…one on your own network is",
        await ev(() => __ulTest.meta.settings.servers![0].pattern === "http://nas.local/{title}/S{s2}E{e2}.mp4")
    );
    await p.click('[data-act="srv-del"]');
    ok("✕ removes it", await ev(() => !__ulTest.meta.settings.servers!.length));
    const code = await ev(
        () =>
            "UL1:" +
            btoa(
                JSON.stringify({ t: "plex", n: "Rin's Plex", u: "http://192.168.1.31:32400", k: "tok", f: "Rin", r: 0 })
            )
    );
    await p.fill("#lib-code-libs", code);
    await p.click('[data-act="lib-code"][data-set="libs"]');
    // (a cast: Settings keep the servers list unchecked)
    ok(
        "a friend's server code adds their server, and the box empties",
        await ev(
            () =>
                // cast: Settings keep the servers list unchecked
                (__ulTest.meta.settings.libs as MediaServer[]).some(l => l.type === "plex" && l.from === "Rin") &&
                document.querySelector<HTMLInputElement>("#lib-code-libs")!.value === ""
        )
    );
    await p.click('.librow:nth-child(2) [data-act="lib-del"]');
    ok(
        "…and ✕ takes it away again",
        await ev(() => (__ulTest.meta.settings.libs as MediaServer[]).length === 1)
    ); /* cast: as above */
    await p.click('.wservers [data-act="watch-servers"]');
    await p.click('[data-act="lib-browse"]');
    await p.waitForSelector('[data-act="lib-open"]');
    ok(
        "On your servers: what's on it",
        await ev(
            () =>
                [...document.querySelectorAll('[data-act="lib-open"] .t')].map(x => x.textContent).join() ===
                "White Collar,Quiet Harbour"
        )
    );
    await p.fill("#lib-bq", "quiet");
    await p.press("#lib-bq", "Enter");
    ok("…filtered by name", await ev(() => document.querySelectorAll('[data-act="lib-open"]').length === 1));
    await p.click('[data-act="lib-open"]');
    await p.waitForFunction(
        () => __ulTest.W.show && __ulTest.W.show.title === "Quiet Harbour" && !/Looking/.test(__ulTest.W.libNote),
        null,
        { timeout: 8000 }
    );
    ok(
        "opening one plays it from that server",
        await ev(
            () =>
                __ulTest.W.show!.medium === "film" &&
                __ulTest.W.lib.has("0:1") &&
                /Living room/.test(__ulTest.W.libNote)
        ),
        await ev(() => __ulTest.W.libNote)
    );
    await ev(() => {
        __ulTest.W.player = null;
        __ulTest.renderPlayer();
        __ulTest.renderMain();
    });
    await p.click('[data-act="lib-pick-open"]');
    await p.waitForSelector('[data-act="lib-pick"]');
    ok(
        '"Not the right one?" lists what the server has by that name',
        await ev(
            () =>
                document.querySelectorAll('[data-act="lib-pick"]').length >= 1 &&
                document.querySelector<HTMLInputElement>("#lib-q")!.value === "Quiet Harbour"
        )
    );
    await p.click('[data-act="lib-pick-close"]');
    ok("…and Close puts it away", await ev(() => !document.querySelector(".libpick")));

    // ── Read ──
    await p.click('[data-act="stage-switch"][data-k="read"]');
    await p.waitForSelector("#rq");
    ok(
        "Read: what you're reading",
        await ev(
            () => [...document.querySelectorAll(".stcont .sli .st")].map(x => x.textContent).join() === "Paper Lanterns"
        )
    );
    await p.fill("#rq", "Paper");
    await p.waitForFunction(() => document.querySelector("#sres .sli"), null, { timeout: 8000 });
    await p.waitForTimeout(800);
    ok(
        "its search lists your own first, with how far you are",
        await ev(() => {
            const r = document.querySelector("#sres .sli");
            return r!.querySelector(".st")!.textContent === "Paper Lanterns" && !!r!.querySelector(".pill.active");
        })
    );
    await p.focus("#rq");
    await p.keyboard.press("Escape");
    await p.click('[data-act="rl-servers"]');
    await p.click('[data-act="lib-add"][data-k="komga"]');
    await p.waitForTimeout(100);
    await p.keyboard.type("http://192.168.1.40:25600");
    await p.click(".wservers h3");
    ok(
        "a reading server is added to its own list",
        await ev(
            () =>
                // casts: Settings keep the servers lists unchecked
                ((__ulTest.meta.settings.rlibs || []) as MediaServer[]).length === 1 &&
                (__ulTest.meta.settings.rlibs as MediaServer[])[0].url === "http://192.168.1.40:25600" &&
                !((__ulTest.meta.settings.libs || []) as MediaServer[]).some(
                    l => l.type === "komga"
                ) /* casts: as above */
        )
    );
    await p.click('.wservers [data-act="rl-servers"]');
    await p.click('[data-act="rl-browse"]');
    await p.waitForSelector('[data-act="rl-bopen"]');
    await p.click('[data-act="rl-bopen"]');
    await p.waitForSelector('[data-act="rl-bread"]');
    ok(
        "browsing it: a series, then its chapters, with the way back",
        await ev(
            () =>
                document.querySelectorAll('[data-act="rl-bread"]').length === 3 &&
                !!document.querySelector('.crumbs [data-act="rl-up"]')
        )
    );
    await p.click('.crumbs [data-act="rl-up"]');
    await p.waitForSelector('[data-act="rl-bopen"]');
    ok("…and back up", await ev(() => !document.querySelector('[data-act="rl-bread"]')));
    await p.click('.stcont [data-act="read-open"]');
    await p.waitForFunction(() => !__ulTest.RLS.busy && __ulTest.RLS.list.length, null, { timeout: 8000 });
    ok(
        "a book's page: what your server has, with Continue on the next chapter",
        await ev(
            () =>
                /Continue: issue 2/.test(document.querySelector('[data-act="rl-read"].btn')!.textContent) &&
                document.querySelectorAll(".rlist .rlrow").length === 3 &&
                document.querySelector(".rlrow")!.classList.contains("seen")
        ),
        await ev(() => (document.querySelector('[data-act="rl-read"].btn') || {}).textContent)
    );
    await p.click('[data-act="rl-pick-open"]');
    await p.waitForFunction(() => __ulTest.ui.rlPick && !__ulTest.ui.rlPick.busy);
    ok(
        "picking the series by hand lists it",
        await ev(() => document.querySelectorAll('[data-act="rl-pick"]').length === 1)
    );
    await p.click('[data-act="rl-pick"]');
    await p.waitForFunction(() => !__ulTest.RLS.busy && !__ulTest.ui.rlPick, null, { timeout: 8000 });
    ok("…and keeps it for this entry", await ev(i => !!__ulTest.meta.readMap![i], ids.comic));
    await p.click('[data-act="read-home"]');
    ok("← Back: the Read page", await ev(() => !__ulTest.RD.item && !!document.querySelector(".read.stage")));
    // Watch & read's own look
    await ev(() => __ulTest.goSettings("appearance"));
    await ev(
        () =>
            document.querySelector(".setsec details, details") &&
            [...document.querySelectorAll("details")].forEach(d => {
                d.open = true;
            })
    );
    await p.selectOption("[data-stagetheme]", "black");
    await ev(() => __ulTest.closeSettings());
    await p.waitForTimeout(200);
    ok(
        "Watch & read wear their own look",
        await ev(
            () =>
                __ulTest.meta.settings.stageTheme === "black" &&
                getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() === "#000000"
        ),
        await ev(() => getComputedStyle(document.documentElement).getPropertyValue("--bg"))
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
