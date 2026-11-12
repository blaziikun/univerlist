// What's playing carries on while you use the player around it: opening its settings or its list of servers, ticking
// the episode watched, moving a button, rearranging the page beside it, and episodes arriving in cinema mode used to
// draw a new <video> each time (the episode reloaded, from where it was last saved, or from the start with Resume off).
// Changing whose controls the player uses still brings a new one, from where you are. And opening it in cinema mode
// draws one video, not two.
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
                    controls: "custom",
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
    await p.click('#cinema [data-act="cin-srcs"]');
    await p.click('#cinema [data-act="cin-mark"]');
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
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="wp-opts"]')!.click());
    ok(
        "⋯ says its panel is open while it is",
        await ev(
            () =>
                !!document.querySelector("#cinema .wpopts") &&
                document.querySelector('#cinema .cin-head [data-act="wp-opts"]')!.getAttribute("aria-pressed") ===
                    "true"
        )
    );
    await ev(() =>
        document.querySelector<HTMLElement>('#cinema [data-act="wp-tool"][data-k="next"][data-d="-1"]')!.click()
    );
    const r5 = await same();
    ok(
        "moving a button keeps it playing",
        r5.same &&
            r5.t === 2 &&
            (await ev(() => __ulTest.WP().tools.indexOf("next") < __ulTest.WP().tools.indexOf("mark"))),
        JSON.stringify(r5)
    );
    await ev(() =>
        document.querySelector<HTMLElement>('#cinema [data-act="wp-spot"][data-k="time"][data-v="under"]')!.click()
    );
    const r6 = await same();
    ok(
        "…and putting one under the video",
        r6.same && (await ev(() => !!document.querySelector("#cinema .cin-under .pc-time"))),
        JSON.stringify(r6)
    );
    ok(
        "…which reads where it is at once",
        await ev(() => /^0:02 \//.test(document.querySelector("#cinema .cin-under .pc-time")!.textContent)),
        await ev(() => document.querySelector("#cinema .cin-under .pc-time")!.textContent)
    );
    await ev(() =>
        document.querySelector<HTMLElement>('#cinema [data-act="wp-place"][data-k="eps"][data-v="main"]')!.click()
    );
    await ev(() =>
        document.querySelector<HTMLElement>('#cinema [data-act="wp-place"][data-k="about"][data-v="main"]')!.click()
    );
    await ev(() =>
        document.querySelector<HTMLElement>('#cinema [data-act="wp-place"][data-k="seasons"][data-v="main"]')!.click()
    );
    const r7 = await same();
    ok(
        "moving every block under the player (the side goes) keeps it playing",
        r7.same &&
            r7.t === 2 &&
            (await ev(
                () =>
                    !document.querySelector("#cinema .cin-side") &&
                    document.querySelector("#cinema")!.classList.contains("noside")
            )),
        JSON.stringify(r7)
    );
    await ev(() => document.querySelector<HTMLElement>('#cinema [data-act="wp-reset"]')!.click());
    const r8 = await same();
    ok(
        "putting everything back keeps it playing",
        r8.same && (await ev(() => !!document.querySelector("#cinema .cin-side"))),
        JSON.stringify(r8)
    );
    await ev(() => {
        __ulTest.ui.wpOpts = true;
        __ulTest.cinSideRedraw();
    });
    await ev(() => document.querySelector<HTMLElement>('#cinema .wpopts [data-act="wp-edit"]')!.click());
    const r9 = await same();
    ok(
        "arranging the player on the page keeps it playing",
        r9.same && (await ev(() => !!document.querySelector("#cinema .we-bar"))),
        JSON.stringify(r9)
    );
    await ev(() => document.querySelector<HTMLElement>('#cinema .we-bar [data-act="wp-edit"]')!.click());

    // whose controls: a new video with them, from where you are, as soon as the player draws again
    await p.click('#cinema [data-act="cin-opts"]');
    await p.selectOption('#cinema [data-po="controls"]', "browser");
    await p.click('#cinema [data-act="cin-opts"]');
    await ready();
    const r10 = await ev(() => {
        const v = document.querySelector<HTMLVideoElement>("#cinema video");
        return {
            fresh: !window.__kept.has(v!),
            controls: v!.controls,
            custom: !!document.querySelector("#cinema .pc"),
        };
    });
    ok(
        "changing whose controls brings a new video with the browser's",
        r10.fresh && r10.controls && !r10.custom,
        JSON.stringify(r10)
    );
    await p
        .waitForFunction(() => document.querySelector<HTMLVideoElement>("#cinema video")!.currentTime >= 1.9, null, {
            timeout: 5000,
        })
        .catch(() => {});
    ok(
        "…from where it was",
        await ev(() => document.querySelector<HTMLVideoElement>("#cinema video")!.currentTime >= 1.9),
        await ev(() => document.querySelector<HTMLVideoElement>("#cinema video")!.currentTime)
    );

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
        "the lights go down around it, and it plays on",
        r12.same &&
            (await ev(
                () =>
                    document.querySelector("#cinema")!.classList.contains("lights") &&
                    document.querySelector('#cinema [data-act="cin-lights"]')!.textContent === "☀"
            )),
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
