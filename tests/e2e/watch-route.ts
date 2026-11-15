// The player is a place: its address says the show, season and episode, so a refresh opens the same one again. Back
// (the player's ←, Escape or the browser's) goes straight back to the search as it was: what you typed, what it found,
// how far down you were; no show page in between. And episode names come from the catalogues for every show: when
// AniList and TVmaze don't name them, MyAnimeList does, and the player's header follows when they arrive.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1200, height: 420 } });
    await setup(c);
    // MyAnimeList (through Jikan) names Frieren's episodes; nothing else here does
    await c.route(/api\.jikan\.moe\/v4\/anime\/1003\/episodes/, r =>
        r.fulfill({
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify({
                data: ["Rebirth", "Confrontation", "Dealings", "Pursuit"].map((title, i) => ({
                    mal_id: i + 1,
                    title,
                    aired: "2006-10-0" + (i + 3) + "T00:00:00+00:00",
                })),
                pagination: { has_next_page: false },
            }),
        })
    );
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    // a long list to scroll: your own shows called Frieren…, and what the catalogues find
    await ev(() => {
        for (let i = 1; i <= 7; i++)
            // (TV, not anime: looking up their covers then doesn't queue up AniList's few requests a minute ahead of the search)
            __ulTest.addItem({ medium: "tv", title: "Frieren Side Story " + i, status: "want", year: 2010 + i });
        __ulTest.goWatch();
    });
    await p.click("#wq");
    await p.keyboard.type("Frie", { delay: 30 });
    await p.waitForFunction(
        () => (__ulTest.W.results || []).some(r => /^Frieren: Beyond/.test(r.title)) && !__ulTest.W.busy,
        null,
        {
            timeout: 15000,
        }
    );
    const row = p.locator('#sres [data-act="stage-pick"]', { hasText: /^Frieren: Beyond/ }).last();
    await row.scrollIntoViewIfNeeded();
    const y0 = await ev(() => Math.round(scrollY));
    const n0 = await ev(() => (__ulTest.W.results || []).length);
    await row.click();
    await p.waitForFunction(() => !!document.querySelector("#cinema") && __ulTest.W.player?.e != null, null, {
        timeout: 15000,
    });
    await p.waitForTimeout(800);

    // ---- the address ----
    ok(
        "the player has an address: the show, the season and the episode",
        /#watch\/al\.3\/1\/1$/.test(p.url()),
        p.url()
    );
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-ep"][data-k="3"]')!.click());
    await p.waitForTimeout(400);
    ok("another episode changes it (no new step in the history)", /#watch\/al\.3\/1\/3$/.test(p.url()), p.url());

    // ---- episode names from MyAnimeList ----
    await p
        .waitForFunction(() => /Dealings/.test(document.querySelector("#cinema .cs-h3")?.textContent || ""), null, {
            timeout: 15000,
        })
        .catch(() => {});
    ok(
        "episode names come from the catalogues (MyAnimeList here), and the header follows when they arrive",
        await ev(
            () =>
                /^Episodes: Dealings$/.test(document.querySelector("#cinema .cs-h3")!.textContent!.trim()) &&
                /Dealings/.test(document.querySelector("#cinema .cin-ep")!.textContent!) &&
                document.querySelector('#cinema [data-act="cin-ep"][data-k="1"]')!.getAttribute("title") ===
                    "1. Rebirth"
        ),
        await ev(() => document.querySelector("#cinema .cs-h3")?.textContent)
    );

    // ---- Back: straight to the search as it was ----
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-close"]')!.click());
    await p.waitForTimeout(500);
    const back = await ev(() => ({
        player: !!document.querySelector("#cinema"),
        view: __ulTest.W.view,
        show: !!document.querySelector(".wshow"),
        q: document.querySelector<HTMLInputElement>("#wq")!.value,
        n: (__ulTest.W.results || []).length,
        rows: document.querySelectorAll('#sres [data-act="stage-pick"]').length,
        y: Math.round(scrollY),
        hash: location.hash,
        h: document.documentElement.scrollHeight,
    }));
    ok(
        "Back: straight to the search, no show page in between",
        !back.player && back.view === "home" && !back.show && back.hash === "",
        JSON.stringify(back)
    );
    ok(
        "…what you typed and what it found, as they were",
        back.q === "Frie" && back.n === n0 && back.rows === n0,
        JSON.stringify(back)
    );
    ok("…and how far down you were", Math.abs(back.y - y0) <= 2 && y0 > 0, `${y0} → ${back.y} ` + JSON.stringify(back));

    // ---- the browser's Back too ----
    await row.click();
    await p.waitForFunction(() => !!document.querySelector("#cinema"), null, { timeout: 15000 });
    await p.waitForTimeout(500);
    ok("opened again from the search", /#watch\/al\.3\//.test(p.url()), p.url());
    await p.goBack();
    await p.waitForTimeout(600);
    ok(
        "the browser's Back closes the player, back on the search",
        await ev(
            () =>
                !document.querySelector("#cinema") &&
                __ulTest.W.view === "home" &&
                document.querySelector<HTMLInputElement>("#wq")!.value === "Frie" &&
                !location.hash
        )
    );
    await p.goForward();
    await p
        .waitForFunction(() => !!document.querySelector("#cinema") && __ulTest.W.player?.e != null, null, {
            timeout: 15000,
        })
        .catch(() => {});
    ok(
        "…and Forward opens it again",
        await ev(() => !!document.querySelector("#cinema") && /^Frieren/.test(__ulTest.W.show?.title || ""))
    );

    // ---- a refresh: the same show, season and episode ----
    await p.waitForSelector('#cinema [data-act="cin-ep"][data-k="4"]', { timeout: 15000 });
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-ep"][data-k="4"]')!.click());
    await p.waitForTimeout(1500); // the library is saved
    await p.reload();
    await p
        .waitForFunction(
            () => __ulTest.booted && !!document.querySelector("#cinema") && __ulTest.W.player?.e != null,
            null,
            {
                timeout: 15000,
            }
        )
        .catch(() => {});
    await p.waitForTimeout(500);
    const after = await ev(() => ({
        page: __ulTest.ui.page,
        show: __ulTest.W.show?.title,
        si: __ulTest.W.player?.si,
        e: __ulTest.W.player?.e,
        hash: location.hash,
    }));
    ok(
        "a refresh opens the same show, season and episode, not Watch's front page",
        after.page === "watch" &&
            /^Frieren/.test(after.show || "") &&
            after.si === 0 &&
            after.e === 4 &&
            after.hash === "#watch/al.3/1/4",
        JSON.stringify(after)
    );
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-close"]')!.click());
    // (what you typed is looked for again: the catalogues answer a moment later)
    await p
        .waitForFunction(() => (__ulTest.W.results || []).some(r => /^Frieren: Beyond/.test(r.title)), null, {
            timeout: 15000,
        })
        .catch(() => {});
    ok(
        "…and Back from there goes to the search you came from",
        await ev(
            () =>
                !document.querySelector("#cinema") &&
                document.querySelector<HTMLInputElement>("#wq")!.value === "Frie" &&
                (__ulTest.W.results || []).some(r => /^Frieren: Beyond/.test(r.title)) &&
                !location.hash
        ),
        await ev(() =>
            JSON.stringify({
                cin: !!document.querySelector("#cinema"),
                q: document.querySelector<HTMLInputElement>("#wq")?.value,
                wq: __ulTest.W.q,
                r: (__ulTest.W.results || []).map(r => r.title),
                h: location.hash,
            })
        )
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})().catch(e => {
    console.log("FAIL " + String(e && e.message).split("\n")[0]);
    process.exit(1);
});
