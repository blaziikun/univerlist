// src/features/watch-read/read.ts
// ─────────────────────────────────────────────────────────────────
//  Read (beta): open your own files (PDF, EPUB, CBZ/ZIP of pages, a folder of images) and read them here
//
//  Manga reads right to left page by page, manhwa scrolls down, books open in the browser's own PDF view or as EPUB
//  chapters. Finishing a chapter logs it. A file you open is someone else's making: one that holds nothing readable is
//  refused with a note, and a place saved from an earlier, longer file is held to this one's length.
// ─────────────────────────────────────────────────────────────────

import {
    $,
    cleanTitle,
    fieldsOf,
    items,
    markDirty,
    MEDIA,
    meta,
    numOf,
    ownOf,
    safeJSON,
    titleOf,
    toast,
    ui,
    undo,
    unitOf,
} from "../core/core";
import { coverSrc } from "../sources/covers";
import { progText } from "../core/views";
import { renderMain } from "../core/shell";
import { closeModal } from "../core/modals";
import { unzip } from "../import-export/importers";
import type { ZipFiles } from "../import-export/importers";
import { stageOffNote, stageOn } from "../extensions/builtins";
import { libReach } from "./medialibs";
import { readMatch, remoteFile, remotePages } from "./readlibs";
import type { Chapter } from "./readlibs";
import { closeCtx } from "../core/keys";
import { stageChanged } from "./stage-state.svelte";
import { render } from "../core/navigation";
import { logProgress } from "../library/item-actions";

/** a file the reader has open, or can: one of yours, a folder of pictures, or a chapter on a server */
export interface ReadFile {
    file?: File;
    images?: File[]; // pictures opened together, as one chapter
    name?: string;
    ch: number | null; // its chapter (or volume) number, when its name says
    remote?: Chapter;
    pages?: string[]; // a server's pages, once known
}
/** the reader's state: the book that's open, its pages or chapters, and where you are in it */
export const RD: {
    item: string | null;
    files: ReadFile[];
    fi: number; // the file open, of files
    pages: string[] | null; // its pages' addresses (a PDF has one: the file)
    idx: number; // the page you're on
    kind: string; // "images", "pdf" or "epub"
    chapters: string[] | null; // an EPUB's chapters, as pages ready for the frame
    ci: number; // the chapter you're on
    opts: boolean; // the reader's settings are open
    book: number; // counts up each time a book closes, so pages still arriving for it are dropped
    mode?: string; // "paged" or "scroll"
    rtl?: boolean;
    ar?: string | null; // a page's shape (width / height), for pages that haven't arrived
    logged?: string; // the file already logged as read
    auto?: boolean; // auto-scroll is on
    autoRaf?: number;
    hold?: boolean; // …and held while the mouse is down
} = {
    item: null,
    files: [],
    fi: 0,
    pages: null,
    idx: 0,
    kind: "",
    chapters: null,
    ci: 0,
    opts: false,
    book: 0,
};
// every page picture of the open book that lives in memory (from a CBZ, an EPUB, a PDF, a server that needs a key) has
// an address made here, and closing the book lets them all go, so a long reading session doesn't pile up hundreds of MB
let readerURLs: string[] = [];
export function readerURL(blob: Blob): string {
    const u = URL.createObjectURL(blob);
    readerURLs.push(u);
    return u;
}
/** closes the book that's open, and lets go of its pages */
export function readerDrop() {
    for (const u of readerURLs) URL.revokeObjectURL(u);
    readerURLs = [];
    RD.book++;
    RD.pages = null;
    RD.chapters = null;
}
/** something the reader can open */
export const readable = (b: { medium: string }) => ["book", "manga", "manhwa", "novel", "comic"].includes(b.medium);
/** the Read page with a book or series open (page/ReadBook.svelte): its header, what you opened this time, and
 *  (page/ReadServerList.svelte) what your servers have */
