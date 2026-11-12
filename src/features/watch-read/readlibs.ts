// src/features/watch-read/readlibs.ts
// ─────────────────────────────────────────────────────────────────
//  Reading servers: Komga, Kavita, any OPDS catalogue (Calibre-web and others), or a shared folder of your own files
//
//  Your manga, manhwa, manhua and books are matched to your library by name; chapters and volumes come straight from
//  the server, nothing is copied here. A catalogue's pages and what an extension offers are someone else's data: every
//  field is checked, and a page count is held to what a book could have.
// ─────────────────────────────────────────────────────────────────

import {
    cleanTitle,
    fieldsOf,
    isRecord,
    items,
    markDirty,
    meta,
    plural,
    sleep,
    titleOf,
    toList,
    ui,
    unitOf,
} from "../core/core";
import { renderMain } from "../core/shell";
import {
    FD,
    IMG_EXT,
    libBase,
    libById,
    libKey,
    libReach,
    READ_EXT,
    serversIn,
    titleScore,
    typeName,
} from "./medialibs";
import type { FolderIndex } from "./medialibs";
import { RD, readerURL, readStart, renderReader } from "./read";
import { EXT, extCall, extGet } from "../extensions/extensions";
import type { Item, MediaServer, ServerPick } from "../core/model";

