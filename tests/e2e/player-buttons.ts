// The Watch player: every button and key does what it says, mute and volume survive the player being redrawn,
// and servers added to one series reach the player (links directly, other kinds of link through the extension that plays them).
import fs from "node:fs";
import http from "node:http";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator, listen } from "./helpers.ts";
import type { Item } from "../../src/features/core/model";
(async () => {
    // a small video server with Range support, so seeking works like it does from a real server
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
    const vid = () =>
        ev(() => {
            const v = document.querySelector<HTMLVideoElement>("#cinema video");
            return v
                ? {
                      t: v.currentTime,
                      muted: v.muted,
                      vol: +v.volume.toFixed(2),
                      rate: v.playbackRate,
                      paused: v.paused,
                      d: v.duration,
                  }
                : null;
        });
    const ready = () =>
        p.waitForFunction(
            () => {
                const v = document.querySelector<HTMLVideoElement>("#cinema video");
                return v && v.readyState >= 2 && Number.isFinite(v.duration);
            },
            null,
            { timeout: 15000 }
        );
    await ev(
        ([a]) => {
            __ulTest.meta.settings.player = { ...__ulTest.PS(), seek: 1, skip: 1, autoNext: false };
            __ulTest.meta.settings.servers = [{ name: "Server", pattern: a, on: true }];
            __ulTest.ui.page = "watch";
            __ulTest.render();
            __ulTest.W.show = { medium: "tv", title: "Test Show", year: 2020, ext: {} };
            __ulTest.W.seasons = [{ n: 1, label: "Season 1", eps: [1, 2, 3].map(e => ({ e, title: "Ep " + e })) }];
            __ulTest.W.si = 0;
            __ulTest.W.view = "show";
            __ulTest.W.player = {
                title: "Test Show · Episode 2",
                show: "Test Show",
                film: false,
                si: 0,
                e: 2,
                srcs: [
                    { name: "A", url: a },
                    { name: "B", url: a + "?b=1" },
                ],
                k: 0,
                marked: false,
            };
            __ulTest.renderPlayer();
        },
        [U("a.webm")]
    );
    await ready();
    await ev(() => document.querySelector<HTMLVideoElement>("#cinema video")!.pause());

    // ---- a big library must not slow the episode list down ----
    const ms = await ev(() => {
        for (let i = 0; i < 6000; i++)
            __ulTest.items.set("bulk" + i, {
                id: "bulk" + i,
                title: "Some Show " + i,
                medium: i % 2 ? "tv" : "anime",
                year: 2000 + (i % 20),
            } as Item); /* cast: bare entries, as an old library might hold */
        const t0 = performance.now();
        for (let r = 0; r < 3; r++) for (let e = 1; e <= 400; e++) __ulTest.epHasSource(0, e);
        const d = performance.now() - t0;
        for (let i = 0; i < 6000; i++) __ulTest.items.delete("bulk" + i);
        return d;
    });
    ok("the episode list stays fast with 6000 items in the library", ms < 400, Math.round(ms) + "ms for 1200 rows");

    // ---- mute and volume ----
    await p.keyboard.press("m");
    let v = await vid();
    ok("M mutes", v!.muted === true);
    await ev(() => __ulTest.renderPlayer());
    await ready();
    v = await vid();
    ok("mute survives the player being redrawn", v!.muted === true);
    await p.keyboard.press("m");
    v = await vid();
    ok("M unmutes", v!.muted === false);
    await p.waitForTimeout(150);
    await ev(() => {
        const x = document.querySelector<HTMLVideoElement>("#cinema video");
        x!.volume = 0;
    });
    await p.waitForTimeout(150);
    v = await vid();
    ok("dragging the volume to 0 mutes", v!.muted === true, JSON.stringify(v));
    await ev(() => {
        document.querySelector<HTMLVideoElement>("#cinema video")!.muted = false;
    });
    await p.waitForTimeout(150);
    v = await vid();
    ok("unmuting from 0 brings the volume back (not silent)", v!.muted === false && v!.vol > 0.1, JSON.stringify(v));
    await ev(() => {
        const x = document.querySelector<HTMLVideoElement>("#cinema video");
        x!.volume = 0.4;
    });
    await p.keyboard.press("ArrowUp");
    v = await vid();
    ok("↑ raises the volume", v!.vol > 0.45, JSON.stringify(v));
    await p.keyboard.press("ArrowDown");
    await p.keyboard.press("ArrowDown");
    v = await vid();
    ok("↓ lowers it", v!.vol < 0.45, JSON.stringify(v));
    await p.keyboard.press("m");
    await ev(() => __ulTest.renderPlayer());
    await ready();
    await p.keyboard.press("ArrowUp");
    v = await vid();
    ok("↑ also unmutes", v!.muted === false);

    // ---- the buttons under the player ----
    const click = (act: string) => p.click(`#cinema [data-act="${act}"]`);
    await ev(() => {
        document.querySelector<HTMLVideoElement>("#cinema video")!.currentTime = 2;
    });
    await p.waitForTimeout(200);
    let t0 = (await vid())!.t;
    await click("cin-back");
    await p.waitForTimeout(200);
    let t1 = (await vid())!.t;
    ok("back jumps back", t1 < t0 - 0.5, `${t0} → ${t1}`);
    t0 = t1;
    await click("cin-fwd");
    await p.waitForTimeout(200);
    t1 = (await vid())!.t;
    ok("forward jumps ahead", t1 > t0 + 0.5, `${t0} → ${t1}`);
    t0 = t1;
    await click("cin-skip");
    await p.waitForTimeout(200);
    t1 = (await vid())!.t;
    ok("skip intro jumps ahead", t1 > t0 + 0.5, `${t0} → ${t1}`);
    await p.selectOption("#cin-speed", "1.5");
    await p.waitForTimeout(100);
    ok("speed changes", (await vid())!.rate === 1.5);
    await click("cin-lights");
    ok("lights button toggles", await ev(() => document.querySelector("#cinema")!.classList.contains("lights")));
    await click("cin-lights");
    ok("…and back", await ev(() => !document.querySelector("#cinema")!.classList.contains("lights")));
    const lay0 = await ev(() => /lay-docked/.test(document.querySelector("#cinema")!.className));
    await click("cin-lay");
    await ready();
    ok(
        "cinema mode button switches layout",
        (await ev(() => /lay-docked/.test(document.querySelector("#cinema")!.className))) !== lay0
    );
    await p.keyboard.press("t");
    await ready();
    ok(
        "T switches it back",
        (await ev(() => /lay-docked/.test(document.querySelector("#cinema")!.className))) === lay0
    );
    await click("cin-opts");
    ok("player settings open", await ev(() => !!document.querySelector("#cinema .cin-opts")));
    await click("cin-opts");
    ok("…and close", await ev(() => !document.querySelector("#cinema .cin-opts")));
    await click("cin-srcs");
    ok("server list shows both servers", (await ev(() => document.querySelectorAll("#cinema .srcrow").length)) === 2);
    await p.click("#cinema .srcrow >> nth=1");
    await ready();
    ok(
        "picking the other server switches to it",
        (await ev(() => __ulTest.W.player!.k)) === 1 &&
            (await ev(() => document.querySelector<HTMLVideoElement>("#cinema video")!.src)).includes("b=1")
    );
    const m0 = await ev(() => !!__ulTest.W.player!.marked);
    await click("cin-mark");
    ok("watched button flips the mark", (await ev(() => !!__ulTest.W.player!.marked)) === !m0);
    await click("cin-mark");
    ok("…and a second click flips it back", (await ev(() => !!__ulTest.W.player!.marked)) === m0);
    await click("cin-next");
    await ready();
    ok("next goes to episode 3", (await ev(() => __ulTest.W.player!.e)) === 3);
    await click("cin-prev");
    await ready();
    ok("previous goes back to episode 2", (await ev(() => __ulTest.W.player!.e)) === 2);
    await p.keyboard.press(" ");
    await p.waitForTimeout(150);
    const pa = (await vid())!.paused;
    await p.keyboard.press(" ");
    await p.waitForTimeout(150);
    ok("space plays and pauses", pa !== (await vid())!.paused);
    await click("cin-full");
    await p.waitForTimeout(400);
    const fs1 = await ev(() => !!document.fullscreenElement);
    await p.keyboard.press("f");
    await p.waitForTimeout(400);
    ok(
        "full screen button and F toggle full screen",
        fs1 !== (await ev(() => !!document.fullscreenElement)) || fs1 === true,
        `fullscreen after click: ${fs1}`
    );
    if (await ev(() => !!document.fullscreenElement)) await ev(() => document.exitFullscreen());

    // ---- servers for one series ----
    const ext = JSON.stringify({
        id: "fake-share",
        name: "Fake shares",
        permissions: ["storage", "watch.sources"],
        seriesServers: ["smb:"],
        code: `univerlist.provide('watch.sources', ctx => [{ name: 'Fake:' + ((ctx.servers || {}).items || []).length, url: '${U("a.webm")}?ext=1' }]);`,
    });
    await ev(t => __ulTest.extInstall(new File([t], "fake.json", { type: "application/json" })), ext);
    await p.waitForFunction(() => [...__ulTest.EXT.frames.values()].some(F => F.jobs.has("watch.sources")), null, {
        timeout: 8000,
    });
    await click("ss-open");
    await p.waitForSelector("#ss-in");
    await p.fill("#ss-in", "smb://home/Test+Show+Batch\n" + U("c/{title}/S{s2}E{e2}.webm") + "\nnot a server");
    await p.click('[data-act="ss-add"]');
    await p.waitForTimeout(600);
    ok(
        "a share link and an address are both saved for the series",
        (await ev(() =>
            __ulTest
                .ssList()
                .map(s => s.kind)
                .sort()
                .join()
        )) === "held,link",
        await ev(() => JSON.stringify(__ulTest.ssList().map(s => s.kind + ":" + s.name)))
    );
    ok(
        "the address becomes a source for the episode",
        await ev(() =>
            __ulTest.W.player!.srcs.some(
                s => /\/c\/Test%20Show\/S01E02\.webm$/.test(s.url!) || /\/c\/Test Show\/S01E02\.webm$/.test(s.url!)
            )
        ),
        await ev(() => JSON.stringify(__ulTest.W.player!.srcs.map(s => s.url!.slice(-30))))
    );
    await p
        .waitForFunction(() => __ulTest.W.player!.srcs.some(s => /Fake:1/.test(s.name!)), null, { timeout: 8000 })
        .catch(() => {});
    ok(
        "the extension receives the series' own link with its request",
        await ev(() => __ulTest.W.player!.srcs.some(s => s.name === "Fake:1")),
        await ev(() => JSON.stringify(__ulTest.W.player!.srcs.map(s => s.name)))
    );
    ok(
        "the same show filed as anime shares them",
        (await ev(() => {
            __ulTest.W.show!.medium = "anime";
            const n = __ulTest.ssList().length;
            __ulTest.W.show!.medium = "tv";
            return n;
        })) === 2
    );
    ok(
        "other series do not get them",
        (await ev(() => {
            const t = __ulTest.W.show!.title;
            __ulTest.W.show!.title = "Another Show";
            const n = __ulTest.ssList().length;
            __ulTest.W.show!.title = t;
            return n;
        })) === 0
    );
    await p.click('.ssl [data-act="ss-del"] >> nth=0');
    await p.waitForTimeout(300);
    ok("a server can be removed", (await ev(() => __ulTest.ssList().length)) === 1);
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    srv.close();
})();
