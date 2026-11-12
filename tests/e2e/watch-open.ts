// Opening a show on Watch: the episode list appears straight away (no clicking around to see it), the player never sits on
// "Loading…" when nothing can play, a slow or empty extension doesn't hold it up, and an extension's source does play.
import fs from "node:fs";
import http from "node:http";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator, listen } from "./helpers.ts";
import type { Item, WatchShow } from "../../src/features/core/model";
(async () => {
    const file = fs.readFileSync(ENV.FIX + "/videos/Bungo Stray Dogs/Bungo Stray Dogs S01E01.webm");
    const srv = http.createServer((req, res) => {
        const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ""),
            s = m && m[1] ? +m[1] : 0,
            e = m && m[2] ? Math.min(+m[2], file.length - 1) : file.length - 1;
        res.writeHead(m ? 206 : 200, {
            "content-type": "video/webm",
            "accept-ranges": "bytes",
            "access-control-allow-origin": "*",
            "content-length": e - s + 1,
            ...(m ? { "content-range": `bytes ${s}-${e}/${file.length}` } : {}),
        });
        res.end(file.subarray(s, e + 1));
    });
    const port = await listen(srv);
    const U = (p: string) => `http://127.0.0.1:${port}/${p}`;
    const b = await chromium.launch({
            ...ENV.launch,
            args: [...((ENV.launch || {}).args || []), "--autoplay-policy=no-user-gesture-required"],
        }),
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
    const state = () =>
        ev(() => ({
            rows:
                document.querySelectorAll('#cinema .cin-side [data-act="cin-ep"]').length ||
                document.querySelectorAll('[data-act="watch-src"]').length,
            eps: (__ulTest.W.seasons[__ulTest.W.si] || {}).eps ? __ulTest.W.seasons[__ulTest.W.si].eps!.length : 0,
            loading: !!(__ulTest.W.player && __ulTest.W.player.loading),
            empty: (document.querySelector("#cinema .cin-empty") || {}).textContent || "",
            src: document.querySelector<HTMLVideoElement>("#cinema video")?.src || "",
        }));
    type State = Awaited<ReturnType<typeof state>>;
    const open = async (sh: WatchShow) => {
        await ev(s => {
            __ulTest.ui.page = "watch";
            __ulTest.render();
            __ulTest.watchOpen(s);
        }, sh);
    };
    const settle = async (pred: (s: State) => boolean, ms = 6000) => {
        const end = Date.now() + ms;
        let s: State;
        do {
            s = await state();
            if (pred(s)) return s;
            await p.waitForTimeout(150);
        } while (Date.now() < end);
        return s;
    };

    // 1. an anime with nothing to play: episodes listed, player says so
    await open({ medium: "anime", title: "Death Note", ext: { anilist: 3 }, total: 12 });
    let s = await settle(x => x.rows >= 12 && !x.loading);
    ok("anime: the episode list shows by itself", s.rows >= 12, JSON.stringify(s));
    ok(
        "anime: the player is not stuck on Loading",
        !s.loading && /Nothing to play yet/.test(s.empty),
        JSON.stringify(s)
    );

    // 2. a TV show the same way
    await open({ medium: "tv", title: "Breaking Bad", year: 2008, ext: {} });
    s = await settle(x => x.rows >= 10 && !x.loading);
    ok("TV: the episode list shows by itself", s.rows >= 10, JSON.stringify(s));
    ok("TV: the player is not stuck on Loading", !s.loading && /Nothing to play yet/.test(s.empty), JSON.stringify(s));

    // 3. the same show already in the library as the other medium (the anime/TV sharing path) doesn't break the list
    await ev(() => {
        __ulTest.items.set("sib1", {
            id: "sib1",
            title: "Death Note",
            medium: "tv",
            year: 2006,
            sources: {},
        } as unknown as Item); /* cast: a bare entry, as an old library might hold one */
    });
    await open({ medium: "anime", title: "Death Note", year: 2006, ext: { anilist: 3 }, total: 12 });
    s = await settle(x => x.rows >= 12 && !x.loading);
    ok("with the same show filed as TV, the list still shows", s.rows >= 12 && !s.loading, JSON.stringify(s));
    await ev(() => __ulTest.items.delete("sib1"));

    // 4. an extension that takes a while and finds nothing: says nothing to play at once, then stops looking
    const slow = JSON.stringify({
        id: "slow-empty",
        name: "Slow empty",
        permissions: ["watch.sources"],
        code: `univerlist.provide('watch.sources', () => new Promise(r => setTimeout(() => r([]), 2500)));`,
    });
    await ev(t => __ulTest.extInstall(new File([t], "slow.json", { type: "application/json" })), slow);
    await p.waitForFunction(() => [...__ulTest.EXT.frames.values()].some(F => F.jobs.has("watch.sources")), null, {
        timeout: 8000,
    });
    await open({ medium: "anime", title: "Code Geass", ext: { anilist: 5 }, total: 12 });
    s = await settle(x => !x.loading && /Nothing to play yet/.test(x.empty), 3000);
    ok(
        'a slow extension: "nothing to play" shows straight away, not Loading',
        !s.loading && /Nothing to play yet/.test(s.empty),
        JSON.stringify(s)
    );
    s = await settle(x => !/Still checking/.test(x.empty), 6000);
    ok(
        "…and it stops checking once the extension has answered",
        !/Still checking/.test(s.empty) && /Nothing to play yet/.test(s.empty),
        JSON.stringify(s)
    );
    await ev(() => {
        const x = __ulTest.extGet("slow-empty");
        __ulTest.extStop(x!);
        __ulTest.EXT.list = __ulTest.EXT.list.filter(y => y !== x);
    });

    // 5. an extension that has the episode: it plays
    const has = JSON.stringify({
        id: "has-it",
        name: "Has it",
        permissions: ["watch.sources"],
        code: `univerlist.provide('watch.sources', ctx => ctx.title ? [{ name: 'Mine', url: '${U("a.webm")}' }] : []);`,
    });
    await ev(t => __ulTest.extInstall(new File([t], "has.json", { type: "application/json" })), has);
    await p.waitForFunction(
        () => [...__ulTest.EXT.frames.values()].filter(F => F.jobs.has("watch.sources")).length >= 1,
        null,
        { timeout: 8000 }
    );
    await open({ medium: "anime", title: "One Piece", ext: { anilist: 4 }, total: 12 });
    s = await settle(x => /a\.webm/.test(x.src), 8000);
    ok("an extension's source plays", /a\.webm/.test(s.src), JSON.stringify(s));
    ok("…with the episode list showing too", s.rows >= 1, JSON.stringify(s));

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    srv.close();
    process.exit(0);
})();
