// Settings' own parts that used to be HTML strings: a mode's and a shelf's grid of media and types, what each type is
// called and which ones count as one, the line about background work (artwork, crowd scores, AniList) and the
// library file, Your games with LaunchBox's panel, the proxy's sources, and the support link. Each does what it did,
// with no help from export files (the tests that use your own export are skipped without one).
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { ShelfDef } from "../../src/features/core/model";
const H = { "access-control-allow-origin": "*", "content-type": "application/json" };
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await setup(c);
    await c.route(/px\.test/, r =>
        new URL(r.request().url()).pathname === "/status"
            ? r.fulfill({
                  status: 200,
                  headers: H,
                  body: JSON.stringify({ igdb: true, sgdb: false, tgdb: true, ss: false, cv: true, hc: false }),
              })
            : r.fulfill({ status: 404, headers: H, body: "{}" })
    );
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    const box = (sel: string) => ev(sel => document.querySelector<HTMLElement>(sel)!.click(), sel); // the boxes sit inside their chips (the chip is what you see)
    const go = async (s: string) => {
        await ev(s => __ulTest.goSettings(s), s);
        await p.waitForSelector(`.setsec[data-sec="${s}"]`);
        await p.waitForTimeout(150);
    };
    await p.goto(ENV.APP);
    await p.waitForFunction(() => window.__ulTest?.booted);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        if (__ulTest.auto.ctl) __ulTest.auto.ctl.abort();
        Object.assign(__ulTest.auto, { running: false, paused: false, offline: false });
        const add = (title: string, medium: string, kind: string) =>
            __ulTest.items.set(
                __ulTest.newId(title, medium),
                __ulTest.migrateItem({ title, medium, kind, status: "done" })
            );
        add("Quiet Harbour", "anime", "TV");
        add("Paper Lantern", "anime", "Movie");
        add("Moss Lane", "manga", "Manga");
        add("Lantern Run", "game", "");
        add("Harbour Lights", "game", "");
        __ulTest.markDirty();
        __ulTest.render();
    });

    // ----- a mode's grid: ticking a box saves what the grid now shows -----
    await ev(() => {
        __ulTest.meta.modes.push({
            id: "mine",
            name: "Mine",
            match: ["anime", "manga:Manga"],
            shelves: [
                { name: "Shelf A", match: ["anime:TV"] },
                { name: "Shelf B", match: ["manga"] },
            ],
            theme: __ulTest.meta.modes[0].theme,
        });
        __ulTest.ui.editMode = "mine";
    });
    await go("modes");
    const md = () => ev(() => __ulTest.meta.modes.find(m => m.id === "mine"));
    await ev(
        () => (document.querySelector<HTMLDetailsElement>('.setsec details:has(input[data-mm^="mode|"])')!.open = true)
    );
    ok(
        "the grid shows what the mode shows",
        await ev(
            () =>
                document.querySelector<HTMLInputElement>('[data-mm="mode|anime|*"]')!.checked &&
                document.querySelector<HTMLInputElement>('[data-mm="mode|manga|Manga"]')!.checked &&
                !document.querySelector<HTMLInputElement>('[data-mm="mode|manga|*"]')!.checked &&
                !document.querySelector<HTMLInputElement>('[data-mm="mode|book|*"]')!.checked
        )
    );
    await box('[data-mm="mode|anime|TV"]');
    await p.waitForTimeout(150);
    let m = await md();
    ok(
        "unticking a type keeps the medium's other types, one by one",
        !m!.match!.includes("anime") &&
            !m!.match!.includes("anime:TV") &&
            m!.match!.includes("anime:Movie") &&
            m!.match!.includes("manga:Manga"),
        m!.match!.join(" ")
    );
    ok(
        "…its medium box is unticked, the type's chip is off",
        await ev(
            () =>
                !document.querySelector<HTMLInputElement>('[data-mm="mode|anime|*"]')!.checked &&
                !document.querySelector('[data-mm="mode|anime|TV"]')!.closest(".kchip")!.classList.contains("on")
        )
    );
    await box('[data-mm="mode|anime|*"]');
    await p.waitForTimeout(150);
    m = await md();
    ok(
        "ticking the medium takes every type of it",
        m!.match!.includes("anime") && !m!.match!.some(x => x.startsWith("anime:")),
        m!.match!.join(" ")
    );
    await box('[data-mm="mode|book|*"]');
    await p.waitForTimeout(150);
    ok("…and another medium is added whole", (await md())!.match!.includes("book"));
    for (const s of ["anime|*", "book|*", "manga|Manga"]) {
        await box(`[data-mm="mode|${s}"]`);
        await p.waitForTimeout(120);
    }
    ok(
        "nothing ticked shows nothing",
        JSON.stringify((await md())!.match) === '["__none"]',
        JSON.stringify((await md())!.match)
    );
    // a shelf's grid lists only what the mode shows, and stays open after a change
    await ev(() => {
        const x = __ulTest.meta.modes.find(m => m.id === "mine");
        x!.match = ["anime", "manga"];
        __ulTest.markDirty();
        __ulTest.render();
    });
    await p.waitForTimeout(150);
    await ev(() => (document.querySelectorAll<HTMLDetailsElement>(".shelfed details")[1].open = true));
    ok(
        "a shelf's grid lists only the media its mode shows",
        await ev(
            () =>
                [...document.querySelectorAll<HTMLElement>('[data-mm^="shelf1|"][data-mm$="|*"]')]
                    .map(x => x.dataset.mm!.split("|")[1])
                    .sort()
                    .join() === "anime,manga"
        )
    );
    await box('[data-mm="shelf1|anime|*"]');
    await p.waitForTimeout(150);
    m = await md();
    // casts: this mode has shelves of its own
    ok(
        "a shelf's box saves the shelf, and its grid stays open",
        [...(m!.shelves as ShelfDef[])[1].match].sort().join() === "anime,manga" &&
            (m!.shelves as ShelfDef[])[0].match.join() === "anime:TV" &&
            (await ev(() => document.querySelectorAll<HTMLDetailsElement>(".shelfed details")[1].open)),
        (m!.shelves as ShelfDef[])[1].match.join()
    );

    // ----- types: renamed, folded into another, and back -----
    await go("library");
    ok(
        "each type of what you have is listed",
        await ev(
            () =>
                !!document.querySelector('[data-kindlabel="anime|Movie"]') &&
                !!document.querySelector('[data-kindlabel="manga|Manga"]') &&
                !document.querySelector('[data-kindlabel^="book|"]')
        )
    );
    await p.fill('[data-kindlabel="anime|Movie"]', "Films");
    await p.dispatchEvent('[data-kindlabel="anime|Movie"]', "change");
    await p.waitForTimeout(150);
    ok("renaming a type saves its name", await ev(() => __ulTest.meta.settings.kindLabel!.anime.Movie === "Films"));
    ok(
        "…and the other types offer it under that name",
        await ev(() =>
            [...document.querySelectorAll<HTMLInputElement>('[data-kindmerge="anime|Special"] option')].some(
                o => o.value === "Movie" && o.textContent === "→ Films"
            )
        )
    );
    await p.selectOption('[data-kindmerge="anime|Special"]', "TV");
    await p.waitForTimeout(150);
    ok(
        "folding a type into another saves it, and its name can't be changed then",
        await ev(
            () =>
                __ulTest.meta.settings.kindMerge!.anime.Special === "TV" &&
                document.querySelector<HTMLInputElement>('[data-kindlabel="anime|Special"]')!.disabled &&
                document
                    .querySelector('[data-kindlabel="anime|Special"]')!
                    .closest(".kindc")!
                    .classList.contains("merged")
        )
    );
    await ev(() => {
        const s = document.querySelector<HTMLInputElement>('[data-kindmerge="anime|Special"]');
        s!.value = "";
        s!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await p.waitForTimeout(150); // (Playwright takes the select for disabled: the name box beside it, in the same label, is)
    ok(
        "…and back to its own",
        await ev(
            () =>
                !__ulTest.meta.settings.kindMerge!.anime.Special &&
                !document.querySelector<HTMLInputElement>('[data-kindlabel="anime|Special"]')!.disabled
        )
    );
    await p.fill('[data-kindlabel="anime|Movie"]', "");
    await p.dispatchEvent('[data-kindlabel="anime|Movie"]', "change");
    await p.waitForTimeout(150);
    ok("an empty name is its own name again", await ev(() => !__ulTest.meta.settings.kindLabel!.anime.Movie));
    await p.click('.setsec button:has-text("Show every kind of thing")');
    await p.waitForTimeout(150);
    ok(
        '"every kind of thing" lists the media you don\'t have too',
        await ev(() => !!document.querySelector('[data-kindlabel^="book|"]'))
    );
    await ev(() => {
        __ulTest.ui.editMode = "animanga";
    });
    await go("modes");
    ok(
        "a mode lists the types of what it shows",
        await ev(
            () =>
                !!document.querySelector('.ktypes [data-kindlabel^="anime|"]') &&
                !document.querySelector('.ktypes [data-kindlabel^="game|"]')
        )
    );

    // ----- background work: its line follows each step, without drawing Settings again -----
    await go("data");
    await ev(() => {
        window.__renders = 0;
        const o = (window.__rm = window.__rm || __ulTest.renderMain);
        __ulTest.renderMain = () => {
            window.__renders++;
            return o();
        };
    });
    const line = (sel: string) =>
        ev(sel => {
            const el = document.querySelector<HTMLElement>(sel)!;
            return {
                hidden: el.hidden,
                text: el.textContent.replace(/\s+/g, " ").trim(),
                bar: el.querySelector<HTMLElement>(".progress span")?.style.width || "",
                act: el.querySelector("button")?.dataset.act || "",
            };
        }, sel);
    ok("nothing going on: no line", (await line("#covstat")).hidden && (await line("#alstat")).hidden);
    const steps = await ev(() => {
        Object.assign(__ulTest.auto, {
            running: true,
            paused: false,
            phase: "find",
            done: 0,
            total: 40,
            found: 0,
            waiting: false,
        });
        const seen = [];
        for (let i = 1; i <= 20; i++) {
            __ulTest.auto.done = i;
            __ulTest.auto.found = i >> 1;
            __ulTest.renderAutoStatus();
            seen.push(document.querySelector("#covstat")!.textContent.replace(/\s+/g, " ").trim());
        }
        return seen;
    });
    let L = await line("#covstat");
    ok(
        "finding artwork: each step shows at once",
        steps[0] === "↻ Finding artwork: 1 of 40 · 0 found Pause" &&
            steps[19] === "↻ Finding artwork: 20 of 40 · 10 found Pause" &&
            L.bar === "50%" &&
            L.act === "auto-pause",
        steps[19] + " " + L.bar
    );
    ok(
        "…without drawing Settings again",
        (await ev(() => window.__renders)) === 0,
        (await ev(() => window.__renders)) + " redraws"
    );
    await ev(() => {
        __ulTest.auto.waiting = true;
        __ulTest.renderAutoStatus();
    });
    L = await line("#covstat");
    ok(
        "…asked to slow down: says so, no bar",
        /The catalogues asked us to slow down/.test(L.text) && !L.bar && L.act === "auto-pause"
    );
    await ev(() => {
        Object.assign(__ulTest.auto, { waiting: false, paused: true, phase: "cache", done: 9 });
        __ulTest.renderAutoStatus();
    });
    L = await line("#covstat");
    ok(
        "…paused, saving for offline: Resume",
        L.text === "❚❚ Saving artwork for offline use paused at 9 of 40. Resume" && L.act === "auto-resume",
        L.text
    );
    await ev(() => {
        Object.assign(__ulTest.auto, { running: false, paused: false });
        Object.assign(__ulTest.scoreQ, { running: true, done: 3, total: 12 });
        __ulTest.renderAutoStatus();
    });
    L = await line("#covstat");
    ok(
        "crowd scores: how far, and Pause",
        L.text === "★ Fetching crowd scores: 3 of 12 Pause" && L.bar === "25%" && L.act === "scores-stop",
        L.text
    );
    await ev(() => {
        __ulTest.scoreQ.running = false;
        __ulTest.auto.offline = true;
        __ulTest.renderAutoStatus();
    });
    L = await line("#covstat");
    ok("offline: Try again", /^◌ Couldn't reach the artwork sources/.test(L.text) && L.act === "auto-resume");
    await ev(() => {
        __ulTest.auto.offline = false;
        __ulTest.renderAutoStatus();
    });
    ok("…and the line goes when the work stops", (await line("#covstat")).hidden);
    await ev(() => {
        Object.assign(__ulTest.alSync, { running: true, msg: "Reading your list…", done: 30, total: 120, error: "" });
        __ulTest.renderAlStatus();
    });
    L = await line("#alstat");
    ok(
        "an AniList sync: what it's doing, how far, Stop",
        L.text === "⟳ AniList: Reading your list… Stop" && L.bar === "25%" && L.act === "al-stop",
        L.text
    );
    await ev(() => {
        Object.assign(__ulTest.alSync, { running: false, error: "servers said <b>no</b>" });
        __ulTest.renderAlStatus();
    });
    L = await line("#alstat");
    ok(
        "…its error as plain text, and Details",
        L.text === "⟳ AniList: servers said <b>no</b> Details" &&
            L.act === "al-open" &&
            (await ev(() => !document.querySelector("#alstat b"))),
        L.text
    );
    await ev(() => {
        __ulTest.alSync.error = "";
        __ulTest.renderAlStatus();
    });
    ok("…gone when it's done", (await line("#alstat")).hidden);
    await ev(() => {
        __ulTest.renderMain = window.__rm;
    });
    await ev(() => {
        __ulTest.fileSync.state = "reconnect";
        __ulTest.fileSync.handle = {
            name: "library <one>.json",
        } as FileSystemFileHandle; /* cast: only its name is shown */
        __ulTest.meta.settings.lastBackup = new Date(Date.now() - 3 * 864e5).toISOString();
        __ulTest.render();
    });
    ok(
        "the library file asking for permission again: Reconnect",
        await ev(() => {
            const b = [...document.querySelectorAll("#workstat .banner")].find(x => !x.id);
            return (
                !!b &&
                b.textContent.includes("Your library file library <one>.json needs permission again.") &&
                !!b.querySelector('[data-act="file-reconnect"]')
            );
        })
    );
    ok(
        "…and when you last backed up",
        await ev(() => document.querySelector("#workstat p.hint")!.textContent === "Last backup 3 days ago.")
    );
    await ev(() => {
        __ulTest.fileSync.state = "off";
        __ulTest.fileSync.handle = null;
        __ulTest.render();
    });

    // ----- Your games, LaunchBox -----
    ok(
        "Your games: where games are matched from",
        await ev(() => /Matches every game again \(Wikidata\)/.test(document.querySelector(".setsec")!.textContent))
    );
    await p.click('[data-act="games-update"]');
    await p.waitForTimeout(100);
    ok(
        '…"Check and fix my games" starts, and says how far it\'s got',
        await ev(() => {
            const b = document.querySelector<HTMLButtonElement>('[data-act="games-update"]');
            return b!.disabled && /^Checking \d of 2…$/.test(b!.textContent);
        })
    );
    await p.waitForFunction(
        () => !document.querySelector<HTMLButtonElement>('[data-act="games-update"]')!.disabled,
        null,
        { timeout: 30000 }
    );
    ok(
        "…and lists what it found",
        await ev(
            () =>
                [...document.querySelectorAll(".setsec table.lib tbody tr")]
                    .map(r => r.querySelector('[data-act="open"]')!.textContent)
                    .sort()
                    .join() === "Harbour Lights,Lantern Run"
        )
    );
    await ev(() => {
        __ulTest.LB.idx = { at: "2026-01-05T00:00:00Z", n: 123456, games: {}, img: {} };
        __ulTest.LB.tried = true;
        __ulTest.render();
    });
    ok(
        "LaunchBox: the copy kept here, with Forget it",
        await ev(() =>
            /LaunchBox's database from .* \(123,456 games\)/.test(document.querySelector("#lbstat")!.textContent)
        )
    );
    await p.click('[data-act="lb-forget"]');
    await p.waitForTimeout(200);
    ok(
        "…Forget it forgets it",
        await ev(() => !__ulTest.LB.idx && document.querySelector("#lbstat")!.textContent === "")
    );
    const [chooser] = await Promise.all([
        p.waitForEvent("filechooser", { timeout: 3000 }).catch(() => null),
        p.click('[data-act="lb-pick"]'),
    ]);
    ok(
        "…Choose Metadata.zip asks for a .zip",
        !!chooser && (await chooser.element().getAttribute("accept")) === ".zip,application/zip"
    );
    await ev(() => {
        Object.assign(__ulTest.LB, { running: true, phase: "Reading LaunchBox's database…", read: 30, size: 120 });
        __ulTest.renderMain();
    });
    ok(
        "…while it reads: how far, and the button waits",
        await ev(
            () =>
                document.querySelector("#lbstat")!.textContent === "Reading LaunchBox's database… 25%" &&
                document.querySelector<HTMLElement>("#lbstat .prog span")!.style.width === "25%" &&
                document.querySelector<HTMLButtonElement>('[data-act="lb-pick"]')!.disabled
        )
    );
    await ev(() => {
        Object.assign(__ulTest.LB, { running: false, err: "That isn't LaunchBox's Metadata.zip" });
        __ulTest.renderMain();
    });
    ok(
        "…and an error says what went wrong",
        await ev(() => document.querySelector("#lbstat .err")!.textContent === "That isn't LaunchBox's Metadata.zip")
    );
    await ev(() => {
        __ulTest.LB.err = "";
        __ulTest.renderMain();
    });

    // ----- your proxy: which sources it has keys for -----
    // a key that isn't a web address has nothing to ask: Settings isn't drawn again and again (it was, endlessly, and the
    // tab froze: each answer came at once, in the same turn)
    const froze = await Promise.race([
        ev(() => {
            __ulTest.KEYS.igdb = "my secret key";
            window.__renders = 0;
            const o = (window.__rm = window.__rm || __ulTest.renderMain);
            __ulTest.renderMain = () => {
                window.__renders++;
                return o();
            };
            __ulTest.render();
        }).then(() => false),
        new Promise(r => setTimeout(() => r(true), 8000)),
    ]);
    if (froze) {
        ok("a proxy key that isn't an address doesn't keep drawing Settings", false, "the page froze");
        await b.close();
        return;
    }
    await p.waitForTimeout(1500);
    const loops = await ev(() => window.__renders);
    ok(
        "a proxy key that isn't an address doesn't keep drawing Settings",
        loops < 3 && (await ev(() => document.querySelector(".igdbhow")!.textContent.includes("Checking your proxy…"))),
        loops + " redraws in 1.5 s"
    );
    await ev(() => {
        __ulTest.renderMain = window.__rm;
    });
    await ev(() => {
        __ulTest.KEYS.igdb = "https://px.test/";
        __ulTest.render();
    });
    await p.waitForSelector(".pxchips", { state: "attached", timeout: 5000 }).catch(() => {});
    ok(
        "the proxy is asked which sources it has keys for",
        await ev(
            () =>
                [...document.querySelectorAll(".pxchips .chip")]
                    .map(x => (x.classList.contains("on") ? "+" : "-") + x.textContent)
                    .join() === "+● IGDB,-○ SteamGridDB,+● TheGamesDB,-○ ScreenScraper,+● Comic Vine,-○ Hardcover"
        )
    );
    await ev(() => {
        Reflect.deleteProperty(__ulTest.KEYS, "igdb");
    });

    // ----- the support link -----
    ok(
        "the support link: at the foot of Settings and in the corner, to the same place",
        await ev(() => {
            const a =
                    document.querySelector<HTMLAnchorElement>(".setsec a.donate.setdon") ||
                    document.querySelector("a.donate.setdon"),
                f = document.querySelector<HTMLAnchorElement>("#donatefoot a.donate.donatefoot");
            return (
                !!a &&
                !!f &&
                a.href === __ulTest.DONATE_URL &&
                f.href === __ulTest.DONATE_URL &&
                a.textContent === "♥ Support " + __ulTest.APP_NAME &&
                a.target === "_blank"
            );
        })
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
})();