/** your reading servers that are on */
export const RLIBS = () => serversIn("rlibs").filter(l => l.on !== false && l.url);
const OPNS = { pse: "http://vaemendis.net/opds-pse/ns" };
// the most pages one chapter or book is taken to have: a catalogue that says more is wrong (or hostile), and every page
// gets an address up front
export const MAX_PAGES = 5000;
const chapNum = (t: unknown): number | null => {
    const s = String(t || "");
    const m =
        /(?:ch(?:apter)?\.?|chap\.?|\bc|#|episode|ep\.?)\s*(\d+(?:\.\d+)?)/i.exec(s) ||
        /(?:vol(?:ume)?\.?|\bv)\s*(\d+(?:\.\d+)?)/i.exec(s) ||
        /(\d+(?:\.\d+)?)(?!.*\d)/.exec(s.replace(/\.\w{2,4}$/, "").replace(/\b(19|20)\d\d\b/g, ""));
    return m ? parseFloat(m[1]) : null;
};
/** a file to download and read (a CBZ, an EPUB, a PDF), and its type */
interface Acquisition {
    href: string;
    type: string;
}
/** a book streamed page by page (OPDS-PSE): its page address, with {pageNumber} in it, and how many pages */
interface PageStream {
    href: string;
    count: number;
}
/** something a catalogue lists: a series to open (nav), or a chapter or book to read */
interface Found {
    title: string;
    nav: string | null;
    acq?: Acquisition[];
    pse?: PageStream | null;
    thumb?: string;
    num?: number | null;
    n?: number; // a folder's files
}
/** an OPDS page: its entries, the next page, and how to search */
interface OpdsFeed {
    title: string;
    entries: (Found & { acq: Acquisition[] })[];
    next: string | null;
    search: { href: string; type: string } | null;
}
/** a chapter or volume to read: on one of your servers, or offered by an extension */
export interface Chapter {
    name: string;
    ch: number | null;
    vol?: number | null;
    pse?: PageStream | null;
    file?: Acquisition | null;
    pages?: string[];
    thumb?: string;
    lib?: MediaServer; // the server it's on (an extension's chapters name the extension)
    ext?: boolean;
    from?: string;
}
// ── OPDS: one reader for Komga, Kavita, Calibre-web and every other catalogue ──
export const OP = {
    root(l: MediaServer) {
        const b = libBase(l);
        return l.type === "kavita"
            ? `${b}/api/opds/${encodeURIComponent(libKey(l))}`
            : l.type === "komga"
              ? `${b}/opds/v1.2/catalog`
              : String(l.url).trim();
    },
    headers(l: MediaServer): Record<string, string> {
        const k = libKey(l);
        if (!k || l.type === "kavita") return {};
        if (k.includes(":")) return { Authorization: "Basic " + btoa(unescape(encodeURIComponent(k))) };
        return l.type === "komga" ? { "X-API-Key": k } : {};
    },
    needsAuth: (l: MediaServer) => Object.keys(OP.headers(l)).length > 0,
    async get(l: MediaServer, url: string): Promise<OpdsFeed> {
        const r = await fetch(url, {
            headers: { Accept: "application/atom+xml, application/xml, text/xml, */*", ...OP.headers(l) },
        });
        if (!r.ok) throw new Error("http " + r.status);
        const x = new DOMParser().parseFromString(await r.text(), "application/xml");
        if (x.querySelector("parsererror")) throw new Error("http 404");
        return OP.parse(x, r.url || url);
    },
    parse(x: Document, base: string): OpdsFeed {
        const abs = (h: string | null) => {
                try {
                    return new URL(String(h), base).href;
                } catch (_) {
                    return String(h);
                }
            },
            link = (n: Element, rel: (r: string, type: string) => boolean) =>
                [...n.children]
                    .filter(c => c.localName === "link")
                    .find(c => rel(c.getAttribute("rel") || "", c.getAttribute("type") || ""));
        const entries = [...x.getElementsByTagNameNS("*", "entry")].map(en => {
            const L = [...en.children].filter(c => c.localName === "link"),
                title = (en.getElementsByTagNameNS("*", "title")[0]?.textContent || "").trim();
            const nav =
                L.find(
                    c =>
                        /kind=navigation|profile=opds-catalog/.test(c.getAttribute("type") || "") &&
                        !/acquisition/.test(c.getAttribute("rel") || "")
                ) || L.find(c => /subsection|collection/.test(c.getAttribute("rel") || ""));
            const acq = L.filter(c => /opds-spec\.org\/acquisition/.test(c.getAttribute("rel") || "")).map(c => ({
                href: abs(c.getAttribute("href")),
                type: c.getAttribute("type") || "",
            }));
            const ps = L.find(c => /opds-pse\/stream/.test(c.getAttribute("rel") || ""));
            const th = L.find(c => /opds-spec\.org\/image(\/thumbnail)?$/.test(c.getAttribute("rel") || ""));
            const count = Math.floor(
                Number(ps?.getAttributeNS(OPNS.pse, "count") || ps?.getAttribute("pse:count") || 0)
            );
            return {
                title,
                nav: nav && !acq.length ? abs(nav.getAttribute("href")) : null,
                acq,
                pse: ps
                    ? { href: abs(ps.getAttribute("href")), count: count > 0 ? Math.min(count, MAX_PAGES) : 0 }
                    : null,
                thumb: th ? abs(th.getAttribute("href")) : "",
                num: chapNum(title),
            };
        });
        const top = x.documentElement,
            nx = link(top, r => r === "next"),
            sr = link(top, r => r === "search");
        return {
            title: (top.getElementsByTagNameNS("*", "title")[0]?.textContent || "").trim(),
            entries,
            next: nx ? abs(nx.getAttribute("href")) : null,
            search: sr ? { href: abs(sr.getAttribute("href")), type: sr.getAttribute("type") || "" } : null,
        };
    },
    async test(l: MediaServer) {
        const f = await OP.get(l, OP.root(l));
        return f.title || "Connected";
    },
    async all(l: MediaServer, url: string, max = 30) {
        const out: OpdsFeed["entries"] = [];
        let u: string | null = url,
            n = 0;
        while (u && n++ < max) {
            const f: OpdsFeed = await OP.get(l, u);
            out.push(...f.entries);
            u = f.next;
        }
        return out;
    },
    async search(l: MediaServer, q: string): Promise<Found[]> {
        const root = await OP.get(l, OP.root(l));
        let tpl: string | null = null;
        if (root.search) {
            if (/opensearchdescription/.test(root.search.type)) {
                try {
                    const r = await fetch(root.search.href, { headers: OP.headers(l) });
                    const d = new DOMParser().parseFromString(await r.text(), "application/xml");
                    const u =
                        [...d.getElementsByTagNameNS("*", "Url")].find(x =>
                            /atom/.test(x.getAttribute("type") || "")
                        ) || d.getElementsByTagNameNS("*", "Url")[0];
                    if (u) tpl = new URL(String(u.getAttribute("template")), root.search.href).href;
                } catch (_) {}
            } else tpl = root.search.href;
        }
        if (tpl)
            return (
                await OP.get(
                    l,
                    tpl
                        .replace(/\{searchTerms\??\}|%7BsearchTerms(?:%3F)?%7D/gi, encodeURIComponent(q))
                        .replace(/\{[^}]+\?\}|%7B[^%]+%3F%7D/gi, "")
                )
            ).entries;
        // no search: walk the catalogue a little way down
        const seen = new Set<string>(),
            found: Found[] = [],
            queue = root.entries.flatMap(e => (e.nav ? [e.nav] : []));
        let n = 0;
        found.push(...root.entries);
        while (queue.length && n++ < 40) {
            const u = queue.shift() ?? "";
            if (seen.has(u)) continue;
            seen.add(u);
            try {
                const f = await OP.get(l, u);
                found.push(...f.entries);
                for (const e of f.entries) if (e.nav) queue.push(e.nav);
            } catch (_) {}
        }
        return found.filter(e => titleScore(e.title, q) > 0.4);
    },
    // the chapters or volumes of one series
    async chapters(l: MediaServer, ref: string): Promise<Chapter[]> {
        const E = await OP.all(l, ref);
        return E.filter(e => e.acq.length || e.pse).map(e => ({
            name: e.title,
            ch: e.num ?? null,
            pse: e.pse,
            file: pickAcq(e.acq),
            thumb: e.thumb,
        }));
    },
};
const pickAcq = (A: Acquisition[] | undefined): Acquisition | null =>
    (A || []).find(a => /cbz|comicbook\+zip|zip/.test(a.type)) ||
    (A || []).find(a => /epub/.test(a.type)) ||
    (A || []).find(a => /pdf/.test(a.type)) ||
    (A || [])[0] ||
    null;
