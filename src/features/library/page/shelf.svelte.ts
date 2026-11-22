// src/features/library/page/shelf.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  Shelf window: which rows of one group a big library draws, from where the group sits on the page
//
//  LibraryGroup and ListGroup each keep one. After every draw, and whenever you scroll or the page moves, update()
//  reads the shelf as the browser laid it out: how many tiles fit across it (a CSS grid's columns, or where wrapping
//  tiles break), how tall each drawn row is, and where the shelf is on the page. It then picks the rows near the
//  window (a window's height above and below), and how tall the empty blocks standing in for the rest must be.
//  The sums are rows.ts's. A shelf the page lays out as one sideways row ("one row per shelf" in Settings) can't be
//  windowed this way, and draws everything.
// ─────────────────────────────────────────────────────────────────

import { flowRows, gridRows, layoutPx, OVERSCAN, RowSizes } from "./rows";

/** how the shelf lays its tiles out: a CSS grid, wrapping tiles of their own widths, or table rows */
export type ShelfLayout = "grid" | "flow" | "table";
/** what a shelf window needs to know about its tiles */
export interface ShelfTiles {
    layout: ShelfLayout;
    /** each tile's entry, in order */
    ids: string[];
    /** a wrapping tile's width before it's drawn, from its size (cover: the theme's cover width, --cover) */
    width?: (i: number, cover: number) => number;
    /** a row's height before it's drawn, from its tiles [first, end) (0: the average of the rows drawn so far) */
    height?: (first: number, end: number) => number;
    /** changes when the tiles' sizes do (size, spacing, the view's options), so the widths measured are forgotten */
    key: string;
}
/** the tiles drawn before anything is measured */
const FIRST = 24;
const px = (v: string) => parseFloat(v) || 0;
/** how tall a row of each kind of shelf (its key) came out, once one has been drawn: what every shelf of that kind on
 *  the page expects of the rows it hasn't drawn yet */
const typical = new Map<string, number>();
/** how many times a shelf may move its rows without the window moving, before it waits for the window (a shelf
 *  whose rows keep changing size can't then redraw forever) */
const SETTLE = 12;
const sameRows = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);

export class ShelfWindow {
    /** the rows drawn: [a, b) */
    a = $state(0);
    b = $state(0);
    /** whether the rows have been worked out yet (until then the first tiles are drawn, with no blocks) */
    ready = $state(false);
    /** the shelf can't be windowed, and draws every tile */
    off = $state(false);
    /** the first tile of each row, and the count at the end */
    starts = $state.raw<number[]>([0]);
    /** the heights of the blocks above and below the rows drawn */
    above = $state(0);
    below = $state(0);

    private sizes = new RowSizes(0, () => 0, 0);
    private gap = 0;
    private key = "";
    /** wrapping tiles' widths as drawn, by entry */
    private widths = new Map<string, number>();
    /** what the block above needs adding to come out exactly as tall as the rows it stands for (the browser lays a
     *  table's shared borders out a little differently around it) */
    private fix = 0;

    /** the tiles drawn: [first, end) of count */
    first() {
        return this.ready && !this.off ? this.starts[this.a] : 0;
    }
    end(count: number) {
        return this.off ? count : this.ready ? this.starts[this.b] : Math.min(count, FIRST);
    }

    private runs = 0;
    /** whether the rows' estimate is a typical row's, measured, rather than a guess */
    private typed = false;
    private tick = -1;

