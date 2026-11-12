// src/features/library/custom-stats.ts
// ─────────────────────────────────────────────────────────────────
//  More stats, and stats you build yourself: pick what to measure, what to split it by, and how to draw it
// ─────────────────────────────────────────────────────────────────

import { dayKey, fmtScore, MEDIA, minutesSpent, present, shelfOfItem, statusWord, toList } from "../core/core";
import { crowd, endedAt } from "../core/views";
import { kindShown } from "../core/types";
import { BLOCKS } from "./blocks";
import { CHART_TYPES, STAT_BLOCKS } from "./statblocks";
import type { BlockBase, BlockDef, OvExtra } from "./blocks";
import type { StExtra } from "./statblocks";
import type { BlockSpec, Entry } from "../core/model";

/** what a stat you build can measure */
export const STAT_MEASURES: [key: string, name: string][] = [
    ["count", "How many"],
    ["done", "How many finished"],
    ["hours", "Hours spent"],
    ["avg", "Your average score"],
    ["crowd", "Average crowd score"],
    ["gap", "You vs the crowd"],
];
/** what it can split by: key, name, and the group (or groups) an entry is in */
type Split = [key: string, name: string, of: (b: Entry) => string | number | string[] | null];
export const STAT_SPLITS: Split[] = [
    ["type", "Type", b => kindShown(b) || MEDIA[b.medium].name],
    ["medium", "Medium", b => MEDIA[b.medium].name],
    ["genre", "Genre", b => b.genres || []],
    ["theme", "Theme", b => b.themes || []],
    ["status", "Status", b => statusWord(b.status, b.medium)],
    ["year", "Release year", b => b.year || null],
    ["decade", "Decade", b => (b.year ? Math.floor(b.year / 10) * 10 + "s" : null)],
    [
        "finished",
        "Year finished",
        b => (b.status === "done" && endedAt(b) ? dayKey(endedAt(b)).slice(0, 4) || null : null),
    ],
    ["creator", "Creator", b => (b.creator ? b.creator.split(/ & |, /).slice(0, 2) : null)],
    ["tag", "Your tags", b => b.tags || []],
    [
        "shelf",
        "Shelf",
        b => {
            const s = shelfOfItem(b);
            return s ? s.name : null;
        },
    ],
];
/** a row of a stat you built: the group, its value, and how many it's from */
type StatRow = [label: string, value: number, n: number];
function statRows(A: Entry[], cfg: Partial<BlockSpec>): StatRow[] {
    const by = (STAT_SPLITS.find(x => x[0] === cfg.by) || STAT_SPLITS[0])[2],
        me = cfg.metric || "count",
        min = cfg.min || (["avg", "crowd", "gap"].includes(me) ? 3 : 1);
    const src = cfg.fin ? A.filter(b => b.status === "done") : A,
        G = new Map<string | number, Entry[]>();
    for (const b of src)
        for (const k of toList<string | number>(by(b) || []))
            if (k != null && k !== "") {
                const g = G.get(k);
                if (g) g.push(b);
                else G.set(k, [b]);
            }
    const val = (L: Entry[]) =>
        me === "count"
            ? L.length
            : me === "done"
              ? L.filter(b => b.status === "done").length
              : me === "hours"
                ? Math.round(L.reduce((a, b) => a + minutesSpent(b), 0) / 60)
                : me === "avg"
                  ? avgOf(L.map(b => b.rating).filter((v): v is number => !!v))
                  : me === "crowd"
                    ? avgOf(L.map(b => crowd(b).avg).filter(present))
                    : avgOf(
                          L.map(b => {
                              const c = crowd(b).avg;
                              return b.rating && c != null ? b.rating * 10 - c : null;
                          }).filter(present)
                      );
    const n = (L: Entry[]) =>
        me === "avg"
            ? L.filter(b => b.rating).length
            : me === "crowd"
              ? L.filter(b => crowd(b).avg != null).length
              : me === "gap"
                ? L.filter(b => b.rating && crowd(b).avg != null).length
                : L.length;
    const rows = [...G.entries()]
        .filter(([, L]) => n(L) >= min)
        .map(([k, L]) => ({ k: String(k), v: val(L), n: n(L) }))
        .flatMap(({ k, v, n }): StatRow[] => (v != null && (v || me === "gap") ? [[k, v, n]] : []));
    rows.sort((a, b) =>
        cfg.by === "year" || cfg.by === "decade" || cfg.by === "finished"
            ? String(a[0]).localeCompare(String(b[0]))
            : b[1] - a[1]
    );
    return rows.slice(0, cfg.n || 12);
}
const avgOf = (V: number[]) => (V.length ? Math.round((V.reduce((a, v) => a + v, 0) / V.length) * 10) / 10 : null);
const statFmt = (me: string): ((v: number) => string | number) =>
    me === "avg"
        ? v => fmtScore(v)
        : me === "hours"
          ? v => (v >= 1000 ? (v / 1000).toFixed(1) + "k h" : v + " h")
          : me === "gap"
            ? v => (v > 0 ? "+" : "") + v
            : v => v;
