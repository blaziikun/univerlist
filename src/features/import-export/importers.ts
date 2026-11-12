// src/features/import-export/importers.ts
// ─────────────────────────────────────────────────────────────────
//  Importers: zip/gz files, Letterboxd export and RSS, MyAnimeList XML, any CSV, pasted lists
//
//  Every file here is someone else's: it's read as hostile. A zip is checked against its own sizes before anything is
//  unpacked, text is read through Papa Parse or the browser's XML parser, a date that isn't one is left out rather than
//  stopping the import, and what a file holds reaches your library only through applyParts() and migrateItem().
// ─────────────────────────────────────────────────────────────────

import {
    coverCache,
    csvCell,
    download,
    fieldsOf,
    fromCSV,
    idbPut,
    items,
    KINDS,
    listOf,
    markDirty,
    MEDIA,
    meta,
    norm,
    nowISO,
    ownOf,
    parseCSV,
    parseDay,
    safeJSON,
    statusWord,
    textOf,
    today,
    vault,
} from "../core/core";
import type { ImportedEntry } from "../core/core";
import { columnScale, mediumFromText, parseAnyScore } from "./smartimport";
import { partsFromFiles, partsFromSnapshot } from "./packs";
import { MAX_IMPORTED_PICTURE, pictureType, v2Files } from "./export-zip";
import type { ExportOpts } from "./export-zip";
import type { ImportPreview, Item, List, LogEntry, Status } from "../core/model";

// A zip is outside data. A real export is a few thousand files and a few hundred MB; past these, it's a zip bomb (a
// small file that unpacks to gigabytes) and is refused before it fills the tab's memory. A comic or book is far smaller
export const ZIP_LIMITS = { entries: 60000, entry: 512 * 1048576, total: 2048 * 1048576 };
// why a zip couldn't be opened (an Error's message)
export const TOO_BIG = "too big";
// zips this reader can't open, refused with a reason instead of handing back scrambled bytes
export const ZIP_LOCKED = "zip has a password";
export const ZIP_METHOD = "zip compression not supported";
export const ZIP_BROKEN = "zip is damaged";

/** a zip's files, by name */
export type ZipFiles = Map<string, Uint8Array<ArrayBuffer>>;
/** Unpacks gzip or deflate, stopping as soon as the result passes `max` bytes. */
async function inflate(
    u8: Uint8Array<ArrayBuffer>,
    fmt: CompressionFormat,
    max = ZIP_LIMITS.entry
): Promise<Uint8Array<ArrayBuffer>> {
    const reader = new Blob([u8]).stream().pipeThrough(new DecompressionStream(fmt)).getReader(),
        chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
            await reader.cancel();
            throw new Error(TOO_BIG);
        }
        chunks.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.length;
    }
    return out;
}
/** a zip's files, by name. A minimal ZIP reader (stored and deflated entries), enough for exports, Letterboxd's zip,
 * comics and EPUBs. Anything else (a password, another kind of compression, an entry or a directory that isn't where
 * the zip says) is refused, not guessed */
