// src/features/core/views.ts
// ─────────────────────────────────────────────────────────────────
//  Derived data
//
//  chart series use the six media colours (layers/_media-colours.scss, a fixed order)
// ─────────────────────────────────────────────────────────────────

import {
    catOf,
    CATS,
    change,
    cleanTitle,
    curMode,
    dayKey,
    fmtDate,
    fmtHours,
    fmtScore,
    hash,
    inMode,
    isSealed,
    items,
    ITEMS_VER,
    KINDS,
    markDirty,
    MEDIA,
    MEDIA_KEYS,
    mediumIdx,
    meta,
    minutesPerUnit,
    minutesSpent,
    norm,
    plural,
    sealedKinds,
    shelvesOf,
    SORT_OLD,
    STATUS_WORDS,
    statusRank,
    statusWord,
    SUBJECT_ORDER,
    SUBJECTS,
    surname,
    titleOf,
    ui,
    unitOf,
    vault,
} from "./core";
import { TMDB_ON } from "../sources/proxy";
import { kindOf, kindShown } from "./types";
import { partsOf, partsScore } from "./parts";
import { renderMain } from "./shell";
import { pwLib, PWS, pwStages } from "../learning-centre/learning";
import { seasonStem } from "../watch-read/watch";
import type { Entry, Item, ItemDraft, LogEntry, Mode } from "./model";

export const catIdx = (b: Item) => CATS.findIndex(c => c[0] === catOf(b));
export const sVar = (m: string) => `var(--s${CATS.findIndex(c => c[2].includes(m)) + 1})`;
const subjCode = (s: string) =>
    (SUBJECTS[s] || [])[1] ||
    String(s || "GEN")
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 4)
        .toUpperCase() ||
    "GEN";
const GENRE_CODE: Record<string, string> = {
    "Science Fiction": "SF",
    "Historical Fiction": "HIS",
    "Literary Fiction": "LIT",
    "Young Adult": "YA",
    "Magical Realism": "MRL",
    "Self Help": "SLF",
    "True Crime": "TCR",
    "Graphic Novels": "GN",
    "Short Stories": "SS",
};
const genreCode = (g: string) =>
    GENRE_CODE[g] ||
    String(g || "FIC")
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 3)
        .toUpperCase();
const SHELF_RANK: Record<string, number> = { fiction: 0, academic: 1, nonfiction: 2, other: 3 };
const shelfRank = (s: string | undefined) => SHELF_RANK[s || ""] ?? 3;
const subjRank = (s: string | undefined) => {
    const i = SUBJECT_ORDER.indexOf(s || "");
    return i < 0 ? 900 : i;
};
export const mediumRank = (m: string) => MEDIA_KEYS.indexOf(m);
// the private collection is kept apart: the main library never sees it, and private mode only sees it
// sealed entries exist only inside the private collection; hidden ones only on the Hidden list
// the whole library and each mode's slice are worked out once per change, not on every call
export const viewKey = () =>
    ITEMS_VER +
    "|" +
    (ui.private ? 1 : 0) +
    (ui.hiddenView ? 1 : 0) +
    "|" +
    (vault.key ? vault.ids.size : -1) +
    "|" +
    JSON.stringify(sealedKinds());
const allCache: { key: string; v: Entry[] } = { key: "", v: [] },
    modeCache = new Map<string, Entry[]>();
// everything you can see, the seasons and sequels kept inside a combined entry included (search finds those on their own)
export const allWithParts = (): Entry[] =>
    [...items.entries()]
        .map(([id, b]) => ({ id, ...b }))
        .filter(
            b =>
                (!isSealed(b) || !!ui.private) &&
                !!b.private === !!ui.private &&
                (ui.hiddenView ? !!b.hidden : !b.hidden)
        );
export const visible = (b: Item) =>
    (!isSealed(b) || !!ui.private) &&
    !!b.private === !!ui.private &&
    (ui.hiddenView ? !!b.hidden : !b.hidden) &&
    !(b.partOf && items.has(b.partOf));
export const all = (): Entry[] => {
    const k = viewKey();
    if (allCache.key !== k) {
        allCache.key = k;
        allCache.v = [...items.entries()].map(([id, b]) => ({ id, ...b })).filter(visible);
        modeCache.clear();
    }
    return allCache.v.slice();
};
const uniExcluded = (b: Item) =>
    (meta.layout.uniExclude || []).some(mid => {
        const m = meta.modes.find(x => x.id === mid);
        return m && m.id !== "universal" && inMode(b, m);
    });