// the blocks this file adds: made at start-up, as they share CHART_TYPES with statblocks.ts
/** these blocks go on both pages: they count the stats page's entries, or the overview's */
type BothExtra = Partial<StExtra> & Partial<OvExtra>;
const entriesOf = (c: BothExtra) => c.A || c.M || [];
function plusBlocks(): Record<string, BlockDef<BothExtra>> {
    const customBlock: BlockDef<BothExtra> = {
        name: "Your own stat",
        d: "Choose what to measure, how to split it and how to draw it (⋯ to set up)",
        w: 6,
        type: "bars",
        types: CHART_TYPES,
        n: 10,
        custom: true,
        chart: (c: BlockBase & BothExtra) => {
            const cfg = c.cfg || {},
                rows = statRows(entriesOf(c), { ...cfg, n: c.n }),
                me = cfg.metric || "count";
            return {
                desc: `${(STAT_MEASURES.find(x => x[0] === me) || STAT_MEASURES[0])[1]} by ${(STAT_SPLITS.find(x => x[0] === cfg.by) || STAT_SPLITS[0])[1].toLowerCase()}${cfg.fin ? ", finished only" : ""}`,
                gap: me === "gap",
                rows: rows.map(([l, v]) => ({ l, v: me === "gap" ? v : Math.max(0, v) })),
                fmt: statFmt(me),
            };
        },
    };
    /** your score by genre or theme: each with how many you scored */
    const byScore = (by: string) => (c: BlockBase & BothExtra) => ({
        rows: statRows(entriesOf(c), { by, metric: "avg", n: c.n }).map(([l, v, n]) => ({ l, sub: String(n), v })),
        fmt: statFmt("avg"),
    });
    return {
        timetype: {
            ...customBlock,
            name: "Time by type",
            d: "Hours on each type (anime, film, novel…)",
            w: 6,
            custom: false,
            chart: c => ({
                rows: statRows(entriesOf(c), { by: "type", metric: "hours", n: c.n }).map(([l, v]) => ({ l, v })),
                fmt: statFmt("hours"),
            }),
        },
        genrescore: {
            ...customBlock,
            name: "Genres by your score",
            d: "Genres you rate highest (at least 3 scored)",
            w: 6,
            custom: false,
            type: "list",
            chart: byScore("genre"),
        },
        themescore: {
            ...customBlock,
            name: "Themes by your score",
            d: "The themes (time travel, found family…) you rate highest",
            w: 6,
            custom: false,
            type: "list",
            chart: byScore("theme"),
        },
        crowdgap: {
            ...customBlock,
            name: "You vs the crowd, by genre",
            d: "Where your taste parts from everyone else's",
            w: 6,
            custom: false,
            chart: c => ({
                gap: true,
                rows: statRows(entriesOf(c), { by: "genre", metric: "gap", n: c.n }).map(([l, v]) => ({ l, v })),
            }),
        },
        custom: customBlock,
    };
}
// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initCustomStats() {
    const PLUS_BLOCKS = plusBlocks();
    Object.assign(STAT_BLOCKS, PLUS_BLOCKS);
    Object.assign(BLOCKS, Object.fromEntries(Object.entries(PLUS_BLOCKS).map(([k, d]) => [k, { ...d }])));
}
