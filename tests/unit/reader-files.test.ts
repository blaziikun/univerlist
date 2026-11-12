// @vitest-environment happy-dom
// The reader opens files people bring (watch-read/read.ts): a zip of pictures, an EPUB. They're someone else's making,
// so a file with nothing readable in it, a book with a broken link in its manifest, or a place saved from an earlier,
// longer file must neither break the page nor log a chapter you never read.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { items, meta, migrateItem } from "../../src/features/core/core";
import { RD, readerDrop, readStart, renderReader, useSvelteReader } from "../../src/features/watch-read/read";
import { readerSurface } from "../../src/features/watch-read/surfaces";

// the reader as main.ts hands it over
useSvelteReader(readerSurface);

const enc = new TextEncoder();
const PNG = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
    c => c.charCodeAt(0)
);
const zipFile = (files: Record<string, Uint8Array>, name: string) => new File([zipSync(files)], name);
// an EPUB: its container, its package (manifest and spine) and its chapters
const epub = ({
    manifest,
    spine,
    chapters = {},
}: {
    manifest: string;
    spine: string;
    chapters?: Record<string, string | Uint8Array>;
}) =>
    zipSync({
        mimetype: enc.encode("application/epub+zip"),
        "META-INF/container.xml": enc.encode(
            `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`
        ),
        "OEBPS/content.opf": enc.encode(
            `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest>${manifest}</manifest><spine>${spine}</spine></package>`
        ),
        ...Object.fromEntries(
            Object.entries(chapters).map(([k, v]) => [
                k,
                typeof v === "string"
                    ? enc.encode(
                          `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title/></head><body>${v}</body></html>`
                      )
                    : v,
            ])
        ),
    });
const chapter = (n: number) => `<item id="c${n}" href="c${n}.xhtml" media-type="application/xhtml+xml"/>`;
const open = async (file: File, ch: number | null = null) => {
    RD.files = [{ file, ch }];
    await readStart(0);
};

let id: string;
beforeEach(() => {
    document.body.innerHTML = `<div id="app"><header id="top"></header><aside id="side"></aside><main id="main"></main></div><div id="overlay"></div>`;
    localStorage.clear();
    id = "test-manga";
    items.set(id, migrateItem({ title: "Test Manga", medium: "manga", status: "active", prog: 0 }));
    RD.item = id;
    meta.settings.reader = {};
});
afterEach(() => {
    readerDrop();
    renderReader();
    items.clear();
    RD.item = null;
    RD.files = [];
});

describe("opening a file in the reader", () => {
    it("refuses a zip with no pictures in it, and logs nothing as read", async () => {
        await open(zipFile({ "notes.txt": enc.encode("no pages here") }, "Chapter 3.cbz"), 3);
        expect(RD.pages).toBeNull();
        expect(document.querySelector("#reader")).toBeNull();
        expect(items.get(id)!.prog).toBe(0);
        expect(document.querySelector(".toast")?.textContent).toMatch(/Nothing to read/);
    });

    it("refuses an EPUB whose reading order leads nowhere, instead of breaking the page", async () => {
        const book = epub({
            manifest: chapter(1),
            spine: `<itemref idref="missing"/>`,
            chapters: { "OEBPS/c1.xhtml": "<p>One</p>" },
        });
        await expect(open(new File([book], "book.epub"))).resolves.toBeUndefined();
        expect(RD.chapters).toBeNull();
        expect(document.querySelector("#reader")).toBeNull();
    });

    it("opens an EPUB with a broken link in its manifest (a stray %), the rest of it intact", async () => {
        const book = epub({
            manifest: chapter(1) + chapter(2) + `<item id="p" href="100%.png" media-type="image/png"/>`,
            spine: `<itemref idref="c1"/><itemref idref="c2"/>`,
            chapters: { "OEBPS/c1.xhtml": "<p>One</p>", "OEBPS/c2.xhtml": "<p>Two</p>", "OEBPS/100%.png": PNG },
        });
        await open(new File([book], "book.epub"));
        expect(RD.kind).toBe("epub");
        expect(RD.chapters).toHaveLength(2);
        expect(RD.chapters![1]).toContain("Two");
    });

    it("holds a saved place to this book's length (it may be from an earlier, longer file)", async () => {
        localStorage.setItem("ul-read-" + id, JSON.stringify({ f: "book.epub", i: 0, c: 9 }));
        const book = epub({
            manifest: chapter(1) + chapter(2),
            spine: `<itemref idref="c1"/><itemref idref="c2"/>`,
            chapters: { "OEBPS/c1.xhtml": "<p>One</p>", "OEBPS/c2.xhtml": "<p>Two</p>" },
        });
        await open(new File([book], "book.epub"));
        expect(RD.ci).toBe(1);
        expect(document.querySelector("#reader .rdepub")?.getAttribute("srcdoc")).toContain("Two");
    });

    it("holds a saved page to the pictures there are", async () => {
        localStorage.setItem("ul-read-" + id, JSON.stringify({ f: "Chapter 1.cbz", i: 40, c: 0 }));
        await open(zipFile({ "01.png": PNG, "02.png": PNG, "03.png": PNG }, "Chapter 1.cbz"), 1);
        expect(RD.pages).toHaveLength(3);
        expect(RD.idx).toBe(2);
    });
});

describe("the reader's progress bar", () => {
    it("moves through an EPUB's chapters when clicked", async () => {
        const book = epub({
            manifest: [1, 2, 3, 4].map(chapter).join(""),
            spine: [1, 2, 3, 4].map(n => `<itemref idref="c${n}"/>`).join(""),
            chapters: Object.fromEntries([1, 2, 3, 4].map(n => [`OEBPS/c${n}.xhtml`, `<p>Chapter ${n}</p>`])),
        });
        await open(new File([book], "book.epub"));
        expect(RD.ci).toBe(0);
        const bar = document.querySelector('#reader [data-act="rd-seek"]');
        bar!.getBoundingClientRect = () => new DOMRect(0, 0, 100, 8);
        bar!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 80 }));
        expect(RD.ci).toBe(3);
    });
});