export const modeItems = (mode: Mode = curMode()): Entry[] => {
    const A = all(),
        k =
            mode.id +
            "|" +
            (mode.match || []).join(",") +
            "|" +
            (mode.id === "universal" ? (meta.layout.uniExclude || []).join(",") : "") +
            "|" +
            meta.modes.length;
    let c = modeCache.get(k);
    if (!c) {
        c = A.filter(b => inMode(b, mode) && (mode.id !== "universal" || !uniExcluded(b)));
        modeCache.set(k, c);
    }
    return c.slice();
};
export const isUniversal = () => curMode().id === "universal" || (curMode().match || []).includes("*");
const gwCache = { k: "", v: "any" };
/** the verbs the mode's things share (read, watch, play, listen), or "any" */
export const groupWord = (): string => {
    const k = viewKey() + curMode().id;
    if (gwCache.k !== k) {
        const g = new Set(modeItems().map(b => MEDIA[b.medium].group));
        gwCache.k = k;
        gwCache.v = g.size === 1 ? [...g][0] : "any";
    }
    return gwCache.v;
};
// what the library shows: each mode remembers its own view, grouping, sort and zoom
export const VIEW_ALIAS: Record<string, string> = { faceout: "cover", shelf: "spine" };
export const curView = (mode: Mode = curMode()): string =>
    VIEW_ALIAS[mode.view || ""] ||
    mode.view ||
    VIEW_ALIAS[meta.settings.defaultView] ||
    meta.settings.defaultView ||
    "cover";
export const curGroup = (mode: Mode = curMode()): string => mode.group || "status";
export const curSort = (mode: Mode = curMode()): string => SORT_OLD[mode.sort || ""] || mode.sort || "rank";
export const viewOpts = (mode: Mode = curMode(), v = curView(mode)) => ({
    z: 1,
    gap: 1,
    titles: v === "grid",
    split: false,
    ...((mode.vz || {})[v] || {}),
});
let callMap = new Map<string, string>();
let callsFor = ""; // the library the call numbers were worked out for
/** every entry's call number (the Shelf sort and spines use them), worked out again only when the library changed */
export function buildCallNumbers() {
    const k = ITEMS_VER + "|" + items.size;
    if (k === callsFor) return;
    callsFor = k;
    callMap = new Map();
    const groups = new Map<string, [string, Item][]>();
    for (const [id, b] of items) {
        const k =
            b.medium === "book"
                ? "book|" +
                  (b.kind === "Academic"
                      ? "academic|" + (b.subject || "")
                      : b.kind === "Non-fiction"
                        ? "nonfiction|" + (b.subject || (b.genres || [])[0] || "")
                        : "fiction|" + ((b.genres || [])[0] || ""))
                : b.medium + "|" + (b.year || "") + "|";
        const g = groups.get(k);
        if (g) g.push([id, b]);
        else groups.set(k, [[id, b]]);
    }
    for (const [k, arr] of groups) {
        const [m, a, sub] = k.split("|");
        if (m === "book") {
            if (a === "academic") {
                const code = subjCode(sub);
                arr.sort(
                    (x, y) =>
                        (x[1].trackIndex ?? 50) - (y[1].trackIndex ?? 50) ||
                        (x[1].order ?? 99) - (y[1].order ?? 99) ||
                        String(x[1].title).localeCompare(y[1].title)
                );
                const seen: Record<number, number> = {};
                for (const [id, b] of arr) {
                    const t = (b.trackIndex ?? 8) + 1;
                    seen[t] = (seen[t] || 0) + 1;
                    callMap.set(id, `${code} ${t}·${String(b.order ?? seen[t]).padStart(2, "0")}`);
                }
            } else {
                const code =
                    a === "nonfiction"
                        ? SUBJECTS[sub]
                            ? subjCode(sub)
                            : "NF " + genreCode(sub)
                        : "FIC " + (sub ? genreCode(sub) : "GEN");
                arr.sort(
                    (x, y) => (x[1].year || 9999) - (y[1].year || 9999) || String(x[1].title).localeCompare(y[1].title)
                );
                arr.forEach(([id], i) => {
                    callMap.set(id, `${code} ${String(i + 1).padStart(3, "0")}`);
                });
            }
        } else {
            arr.sort((x, y) => String(titleOf(x[1])).localeCompare(titleOf(y[1])));
            arr.forEach(([id], i) => {
                callMap.set(id, `${MEDIA[m].code} ${a || "————"}·${String(i + 1).padStart(2, "0")}`);
            });
        }
    }
}
export const callOf = (id: string) => callMap.get(id) || "";
export const lenOf = (b: Item): number =>
    b.medium === "book"
        ? b.total ||
          (b.format === "Short"
              ? 260
              : b.format === "Long"
                ? 520
                : b.format === "Series"
                  ? 1300
                  : b.format === "Textbook"
                    ? 600
                    : 380)
        : b.medium === "film"
          ? b.runtime || 115
          : b.medium === "game"
            ? (b.total || 20) * 60
            : (b.total || 12) * minutesPerUnit(b);
/** a catalogue's score: its name, how it's shown, and the same out of 100 */
export const SCORE_DEF: Record<
    string,
    [name: string, show: (v: number) => string | number, of100: (v: number) => number]