export function readBookView() {
    const id = RD.item,
        it = id ? items.get(id) : undefined;
    if (!id || !it) return null;
    const unit = unitOf(it)[0];
    return {
        id,
        it,
        cover: coverSrc({ id, ...it }),
        eyebrow: [ownOf(MEDIA, it.medium)?.one, it.creator].filter(Boolean).join(" · "),
        title: titleOf(it),
        prog: progText(it),
        open: `Open ${it.medium === "book" || it.medium === "novel" ? "the book (PDF or EPUB)" : "chapters (CBZ, ZIP, PDF or images)"}…`,
        files: RD.files.map((f, i) => ({
            i,
            n: String(f.ch ?? i + 1),
            name: fname(f),
            sub: f.ch != null ? unit + " " + f.ch : "",
        })),
    };
}
const fname = (f: ReadFile | undefined) => (f ? (f.file ? f.file.name : f.name || "") : "");
export function readFromItem(id: string) {
    if (!stageOn()) {
        stageOffNote();
        return;
    }
    closeCtx();
    closeModal();
    RD.item = id;
    RD.files = [];
    ui.rlPick = null;
    ui.page = "read";
    render();
    window.scrollTo(0, 0);
    readMatch(id);
}
/** files from this computer to read: one opens at once; several are listed, by chapter, to pick from */
export function readPickFiles() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.accept = ".pdf,.epub,.cbz,.zip,image/*";
    inp.onchange = () => {
        const F = [...(inp.files || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!F.length) return;
        if (F.every(f => f.type.startsWith("image/"))) {
            RD.files = [{ file: F[0], images: F, ch: null }];
            readStart(0);
            return;
        }
        RD.files = F.map(f => {
            const m =
                /(?:ch(?:apter)?|c|#|vol)[ ._-]*(\d+(?:\.\d+)?)/i.exec(f.name) ||
                /(\d+(?:\.\d+)?)(?!.*\d)/.exec(f.name.replace(/\.\w+$/, ""));
            return { file: f, ch: m ? parseFloat(m[1]) : null };
        });
        if (RD.files.length === 1) readStart(0);
        else renderMain();
    };
    inp.click();
}
// a saved place, held to what this book has (it may be from an earlier, longer file with the same name)
const within = (x: unknown, n: number) => Math.max(0, Math.min(n - 1, Math.floor(numOf(x) || 0)));
export async function readStart(i: number) {
    const f = RD.files[i];
    if (!f) return;
    RD.fi = i;
    RD.idx = 0;
    RD.ar = null;
    readerDrop();
    RD.ci = 0;
    // from a server: pages stream straight in; whole files (CBZ, EPUB, PDF) are fetched, then opened like your own
    if (f.remote && !f.file && !f.images) {
        try {
            const pg = await remotePages(f.remote);
            if (pg) {
                f.pages = pg;
            } else if (f.remote.file) {
                toast("Opening…");
                f.file = await remoteFile(f.remote);
            } else {
                toast("Nothing to read in that one.");
                return;
            }
        } catch (e) {
            toast(libReach(e, f.remote.lib));
            return;
        }
    }
    const name = fname(f).toLowerCase(),
        it = RD.item ? items.get(RD.item) : undefined,
        o = RS();
    RD.rtl = o.rtl != null ? o.rtl : !!(it && it.medium === "manga");
    RD.mode = o.mode || (it && it.medium === "manhwa" ? "scroll" : "paged");
    try {
        if (f.pages) {
            RD.kind = "images";
            RD.pages = f.pages;
        } else if (f.images) {
            RD.kind = "images";
            RD.pages = f.images.map(readerURL);
        } else if (f.file && /\.pdf$/.test(name)) {
            RD.kind = "pdf";
            RD.pages = [readerURL(f.file)];
        } else if (f.file && /\.(cbz|zip)$/.test(name)) {
            RD.kind = "images";
            const files = await unzip(await f.file.arrayBuffer());
            RD.pages = [...files.keys()]
                .filter(k => /\.(jpe?g|png|webp|gif|avif)$/i.test(k))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                .map(k =>
                    readerURL(
                        new Blob([files.get(k) ?? new Uint8Array()], {
                            type: "image/" + (k.split(".").pop() || "").toLowerCase().replace("jpg", "jpeg"),
                        })
                    )
                );
        } else if (f.file && /\.epub$/.test(name)) {
            RD.kind = "epub";
            RD.chapters = await epubChapters(await unzip(await f.file.arrayBuffer()));
        } else {
            toast("That file type can't be read here.");
            return;
        }
    } catch (e) {
        console.warn(e);
        toast("Couldn't open that file.");
        return;
    }
    // a zip with no pictures in it, a book whose chapters lead nowhere: nothing to show, and nothing to log as read
    const n = (RD.kind === "epub" ? RD.chapters : RD.pages)?.length || 0;
    if (!n) {
        readerDrop();
        toast("Nothing to read in that one.");
        return;
    }
    const at = loadReadPos();
    if (at.f === fname(f)) {
        if (RD.kind === "epub") RD.ci = within(at.c, n);
        else RD.idx = within(at.i, n);
    }
    renderReader();
}
// EPUB: chapters in reading order, ready to show in the sandboxed frame (no scripts there, ever).
// Each chapter is read as XHTML, which is what an EPUB holds (so a self-closing <title/> stays empty instead of
// swallowing the text), or as HTML when it isn't well-formed. Pictures, style sheets and fonts get local addresses,
// matched by their whole path in the book, so two cover.jpg in different folders stay apart; url(...) inside style
// sheets and style attributes too. A rule at the top of each chapter lets it load only those: a picture or font from
// the web (a tracking pixel) never loads, in either build
const EPUB_CSP =
    "default-src 'none'; img-src blob: data:; style-src blob: 'unsafe-inline'; font-src blob: data:; media-src blob: data:";
const EPUB_ASSET =
    /^(image\/[a-z0-9.+-]+|text\/css|font\/[a-z0-9.+-]+|application\/(font-[a-z0-9.+-]+|x-font-[a-z0-9.+-]+|vnd\.ms-opentype))$/i;
// a link inside the book, from the file at `from`, as the path of the file it points to ("" if it leaves the book)
const BOOK = "https://book.invalid/";
function bookPath(href: string, from: string): string {
    try {
        const u = new URL(String(href).trim(), BOOK + from.split("/").map(encodeURIComponent).join("/"));
        return u.href.startsWith(BOOK) ? decodeURIComponent(u.pathname.slice(1)) : "";
    } catch (_) {
        return "";
    }
}
async function epubChapters(files: ZipFiles): Promise<string[]> {
    const T = (k: string | undefined) => new TextDecoder().decode(k ? files.get(k) : undefined),
        find = (p: string) => (files.has(p) ? p : [...files.keys()].find(k => k === p || k.endsWith("/" + p)));
    const cont = T(find("META-INF/container.xml")),
        opfPath = /full-path="([^"]+)"/.exec(cont)?.[1];
    if (!opfPath) throw new Error("no package file");
    const opf = new DOMParser().parseFromString(T(opfPath), "application/xml");
    // the book's files by their id in its manifest (a Map: an id is the book's own text, never a key of an object)
    const man = new Map<string, { key: string | undefined; type: string }>();
    for (const it of opf.querySelectorAll("manifest > item")) {
        const href = it.getAttribute("href") || "";
        let plain = href;
        try {
            plain = decodeURIComponent(href);
        } catch (_) {}
        man.set(it.getAttribute("id") || "", {
            key: find(bookPath(href, opfPath)) || find(plain),
            type: it.getAttribute("media-type") || "",
        });
    }
    // only pictures, style sheets and fonts get an address (a page saying it's "text/html; image" doesn't)
    const urls = new Map<string, string>(),
        assets = [...man.values()].filter(
            (m): m is { key: string; type: string } => !!m.key && EPUB_ASSET.test(m.type)
        );
    // by file name too, for a book whose links are a little off: only when just one file has that name
    const byName = new Map<string, string | null>();
    for (const m of assets) {
        const n = m.key.split("/").pop() || "";
        byName.set(n, byName.has(n) ? null : m.key);
    }
    const local = (href: string, from: string): string | null => {
        if (/^(data|blob):/i.test(String(href).trim())) return null;
        const p = bookPath(href, from);
        if (!p) return null;
        const k = urls.has(p) ? p : byName.get(p.split("/").pop() || "");
        const to = k ? urls.get(k) : undefined;
        return to ? to + (/#.*/.exec(href) || [""])[0] : null;
    };
    const css = (text: string, from: string) =>
        String(text).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (all: string, _q: string, u: string) => {
            const to = local(u, from);
            return to ? `url("${to}")` : all;
        });
    for (const m of assets.filter(m => !/css/i.test(m.type)))
        urls.set(m.key, readerURL(new Blob([files.get(m.key) ?? new Uint8Array()], { type: m.type })));
    // style sheets last, so the pictures and fonts they point to already have addresses
    for (const m of assets.filter(m => /css/i.test(m.type)))
        urls.set(m.key, readerURL(new Blob([css(T(m.key), m.key)], { type: "text/css" })));
    // XHTML when it is that (well-formed, in the XHTML namespace); anything else is read the forgiving HTML way
    const parse = (text: string): Document => {
        const x = new DOMParser().parseFromString(text, "application/xhtml+xml");
        return x.documentElement &&
            x.documentElement.namespaceURI === "http://www.w3.org/1999/xhtml" &&
            !x.getElementsByTagName("parsererror").length
            ? x
            : new DOMParser().parseFromString(text, "text/html");
    };
    return [...opf.querySelectorAll("spine > itemref")]
        .map(r => man.get(r.getAttribute("idref") || ""))
        .flatMap(m => (m && m.key ? [m.key] : []))
        .map(from => {
            const src = parse(T(from)),
                out = document.implementation.createHTMLDocument("");
            out.head.textContent = "";
            const head = src.getElementsByTagName("head")[0],
                body = src.getElementsByTagName("body")[0];
            for (const a of src.documentElement.attributes)
                if (/^(xml:)?lang$|^dir$/.test(a.name))
                    out.documentElement.setAttribute(a.name.replace("xml:", ""), a.value);
            if (head) for (const n of head.childNodes) out.head.append(out.importNode(n, true));
            if (body) {
                for (const a of body.attributes) if (!/^on/i.test(a.name)) out.body.setAttribute(a.name, a.value);
                for (const n of body.childNodes) out.body.append(out.importNode(n, true));
            } else
                for (const n of src.documentElement.childNodes)
                    if (n !== head) out.body.append(out.importNode(n, true));
            // a chapter's own <base> or <meta http-equiv> (a refresh, a looser rule) could send it elsewhere: dropped
            for (const el of out.querySelectorAll("base, meta[http-equiv]")) el.remove();
            for (const el of out.querySelectorAll("*")) {
                for (const a of ["src", "href", "xlink:href", "poster"]) {
                    const v = el.getAttribute(a),
                        to = v && local(v, from);
                    if (to) el.setAttribute(a, to);
                }
                const style = el.getAttribute("style");
                if (style !== null) el.setAttribute("style", css(style, from));
                if (el.localName === "style") el.textContent = css(el.textContent || "", from);
            }
            const rule = out.createElement("meta");
            rule.setAttribute("http-equiv", "Content-Security-Policy");
            rule.setAttribute("content", EPUB_CSP);
            out.head.prepend(rule);
            return "<!doctype html>" + out.documentElement.outerHTML;
        })
        .filter(Boolean);
}
// ── the reader: every choice is yours, remembered separately for manga, manhwa, comics and books ──
// Pictures: page by page (one page or two side by side, right to left or left to right) or one long scroll; fit, zoom, width, gaps,
// background, brightness, auto-scroll. Books (EPUB): font, size, spacing, width, light / sepia / dark. Reaching the end logs it.
/** the reader's settings, as you chose them for what's open */
type ReaderPrefs = {
    mode: string;
    rtl: boolean | null; // null: as the kind of thing reads
    spread: string;
    coverAlone: boolean;
    fit: string;
    zoom: number;
    width: number;
    gap: number;
    bg: string;
    bright: number;
    tapNext: boolean;
    showBar: boolean;
    autoLog: boolean;
    scrollSpeed: number;
    preload: number;
    font: string;
    size: number;
    line: number;
    measure: number;
    theme: string;
    justify: boolean;
    hideUI?: boolean; // false: the controls stay on screen
};
const RD_DEF: ReaderPrefs = {
    mode: "",
    rtl: null,
    spread: "single",
    coverAlone: true,
    fit: "both",
    zoom: 100,
    width: 900,
    gap: 0,
    bg: "black",
    bright: 100,
    tapNext: false,
    showBar: true,
    autoLog: true,
    scrollSpeed: 60,
    preload: 4,
    font: "serif",
    size: 19,
    line: 1.6,
    measure: 680,
    theme: "dark",
    justify: false,
};
const RD_BG: Record<string, string> = {
    black: "#000",
    dark: "#141416",
    grey: "#2a2a2e",
    white: "#f6f6f4",
    sepia: "#efe4cc",
};
const RD_THEMES: Record<string, [bg: string, fg: string]> = {
    dark: ["#141416", "#e6e3dc"],
    sepia: ["#f4ead4", "#3b2f22"],
    light: ["#fbfbf8", "#1c1c1e"],
};
const RD_FONTS: Record<string, string> = {
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
// which set of choices applies: the kind of thing you're reading
const rdKind = () => {
    const it = RD.item ? items.get(RD.item) : undefined;
    if (RD.kind === "epub" || RD.kind === "pdf") return "book";
    const m = it ? it.medium : "";
    return m === "manga" || m === "manhwa" || m === "comic" ? m : "images";
};
// a saved choice of the kind its default is, or the default (settings come from storage and backups)
const asPrefs = (x: Record<string, unknown>): ReaderPrefs => {
    const str = (k: keyof ReaderPrefs, d: string) => (typeof x[k] === "string" ? String(x[k]) : d),
        num = (k: keyof ReaderPrefs, d: number) => numOf(x[k]) ?? d,
        bool = (k: keyof ReaderPrefs, d: boolean) => (typeof x[k] === "boolean" ? x[k] === true : d),
        d = RD_DEF;
    return {
        mode: str("mode", d.mode),
        rtl: x.rtl === true || x.rtl === "true" ? true : x.rtl === false || x.rtl === "false" ? false : null,
        spread: str("spread", d.spread),
        coverAlone: bool("coverAlone", d.coverAlone),
        fit: str("fit", d.fit),
        zoom: num("zoom", d.zoom),
        width: num("width", d.width),
        gap: num("gap", d.gap),
        bg: str("bg", d.bg),
        bright: num("bright", d.bright),
        tapNext: bool("tapNext", d.tapNext),
        showBar: bool("showBar", d.showBar),
        autoLog: bool("autoLog", d.autoLog),
        scrollSpeed: num("scrollSpeed", d.scrollSpeed),
        preload: num("preload", d.preload),
        font: str("font", d.font),
        size: num("size", d.size),
        line: num("line", d.line),
        measure: num("measure", d.measure),
        theme: str("theme", d.theme),
        justify: bool("justify", d.justify),
        hideUI: typeof x.hideUI === "boolean" ? x.hideUI : undefined,
    };
};
export const RS = (): ReaderPrefs => {
    const R = fieldsOf(meta.settings.reader),
        k = rdKind(),
        base: Record<string, unknown> = { ...RD_DEF, ...fieldsOf(R.all) };
    // defaults that fit the kind: manga right to left page by page; manhwa one long scroll at a readable width
    if (k === "manga") Object.assign(base, { rtl: true, mode: "paged" });
    if (k === "manhwa") Object.assign(base, { mode: "scroll", fit: "width" });
    const legacy = {
        ...(R.mode ? { mode: R.mode } : {}),
        ...(R.rtl != null ? { rtl: R.rtl } : {}),
        ...(R.fit ? { fit: R.fit } : {}),
    }; // choices saved before they were per kind
    return asPrefs({ ...base, ...legacy, ...fieldsOf(R[k]) });
};
export function rdSet(patch: Record<string, unknown>) {
    const R = fieldsOf(meta.settings.reader),
        k = rdKind();
    meta.settings.reader = { ...R, [k]: { ...fieldsOf(R[k]), ...patch } };
    markDirty();
}
const readPosKey = () => "ul-read-" + (RD.item || "x");
// where you were in this entry's file, kept in this browser
const loadReadPos = (): Record<string, unknown> => {
    try {
        return fieldsOf(safeJSON(localStorage.getItem(readPosKey()) || "null"));
    } catch (_) {
        return {};
    }
};
const saveReadPos = () => {
    try {
        localStorage.setItem(readPosKey(), JSON.stringify({ f: fname(RD.files[RD.fi]), i: RD.idx, c: RD.ci }));
    } catch (_) {}
};
// the pages shown together right now: one, or two side by side (the cover on its own if you like)
function rdSpread(i: number): number[] {
    const o = RS(),
        n = (RD.pages || []).length;
    if (RD.mode !== "paged" || o.spread === "single" || (o.spread === "auto" && innerWidth < innerHeight * 1.1))
        return [i];
    const start = o.coverAlone ? (i === 0 ? 0 : i - ((i - 1) % 2)) : i - (i % 2);
    return start === 0 && o.coverAlone ? [0] : [start, start + 1].filter(x => x < n);
}
function rdBookCSS(o: ReaderPrefs) {
    const [bg, fg] = ownOf(RD_THEMES, o.theme) || RD_THEMES.dark;
    return `<style>html{background:${bg}}body{background:${bg}!important;color:${fg}!important;font-family:${ownOf(RD_FONTS, o.font) || RD_FONTS.serif}!important;font-size:${o.size}px!important;line-height:${o.line}!important;max-width:${o.measure}px;margin:0 auto!important;padding:48px 24px 96px!important;${o.justify ? "text-align:justify;hyphens:auto;" : ""}}p,div,span,li{font-family:inherit!important;line-height:inherit!important}a{color:inherit}img,svg{max-width:100%!important;height:auto!important}</style>`;
}
const KIND_WORD: Record<string, string> = {
    manga: "manga",
    manhwa: "manhwa",
    comic: "comics",
    images: "pictures",
    book: "books",
};
const KIND_ALL: Record<string, string> = {
    manga: "manga",
    manhwa: "manhwa",
    comic: "comics",
    images: "picture files",
    book: "books",
};
/** the reader's settings (reader/ReaderOpts.svelte), for what's open: which apply, and their values */
export function readerOptsView() {
    const o = RS(),
        k = rdKind();
    return {
        o,
        word: ownOf(KIND_WORD, k) || "",
        all: ownOf(KIND_ALL, k) || "",
        pics: RD.kind === "images",
        book: RD.kind === "epub",
        paged: RD.mode === "paged",
        bgs: Object.keys(RD_BG).map((x): [string, string] => [x, x[0].toUpperCase() + x.slice(1)]),
    };
}
// the reader's component (reader/Reader.svelte), as main.ts hands it over (watch-read/surfaces.ts): this module doesn't
// import it, as it imports this
let readerUI: { show: () => void; hide: () => void } | null = null;
export function useSvelteReader(ui: { show: () => void; hide: () => void }) {
    readerUI = ui;
}
/** what the reader shows now (reader/Reader.svelte): the top bar, the stage for this kind of thing, the chapter bar,
 *  the progress bar; worked out when it's asked to draw (renderReader), never as you scroll */
export function readerView() {
    const pages = RD.pages,
        chapters = RD.chapters;
    if (!pages && !chapters) return null;
    const o = RS(),
        f: ReadFile = RD.files[RD.fi] || { ch: null },
        n = (pages || chapters || []).length,
        it = RD.item ? items.get(RD.item) : undefined,
        at = RD.kind === "epub" ? RD.ci : RD.idx,
        shown = RD.kind === "images" && RD.mode === "paged" ? rdSpread(RD.idx) : [RD.idx],
        unit = it ? unitOf(it)[0] : "chapter";
    let doc = "";
    if (RD.kind === "epub") {
        const html = (chapters || [])[RD.ci] || "",
            css = rdBookCSS(o);
        // the reader's own look goes right after the chapter's rule, before the book's styles, as it always has
        doc = html.includes(EPUB_CSP)
            ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, m => m + css)
            : /<head[^>]*>/i.test(html)
              ? html.replace(/<head[^>]*>/i, m => m + css)
              : css + html;
    }
    return {
        o,
        kind: RD.kind,
        mode: RD.mode || "paged",
        rtl: !!RD.rtl,
        n,
        shown: RD.rtl ? [...shown].reverse() : shown,
        two: shown.length > 1,
        pages: pages || [],
        doc,
        title: `${it ? cleanTitle(titleOf(it)) : fname(f)}${f.ch != null ? " · " + unit + " " + f.ch : ""}`,
        cls: "cin rd-" + (RD.kind === "epub" ? "book" : RD.mode) + (o.hideUI === false ? "" : " autohide"),
        bg: RD.kind === "epub" ? (ownOf(RD_THEMES, o.theme) || RD_THEMES.dark)[0] : ownOf(RD_BG, o.bg) || "#000",
        bright: (o.bright / 100).toFixed(2),
        log:
            it && (RD.kind === "pdf" || RD.kind === "epub")
                ? { unit: unitOf(it)[0], prog: String(it.prog || "") }
                : null,
        ci: RD.ci,
        at,
        idx: RD.idx,
        opts: !!RD.opts,
        tap: !!o.tapNext,
        fit: o.fit,
        finished: `Finished ${f.ch != null ? "chapter " + f.ch : "this"}`,
        nextFile: !!RD.files[RD.fi + 1],
    };
}
export type ReaderView = NonNullable<ReturnType<typeof readerView>>;
/** where you are, which moves as you scroll a long strip without the reader drawing again: the words beside the
 *  zoom, the progress bar, and whether auto-scroll is on */
