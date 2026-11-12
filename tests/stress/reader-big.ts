// Stress: a 300-page chapter. Opening it, turning pages one and two at a time, scrolling it as one long strip, and jumping to the end
// stay quick, and only the pages near you are loaded.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import ENV from "../e2e/env.ts";
import { zipSync } from "fflate";
import { chromium } from "playwright";
import { setup } from "../e2e/mocks.ts";
import os from "node:os";
import { ok, evaluator } from "../e2e/helpers.ts";
function png(w: number, h: number, rgb: number[]) {
    const tb: number[] = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tb[n] = c >>> 0;
    }
    const crc = (b: Buffer) => {
        let x = 0xffffffff;
        for (const v of b) x = tb[(x ^ v) & 255] ^ (x >>> 8);
        return (x ^ 0xffffffff) >>> 0;
    };
    const chunk = (t: string, d: Buffer) => {
        const l = Buffer.alloc(4);
        l.writeUInt32BE(d.length);
        const td = Buffer.concat([Buffer.from(t), d]),
            c = Buffer.alloc(4);
        c.writeUInt32BE(crc(td));
        return Buffer.concat([l, td, c]);
    };
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
    const ih = Buffer.alloc(13);
    ih.writeUInt32BE(w, 0);
    ih.writeUInt32BE(h, 4);
    ih[8] = 8;
    ih[9] = 2;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ih),
        chunk("IDAT", zlib.deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}
(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ul-rbig-")),
        f: Record<string, Uint8Array> = {};
    for (let i = 0; i < 300; i++)
        f[`p${String(i + 1).padStart(3, "0")}.png`] = new Uint8Array(png(80, 120, [i % 255, 80, 160]));
    const cbz = path.join(tmp, "Big Ch. 001.cbz");
    fs.writeFileSync(cbz, zipSync(f));
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
    const id = await ev(() => __ulTest.addItem({ medium: "manga", title: "Big", status: "active", total: 50 }));
    await ev(i => __ulTest.readFromItem(i), id);
    await p.waitForTimeout(300);
    const t0 = Date.now();
    const [fc] = await Promise.all([
        p.waitForEvent("filechooser"),
        ev(() => document.querySelector<HTMLElement>('[data-act="read-files"]')!.click()),
    ]);
    await fc.setFiles(cbz);
    await p.waitForFunction(
        () => {
            const i = document.querySelector<HTMLImageElement>("#reader .rdimgs img");
            return i && i.complete && i.naturalWidth;
        },
        null,
        { timeout: 20000 }
    );
    ok("a 300-page chapter opens in under 2 s", Date.now() - t0 < 2000, Date.now() - t0 + " ms");
    let ms = await ev(async () => {
        const t = performance.now();
        for (let i = 0; i < 50; i++) __ulTest.readStep(1);
        return performance.now() - t;
    });
    ok("50 page turns in under 1 s", ms < 1000, Math.round(ms) + " ms");
    await ev(() => {
        __ulTest.rdSet({ spread: "double" });
        __ulTest.renderReader();
    });
    ms = await ev(async () => {
        const t = performance.now();
        for (let i = 0; i < 30; i++) __ulTest.readStep(1);
        return performance.now() - t;
    });
    ok("30 two-page turns in under 1 s", ms < 1000, Math.round(ms) + " ms");
    // the pages turned past above are already in memory and show at once wherever they are, so the strip is opened afresh
    // (new page addresses, nothing loaded) to see what loading it costs
    await ev(async () => {
        __ulTest.rdSet({ mode: "scroll" });
        await __ulTest.readStart(__ulTest.RD.fi);
        __ulTest.RD.idx = 0;
        __ulTest.renderReader();
    });
    await p.waitForTimeout(800);
    const loaded = await ev(
        () =>
            [...document.querySelectorAll<HTMLImageElement>("#reader .rdscroll img")].filter(
                i => i.complete && i.naturalWidth
            ).length
    );
    ok("as one long strip, only the pages near you load at first", loaded < 60, loaded + " of 300 loaded");
    ms = await ev(async () => {
        const st = document.querySelector("#reader .rdstage"),
            t = performance.now();
        for (let i = 0; i < 40; i++) {
            st!.scrollTop += 400;
            await new Promise(r => requestAnimationFrame(r));
        }
        return performance.now() - t;
    });
    ok("scrolling stays smooth (40 steps)", ms < 1500, Math.round(ms) + " ms");
    await p.keyboard.press("End");
    await p.waitForTimeout(800);
    ok("End jumps to the last page", await ev(() => __ulTest.RD.idx >= 298), await ev(() => __ulTest.RD.idx));
    // the pages jumped over never load, and that mustn't hold the place (or the end) back
    ok(
        "…with the pages in between still not loaded",
        await ev(
            () =>
                [...document.querySelectorAll<HTMLImageElement>("#reader .rdscroll img")].filter(
                    i => i.complete && i.naturalWidth
                ).length < 150
        ),
        await ev(
            () =>
                [...document.querySelectorAll<HTMLImageElement>("#reader .rdscroll img")].filter(
                    i => i.complete && i.naturalWidth
                ).length + " loaded"
        )
    );
    await ev(() => {
        const st = document.querySelector("#reader .rdstage");
        st!.scrollTop = st!.scrollHeight;
    });
    await p.waitForTimeout(500);
    ok(
        "…and scrolling on to the very end logs the chapter",
        await ev(i => __ulTest.items.get(i)!.prog === 1, id),
        await ev(i => __ulTest.items.get(i)!.prog, id)
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(0);
})();
