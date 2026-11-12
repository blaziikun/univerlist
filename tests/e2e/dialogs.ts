// The dialogs and menus drawn by Svelte (core/dialogs.ts, core/menus.ts): opening, filling, saving and cancelling the
// main ones, the right-click menus, and the score widget on the card and in the menu. And what they once got wrong:
//  · Add lost what you'd typed in its search box when you picked another medium
//  · a person's "why" you were typing was wiped by pressing a role
//  · New list lost the description you'd typed when you switched to a tier list and back
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    const wait = (ms = 150) => p.waitForTimeout(ms);
    await p.goto(ENV.APP);
    await p.waitForFunction(() => window.__ulTest?.booted);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const ids = await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        const film = __ulTest.addItem({
            medium: "film",
            title: "Night Harbour",
            year: 2011,
            status: "done",
            rating: 7,
        });
        const book = __ulTest.addItem({
            medium: "book",
            title: "The Glass Orchard",
            creator: "Ivo Penn",
            total: 300,
            status: "want",
        });
        __ulTest.meta.chars = [
            {
                id: "c1",
                name: "Mira Vale",
                media: [{ id: film, title: "Night Harbour", medium: "film" }],
                why: "",
                tags: [],
                rank: 1,
            },
        ];
        __ulTest.markDirty();
        const list = __ulTest.createList({ name: "Rainy days", ids: [], numbered: false });
        if (__ulTest.auto.ctl) __ulTest.auto.ctl.abort();
        __ulTest.auto.paused = true;
        return { film, book, list };
    });
    const item = (id: string) => ev(i => __ulTest.items.get(i), id);
    const svelte = () => ev(() => document.querySelector("#overlay .modal")?.hasAttribute("data-svelte"));

    // ── Add ──
    await ev(() => __ulTest.openAdd({ medium: "book" }));
    ok(
        "Add opens, drawn by Svelte, with the search box focused and the page behind inert",
        (await svelte()) &&
            (await ev(() => document.activeElement!.id === "a-q" && document.querySelector<HTMLElement>("#app")!.inert))
    );
    await p.fill("#a-q", "frieren");
    await p.click('[data-act="add-medium"][data-k="anime"]');
    await wait();
    ok(
        "picking another medium keeps what was typed (it was wiped)",
        await ev(
            () =>
                document.querySelector<HTMLInputElement>("#a-q")!.value === "frieren" &&
                __ulTest.ui.modal!.medium === "anime"
        )
    );
    ok("…and focus goes back to the search box", await ev(() => document.activeElement!.id === "a-q"));
    await p.press("#a-q", "Enter");
    await p.waitForSelector(".cands .cand", { timeout: 5000 });
    ok(
        "Enter searches the catalogue, and the results show",
        await ev(
            () =>
                document.querySelectorAll(".cands .cand").length >= 1 &&
                /Frieren/.test(document.querySelector(".cands")!.textContent)
        )
    );
    await p.click('.cands [data-act="add-pick"][data-k="0"]');
    await p.waitForSelector("#a-title", { timeout: 5000 });
    ok(
        "picking a result fills in the form",
        await ev(
            () =>
                /Frieren/.test(document.querySelector<HTMLInputElement>("#a-title")!.value) &&
                __ulTest.ui.modal!.step === "review"
        )
    );
    await p.fill("#a-rating", "8");
    await p.check("#a-fav");
    await p.click('[data-act="add-save"]');
    await wait(300);
    const added = await ev(() => {
        const x = [...__ulTest.items.values()].find(b => /Frieren/.test(b.title));
        return x && { rating: x.rating, fav: !!x.fav, card: __ulTest.ui.modal && __ulTest.ui.modal.kind };
    });
    ok(
        "Add saves it, with the score and favourite, and opens its card",
        added && added.rating === 8 && added.fav && added.card === "item",
        JSON.stringify(added)
    );
    await ev(() => __ulTest.closeModal());

    await ev(() => __ulTest.openAdd({ medium: "book" }));
    await p.fill("#a-q", "Paper Lanterns");
    await p.click('[data-act="add-manual"]');
    await wait();
    ok(
        '"Enter it myself" takes what was typed into the form',
        await ev(() => document.querySelector<HTMLInputElement>("#a-title")!.value === "Paper Lanterns")
    );
    await p.selectOption("#a-medium", "manga");
    await wait();
    ok(
        "…another medium there shows its own boxes and keeps the rest",
        await ev(
            () =>
                !!document.querySelector("#a-vols") &&
                document.querySelector<HTMLInputElement>("#a-title")!.value === "Paper Lanterns" &&
                /manga/i.test(document.querySelector(".mhead h3")!.textContent)
        )
    );
    await p.fill("#a-title", "");
    await p.click('[data-act="add-save"]');
    await wait();
    ok(
        "…without a title it says so, and adds nothing",
        await ev(
            () =>
                /needs a title/.test(document.querySelector(".modal .err")?.textContent || "") &&
                ![...__ulTest.items.values()].some(b => b.title === "")
        )
    );
    await p.click('[data-act="add-back"]');
    await wait();
    ok(
        "Back goes to the search, as it was",
        await ev(
            () =>
                __ulTest.ui.modal!.step === "search" &&
                document.querySelector<HTMLInputElement>("#a-q")!.value === "Paper Lanterns"
        )
    );
    await p.keyboard.press("Escape");
    await wait();
    ok(
        "Escape closes it, and the page behind is no longer inert",
        await ev(
            () =>
                !__ulTest.ui.modal &&
                !document.querySelector("#overlay")!.children.length &&
                !document.querySelector<HTMLElement>("#app")!.inert
        )
    );

    // ── the score widget on the card ──
    await ev(() => {
        __ulTest.meta.settings.ratingScale = "10";
        __ulTest.markDirty();
    });
    await ev(i => __ulTest.openItem(i), ids.book);
    await wait();
    await p.click('.modal .rate10 [data-act="rate"][data-k="7"]');
    await wait();
    ok(
        "the card's score: a number pressed is saved, and shows",
        (await item(ids.book))!.rating === 7 &&
            (await ev(
                () =>
                    document.querySelector('.modal .rate10 [data-k="7"]')!.classList.contains("on") &&
                    document.querySelector(".bigscore")!.textContent === "7"
            ))
    );
    await p.click('[data-act="crit-open"]');
    await p.click('.modal .critrow [data-act="crit"][data-k="9"]');
    await wait();
    ok(
        "…and each thing scored in detail",
        (await item(ids.book))!.crit?.Story === 9 || Object.values((await item(ids.book))!.crit || {}).includes(9)
    );
    await ev(() => {
        __ulTest.meta.settings.ratingScale = "100";
        __ulTest.markDirty();
    });
    await wait();
    ok(
        "…it follows the scale you change to (a slider for 100 points)",
        await ev(() => document.querySelector<HTMLInputElement>('.modal .ibox [data-ratenum="rate"]')!.value === "70")
    );
    await p.fill('.modal .ibox [data-ratenum="rate"]', "85");
    await p.press('.modal .ibox [data-ratenum="rate"]', "Tab");
    await wait();
    ok("…and a score typed in the box is saved out of 10", (await item(ids.book))!.rating === 8.5);
    await p.click('.modal .ibox > .rateslide [data-act="rate"][data-k="0"]');
    await wait();
    ok("…clear takes it away", !(await item(ids.book))!.rating);
    await ev(() => {
        __ulTest.closeModal();
        __ulTest.meta.settings.ratingScale = "10";
        __ulTest.markDirty();
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "library";
        __ulTest.render();
    });

    // ── the right-click menu, and its score ──
    const sel = `#main [data-act="open"][data-id="${ids.film}"]`;
    await p.waitForSelector(sel);
    await wait(300);
    // where the right-click landed, and whether the menu was closed again (for the message below, if it fails)
    await ev(() => {
        window.__ctxAt = null;
        window.__ctxClosed = 0;
        document.addEventListener(
            "contextmenu",
            e => {
                const t = (e.target as Element).closest<HTMLElement>(
                    "[data-act]"
                ); /* cast: a right-click lands on an element */
                window.__ctxAt = { act: t?.dataset.act, id: t?.dataset.id, x: e.clientX, y: e.clientY, scrollY };
            },
            { capture: true, once: true }
        );
        new MutationObserver(() => {
            const m = document.querySelector<HTMLElement>("#ctx");
            if (m && m.hidden) window.__ctxClosed++;
        }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
    });
    await p.click(sel, { button: "right" });
    // the menu, in the 10-point scale just chosen: if it isn't, say what it was instead of only timing out
    if (
        !(await p
            .waitForSelector('#ctx:not([hidden]) [data-act="ctx-rate"][data-k="9"]', { timeout: 10000 })
            .catch(() => null))
    )
        ok(
            "the menu shows the 10-point scale",
            false,
            JSON.stringify(
                await ev(
                    i => ({
                        scale: __ulTest.meta.settings.ratingScale,
                        own: __ulTest.items.get(i)!.scale,
                        at: window.__ctxAt,
                        closed: window.__ctxClosed,
                        scrollY,
                        about: document.querySelector<HTMLElement>("#ctx")?.dataset.id,
                        film: i,
                        ctx: (document.querySelector("#ctx") || {}).outerHTML?.slice(0, 600),
                    }),
                    ids.film
                )
            )
        );
    ok(
        "right-click on a cover opens its menu, drawn by Svelte",
        await ev(() => {
            const m = document.querySelector<HTMLElement>("#ctx");
            return m && !m.hidden && m.hasAttribute("data-svelte") && /Night Harbour/.test(m.textContent);
        }),
        await ev(() => {
            const m = document.querySelector<HTMLElement>("#ctx");
            return m ? m.hidden + " " + m.outerHTML.slice(0, 200) : "none";
        })
    );
    await p.click('#ctx [data-act="ctx-rate"][data-k="9"]');
    await wait();
    ok(
        "the menu's score is saved, and the menu shows it",
        (await item(ids.film))!.rating === 9 &&
            (await ev(() => /Score · 9/.test(document.querySelector("#ctx .ctx-s")!.textContent)))
    );
    await p.click('#ctx [data-act="ctx-status"][data-k="active"]');
    await wait();
    ok(
        "…as is a status, which the menu marks",
        (await item(ids.film))!.status === "active" &&
            (await ev(() => document.querySelector('#ctx [data-k="active"]')!.getAttribute("aria-pressed") === "true"))
    );
    await p.click('#ctx [data-act="ctx-fav"]');
    await wait();
    ok(
        "…and a favourite",
        !!(await item(ids.film))!.fav &&
            (await ev(() => /Unfavourite/.test(document.querySelector('#ctx [data-act="ctx-fav"]')!.textContent)))
    );
    const other = await ev(() => __ulTest.meta.modes.find(x => x.id !== "universal")!.id);
    await p.selectOption("#ctx #ctx-mode", other);
    await wait();
    ok("…and where it lives", (await item(ids.film))!.modeHome === other);
    await ev(() => {
        __ulTest.closeCtx();
        __ulTest.meta.settings.ratingScale = "100";
        __ulTest.markDirty();
    });
    await p.click(sel, { button: "right" });
    await p.waitForSelector('#ctx:not([hidden]) [data-ratenum="ctx-rate"]');
    await p.fill('#ctx [data-ratenum="ctx-rate"]', "45");
    await p.press('#ctx [data-ratenum="ctx-rate"]', "Enter");
    await wait();
    ok("with a slider scale, a score typed in the menu is saved out of 10", (await item(ids.film))!.rating === 4.5);
    await p.keyboard.press("Escape");
    await wait();
    ok(
        "Escape closes the menu, and lets it go",
        await ev(
            () =>
                document.querySelector<HTMLElement>("#ctx")!.hidden && !document.querySelector("#ctx")!.children.length
        )
    );
    await ev(() => {
        __ulTest.meta.settings.ratingScale = "10";
        __ulTest.markDirty();
    });

    // ── a character's menu, and a list's ──
    await ev(() => __ulTest.goTab("favourites"));
    await wait(300);
    const ch = await p.$('[data-act="open-char"][data-k="c1"], [data-charid="c1"]');
    if (ch) {
        await ch.click({ button: "right" });
        await wait();
        await p.click('#ctx [data-act="ctx-char-group"]');
        await wait();
        ok(
            "a character's menu: Group… shows the groups in its place",
            await ev(() => document.querySelectorAll('#ctx [data-act="ctx-char-setgroup"]').length >= 4)
        );
        await p.click('#ctx [data-act="ctx-char-setgroup"][data-g="Animal"]');
        await wait();
        ok(
            "…and a group chosen is saved and marked",
            await ev(
                () =>
                    __ulTest.meta.chars[0].group === "Animal" &&
                    document.querySelector('#ctx [data-g="Animal"]')!.getAttribute("aria-pressed") === "true"
            )
        );
        await ev(() => __ulTest.closeCtx());
    } else ok("a character to right-click", false);
    await ev(() => {
        __ulTest.ui.listId = null;
        __ulTest.goTab("lists");
    });
    await wait(300);
    await p.click(`#main [data-act="go-list"][data-k="${ids.list}"]`, { button: "right" });
    await wait();
    await p.fill(`#ctx [data-lrename="${ids.list}"]`, "Rainy afternoons");
    await p.press(`#ctx [data-lrename="${ids.list}"]`, "Enter");
    await wait();
    ok(
        "a list's menu renames it",
        await ev(
            l =>
                __ulTest.meta.lists.find(x => x.id === l)!.name === "Rainy afternoons" &&
                /Rainy afternoons/.test(document.querySelector("#ctx .ctx-h")!.textContent),
            ids.list
        )
    );
    await p.fill(`#ctx [data-lrename="${ids.list}"]`, "");
    await p.press(`#ctx [data-lrename="${ids.list}"]`, "Enter");
    await wait();
    ok(
        "…an empty name isn't kept, and the box shows the name again",
        await ev(
            l =>
                __ulTest.meta.lists.find(x => x.id === l)!.name === "Rainy afternoons" &&
                document.querySelector<HTMLInputElement>("#ctx .inp")!.value === "Rainy afternoons",
            ids.list
        )
    );
    await ev(() => __ulTest.closeCtx());

    // ── lists ──
    await ev(() => __ulTest.openModal("listnew", {}));
    await wait();
    ok(
        "New list opens with its name box focused",
        (await svelte()) && (await ev(() => document.activeElement!.id === "ln-name"))
    );
    await p.fill("#ln-name", "Long weekends");
    await p.fill("#ln-desc", "For three days off");
    await p.click('[data-act="ln-type"][data-k="tier"]');
    await wait();
    ok(
        "…a tier list has no description box",
        await ev(
            () => !document.querySelector("#ln-desc") && /tier/i.test(document.querySelector(".mhead h3")!.textContent)
        )
    );
    await p.click('[data-act="ln-type"][data-k="list"]');
    await wait();
    ok(
        "…and back to a list, the name and description are still there (the description was lost)",
        await ev(
            () =>
                document.querySelector<HTMLInputElement>("#ln-name")!.value === "Long weekends" &&
                document.querySelector<HTMLInputElement>("#ln-desc")!.value === "For three days off"
        )
    );
    await p.press("#ln-name", "Enter");
    await wait();
    ok(
        "Enter makes the list, and opens it",
        await ev(() => {
            const l = __ulTest.meta.lists.find(x => x.name === "Long weekends");
            return !!l && l.desc === "For three days off" && __ulTest.ui.listId === l.id && !__ulTest.ui.modal;
        })
    );

    await ev(i => __ulTest.openModal("listpick", { id: i }), ids.book);
    await wait();
    await p.click(`[data-act="lp-toggle"][data-k="${ids.list}"]`);
    await wait();
    ok(
        "Lists: ticking a list puts the entry in it, and shows the tick",
        await ev(
            ([l, i]) =>
                __ulTest.meta.lists.find(x => x.id === l)!.ids.includes(i) &&
                document.querySelector(`[data-act="lp-toggle"][data-k="${l}"]`)!.getAttribute("aria-pressed") ===
                    "true",
            [ids.list, ids.book]
        )
    );
    await p.fill("#lp-new", "To lend");
    await p.press("#lp-new", "Enter");
    await wait();
    ok(
        "…a new list is made with it in, and the box empties",
        await ev(
            i =>
                (__ulTest.meta.lists.find(x => x.name === "To lend")?.ids || []).includes(i) &&
                document.querySelector<HTMLInputElement>("#lp-new")!.value === "",
            ids.book
        )
    );
    await p.click('.modal [data-act="close"].btn');
    await wait();
    ok("…Done closes it", await ev(() => !__ulTest.ui.modal));

    await ev(l => {
        __ulTest.ui.listId = null;
        __ulTest.openModal("pickitem", { title: "Add to it", purpose: "list", lid: l, scope: "all", added: new Set() });
    }, ids.list);
    await wait();
    await p.fill("#pi-q", "night");
    await wait();
    ok("Pick entries: searching narrows it", await ev(() => document.querySelectorAll(".pigrid .pirow").length === 1));
    await p.press("#pi-q", "Enter");
    await wait();
    ok(
        "…Enter ticks the first one",
        await ev(
            i => (__ulTest.ui.modal!.sel as Set<string>).has(i),
            ids.film
        ) /* cast: Pick's ticks are a set of ids */
    );
    await p.click('[data-act="pi-add"]');
    await wait();
    ok(
        "…and Add puts what's ticked in the list, marked as added",
        await ev(
            ([l, i]) =>
                __ulTest.meta.lists.find(x => x.id === l)!.ids.includes(i) &&
                document.querySelector<HTMLInputElement>(`.pirow[data-id="${i}"]`)!.disabled,
            [ids.list, ids.film]
        )
    );
    await ev(() => __ulTest.closeModal());

    // ── a character, a person ──
    await ev(() => __ulTest.openModal("char", { id: "c1" }));
    await wait();
    await p.fill("#ch-tag", "stubborn");
    await p.press("#ch-tag", "Enter");
    await wait();
    ok(
        "Character: Enter in Traits adds the trait, empties the box and stays there",
        await ev(
            () =>
                __ulTest.meta.chars[0].tags!.includes("stubborn") &&
                document.activeElement!.id === "ch-tag" &&
                !(document.activeElement as HTMLInputElement).value
        )
    ); /* cast: the box that has focus */
    await p.fill("#ch-why", "Never gives up");
    await p.click('[data-act="char-save"]');
    await wait();
    ok("…Save keeps why they're a favourite", await ev(() => __ulTest.meta.chars[0].why === "Never gives up"));
    await p.click('[data-act="char-del"]');
    await wait();
    ok("…Remove asks first", await ev(() => !!document.querySelector('[data-act="char-del-yes"]')));
    await p.click('[data-act="char-del-no"]');
    await wait();
    ok(
        "…Keep takes the question away",
        await ev(() => !document.querySelector('[data-act="char-del-yes"]') && __ulTest.meta.chars.length === 1)
    );
    await p.click('[data-act="char-del"]');
    await p.click('[data-act="char-del-yes"]');
    await wait();
    ok("…and Remove removes them", await ev(() => !__ulTest.meta.chars.length && !__ulTest.ui.modal));

    await ev(() => __ulTest.openModal("person", { name: "Ivo Penn" }));
    await wait();
    await p.fill("#pp-why", "Quiet, careful books");
    await p.click('[data-act="pp-role"][data-k="Artist"]');
    await wait();
    ok(
        "Person: a role pressed is saved, and what you were typing stays (it was wiped)",
        await ev(
            () =>
                (__ulTest.meta.people || []).some(x => x.name === "Ivo Penn" && (x.roles || []).includes("Artist")) &&
                document.querySelector<HTMLInputElement>("#pp-why")!.value === "Quiet, careful books"
        )
    );
    await p.click('[data-act="pp-save"]');
    await wait();
    ok(
        "…Save keeps it",
        await ev(() => __ulTest.meta.people.find(x => x.name === "Ivo Penn")!.why === "Quiet, careful books")
    );
    await ev(() => __ulTest.closeModal());

    // ── import and export ──
    await ev(() => __ulTest.openModal("paste", { medium: "film" }));
    await wait();
    ok(
        "Paste a list opens with the text box focused",
        (await svelte()) && (await ev(() => document.activeElement!.id === "ps-text"))
    );
    await p.fill("#ps-text", "Alpha (2001) - 8\nBeta\nNight Harbour");
    await p.click('[data-act="ps-preview"]');
    await wait();
    ok(
        "…Check shows what was read",
        await ev(
            () =>
                /3 titles · 1 already in your library .*· 1 with scores/.test(
                    document.querySelector(".modal")!.textContent
                ) && document.querySelectorAll(".modal .lrow").length === 3
        )
    );
    await ev(() => __ulTest.closeModal());
    await ev(() =>
        __ulTest.openModal("io", {
            preview: {
                kind: "Goodreads",
                name: "shelf.csv",
                items: [
                    { title: "Moss Lane", medium: "book" },
                    { title: "Cold Spring", medium: "book" },
                ],
                match: 0,
            },
        })
    );
    await wait();
    await p.selectOption("#imp-kind", "Poetry");
    await p.click('[data-act="import-csv"]');
    await wait();
    ok(
        "Import: a list from another site comes in, as the type chosen",
        await ev(
            () =>
                ["Moss Lane", "Cold Spring"].every(t =>
                    [...__ulTest.items.values()].some(b => b.title === t && b.kind === "Poetry")
                ) && !__ulTest.ui.modal
        )
    );
    await ev(() =>
        __ulTest.openModal("io", {
            preview: {
                kind: "bundle",
                name: "pack.zip",
                parts: { lists: [{ id: "x", name: "From a pack", ids: [] }], profile: { name: "T" } },
            },
        })
    );
    await wait();
    ok(
        "…a pack lists its parts, all ticked",
        await ev(
            () =>
                document.querySelectorAll("[data-part]").length === 2 &&
                (__ulTest.ui.modal!.sel as Record<string, boolean>).lists === true &&
                (__ulTest.ui.modal!.sel as Record<string, boolean>).profile ===
                    true /* casts: Import's ticks are a record */
        )
    );
    await p.uncheck('[data-part="profile"]');
    await wait();
    ok(
        "…unticking one is what Merge will read",
        await ev(
            () =>
                (__ulTest.ui.modal!.sel as Record<string, boolean>).profile === false &&
                (__ulTest.ui.modal!.sel as Record<string, boolean>).lists === true /* casts: as above */
        )
    );
    await ev(() => __ulTest.closeModal());
    await ev(() => {
        __ulTest.ui.expAsk = false;
        __ulTest.openModal("exportpick");
    });
    await wait();
    await p.uncheck('[data-expp="themes"]');
    await p.fill("#exp-keypass", "a long passphrase");
    ok(
        "Download everything: what's unticked and the passphrase are what Download reads",
        await ev(() => __ulTest.ui.expParts!.themes === false && __ulTest.ui.expPass === "a long passphrase")
    );
    await p.click('.modal [data-act="close"].btn');
    await wait();
    ok("…Cancel closes it", await ev(() => !__ulTest.ui.modal));

    // ── artwork ──
    await ev(() => __ulTest.openModal("covers"));
    await wait();
    await p.selectOption("#rc-scope", "scores");
    ok("Refresh artwork: what to fetch is the dialog's", await ev(() => __ulTest.ui.modal!.scope === "scores"));
    await ev(() => __ulTest.closeModal());

    for (let i = 0; i < 4; i++) {
        await ev(() => __ulTest.openAdd());
        await ev(() => __ulTest.closeModal());
        await ev(() => __ulTest.openModal("listnew", {}));
        await ev(() => __ulTest.closeModal());
    }
    ok(
        "opening and closing them leaves nothing behind",
        await ev(
            () =>
                !document.querySelector("#overlay")!.children.length &&
                ![...document.body.children].some(e => e instanceof HTMLElement && e.inert)
        )
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    const m = e.message.split("\n");
    console.log("FAIL " + m[0] + " " + (m.find((l: string) => /waiting for/.test(l)) || "").trim());
    process.exit(1);
});
