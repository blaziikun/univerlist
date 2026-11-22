// The small dialogs and the menus a button opens (core/dialogs.ts, core/menus.ts: drawn by Svelte): Pick for me, Where
// are you, AniList, Edit profile, the private collection's passphrase and lock, Keyboard shortcuts, Save this view, the
// welcome; a block's settings, the tab editor and an episode's link. And what one once got wrong:
//  · Edit profile wiped the name and bio you were typing when you picked a banner
//  · Keyboard shortcuts' "Change them" opened Settings underneath the dialog, which stayed open over it
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { WatchSeason, WatchShow } from "../../src/features/core/model";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    const wait = (ms = 150) => p.waitForTimeout(ms);
    const svelte = () => ev(() => !!document.querySelector("#overlay .modal")?.hasAttribute("data-svelte"));
    await p.goto(ENV.APP);
    await p.waitForFunction(() => window.__ulTest?.booted);

    // ── the welcome ──
    ok(
        "the welcome is drawn by Svelte, with the name box focused",
        (await svelte()) && (await ev(() => document.activeElement!.id === "wl-name"))
    );
    await p.fill("#wl-name", "Rin");
    await p.press("#wl-name", "Enter");
    await wait();
    ok(
        "…Enter starts, with that name",
        await ev(() => !__ulTest.ui.modal && __ulTest.meta.profile.name === "Rin" && __ulTest.meta.settings.welcomed3)
    );

    const ids = await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        const book = __ulTest.addItem({
            medium: "book",
            title: "The Glass Orchard",
            creator: "Ivo Penn",
            total: 300,
            prog: 10,
            status: "active",
        });
        const film = __ulTest.addItem({
            medium: "film",
            title: "Night Harbour",
            year: 2011,
            status: "want",
            runtime: 100,
            copy: "digital",
            banner: "https://image.tmdb.org/t/p/w500/nh.jpg",
            fav: 1,
        });
        const show = __ulTest.addItem({ medium: "tv", title: "Quiet Signal", total: 10, runtime: 30, status: "want" });
        if (__ulTest.auto.ctl) __ulTest.auto.ctl.abort();
        __ulTest.auto.paused = true;
        return { book, film, show };
    });

    // ── Pick for me ──
    await p.keyboard.press("p");
    await wait();
    ok(
        "Pick for me opens from its key, drawn by Svelte",
        (await svelte()) && (await ev(() => __ulTest.ui.modal!.kind === "pick"))
    );
    await p.click('[data-act="pick-time"][data-k="evening"]');
    await wait();
    ok(
        "…a time picks what fits it",
        await ev(
            () =>
                __ulTest.ui.modal!.time === "evening" &&
                document.querySelector('[data-act="pick-time"][data-k="evening"]')!.getAttribute("aria-pressed") ===
                    "true" &&
                !!document.querySelector(".pick-top .ptitle")
        )
    );
    await p.click('[data-act="pick-media"][data-k="film"]');
    await wait();
    ok(
        "…a mood leaves only that kind",
        await ev(
            () =>
                __ulTest.ui.modal!.media!.join() === "film" &&
                /Night Harbour/.test(document.querySelector(".pick-top .ptitle")!.textContent)
        )
    );
    await p.click('[data-act="pick-media"][data-k="film"]');
    await p.check('[data-act="pick-own"]');
    await wait();
    ok(
        '…"Only things I own" leaves out what you don\'t',
        await ev(
            () =>
                __ulTest.ui.modal!.own === true &&
                /Night Harbour/.test(document.querySelector(".pick-top .ptitle")!.textContent) &&
                !document.querySelector(".modal .mini button")
        )
    );
    await p.click('[data-act="pick-shuffle"]');
    await wait();
    ok("…Shuffle keeps it open", await ev(() => __ulTest.ui.modal && __ulTest.ui.modal.kind === "pick"));
    await p.click('.pick-top [data-act="open"]');
    await wait();
    ok(
        "…and Open opens the card",
        await ev(i => __ulTest.ui.modal!.kind === "item" && __ulTest.ui.modal!.id === i, ids.film)
    );
    await ev(() => __ulTest.closeModal());

    // ── Where are you ──
    await ev(i => __ulTest.openModal("setpage", { id: i }), ids.book);
    await wait();
    ok(
        "Where are you: the box is focused, showing where you are",
        (await svelte()) &&
            (await ev(
                () =>
                    document.activeElement!.id === "sp-page" &&
                    (document.activeElement as HTMLInputElement).value === "10" /* cast: the box that has focus */ &&
                    !!document.querySelector("#sp-lane")
            ))
    );
    await p.fill("#sp-page", "42");
    await p.selectOption(
        "#sp-lane",
        await ev(() => document.querySelector<HTMLInputElement>("#sp-lane option:nth-child(2)")!.value)
    );
    await p.press("#sp-page", "Enter");
    await wait();
    ok(
        "…Enter logs it, with where you read it, and closes",
        await ev(
            i => !__ulTest.ui.modal && __ulTest.items.get(i)!.prog === 42 && !!__ulTest.items.get(i)!.lane,
            ids.book
        )
    );

    // ── AniList ──
    await ev(() => __ulTest.openModal("anilist"));
    await wait();
    ok(
        "AniList: the username box, and Import",
        (await svelte()) &&
            (await ev(
                () =>
                    !!document.querySelector("#al-user") &&
                    /Import/.test(document.querySelector('[data-act="al-sync"]')!.textContent)
            ))
    );
    await p.fill("#al-user", "someone");
    await p.press("#al-user", "Enter");
    await p
        .waitForFunction(() => __ulTest.alSync.running && __ulTest.alSync.msg, null, { timeout: 8000 })
        .catch(() => {});
    await wait(300);
    ok(
        "…Enter keeps the name and syncs, and the dialog shows how far it's got",
        await ev(
            () =>
                __ulTest.meta.settings.anilistUser === "someone" &&
                document.querySelector<HTMLInputElement>("#al-user")!.disabled &&
                /Reading your/.test(document.querySelector(".modal .think")!.textContent) &&
                !!document.querySelector('.modal [data-act="al-stop"]')
        )
    );
    await p.click('.modal [data-act="al-stop"]');
    await p.waitForFunction(() => !__ulTest.alSync.running, null, { timeout: 8000 }).catch(() => {});
    await wait(300);
    ok(
        "…Stop stops it, and the dialog says so",
        await ev(
            () =>
                !__ulTest.alSync.running &&
                !!document.querySelector('.modal [data-act="al-sync"]') &&
                !document.querySelector<HTMLInputElement>("#al-user")!.disabled
        )
    );
    await ev(() => __ulTest.closeModal());

    // ── Edit profile ──
    await p.click('.pedit[data-act="profile-edit"]');
    await wait();
    ok(
        "Edit profile opens, with the name focused",
        (await svelte()) &&
            (await ev(
                () =>
                    document.activeElement!.id === "pe-name" &&
                    (document.activeElement as HTMLInputElement).value === "Rin" /* cast: as above */
            ))
    );
    await p.fill("#pe-name", "Rin Aldous");
    await p.fill("#pe-bio", "Reads on trains.");
    await p.click('[data-act="pe-banner"]');
    await wait(300);
    ok(
        "picking a banner keeps the name and bio being typed (they were wiped)",
        await ev(
            () =>
                document.querySelector<HTMLInputElement>("#pe-name")!.value === "Rin Aldous" &&
                document.querySelector<HTMLInputElement>("#pe-bio")!.value === "Reads on trains." &&
                !!__ulTest.meta.profile.banner
        )
    );
    await p.fill("#pe-banner-url", "ftp://nope");
    await p.click('[data-act="pe-banner-link"]');
    await wait();
    ok("…a banner link that isn't https is refused", await ev(() => __ulTest.meta.profile.banner !== "ftp://nope"));
    await p.click('[data-act="pe-save"]');
    await wait();
    ok(
        "…Save keeps them",
        await ev(
            () =>
                !__ulTest.ui.modal &&
                __ulTest.meta.profile.name === "Rin Aldous" &&
                __ulTest.meta.profile.bio === "Reads on trains."
        )
    );
    await ev(() => {
        __ulTest.setMode("screen");
    });
    await p.click('.pedit[data-act="profile-edit"]');
    await wait();
    await p.click('[data-act="pe-scope"][data-k="mode"]');
    await wait();
    ok(
        '…"Only in" a mode edits that mode\'s own, starting afresh',
        await ev(
            () =>
                __ulTest.ui.modal!.mode === "screen" &&
                document.querySelector<HTMLInputElement>("#pe-name")!.value === "Rin Aldous" &&
                /Film & TV only/.test(document.querySelector(".mhead h3")!.textContent)
        )
    );
    await p.fill("#pe-name", "Rin at the cinema");
    await p.click('[data-act="pe-save"]');
    await wait();
    ok(
        "…and saves it to the mode only",
        await ev(
            () =>
                __ulTest.modeById("screen").profile!.name === "Rin at the cinema" &&
                __ulTest.meta.profile.name === "Rin Aldous"
        )
    );
    await ev(() => __ulTest.setMode("universal"));

    // ── the private collection ──
    await ev(() => __ulTest.goSettings("privacy"));
    await wait(300);
    await p.fill("#vp1", "a long passphrase");
    await p.fill("#vp2", "a long passphrase");
    await p.click('[data-act="vault-create"]');
    await wait(800);
    await p.click('[data-act="vault-pass"]');
    await wait();
    ok(
        "Change passphrase opens, with the first box focused",
        (await svelte()) && (await ev(() => document.activeElement!.id === "vn1"))
    );
    await p.fill("#vn1", "another passphrase");
    await p.fill("#vn2", "not the same");
    await p.click('[data-act="vault-pass-save"]');
    await wait();
    ok(
        "…two that don't match are refused",
        await ev(() => __ulTest.ui.modal && __ulTest.ui.modal.kind === "vaultpass")
    );
    await p.fill("#vn2", "another passphrase");
    await p.press("#vn2", "Enter");
    await p.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 8000 }).catch(() => {});
    ok("…Enter changes it", await ev(() => !__ulTest.ui.modal));
    await ev(async () => {
        await __ulTest.lockVault();
        __ulTest.closeSettings();
    });
    await wait(300);
    await ev(() => __ulTest.openModal("unlock"));
    await wait();
    ok(
        "Unlock opens, with the passphrase focused",
        (await svelte()) && (await ev(() => document.activeElement!.id === "vpu"))
    );
    await p.fill("#vpu", "a long passphrase");
    await p.press("#vpu", "Enter");
    await p.waitForFunction(() => __ulTest.ui.modal && __ulTest.ui.modal.err, null, { timeout: 8000 }).catch(() => {});
    ok(
        "…the old passphrase no longer opens it, and it says so",
        await ev(
            () => /didn't work/.test(document.querySelector(".modal .err")?.textContent || "") && !__ulTest.ui.private
        )
    );
    await p.fill("#vpu", "another passphrase");
    await p.click('[data-act="vault-unlock"]');
    await p.waitForFunction(() => __ulTest.ui.private, null, { timeout: 8000 }).catch(() => {});
    ok("…the new one opens it", await ev(() => !__ulTest.ui.modal && __ulTest.ui.private));
    await ev(() => __ulTest.togglePrivate());
    await wait(300);

    // ── Keyboard shortcuts, Save this view ──
    await ev(() => __ulTest.openModal("keys"));
    await wait();
    ok(
        "Keyboard shortcuts lists every one with its keys",
        (await svelte()) &&
            (await ev(
                () =>
                    document.querySelectorAll(".keys .kbd").length > 20 &&
                    /Pick for me/.test(document.querySelector(".keys")!.textContent)
            ))
    );
    await p.click('.modal [data-act="go-settings"]');
    await wait();
    ok(
        '…"Change them" goes to Settings, and the dialog closes (it stayed open over Settings)',
        await ev(() => !__ulTest.ui.modal && __ulTest.ui.page === "settings" && __ulTest.ui.setSec === "keys")
    );
    await ev(() => {
        __ulTest.closeSettings();
        __ulTest.goTab("library");
        __ulTest.openModal("saveview");
    });
    await wait();
    await p.fill("#sv-name", "Short ones");
    await p.press("#sv-name", "Enter");
    await wait();
    ok(
        "Save this view: Enter saves it to the sidebar",
        await ev(() => !__ulTest.ui.modal && __ulTest.meta.views.some(v => v.name === "Short ones"))
    );

    // ── a block's settings ──
    await ev(() => __ulTest.goTab("overview"));
    await wait(400);
    await p.click('.blocks .blk[data-bi="1"]', { button: "right" });
    await wait();
    ok(
        "a block's settings open on a right-click, drawn by Svelte",
        await ev(
            () =>
                !document.querySelector<HTMLElement>("#ctx")!.hidden &&
                document.querySelector("#ctx")!.hasAttribute("data-svelte") &&
                !!document.querySelector("#ctx [data-blkt]")
        )
    );
    await p.fill("#ctx [data-blkt]", "My corner");
    await p.press("#ctx [data-blkt]", "Tab");
    await wait();
    ok(
        "…a title typed in is kept, and shows",
        await ev(
            () =>
                __ulTest.blocksOf(__ulTest.curMode())[1].title === "My corner" &&
                /My corner/.test(document.querySelector('.blocks .blk[data-bi="1"]')!.textContent) &&
                /My corner/.test(document.querySelector("#ctx .ctx-h b")!.textContent)
        )
    );
    await p.click('#ctx [data-act="blk-w"][data-w="12"]');
    await wait();
    ok(
        "…a width is saved, and the menu shows it at once",
        await ev(
            () =>
                __ulTest.blocksOf(__ulTest.curMode())[1].w === 12 &&
                document.querySelector('#ctx [data-act="blk-w"][data-w="12"]')!.getAttribute("aria-pressed") === "true"
        )
    );
    await p.keyboard.press("Escape");
    await wait();
    await ev(() => {
        const md = __ulTest.curMode();
        md.blocks = [{ k: "custom", w: 6 }, ...__ulTest.blocksOf(md)];
        __ulTest.markDirty();
        __ulTest.render();
    });
    await wait(300);
    await p.click('.blocks .blk[data-bi="0"]', { button: "right" });
    await wait();
    await p.selectOption('#ctx [data-blkc="metric"]', "avg");
    await p.check('#ctx [data-blkc="fin"]');
    await wait();
    ok(
        '…a stat you build: what it measures and "finished only" are saved',
        await ev(
            () =>
                __ulTest.blocksOf(__ulTest.curMode())[0].metric === "avg" &&
                __ulTest.blocksOf(__ulTest.curMode())[0].fin === true
        )
    );
    await p.click('#ctx [data-act="blk-del"]');
    await wait();
    ok(
        "…and Remove takes it away and closes the menu",
        await ev(
            () =>
                __ulTest.blocksOf(__ulTest.curMode())[0].k !== "custom" &&
                document.querySelector<HTMLElement>("#ctx")!.hidden
        )
    );

    // ── the tab editor ──
    await p.click(".tabedit");
    await wait();
    ok(
        "the tab editor opens from ⋯, drawn by Svelte",
        await ev(() => !document.querySelector<HTMLElement>("#ctx")!.hidden && !!document.querySelector("#ctx .tedit"))
    );
    await p.uncheck('#ctx [data-tabon="favourites"]');
    await wait();
    ok(
        "…unticking a tab hides it in this mode only",
        await ev(
            () =>
                !__ulTest.tabsFor().includes("favourites") &&
                __ulTest.tabsFor(__ulTest.modeById("animanga")).includes("favourites") &&
                !!document.querySelector('#ctx .tedoff [data-tabon="favourites"]')
        )
    );
    await p.check('#ctx [data-tabon="diary"]');
    await wait();
    ok(
        "…ticking one adds it",
        await ev(() => __ulTest.tabsFor().includes("diary") && !!document.querySelector('.ptabs [data-k="diary"]'))
    );
    await p.click('#ctx [data-act="tab-move"][data-k="stats"][data-d="-1"]');
    await wait();
    ok(
        "…↑ moves one earlier",
        await ev(() => __ulTest.tabsFor().indexOf("stats") < __ulTest.tabsFor().indexOf("library"))
    );
    await p.click('#ctx [data-act="tab-home"][data-k="stats"]');
    await wait();
    ok(
        "…★ is the tab the mode opens on, and the menu stays open",
        await ev(
            () =>
                __ulTest.curMode().homeTab === "stats" &&
                !document.querySelector<HTMLElement>("#ctx")!.hidden &&
                document.querySelector<HTMLElement>("#ctx .tst.on")!.dataset.k === "stats"
        )
    );
    await p.dragAndDrop('#ctx .tedrow[data-tedk="diary"]', '#ctx .tedrow[data-tedk="overview"]', {
        targetPosition: { x: 20, y: 2 },
    });
    await wait();
    ok(
        "…a row dragged above another goes there",
        await ev(() => __ulTest.tabsFor()[0] === "diary"),
        await ev(() => __ulTest.tabsFor().join())
    );
    await p.keyboard.press("Escape");
    await ev(() => __ulTest.goTab("diary"));
    await wait();
    await p.click(".tabedit");
    await wait();
    for (const k of (await ev(() => __ulTest.tabsFor())).slice(1)) {
        await p.click(`#ctx .tedrow [data-tabon="${k}"]`);
        await wait(80);
    }
    await p.click('#ctx .tedrow [data-tabon="diary"]');
    await wait();
    ok(
        "…and the last tab stays ticked",
        await ev(
            () =>
                __ulTest.tabsFor().join() === "diary" &&
                document.querySelector<HTMLInputElement>('#ctx .tedrow [data-tabon="diary"]')!.checked
        ),
        await ev(
            () =>
                __ulTest.tabsFor().join() +
                " " +
                document.querySelector<HTMLElement>("#ctx")!.hidden +
                " " +
                document.querySelector("#ctx .tedit")!.innerHTML.slice(0, 200)
        )
    );
    await p.keyboard.press("Escape");
    await wait();

    // ── an episode's link ──
    await ev(i => {
        const b = document.createElement("button");
        b.id = "ep-test";
        b.dataset.act = "watch-src";
        b.dataset.s = "0";
        b.dataset.k = "3";
        b.textContent = "Add source";
        b.style.cssText = "position:fixed;left:300px;top:300px;z-index:9999";
        document.body.append(b);
        __ulTest.W.seasons = [{ member: i, n: 1 } as WatchSeason];
        __ulTest.W.show = { medium: "tv" } as WatchShow; /* casts: just enough of a show for the episode's button */
    }, ids.show);
    await p.click("#ep-test");
    await wait();
    ok(
        "an episode's menu opens, drawn by Svelte",
        await ev(
            () =>
                !document.querySelector<HTMLElement>("#ctx")!.hidden &&
                /Episode 3/.test(document.querySelector("#ctx .ctx-h")!.textContent) &&
                !document.querySelector('#ctx [data-act="ws-unlink"]')
        )
    );
    await p.fill("#ws-url", "gopher://x");
    await p.click('#ctx [data-act="ws-url"]');
    await wait();
    ok("…a link that isn't http is refused", await ev(() => !document.querySelector<HTMLElement>("#ctx")!.hidden));
    await p.fill("#ws-url", "http://192.168.1.20/show/e3.mp4");
    await p.click('#ctx [data-act="ws-url"]');
    await wait();
    ok(
        "…a link to your own network is saved for that episode",
        await ev(
            i =>
                (((__ulTest.items.get(i)!.sources || {}) as Record<string, { url?: string }>).S1E3 || {})
                    .url /* cast: an entry's episode links */ === "http://192.168.1.20/show/e3.mp4" &&
                document.querySelector<HTMLElement>("#ctx")!.hidden,
            ids.show
        )
    );
    await p.click("#ep-test");
    await wait();
    ok(
        "…opened again, it shows the link and offers to remove it",
        await ev(
            () =>
                document.querySelector<HTMLInputElement>("#ws-url")!.value === "http://192.168.1.20/show/e3.mp4" &&
                !!document.querySelector('#ctx [data-act="ws-unlink"]')
        )
    );
    await p.click('#ctx [data-act="ws-unlink"]');
    await wait();
    ok(
        "…Remove link removes it",
        await ev(
            i => !((__ulTest.items.get(i)!.sources || {}) as Record<string, unknown>).S1E3 /* cast: as above */,
            ids.show
        )
    );

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
