// A big library draws only the rows near the window (library/page/rows.ts): where a grid's rows and wrapping tiles'
// lines break, how tall rows are before and after they're drawn, and which rows reach into the window.
import { describe, expect, it } from "vitest";
import { flowRows, gridRows, layoutPx, RowSizes } from "../../src/features/library/page/rows";

describe("rows of a shelf", () => {
    it("a grid has the same number of tiles in every row, the last one short", () => {
        expect(gridRows(10, 4)).toEqual([0, 4, 8, 10]);
        expect(gridRows(8, 4)).toEqual([0, 4, 8]);
        expect(gridRows(0, 4)).toEqual([0]);
        // a shelf too narrow for a single column still puts one tile per row
        expect(gridRows(3, 0)).toEqual([0, 1, 2, 3]);
    });

    it("wrapping tiles break where the next one no longer fits, as a wrapping flexbox does", () => {
        // 100 wide, 10 between: 40 + 10 + 40 = 90 fits, a third doesn't
        expect(flowRows([40, 40, 40, 40, 40], 100, 10)).toEqual([0, 2, 4, 5]);
        // exactly full still fits
        expect(flowRows([45, 45, 45], 100, 10)).toEqual([0, 2, 3]);
        // a tile wider than the shelf has a line to itself
        expect(flowRows([30, 150, 30], 100, 10)).toEqual([0, 1, 2, 3]);
        expect(flowRows([], 100, 10)).toEqual([0]);
    });

    it("lengths are rounded down to 64ths of a pixel, as the browser lays them out", () => {
        expect(layoutPx(10.5)).toBe(10.5);
        expect(layoutPx(1 / 3)).toBe(21 / 64);
    });
});

describe("row heights", () => {
    it("estimated before they're drawn, measured after, and each row starts after the gap", () => {
        const s = new RowSizes(4, () => 0, 10, 100);
        expect(s.top(0)).toBe(0);
        expect(s.top(2)).toBe(220);
        expect(s.span(0, 4)).toBe(430);
        expect(s.measured(1, 150)).toBe(true);
        expect(s.measured(1, 150)).toBe(false);
        expect(s.top(2)).toBe(270);
        expect(s.span(1, 3)).toBe(260);
    });

    it("a row with an estimate of its own uses it, and a measured row doesn't change the others' estimate", () => {
        const s = new RowSizes(3, r => (r === 2 ? 50 : 0), 0, 100);
        expect(s.height(2)).toBe(50);
        s.measured(0, 300);
        expect(s.height(1)).toBe(100);
    });

    it("picks the rows that reach into a stretch of the page", () => {
        const s = new RowSizes(10, () => 0, 0, 100);
        expect(s.within(0, 99)).toEqual([0, 1]);
        expect(s.within(150, 420)).toEqual([1, 5]);
        expect(s.within(950, 2000)).toEqual([9, 10]);
        // nowhere near: none
        expect(s.within(-900, -100)).toEqual([0, 0]);
        expect(s.within(1500, 2000)).toEqual([0, 0]);
    });

    it("measured again from nothing when the shelf changes", () => {
        const s = new RowSizes(2, () => 0, 0, 100);
        s.measured(0, 400);
        s.reset(3, () => 0, 5, 80);
        expect(s.rows).toBe(3);
        expect(s.height(0)).toBe(80);
        expect(s.span(0, 3)).toBe(250);
    });
});