export function readerAtView() {
    const n = (RD.pages || RD.chapters || []).length,
        at = RD.kind === "epub" ? RD.ci : RD.idx,
        shown = RD.kind === "images" && RD.mode === "paged" ? rdSpread(RD.idx) : [RD.idx],
        last = shown[shown.length - 1];
    return {
        at,
        word:
            RD.kind === "pdf"
                ? ""
                : RD.kind === "epub"
                  ? `Chapter ${at + 1} of ${n}`
                  : shown.length > 1
                    ? `Pages ${shown[0] + 1}–${last + 1} of ${n}`
                    : `Page ${at + 1} of ${n}`,
        bar: (((at + shown.length) / n) * 100).toFixed(1) + "%",
        auto: !!RD.auto,
        ar: RD.ar || "",
    };
}
/** draws the reader (opening it if it isn't), or closes it when nothing is open; your place is saved, the next pages
 *  are fetched before you get to them, and reaching the last page logs it */
export function renderReader() {
    const pages = RD.pages,
        chapters = RD.chapters;
    if (!pages && !chapters) {
        readerUI?.hide();
        document.body.classList.remove("cinema-on");
        rdAuto(false);
        return;
    }
    document.body.classList.add("cinema-on");
    const o = RS();
    RD.mode = RD.kind === "images" ? o.mode || "paged" : RD.mode;
    RD.rtl = o.rtl != null ? o.rtl : false;
    // the news first, so a reader drawn for the first time draws this
    stageChanged("reader", "rdlive");
    readerUI?.show();
    saveReadPos();
    const n = (pages || chapters || []).length,
        shown = RD.kind === "images" && RD.mode === "paged" ? rdSpread(RD.idx) : [RD.idx],
        last = shown[shown.length - 1];
    // a long strip: back to the page you were on
    const st = $<HTMLElement>("#reader .rdstage");
    if (st && RD.kind === "images" && RD.mode === "scroll") {
        const pg = $<HTMLElement>(`#reader .rdscroll img[data-pg="${RD.idx}"]`),
            to = RD.idx;
        // the strip stays the same element from one draw to the next (it was drawn afresh as HTML), so a place set
        // again before the next frame (Home, another chapter opened at its start) wins over the one this draw had
        if (pg && to)
            requestAnimationFrame(() => {
                if (RD.idx === to && pg.isConnected) st.scrollTop = pg.offsetTop - 60;
            });
        if (RD.auto) rdAuto(true);
    }
    // the next pages, fetched before you get there
    if (RD.kind === "images" && pages)
        for (let k = 1; k <= o.preload; k++) {
            const nx = pages[last + k];
            if (nx) {
                const im = new Image();
                im.src = nx;
            }
        }
    if (RD.kind === "images" && RD.mode === "paged" && last >= n - 1) rdReachedEnd();
}
/** a page of a long strip has arrived: it takes its own shape, and the first one gives its shape to those still on
 *  their way (so only the pages near you load, not the whole chapter at once) */
