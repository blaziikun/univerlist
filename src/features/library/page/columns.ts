// src/features/library/page/columns.ts
// ─────────────────────────────────────────────────────────────────
//  Columns: keeping a long table's columns as wide as when every row is drawn
//
//  A table lays its columns out from what's in every row: each column is as wide as its widest text allows, and no
//  narrower than its longest word. A big library draws only the rows near the window (rows.ts), so the widths would
//  change with the rows drawn. Instead the table also holds, out of sight (visibility: collapse, which takes no
//  height but still counts for the widths), the few rows that decide each column: the widest texts and the longest
//  words, measured here with the column's own font. With those in, the drawn rows can't change a width, and the
//  columns come out as they did when the whole table was drawn.
// ─────────────────────────────────────────────────────────────────

import { fmtDate, fmtScore, MEDIA, scaleOf, statusWord, titleOf, unitOf } from "../../core/core";
import { crowd, endedAt, progText } from "../../core/views";
import { kindShown } from "../../core/types";
import type { Entry } from "../../core/model";

/** what a row of the List view shows in each cell (ListRow.svelte draws it; sizingRows measures it) */
export function listCells(b: Entry) {
    const c = crowd(b),
        ended = endedAt(b);
    return {
        title: titleOf(b),
        type: b.kind === "Academic" ? b.subject || "Academic" : kindShown(b) || MEDIA[b.medium].one,
        genres: (b.genres || []).slice(0, 2).join(", "),
        prog: b.status === "done" && b.medium !== "film" ? (b.total ? b.total + " " + unitOf(b)[2] : "") : progText(b),
        status: statusWord(b.status, b.medium),
        want: statusWord("want", b.medium),
        score: b.rating ? fmtScore(b.rating, scaleOf(b)) : "",
        crowd: c.avg != null ? String(c.avg) : "",
        crowdTitle: c.parts.map(p => p.label + " " + p.show).join(" · "),
        ended: ended ? fmtDate(ended) : "",
    };
}
/** the text of each of a row's twelve cells, as the table shows them */
export function cellTexts(b: Entry): string[] {
    const c = listCells(b);
    return [
        "",
        "",
        c.title + (b.fav ? " ♥" : ""),
        b.creator || "",
        c.type,
        c.genres,
        String(b.year || ""),
        c.prog,
        b.status === "want" ? c.want : c.status,
        c.score,
        c.crowd,
        c.ended,
    ];
}

/** how many of the widest texts (and longest words) of each column to keep: a little more than one, as a canvas
 *  measures text a hair differently from the page */
const KEEP = 4;
/** a column with no more different texts than this keeps one row for each (statuses, types) */
const FEW = 24;

let ctx: CanvasRenderingContext2D | null = null;
/** the entries whose cells decide the columns' widths. texts: each entry's cells, as the table shows them; fonts:
 *  each column's font, as the page sets it ("" for a column whose width doesn't come from text) */
export function sizingRows(list: Entry[], texts: (b: Entry) => string[], fonts: string[]): Entry[] {
    ctx = ctx || document.createElement("canvas").getContext("2d");
    if (!ctx || !list.length) return [];
    const c2d = ctx,
        cells = list.map(texts),
        keep = new Set<number>();
    for (let col = 0; col < fonts.length; col++) {
        if (!fonts[col]) continue;
        c2d.font = fonts[col];
        const seen = new Map<string, number>(); // each different text, and the first row that has it
        for (let i = 0; i < list.length; i++) if (!seen.has(cells[i][col])) seen.set(cells[i][col], i);
        if (seen.size <= FEW) {
            for (const i of seen.values()) keep.add(i);
            continue;
        }
        const widths = new Map<string, number>(),
            measure = (s: string) => {
                let w = widths.get(s);
                if (w == null) widths.set(s, (w = c2d.measureText(s).width));
                return w;
            };
        const all = [...seen.entries()].map(([text, i]) => ({
            i,
            whole: measure(text),
            word: Math.max(0, ...text.split(/\s+/).map(measure)),
        }));
        for (const by of ["whole", "word"] as const)
            for (const x of all.sort((a, b) => b[by] - a[by]).slice(0, KEEP)) keep.add(x.i);
    }
    return [...keep].sort((a, b) => a - b).map(i => list[i]);
}