export async function unzip(buf: ArrayBuffer): Promise<ZipFiles> {
    const dv = new DataView(buf),
        out: ZipFiles = new Map();
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--)
        if (dv.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    if (eocd < 0) throw new Error("not a zip");
    const n = dv.getUint16(eocd + 10, true);
    if (n > ZIP_LIMITS.entries) throw new Error(TOO_BIG);
    let p = dv.getUint32(eocd + 16, true),
        total = 0;
    const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
        // the directory has to be inside the file: one that points past its end is a damaged (or cut-short) zip
        if (p + 46 > buf.byteLength) throw new Error(ZIP_BROKEN);
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        const flags = dv.getUint16(p + 8, true),
            method = dv.getUint16(p + 10, true),
            csize = dv.getUint32(p + 20, true),
            nl = dv.getUint16(p + 28, true),
            xl = dv.getUint16(p + 30, true),
            cl = dv.getUint16(p + 32, true),
            lho = dv.getUint32(p + 42, true);
        if (p + 46 + nl > buf.byteLength) throw new Error(ZIP_BROKEN);
        const name = dec.decode(new Uint8Array(buf, p + 46, nl));
        // a zip made on a Mac carries hidden copies of every file (__MACOSX/, ._name, .DS_Store): they aren't part of what was zipped
        const hidden = /(^|\/)(__MACOSX\/|\._[^/]*$|\.DS_Store$)/.test(name);
        if (!name.endsWith("/") && !hidden) {
            if (flags & 1) throw new Error(ZIP_LOCKED);
            if (method !== 0 && method !== 8) throw new Error(ZIP_METHOD);
            if (lho + 30 > buf.byteLength || dv.getUint32(lho, true) !== 0x04034b50) throw new Error(ZIP_BROKEN);
            const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
            if (start + csize > buf.byteLength) throw new Error(ZIP_BROKEN);
            const data = new Uint8Array(buf, start, csize);
            const room = Math.min(ZIP_LIMITS.entry, ZIP_LIMITS.total - total),
                bytes = method === 8 ? await inflate(data, "deflate-raw", room) : data;
            if (bytes.length > room) throw new Error(TOO_BIG);
            total += bytes.length;
            out.set(name, bytes);
        }
        p += 46 + nl + xl + cl;
    }
    return out;
}
/** a file's bytes as text ("" when there's no such file) */
export const txt = (u8: Uint8Array | undefined): string => new TextDecoder().decode(u8);
/** a date from a file as an ISO date, or null when it isn't one (a bad date leaves the date out, not the import) */
const isoOf = (d: Date): string | null => (Number.isNaN(d.getTime()) ? null : d.toISOString());
const noonOf = (s: string): string | null => (s ? isoOf(new Date(s + "T12:00:00")) : null);
/** what a file holds, read to show before it's brought in: one importable bundle { kind, name, items, lists?, columns?, rows? } */
export async function readImportFile(f: File): Promise<ImportPreview> {
    const buf = await f.arrayBuffer(),
        u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
        // zip
        let files = await unzip(buf),
            names = [...files.keys()];
        const nested = names.find(n => /(^|\/)(defaults|profile)-export[^/]*\.zip$/.test(n)),
            d = nested && files.get(nested);
        if (d) {
            files = await unzip(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
            names = [...files.keys()];
        }
        if (
            names.some(
                n => /(^|\/)(manifest\.json|univerlist-backup\.json)$/.test(n) || /(^|\/)data\/[^/]+\.json$/.test(n)
            )
        )
            return { kind: "bundle", name: f.name, ...partsFromFiles(files) };
        if (names.some(n => /(^|\/)(watched|diary|ratings)\.csv$/.test(n))) return await letterboxdZip(files, f.name);
        const csv = names.find(n => n.endsWith(".csv")),
            xml = names.find(n => n.endsWith(".xml")),
            json = names.find(n => n.endsWith(".json"));
        if (xml) return readText(txt(files.get(xml)), f.name);
        if (json) return readText(txt(files.get(json)), f.name);
        if (csv) return readText(txt(files.get(csv)), f.name);
        throw new Error("unrecognised");
    }
    if (u8[0] === 0x1f && u8[1] === 0x8b) return readText(txt(await inflate(u8, "gzip")), f.name);
    return readText(txt(u8), f.name);
}
async function readText(text: string, name: string): Promise<ImportPreview> {
    if (/^\s*[{[]/.test(text)) {
        const data = fieldsOf(safeJSON(text));
        if (!data.items && !data.books && !data.meta) throw new Error("no items");
        return {
            kind: "bundle",
            name,
            parts: partsFromSnapshot(data),
            v: data.v || 3,
            savedAt: textOf(data.savedAt) || undefined,
        };
    }
    if (/<myanimelist>/i.test(text.slice(0, 2000))) return { ...malXML(text), name };
    if (/^Letterboxd list export/i.test(text)) {
        const l = await letterboxdList(text);
        return {
            kind: "Letterboxd list",
            name,
            items: l.entries.map(e => ({ medium: "film", title: e.title, year: e.year, status: "want" })),
            lists: [l],
        };
    }
    const rows = await parseCSV(text);
    if (!rows.length) throw new Error("empty");
    const { kind, items: list } = fromCSV(rows);
    if (kind === "unknown" || !list.length) return { kind: "custom", name, rows, columns: Object.keys(rows[0]) };
    return { kind, name, items: list };
}
/** a film as Letterboxd's export lists it, gathered from each of its files */
type LbFilm = {
    medium: "film";
    title: string;
    year: number | null;
    status: Status;
    tags: string[];
    ext: Record<string, string>;
    repeat?: number;
    log?: LogEntry[];
    finishedAt?: string | null;
    rating?: number;
    notes?: string;
};
/** a list from Letterboxd's export */
interface LbList {
    name: string;
    desc: string;
    numbered: boolean;
    entries: { title: string; year: number | null; note: string; pos: number }[];
}
async function letterboxdZip(files: ZipFiles, name: string): Promise<ImportPreview> {
    const read: Record<string, Record<string, string>[]> = {};
    for (const n of ["watchlist.csv", "watched.csv", "ratings.csv", "diary.csv", "reviews.csv", "films.csv"]) {
        const k = [...files.keys()].find(x => x === n || x.endsWith("/" + n));
        read[n] = k ? await parseCSV(txt(files.get(k))) : [];
    }
    const key = (r: Record<string, string>) => norm(r.Name) + "|" + (r.Year || ""); // diary rows have their own URIs, so match films by name and year
    const map = new Map<string, LbFilm>(),
        film = (r: Record<string, string>, from: string): LbFilm => {
            const k = key(r);
            let x = map.get(k);
            if (!x)
                map.set(
                    k,
                    (x = {
                        medium: "film",
                        title: r.Name || "",
                        year: parseInt(r.Year, 10) || null,
                        status: "want",
                        tags: [],
                        ext: {},
                        repeat: 0,
                        log: [],
                    })
                );
            // a diary entry's or a review's address is that entry's, not the film's
            if (r["Letterboxd URI"] && !x.ext.letterboxd && !/diary|reviews/.test(from))
                x.ext.letterboxd = r["Letterboxd URI"];
            return x;
        };
    for (const r of read["watchlist.csv"]) film(r, "watchlist.csv");
    for (const r of read["watched.csv"]) {
        const x = film(r, "watched.csv");
        x.status = "done";
        x.finishedAt = x.finishedAt || (r.Date ? isoOf(parseDay(r.Date)) : null);
    }
    for (const r of read["ratings.csv"]) {
        const x = film(r, "ratings.csv");
        x.status = "done";
        if (r.Rating) x.rating = Math.round(parseFloat(r.Rating) * 2 * 10) / 10;
    }
    for (const r of read["diary.csv"]) {
        const x = film(r, "diary.csv");
        x.status = "done";
        const iso = noonOf(r["Watched Date"] || r.Date || "");
        if (iso) {
            if (!x.finishedAt || iso > x.finishedAt) x.finishedAt = iso;
            (x.log ||= []).push({ date: iso, from: 0, to: 0, min: 0 });
        }
        if (/yes/i.test(r.Rewatch || "")) x.repeat = (x.repeat || 0) + 1;
        for (const t of (r.Tags || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean))
            if (!x.tags.includes(t)) x.tags.push(t);
        if (r.Rating && !x.rating) x.rating = Math.round(parseFloat(r.Rating) * 2 * 10) / 10;
    }
    for (const r of read["reviews.csv"]) {
        const x = film(r, "reviews.csv");
        if (r.Review) x.notes = [x.notes, r.Review].filter(Boolean).join("\n\n");
    }
    for (const r of read["films.csv"]) {
        const x = film(r, "films.csv");
        if (!x.tags.includes("Liked on Letterboxd")) x.tags.push("Liked on Letterboxd");
    }
    const lists: LbList[] = [];
    for (const k of [...files.keys()].filter(k => /(^|\/)lists\/.+\.csv$/.test(k)))
        try {
            lists.push(await letterboxdList(txt(files.get(k))));
        } catch (_) {}
    for (const l of lists)
        for (const e of l.entries)
            if (![...map.values()].some(x => norm(x.title) === norm(e.title) && (!e.year || x.year === e.year)))
                map.set("l|" + e.title + e.year, {
                    medium: "film",
                    title: e.title,
                    year: e.year,
                    status: "want",
                    tags: [],
                    ext: {},
                });
    for (const x of map.values()) if (!x.log || !x.log.length) delete x.log;
    return { kind: "Letterboxd export", name, items: [...map.values()].filter(x => x.title), lists };
}
async function letterboxdList(text: string): Promise<LbList> {
    const blocks = text.replace(/\r/g, "").split(/\n\s*\n/),
        head: Record<string, string> =
            (await parseCSV(blocks.slice(0, 1).join("\n").split("\n").slice(1).join("\n")))[0] || {};
    const rows = await parseCSV(blocks.slice(1).join("\n\n"));
    return {
        name: head.Name || "Letterboxd list",
        desc: head.Description || "",
        numbered: rows.some(r => r.Position),
        entries: rows
            .map(r => ({
                title: r.Name || "",
                year: parseInt(r.Year, 10) || null,
                note: r.Description || "",
                pos: parseInt(r.Position, 10) || 0,
            }))
            .filter(e => e.title)
            .sort((a, b) => a.pos - b.pos),
    };
}
const MAL_KIND: Record<string, string> = { TV: "TV", Movie: "Movie", OVA: "OVA", ONA: "ONA", Special: "Special" };
function malXML(text: string): { kind: string; items: ImportedEntry[] } {
    const doc = new DOMParser().parseFromString(text, "text/xml"),
        q = (el: Element, t: string) => (el.getElementsByTagName(t)[0]?.textContent || "").trim();
    const st = (s: string): Status =>
        /complet/i.test(s)
            ? "done"
            : /watching|reading/i.test(s)
              ? "active"
              : /hold/i.test(s)
                ? "paused"
                : /drop/i.test(s)
                  ? "dnf"
                  : "want";
    const dt = (s: string) => (s && !/^0000/.test(s) ? noonOf(s.replace(/-00/g, "-01")) : null);
    const tags = (s: string) =>
        s
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);
    const anime = [...doc.getElementsByTagName("anime")].map(a => ({
        medium: "anime",
        title: q(a, "series_title"),
        kind: ownOf(MAL_KIND, q(a, "series_type")) || "TV",
        total: parseInt(q(a, "series_episodes"), 10) || null,
        prog: parseInt(q(a, "my_watched_episodes"), 10) || 0,
        rating: parseInt(q(a, "my_score"), 10) || 0,
        status: st(q(a, "my_status")),
        startedAt: dt(q(a, "my_start_date")),
        finishedAt: dt(q(a, "my_finish_date")),
        repeat: parseInt(q(a, "my_times_watched"), 10) || 0,
        notes: q(a, "my_comments"),
        tags: tags(q(a, "my_tags")),
        ext: { mal: parseInt(q(a, "series_animedb_id"), 10) || undefined },
    }));
    const manga = [...doc.getElementsByTagName("manga")].map(a => ({
        medium: "manga",
        title: q(a, "manga_title"),
        kind: "Manga",
        total: parseInt(q(a, "manga_chapters"), 10) || null,
        vols: parseInt(q(a, "manga_volumes"), 10) || null,
        prog: parseInt(q(a, "my_read_chapters"), 10) || 0,
        vol: parseInt(q(a, "my_read_volumes"), 10) || 0,
        rating: parseInt(q(a, "my_score"), 10) || 0,
        status: st(q(a, "my_status")),
        startedAt: dt(q(a, "my_start_date")),
        finishedAt: dt(q(a, "my_finish_date")),
        notes: q(a, "my_comments"),
        tags: tags(q(a, "my_tags")),
        ext: { mal: parseInt(q(a, "manga_mangadb_id"), 10) || undefined },
    }));
    return { kind: "MyAnimeList", items: [...anime, ...manga].filter(x => x.title) };
}
/** your recent diary from Letterboxd's public feed */
export async function letterboxdRSS(user: string): Promise<ImportedEntry[]> {
    const r = await fetch(`https://letterboxd.com/${encodeURIComponent(user)}/rss/`);
    if (!r.ok) throw new Error(String(r.status));
    const doc = new DOMParser().parseFromString(await r.text(), "text/xml");
    const g = (el: Element, t: string) => (el.getElementsByTagName(t)[0]?.textContent || "").trim();
    return [...doc.getElementsByTagName("item")].flatMap(it => {
        const title = g(it, "letterboxd:filmTitle");
        if (!title) return [];
        const img = (/<img src="([^"]+)"/.exec(g(it, "description")) || [])[1];
        const rating = parseFloat(g(it, "letterboxd:memberRating"));
        return [
            {
                medium: "film",
                title,
                year: parseInt(g(it, "letterboxd:filmYear"), 10) || null,
                status: "done",
                rating: rating ? rating * 2 : 0,
                finishedAt: noonOf(g(it, "letterboxd:watchedDate")),
                repeat: g(it, "letterboxd:rewatch") === "Yes" ? 1 : 0,
                cover: img || "",
                ext: {
                    tmdb: parseInt(g(it, "tmdb:movieId"), 10) || undefined,
                    tmdbType: "movie",
                    letterboxd: g(it, "link"),
                },
            },
        ];
    });
}
/** the fields a CSV's columns can be matched to: field, name, and the column names that usually mean it. Any CSV:
 * match its columns once */
