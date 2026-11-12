// src/features/library/blocks.ts
// ─────────────────────────────────────────────────────────────────
//  Overview: a grid of blocks you arrange per mode (drag to move, − to remove, + to add, S/M/L/Full widths)
//
//  What each block is (its name, what it shows, its usual width, what can be set) is here, with what the blocks work
//  out (activeOf, nextUp, healthOf…) and where a mode's layout comes from. The overview and the stats page draw them
//  as components (blocks/BlockGrid.svelte, each block's component listed in blocks/views.ts and stats/views.ts); a
//  block that's a chart says what it shows (chart) and is drawn by blocks/ChartBlock.svelte.
// ─────────────────────────────────────────────────────────────────

import {
    cleanTitle,
    entryOf,
    fmtScore,
    inMode,
    isSealed,
    items,
    markDirty,
    meta,
    present,
    titleOf,
    ui,
} from "../core/core";
import { coverSrc } from "../sources/covers";
import { ago, crowd, dupGroups, visible } from "../core/views";
import { hasAnimanga, type modeProfile, renderMain } from "../core/shell";
import { DEFAULT_STATS, STAT_BLOCKS } from "./statblocks";
import type { BlockSpec, Entry, Mode } from "../core/model";
import type { Fmt, Row } from "./blocks/charts";

/** what every block is drawn with: its mode, its saved settings, how many it shows and how it's drawn */
export interface BlockBase {
    mode: Mode;
    cfg: BlockSpec;
    n: number;
    type?: string;
}
/** the overview's blocks also get the mode's entries and profile */
export interface OvExtra {
    M: Entry[];
    mp: ReturnType<typeof modeProfile>;
}
/** a block, apart from how it draws: what the menus and the grid need */
export interface BlockInfo {
    name: string;
    d: string; // what it shows
    w: number; // its usual width, of 12
    n?: number; // how many it shows, when you can choose
    rows?: number; // rows of covers, when you can choose
    nums?: boolean; // it can hide position numbers
    custom?: boolean; // a stat you set up yourself
    link?: [act: string, k: string]; // its "All" button
    only?: (m: Mode) => boolean; // offered only in some modes
    type?: string; // how it's drawn, when it can be drawn several ways
    types?: [key: string, name: string][];
}
/** what a chart block shows: its rows, how its numbers are written, and a line above it; gap: bars either side of
 *  the middle (you against the crowd) */
export interface ChartData {
    rows: Row[];
    fmt?: Fmt;
    gap?: boolean;
    desc?: string;
}
/** a block drawn from X (the page's own data): by its component, or as a chart of these rows */
export interface BlockDef<X> extends BlockInfo {
    chart?: (c: BlockBase & X) => ChartData;
}
/** what an overview block is given */
export type OvBlock = BlockBase & OvExtra;

export const activeOf = (M: Entry[]) =>
    M.filter(b => b.status === "active" || b.status === "redo").sort((a, b) =>
        String(b.lastAt || b.startedAt || "").localeCompare(String(a.lastAt || a.startedAt || ""))
    );
// what to start next: what you're in, your queue, sequels to things you finished, then the best-loved things you planned
export function nextUp(M: Entry[], n = 6) {
    const done = new Set(M.filter(b => b.status === "done").map(b => b.id)),
        out = new Map<string, { b: Entry; s: number; why: string }>(),
        add = (b: Entry, s: number, why: string) => {
            const e = out.get(b.id);
            if (!e || e.s < s) out.set(b.id, { b, s, why });
        };
    for (const b of M.filter(b => b.status === "paused"))
        add(b, 70, "Paused " + (b.lastAt ? ago(b.lastAt) : "a while ago"));
    meta.queue.forEach((id, i) => {
        const b = M.find(x => x.id === id);
        if (b && b.status === "want") add(b, 90 - i, `#${i + 1} in Up next`);
    });
    for (const b of M.filter(b => b.status === "want")) {
        const prev = (b.links || [])
            .map(l => (l.type === "prequel" && done.has(l.id) ? items.get(l.id) : undefined))
            .find(present);
        if (prev) add(b, 85, `Sequel to ${cleanTitle(titleOf(prev))}`);
        const src = (b.links || [])
            .map(l => (l.type === "adaptation" && done.has(l.id) ? items.get(l.id) : undefined))
            .find(x => (x?.rating || 0) >= 8);
        if (src) add(b, 75, `You gave ${cleanTitle(titleOf(src))} ${fmtScore(src.rating)}`);
        const c = crowd(b).avg;
        if (c) add(b, c / 2, `Crowd ${c}/100`);
    }
    return [...out.values()].sort((a, b) => b.s - a.s).slice(0, n);
}
export function healthOf(M: Entry[]) {
    const now = Date.now();
    return {
        dupes: dupGroups().filter(g => g.some(id => M.some(b => b.id === id))).length,
        noCover: M.filter(b => !coverSrc(b)).length,
        unscored: M.filter(b => b.status === "done" && !b.rating).length,
        stale: M.filter(
            b => b.status === "active" && Date.parse(b.lastAt || b.startedAt || b.addedAt || "") < now - 60 * 864e5
        ).length,
        noYear: M.filter(b => !b.year).length,
        hidden: [...items.values()].filter(
            b => b.hidden && inMode(b) && !!b.private === !!ui.private && (!isSealed(b) || ui.private)
        ).length,
    };
}
/** your queue, as the blocks show it: what's in this mode and can be seen */
export const queueOf = () =>
    meta.queue
        .map(id => entryOf(id))
        .filter(present)
        .filter(b => b.title && visible(b) && inMode(b));
