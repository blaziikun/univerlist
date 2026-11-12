import ENV from "./env.ts";
ENV.needExport();
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { spawn } from "node:child_process";
import { ok, evaluator } from "./helpers.ts";
const ZIP = ENV.EXPORT;
(async () => {
    const comp = spawn(
        "node",
        [ENV.ROOT + "/extensions/local-media-player/companion/server.mjs", ENV.FIX + "/videos"],
        { env: { ...process.env, PORT: "7878" } }
    );
    await new Promise(r => setTimeout(r, 1200));
    const browser = await chromium.launch(ENV.launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(ctx);
    const page = await ctx.newPage(),
        errs: string[] = [];
    page.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(page);
    await page.goto(ENV.APP);
    await page.waitForTimeout(1000);
    await page.fill("#wl-name", "S");
    await page.click('[data-act="welcome-done"]');
    await page.setInputFiles("#file-import", ZIP);
    await page.waitForSelector('[data-act="import-replace"]');
    await page.click('[data-act="import-replace"]');
    await page.waitForTimeout(3000);
    await ev(() => __ulTest.goSettings("ext"));
    await page.waitForTimeout(300);
    const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click('[data-act="ext-pick"]')]);
    await fc.setFiles(ENV.EXT("local-media-player"));
    await page.waitForTimeout(1500);
    ok(
        "installed",
        await ev(
            () =>
                __ulTest.EXT.list.length === 1 &&
                __ulTest.EXT.frames.size === 1 &&
                [...__ulTest.EXT.frames.values()][0].jobs.has("watch.sources")
        )
    );
    await ev(() => {
        __ulTest.EXT.pinged = false;
        __ulTest.renderMain();
    });
    await page.waitForTimeout(1500);
    ok(
        "companion seen",
        await ev(() => __ulTest.EXT.health["local-media-player"] === "on"),
        await ev(() => __ulTest.EXT.health["local-media-player"])
    );
    await page.screenshot({ path: ENV.OUT + "/s_ext_1440.png" });
    await ev(() => {
        const id = [...__ulTest.items.entries()].find(([, b]) => /^Bungo Stray Dogs$/i.test(b.title))![0];
        __ulTest.quietPatch(id, { status: "want", prog: 0 });
        __ulTest.watchFromItem(id);
    });
    await page
        .waitForFunction(() => __ulTest.W.player && __ulTest.W.player.srcs.some(s => s.ext), null, { timeout: 15000 })
        .catch(() => {});
    const r = await ev(() => ({
        srcs: __ulTest.W.player && __ulTest.W.player.srcs.map(s => s.name),
        e: __ulTest.W.player && __ulTest.W.player.e,
        si: __ulTest.W.player && __ulTest.W.player.si,
    }));
    ok("extension source offered", r.srcs && r.srcs.some(n => /On this computer/.test(n!)), JSON.stringify(r));
    await page.waitForTimeout(2500);
    ok(
        "it plays",
        await ev(() => {
            const v = document.querySelector<HTMLVideoElement>("#cinema video");
            return !!v && v.readyState >= 2 && !v.error;
        }),
        await ev(() => {
            const v = document.querySelector<HTMLVideoElement>("#cinema video");
            return v ? v.readyState + " " + (v.error && v.error.code) + " " + v.src.slice(0, 40) : "no video";
        })
    );
    await page.screenshot({ path: ENV.OUT + "/s_extplay_1440.png" });
    // backups carry it (not when private)
    const n1 = await ev(async () => (await __ulTest.extExportFiles()).length);
    await ev(async () => {
        const x = __ulTest.EXT.list[0];
        x.private = true;
    });
    const n2 = await ev(async () => (await __ulTest.extExportFiles()).length);
    ok("in backups unless private", n1 > 2 && n2 === 0, n1 + " → " + n2);
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    comp.kill();
    await browser.close();
})();