export function rdPageIn(im: EventTarget) {
    if (!(im instanceof HTMLImageElement) || !im.naturalWidth) return;
    im.dataset.ok = "1";
    if (!RD.ar) {
        RD.ar = im.naturalWidth + " / " + im.naturalHeight;
        stageChanged("rdlive");
    }
}
/** a long strip's scrolling (reader/Reader.svelte attaches it to the stage): which page you're on is the one across the
 *  upper third of the screen, kept as your place; the end only counts once there's something to scroll and the last
 *  page is really there. A page that hasn't loaded keeps a page's shape, so it counts where it stands: in a long
 *  chapter the pages you skip past never load, and stopping at the first of those left you "on" it however far you went */
export function rdTrack(st: HTMLElement): () => void {
    let tick = 0;
    const track = () => {
        if (tick) return;
        tick = requestAnimationFrame(() => {
            tick = 0;
            const top = st.getBoundingClientRect().top + st.clientHeight / 3;
            let cur = RD.idx;
            for (const im of st.querySelectorAll<HTMLElement>(".rdscroll img")) {
                const r = im.getBoundingClientRect();
                if (r.top <= top) cur = Number(im.dataset.pg);
                else break;
            }
            if (cur !== RD.idx) {
                RD.idx = cur;
                saveReadPos();
                stageChanged("rdlive");
            }
            if (
                st.scrollHeight > st.clientHeight * 1.5 &&
                rdLastIn(st) &&
                st.scrollTop + st.clientHeight >= st.scrollHeight - 80
            )
                rdReachedEnd();
        });
    };
    st.addEventListener("scroll", track, { passive: true });
    return () => {
        st.removeEventListener("scroll", track);
        if (tick) cancelAnimationFrame(tick);
    };
}
// the end of a long strip is only the end once the last page is really there (a redraw briefly shows them all as
// empty pages); the ones in between needn't have loaded, as jumping to the end skips them
const rdLastIn = (st: Element) => {
    const L = st.querySelectorAll<HTMLImageElement>(".rdscroll img"),
        im = L[L.length - 1];
    return !!im && im.complete && !!im.naturalHeight;
};
// how far finishing this file takes you: its own chapter number, or one more than you'd read
const progAfter = (f: ReadFile, prog: number) => (f.ch != null ? Math.max(prog, f.ch) : prog + 1);
// reaching the last page logs the chapter (once), with Undo; the Finished button still works
function rdReachedEnd() {
    const f = RD.files[RD.fi],
        id = RD.item,
        it = id ? items.get(id) : undefined;
    if (!RS().autoLog || RD.logged === RD.fi + ":" + fname(f)) return;
    if (!f || !id || !it) return;
    RD.logged = RD.fi + ":" + fname(f);
    const to = progAfter(f, it.prog || 0);
    if (to === (it.prog || 0)) return;
    logProgress(id, to);
    toast(`Logged ${(unitOf(it)[0] || "chapter").toLowerCase()} ${to}`, { label: "Undo", fn: undo });
}
// auto-scroll for long strips: steady, pauses while you hold the mouse down, stops at the end
function rdAuto(on: boolean) {
    if (RD.autoRaf) cancelAnimationFrame(RD.autoRaf);
    RD.auto = on;
    if (!on) return;
    let last = performance.now();
    const step = (t: number) => {
        const st = $("#reader .rdstage");
        if (!st || !RD.auto) {
            RD.auto = false;
            return;
        }
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        if (!RD.hold) st.scrollTop += RS().scrollSpeed * dt;
        // the end: only once the last page is in (a redraw briefly empties them, which must not count as the end)
        if (st.scrollTop + st.clientHeight >= st.scrollHeight - 2 && rdLastIn(st)) {
            RD.auto = false;
            stageChanged("rdlive");
            return;
        }
        RD.autoRaf = requestAnimationFrame(step);
    };
    RD.autoRaf = requestAnimationFrame(step);
}
export function readStep(d: number) {
    if (RD.kind === "epub") {
        const n = (RD.chapters || []).length;
        if (RD.ci + d >= n) return readDone();
        RD.ci = Math.max(0, RD.ci + d);
        renderReader();
        return;
    }
    if (!RD.pages || RD.kind === "pdf") return;
    const n = RD.pages.length;
    if (RD.mode === "scroll") {
        const st = $("#reader .rdstage");
        if (st) st.scrollBy({ top: d * st.clientHeight * 0.85, behavior: "smooth" });
        return;
    }
    const shown = rdSpread(RD.idx),
        next = d > 0 ? shown[shown.length - 1] + 1 : Math.max(0, rdSpread(Math.max(0, shown[0] - 1))[0]);
    if (d > 0 && next >= n) return readDone();
    RD.idx = Math.max(0, Math.min(n - 1, next));
    renderReader();
}
/** finished this file: logged, and on to the next one, or the reader closes */
export function readDone() {
    const f = RD.files[RD.fi],
        id = RD.item,
        it = id ? items.get(id) : undefined;
    if (f && id && it && RD.logged !== RD.fi + ":" + fname(f)) logProgress(id, progAfter(f, it.prog || 0));
    try {
        localStorage.removeItem(readPosKey());
    } catch (_) {}
    if (RD.files[RD.fi + 1]) return readStart(RD.fi + 1);
    readerDrop();
    renderReader();
    if (ui.page === "read") renderMain();
    toast("That's the last one here.");
}
/** the reader full screen, or back */
export function readerFull() {
    const r = $("#reader");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (r && r.requestFullscreen) r.requestFullscreen().catch(() => {});
}
/** ✕: the book closes, and its pages are let go */
export function readerClose() {
    readerDrop();
    renderReader();
    renderMain();
}
/** one of the reader's choices, from its settings: kept for this kind of thing, and drawn */
export function readerSet(k: string, v: string) {
    const cur = ownOf<unknown>(RS(), k);
    rdSet({ [k]: v === "true" ? true : v === "false" ? false : typeof cur === "number" ? Number(v) : v });
    if (k === "mode") rdAuto(false);
    renderReader();
}
/** a tick in the reader's settings */
export function readerTick(k: string, on: boolean) {
    rdSet({ [k]: on });
    renderReader();
}
// a slider in the reader's settings: kept as you drag it, drawn a moment after you stop
let rangeT: ReturnType<typeof setTimeout> | undefined;
export function readerRange(k: string, v: number) {
    rdSet({ [k]: v });
    clearTimeout(rangeT);
    rangeT = setTimeout(renderReader, 120);
}
/** ⚙: the reader's settings, open or shut */
export function readerOptsToggle() {
    RD.opts = !RD.opts;
    renderReader();
}
/** − and +: zoom, 50 to 300% */
export function readerZoom(d: number) {
    rdSet({ zoom: Math.max(50, Math.min(300, RS().zoom + 10 * d)) });
    renderReader();
}
/** ▶ Auto-scroll, on or off */
export function readerAuto() {
    rdAuto(!RD.auto);
    stageChanged("rdlive");
}
/** a click on the progress bar: that far through (from the right when reading right to left) */
export function readerSeek(e: MouseEvent, bar: HTMLElement) {
    if (RD.kind === "pdf" || !(RD.pages || RD.chapters)) return;
    const r = bar.getBoundingClientRect(),
        x = (e.clientX - r.left) / r.width,
        frac = bar.classList.contains("rtl") ? 1 - x : x,
        n = (RD.kind === "epub" ? RD.chapters : RD.pages)?.length || 0,
        to = Math.max(0, Math.min(n - 1, Math.floor(frac * n)));
    if (RD.kind === "epub") RD.ci = to;
    else RD.idx = to;
    renderReader();
    if (RD.mode === "scroll") {
        const pg = $<HTMLElement>(`#reader .rdscroll img[data-pg="${to}"]`),
            st = $("#reader .rdstage");
        if (pg && st) st.scrollTop = pg.offsetTop - 60;
    }
}
/** the chapter or page number typed in for a book: logged */
export function readerLog(v: string) {
    const x = parseFloat(v);
    if (RD.item && Number.isFinite(x)) logProgress(RD.item, x);
}
/** holding the mouse down on the page pauses auto-scroll */
export function readerHold(on: boolean) {
    RD.hold = on;
}
/** the reader's keys (reader/Reader.svelte listens): ← → pages (the other way round reading right to left), ↑ ↓ in a
 *  strip, space and shift-space, Home and End, + and − zoom, D two pages, A auto-scroll, F full screen, Escape (the
 *  settings first, then the reader). True when the key was one of these */
