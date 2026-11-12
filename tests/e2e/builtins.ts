// Watch & read is a built-in extension: listed in Settings › Extensions, switched off it's gone from everywhere (menu, cards,
// right-click, the W key, the pages, an open player) and your progress stays; switched on, it's all back.
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
    const id = await ev(() =>
        __ulTest.addItem({
            medium: "anime",
            title: "Death Note",
            status: "active",
            prog: 5,
            total: 12,
            ext: { anilist: 3 },
        })
    );
    const fake = JSON.stringify({
        id: "fake-src",
        name: "Fake sources",
        permissions: ["watch.sources"],
        code: "univerlist.provide('watch.sources', () => [])",
    });
    await ev(t => __ulTest.extInstall(new File([t], "fake.json", { type: "application/json" })), fake);
    await p.waitForTimeout(600);
    const here = () =>
        ev(
            i => ({
                nav: !!document.querySelector('#side [data-act="go-stage"], [data-act="go-stage"]'),
                page: __ulTest.ui.page,
                player: !!__ulTest.W.player,
                prog: __ulTest.items.get(i)!.prog,
            }),
            id
        );
    await ev(() => __ulTest.goSettings("ext"));
    await p.waitForTimeout(300);
    ok(
        "Settings › Extensions lists Watch & read as built in and official, switched on",
        await ev(() => {
            const r = document.querySelector<HTMLInputElement>('[data-builtin="watch-read"]');
            return !!r && r.checked && /Official/.test(r.closest(".extrow")!.textContent);
        })
    );
    ok(
        "…with the extensions that plug into it",
        await ev(() =>
            /Plugged into it: Fake sources/.test(
                document.querySelector('[data-builtin="watch-read"]')!.closest(".extrow")!.textContent
            )
        )
    );
    // watching something, then switching it off
    await ev(i => __ulTest.watchFromItem(i), id);
    await p.waitForFunction(() => __ulTest.W.player && !__ulTest.W.player.loading, null, { timeout: 10000 });
    await ev(() => __ulTest.goSettings("ext"));
    await p.waitForTimeout(200);
    await p.click('label.sw:has([data-builtin="watch-read"])');
    await p.waitForTimeout(300);
    let s = await here();
    ok("switched off: the player closes and the menu entry goes", !s.player && !s.nav, JSON.stringify(s));
    ok("…your progress stays", s.prog === 5);
    await ev(i => {
        __ulTest.ui.page = "profile";
        __ulTest.render();
        __ulTest.openModal("item", { id: i });
    }, id);
    await p.waitForTimeout(300);
    ok("…no Watch button on the card", await ev(() => !document.querySelector('#overlay [data-act="watch-open"]')));
    await ev(() => __ulTest.closeModal());
    await ev(i => __ulTest.openCtx(i, 300, 300), id);
    await p.waitForTimeout(200);
    ok("…nor in the right-click menu", await ev(() => !document.querySelector('#ctx [data-act="watch-open"]')));
    await ev(() => __ulTest.closeCtx());
    await p.keyboard.press("w");
    await p.waitForTimeout(200);
    s = await here();
    ok(
        "…the W key says it is off instead of opening it",
        s.page !== "watch" &&
            /switched off/.test(await ev(() => (document.querySelector(".toast") || {}).textContent || "")),
        JSON.stringify(s)
    );
    await ev(() => {
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    s = await here();
    ok("…and its pages can't be reached", s.page === "profile", JSON.stringify(s));
    await ev(i => __ulTest.watchFromItem(i), id);
    s = await here();
    ok("…not even from code that asks for them", !s.player && s.page !== "watch", JSON.stringify(s));
    // and back on
    await p.click(".toast button");
    await p.waitForTimeout(300);
    s = await here();
    ok('"Switch it on" from the notice brings it all back', s.nav, JSON.stringify(s));
    await ev(i => __ulTest.openModal("item", { id: i }), id);
    await p.waitForTimeout(300);
    ok(
        "…the Watch button is back on the card",
        await ev(() => !!document.querySelector('#overlay [data-act="watch-open"]'))
    );
    ok(
        "…and the setting is saved",
        await ev(() => __ulTest.stageOn() && __ulTest.meta.settings.builtins!["watch-read"] === true)
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})();