    /** read the shelf (el holds the tiles), then pick the rows to draw. vy, vh: the window's scroll and height; tick:
     *  changes each time the window moves */
    update(el: HTMLElement, t: ShelfTiles, vy: number, vh: number, tick: number) {
        if (tick !== this.tick) {
            this.tick = tick;
            this.runs = 0;
        }
        if (++this.runs > SETTLE) return;
        const cs = getComputedStyle(el),
            count = t.ids.length;
        if (t.layout === "grid" && (cs.display !== "grid" || cs.gridAutoFlow.startsWith("column"))) {
            this.off = true;
            return;
        }
        this.off = false;
        let fresh = !this.ready;
        if (t.key !== this.key) {
            this.widths.clear();
            this.key = t.key;
            fresh = true;
        }
        const drawn = this.tiles(el, t),
            top = px(cs.borderTopWidth) + (t.layout === "table" ? 0 : px(cs.paddingTop)),
            shelfTop = el.getBoundingClientRect().top + top; // the first row's top, on the screen
        // 1. the rows: how many tiles fit across (wrapping tiles: the widths of those drawn, as drawn)
        if (t.layout === "flow" && !fresh) this.measureWidths(drawn);
        const gap = t.layout === "table" ? 0 : layoutPx(px(cs.rowGap)); // as laid out: in 64ths of a pixel
        let starts: number[];
        if (t.layout === "grid") starts = gridRows(count, cs.gridTemplateColumns.split(" ").filter(Boolean).length);
        else if (t.layout === "table") starts = gridRows(count, 1);
        else {
            const avail = el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight),
                cover = px(cs.getPropertyValue("--cover")),
                ws = t.ids.map((id, i) => this.widths.get(id) ?? layoutPx(t.width ? t.width(i, cover) : 0));
            starts = flowRows(ws, avail, layoutPx(px(cs.columnGap)));
        }
        if (fresh || gap !== this.gap || !sameRows(starts, this.starts)) {
            // laid out afresh: what was measured no longer holds
            const est = t.height;
            this.sizes.reset(
                starts.length - 1,
                r => (est ? est(starts[r], starts[r + 1]) : 0),
                gap,
                typical.get(t.key) || 0
            );
            this.starts = starts;
            this.gap = gap;
            this.fix = 0;
            this.typed = typical.has(t.key);
            this.a = this.b = 0;
        } else {
            // 2. the same rows as before: how tall the ones drawn came out, and where the second one starts. The first
            //    row under the block above can come out a little taller or shorter than it is among the others (a
            //    table's shared border lies between them), so it isn't measured, and the block is evened out to put
            //    the rows after it exactly where they'd be with every row drawn
            const second = this.measure(drawn);
            if (second != null) {
                const off = second - (shelfTop + this.sizes.top(this.a + 1));
                const fix = this.fix - off;
                this.fix = Math.abs(fix) > 0.25 ? fix : 0;
            }
        }
        // 3. the rows near the window: those within a quarter of a window must be drawn; when they aren't, draw a
        //    window's height either side, so scrolling doesn't redraw on every step
        void vy;
        // a shelf measured nothing yet takes a typical row from the shelves that have
        const ty = typical.get(t.key);
        if (ty && !this.typed) {
            this.sizes.reset(starts.length - 1, r => (t.height ? t.height(starts[r], starts[r + 1]) : 0), gap, ty);
            this.typed = true;
        }
        const from = -shelfTop,
            S = this.sizes,
            need = S.within(from - vh * 0.25, from + vh * 1.25),
            want = S.within(from - vh * OVERSCAN, from + vh * (1 + OVERSCAN));
        let [a, b] = want;
        if (this.ready && this.b > this.a) {
            if (
                need[1] > need[0]
                    ? this.a <= need[0] && need[1] <= this.b
                    : want[1] > want[0] && this.a < want[1] && want[0] < this.b
            )
                [a, b] = [this.a, this.b];
        }
        if (!this.ready || a !== this.a || b !== this.b) {
            this.a = a;
            this.b = b;
        }
        this.ready = true;
        const above = a > 0 ? S.span(0, a) + this.fix : 0,
            below = S.span(b, S.rows);
        if (Math.abs(above - this.above) > 0.01) this.above = above;
        if (Math.abs(below - this.below) > 0.01) this.below = below;
    }

    /** the tiles drawn, each with its place in the group */
    private tiles(el: HTMLElement, t: ShelfTiles): [i: number, el: Element][] {
        const out: [number, Element][] = [],
            n = t.ids.length;
        let i = this.first();
        for (const c of el.children) {
            if (c.classList.contains("vpad")) continue;
            if (i >= n) break;
            out.push([i++, c]);
        }
        return out;
    }
    /** each drawn row's height; gives back the second row's top, under a block. Only when the tiles drawn are the rows
     *  picked: just after the rows change, the page may not have caught up yet */
    private measure(drawn: [number, Element][]): number | null {
        const S = this.starts;
        if (!drawn.length || drawn[0][0] !== S[this.a] || drawn.length !== S[this.b] - S[this.a]) return null;
        let r = this.a,
            lo = Infinity,
            hi = -Infinity,
            second: number | null = null;
        const close = () => {
            if (lo === Infinity) return;
            if (r === this.a + 1) second = lo;
            // the first row under a block isn't measured: see update()
            if (r > this.a || this.a === 0) {
                this.sizes.measured(r, hi - lo);
                if (!typical.has(this.key)) typical.set(this.key, hi - lo);
            }
            lo = Infinity;
            hi = -Infinity;
        };
        for (const [i, c] of drawn) {
            while (r < this.b && i >= S[r + 1]) {
                close();
                r++;
            }
            const q = c.getBoundingClientRect();
            lo = Math.min(lo, q.top);
            hi = Math.max(hi, q.bottom);
        }
        close();
        return this.a > 0 ? second : null;
    }
    /** wrapping tiles: the widths of those drawn, margins included */
    private measureWidths(drawn: [number, Element][]) {
        for (const [, c] of drawn) {
            const id = c.getAttribute("data-oid") || c.getAttribute("data-id") || "",
                m = c.classList.contains("volset") ? px(getComputedStyle(c).marginRight) : 0;
            if (id) this.widths.set(id, c.getBoundingClientRect().width + m);
        }
    }
}
