// src/features/library/page/rows.ts
// ─────────────────────────────────────────────────────────────────
//  Rows: drawing only the rows of a long shelf that are near the screen
//
//  A big library (more than VIRTUAL_FROM entries on the page) doesn't draw every tile: each group draws the rows near
//  where you are, and stands an empty block in for the rows above and below, as tall as they are. A row here is a
//  row as the page lays it out: the tiles that fit across the shelf. The shelf keeps its own layout (a CSS grid for
//  Cover and Grid, wrapping spines or true-size covers, a table for List), so the tiles you see are laid out exactly
//  as when every one is drawn. This file only does the sums; LibraryGroup.svelte reads the page and draws.
//    gridRows    a CSS grid: the same number of tiles in every row
//    flowRows    wrapping tiles of different widths (spines, true-size covers): where each line breaks
//    RowSizes    each row's height, measured once it has been drawn, estimated until then; where each row starts
// ─────────────────────────────────────────────────────────────────

/** from how many entries on the page the library draws only what's near the screen */
export const VIRTUAL_FROM = 300;
/** how far beyond the screen rows are drawn, above and below, as a share of the window's height */
export const OVERSCAN = 1;

/** the first tile of each row, and n at the end: a grid of `cols` columns */
export function gridRows(n: number, cols: number): number[] {
    const c = Math.max(1, Math.floor(cols) || 1),
        out: number[] = [];
    for (let i = 0; i < n; i += c) out.push(i);
    out.push(n);
    return out;
}
/** the first tile of each line, and n at the end: tiles of these widths wrapping in `avail` pixels with `gap` between
 *  them, as a wrapping flexbox breaks them (a tile always goes on a line, even one wider than the shelf) */
export function flowRows(widths: number[], avail: number, gap: number): number[] {
    const out: number[] = [];
    let used = -1;
    for (let i = 0; i < widths.length; i++) {
        const w = widths[i];
        if (used < 0 || used + gap + w > avail + 0.01) {
            out.push(i);
            used = w;
        } else used += gap + w;
    }
    out.push(widths.length);
    return out;
}
/** a row's height before any has been measured */
const GUESS = 240;
/** a length as the browser lays it out: in 64ths of a pixel, rounded down */
export const layoutPx = (px: number) => Math.floor(px * 64) / 64;

/** each row's height: measured once drawn, estimated until then; and where each row starts, gaps included.
 *  estimate gives a row's height before it's drawn (0: as tall as a typical row, `typical`). The estimates don't
 *  follow what's measured, so a row drawn for the first time only moves what's below it */
export class RowSizes {
    private h: number[] = [];
    private known: boolean[] = [];
    private at: number[] = [0];
    private dirty = true;
    constructor(
        private count: number,
        private estimate: (row: number) => number,
        private gap: number,
        private typical = GUESS
    ) {}
    /** other rows, measured again from nothing (the shelf's width or the tiles changed) */
    reset(count: number, estimate: (row: number) => number, gap: number, typical: number) {
        this.count = count;
        this.estimate = estimate;
        this.gap = gap;
        this.typical = typical || GUESS;
        this.h = [];
        this.known = [];
        this.dirty = true;
    }
    get rows() {
        return this.count;
    }
    /** a row's height, as measured; returns whether that changed anything */
    measured(row: number, px: number): boolean {
        if (row < 0 || row >= this.count || (this.known[row] && Math.abs(this.h[row] - px) < 0.01)) return false;
        this.h[row] = px;
        this.known[row] = true;
        this.dirty = true;
        return true;
    }
    height(row: number) {
        return this.known[row] ? this.h[row] : this.estimate(row) || this.typical;
    }
    /** where row r starts, from the top of the first row */
    top(r: number) {
        this.sums();
        return this.at[Math.max(0, Math.min(r, this.count))];
    }
    /** the height of rows [a, b) and the gaps between them */
    span(a: number, b: number) {
        if (b <= a) return 0;
        return this.top(b) - this.top(a) - this.gap;
    }
    /** the rows [a, b) that reach into [from, to], measured from the top of the first row */
    within(from: number, to: number): [number, number] {
        this.sums();
        const n = this.count;
        if (!n || to < 0 || from > this.at[n]) return [0, 0];
        // the first row whose bottom is below `from`, and the first whose top is past `to`
        let lo = 0,
            hi = n;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.at[mid] + this.height(mid) < from) lo = mid + 1;
            else hi = mid;
        }
        const a = lo;
        hi = n;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.at[mid] <= to) lo = mid + 1;
            else hi = mid;
        }
        return [a, Math.max(a, lo)];
    }
    private sums() {
        if (!this.dirty) return;
        const at = new Array<number>(this.count + 1);
        at[0] = 0;
        for (let r = 0; r < this.count; r++) at[r + 1] = at[r] + this.height(r) + this.gap;
        this.at = at;
        this.dirty = false;
    }
}
