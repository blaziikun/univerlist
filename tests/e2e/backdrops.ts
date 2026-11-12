// Backdrop builder (beta): an official extension, off until you switch it on. Then Settings › Backdrops makes your own moving
// background (playing behind the page as you change it), puts it on a theme, shares it as a file and opens one, with a
// shared file's bad parts dropped. Switched off, a theme on one of yours shows its usual backdrop and nothing of it runs.
import ENV from "./env.ts";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ok, evaluator } from "./helpers.ts";
import type { Backdrop } from "../../src/features/backdrops/backdrop";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
    const p = await c.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    const W = '.setsec[data-sec="backdrops"]',
        btn = (t: string) => `${W} button:has-text("${t}")`;
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');

    ok(
        "off until you switch it on: no Backdrops in Settings",
        await ev(() => !__ulTest.builtinOn("backdrops") && !__ulTest.setSecs().some(([k]) => k === "backdrops"))
    );
    await ev(() => {
        __ulTest.builtinSet("backdrops", true);
        __ulTest.goSettings("backdrops");
    });
    await p.waitForSelector(W, { timeout: 10000 });
    ok(
        "switched on, Settings has a Backdrops section",
        await ev(() => /Backdrops/.test(document.querySelector<HTMLElement>(".setsecs")!.innerText))
    );

    // ----- make one from a starter: it plays behind the page while you change it -----
    await p.click(btn("Fireflies"));
    await p.waitForSelector("#amb canvas.mybackdrop", { timeout: 5000 });
    await p.waitForTimeout(300);
    const lit = () =>
        ev(() => {
            const cv = document.querySelector<HTMLCanvasElement>("#amb canvas.mybackdrop");
            if (!cv) return 0;
            const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
            let n = 0;
            for (let i = 3; i < d.length; i += 4000) if (d[i]) n++;
            return n;
        });
    ok("while you edit, it plays behind the page", (await lit()) > 0);
    await p.fill(`${W} input[maxlength="40"]`, "Glow");
    await p.click(btn("Add a layer of shapes"));
    ok("…with up to four layers you can change", (await p.locator(`${W} fieldset.wlayer`).count()) === 2);
    await p.selectOption(`${W} fieldset.wlayer >> nth=1 >> select`, "heart");
    await p
        .locator(`${W} input[type="file"][accept="image/*"]`)
        .setInputFiles(path.join(ENV.ROOT, "public/icon-192.png"));
    await p.waitForSelector(btn("Remove picture"), { timeout: 5000 });
    await p.click(btn("Save"));
    const st = await ev(() => ({
        w: __ulTest.meta.settings.backdrops as
            | Backdrop[]
            | undefined /* cast: Settings keep them unchecked; the builder just saved these */,
        canvas: !!document.querySelector("#amb canvas.mybackdrop"),
    }));
    const mine = st.w![0];
    ok(
        "saved in your settings (so it syncs and backs up)",
        st.w!.length === 1 && mine.name === "Glow" && mine.layers.length === 2 && mine.layers[1].shape === "heart",
        JSON.stringify(st.w).slice(0, 160)
    );
    ok(
        "the picture was redrawn on your device as a small JPEG",
        /^data:image\/jpeg;base64,/.test(mine.picture?.src ?? "")
    );
    ok("saving ends the preview (the theme isn't using it yet)", !st.canvas);

    // ----- use it -----
    await p.click(btn("Use it"));
    await p.waitForSelector("#amb canvas.mybackdrop", { timeout: 5000 });
    const st2 = await ev(() => ({
        backdrop: document.documentElement.dataset.backdrop,
        theme: __ulTest.modeTheme().backdrop,
    }));
    ok(
        '"Use it" puts it behind this theme',
        st2.backdrop === "mine:" + mine.id && st2.theme === st2.backdrop,
        JSON.stringify(st2)
    );
    await p.waitForSelector(`${W} .pill:has-text("On this theme")`, { timeout: 5000 });
    await ev(() => __ulTest.goSettings("appearance"));
    await p.waitForTimeout(200);
    ok(
        "…and the Backdrop list in Appearance has it",
        await ev(() =>
            [...document.querySelectorAll('select[data-theme="backdrop"] option')].some(
                o => o.textContent === "Glow (yours)"
            )
        )
    );
    await ev(() => __ulTest.goSettings("backdrops"));
    await p.waitForSelector(W);
    ok("…drawn", (await lit()) > 0);

    // ----- share it as a file -----
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click(btn("Save as file"))]);
    const file = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
    ok(
        '"Save as file" gives a .ulbackdrop file with the backdrop in it',
        dl.suggestedFilename() === "Glow.ulbackdrop" &&
            file.kind === "univerlist-backdrop" &&
            file.backdrop.name === "Glow" &&
            !JSON.stringify(file).includes(mine.id),
        dl.suggestedFilename()
    );

    // ----- open one someone made: only shapes, colours and a picture get in -----
    const bad = {
        kind: "univerlist-backdrop",
        v: 1,
        backdrop: {
            name: "Shared<script>",
            sky: ["#000000", "#112233"],
            picture: { src: "https://tracker.example/p.png" },
            onload: "x",
            layers: [{ shape: "star", count: 99999 }],
        },
    };
    await p.locator(`${W} input[type="file"][accept^=".ulbackdrop"]`).setInputFiles({
        name: "shared.ulbackdrop",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(bad)),
    });
    await p.waitForSelector(btn("Save"), { timeout: 5000 });
    await p.click(btn("Save"));
    const st3 = await ev(
        () =>
            __ulTest.meta.settings.backdrops as
                | Backdrop[]
                | undefined /* cast: as above, just added by opening a file */
    );
    const got: Partial<Backdrop> = st3![1] || {};
    ok(
        "opening a backdrop file adds it as a new one of yours",
        st3!.length === 2 && got.id !== mine.id && got.name === "Sharedscript"
    );
    ok(
        "…without a link for a picture, anything unknown, or more than 300 shapes",
        got.picture === null && !("onload" in got) && got.layers![0].count === 300,
        JSON.stringify(got).slice(0, 160)
    );
    await p
        .locator(`${W} input[type="file"][accept^=".ulbackdrop"]`)
        .setInputFiles({ name: "x.ulbackdrop", mimeType: "application/json", buffer: Buffer.from('{"kind":"nope"}') });
    await p.waitForSelector(`${W} .err`, { timeout: 5000 });
    ok("a file that isn't a backdrop says so", /isn't a backdrop file/.test((await p.textContent(`${W} .err`))!));

    // ----- Still: one frame, nothing running -----
    const st4 = await ev(async () => {
        __ulTest.meta.settings.ambience = "off";
        __ulTest.ambApply();
        await new Promise(r => setTimeout(r, 200));
        let n = 0;
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = f => {
            n++;
            return raf(f);
        };
        await new Promise(r => setTimeout(r, 400));
        window.requestAnimationFrame = raf;
        return { n, canvas: !!document.querySelector("#amb canvas.mybackdrop") };
    });
    ok("with motion Still it's drawn once and nothing keeps running", st4.canvas && st4.n === 0, JSON.stringify(st4));
    await ev(() => {
        __ulTest.meta.settings.ambience = "calm";
        __ulTest.ambApply();
    });

    // ----- switched off: the usual backdrop, nothing running, yours kept -----
    await ev(() => __ulTest.builtinSet("backdrops", false));
    await p.waitForTimeout(300);
    const st5 = await ev(() => ({
        backdrop: document.documentElement.dataset.backdrop,
        canvas: !!document.querySelector("#amb canvas.mybackdrop"),
        kept: __ulTest.meta.settings.backdrops!.length,
        sec: __ulTest.setSecs().some(([k]) => k === "backdrops"),
    }));
    ok(
        "switched off: the theme shows its usual backdrop, nothing of it runs, and your backdrops are kept",
        !st5.backdrop!.startsWith("mine:") && !st5.canvas && st5.kept === 2 && !st5.sec,
        JSON.stringify(st5)
    );
    await ev(() => __ulTest.builtinSet("backdrops", true));
    await p.waitForTimeout(300);
    ok(
        "switched back on: your backdrop is back behind the theme",
        await ev(
            id =>
                document.documentElement.dataset.backdrop === "mine:" + id &&
                !!document.querySelector("#amb canvas.mybackdrop"),
            mine.id
        )
    );

    // ----- backdrops that arrive with a backup or from another device get the same check as a file -----
    const st6 = await ev(async () => {
        const mine = __ulTest.meta.settings.backdrops!.slice();
        const odd = [...Array(20)].map((_, i) => ({
            id: i < 2 ? "same1234" : "w" + i + "abcd",
            name: "Odd " + i,
            picture: { src: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
            layers: [{ count: 1e6 }],
        }));
        await __ulTest.applyParts(
            { preferences: { settings: { ...__ulTest.meta.settings, backdrops: odd } } },
            { preferences: true },
            "merge"
        );
        const w = __ulTest.meta.settings.backdrops as
                | Backdrop[]
                | undefined /* cast: as checked when they arrived (applyParts) */,
            out = {
                n: w!.length,
                unique: new Set(w!.map(x => x.id)).size,
                pics: w!.filter(x => x.picture).length,
                most: Math.max(...w!.map(x => x.layers[0].count)),
            };
        await __ulTest.applyParts(
            { preferences: { settings: { ...__ulTest.meta.settings, backdrops: mine } } },
            { preferences: true },
            "merge"
        );
        return out;
    });
    ok(
        "backdrops from an import are checked like a file: at most 12, one per id, no SVG, no million shapes",
        st6.n === 12 && st6.unique === 12 && st6.pics === 0 && st6.most === 300,
        JSON.stringify(st6)
    );

    // ----- delete, with Undo -----
    await ev(() => __ulTest.goSettings("backdrops"));
    await p.waitForSelector(W);
    await p.click(`${W} .bar:has-text("Sharedscript") button:has-text("Delete")`);
    ok("delete one", await ev(() => __ulTest.meta.settings.backdrops!.length === 1));
    await ev(() => __ulTest.undo());
    ok("…and Undo brings it back", await ev(() => __ulTest.meta.settings.backdrops!.length === 2));
    if (process.env.SHOTS) await p.screenshot({ path: path.join(ENV.OUT, "backdrops.png") });

    // ----- a library from before 1.0, when backdrops were "worlds" -----
    const st7 = await ev(() => {
        __ulTest.meta.settings.worlds = [{ id: "old12345", name: "Old one", layers: [] }];
        __ulTest.meta.settings.builtins = { worlds: true };
        __ulTest.meta.themes!.oldtheme = { name: "Old theme", world: "mine:old12345" };
        __ulTest.ACS().subjects.push({ id: "oldsub", name: "Old course", world: "arts", fields: {} });
        __ulTest.migrateV10();
        return {
            mine: (__ulTest.meta.settings.backdrops as Backdrop[]).some(
                w => w.id === "old12345"
            ) /* cast: as the migration made them */,
            gone: !("worlds" in __ulTest.meta.settings),
            on: __ulTest.builtinOn("backdrops"),
            theme: __ulTest.meta.themes!.oldtheme.backdrop,
            themeOld: "world" in __ulTest.meta.themes!.oldtheme,
            kind: __ulTest.lcSub("oldsub")!.kind,
        };
    });
    ok(
        "an older library's worlds become backdrops, and its courses keep their kind",
        st7.mine && st7.gone && st7.on && st7.theme === "mine:old12345" && !st7.themeOld && st7.kind === "arts",
        JSON.stringify(st7)
    );

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
