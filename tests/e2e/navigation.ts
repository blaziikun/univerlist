// Getting around: Watch & read is its own space (its own look; [ and ] switch Watch ⇄ Read and never leave it), Escape climbs one
// level at a time and stops at Watch's own home, and Settings goes back to exactly where you opened it from (Escape, ✕ or the logo).
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1400, height: 900 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const bg = () => ev(() => getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
    const st = () =>
        ev(() => ({
            page: __ulTest.ui.page,
            mode: __ulTest.ui.mode,
            tab: __ulTest.ui.tab,
            view: __ulTest.W.view,
            show: __ulTest.W.show && __ulTest.W.show.title,
            player: !!__ulTest.W.player,
            modal: __ulTest.ui.modal && __ulTest.ui.modal.kind,
        }));
    const key = async (k: string) => {
        await p.keyboard.press(k);
        await p.waitForTimeout(250);
    };
    // a mode with a look of its own, different from the hub's
    const other = await ev(() => {
        const M = __ulTest.allModes(),
            hub = __ulTest.resolveTheme((__ulTest.modeById("universal") || M[0]).theme).bg;
        const m = M.find(x => x.id !== "universal" && __ulTest.resolveTheme(x.theme).bg !== hub);
        return m && m.id;
    });
    if (!other) {
        console.log("skip  no mode with its own look");
        process.exit(0);
    }
    await ev(id => __ulTest.setMode(id), other);
    await p.waitForTimeout(300);
    const modeBg = await bg(),
        hubBg = await ev(() =>
            __ulTest.stageLook() === "black"
                ? __ulTest.STAGE_BLACK().bg
                : __ulTest.resolveTheme(__ulTest.stageLook()).bg
        ); // Watch & read's own look (Black unless you pick one)
    ok(
        "a mode has its own look",
        modeBg.toLowerCase() === (await ev(() => __ulTest.resolveTheme(__ulTest.curMode().theme).bg)).toLowerCase(),
        modeBg
    );
    await ev(() => {
        __ulTest.ui.tab = "library";
        __ulTest.render();
    });

    // ---- Watch & read is its own space ----
    await ev(() => document.querySelector<HTMLElement>('[data-act="go-stage"]')!.click());
    await p.waitForTimeout(300);
    ok(
        "Watch uses its own look, not the mode you came from",
        (await bg()).toLowerCase() === hubBg.toLowerCase() && (await bg()).toLowerCase() !== modeBg.toLowerCase(),
        `${await bg()} (mode: ${modeBg})`
    );
    await key("]");
    let s = await st();
    ok("] goes to Read, staying in Watch & read", s.page === "read" && s.mode === other, JSON.stringify(s));
    ok("…with the same look", (await bg()).toLowerCase() === hubBg.toLowerCase());
    await key("[");
    s = await st();
    ok("[ comes back to Watch", s.page === "watch" && s.mode === other, JSON.stringify(s));
    // a show, its player
    await ev(() => __ulTest.watchOpen({ medium: "anime", title: "Death Note", ext: { anilist: 3 }, total: 12 }));
    await p.waitForFunction(() => __ulTest.W.player && !__ulTest.W.player.loading, null, { timeout: 8000 });
    await key("]");
    s = await st();
    ok(
        "] with the player open does nothing (no jumping out mid-show)",
        s.page === "watch" && s.player && s.mode === other,
        JSON.stringify(s)
    );
    // a dialog over the player gets Escape first
    await ev(() => __ulTest.openModal("seriesservers", {}));
    await p.waitForTimeout(200);
    await key("Escape");
    s = await st();
    ok("Escape closes a dialog over the player, not the player", !s.modal && s.player, JSON.stringify(s));
    // Escape climbs one level at a time
    await key("Escape");
    s = await st();
    ok(
        "Escape: player → the show",
        s.page === "watch" && !s.player && s.view === "show" && s.show === "Death Note",
        JSON.stringify(s)
    );
    await key("Escape");
    s = await st();
    ok("Escape: the show → Watch home", s.page === "watch" && s.view === "home" && !s.show, JSON.stringify(s));
    await key("Escape");
    s = await st();
    ok(
        "Escape on Watch home stays in Watch (it isn't inside the hub)",
        s.page === "watch" && s.mode === other,
        JSON.stringify(s)
    );

    // ---- Settings opened while watching isn't hidden under the player ----
    await ev(() => __ulTest.watchOpen({ medium: "anime", title: "Death Note", ext: { anilist: 3 }, total: 12 }));
    await p.waitForFunction(() => __ulTest.W.player && !__ulTest.W.player.loading, null, { timeout: 8000 });
    await key(",");
    s = await st();
    ok(
        "Settings from the player: the player steps aside so Settings shows",
        s.page === "settings" && !s.player && !(await ev(() => !!document.querySelector("#cinema"))),
        JSON.stringify(s)
    );
    await key("Escape");
    s = await st();
    ok(
        "…and Escape comes back to the show",
        s.page === "watch" && s.view === "show" && s.show === "Death Note",
        JSON.stringify(s)
    );
    await ev(() => {
        __ulTest.W.view = "home";
        __ulTest.W.show = null;
        __ulTest.renderMain();
    });
    // ---- Settings goes back to where you were ----
    await ev(() =>
        __ulTest.watchOpen({ medium: "anime", title: "Death Note", ext: { anilist: 3 }, total: 12 }, { play: false })
    );
    await p.waitForTimeout(500);
    await ev(() => __ulTest.goSettings());
    await p.waitForTimeout(200);
    ok("Settings opened from Watch keeps the Watch look", (await bg()).toLowerCase() === hubBg.toLowerCase());
    await key("Escape");
    s = await st();
    ok(
        "Escape in Settings → back to the same show in Watch",
        s.page === "watch" && s.view === "show" && s.show === "Death Note",
        JSON.stringify(s)
    );
    await ev(() => __ulTest.goSettings());
    await p.waitForTimeout(200);
    await p.click("#top .brand");
    await p.waitForTimeout(200);
    s = await st();
    ok(
        "the app name in Settings → back to Watch too",
        s.page === "watch" && s.show === "Death Note",
        JSON.stringify(s)
    );
    await p.click('[data-act="stage-switch"][data-k="read"], [data-act="go-read"]').catch(async () => {
        await key("]");
    });
    await ev(() => {
        if (__ulTest.W.view === "show") {
            __ulTest.W.view = "home";
            __ulTest.W.show = null;
        }
        __ulTest.ui.page = "read";
        __ulTest.render();
    });
    await ev(() => __ulTest.goSettings());
    await p.waitForTimeout(200);
    await key("Escape");
    s = await st();
    ok("Settings opened from Read → back to Read (not the library)", s.page === "read", JSON.stringify(s));
    // from a mode's library
    await ev(id => {
        __ulTest.ui.page = "profile";
        __ulTest.setMode(id, { stay: true });
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "library";
        __ulTest.render();
    }, other);
    await p.waitForTimeout(300);
    ok(
        "leaving Watch & read brings back the mode's own look",
        (await bg()).toLowerCase() === modeBg.toLowerCase(),
        await bg()
    );
    await ev(() => __ulTest.goSettings("keys"));
    await p.waitForTimeout(200);
    await p.click("header .brand, .brand");
    await p.waitForTimeout(200);
    s = await st();
    ok(
        "the logo in Settings → back to the mode's library you were on",
        s.page === "profile" && s.mode === other && s.tab === "library",
        JSON.stringify(s)
    );
    await ev(() => __ulTest.goSettings());
    await p.waitForTimeout(150);
    await p.fill("#set-q", "theme");
    await p.waitForTimeout(150);
    await key("Escape");
    s = await st();
    ok(
        "Escape in the settings search clears it first",
        s.page === "settings" && (await ev(() => !__ulTest.ui.setQ)),
        JSON.stringify(s)
    );
    await p.locator("#set-q").blur();
    await key("Escape");
    s = await st();
    ok("…then closes Settings", s.page === "profile" && s.tab === "library", JSON.stringify(s));
    // outside Watch & read, [ and ] still move between modes
    const before = await ev(() => __ulTest.ui.mode);
    await key("]");
    ok("in the library, ] still moves to the next mode", (await ev(() => __ulTest.ui.mode)) !== before);

    // ---- picking Watch's look (⋯ on the player page, or Settings) keeps it whichever mode you came from ----
    await ev(() => {
        __ulTest.meta.settings.stageTheme = "galaxy";
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    await p.waitForTimeout(200);
    const gal = await ev(() => __ulTest.resolveTheme("galaxy").bg);
    ok("Watch & read can wear a theme of your choosing", (await bg()).toLowerCase() === gal.toLowerCase(), await bg());
    await key("[");
    await key("[");
    ok(
        "…and keeps it through [ and ]",
        (await bg()).toLowerCase() === gal.toLowerCase() && (await ev(() => __ulTest.ui.page)) === "watch"
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})();
