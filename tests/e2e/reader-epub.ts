// The book reader with a real EPUB's quirks: chapters that are XHTML (a self-closing <title/> mustn't swallow the
// text), a chapter that isn't well-formed, two pictures with the same file name in different folders, a style sheet
// whose url(...) points at a picture and a font beside it, and a picture and a font from the web (a tracking pixel),
// which must never load. Chapters stay in a frame that can't run scripts.
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ul-epub-"));
    const XH = (body: string) =>
        `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title/><link rel="stylesheet" type="text/css" href="../Styles/book.css"/></head><body>${body}</body></html>`;
    const epub = path.join(tmp, "Odd Book.epub");
    fs.writeFileSync(
        epub,
        zipSync({
            mimetype: strToU8("application/epub+zip"),
            "META-INF/container.xml": strToU8(
                '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
            ),
            "OEBPS/content.opf": strToU8(
                '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest>' +
                    '<item id="c1" href="Text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="Text/two.xhtml" media-type="application/xhtml+xml"/>' +
                    '<item id="i1" href="Images/cover.png" media-type="image/png"/><item id="i2" href="Text/cover.png" media-type="image/png"/>' +
                    '<item id="bg" href="Images/bg.png" media-type="image/png"/><item id="css" href="Styles/book.css" media-type="text/css"/>' +
                    '<item id="f" href="Fonts/b.woff2" media-type="font/woff2"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'
            ),
            "OEBPS/Images/cover.png": new Uint8Array(png(12, 18, [200, 40, 40])),
            "OEBPS/Text/cover.png": new Uint8Array(png(30, 10, [40, 40, 200])),
            "OEBPS/Images/bg.png": new Uint8Array(png(4, 4, [40, 200, 40])),
            "OEBPS/Fonts/b.woff2": new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]),
            "OEBPS/Styles/book.css": strToU8(
                '@font-face{font-family:Book;src:url("../Fonts/b.woff2")}@font-face{font-family:Web;src:url(https://tracker.example/font.woff2)}' +
                    ".hero{background-image:url(../Images/bg.png);height:20px}.web{font-family:Web}"
            ),
            "OEBPS/Text/one.xhtml": strToU8(
                XH(
                    '<p id="t">First chapter text.</p><img id="a" src="../Images/cover.png" alt=""/><img id="b" src="cover.png" alt=""/>' +
                        '<div class="hero" id="hero"></div><div id="inline" style="background-image:url(\'../Images/bg.png\');height:4px"></div>' +
                        '<p class="web">Fancy.</p><img id="pixel" src="https://tracker.example/pixel.gif" alt=""/>' +
                        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image id="svgimg" xlink:href="../Images/cover.png" width="10" height="10"/></svg>'
                )
            ),
            // not well-formed XML (an HTML entity, no namespace): read the forgiving way instead
            "OEBPS/Text/two.xhtml": strToU8(
                '<html><head><title>Two</title></head><body><p id="t">Second&nbsp;chapter<br>text.</p></body></html>'
            ),
        })
    );
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1200, height: 900 } });
    await setup(c);
    // what actually goes out to the web (a request the page's rule stops is reported, then fails as "csp", unsent)
    const web: string[] = [],
        stopped: string[] = [];
    await c.route(/tracker\.example/, r => {
        web.push(r.request().url());
        r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACw=", "base64") });
    });
    c.on("requestfailed", r => {
        if (/tracker\.example/.test(r.url())) stopped.push(String(r.failure()?.errorText));
    });
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    const id = await ev(() => __ulTest.addItem({ medium: "book", title: "Odd Book", status: "active", total: 10 }));
    await ev(i => __ulTest.readFromItem(i), id);
    await p.waitForTimeout(300);
    const [fc] = await Promise.all([
        p.waitForEvent("filechooser"),
        ev(() => document.querySelector<HTMLElement>('[data-act="read-files"]')!.click()),
    ]);
    await fc.setFiles(epub);
    await p.waitForSelector("#reader .rdepub");
    await p
        .waitForFunction(
            () => {
                const d = document.querySelector<HTMLIFrameElement>("#reader .rdepub")!.contentDocument;
                return (
                    d &&
                    d.querySelector("#a") &&
                    d.querySelector<HTMLImageElement>("#a")!.complete &&
                    d.querySelector<HTMLImageElement>("#b")!.complete
                );
            },
            null,
            { timeout: 10000 }
        )
        .catch(() => {});
    await p.waitForTimeout(500);
    const one = await ev(() => {
        const f = document.querySelector<HTMLIFrameElement>("#reader .rdepub"),
            d = f!.contentDocument!,
            q = (s: string) => d.querySelector(s),
            img = (s: string) => d.querySelector<HTMLImageElement>(s);
        const cs = (s: string) => {
            const e = q(s);
            return e && d.defaultView!.getComputedStyle(e);
        };
        const rule = d.querySelector<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy"]');
        return {
            sandbox: f!.getAttribute("sandbox"),
            text: d.body ? d.body.textContent : "",
            title: q("title")?.textContent,
            rule: rule ? rule.content : "",
            ruleFirst: d.head.firstElementChild === rule,
            a: img("#a") && [img("#a")!.getAttribute("src")!.slice(0, 5), img("#a")!.naturalWidth],
            b: img("#b") && [img("#b")!.getAttribute("src")!.slice(0, 5), img("#b")!.naturalWidth],
            same: img("#a") && img("#a")!.src === img("#b")!.src,
            hero: cs("#hero") && cs("#hero")!.backgroundImage,
            inline: cs("#inline") && cs("#inline")!.backgroundImage,
            svg: q("#svgimg") && q("#svgimg")!.getAttribute("xlink:href")!.slice(0, 5),
            fonts: [...d.styleSheets].flatMap(s => {
                try {
                    return [...s.cssRules].map(r => r.cssText).filter(t => /font-face/.test(t));
                } catch (_) {
                    return ["unreadable"];
                }
            }),
        };
    });
    ok("the chapter is in a frame that can't run scripts", one.sandbox === "allow-same-origin", one.sandbox);
    ok(
        "a self-closing <title/> doesn't swallow the chapter",
        /First chapter text/.test(one.text) && !one.title,
        JSON.stringify({ text: one.text.slice(0, 60), title: one.title })
    );
    ok(
        "each chapter carries its own rule against loading from anywhere else, first in its head",
        /default-src 'none'/.test(one.rule) && /img-src blob: data:/.test(one.rule) && one.ruleFirst,
        one.rule
    );
    ok(
        "two cover.png in different folders stay two pictures",
        one.a &&
            one.b &&
            one.a[0] === "blob:" &&
            one.b[0] === "blob:" &&
            !one.same &&
            one.a[1] === 12 &&
            one.b[1] === 30,
        JSON.stringify([one.a, one.b, one.same])
    );
    ok(
        "url(...) inside the book's style sheet is the book's own picture",
        /^url\("blob:/.test(one.hero || ""),
        one.hero
    );
    ok("…and inside a style attribute", /^url\("blob:/.test(one.inline || ""), one.inline);
    ok(
        "…and the style sheet's own font",
        one.fonts.some(t => /Book/.test(t) && /blob:/.test(t)),
        one.fonts.join(" / ")
    );
    ok("a picture inside an SVG (a cover page) is found too", one.svg === "blob:", one.svg);
    ok("a picture or font from the web never loads (no tracking pixel)", !web.length, web.join(" "));
    ok(
        "…because the chapter's rule stopped them",
        stopped.length >= 2 && stopped.every(x => x === "csp"),
        stopped.join(" ")
    );
    await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(500);
    const two = await ev(() => {
        const d = document.querySelector<HTMLIFrameElement>("#reader .rdepub")!.contentDocument;
        return {
            at: __ulTest.RD.ci,
            text: d!.body ? d!.body.textContent : "",
            br: d!.querySelectorAll("#t br").length,
            rule: !!d!.querySelector('meta[http-equiv="Content-Security-Policy"]'),
        };
    });
    ok(
        "a chapter that isn't well-formed is still read, the forgiving way",
        two.at === 1 && /Second chapter/.test(two.text) && two.br === 1 && two.rule,
        JSON.stringify(two)
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(0);
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