/** the block just added (blk-add, handlers.ts), so the grid can flash it once */
export const blockAdded = { kind: "", at: 0 };
// numbers count up the first time you open a mode's overview, not every time something changes
const countedUp = new Set<string>();
/** whether this mode's overview counts up now: only the first time it's asked for each */
export function countUpOnce(key: string) {
    if (countedUp.has(key)) return false;
    countedUp.add(key);
    return true;
}
/** the overview's blocks (each drawn by its component, blocks/views.ts) */
export const BLOCKS: Record<string, BlockDef<OvExtra>> = {
    summary: { name: "Summary", d: "Totals for this mode", w: 12 },
    bio: { name: "About you", d: "Your bio for this mode", w: 12 },
    favs: {
        name: "Favourites",
        d: "Fills whole rows; choose how many",
        w: 8,
        rows: 2,
        nums: true,
        link: ["tab", "favourites"],
    },
    chars: {
        name: "Characters",
        d: "Your favourite characters from this mode",
        w: 8,
        rows: 1,
        link: ["tab", "favourites"],
    },
    progress: { name: "In progress", d: "Where you are, with quick +1", w: 4, n: 8 },
    airing: { name: "Coming up", d: "Next episodes and chapters (AniList)", w: 4 },
    queue: { name: "Up next", d: "Your queue", w: 4, link: ["go-list", "queue"] },
    nextup: {
        name: "Next up",
        d: "Your priority order (drag to change it), then suggestions",
        w: 4,
        n: 6,
        link: ["go-list", "queue"],
    },
    quicklog: { name: "Quick log", d: "Log progress or a finish in one go", w: 4 },
    recent: { name: "Recently ended", d: "Finished or dropped lately", w: 12, n: 16 },
    shelves: { name: "Shelves", d: "Totals per shelf", w: 8 },
    genres: { name: "Top genres", d: "What you have most of", w: 6, n: 7 }, // its chart: statblocks.ts
    activity: { name: "Activity", d: "Every day you logged or finished something", w: 6 },
    lists: { name: "Lists", d: "Your lists for this mode", w: 12, link: ["tab", "lists"] },
    health: { name: "Library health", d: "Duplicates, gaps and stalled things to tidy", w: 4 },
    revisits: { name: "Revisits", d: "What you've watched, read or played again", w: 6, n: 10 },
    year: { name: "This year", d: "Month by month, and your best so far", w: 6 },
    seasonal: { name: "This season", d: "Anime airing this season (AniList)", w: 12, only: m => hasAnimanga(m) },
    diary: { name: "Diary", d: "What you watched, most recent first", w: 6 },
    playing: { name: "Now playing", d: "Hours, platform and how far", w: 8 },
    series: { name: "Series", d: "Series you're partway through", w: 6 },
    quote: { name: "A quote", d: "One of the lines you saved", w: 4 },
    discover: { name: "Insights", d: "How often you finish what you start, by genre", w: 6 },
};
/** a block in a default layout: its key, width, rows and how it's drawn */
type DefaultBlock = [k: string, w?: number, rows?: number, type?: string];
const DEFAULT_BLOCKS: Record<string, DefaultBlock[]> = {
    universal: [
        ["summary"],
        ["favs", 8, 2],
        ["progress", 4],
        ["nextup", 4],
        ["health", 4],
        ["genres", 4],
        ["recent"],
        ["shelves", 6],
        ["activity", 6],
        ["lists"],
    ],
    animanga: [
        ["summary"],
        ["favs", 8, 2],
        ["airing", 4],
        ["progress", 4],
        ["chars", 8],
        ["queue", 4],
        ["seasonal"],
        ["recent"],
        ["genres", 6],
        ["activity", 6],
    ],
    novels: [
        ["summary"],
        ["favs", 8, 2],
        ["progress", 4],
        ["quote", 4],
        ["series", 6],
        ["year", 6],
        ["recent"],
        ["genres", 6],
        ["lists", 6],
    ],
    screen: [
        ["summary"],
        ["favs", 8, 2],
        ["diary", 4],
        ["progress", 6],
        ["revisits", 6],
        ["chars", 8],
        ["queue", 4],
        ["recent"],
        ["genres", 6],
        ["activity", 6],
    ],
    games: [["summary"], ["playing", 8], ["nextup", 4], ["favs", 12, 1], ["recent"], ["genres", 6], ["year", 6]],
    academic: [["summary"], ["learn", 12], ["paths", 8], ["progress", 4], ["recent"], ["shelves", 12]],
    sealed: [["summary"], ["favs", 8, 2], ["progress", 4], ["recent"]],
};
// two kinds of block page share one engine: the overview ("ov") and stats ("st")
/** a kind of block page: where its blocks are kept, and its defaults */
interface BlockKind {
    reg: () => Record<string, BlockInfo>;
    key: "blocks" | "statBlocks";
    defs: (id: string) => DefaultBlock[];
    word: string;
}
export const BKIND: Record<string, BlockKind> = {
    ov: {
        reg: () => BLOCKS,
        key: "blocks",
        defs: id => DEFAULT_BLOCKS[id] || DEFAULT_BLOCKS.universal,
        word: "overview",
    },
    st: {
        reg: () => STAT_BLOCKS,
        key: "statBlocks",
        defs: id => DEFAULT_STATS[id] || DEFAULT_STATS.universal,
        word: "stats page",
    },
};
// a mode uses its own layout if you saved one there, otherwise the layout you shared with every mode, otherwise its default
export function blocksOf(mode: Mode, kind = "ov"): BlockSpec[] {
    const K = BKIND[kind],
        R = K.reg(),
        own = mode[K.key],
        shared = (meta.layout.shared || {})[K.key];
    const L =
        own && own.length
            ? own
            : shared && shared.length
              ? shared
              : K.defs(mode.id).map(([k, w, rows, type]) => ({ k, w: w || R[k].w, rows, type }));
    return L.filter(x => {
        const def = R[x.k];
        return !!def && (!def.only || def.only(mode));
    });
}
/** where a mode's layout comes from: its own, the one every mode shares, or its default */
export const blockSource = (mode: Mode, kind = "ov") =>
    (mode[BKIND[kind].key] || []).length
        ? "own"
        : ((meta.layout.shared || {})[BKIND[kind].key] || []).length
          ? "shared"
          : "default";
