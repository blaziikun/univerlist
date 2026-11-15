// The player's own controls, laid out like a streaming site's: play, next, volume and time on the left; the settings,
// CC, cinema mode and full screen on the right (full screen far right). A click in the middle of the picture plays or
// pauses, a double click on either side jumps 15 s (each with its ¾-circle arrow and the number inside). Skip intro
// shows only while an opening plays (AniSkip, or the file's own chapter) and goes when it's over. Subtitles are drawn
// by the player itself, so their size, height and background apply. The settings are there with nothing playing, and
// close on a click outside. The Episodes header names the episode playing and says where it is (2/3). On a phone: big
// buttons in the middle, fewer controls, panels from the bottom.
import fs from "node:fs";
import http from "node:http";
import ENV from "./env.ts";
import { chromium, devices } from "playwright";
import type { Page } from "playwright";
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
    const b = await chromium.launch({ ...ENV.launch, args: ["--autoplay-policy=no-user-gesture-required"] });
    const errs: string[] = [];
    // a page with the app started, and a show of three episodes playing the second
    async function open(opts: object) {
        const c = await b.newContext(opts);
        await setup(c);
        // AniSkip knows where episode 2's opening is (MyAnimeList's 4242)
        await c.route(/api\.aniskip\.com/, r =>
            r.fulfill({
                contentType: "application/json",
                headers: { "access-control-allow-origin": "*" },
                body: JSON.stringify(
                    /\/4242\/2\b/.test(r.request().url())
                        ? { found: true, results: [{ skipType: "op", interval: { startTime: 0.5, endTime: 3 } }] }
                        : { found: false, results: [] }
                ),
            })
        );
        const p = await c.newPage();
        p.on("pageerror", e => errs.push(e.message));
        await p.goto(ENV.APP);
        await p.waitForTimeout(800);
        await p.fill("#wl-name", "T");
        await p.click('[data-act="welcome-done"]');
        return p;
    }
    const play = (p: Page, srcs: { name: string; q?: string; how?: string }[], medium = "tv") =>
        evaluator(p)(
            ([a, s, medium]) => {
                __ulTest.meta.settings.player = { ...__ulTest.PS(), autoNext: false, layout: "docked" };
                __ulTest.ui.page = "watch";
                __ulTest.render();
                __ulTest.W.show = { medium, title: "Pc Show", year: 2020, ext: {} };
                __ulTest.W.seasons = [
                    { n: 1, label: "Pc Show", ext: { mal: 4242 }, eps: [1, 2, 3].map(e => ({ e, title: "Ep " + e })) },
                ];
                __ulTest.W.si = 0;
                __ulTest.W.view = "show";
                __ulTest.W.player = {
                    title: "Pc Show · Episode 2",
                    show: "Pc Show",
                    film: false,
                    si: 0,
                    e: 2,
                    srcs: s.map(x => ({ ...x, url: a + (x.q || "") })),
                    k: 0,
                    marked: false,
                };
                __ulTest.renderPlayer();
            },
            [U("a.webm"), srcs, medium] as const
        );
    const ready = (p: Page) =>
        p.waitForFunction(
            () => {
                const v = document.querySelector<HTMLVideoElement>("#cinema video");
                return v && v.readyState >= 2 && Number.isFinite(v.duration);
            },
            null,
            { timeout: 15000 }
        );

    // ════ a computer ════
    const p = await open({ viewport: { width: 1400, height: 860 } });
    const ev = evaluator(p);
    const wake = () => p.mouse.move(400 + Math.random() * 50, 300);
    const video = () =>
        ev(() => {
            const v = document.querySelector<HTMLVideoElement>("#cinema video")!;
            return { t: v.currentTime, d: v.duration, paused: v.paused };
        });

    // ---- with nothing to play, the settings are still there ----
    await play(p, []);
    await p.waitForTimeout(300);
    ok(
        "nothing to play yet: the player's settings are still there",
        await ev(
            () =>
                !!document.querySelector("#cinema .cin-empty") &&
                !!document.querySelector('#cinema .pc [data-act="cin-opts"]')
        )
    );
    await p.click('#cinema [data-act="cin-opts"]');
    ok("…and open", await ev(() => !!document.querySelector("#cinema .cin-opts")));
    await p.mouse.click(700, 840);
    ok("a click outside closes them", await ev(() => !document.querySelector("#cinema .cin-opts")));

    await play(p, [{ name: "A", how: "original" }]);
    await ready(p);
    await ev(() => document.querySelector<HTMLVideoElement>("#cinema video")!.pause());

    // ---- the controls, where a streaming site puts them ----
    const row = await ev(() =>
        [...document.querySelectorAll<HTMLElement>("#cinema .pc-row > *")].map(
            x =>
                x.dataset.act ||
                (x.classList.contains("pc-vol") ? "vol" : x.classList.contains("pc-time") ? "time" : x.className)
        )
    );
    ok(
        "left: play, next, volume; right: time, settings, CC, cinema, full screen (far right)",
        row.join() === "pc-play,cin-next,vol,spacer,time,cin-opts,cin-cc,cin-lay,cin-full",
        row.join()
    );
    ok(
        "next is an icon (no word), CC says only CC, and no picture-in-picture button",
        await ev(
            () =>
                !!document.querySelector('#cinema [data-act="cin-next"] svg') &&
                document.querySelector('#cinema [data-act="cin-next"]')!.textContent!.trim() === "" &&
                document.querySelector('#cinema [data-act="cin-cc"]')!.textContent!.trim() === "CC" &&
                !document.querySelector('#cinema [data-act="cin-pip"]')
        )
    );
    ok(
        "the volume is a speaker icon, the lights a bulb, and the page's settings a gear",
        await ev(
            () =>
                !!document.querySelector('#cinema [data-act="pc-mute"] svg') &&
                !/[🔊🔇]/u.test(document.querySelector('#cinema [data-act="pc-mute"]')!.textContent!) &&
                !!document.querySelector('#cinema .cin-under [data-act="cin-lights"] svg') &&
                !/[☾☀]/.test(document.querySelector('#cinema [data-act="cin-lights"]')!.textContent!) &&
                !!document.querySelector('#cinema .cin-head [data-act="wp-opts"] svg')
        )
    );
    ok(
        "the picture fits by default (not filled)",
        await ev(
            () =>
                __ulTest.PS().fit === "contain" &&
                document.querySelector<HTMLVideoElement>("#cinema video")!.style.objectFit === "contain"
        )
    );
    ok(
        "the jumps are 15 s, each with its number inside",
        await ev(
            () =>
                __ulTest.PS().seek === 15 &&
                document.querySelector("#cinema .pc-jump.back .n")!.textContent === "15" &&
                document.querySelector("#cinema .pc-jump.fwd .n")!.textContent === "15"
        )
    );
    ok(
        "the Episodes header names the episode playing, and says it's 2 of 3",
        await ev(
            () =>
                /^Episodes: Ep 2$/.test(document.querySelector("#cinema .cs-h3")!.textContent!.trim()) &&
                document.querySelector("#cinema .cs-at")!.textContent === "2/3"
        ),
        await ev(() => document.querySelector("#cinema .cs-epsh")!.textContent)
    );
    ok(
        "under the player: the episode and the lights, nothing else",
        await ev(
            () =>
                [...document.querySelectorAll("#cinema .cin-under button")]
                    .map(x => x.getAttribute("data-act"))
                    .join() === "cin-lights"
        )
    );

    // ---- the picture: a click in the middle plays or pauses; a double click on a side jumps ----
    const box = (await p.locator("#cinema .cin-stage").boundingBox())!;
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
    await p.waitForTimeout(300);
    ok("a click in the middle plays", !(await video()).paused);
    await p.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
    await p.waitForTimeout(300);
    ok("…and pauses", (await video()).paused);
    await ev(() => {
        __ulTest.meta.settings.player = { ...__ulTest.PS(), seek: 1 };
        document.querySelector<HTMLVideoElement>("#cinema video")!.currentTime = 1;
    });
    await p.mouse.dblclick(box.x + box.width * 0.9, box.y + box.height / 3);
    await p.waitForTimeout(400);
    let t = await video();
    ok("a double click on the right jumps forward", t.t > 1.8 && t.paused, JSON.stringify(t));
    await p.mouse.dblclick(box.x + box.width * 0.1, box.y + box.height / 3);
    await p.waitForTimeout(400);
    t = await video();
    ok("…and on the left, back", t.t < 1.2 && t.paused, JSON.stringify(t));
    await ev(() => {
        __ulTest.meta.settings.player = { ...__ulTest.PS(), seek: 15 };
    });

    // ---- the controls as it plays ----
    await wake();
    await p.click("#cinema .pc-play");
    await p.waitForTimeout(400);
    ok("▶ plays", !(await video()).paused);
    await p.click("#cinema .pc-play");
    ok("…and pauses", (await video()).paused);
    const bar = (await p.locator("#cinema .pc-scrub").boundingBox())!;
    await p.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2);
    await p.waitForTimeout(300);
    t = await video();
    ok("clicking the bar seeks there", Math.abs(t.t - t.d / 2) < 0.4, JSON.stringify(t));
    ok(
        "the time reads where it is",
        await ev(() => /^0:0\d \/ 0:0\d$/.test(document.querySelector("#cinema .pc-time")!.textContent!)),
        await ev(() => document.querySelector("#cinema .pc-time")!.textContent)
    );
    await ev(() => {
        const r = document.querySelector<HTMLInputElement>("#cinema .pc-volr");
        r!.value = "0.3";
        r!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    ok(
        "the volume slider sets the volume",
        await ev(() => Math.abs(document.querySelector<HTMLVideoElement>("#cinema video")!.volume - 0.3) < 0.01)
    );
    await wake();
    await p.click('#cinema [data-act="pc-mute"]');
    await p.waitForTimeout(150);
    ok(
        "the speaker mutes, and shows it",
        await ev(
            () =>
                document.querySelector<HTMLVideoElement>("#cinema video")!.muted &&
                document.querySelector<HTMLElement>('#cinema [data-act="pc-mute"]')!.dataset.on === ""
        )
    );
    await p.click('#cinema [data-act="pc-mute"]');
    ok("…and unmutes", await ev(() => !document.querySelector<HTMLVideoElement>("#cinema video")!.muted));

    // ---- Skip intro: only while the opening plays ----
    await play(p, [{ name: "A", how: "original" }], "anime");
    await ready(p);
    await p.waitForFunction(() => !!__ulTest.W.player!.intro, null, { timeout: 5000 }).catch(() => {});
    ok(
        "AniSkip says where the opening is",
        await ev(() => JSON.stringify(__ulTest.W.player!.intro) === JSON.stringify({ start: 0.5, end: 3 })),
        await ev(() => JSON.stringify(__ulTest.W.player!.intro))
    );
    await ev(() => {
        const v = document.querySelector<HTMLVideoElement>("#cinema video")!;
        v.pause();
        v.currentTime = 3.5;
    });
    await p.waitForTimeout(300);
    ok("no Skip intro after the opening", await ev(() => !document.querySelector("#cinema .pc-skipintro")));
    await ev(() => {
        document.querySelector<HTMLVideoElement>("#cinema video")!.currentTime = 1;
    });
    await p.waitForSelector("#cinema .pc-skipintro", { timeout: 3000 }).catch(() => {});
    const sk = await ev(() => {
        const s = document.querySelector("#cinema .pc-skipintro"),
            m = document.querySelector("#cinema .cin-main")!.getBoundingClientRect(),
            r = s ? s.getBoundingClientRect() : null;
        return r ? { right: m.right - r.right < 80, low: m.bottom - r.bottom < 140 } : null;
    });
    ok("Skip intro while the opening plays, at the bottom right", !!sk && sk.right && sk.low, JSON.stringify(sk));
    await p.click("#cinema .pc-skipintro");
    await p.waitForTimeout(300);
    ok(
        "…which jumps to where the opening ends, and goes",
        (await video()).t >= 2.9 && (await ev(() => !document.querySelector("#cinema .pc-skipintro")))
    );

    // ---- subtitles: drawn by the player, so their size works ----
    await ev(() => {
        const vtt = "WEBVTT\n\n00:00.000 --> 00:09.000\nA line of subtitles\n";
        __ulTest.W.player!.subs = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
        __ulTest.renderPlayer();
    });
    await ready(p);
    await ev(() => {
        const v = document.querySelector<HTMLVideoElement>("#cinema video")!;
        v.pause();
        v.currentTime = 1;
    });
    await p
        .waitForFunction(() => !!document.querySelector("#cinema .pc-subtext .ln"), null, { timeout: 5000 })
        .catch(() => {});
    const sub = await ev(() => {
        const el = document.querySelector<HTMLElement>("#cinema .pc-subtext");
        return {
            text: el ? el.textContent : "",
            size: el ? parseFloat(getComputedStyle(el).fontSize) : 0,
            native: [...document.querySelector<HTMLVideoElement>("#cinema video")!.textTracks].map(x => x.mode).join(),
        };
    });
    ok(
        "a subtitle file's lines are drawn by the player (the browser's own drawing is off)",
        sub.text === "A line of subtitles" && sub.native === "hidden",
        JSON.stringify(sub)
    );
    await wake();
    await p.click('#cinema [data-act="cin-cc"]');
    ok(
        "CC opens the subtitles: which track, and how they look",
        await ev(
            () =>
                !!document.querySelector("#cinema .cin-cc") &&
                !!document.querySelector('#cinema .cin-cc [data-pon="subSize"]') &&
                !!document.querySelector('#cinema .cin-cc [data-act="cin-subs"]')
        )
    );
    await ev(() => {
        const r = document.querySelector<HTMLInputElement>('#cinema .cin-cc [data-pon="subSize"]')!;
        r.value = "200";
        r.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await p.waitForTimeout(200);
    const big = await ev(() => parseFloat(getComputedStyle(document.querySelector("#cinema .pc-subtext")!).fontSize));
    ok(
        "the size setting makes them bigger (twice as big at 200%)",
        Math.abs(big / sub.size - 2) < 0.05,
        `${sub.size} → ${big}`
    );
    await ev(() => {
        const r = document.querySelector<HTMLInputElement>('#cinema .cin-cc [data-pon="subBg"]')!;
        r.value = "0";
        r.dispatchEvent(new Event("input", { bubbles: true }));
    });
    ok(
        "…and the background setting clears the box behind them",
        await ev(
            () =>
                getComputedStyle(document.querySelector("#cinema .pc-subtext .ln")!).backgroundColor ===
                "rgba(0, 0, 0, 0)"
        )
    );
    await p.click("#cinema .cin-cc .srcrow >> text=Off");
    await p.waitForTimeout(200);
    ok(
        "Off takes them away",
        await ev(
            () => !document.querySelector("#cinema .pc-subtext .ln") && !document.querySelector("#cinema .pc-cc.on")
        )
    );
    await p.keyboard.press("c");
    await p.waitForTimeout(200);
    ok("C brings them back", await ev(() => !!document.querySelector("#cinema .pc-subtext .ln")));
    await ev(() => __ulTest.playerRedraw());

    // ---- a converted stream: the bar knows its full length and seeking starts it again from there ----
    await play(p, [{ name: "Converted", how: "converted", q: "?x=1" }]);
    await ev(() => {
        __ulTest.W.player!.dur = 100;
    });
    await p.waitForTimeout(800);
    const cb = (await p.locator("#cinema .pc-scrub").boundingBox())!;
    await wake();
    await p.mouse.click(cb.x + cb.width * 0.5, cb.y + cb.height / 2);
    await p.waitForTimeout(500);
    const t2 = await ev(() => ({
        off: __ulTest.W.player!.offset,
        src: document.querySelector("#cinema video")!.getAttribute("src"),
    }));
    ok(
        "seeking a converted stream starts it from that point",
        t2.off === 50 && /[?&]t=50\b/.test(t2.src!),
        JSON.stringify(t2)
    );
    ok(
        "…and the time counts from there",
        await ev(() => /^0:5\d \/ 1:40$/.test(document.querySelector("#cinema .pc-time")!.textContent!)),
        await ev(() => document.querySelector("#cinema .pc-time")!.textContent)
    );
    await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(400);
    ok(
        "→ on a converted stream jumps too",
        await ev(() => __ulTest.W.player!.offset! >= 64),
        await ev(() => __ulTest.W.player!.offset)
    );

    // ---- the controls hide while it plays and the pointer is still ----
    await play(p, [{ name: "A", how: "original" }]);
    await ready(p);
    await ev(() => {
        const v = document.querySelector<HTMLVideoElement>("#cinema video")!;
        v.currentTime = 0;
        v.play();
    });
    await wake();
    await p.waitForTimeout(3400);
    ok(
        "the controls hide while it plays",
        await ev(() => document.querySelector("#cinema")!.classList.contains("idle"))
    );
    await p.context().close();

    // ════ a phone (iPhone 14) ════
    const iphone = { ...devices["iPhone 14"] };
    Reflect.deleteProperty(iphone, "defaultBrowserType");
    const q = await open(iphone);
    const qv = evaluator(q);
    await play(q, [{ name: "A", how: "original" }]);
    await ready(q);
    await qv(() => document.querySelector<HTMLVideoElement>("#cinema video")!.pause());
    const phone = await qv(() => {
        const vis = (s: string) => {
            const e = document.querySelector<HTMLElement>(s);
            return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
        };
        const big = document.querySelector("#cinema .pc-bigplay")!.getBoundingClientRect(),
            main = document.querySelector("#cinema .cin-main")!.getBoundingClientRect();
        return {
            bigplay: vis("#cinema .pc-bigplay") && big.width >= 56,
            jumps: vis("#cinema .pc-jump.back") && vis("#cinema .pc-jump.fwd"),
            centred: Math.abs(big.left + big.width / 2 - (main.left + main.width / 2)) < 4,
            full: vis('#cinema [data-act="cin-full"]'),
            fewer:
                !vis('#cinema [data-act="cin-lay"]') &&
                !vis("#cinema .pc-volr") &&
                !vis('#cinema .cin-under [data-act="cin-lights"]'),
            edge: Math.round(main.width) === innerWidth,
            scroll: document.documentElement.scrollWidth <= innerWidth,
        };
    });
    ok(
        "a phone: play and the 15 s jumps as big buttons in the middle, edge to edge, fewer controls, full screen there",
        Object.values(phone).every(Boolean),
        JSON.stringify(phone)
    );
    await q.tap("#cinema .pc-jump.fwd");
    await q.waitForTimeout(300);
    ok(
        "…the ⟳ button jumps by thumb",
        (await qv(() => document.querySelector<HTMLVideoElement>("#cinema video")!.currentTime)) > 0
    );
    await q.tap('#cinema [data-act="cin-opts"]');
    const sheet = await qv(() => {
        const r = document.querySelector("#cinema .cin-opts")!.getBoundingClientRect();
        return { bottom: Math.round(innerHeight - r.bottom), wide: r.width > innerWidth - 30 };
    });
    ok(
        "…and its settings rise from the bottom, the screen's width",
        sheet.bottom <= 12 && sheet.wide,
        JSON.stringify(sheet)
    );

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    srv.close();
    process.exit(0);
})().catch(e => {
    console.log("FAIL " + String(e && e.message).split("\n")[0]);
    process.exit(1);
});