// ── a shared folder of your own files ──
interface FolderSeries {
    ref: string;
    title: string;
    items: Chapter[];
}
const RFD = {
    test: (l: MediaServer) => FD.test(l),
    series(idx: FolderIndex): FolderSeries[] {
        const S = new Map<string, FolderSeries>(),
            add = (dir: string, ent: Chapter) => {
                const key =
                    dir ||
                    ent.name.replace(/[\s._-]*(?:v(?:ol)?|ch(?:apter)?|c|#)?[\s._-]*\d+(?:\.\d+)?.*$/i, "").trim();
                const s = S.get(key) || {
                    ref: "s:" + key,
                    title: (key.split("/").pop() || key)
                        .replace(/[._]+/g, " ")
                        .replace(/\[[^\]]*\]/g, "")
                        .trim(),
                    items: [],
                };
                S.set(key, s);
                s.items.push(ent);
            };
        const imgDirs = new Map<string, string[]>();
        for (const f of idx.files) {
            const parts = f.split("/"),
                name = parts.pop() || "",
                dir = parts.join("/");
            if (READ_EXT.test(name))
                add(dir, {
                    name: name.replace(READ_EXT, ""),
                    ch: chapNum(name),
                    file: { href: FD.url(idx, f), type: (name.split(".").pop() || "").toLowerCase() },
                });
            else if (IMG_EXT.test(name)) imgDirs.set(dir, [...(imgDirs.get(dir) || []), f]);
        }
        for (const [dir, F] of imgDirs) {
            const parts = dir.split("/"),
                ch = parts.pop() || "";
            add(parts.join("/"), {
                name: ch,
                ch: chapNum(ch),
                pages: F.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(f => FD.url(idx, f)),
            });
        }
        return [...S.values()].map(s => ({
            ...s,
            items: s.items.sort(
                (a, b) => (a.ch ?? 1e9) - (b.ch ?? 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true })
            ),
        }));
    },
    async search(l: MediaServer, q: string): Promise<Found[]> {
        const idx = await FD.crawl(l);
        return RFD.series(idx)
            .map(s => ({ title: s.title, nav: s.ref, sc: titleScore(s.title, q) }))
            .filter(s => s.sc > 0.4)
            .sort((a, b) => b.sc - a.sc);
    },
    async chapters(l: MediaServer, ref: string): Promise<Chapter[]> {
        const idx = await FD.crawl(l);
        const s = RFD.series(idx).find(x => x.ref === ref);
        return s ? s.items.map(e => ({ name: e.name, ch: e.ch, pages: e.pages, file: e.file })) : [];
    },
    async browse(l: MediaServer): Promise<Found[]> {
        const idx = await FD.crawl(l);
        return RFD.series(idx)
            .map(s => ({ title: s.title, nav: s.ref, n: s.items.length }))
            .sort((a, b) => a.title.localeCompare(b.title));
    },
};
const RAPI = (l: MediaServer) => (l.type === "folder" ? RFD : OP);
// ── matching a library item to your servers ──
export const RLS: { item: string | null; list: Chapter[]; note: string; busy: boolean; miss: boolean } = {
    item: null,
    list: [],
    note: "",
    busy: false,
    miss: false,
};
// the series you picked on a server for an entry (meta.readMap), as it was kept
const pickedRef = (x: unknown) => (isRecord(x) && typeof x.ref === "string" ? x.ref : "");
// a chapter or volume number an extension gave (as a number or as text), or null
const numberOr = (x: unknown) => (x !== null && Number.isFinite(Number(x)) ? Number(x) : null);
const web = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u);
let matching = 0; // each match is numbered: opening another book (or this one again) makes an older one stop
export async function readMatch(id: string) {
    const libs = RLIBS(),
        it = items.get(id),
        exts = readExts(),
        run = ++matching;
    Object.assign(RLS, { item: id, list: [], note: "", miss: false });
    if ((!libs.length && !exts.length) || !it) return;
    // another book was opened meanwhile (or this one again): what's still arriving isn't for the page now
    const gone = () => run !== matching || RLS.item !== id;
    RLS.busy = true;
    RLS.note = libs.length ? "Looking on your servers…" : "Looking through your extensions…";
    if (ui.page === "read") renderMain();
    const maps = fieldsOf(meta.readMap?.[id]),
        names = [
            ...new Set([
                cleanTitle(titleOf(it)),
                cleanTitle(it.title),
                ...Object.values(it.alt || {})
                    .filter((t): t is string => !!t)
                    .map(cleanTitle),
            ]),
        ],
        list: Chapter[] = [],
        errs: string[] = [];
    for (const l of libs) {
        try {
            let ref = pickedRef(maps[l.id]);
            if (!ref) {
                let best: { e: Found; sc: number } | null = null;
                for (const q of names) {
                    for (const e of await RAPI(l).search(l, q)) {
                        if (!e.nav && !(e.acq || []).length) continue;
                        const sc = Math.max(...names.map(n => titleScore(e.title, n)));
                        if (!best || sc > best.sc) best = { e, sc };
                    }
                    if (gone()) return;
                    if (best && best.sc >= 0.8) break;
                }
                if (best && best.sc >= 0.55) ref = best.e.nav || "";
                if (!ref && best && best.e.acq && best.e.acq.length && best.sc >= 0.8) {
                    list.push({
                        lib: l,
                        name: best.e.title,
                        ch: best.e.num ?? null,
                        file: pickAcq(best.e.acq),
                        pse: best.e.pse,
                    });
                    continue;
                }
            }
            if (!ref) continue;
            const got = await RAPI(l).chapters(l, ref);
            if (gone()) return;
            for (const c of got) list.push({ lib: l, ...c });
        } catch (e) {
            if (gone()) return;
            errs.push(libReach(e, l));
        }
    }
    // extensions that offer chapters (your own files on another machine, say): asked in turn, with every name the title goes by
    for (const id2 of exts) {
        const x = extGet(id2);
        if (!x) continue;
        try {
            const all = [
                ...new Set(
                    Object.values((x.data || {}).series || {})
                        .flat()
                        .map(s => s && s.value)
                        .filter(Boolean)
                ),
            ];
            const r = await extCall(
                id2,
                "read.sources",
                [
                    {
                        title: names[0],
                        alt: names.slice(1),
                        medium: it.medium,
                        ids: { ...(it.ext || {}) },
                        servers: { all },
                    },
                ],
                60000
            );
            if (gone()) return;
            for (const c of toList<unknown>(r || []))
                if (isRecord(c) && (web(c.url) || (Array.isArray(c.pages) && c.pages.some(web))))
                    list.push({
                        lib: { id: "ext:" + id2, type: "extension", name: x.manifest.name },
                        ext: true,
                        name: String(c.name || "Chapter").slice(0, 120),
                        ch: numberOr(c.ch),
                        vol: numberOr(c.vol),
                        file: web(c.url) ? { href: c.url, type: String(c.type || "cbz").toLowerCase() } : null,
                        pages: Array.isArray(c.pages) ? c.pages.filter(web).slice(0, MAX_PAGES) : undefined,
                        from: c.from ? String(c.from).slice(0, 40) : "",
                    });
        } catch (_) {
            if (gone()) return;
            errs.push(`${x.manifest.name} didn't answer`);
        }
    }
    if (gone()) return;
    list.sort((a, b) => (a.ch ?? 1e9) - (b.ch ?? 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    RLS.list = list;
    RLS.busy = false;
    RLS.miss = !list.length;
    RLS.note = list.length
        ? `On ${[...new Set(list.map(x => x.lib?.name || typeName(x.lib?.type || "")))].join(" and ")}: ${plural(list.length, (unitOf(it)[0] || "chapter").toLowerCase())}`
        : errs[0] || "Not found on your servers.";
    if (ui.page === "read") renderMain();
}
// extensions switched on that offer chapters
const readExts = () => [...EXT.frames.entries()].filter(([, F]) => F.jobs.has("read.sources")).map(([id]) => id);
/** a chapter's line: its pages, or the kind of file it is, and the server it's on */
const chapterMeta = (c: Chapter) =>
    [
        c.pse
            ? plural(c.pse.count, "page")
            : c.pages
              ? plural(c.pages.length, "page")
              : c.file
                ? (c.file.type.split(/[/+]/).pop() || "file").toUpperCase()
                : "",
        c.lib?.name,
    ]
        .filter(Boolean)
        .join(" · ");
/** "On your servers" for the book or series open on the Read page (page/ReadServerList.svelte): what was found, the
 *  next one to read, and picking by hand; or, with no servers, where to add one */
export function readServerListView(it: Item) {
    if (!RLIBS().length && !readExts().length) return null;
    const prog = it.prog || 0,
        unit = unitOf(it)[0] || "Chapter",
        nx = RLS.list.findIndex(x => x.ch == null || x.ch > prog),
        next = RLS.list[nx];
    return {
        note: RLS.note,
        pickLabel: RLIBS().length ? (RLS.miss ? "Pick it…" : "Not the right one?") : "",
        picking: !!ui.rlPick,
        next: next
            ? { i: nx, label: `${prog ? "Continue" : "Start"}: ${next.ch != null ? unit + " " + next.ch : next.name}` }
            : null,
        rows: RLS.list.map((c, i) => {
            const seen = c.ch != null && c.ch <= prog;
            return { i, seen, thumb: c.thumb || "", n: String(c.ch ?? "•"), name: c.name, meta: chapterMeta(c) };
        }),
    };
}
/** a chapter found on your servers, opened in the reader (with the others, to go on to) */
export const readFound = (i: number) => readRemote(RLS.list, i);
/** "Not the right one?": the series on your reading servers with that name, to pick from by hand */
export async function readPickOpen(q?: string) {
    const it = RD.item ? items.get(RD.item) : undefined;
    const P: ServerPick = { q: q || (it ? cleanTitle(titleOf(it)) : ""), busy: true, res: [] };
    ui.rlPick = P;
    renderMain();
    for (const l of RLIBS()) {
        try {
            for (const e of await RAPI(l).search(l, P.q))
                if (e.nav) P.res.push({ lib: l.id, libName: l.name || "", title: e.title, ref: e.nav, thumb: e.thumb });
        } catch (_) {}
    }
    P.busy = false;
    renderMain();
}
/** the series picked by hand (page/ReadServerList.svelte's panel): what was searched, and what was found */
export function readPickView() {
    const P = ui.rlPick;
    return P
        ? {
              q: P.q,
              busy: P.busy,
              res: P.res.map((r, i) => ({ i, title: r.title, lib: r.libName, thumb: r.thumb || "" })),
          }
        : null;
}
/** the one picked by hand: kept for this entry, and its chapters looked up there */
export function readPick(i: number) {
    const r = ui.rlPick?.res[i],
        item = RD.item;
    if (!r || !item) return;
    const all = (meta.readMap = meta.readMap || {});
    all[item] = { ...(all[item] || {}), [r.lib]: { ref: r.ref, title: r.title } };
    markDirty();
    ui.rlPick = null;
    readMatch(item);
}
/** the panel closed */
export function readPickClose() {
    ui.rlPick = null;
    renderMain();
}
// ── browsing a server ──
/** a row while browsing a server: a series or folder to open, or a chapter to read */
type BrowseEntry = Found & { chap?: Chapter };
const RB: {
    lib: string | null;
    stack: { title: string; url: string }[];
    entries: BrowseEntry[] | null;
    busy: boolean;
    err: string;
} = { lib: null, stack: [], entries: null, busy: false, err: "" };
/** a reading server opened (page/ReadBrowse.svelte): its catalogue, or a series or folder in it */
export async function readBrowse(id: string | null | undefined, url?: string | null, title?: string) {
    const l = libById(id);
    if (!l) return;
    RB.lib = l.id;
    RB.busy = true;
    RB.err = "";
    renderMain();
    try {
        if (l.type === "folder") {
            if (!url) {
                RB.stack = [{ title: l.name || "", url: "" }];
                RB.entries = await RFD.browse(l);
            } else {
                RB.stack.push({ title: title || "", url });
                RB.entries = (await RFD.chapters(l, url)).map(c => ({ title: c.name, nav: null, chap: c }));
            }
        } else {
            const u = url || OP.root(l);
            if (!url) RB.stack = [];
            RB.stack.push({ title: title || l.name || "", url: u });
            const f = await OP.get(l, u);
            RB.entries = f.entries.map(e =>
                e.nav
                    ? e
                    : {
                          ...e,
                          chap: { name: e.title, ch: e.num ?? null, pse: e.pse, file: pickAcq(e.acq), thumb: e.thumb },
                      }
            );
        }
    } catch (e) {
        RB.err = libReach(e, l);
        RB.entries = [];
    }
    RB.busy = false;
    renderMain();
}
/** "On your servers" on the Read page (page/ReadBrowse.svelte): your reading servers to pick, where you are in one,
 *  and what's there (300 at most): series and folders to open, chapters to read */
export function readBrowseView() {
    const l = libById(RB.lib);
    return {
        libs: RLIBS().map(x => ({ id: x.id, name: x.name || typeName(x.type), on: RB.lib === x.id })),
        crumbs: l && RB.stack.length > 1 ? RB.stack.map((x, i) => ({ i, title: x.title })) : [],
        busy: RB.busy,
        err: RB.err,
        rows: RB.entries
            ? RB.entries.slice(0, 300).map((e, i) => ({
                  i,
                  chap: !!e.chap,
                  thumb: e.thumb || "",
                  n: e.chap ? String(e.chap.ch ?? "•") : "≡",
                  title: e.title,
                  sub: e.chap
                      ? e.chap.pse
                          ? plural(e.chap.pse.count, "page")
                          : e.chap.pages
                            ? plural(e.chap.pages.length, "page")
                            : "Read"
                      : e.n
                        ? plural(e.n, "file")
                        : "Open",
              }))
            : null,
    };
}
/** a series or folder opened, a step up, or a chapter read, while browsing a server */
export function readBrowseGo(i: number) {
    const en = RB.entries?.[i];
    if (en) readBrowse(RB.lib, en.nav, en.title);
}
export function readBrowseUp(i: number) {
    const s = RB.stack[i];
    if (!s) return;
    RB.stack = RB.stack.slice(0, i);
    readBrowse(RB.lib, s.url || null, s.title);
}
export function readBrowseRead(i: number) {
    const lib = libById(RB.lib),
        chaps = (RB.entries || []).flatMap(x => (x.chap ? [{ ...x.chap, lib }] : [])),
        en = RB.entries?.[i];
    if (!en || !en.chap) return;
    const name = en.chap.name;
    readRemote(
        chaps,
        chaps.findIndex(c => c.name === name)
    );
}
// ── opening a chapter from a server in the reader ──
export async function readRemote(list: Chapter[], i: number) {
    RD.files = list.map(c => ({ name: c.name, ch: c.ch, remote: c }));
    readStart(i);
}
/** a chapter's pages, as addresses the reader can show (null: it's a whole file to fetch instead) */
export async function remotePages(c: Chapter): Promise<string[] | null> {
    const l = c.lib || libById(RB.lib);
    if (c.pages) return c.pages;
    if (c.pse && c.pse.count) {
        const href = c.pse.href;
        const urls = Array.from({ length: Math.min(c.pse.count, MAX_PAGES) }, (_, n) =>
            href
                .replace(/\{pageNumber\}|%7BpageNumber%7D/gi, String(n))
                .replace(/\{maxWidth\}|%7BmaxWidth%7D/gi, "1600")
        );
        if (!l || !OP.needsAuth(l)) return urls;
        // servers that need a key on every request: fetch the pages ourselves, a few at a time
        const out = urls.map(() => "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
        let i = 0;
        const book = RD.book;
        const one = async () => {
            while (i < urls.length && RD.book === book) {
                const n = i++;
                try {
                    const r = await fetch(urls[n], { headers: OP.headers(l) });
                    const blob = await r.blob();
                    if (RD.book !== book) return; // closed meanwhile
                    out[n] = readerURL(blob);
                    if (RD.pages === out && RD.idx === n) renderReader();
                } catch (_) {}
            }
        };
        await Promise.race([Promise.all([one(), one(), one()]), sleep(1500)]);
        return out;
    }
    return null;
}
/** a whole file (a CBZ, an EPUB, a PDF) fetched from a server, to open like one of your own */
export async function remoteFile(c: Chapter): Promise<File> {
    const l = c.lib || libById(RB.lib),
        f = c.file;
    if (!f) throw new Error("no file");
    const r = await fetch(f.href, { headers: c.ext || !l || l.type === "folder" ? {} : OP.headers(l) });
    if (!r.ok) throw new Error("http " + r.status);
    const ext = /epub/.test(f.type)
        ? "epub"
        : /pdf/.test(f.type)
          ? "pdf"
          : /zip|cbz/.test(f.type)
            ? "cbz"
            : f.type || "cbz";
    return new File([await r.blob()], (c.name || "file").replace(/[\\/:*?"<>|]+/g, " ") + "." + ext);
}