export function setBlocks(mode: Mode, fn: (blocks: BlockSpec[]) => BlockSpec[], kind = "ov") {
    mode[BKIND[kind].key] = fn(blocksOf(mode, kind).map(x => ({ ...x })));
    markDirty();
    renderMain();
}
// favourites and characters fill whole rows: never one lonely cover on the last line
export function fitRows(within: ParentNode) {
    for (const g of within.querySelectorAll<HTMLElement>(".fillrows")) {
        const cols = getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length || 1,
            rows = Number(g.dataset.rows) || 2,
            kids = [...g.children],
            n = kids.length;
        let show = Math.min(n, cols * rows);
        if (n > cols && show % cols) show -= show % cols;
        kids.forEach((k, i) => {
            if (k instanceof HTMLElement) k.style.display = i < show ? "" : "none";
        });
    }
}
// masonry: each block spans as many 6px rows as it's tall, and dense packing fills the gaps
export function packBlocks(grid: HTMLElement) {
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    for (const b of grid.children) {
        if (!(b instanceof HTMLElement)) continue;
        b.style.gridRowEnd = "auto";
        const h = b.getBoundingClientRect().height;
        b.style.gridRowEnd = "span " + Math.max(1, Math.ceil((h + gap) / (6 + gap)));
    }
}
