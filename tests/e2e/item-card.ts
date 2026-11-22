// The item card (library/card/, a Svelte component): what people do on it, and what it once got wrong.
//  · Edit details: picking another medium showed the old one again, so a medium could never be changed there
//  · what you'd typed into the card (a journal entry, a quote) was wiped by pressing any other button on it
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
    await p.goto(ENV.APP);
    await p.waitForFunction(() => window.__ulTest?.booted);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const ids = await ev(() => ({
        book: __ulTest.addItem({
            medium: "book",
            title: "The Hobbit",
            creator: "J. R. R. Tolkien",
            total: 300,
            status: "want",
        }),
        film: __ulTest.addItem({ medium: "film", title: "Arrival", year: 2016, status: "want" }),
        show: __ulTest.addItem({ medium: "tv", title: "Dark", status: "active" }),
    }));
    const card = (id: string) =>
        ev(i => {
            if (__ulTest.ui.modal) __ulTest.closeModal();
            __ulTest.openItem(i, null);
        }, id);
    const item = (id: string) => ev(i => __ulTest.items.get(i), id);

    // ── the bugs ──
    await card(ids.book);
    await p.click("details.imore > summary");
    await p.click('[data-act="edit"]');
    ok(
        "Edit details opens with the title box focused",
        await ev(() => document.activeElement && document.activeElement.id === "e-title")
    );
    await p.selectOption("#e-medium", "manga");
    await p.waitForTimeout(100);
    ok(
        "picking another medium in Edit details keeps it",
        await ev(() => document.querySelector<HTMLInputElement>("#e-medium")!.value === "manga")
    );
    ok("…and shows that medium's own fields (Volumes)", await ev(() => !!document.querySelector("#e-vols")));
    await p.fill("#e-title", "The Hobbit, illustrated");
    await p.selectOption("#e-medium", "novel");
    await p.waitForTimeout(100);
    ok(
        "…keeping what was typed when it changes again",
        await ev(() => document.querySelector<HTMLInputElement>("#e-title")!.value === "The Hobbit, illustrated")
    );
    await p.click('[data-act="save-edit"]');
    await p.waitForTimeout(100);
    let it = await item(ids.book);
    ok(
        "…and saves it",
        it!.medium === "novel" && it!.title === "The Hobbit, illustrated",
        it!.medium + " / " + it!.title
    );
    ok(
        "leaving Edit details puts focus back on the card",
        await ev(
            () =>
                document.activeElement &&
                document.activeElement.classList.contains("x") &&
                !!document.querySelector(".item7")
        )
    );

    await p.click('[data-act="item-tab"][data-k="journal"]');
    await p.fill("#jr-text", "Half-written thought");
    await p.click('.modal [data-act="fav-toggle"]');
    await p.waitForTimeout(150);
    ok(
        "a favourite pressed on the card shows on it",
        await ev(
            () => document.querySelector('.modal [data-act="fav-toggle"]')!.getAttribute("aria-pressed") === "true"
        )
    );
    ok(
        "…and leaves what you were typing alone",
        await ev(() => document.querySelector<HTMLInputElement>("#jr-text")!.value === "Half-written thought")
    );

    // ── what people do on it ──
    await p.click('[data-act="journal-add"]');
    await p.waitForTimeout(100);
    it = await item(ids.book);
    ok(
        "Add entry saves it and empties the box",
        it!.journal.length === 1 &&
            it!.journal[0].text === "Half-written thought" &&
            (await ev(() => document.querySelector<HTMLInputElement>("#jr-text")!.value === ""))
    );
    await p.fill("#qt-text", "In a hole in the ground");
    await p.fill("#qt-page", "1");
    await p.click('[data-act="quote-add"]');
    await p.waitForTimeout(100);
    it = await item(ids.book);
    ok(
        "a quote is saved with its page, and both boxes empty",
        it!.quotes.length === 1 &&
            it!.quotes[0].page === "1" &&
            (await ev(
                () =>
                    !document.querySelector<HTMLInputElement>("#qt-text")!.value &&
                    !document.querySelector<HTMLInputElement>("#qt-page")!.value
            ))
    );
    ok(
        "the tab counts what the journal holds",
        await ev(() =>
            /Journal · 2/.test(document.querySelector('[data-act="item-tab"][data-k="journal"]')!.textContent)
        )
    );

    await p.click('[data-act="item-tab"][data-k="synopsis"]');
    ok(
        "tabs say which one is open",
        await ev(
            () =>
                document.querySelector('[data-k="synopsis"]')!.getAttribute("aria-selected") === "true" &&
                document.querySelector('[data-k="journal"]')!.getAttribute("aria-selected") === "false"
        )
    );
    await p.selectOption("#it-status", "active");
    await p.waitForTimeout(100);
    it = await item(ids.book);
    ok("Status changes it, and dates the start", it!.status === "active" && !!it!.startedAt);
    await p.fill("#pg-now", "42");
    await p.press("#pg-now", "Enter");
    await p.waitForTimeout(100);
    ok("Enter in the progress box logs it", (await item(ids.book))!.prog === 42);
    await p.fill("#tag-in", "cosy");
    await p.press("#tag-in", "Enter");
    await p.waitForTimeout(100);
    ok(
        "Enter in the tag box adds the tag, empties the box and stays there",
        (await item(ids.book))!.tags.includes("cosy") &&
            (await ev(
                () => document.activeElement!.id === "tag-in" && !(document.activeElement as HTMLInputElement).value
            ))
    ); /* cast: the box that has focus */
    await p.fill("#notes", "Lent to a friend");
    await p.click(".modal h2");
    await p.waitForTimeout(100);
    ok("notes save when you leave the box", (await item(ids.book))!.notes === "Lent to a friend");

    await p.click('[data-act="item-tab"][data-k="connect"]');
    await p.fill("#lk-target", "Arrival · film");
    await p.fill("#lk-note", "same feeling");
    await p.click('[data-act="link-add"]');
    await p.waitForTimeout(100);
    it = await item(ids.book);
    ok(
        "Link joins the two, and the boxes empty",
        it!.links.some(l => l.id === ids.film && l.note === "same feeling") &&
            (await ev(
                () =>
                    !document.querySelector<HTMLInputElement>("#lk-target")!.value &&
                    !document.querySelector<HTMLInputElement>("#lk-note")!.value
            ))
    );
    ok(
        "…and the link shows on the card",
        await ev(f => !!document.querySelector(`.lrow [data-act="open"][data-id="${f}"]`), ids.film)
    );

    // the card keeps up with changes made anywhere, and with the older code setting its state and asking for a redraw
    await ev(i => __ulTest.patch(i, { creator: "Someone Else" }, "Edit"), ids.book);
    await p.waitForTimeout(50);
    ok(
        "a change made elsewhere shows on the open card",
        await ev(() => /Someone Else/.test(document.querySelector(".ihead .by")!.textContent))
    );
    await ev(() => {
        __ulTest.ui.modal!.tab = "art";
        __ulTest.renderOverlay();
    });
    ok(
        "…as does its own state set in place, once renderOverlay() is called",
        await ev(
            () =>
                document.querySelector('[data-k="art"][role="tab"]')!.getAttribute("aria-selected") === "true" &&
                !!document.querySelector('[data-act="find-art"]')
        )
    );

    // stepping through, deleting, closing
    await ev(ids => {
        __ulTest.closeModal();
        __ulTest.openItem(ids.film, [ids.book, ids.film, ids.show]);
    }, ids);
    ok(
        "← and → show where it is in the list",
        await ev(() => document.querySelector(".navarrows .pos")!.textContent === "2 / 3")
    );
    await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(100);
    ok(
        "→ steps to the next one",
        await ev(
            i => __ulTest.ui.modal!.id === i && document.querySelector(".modal h2")!.textContent === "Dark",
            ids.show
        )
    );
    await p.click('[data-act="item-prev"]');
    await p.waitForTimeout(100);
    ok("the ← button steps back", await ev(i => __ulTest.ui.modal!.id === i, ids.film));
    await p.click("details.imore > summary");
    await p.click('[data-act="delete"]');
    ok(
        "Delete asks first, with More still open",
        await ev(
            () =>
                document.querySelector<HTMLDetailsElement>("details.imore")!.open &&
                !!document.querySelector('[data-act="delete-yes"]')
        )
    );
    await p.click('[data-act="delete-no"]');
    ok(
        "…Keep takes the question away",
        await ev(
            () => !document.querySelector('[data-act="delete-yes"]') && !!document.querySelector('[data-act="delete"]')
        )
    );

    await ev(() => {
        __ulTest.closeModal();
        __ulTest.ui.page = "profile";
        __ulTest.ui.tab = "library";
        __ulTest.render();
    });
    await p.waitForSelector(`#main [data-act="open"][data-id="${ids.film}"]`);
    await p.focus(`#main [data-act="open"][data-id="${ids.film}"]`);
    await p.keyboard.press("Enter");
    await p.waitForSelector(".item7");
    ok(
        "opened from the library, the page behind is inert",
        await ev(
            () => document.querySelector<HTMLElement>("#app")!.inert && document.activeElement!.closest("#overlay")
        )
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok(
        "Escape closes it, and gives focus back to what opened it",
        await ev(
            i =>
                !__ulTest.ui.modal &&
                !document.querySelector(".item7") &&
                (document.activeElement as HTMLElement).dataset.id === i /* cast: as above */ &&
                !document.querySelector<HTMLElement>("#app")!.inert,
            ids.film
        )
    );
    for (let i = 0; i < 5; i++) {
        await card(ids.book);
        await ev(() => __ulTest.closeModal());
    }
    ok(
        "opening and closing it leaves nothing behind",
        await ev(() => !document.querySelector("#overlay")!.children.length)
    );

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
