// The shell, drawn by Svelte (core/shell/): the sidebar (pinning, folding, text size, Customise, resizing), the top
// bar, the profile header's mode menu and tabs (dragging one into place), and the search box with the keyboard
// (↓ ↑ move through every row, Enter opens the one marked, Escape closes). And what it once got wrong:
//  · the sidebar's Customise menu stayed open after a click elsewhere (only the page was drawn again)
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
    await ev(() => {
        __ulTest.meta.settings.autoFetch = false;
        if (__ulTest.auto.ctl) __ulTest.auto.ctl.abort();
        __ulTest.auto.paused = true;
        const o = {
            a: __ulTest.addItem({ medium: "anime", title: "Lantern Garden", status: "done", rating: 9 }),
            b: __ulTest.addItem({ medium: "anime", title: "Lantern Garden II", status: "want" }),
            f: __ulTest.addItem({ medium: "film", title: "Lantern Road", status: "active" }),
        };
        __ulTest.goTab("library");
        return o;
    });
    const wait = (ms = 120) => p.waitForTimeout(ms);

    // ── the sidebar ──
    await p.click('[data-act="side-toggle"]');
    await wait();
    ok(
        "the top bar's button pins the sidebar open, drawn by Svelte",
        await ev(
            () =>
                __ulTest.meta.layout.side.pinned &&
                document.querySelector("#app")!.classList.contains("side-open") &&
                !!document.querySelector("#side .side-in .sgroup")
        )
    );
    ok(
        "…with every mode and this mode's shelves, counted",
        await ev(
            () =>
                document.querySelectorAll('#side [data-act="mode"]').length === __ulTest.meta.modes.length &&
                document.querySelector('#side [data-act="shelf"][data-k=""] .ct')!.textContent === "3"
        )
    );
    await p.click('#side [data-act="side-status"][data-k="done"]');
    await wait();
    ok(
        "a status in the sidebar filters the library, and is marked",
        await ev(
            () =>
                __ulTest.ui.status === "done" &&
                document.querySelector('#side [data-act="side-status"][data-k="done"]')!.classList.contains("on")
        )
    );
    await p.click('#side [data-act="side-sec"][data-k="modes"]');
    await wait();
    ok(
        "a section folds, and is remembered",
        await ev(
            () =>
                __ulTest.meta.layout.side.closed!.includes("modes") &&
                document.querySelector('#side [data-k="modes"]')!.closest(".sgroup")!.classList.contains("shut")
        )
    );
    await p.click('#side [data-act="side-sec"][data-k="modes"]');
    await wait();
    await p.click('#side [data-act="side-text"][data-k="l"]');
    await wait();
    ok(
        "the text size is set, and marked",
        await ev(
            () =>
                document.querySelector<HTMLElement>("#app")!.dataset.stext === "l" &&
                document.querySelector("#side .st-l")!.getAttribute("aria-pressed") === "true"
        )
    );
    await p.click('#side [data-act="pop"][data-k="sidecust"]');
    await wait();
    ok(
        "Customise opens, with a tick for each section",
        await ev(() => document.querySelectorAll("#side .popbody [data-sidesec]").length === 7)
    );
    await p.uncheck('#side [data-sidesec="lists"]');
    await wait();
    ok(
        "…a section unticked leaves the sidebar",
        await ev(
            () =>
                __ulTest.meta.layout.side.hide!.includes("lists") &&
                !document.querySelector('#side [data-act="side-sec"][data-k="lists"]')
        )
    );
    await p.check('#side [data-sidesec="lists"]');
    await wait();
    await p.mouse.click(1000, 150);
    await wait();
    ok(
        "…and a click elsewhere closes it (it stayed open)",
        await ev(() => !__ulTest.ui.pop && !document.querySelector("#side .popbody"))
    );
    const w0 = await ev(() => __ulTest.meta.layout.side.width),
        grip = await p.$("#side .side-grip"),
        gb = await grip!.boundingBox();
    await p.mouse.move(gb!.x + gb!.width / 2, gb!.y + 200);
    await p.mouse.down();
    await p.mouse.move(gb!.x + 60, gb!.y + 200, { steps: 4 });
    await p.mouse.up();
    await wait();
    ok(
        "its edge is dragged to make it wider",
        await ev(
            w =>
                __ulTest.meta.layout.side.width > w &&
                document.querySelector<HTMLElement>("#app")!.style.getPropertyValue("--side-w") ===
                    __ulTest.meta.layout.side.width + "px",
            w0
        )
    );
    await p.click('#side [data-act="side-pin"]');
    await wait();
    ok(
        "the pin unpins it",
        await ev(
            () => !__ulTest.meta.layout.side.pinned && !document.querySelector("#app")!.classList.contains("side-open")
        )
    );
    await p.mouse.move(2, 400);
    await wait(200);
    ok(
        "…then it peeks out from the screen's edge",
        await ev(() => document.querySelector("#app")!.classList.contains("side-peek"))
    );
    await p.mouse.move(900, 400);
    await p
        .waitForFunction(() => !document.querySelector("#app")!.classList.contains("side-peek"), null, {
            timeout: 3000,
        })
        .catch(() => {});
    ok(
        "…and hides again when you leave it",
        await ev(() => !document.querySelector("#app")!.classList.contains("side-peek"))
    );

    // ── the top bar and the profile header ──
    ok(
        "the top bar is drawn by Svelte: the logo, search, Insights and Settings",
        await ev(
            () =>
                !!document.querySelector("#top .top .brand .logo") &&
                !!document.querySelector('#top [data-act="focus-search"]') &&
                !!document.querySelector('#top [data-act="settings-toggle"]')
        )
    );
    await ev(() => {
        __ulTest.meta.settings.appName = "My Shelf";
        __ulTest.markDirty();
        __ulTest.renderTop();
    });
    await wait();
    ok(
        "the logo follows the app's name",
        await ev(() => document.querySelector("#top .logo")!.textContent === "My Shelf")
    );
    await ev(() => {
        __ulTest.auto.running = true;
        __ulTest.auto.paused = false;
        __ulTest.auto.total = 9;
        __ulTest.auto.done = 2;
        __ulTest.updateBusy();
    });
    await wait();
    ok(
        "the busy light shows what's at work",
        await ev(
            () =>
                !document.querySelector<HTMLElement>("#busy")!.hidden &&
                /Finding artwork 2\/9/.test(document.querySelector<HTMLElement>("#busy")!.title)
        )
    );
    await ev(() => {
        __ulTest.auto.running = false;
        __ulTest.updateBusy();
    });
    await wait();
    ok("…and goes out", await ev(() => document.querySelector<HTMLElement>("#busy")!.hidden));
    await p.click(".pmodebtn");
    await wait();
    ok(
        "the mode button opens the mode menu",
        await ev(
            () =>
                __ulTest.ui.modeMenu &&
                document.querySelectorAll('.modemenu [data-act="mode"]').length === __ulTest.meta.modes.length &&
                document.querySelector(".pmodebtn")!.getAttribute("aria-expanded") === "true"
        )
    );
    await p.keyboard.press("Escape");
    await wait();
    ok(
        "…Escape closes it",
        await ev(
            () =>
                !__ulTest.ui.modeMenu &&
                !document.querySelector(".modemenu") &&
                document.querySelector(".pmodebtn")!.getAttribute("aria-expanded") === "false"
        )
    );
    await p.click(".pmodebtn");
    await wait();
    await p.mouse.click(1000, 150);
    await wait();
    ok("…and so does a click elsewhere", await ev(() => !__ulTest.ui.modeMenu && !document.querySelector(".modemenu")));
    await p.click(".pmodebtn");
    await wait();
    await p.click('.modemenu [data-act="mode"][data-k="animanga"]');
    await wait();
    ok(
        "a mode picked from it is opened",
        await ev(() => __ulTest.ui.mode === "animanga" && !document.querySelector(".modemenu"))
    );
    await ev(() => __ulTest.setMode("universal"));
    const tabs = () =>
        ev(() => [...document.querySelectorAll<HTMLElement>('.ptabs [data-act="tab"]')].map(x => x.dataset.k));
    const before = await tabs();
    await ev(() => {
        const el = document.querySelector('.ptabs [data-k="library"]')!,
            dst = document.querySelector('.ptabs [data-k="lists"]')!,
            dt = new DataTransfer();
        const r = dst!.getBoundingClientRect(),
            send = (e: Element, type: string) =>
                e.dispatchEvent(
                    new DragEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: dt,
                        clientX: r.right - 2,
                        clientY: r.top + 4,
                    })
                );
        send(el, "dragstart");
        send(dst, "dragover");
        send(dst, "drop");
        send(el, "dragend");
    });
    await wait();
    const after = await tabs();
    ok(
        "a tab dragged along the bar goes after the one it's dropped on",
        after.indexOf("library") === after.indexOf("lists") + 1 &&
            !(await ev(() => document.querySelector(".ptabs .tabins-a, .ptabs .tabins-b"))),
        before.join() + " → " + after.join()
    );
    await p.click('.ptabs [data-act="tab"][data-k="stats"]');
    await wait();
    ok(
        "a tab opens its page under the header",
        await ev(
            () =>
                __ulTest.ui.tab === "stats" &&
                !!document.querySelector(".tabbody.t-stats") &&
                document.querySelector('.ptabs [data-k="stats"]')!.getAttribute("aria-selected") === "true"
        )
    );

    // ── search, with the keyboard ──
    await c.setOffline(true); // the library's results only: the web's come in their own time
    await p.keyboard.press("Control+k");
    await wait();
    ok(
        "Ctrl+K opens the search box, focused",
        await ev(() => document.activeElement!.id === "gq" && document.querySelector("#gs")!.classList.contains("open"))
    );
    await p.keyboard.type("lantern");
    await wait(200);
    const rows = () =>
        ev(() =>
            [...document.querySelectorAll<HTMLElement>("#gsres [data-gs]")].map(x => ({
                i: +x.dataset.gs!,
                on: x.classList.contains("on"),
            }))
        );
    let r = await rows();
    ok(
        "what's typed finds things in the library at once, the first row marked",
        r.length >= 4 && r[0].on && r.filter(x => x.on).length === 1,
        JSON.stringify(r)
    );
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("ArrowDown");
    await wait();
    r = await rows();
    ok("↓ moves the mark down a row at a time", r.find(x => x.on)!.i === 2 && (await ev(() => __ulTest.GS.i === 2)));
    await p.keyboard.press("ArrowUp");
    await wait();
    ok("↑ moves it back up", (await rows()).find(x => x.on)!.i === 1);
    for (let i = 0; i < 20; i++) await p.keyboard.press("ArrowDown");
    r = await rows();
    ok(
        '…and stops at the last row ("Add it yourself")',
        r.find(x => x.on)!.i === r.length - 1 &&
            (await ev(() => document.querySelector("#gsres .gsr.on")!.closest(".gsfoot") !== null))
    );
    for (let i = 0; i < 20; i++) await p.keyboard.press("ArrowUp");
    await p.keyboard.press("ArrowDown");
    await wait();
    const want = await ev(() => document.querySelector("#gsres .gsr.on b")!.textContent);
    await p.keyboard.press("Enter");
    await wait(200);
    ok(
        "Enter opens the one marked, and closes the box",
        await ev(
            t =>
                __ulTest.ui.modal &&
                __ulTest.ui.modal.kind === "item" &&
                __ulTest.titleOf(__ulTest.items.get(__ulTest.ui.modal.id!)!) === t &&
                !__ulTest.GS.open &&
                document.querySelector<HTMLElement>("#gsres")!.hidden &&
                document.querySelector<HTMLInputElement>("#gq")!.value === "",
            want
        ),
        want
    );
    await ev(() => __ulTest.closeModal());
    await ev(() => __ulTest.focusSearch());
    await p.keyboard.type("zzqx");
    await wait();
    ok(
        'nothing found: each column says so, and "Add it yourself" is there',
        await ev(
            () =>
                [...document.querySelectorAll("#gsres .gsp")].every(x => x.textContent === "Nothing here") &&
                /Add “zzqx” yourself/.test(document.querySelector("#gsres .gsfoot")!.textContent)
        )
    );
    await p.click('#gs [data-act="search-close"]');
    await wait();
    ok(
        "✕ clears what's typed and keeps the box open",
        await ev(
            () =>
                document.querySelector<HTMLInputElement>("#gq")!.value === "" &&
                document.activeElement!.id === "gq" &&
                document.querySelector<HTMLElement>("#gsres")!.hidden &&
                document.querySelector("#gs")!.classList.contains("open")
        )
    );
    await p.keyboard.type("lan");
    await p.keyboard.press("Escape");
    await wait();
    ok(
        "Escape closes it",
        await ev(
            () =>
                !__ulTest.GS.open &&
                !document.querySelector("#gs")!.classList.contains("open") &&
                document.querySelector<HTMLElement>("#gsres")!.hidden
        )
    );
    await c.setOffline(false);
    await ev(() => __ulTest.focusSearch());
    await p.keyboard.type("frieren");
    await p
        .waitForFunction(() => __ulTest.GS.webQ === "frieren" && !Object.values(__ulTest.GS.busy).some(Boolean), null, {
            timeout: 15000,
        })
        .catch(() => {});
    ok(
        "the web's results come in under the library's, each with ＋",
        await ev(() => document.querySelectorAll("#gsres .gsr.web [data-gsq]").length >= 1)
    );
    await p.dispatchEvent("#gsres .gsr.web [data-gsq]", "pointerdown");
    await p
        .waitForFunction(() => [...__ulTest.items.values()].some(x => /Frieren/.test(x.title)), null, {
            timeout: 10000,
        })
        .catch(() => {});
    ok(
        "…＋ adds one straight in, and the box stays open",
        await ev(() => [...__ulTest.items.values()].some(x => /Frieren/.test(x.title)) && __ulTest.GS.open)
    );
    await p.keyboard.press("Escape");

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