export const MAP_FIELDS: [field: string, label: string, guess: RegExp][] = [
    ["title", "Title", /^(title|name|show|series|film|movie|game|book)/i],
    ["year", "Year", /year|released|release date/i],
    ["creator", "Creator", /author|director|creator|developer|studio/i],
    ["rating", "Your score", /my rating|your rating|^rating|score|stars/i],
    ["status", "Status", /status|shelf|list/i],
    ["finishedAt", "Date finished", /finish|watched|logged|completed|date read|date$/i],
    ["kind", "Type", /type|format|kind|platform/i],
    ["medium", "What it is", /media|medium|category/i],
    ["notes", "Notes", /review|notes?|comment/i],
    ["tags", "Tags", /tags?|genres?/i],
    ["prog", "Progress", /progress|episodes? watched|chapters? read|watched episodes/i],
];
export function guessMapping(cols: string[]): Record<string, string> {
    const m: Record<string, string> = {};
    for (const [k, , re] of MAP_FIELDS) {
        const c = cols.find(c => re.test(c) && !Object.values(m).includes(c));
        if (c) m[k] = c;
    }
    return m;
}
const statusFrom = (s: string): Status | "" =>
    /complet|watched|^read$|finished|done|played|beaten/i.test(s)
        ? "done"
        : /watching|reading|playing|current|in progress/i.test(s)
          ? "active"
          : /hold|pause/i.test(s)
            ? "paused"
            : /drop|abandon/i.test(s)
              ? "dnf"
              : /plan|want|watchlist|backlog|to.?read|wishlist/i.test(s)
                ? "want"
                : "";
