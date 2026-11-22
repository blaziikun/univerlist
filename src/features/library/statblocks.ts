// src/features/library/statblocks.ts
// ─────────────────────────────────────────────────────────────────
//  Stats as blocks: each one can be shown as bars, columns, a donut or a ranked list
//
//  The stats page's blocks (STAT_BLOCKS): most are a chart of rows (chart), drawn by blocks/ChartBlock.svelte; the
//  others (the totals, the stacked charts, the activity grid, your highest scores, you against the crowd) are worked
//  out by statLook() and drawn by stats/StatBlock.svelte. The overview's chart blocks are set up here too.
// ─────────────────────────────────────────────────────────────────

import {
    catOf,
    fmtScore,
    MEDIA,
    minutesSpent,
    monthKey,
    SERIES,
    shelvesOf,
    STATUS,
    STATUS_WORDS,
    toList,
} from "../core/core";
import { type activityStats, crowd, favPos, groupWord, mine } from "../core/views";
import { BLOCKS } from "./blocks";
import type { BlockBase, BlockDef } from "./blocks";
import type { Column, Fmt } from "./blocks/charts";
import { splitNames } from "./connect";
import type { Entry } from "../core/model";

/** the stats page's blocks also get the entries counted and your activity */
export interface StExtra {
    A: Entry[];
    st: ReturnType<typeof activityStats>;
}
/** what a stats block is given */
export type StBlock = BlockBase & StExtra;
/** a chart's rows: a label and a number */
type ChartRow = [label: string, value: number];

