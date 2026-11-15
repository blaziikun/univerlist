// What's playing carries on while you use the player around it: opening its settings or its list of servers, ticking
// the episode watched, rearranging the page around it, cinema mode, and episodes arriving used to draw a new <video>
// each time (the episode reloaded, from where it was last saved, or from the start with Resume off). Opening it in
// cinema mode draws one video, not two. The next episode stops the one before and lets it go (it used to go on playing
// underneath). Panels close on a click elsewhere; the lights darken everything but the player.
import fs from "node:fs";
import http from "node:http";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator, listen } from "./helpers.ts";
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
    const b = await chromium.launch({ ...ENV.launch, args: ["--autoplay-policy=no-user-gesture-required"] }),
        c = await b.newContext({ viewport: { width: 1400, height: 860 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    // a show with two seasons, its first episode playing from one server; every <video> drawn is counted
    const play = (o: { layout?: string } = {}) =>
        ev(
            ([a, o]) => {
                window.__videos = 0;
                if (!window.__watcher)
                    window.__watcher = new MutationObserver(ms => {
                        for (const m of ms)
                            for (const n of m.addedNodes)
                                if (n instanceof Element && (n.tagName === "VIDEO" || n.querySelector("video")))
                                    window.__videos++;
                    });
                window.__watcher.observe(document.body, { childList: true, subtree: true });
                __ulTest.meta.settings.player = {
                    ...__ulTest.PS(),
                    autoNext: false,
                    resume: false,
                    layout: o.layout || "docked",
                };
                __ulTest.meta.settings.watchPage = {};
                __ulTest.ui.page = "watch";
                __ulTest.render();
                __ulTest.W.show = { medium: "tv", title: "Keep Show", year: 2020, about: "About it.", ext: {} };
                __ulTest.W.seasons = [
                    { n: 1, label: "Season 1", eps: [1, 2, 3].map(e => ({ e, title: "Ep " + e })) },
                    { n: 2, label: "Season 2", eps: [1, 2].map(e => ({ e, title: "Ep " + e })) },
                ];
                __ulTest.W.si = 0;
                __ulTest.W.view = "show";
                __ulTest.W.lib = new Map([
                    [
                        "0:1",
                        [
                            { name: "Home", how: "original", url: a },
                            { name: "Other", how: "original", url: a + "?b=1" },
                        ],
                    ],
                    ["0:2", [{ name: "Home", how: "original", url: a + "?e=2" }]],
                ]);
                __ulTest.watchStart(0, 1, { empty: true });
            },
            [U("a.webm"), o]
        );
    const ready = () =>
        p.waitForFunction(
            () => {
                const v = document.querySelector<HTMLVideoElement>("#cinema video");
                return v && v.readyState >= 2;
            },
            null,
            { timeout: 15000 }
        );
    // the video now is the one that was playing, still where it was
    const mark = () =>
        ev(async () => {
            const v = document.querySelector<HTMLVideoElement>("#cinema video");
            v!.pause();
            v!.currentTime = 2;
            await new Promise(r => setTimeout(r, 200));
            window.__kept = new WeakSet([v!]);
            return v!.currentTime;
        });
    const same = () =>
        ev(() => {
            const v = document.querySelector<HTMLVideoElement>("#cinema video");
            return {
                same: !!(v && window.__kept.has(v)),
                t: v ? Math.round(v.currentTime * 10) / 10 : -1,
                videos: document.querySelectorAll("#cinema video").length,
            };
        });

    await play();
    await ready();
    await mark();
    const wake = () => p.mouse.move(500 + Math.random() * 40, 300);
    await wake();
    await p.click('#cinema [data-act="cin-opts"]');
    const r = await same();
    ok(
        "opening the player settings keeps the episode playing where it is",
        r.same && r.t === 2 && (await ev(() => !!document.querySelector("#cinema .cin-opts"))),
        JSON.stringify(r)
    );
    await p.click('#cinema [data-act="cin-opts"]');
    const r2 = await same();
    ok("…and so does closing them", r2.same && r2.t === 2, JSON.stringify(r2));
    await p.click('#cinema [data-act="cin-srcs"]');
    const r3 = await same();
    ok(
        "opening the list of servers keeps it playing",
        r3.same && r3.t === 2 && (await ev(() => document.querySelectorAll("#cinema .srcrow").length === 2)),
        JSON.stringify(r3)
    );
    // a click anywhere else closes a panel, as a menu closes
    await p.mouse.click(700, 840);
    ok("a click outside closes the server list", await ev(() => !document.querySelector("#cinema .cin-srcs")));
    await wake();
    await p.click('#cinema [data-act="cin-opts"]');
    await p.click('#cinema .cin-opts [data-act="cin-mark"]');
    const r4 = await same();
    ok(
        "ticking it watched keeps it playing, and the tick shows",
        r4.same &&
            r4.t === 2 &&
            (await ev(
                () => document.querySelector('#cinema [data-act="cin-mark"]')!.getAttribute("aria-pressed") === "true"
            )),
        JSON.stringify(r4)
    );
    await p.mouse.click(30, 840);
    ok("…and a click outside closes the player settings", await ev(() => !document.querySelector("#cinema .cin-opts")));
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="wp-opts"]')!.click());
    ok(
        "the page's ⚙ says its panel is open while it is",
        await ev(
            () =>
                !!document.querySelector("#cinema .wpopts") &&
                document.querySelector('#cinema .cin-head [data-act="wp-opts"]')!.getAttribute("aria-expanded") ===
                    "true"
        )
    );
    ok(
        "…and it holds only the episodes' look and the layout (no list of buttons to place)",
        await ev(
            () =>
                !document.querySelector(
                    '#cinema [data-act="wp-tool"], #cinema [data-act="wp-spot"], #cinema [data-act="wp-edit"]'
                ) && document.querySelectorAll('#cinema .wpopts [data-act="wp-place"]').length === 8
        )
    );
    await ev(() =>
        document.querySelector<HTMLElement>('#cinema [data-act="wp-place"][data-k="eps"][data-v="side"]')!.click()
    );
    const r6 = await same();
    ok(
        "moving the seasons and episodes beside the player keeps it playing",
        r6.same && r6.t === 2 && (await ev(() => !!document.querySelector("#cinema .cin-side .cb-eps"))),
        JSON.stringify(r6)
    );
    await ev(() =>
        document.querySelector<HTMLElement>('#cinema [data-act="wp-place"][data-k="about"][data-v="left"]')!.click()
    );
    const r7 = await same();
    ok(
        "…and the description on its left",
        r7.same && r7.t === 2 && (await ev(() => !!document.querySelector("#cinema .cin-side.left .cb-about"))),
        JSON.stringify(r7)
    );
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="wp-reset"]')!.click());
    const r8 = await same();
    ok(
        "putting everything back (both under the player) keeps it playing",
        r8.same &&
            (await ev(
                () =>
                    !document.querySelector("#cinema .cin-side") &&
                    !!document.querySelector("#cinema .cin-mb .cb-eps") &&
                    !!document.querySelector("#cinema .cin-mb .cb-about")
            )),
        JSON.stringify(r8)
    );
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-lay"]')!.click());
    const r9 = await same();
    ok(
        "cinema mode keeps it playing: the same video, never loaded again",
        r9.same && r9.t === 2 && (await ev(() => document.querySelector("#cinema")!.classList.contains("cinema"))),
        JSON.stringify(r9)
    );
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-lay"]')!.click());
    const r10 = await same();
    ok("…and so does leaving it", r10.same && r10.t === 2, JSON.stringify(r10));

    // the next episode: the one before stops and lets go of its stream, so two can never play at once
    const old = await ev(() => {
        const v = document.querySelector<HTMLVideoElement>("#cinema video")!;
        v.play();
        window.__kept = new WeakSet([v]);
        window.__old = v;
        return !v.paused;
    });
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-next"]')!.click());
    await ready();
    const gone = await ev(() => {
        const o = window.__old;
        o.dispatchEvent(new Event("canplay")); // the old one finishing loading late must not start it
        return {
            paused: o.paused,
            src: o.getAttribute("src"),
            empty: o.networkState === HTMLMediaElement.NETWORK_EMPTY,
            gone: !o.isConnected,
            videos: document.querySelectorAll("video").length,
            ep: __ulTest.W.player!.e,
        };
    });
    await p.waitForTimeout(300);
    ok(
        "the next episode: the one before is stopped, let go of and gone, with one video left",
        old && gone.paused && !gone.src && gone.empty && gone.gone && gone.videos === 1 && gone.ep === 2,
        JSON.stringify(gone)
    );
    ok("…and still silent a moment later", await ev(() => window.__old.paused));

    // cinema mode: one video when it opens, and the episodes arriving later don't reload it
    await ev(() => {
        __ulTest.W.player = null;
        __ulTest.renderPlayer();
    });
    await play({ layout: "cinema" });
    await ready();
    await p.waitForTimeout(600);
    ok(
        "cinema mode opens with one video, not two",
        (await ev(() => window.__videos)) === 1,
        await ev(() => window.__videos)
    );
    await mark();
    await ev(() => {
        __ulTest.W.seasons[1].eps!.push({ e: 3, title: "Ep 3" });
        __ulTest.cinSideRedraw();
    });
    const r11 = await same();
    ok("…and episodes arriving while it plays don't reload it", r11.same && r11.t === 2, JSON.stringify(r11));
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="cin-lights"]')!.click());
    const r12 = await same();
    ok(
        "the lights go down around it (everything but the player dark), and it plays on",
        r12.same &&
            (await ev(() => {
                const dark = document.querySelector("#cinema .cin-dark"),
                    main = document.querySelector("#cinema .cin-main")!.getBoundingClientRect(),
                    // what's on top in the middle of the player, and beside it
                    inside = document.elementFromPoint(main.left + main.width / 2, main.top + 20),
                    outside = document.elementFromPoint(innerWidth / 2, 20); // the top bar
                return (
                    document.querySelector("#cinema")!.classList.contains("lights") &&
                    !!dark &&
                    getComputedStyle(dark).position === "fixed" &&
                    !!inside?.closest(".cin-main") &&
                    outside === dark &&
                    document.querySelector('#cinema [data-act="cin-lights"]')!.getAttribute("aria-pressed") === "true"
                );
            })),
        JSON.stringify(r12)
    );
    await p.keyboard.press("l");
    ok("…and L brings them up", await ev(() => !document.querySelector("#cinema")!.classList.contains("lights")));
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    srv.close();
    process.exit(0);
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