> = {
    anilist: ["AniList", v => v + "%", v => v],
    mal: ["MyAnimeList", v => (+v).toFixed(2), v => v * 10],
    imdb: ["IMDb", v => (+v).toFixed(1), v => v * 10],
    rt: ["RT critics", v => v + "%", v => v],
    meta: ["Metacritic", v => v, v => v],
    tmdb: ["TMDB", v => (+v).toFixed(1), v => v * 10],
    tvmaze: ["TVmaze", v => (+v).toFixed(1), v => v * 10],
    rawg: ["RAWG", v => (+v).toFixed(2) + "/5", v => v * 20],
    ol: ["Open Library", v => (+v).toFixed(2) + "/5", v => v * 20],
    gb: ["Google Books", v => (+v).toFixed(1) + "/5", v => v * 20],
    goodreads: ["Goodreads", v => (+v).toFixed(2) + "/5", v => v * 20],
    mdl: ["MyDramaList", v => (+v).toFixed(1), v => v * 10],
    letterboxd: ["Letterboxd", v => (+v).toFixed(1) + "/5", v => v * 20],
    backloggd: ["Backloggd", v => (+v).toFixed(1) + "/5", v => v * 20],
    rym: ["Rate Your Music", v => (+v).toFixed(2) + "/5", v => v * 20],
    aoty: ["Album of the Year", v => v, v => v],
    serializd: ["Serializd", v => (+v).toFixed(1) + "/10", v => v * 10],
    animeplanet: ["Anime-Planet", v => (+v).toFixed(1) + "/5", v => v * 20],
};
export const MANUAL_SCORES: Record<string, string[]> = {
    book: ["goodreads"],
    comic: ["goodreads"],
    tv: ["serializd", "mdl"],
    film: ["letterboxd", "mdl"],
    game: ["backloggd"],
    album: ["rym", "aoty"],
    anime: ["animeplanet", "serializd"],
    manga: ["animeplanet"],
    manhwa: ["animeplanet"],
    novel: ["goodreads"],
};
export function crowd(b: Item) {
    const parts = Object.entries(b.scores || {})
        .filter((x): x is [string, number] => !!SCORE_DEF[x[0]] && x[1] != null && !Number.isNaN(Number(x[1])))
        .map(([k, v]) => ({ k, label: SCORE_DEF[k][0], show: SCORE_DEF[k][1](v), n: SCORE_DEF[k][2](+v) }));
    const avg = parts.length ? Math.round(parts.reduce((a, p) => a + p.n, 0) / parts.length) : null;
    return { parts, avg };
}
export const mine = (b: Item) => (b.rating ? b.rating * 10 : null);
// your own shelf arrangement, per mode; anything you haven't placed follows in library order
// two orders you control: "Shelf look" arranges covers by how the shelf looks; "My order" is your ranking and watch order, used inside each status group
// positions in your saved orders, looked up from an index built once per order (not a scan per comparison)
// each index remembers how long its order was, so an order that grew is indexed again
const posIdx = new WeakMap<string[], { n: number; at: Map<string, number> }>();
const posIn = (arr: string[] | undefined, id: string) => {
    if (!arr || !arr.length) return 1e6;
    let m = posIdx.get(arr);
    if (!m || m.n !== arr.length) {
        m = { n: arr.length, at: new Map(arr.map((x, i) => [x, i])) };
        posIdx.set(arr, m);
    }
    const i = m.at.get(id);
    return i == null ? 1e6 : i;
};
const shelfPos = (id: string, mode: Mode = curMode()) => posIn((meta.orders || {})[mode.id], id);
const minePos = (id: string, mode: Mode = curMode()) => posIn((meta.myOrder || {})[mode.id], id);
function defaultOrder(x: Entry, y: Entry) {
    return (
        catIdx(x) - catIdx(y) ||
        mediumRank(x.medium) - mediumRank(y.medium) ||
        (x.medium === "book"
            ? shelfRank(x.shelf) - shelfRank(y.shelf) || subjRank(x.subject) - subjRank(y.subject)
            : 0) ||
        callOf(x.id).localeCompare(callOf(y.id), undefined, { numeric: true })
    );
}
export const endedAt = (b: Item) => (b.status === "dnf" ? b.droppedAt || b.lastAt || "" : b.finishedAt || "");
export function sortBy(key: string): (a: Entry, b: Entry) => number {
    const t = (x: Item, y: Item) => String(titleOf(x)).localeCompare(String(titleOf(y)));
    switch (SORT_OLD[key] || key) {
        case "rank":
            return (a, b) => (b.rating || 0) - (a.rating || 0) || minePos(a.id) - minePos(b.id) || t(a, b);
        case "title":
            return t;
        case "added":
            return (a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")) || t(a, b);
        case "ended":
            return (a, b) => String(endedAt(b)).localeCompare(String(endedAt(a))) || t(a, b);
        case "release":
            return (a, b) => (b.year || 0) - (a.year || 0) || t(a, b);
        case "order": {
            const pos = readingOrder();
            return (a, b) => {
                const x = orderKey(a, pos),
                    y = orderKey(b, pos);
                return x[0] - y[0] || x[1].localeCompare(y[1]) || x[2] - y[2] || t(a, b);
            };
        }
        default:
            // ties (no call numbers yet, or the same) go by title, then id: the same order on every device and reload
            return (a, b) =>
                shelfPos(a.id) - shelfPos(b.id) ||
                defaultOrder(a, b) ||
                t(a, b) ||
                (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
}
// reading and watch order: a Learning Centre book goes where its pathway puts it; anything in a series goes with its series,
// in release order or, when you've set it, story order (Settings for this: the ⋯ by the views, "Story order")
function readingOrder() {
    const pos = new Map<string, number>();
    if (typeof PWS !== "function") return pos;
    let i = 0;
    for (const P of PWS()) {
        const stg = pwStages(P);
        for (const b of P.books.slice().sort((x, y) => (stg[x.id] || 0) - (stg[y.id] || 0))) {
            const id = pwLib(b);
            if (id && !pos.has(id)) pos.set(id, i);
            i++;
        }
    }
    return pos;
}
function orderKey(b: Entry, pos: Map<string, number>): [number, string, number] {
    const story = meta.settings.watchOrder === "story",
        series = b.series || b.franchise || titleById(b.partOf) || seasonStemOf(b);
    const n =
        story && b.chrono != null ? +b.chrono : b.seriesNo != null ? +b.seriesNo + (b.year || 0) / 1e5 : b.year || 9999;
    return [pos.get(b.id) ?? 1e6, norm(series), n];
}
/** the title of an entry in your library, by its id ("" for none) */
export const titleById = (id: string | undefined) => {
    const b = id ? items.get(id) : undefined;
    return b ? titleOf(b) : "";
};
const seasonStemOf = (b: Item) => (typeof seasonStem === "function" ? seasonStem(b.title) : norm(cleanTitle(b.title)));
export const favPos = (id: string) => {
    const i = meta.favOrder.indexOf(id);
    return i < 0 ? 1e6 : i;
};
export const SORTS: [string, string][] = [
    ["rank", "Ranking"],
    ["shelf", "Shelf"],
    ["order", "Reading / watch order"],
    ["title", "Title"],
    ["release", "Release date"],
    ["added", "Date added"],
    ["ended", "Date ended"],
];
export const GROUPS: [string, string][] = [
    ["status", "Status"],
    ["kind", "Shelf"],
    ["type", "Type"],
    ["genre", "Genre"],
    ["none", "No grouping"],
];
/** the group an entry falls in: its key, its name, and where the group goes */
export function groupKey(b: Item, g: string): [key: string, name: string, at: number] {
    switch (g) {
        case "status":
            return [b.status, STATUS_WORDS[groupWord()][b.status], statusRank[b.status]];
        // Type follows the mode's own shelves when it has them (Hub: Culture, Literature, Film, TV, Games), otherwise each item's type
        case "kind": {
            const mode = curMode();
            if (Array.isArray(mode.shelves)) {
                const sh = shelvesOf(mode),
                    i = sh.findIndex(s => s.test(b));
                return i < 0 ? ["other", "Other", 99] : [sh[i].key, sh[i].name, i];
            }
            const k = kindShown(b) || MEDIA[b.medium].name;
            return [k, k, 0];
        }
        case "type": {
            const k = kindShown(b) || MEDIA[b.medium].name;
            return [
                b.medium + ":" + kindOf(b),
                k,
                mediumIdx(b.medium) * 20 + Math.max(0, (KINDS[b.medium] || []).indexOf(kindOf(b))),
            ];
        }
        case "genre": {
            const k = (b.genres || [])[0] || "No genre yet";
            return [k, k, 0];
        }
        default:
            return ["", "", 0];
    }
}

// ═══════════════════════════════════════════
//  BUILDING BLOCKS
// ═══════════════════════════════════════════
const MEDIUM_HUE: Record<string, number> = {
    manga: 340,
    manhwa: 300,
    novel: 260,
    comic: 20,
    anime: 210,
    tv: 170,
    film: 0,
    game: 120,
    album: 290,
};
/** the two colours of a made-up cover (and of a spine with no colour of its own) */
export function coverPalette(b: ItemDraft): [string, string] {
    if (b.medium === "book") {
        const h = hash((b.genres || [])[0] || b.subject || b.shelf || b.title) % 360,
            s = b.kind === "Academic" ? 24 : b.kind === "Non-fiction" ? 30 : 36,
            hh = b.kind === "Academic" ? 200 + (h % 60) : h;
        return [`hsl(${hh} ${s}% 30%)`, `hsl(${hh} ${s}% 13%)`];
    }
    const h = (hash(b.title) % 50) + (MEDIUM_HUE[b.medium || ""] || 0);
    return [`hsl(${h % 360} 34% 30%)`, `hsl(${h % 360} 30% 12%)`];
}
function lum(hex: string) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return 0.2;
    const n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
export function spineColour(b: Item): [string, string] {
    const base = b.color || (b.coverColor && b.coverColor !== "none" ? b.coverColor : null);
    return base ? [base, lum(base) > 0.62 ? "#1c1a16" : "#f2e8cf"] : [coverPalette(b)[0], "#f2e8cf"];
}
// Spines are cut from the real cover (no free source has spine photos), so a spine with art carries no text: the art says what it is.
/** the small pieces beside a title (library/tiles/: MyScore, StatusPill, CopyPill, CrowdPill, MediumDot), worked out here */
export const statusPillLook = (b: Item) =>
    b.status === "want" ? null : { cls: "pill " + b.status, word: statusWord(b.status, b.medium) };
export const copyPillLook = (b: Item) =>
    b.copy !== "none"
        ? { cls: "pill own", word: b.copy === "digital" ? "Digital" : "Owned" }
        : b.toBuy
          ? { cls: "pill buy", word: "To buy" }
          : null;
export function crowdLook(b: Item) {
    const c = crowd(b);
    return c.avg != null ? { avg: c.avg, title: c.parts.map(p => p.label + " " + p.show).join(" · ") } : null;
}
/** the medium's coloured dot, beside a title in a mode with more than one medium */
export const mdotLook = (m: string) =>
    isUniversal() ? { style: `background:${sVar(m)}`, title: MEDIA[m].name } : null;
export const pct = (b: Item) => (b.total ? Math.min(100, Math.round(((b.prog || 0) / b.total) * 100)) : 0);
export function progText(b: Item, long?: boolean) {
    const [one, _many, abbr] = unitOf(b);
    if (b.medium === "film") return b.runtime ? b.runtime + " min" : "";
    if (b.medium === "book") return b.total ? `p. ${b.prog || 0} of ${b.total}` : `p. ${b.prog || 0}`;
    if (b.medium === "game") return `${b.prog || 0} h played${b.total ? ` · ~${b.total} h to finish` : ""}`;
    const base = `${long ? one.charAt(0).toUpperCase() + one.slice(1) : abbr} ${b.prog || 0}${b.total ? " / " + b.total : ""}`;
    return base + (b.vol ? ` · vol ${b.vol}${b.vols ? "/" + b.vols : ""}` : "");
}
export function ago(iso: string) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    return s < 90
        ? "just now"
        : s < 5400
          ? Math.round(s / 60) + " min ago"
          : s < 129600
            ? Math.round(s / 3600) + " h ago"
            : Math.round(s / 86400) + " days ago";
}
export function until(ms: number) {
    const s = (ms - Date.now()) / 1000;
    if (s <= 0) return "out now";
    const d = Math.floor(s / 86400),
        h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export const STATS_VIEWS: [string, string][] = [
    ["charts", "Charts"],
    ["wrapped", "Year in review"],
    ["taste", "Your taste"],
    ["compare", "Compare"],
    ["franchises", "Franchises"],
    ["people", "People"],
    ["airing", "Coming up"],
    ["log", "Log"],
    ["dupes", "Duplicates"],
];
export function airingList() {
    return modeItems()
        .filter(
            b =>
                b.airing &&
                b.airing.at &&
                b.airing.at > Date.now() - 864e5 &&
                ["active", "want", "paused", "done"].includes(b.status) &&
                (b.status !== "done" || b.airStatus === "RELEASING")
        )
        .sort((a, b) => (a.airing?.at || 0) - (b.airing?.at || 0));
}
export function mediumStatsOf(test: (b: Entry) => boolean) {
    const A = modeItems().filter(test),
        fin = A.filter(b => b.status === "done"),
        rated = A.filter(b => b.rating);
    return {
        n: A.length,
        fin: fin.length,
        active: A.filter(b => b.status === "active").length,
        min: A.reduce((a, b) => a + minutesSpent(b), 0),
        mean: rated.length ? rated.reduce((a, b) => a + (b.rating || 0), 0) / rated.length : null,
    };
}
// ── overview: a summary of the mode's stats, library, favourites and lists ──
/** an episode or chapter coming up: which, and how far behind you are (AirRow.svelte draws it too) */
export function airLook(b: Entry) {
    const unit = b.medium === "anime" || b.medium === "tv" ? "Ep" : "Ch",
        a = b.airing;
    if (!a) return null;
    return {
        title: titleOf(b),
        what: `${unit} ${a.ep || "?"}${a.season ? " · S" + a.season : ""}${b.status === "active" && b.prog && a.ep && a.ep - 1 > b.prog ? ` · you're ${a.ep - 1 - b.prog} behind` : ""}`,
        at: a.at,
    };
}
// ── coming up, log ──
/** what Stats › Coming up shows: what has a date, and what's still releasing without one */
export function airingLook() {
    return {
        list: airingList(),
        releasing: modeItems()
            .filter(b => b.airStatus === "RELEASING" && !b.airing && ["active", "want", "paused"].includes(b.status))
            .slice(0, 30),
        tmdb: TMDB_ON(),
    };
}
/** a session from an entry's log, with how far it went and how long it took */
export type Session = LogEntry & { id: string; b: Item; n: number; min: number };
export function allSessions(): Session[] {
    const out: Session[] = [];
    for (const [id, b] of items) {
        if (!visible(b) || !inMode(b)) continue;
        for (const s of b.log || []) {
            const n = Math.max(0, (s.to || 0) - (s.from || 0));
            out.push({ id, b, ...s, n, min: s.min != null ? s.min : n * minutesPerUnit(b) });
        }
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
/** Stats › Log: every session, start and finish, by day, newest first (the latest 150 days with any) */
export function logLook() {
    const ss = allSessions(),
        events: { date: string; id: string; b: Item; kind: string }[] = [];
    for (const [id, b] of items) {
        if (!visible(b) || !inMode(b)) continue;
        if (b.finishedAt) events.push({ date: b.finishedAt, id, b, kind: "done" });
        if (b.startedAt) events.push({ date: b.startedAt, id, b, kind: "started" });
    }
    type Event = {
        date: string;
        id: string;
        b: Item;
        kind: string;
        n?: number;
        min?: number;
        from?: number;
        to?: number;
        lane?: unknown;
    };
    const evs: Event[] = [...ss.map(s => ({ ...s, kind: "session" })), ...events].sort((a, b) =>
        String(b.date).localeCompare(String(a.date))
    );
    const days = new Map<string, Event[]>();
    for (const e of evs) {
        const d = dayKey(e.date);
        const day = days.get(d);
        if (day) day.push(e);
        else days.set(d, [e]);
    }
    const sess = (e: Event) => {
        const [, , abbr] = unitOf(e.b);
        return e.b.medium === "game"
            ? `${e.n} h played`
            : e.b.medium === "book"
              ? `p. ${e.from} → ${e.to}`
              : e.b.medium === "film"
                ? "Watched"
                : `${abbr} ${e.from} → ${e.to}`;
    };
    return [...days.entries()].slice(0, 150).map(([d, es]) => ({
        d,
        date: fmtDate(d),
        time: es.some(e => e.kind === "session")
            ? "≈ " + fmtHours(es.filter(e => e.kind === "session").reduce((a, e) => a + (e.min || 0), 0))
            : "",
        events: es.map(e => ({
            id: e.id,
            medium: e.b.medium,
            what:
                e.kind === "session"
                    ? sess(e)
                    : e.kind === "done"
                      ? STATUS_WORDS[MEDIA[e.b.medium].group].done
                      : "Started",
            title: titleOf(e.b),
            lane: e.lane ? String(e.lane) : "",
        })),
    }));
}

// ── stats ──
export function activityStats() {
    const ss = allSessions(),
        byDay = new Map<string, number>();
    for (const s of ss) {
        const d = dayKey(s.date);
        byDay.set(d, (byDay.get(d) || 0) + s.min);
    }
    for (const b of items.values())
        if (b.finishedAt && visible(b) && inMode(b)) {
            const d = dayKey(b.finishedAt);
            if (!byDay.has(d)) byDay.set(d, 0);
        }
    const y = new Date().getFullYear(),
        A = modeItems();
    const doneYear = A.filter(
        b => b.status === "done" && b.finishedAt && new Date(b.finishedAt).getFullYear() === y
    ).length;
    const cutoff = Date.now() - 30 * 864e5,
        min30 = ss.filter(s => Date.parse(s.date) >= cutoff).reduce((a, s) => a + s.min, 0);
    let streak = 0;
    const d = new Date();
    if (!byDay.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (byDay.has(dayKey(d))) {
        streak++;
        d.setDate(d.getDate() - 1);
    }
    let longest = 0,
        run = 0,
        prev: number | null = null;
    for (const day of [...byDay.keys()].sort()) {
        const t = Date.parse(day);
        run = prev && t - prev === 864e5 ? run + 1 : 1;
        longest = Math.max(longest, run);
        prev = t;
    }
    return { ss, byDay, doneYear, min30, streak, longest };
}
/** the activity grid's days: each one's tooltip, and its colour when you did something that day */
export function heatLook(byDay: Map<string, number>, weeks = 20) {
    const vals = [...byDay.values()],
        max = Math.max(1, ...vals),
        heat: { title: string; style: string }[] = [];
    const start = new Date();
    start.setDate(start.getDate() - 7 * weeks - start.getDay());
    for (let i = 0; i < 7 * (weeks + 1); i++) {
        const x = new Date(start);
        x.setDate(start.getDate() + i);
        const k = dayKey(x),
            has = byDay.has(k),
            v = byDay.get(k) || 0;
        heat.push({
            title: `${fmtDate(x)}: ${has ? (v ? "≈ " + fmtHours(v) : "finished something") : "nothing"}`,
            style: has
                ? `background:color-mix(in srgb,var(--accent) ${30 + Math.round((v / max) * 70)}%,var(--panel3))`
                : "",
        });
    }
    return heat;
}
// ── rank ──
export const rankState: { mode: string; pair: [string, string] | null; recent: string[] } = {
    mode: "liked",
    pair: null,
    recent: [],
};
// the fields a ranking keeps: its rating and how many times each was picked
const RF = (): ["welo" | "elo", "wh2h" | "h2h"] => (rankState.mode === "want" ? ["welo", "wh2h"] : ["elo", "h2h"]);
const rankScore = (b: Item) => b.rating || (partsOf(b).length ? partsScore(b) : 0);
const eloOf = (b: Item) =>
    rankState.mode === "want"
        ? b.welo || 1500 + (b.favRank ? (9 - b.favRank) * 15 : 0) + (b.copy !== "none" ? 20 : 0)
        : b.elo || 1500 + ((rankScore(b) || 6) - 6) * 30 + (b.fav ? 40 : 0);
const h2hOf = (b: Item) => b[RF()[1]] || 0;
export function rankPool(): Entry[] {
    const sh = ui.rankShelf ? shelvesOf().find(s => s.key === ui.rankShelf) : null;
    return modeItems().filter(
        b =>
            (!sh || sh.test(b)) &&
            (rankState.mode === "want"
                ? b.status === "want"
                : b.status === "done" || rankScore(b) || b.status === "active" || b.elo)
    );
}
export function nextPair(): [string, string] | null {
    const pool = rankPool();
    if (pool.length < 2) return null;
    pool.sort((a, b) => h2hOf(a) - h2hOf(b) || Math.random() - 0.5);
    const a = pool[Math.floor(Math.random() * Math.max(1, Math.ceil(pool.length / 3)))];
    const others = pool
        .filter(b => b.id !== a.id && !rankState.recent.includes([a.id, b.id].sort().join("|")))
        .sort((x, y) => Math.abs(eloOf(x) - eloOf(a)) - Math.abs(eloOf(y) - eloOf(a)));
    const b = others[Math.floor(Math.random() * Math.min(4, others.length))] || pool.find(x => x.id !== a.id);
    return [a.id, b.id];
}
/** the Rank tab (library/rank/RankPage.svelte): the two to pick between (a new pair when there's none, or it's gone or
 *  left the mode), and the ranking so far */
export function rankView() {
    const pool = rankPool();
    const first = rankState.pair && items.get(rankState.pair[0]);
    if (!rankState.pair || !first || !items.has(rankState.pair[1]) || !inMode(first)) rankState.pair = nextPair();
    const board = pool.filter(b => h2hOf(b)).sort((a, b) => eloOf(b) - eloOf(a));
    const contender = (id: string, side: number) => {
        const b = items.get(id);
        if (!b) return null;
        const n = partsOf(b).length,
            sc = rankScore(b);
        return {
            b: { ...b, id },
            side,
            call: `${b.kind || MEDIA[b.medium].one} · ${callOf(id)}`,
            title: titleOf(b),
            hint: `${b.creator || ""}${b.year ? " · " + b.year : ""}${n ? ` · ${n + 1} seasons` : ""}${sc ? ` · ${b.rating ? "you gave it" : "seasons average"} ${fmtScore(sc)}` : ""}`,
            about: (b.why || b.about || "").slice(0, 140),
        };
    };
    return {
        want: rankState.mode === "want",
        shelf: ui.rankShelf || "",
        shelves: shelvesOf().map(s => ({ key: s.key, name: s.name })),
        pair: rankState.pair ? [contender(rankState.pair[0], 0), contender(rankState.pair[1], 1)] : null,
        board: board.slice(0, 50).map((b, i) => ({
            b,
            r: String(i + 1).padStart(2, "0"),
            title: titleOf(b),
            picks: plural(h2hOf(b), "pick"),
        })),
        compared: board.length,
    };
}
export function rankPick(side: number | "draw") {
    const [ia, ib] = rankState.pair || [];
    if (!ia || !ib) return;
    const A = items.get(ia),
        B = items.get(ib);
    if (!A || !B) return;
    const ea = eloOf(A),
        eb = eloOf(B),
        exp = 1 / (1 + 10 ** ((eb - ea) / 400));
    const sa = side === "draw" ? 0.5 : side === 0 ? 1 : 0,
        k = (n: number | undefined) => Math.max(14, 40 - 2 * (n || 0));
    const [fe, fh] = RF(),
        na = Math.round(ea + k(A[fh]) * (sa - exp)),
        nb = Math.round(eb + k(B[fh]) * (1 - sa - (1 - exp)));
    change(side === "draw" ? "Tie" : "Pick " + titleOf(side === 0 ? A : B), [ia, ib], (b, id) =>
        b ? { ...b, [fe]: id === ia ? na : nb, [fh]: (b[fh] || 0) + 1 } : undefined
    );
    rankState.recent = [[ia, ib].sort().join("|"), ...rankState.recent].slice(0, 12);
    rankState.pair = nextPair();
    renderMain();
}

// ── duplicates ──
// two entries are only the same thing when nothing says they're different: not seasons of one show (combined, or a chain of
// sequels), not two different records on the same site, not a different year, season, volume or number
const DUP_IDS = ["anilist", "mal", "tmdb", "tvmaze", "imdb", "igdb", "rawg", "olKey", "gb", "isbn"];
function notSame(a: Entry, b: Entry) {
    if (a.partOf === b.id || b.partOf === a.id || (a.partOf && a.partOf === b.partOf)) return true;
    const A = a.ext || {},
        B = b.ext || {};
    if (DUP_IDS.some(k => A[k] && B[k] && String(A[k]) !== String(B[k]))) return true;
    if (a.year && b.year && a.year !== b.year) return true;
    if (a.season && b.season && String(a.season) !== String(b.season)) return true;
    if ((a.seriesNo || b.seriesNo) && a.seriesNo !== b.seriesNo) return true;
    if (a.kind && b.kind && a.kind !== b.kind && ["anime", "tv"].includes(a.medium)) return true;
    if (
        norm(a.title) !== norm(b.title) &&
        /\b(season|part|cour|vol(ume)?|book|\d+(st|nd|rd|th))\b|\d\s*$/i.test(a.title + " " + b.title)
    )
        return true;
    return false;
}
export function dupGroups(): string[][] {
    const m = new Map<string, string[]>();
    for (const [id, b] of items) {
        const k = b.medium + "|" + norm(cleanTitle(b.title)) + "|" + (b.medium === "book" ? surname(b.creator) : "");
        const g = m.get(k);
        if (g) g.push(id);
        else m.set(k, [id]);
    }
    const out: string[][] = [];
    const entry = (id: string): Entry | null => {
        const b = items.get(id);
        return b ? { id, ...b } : null;
    };
    for (const g of m.values()) {
        if (g.length < 2) continue;
        const keep = g.filter(id =>
            g.some(o => {
                const A = entry(id),
                    B = entry(o);
                return o !== id && !!A && !!B && !notSame(A, B);
            })
        );
        if (keep.length > 1) out.push(keep);
    }
    return out;
}
/** Stats › Duplicates: each group of possible duplicates, and what tells each one apart */
export function dupesLook() {
    return dupGroups().map(ids => ({
        key: ids.join(","),
        title: titleById(ids[0]),
        entries: ids.flatMap(id => {
            const b = items.get(id);
            return b
                ? [
                      {
                          b: { ...b, id },
                          about: `${MEDIA[b.medium].one} · ${b.creator || ""} · ${statusWord(b.status, b.medium)} · from ${b.source || "you"} · added ${fmtDate(b.addedAt)}`,
                      },
                  ]
                : [];
        }),
    }));
}
export function mergeInto(keepId: string, ids: string[]) {
    const others = ids.filter(i => i !== keepId),
        order: Record<string, number> = { done: 5, active: 4, paused: 3, dnf: 2, want: 1, passed: 0 };
    change("Merge duplicates", [keepId, ...others], (b, id) => {
        if (id !== keepId) return null;
        if (!b) return undefined;
        const A = [b, ...others.map(o => items.get(o)).filter((x): x is Item => !!x)],
            m: Item = { ...b };
        for (const k of ["tags", "genres"] as const) m[k] = [...new Set(A.flatMap(x => x[k] || []))];
        m.quotes = A.flatMap(x => x.quotes || []);
        m.journal = A.flatMap(x => x.journal || []);
        m.log = A.flatMap(x => x.log || []);
        m.links = A.flatMap(x => x.links || []).filter(
            (l, i, a) => l.id !== keepId && !others.includes(l.id) && a.findIndex(y => y.id === l.id) === i
        );
        m.rating = Math.max(...A.map(x => x.rating || 0));
        m.prog = Math.max(...A.map(x => x.prog || 0));
        m.notes = A.map(x => x.notes)
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join("\n\n");
        m.status = A.map(x => x.status).sort((x, y) => order[y] - order[x])[0];
        m.copy = A.map(x => x.copy).find(c => c && c !== "none") || "none";
        m.ext = Object.assign({}, ...A.map(x => x.ext || {}).reverse());
        m.scores = Object.assign({}, ...A.map(x => x.scores || {}).reverse());
        for (const f of [
            "cover",
            "year",
            "total",
            "about",
            "why",
            "startedAt",
            "finishedAt",
            "favRank",
            "fav",
            "creator",
            "banner",
            "runtime",
            "kind",
            "lane",
            "vibe",
        ])
            if (!m[f]) m[f] = A.map(x => x[f]).find(Boolean) || m[f] || null;
        return m;
    });
    const sw = (q: string) => (others.includes(q) ? keepId : q),
        uniq = (v: string, i: number, a: string[]) => a.indexOf(v) === i;
    meta.queue = meta.queue.map(sw).filter(uniq);
    meta.favOrder = meta.favOrder.map(sw).filter(uniq);
    meta.lists = meta.lists.map(l => ({
        ...l,
        ids: l.ids.map(sw).filter(uniq),
        ...(l.rows ? { rows: l.rows.map(r => ({ ...r, ids: r.ids.map(sw).filter(uniq) })) } : {}),
    }));
    markDirty();
}
