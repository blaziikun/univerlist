// Small things that make watching nicer: your usual server for a show, "Resumed at … · Start over", and "Up next in 5…".
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
    const id = await ev(() =>
        __ulTest.addItem({ medium: "anime", title: "Qol Show", status: "active", total: 3, prog: 0 })
    );
    const setShow = () =>
        ev(i => {
            __ulTest.ui.page = "watch";
            __ulTest.render();
            __ulTest.W.show = { medium: "anime", title: "Qol Show", year: 2020, ext: {} };
            __ulTest.W.seasons = [
                { n: 1, label: "Qol Show", member: i, eps: [1, 2, 3].map(e => ({ e, title: "Ep " + e })) },
            ];
            __ulTest.W.si = 0;
            __ulTest.W.view = "show";
        }, id);
    const ready = () =>
        p.waitForFunction(
            () => {
                const v = document.querySelector<HTMLVideoElement>("#cinema video");
                return v && v.readyState >= 2;
            },
            null,
            { timeout: 15000 }
        );
    await setShow();
    // two servers for this show: mine and Sam's
    await ev(a => {
        __ulTest.meta.settings.player = { ...__ulTest.PS(), autoNext: true, resume: true };
        __ulTest.meta.settings.seriesServers = {
            [__ulTest.ssKey()]: [
                { value: a + "?mine", name: "Mine", on: true },
                { value: a + "?sam", name: "Sam", on: true },
            ],
        };
        __ulTest.watchStart(0, 1);
    }, U("a.webm"));
    await ready();
    ok("starts on the first server", await ev(() => __ulTest.W.player!.srcs[__ulTest.W.player!.k].name === "Mine"));
    await p.click('#cinema [data-act="cin-src-pick"][data-k="1"]');
    await ready();
    ok("picking Sam's", await ev(() => __ulTest.W.player!.srcs[__ulTest.W.player!.k].name === "Sam"));
    await ev(() => __ulTest.watchStep(1));
    await ready();
    ok(
        "the next episode starts on Sam's too (your usual one for this show)",
        await ev(() => __ulTest.W.player!.e === 2 && __ulTest.W.player!.srcs[__ulTest.W.player!.k].name === "Sam"),
        await ev(() =>
            JSON.stringify({
                e: __ulTest.W.player!.e,
                k: __ulTest.W.player!.k,
                n: __ulTest.W.player!.srcs.map(s => s.name),
            })
        )
    );
    // up next
    await ev(() => {
        const v = document.querySelector<HTMLVideoElement>("#cinema video");
        v!.currentTime = v!.duration - 0.2;
        v!.play();
    });
    await p.waitForSelector("#cinema .pc-next", { timeout: 6000 }).catch(() => {});
    ok(
        'at the end: "Up next" with the next episode and a countdown',
        await ev(() => {
            const c = document.querySelector("#cinema .pc-next");
            return !!c && /Episode 3/.test(c.textContent) && /in \d…/.test(c.textContent);
        }),
        await ev(() => (document.querySelector("#cinema .pc-next") || {}).textContent)
    );
    await p.click('#cinema [data-act="pc-next-cancel"]');
    await p.waitForTimeout(5500);
    ok(
        "Cancel stays on this episode",
        await ev(() => __ulTest.W.player!.e === 2 && !document.querySelector("#cinema .pc-next"))
    );
    await ev(() => {
        const v = document.querySelector<HTMLVideoElement>("#cinema video");
        v!.currentTime = v!.duration - 0.2;
        v!.play();
    });
    await p.waitForSelector("#cinema .pc-next", { timeout: 6000 }).catch(() => {});
    await p
        .waitForFunction(() => __ulTest.W.player && __ulTest.W.player.e === 3, null, { timeout: 8000 })
        .catch(() => {});
    ok("…and left alone, it goes on by itself", await ev(() => __ulTest.W.player!.e === 3));
    // resumed: a converted stream you left at 2:05
    await ev(a => {
        __ulTest.W.player = null;
        __ulTest.renderPlayer();
        __ulTest.savePos(__ulTest.posKey(0, 1), 125);
        __ulTest.W.player = {
            title: "Qol Show · Episode 1",
            show: "Qol Show",
            si: 0,
            e: 1,
            srcs: [{ name: "Conv", url: a + "?conv=1", how: "converted" }],
            k: 0,
            marked: false,
            dur: 600,
        };
        __ulTest.renderPlayer();
    }, U("a.webm"));
    await p.waitForSelector("#cinema .pc-chip", { timeout: 6000 }).catch(() => {});
    ok(
        '"Resumed at 2:05 · Start over"',
        await ev(() => /Resumed at 2:05/.test((document.querySelector("#cinema .pc-chip") || {}).textContent || "")),
        await ev(() => (document.querySelector("#cinema .pc-chip") || {}).textContent)
    );
    await p.click('#cinema [data-act="pc-startover"]');
    await p.waitForTimeout(600);
    ok(
        "Start over goes back to the beginning (even on a converted stream)",
        await ev(
            () =>
                __ulTest.W.player!.offset === 0 &&
                !/[?&]t=\d/.test(document.querySelector("#cinema video")!.getAttribute("src")!)
        ),
        await ev(() =>
            JSON.stringify({
                off: __ulTest.W.player!.offset,
                src: document.querySelector("#cinema video")!.getAttribute("src"),
            })
        )
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    srv.close();
    process.exit(0);
})();