/** an entry read from an import, before it's added (migrateItem() checks and fills in the rest) */
export type ImportedRow = {
    medium: string;
    title: string;
    year: number | null;
    rating: number;
    status: string;
    scale?: string;
    creator?: string;
    finishedAt?: string | null;
    kind?: string;
    notes?: string;
    tags?: string[];
    prog?: number;
};
export function mapRows(
    rows: Record<string, string>[],
    map: Record<string, string>,
    { medium, scale, status, all }: { medium: string; scale: string; status: string; all?: Record<string, string>[] }
): ImportedRow[] {
    const dt = (v: string) => (v ? isoOf(parseDay(String(v).replace(/\//g, "-"))) : null);
    // the score column's scale: as you set it, or worked out from its header and values ("Rating (out of 5)", all under 5…)
    const colSc =
        scale && scale !== "auto"
            ? scale
            : columnScale(
                  map.rating,
                  (all || rows).map(r => (map.rating ? r[map.rating] : ""))
              );
    const mine = (meta.settings.ratingScale || "10d").replace("10d", "10");
    return rows
        .map(r => {
            const v = (k: string) => (map[k] ? String(r[map[k]] || "").trim() : "");
            const [rating, sc] = parseAnyScore(v("rating"), colSc),
                md =
                    mediumFromText(v("medium")) ||
                    ((ownOf(KINDS, medium) || []).includes(v("kind")) ? "" : mediumFromText(v("kind"))) ||
                    medium;
            const st = statusFrom(v("status")) || (v("finishedAt") || rating ? "done" : status);
            return {
                medium: md,
                title: v("title"),
                year: parseInt(v("year"), 10) || null,
                creator: v("creator"),
                rating,
                ...(rating && sc && sc !== mine && sc !== "10" ? { scale: sc } : {}),
                status: st,
                finishedAt: dt(v("finishedAt")),
                kind: (ownOf(KINDS, md) || []).includes(v("kind")) ? v("kind") : "",
                notes: v("notes"),
                tags: v("tags")
                    ? v("tags")
                          .split(/[,;|]/)
                          .map(s => s.trim())
                          .filter(Boolean)
                          .slice(0, 8)
                    : [],
                prog: parseInt(v("prog"), 10) || 0,
            };
        })
        .filter(x => x.title);
}
/** pasted lists: one title per line, optional (year) and a score at the end */
export function parsePasted(text: string, medium: string, status: string): ImportedRow[] {
    return text
        .split(/\r?\n/)
        .map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
        .filter(Boolean)
        .map(l => {
            let title = l,
                year: number | null = null,
                rating = 0,
                scale = "";
            const sc =
                /\s[-–—:|]\s*((?:\d+(?:[.,]\d+)?\s*(?:\/\s*\d+|%)?)|[★⭐🌟☆½]+|👍|👎)\s*$/u.exec(title) ||
                /\s((?:[★⭐🌟]\s*)+½?)\s*$/u.exec(title);
            if (sc) {
                const [out, s2] = parseAnyScore(sc[1], "10");
                if (out && out <= 10) {
                    rating = out;
                    scale = s2;
                    title = title.slice(0, sc.index).trim();
                }
            }
            const y = /\((\d{4})\)\s*$/.exec(title) || /\s(\d{4})$/.exec(title);
            if (y && +y[1] > 1870 && +y[1] < 2100) {
                year = +y[1];
                title = title.slice(0, y.index).trim();
            }
            return {
                medium,
                title,
                year,
                rating,
                ...(scale === "5" || scale === "100" ? { scale } : {}),
                status: rating && status === "want" ? "done" : status,
            };
        })
        .filter(x => x.title.length > 1);
}

// ═══════════════════════════════════════════
//  THE .ZIP BUNDLE: APP + BACKUP + PICTURES + LISTS
// ═══════════════════════════════════════════
const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(u8: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
/** a file to put in a zip: its path and what it holds */
export interface ZipEntry {
    name: string;
    data: string | Uint8Array<ArrayBuffer>;
}
/** a plain (stored) zip: pictures are already compressed, and it opens everywhere. Plain zips stop at 65,535 files and
 * 4 GB; past that the export says so rather than writing a broken file */
export function zipFiles(files: ZipEntry[]): Blob {
    const bytes = files.reduce(
        (sum, f) => sum + (typeof f.data === "string" ? f.data.length * 3 : f.data.length) + 100,
        0
    );
    if (files.length > 65535 || bytes > 0xfffffff0) throw new Error(TOO_BIG);
    const enc = new TextEncoder(),
        parts: Uint8Array<ArrayBuffer>[] = [],
        cd: Uint8Array<ArrayBuffer>[] = [];
    let off = 0;
    const d = new Date(),
        dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
        tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const f of files) {
        const name = enc.encode(f.name),
            data = typeof f.data === "string" ? enc.encode(f.data) : f.data,
            crc = crc32(data);
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x0800, true);
        h.setUint16(10, tm, true);
        h.setUint16(12, dt, true);
        h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true);
        h.setUint32(22, data.length, true);
        h.setUint16(26, name.length, true);
        parts.push(new Uint8Array(h.buffer), name, data);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(12, tm, true);
        c.setUint16(14, dt, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, data.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, off, true);
        cd.push(new Uint8Array(c.buffer), name);
        off += 30 + name.length + data.length;
    }
    const cdSize = cd.reduce((a, x) => a + x.length, 0),
        e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true);
    e.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: "application/zip" });
}
/** a name safe to use as a file's */
export const safeName = (s: unknown): string =>
    String(s || "list")
        .replace(/[\\/:*?"<>|]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60) || "list";
/** your lists as files: one JSON of them all ("one"), a CSV each ("sep"), or both */
export function listFiles(mode: string): ZipEntry[] {
    const L = meta.lists.filter(l => !l.private),
        rowOf = (id: string, i: number, l: Pick<List, "notes">): (string | number)[] => {
            const b: Partial<Item> = items.get(id) || {};
            return [
                i + 1,
                b.title || "",
                b.medium ? MEDIA[b.medium].name : "",
                b.kind || "",
                b.year || "",
                b.status ? statusWord(b.status, b.medium) : "",
                b.rating || "",
                (l.notes || {})[id] || "",
            ];
        };
    const head = ["Position", "Title", "Medium", "Type", "Year", "Status", "Your score", "Note"].join(",");
    const lists = [{ id: "queue", name: "Up next", numbered: true, ids: meta.queue, notes: {}, desc: "" }, ...L].map(
        l => ({
            ...l,
            ids: l.ids.filter(id => items.has(id) && !vault.ids.has(id)),
        })
    );
    const out: ZipEntry[] = [];
    if (mode !== "sep")
        out.push({
            name: "lists/all-lists.json",
            data: JSON.stringify(
                lists.map(l => ({
                    name: l.name,
                    description: l.desc || "",
                    numbered: !!l.numbered,
                    entries: l.ids.map((id, i) => {
                        const r = rowOf(id, i, l);
                        return {
                            position: r[0],
                            title: r[1],
                            medium: r[2],
                            type: r[3],
                            year: r[4],
                            status: r[5],
                            score: r[6],
                            note: r[7],
                        };
                    }),
                })),
                null,
                1
            ),
        });
    if (mode !== "one")
        lists.forEach((l, k) => {
            out.push({
                name: `lists/${String(k + 1).padStart(2, "0")} ${safeName(l.name)}.csv`,
                data: [head, ...l.ids.map((id, i) => rowOf(id, i, l).map(csvCell).join(","))].join("\n"),
            });
        });
    return out;
}
const EXT_OF: Record<string, string> = {
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
};
/** a picture file's extension, from its type */
export const extOf = (t: string): string => ownOf(EXT_OF, t) || "jpg";
// profile-export_<name>_<date>.zip: your name as it shows everywhere, else the Universal hub's, else any mode's, else just the date
function exportName(): string {
    const modes = meta.modes || [],
        uni = modes.find(m => m.id === "universal"),
        pick = [
            meta.profile && meta.profile.name,
            uni && uni.profile && uni.profile.name,
            ...modes.map(m => m.profile && m.profile.name),
        ].find(x => x && String(x).trim());
    const who = pick
        ? String(pick)
              .trim()
              .normalize("NFKD")
              .replace(/[^\w\s-]/g, "")
              .trim()
              .replace(/\s+/g, "-")
              .slice(0, 40)
        : "";
    return `profile-export${who ? "_" + who : ""}_${today()}.zip`;
}
/** packs and downloads the export; what it says about the pictures. opts: { app, images, private, keysPass, keysOff,
 * privExt, readable, parts: { library: false, … } (what's left out) } */
export async function exportBundle(
    opts: ExportOpts,
    progress?: (done: number, total: number) => void,
    name?: string
): Promise<string> {
    const r = await v2Files(
        {
            parts: opts.parts,
            private: !!opts.private,
            keysPass: opts.keysPass || null,
            keysOff: !!opts.keysOff,
            privExt: opts.privExt !== false,
            images: opts.images !== false,
            readable: !!opts.readable,
        },
        progress
    );
    // just your data: you already have the app (index.html), so it isn't packed again
    download(name || exportName(), zipFiles(r.files), "application/zip");
    // a backup with everything in counts as your last full backup (the reminder goes quiet)
    if (!opts.parts && opts.images !== false) {
        meta.settings.lastBackup = nowISO();
        markDirty();
    }
    return r.note;
}
/** a picture from an import: the address it came from, its bytes, and its file's name */
export type ImportedPicture = [url: string, data: Uint8Array, name: string];
/** an older export's pictures, by the address each came from (images/index.json); null when it has none */
export function bundleImages(files: ZipFiles): ImportedPicture[] | null {
    const k = [...files.keys()].find(n => /(^|\/)images\/index\.json$/.test(n));
    if (!k) return null;
    const index = fieldsOf(safeJSON(txt(files.get(k)))),
        dir = k.replace(/index\.json$/, ""),
        out: ImportedPicture[] = [];
    for (const [url, n] of Object.entries(index)) {
        if (typeof n !== "string") continue;
        const data = files.get(dir + n.replace(/^images\//, "")) || files.get(n);
        if (data) out.push([url, data, n]);
    }
    return out;
}
/** keeps an import's pictures for offline use, under the addresses they came from; how many it kept */
export async function restoreImages(list: unknown): Promise<number> {
    let n = 0;
    for (const x of listOf(list)) {
        if (!Array.isArray(x)) continue;
        const [url, data] = x;
        if (typeof url !== "string" || !(data instanceof Uint8Array)) continue;
        // the type comes from the bytes, never the file's name: a blob address opened in a tab shows as its type, and an
        // "image" that's really a web page would run as one of the app's own pages
        const type = data.length <= MAX_IMPORTED_PICTURE ? pictureType(data) : null;
        if (!type) continue;
        const blob = new Blob([new Uint8Array(data)], { type: "image/" + type });
        try {
            await idbPut("covers", url, blob);
            coverCache.urls.set(url, URL.createObjectURL(blob));
            n++;
        } catch (_) {}
    }
    return n;
}