export function readerKey(e: KeyboardEvent): boolean {
    if (!$("#reader") || ui.modal || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) return false;
    const k = e.key,
        paged = RD.mode === "paged" && RD.kind === "images",
        o = RS();
    if (k === "Escape") {
        if (RD.opts) {
            RD.opts = false;
            renderReader();
        } else {
            readerDrop();
            renderReader();
        }
    } else if (k === "ArrowRight") readStep(RD.rtl && paged ? -1 : 1);
    else if (k === "ArrowLeft") readStep(RD.rtl && paged ? 1 : -1);
    else if ((k === "ArrowDown" || k === "ArrowUp") && RD.mode === "scroll" && RD.kind === "images") {
        const st = $("#reader .rdstage");
        if (st) st.scrollBy({ top: (k === "ArrowDown" ? 1 : -1) * 120 });
    } else if (k === " " || k === "PageDown") readStep(e.shiftKey ? -1 : 1);
    else if (k === "PageUp") readStep(-1);
    else if (k === "Home" && RD.pages) {
        RD.idx = 0;
        renderReader();
        if (RD.mode === "scroll") {
            const st = $("#reader .rdstage");
            if (st) st.scrollTop = 0;
        }
    } else if (k === "End" && RD.pages) {
        RD.idx = RD.pages.length - 1;
        renderReader();
        if (RD.mode === "scroll") {
            const st = $("#reader .rdstage");
            if (st) st.scrollTop = st.scrollHeight;
        }
    } else if ((k === "+" || k === "=") && RD.kind === "images") {
        rdSet({ zoom: Math.min(300, o.zoom + 10) });
        renderReader();
    } else if ((k === "-" || k === "_") && RD.kind === "images") {
        rdSet({ zoom: Math.max(50, o.zoom - 10) });
        renderReader();
    } else if (k.toLowerCase() === "d" && paged) {
        rdSet({ spread: o.spread === "single" ? "double" : "single" });
        renderReader();
    } else if (k.toLowerCase() === "a" && RD.mode === "scroll" && RD.kind === "images") readerAuto();
    else if (k.toLowerCase() === "f") readerFull();
    else return false;
    return true;
}