export const CHART_TYPES: [key: string, name: string][] = [
    ["bars", "Bars"],
    ["cols", "Columns"],
    ["donut", "Donut"],
    ["list", "List"],
];
const countBy = (A: Entry[], f: (b: Entry) => string | string[] | null | undefined, n = 12): ChartRow[] => {
    const m: Record<string, number> = {};
    for (const b of A) for (const k of toList(f(b) || [])) if (k != null && k !== "") m[k] = (m[k] || 0) + 1;
    return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
};
/** a block that's a chart of rows: anything it shows can be drawn as bars, columns, a donut or a list */
const dataBlock = (
    name: string,
    d: string,
    w: number,
    type: string,
    rowsOf: (c: StBlock) => ChartRow[],
    extra: { n?: number; fmt?: Fmt; only?: BlockDef<StExtra>["only"] } = {}
): BlockDef<StExtra> => ({
    name,
    d,
    w,
    type,
    types: CHART_TYPES,
    n: extra.n || 10,
    ...extra,
    chart: c => ({ rows: rowsOf(c).map(([l, v]) => ({ l, v })), fmt: extra.fmt }),
});
export const STAT_BLOCKS: Record<string, BlockDef<StExtra>> = {
    tiles: { name: "Totals", d: "Items, finished, time, mean score, streak", w: 12 },
    month: { name: "Finished per month", d: "The last 12 months, by family", w: 6 },
    hours: { name: "Hours per week", d: "Logged sessions, last 16 weeks", w: 6 },
    heat: { name: "Activity", d: "Every day you logged or finished something", w: 8 },
    shelves: dataBlock("By shelf", "How many on each shelf", 4, "donut", c =>
        shelvesOf()
            .map((s): ChartRow => [s.name, c.A.filter(b => s.test(b)).length])
            .filter(r => r[1])
    ),
    time: dataBlock(
        "Time by shelf",
        "Hours on each shelf",
        4,
        "bars",
        c =>
            shelvesOf()
                .map(
                    (s): ChartRow => [
                        s.name,
                        Math.round(c.A.filter(b => s.test(b)).reduce((a, b) => a + minutesSpent(b), 0) / 60),
                    ]
                )
                .filter(r => r[1]),
        { fmt: v => (v >= 1000 ? (v / 1000).toFixed(1) + "k h" : v + " h") }
    ),
    status: dataBlock("By status", "Planned, in progress, finished…", 4, "bars", c =>
        STATUS.map((s): ChartRow => [STATUS_WORDS[groupWord()][s], c.A.filter(b => b.status === s).length]).filter(
            r => r[1]
        )
    ),
    genres: dataBlock("Top genres", "What you have most of", 6, "bars", c => countBy(c.A, b => b.genres, c.n), {
        n: 12,
    }),
    scores: dataBlock("Your scores", "How often you give each score", 6, "cols", c =>
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
            (r): ChartRow => [fmtScore(r), c.A.filter(b => b.rating && Math.round(b.rating) === r).length]
        )
    ),
    types: dataBlock(
        "Types",
        "TV, films, novels, manhwa…",
        4,
        "donut",
        c => countBy(c.A, b => b.kind || MEDIA[b.medium].name, c.n),
        { n: 8 }
    ),
    decades: dataBlock("Release decades", "When the things you have came out", 6, "cols", c =>
        countBy(c.A, b => (b.year ? Math.floor(b.year / 10) * 10 + "s" : null), 20).sort((a, b) =>
            a[0].localeCompare(b[0])
        )
    ),
    creators: dataBlock(
        "Creators and studios",
        "Who made the most of what you have",
        4,
        "list",
        c => countBy(c.A, b => splitNames(b.creator).slice(0, 2), c.n),
        { n: 10 }
    ),
    themes: dataBlock(
        "Themes",
        "Tags from AniList and your own",
        4,
        "bars",
        c => countBy(c.A, b => [...(b.themes || []), ...(b.tags || [])], c.n),
        { n: 10 }
    ),
    platforms: dataBlock(
        "Platforms",
        "What you play on",
        4,
        "donut",
        c =>
            countBy(
                c.A.filter(b => b.medium === "game"),
                b => b.platform || (b.platforms || [])[0],
                c.n
            ),
        { n: 8, only: m => (m.match || []).some(p => p === "*" || p.startsWith("game")) || m.id === "games" }
    ),
    loved: { name: "Highest scores", d: "Your top-rated", w: 12, n: 12 },
    crowd: { name: "You vs the crowd", d: "Where you differ most", w: 6, n: 6 },
};
/** what a stats block that isn't a chart of rows shows */
export function statLook(c: StBlock) {
    switch (c.cfg.k) {
        case "tiles": {
            const A = c.A,
                fin = A.filter(b => b.status === "done"),
                rated = A.filter(b => b.rating);
            return {
                k: "tiles" as const,
                n: A.length,
                fin: fin.length,
                year: c.st.doneYear,
                days: (A.reduce((a, b) => a + minutesSpent(b), 0) / 1440).toFixed(1),
                mean: rated.length ? fmtScore(rated.reduce((a, b) => a + (b.rating || 0), 0) / rated.length) : "–",
                streak: c.st.streak,
                longest: c.st.longest,
            };
        }
        case "month": {
            const fin = c.A.filter(b => b.status === "done"),
                months: Column[] = [],
                d = new Date();
            d.setDate(1);
            for (let i = 11; i >= 0; i--) {
                const m = new Date(d.getFullYear(), d.getMonth() - i, 1),
                    key = monthKey(m);
                months.push({
                    l: m.toLocaleDateString("en-GB", { month: "short" }),
                    v: SERIES.map(s => fin.filter(b => catOf(b) === s[0] && monthKey(b.finishedAt) === key).length),
                });
            }
            return {
                k: "stack" as const,
                present: SERIES.map((_, i) => months.some(x => x.v[i])),
                cols: months,
                fmt: undefined,
                unit: "",
            };
        }
        case "hours": {
            const weeks: Column[] = [];
            for (let i = 15; i >= 0; i--) {
                const end = Date.now() - i * 7 * 864e5,
                    start = end - 7 * 864e5;
                weeks.push({
                    l: new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
                    v: SERIES.map(
                        s =>
                            Math.round(
                                (c.st.ss
                                    .filter(
                                        x =>
                                            catOf(x.b) === s[0] &&
                                            Date.parse(x.date) > start &&
                                            Date.parse(x.date) <= end
                                    )
                                    .reduce((a, x) => a + x.min, 0) /
                                    60) *
                                    10
                            ) / 10
                    ),
                });
            }
            return {
                k: "stack" as const,
                present: SERIES.map((_, i) => weeks.some(x => x.v[i])),
                cols: weeks,
                fmt: (v: number) => Math.round(v * 10) / 10,
                unit: " h",
            };
        }
        case "heat":
            return { k: "heat" as const };
        case "loved":
            return {
                k: "loved" as const,
                top: c.A.filter(b => b.rating)
                    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || favPos(a.id) - favPos(b.id))
                    .slice(0, c.n),
            };
        case "crowd": {
            // every one of these has your score and a crowd score (the filter)
            const D = c.A.filter(b => b.rating && crowd(b).avg != null)
                .map(b => ({ ...b, d: (mine(b) ?? 0) - (crowd(b).avg ?? 0) }))
                .sort((a, b) => b.d - a.d);
            return { k: "crowd" as const, lovesMore: D.slice(0, c.n), lovesLess: D.slice(-c.n).reverse() };
        }
    }
    return { k: "" as const };
}
export const DEFAULT_STATS: Record<string, [k: string, w?: number, rows?: number, type?: string][]> = {
    universal: [
        ["tiles"],
        ["month", 6],
        ["hours", 6],
        ["heat", 8],
        ["shelves", 4, 0, "donut"],
        ["genres", 6],
        ["scores", 6, 0, "cols"],
        ["time", 4],
        ["status", 4],
        ["types", 4, 0, "donut"],
        ["loved"],
    ],
    games: [
        ["tiles"],
        ["platforms", 4, 0, "donut"],
        ["genres", 4],
        ["scores", 4, 0, "cols"],
        ["month", 6],
        ["heat", 6],
        ["loved"],
    ],
};
// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initStatblocks() {
    // overview blocks that are just counts can be drawn any of the chart ways too
    BLOCKS.genres = {
        ...BLOCKS.genres,
        type: "bars",
        types: CHART_TYPES,
        chart: c => ({ rows: countBy(c.M, b => b.genres, c.n).map(([l, v]) => ({ l, v })) }),
    };
    BLOCKS.types = BLOCKS.types || {
        name: "Types",
        d: "TV, films, novels, manhwa…",
        w: 4,
        n: 8,
        type: "donut",
        types: CHART_TYPES,
        chart: c => ({ rows: countBy(c.M, b => b.kind || MEDIA[b.medium].name, c.n).map(([l, v]) => ({ l, v })) }),
    };
    BLOCKS.statuses = BLOCKS.statuses || {
        name: "By status",
        d: "Planned, in progress, finished…",
        w: 4,
        type: "donut",
        types: CHART_TYPES,
        chart: c => ({
            rows: STATUS.map(s => ({
                l: STATUS_WORDS[groupWord()][s],
                v: c.M.filter(b => b.status === s).length,
            })).filter(r => r.v),
        }),
    };
}
