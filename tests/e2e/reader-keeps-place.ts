// Reading a book (EPUB), the chapter stays where you've scrolled to while you use the reader around it: opening and
// closing its settings used to load the chapter again from its top.
// Changing how it looks (the page's colours, the size) still lays it out again with your choices. A long strip of
// pictures keeps its pages too when the settings open.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import ENV from "./env.ts";
import { zipSync, strToU8 } from "fflate";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import os from "node:os";
import { ok, evaluator } from "./helpers.ts";
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ul-keep-"));
    const epub = path.join(tmp, "Long Book.epub");
    fs.writeFileSync(
        epub,
        zipSync({
            mimetype: strToU8("application/epub+zip"),
            "META-INF/container.xml": strToU8(
                '<?xml version="1.0"?><container><rootfiles><rootfile full-path="c.opf"/></rootfiles></container>'
            ),
            "c.opf": strToU8(
                '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'
            ),
            "a.xhtml": strToU8(
                "<html><body>" +
                    "<p>A long paragraph of the first chapter, going on for a while so the chapter scrolls.</p>".repeat(
                        120
                    ) +
                    "</body></html>"
            ),
            "b.xhtml": strToU8("<html><body><p>Two.</p></body></html>"),
        })
    );
    const strip = path.join(tmp, "Strip Ch. 2.cbz");
    const f: Record<string, Uint8Array> = {};
    for (let i = 0; i < 8; i++) f[`p${i + 1}.png`] = new Uint8Array(png(60, 400, [40 + i * 20, 90, 160]));
    fs.writeFileSync(strip, zipSync(f));
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1200, height: 800 } });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const open = async (title: string, medium: string, file: string) => {
        const id = await ev(
            ([t, m]) => __ulTest.addItem({ medium: m, title: t, status: "active", total: 50 }),
            [title, medium]
        );
        await ev(i => __ulTest.readFromItem(i), id);
        await p.waitForTimeout(300);
        const [fc] = await Promise.all([
            p.waitForEvent("filechooser"),
            ev(() => document.querySelector<HTMLElement>('[data-act="read-files"]')!.click()),
        ]);
        await fc.setFiles(file);
        await p.waitForSelector("#reader");
        await p.waitForTimeout(400);
    };
    await open("Long Book", "book", epub);
    await p.waitForFunction(() => {
        const f = document.querySelector<HTMLIFrameElement>("#reader .rdepub");
        return f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.textContent.length > 100;
    });
    const y = await ev(() => {
        const w = document.querySelector<HTMLIFrameElement>("#reader .rdepub")!.contentWindow;
        w!.scrollTo(0, 1500);
        window.__kept = new WeakSet([document.querySelector("#reader .rdepub")!]);
        return w!.scrollY;
    });
    await p.click('#reader [data-act="rd-opts"]');
    await p.waitForTimeout(300);
    const r = await ev(() => {
        const f = document.querySelector<HTMLIFrameElement>("#reader .rdepub");
        return {
            same: window.__kept.has(f!),
            y: f!.contentWindow!.scrollY,
            opts: !!document.querySelector("#reader .rd-opts"),
        };
    });
    ok(
        "opening the reader settings keeps your place in the chapter",
        y > 1000 && r.same && r.y === y && r.opts,
        JSON.stringify({ wanted: y, ...r })
    );
    await p.click('#reader [data-act="rd-opts"]');
    await p.waitForTimeout(300);
    const r2 = await ev(() => {
        const f = document.querySelector<HTMLIFrameElement>("#reader .rdepub");
        return { same: window.__kept.has(f!), y: f!.contentWindow!.scrollY };
    });
    ok("…and closing them", r2.same && r2.y === y, JSON.stringify(r2));
    await p.click('#reader [data-act="rd-opts"]');
    await p.click('#reader [data-act="rd-set"][data-k="theme"][data-v="sepia"]');
    await p.waitForTimeout(400);
    ok(
        "changing the page colour lays the chapter out again in it",
        await ev(() => {
            const d = document.querySelector<HTMLIFrameElement>("#reader .rdepub")!.contentDocument;
            return d!.defaultView!.getComputedStyle(d!.body).backgroundColor === "rgb(244, 234, 212)";
        })
    );
    ok(
        "…with the chapter's own rule still first in its head",
        await ev(() => {
            const d = document.querySelector<HTMLIFrameElement>("#reader .rdepub")!.contentDocument;
            return d!.head.firstElementChild!.getAttribute("http-equiv") === "Content-Security-Policy";
        })
    );
    await p.keyboard.press("Escape");
    await p.keyboard.press("Escape");
    ok("Escape closes the settings, then the book", await ev(() => !document.querySelector("#reader")));

    await open("Strip", "manhwa", strip);
    await ev(() => {
        const st = document.querySelector("#reader .rdstage");
        st!.scrollTop = st!.scrollHeight / 3;
        window.__kept = new WeakSet(document.querySelectorAll("#reader .rdscroll img"));
    });
    await p.waitForTimeout(300);
    const at = await ev(() => __ulTest.RD.idx);
    await p.click('#reader [data-act="rd-opts"]');
    await p.waitForTimeout(300);
    const r3 = await ev(() => ({
        same: [...document.querySelectorAll("#reader .rdscroll img")].every(i => window.__kept.has(i)),
        at: __ulTest.RD.idx,
    }));
    ok(
        "opening the settings over a long strip doesn't draw its pages again, and you stay on your page",
        at > 0 && r3.same && r3.at === at,
        JSON.stringify({ wanted: at, ...r3 })
    );
    // the strip is the same element from one draw to the next, so a draw's "back to your page" mustn't land after a newer place
    const r4 = await ev(
        at =>
            new Promise<{ y: number; idx: number }>(res => {
                const st = document.querySelector("#reader .rdstage");
                st!.scrollTop = 0;
                __ulTest.RD.idx = at;
                __ulTest.renderReader();
                __ulTest.RD.idx = 0;
                __ulTest.renderReader();
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => res({ y: st!.scrollTop, idx: __ulTest.RD.idx }))
                );
            }),
        at
    );
    ok(
        "a place set again before the next frame wins over the one drawn a moment before",
        r4.idx === 0 && r4.y < 100,
        JSON.stringify(r4)
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(0);
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
