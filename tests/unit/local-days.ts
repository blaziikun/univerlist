// Days and months are where you are, not in UTC (core/core.ts dayKey, monthKey, parseDay): the stats, the streak, the
// activity grid, dates as you chose to see them and dates read from a CSV. Run in two time zones, either side of UTC,
// by local-days-tokyo.test.ts and local-days-new-york.test.ts (a time zone has to be set before anything reads a date).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayKey, fmtDate, fromCSV, items, meta, monthKey, parseDay, SERIES } from "../../src/features/core/core";
import { activityStats, heatLook } from "../../src/features/core/views";
import { statLook } from "../../src/features/library/statblocks";
import { stackLook } from "../../src/features/library/blocks/charts";
import { mapRows } from "../../src/features/import-export/importers";
import type { Item } from "../../src/features/core/model";
import { bare } from "./bare";

const book = (id: string, finishedAt: string): [string, Item] => [
    id,
    bare({ medium: "book", title: id, status: "done", finishedAt }),
];

/** what happens in a time zone (see localDays) */
interface Zone {
    now: string;
    edge: string;
    edgeDay: string;
    streak2: string[];
    streak1: string[];
    month: string;
    monthLabel: string;
}
/**
 * @param zone the time zone the file set
 * @param c what happens there: `now` (local time), a moment that's another day there than in UTC
 * (`edge` → `edgeDay`), finishes on two local days that are one UTC day (`streak2`), or one local day that is two UTC
 * days (`streak1`), and a finish in one month there and another in UTC (`month` → `monthLabel`)
 */
export function localDays(zone: string, c: Zone) {
    describe(`in ${zone}`, () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date(c.now));
            meta.settings.dateFmt = "";
        });
        afterEach(() => {
            vi.useRealTimers();
            items.clear();
        });

        it("is really there", () => {
            expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
        });

        it("keys a moment by the day and month it is here", () => {
            expect(dayKey(c.edge)).toBe(c.edgeDay);
            expect(monthKey(c.edge)).toBe(c.edgeDay.slice(0, 7));
            expect(dayKey("2026-03-05")).toBe("2026-03-05");
            expect(dayKey(parseDay("2026-03-05"))).toBe("2026-03-05");
            expect(dayKey("not a date")).toBe("");
            expect([dayKey(undefined), dayKey(null), dayKey("")]).toEqual(["", "", ""]); // no date isn't today
        });

        it("shows dates as that day, in every format", () => {
            expect(fmtDate("2026-03-05")).toBe("5 Mar 2026");
            meta.settings.dateFmt = "iso";
            expect(fmtDate(c.edge)).toBe(c.edgeDay);
        });

        it("reads a CSV's plain dates as days here", () => {
            const { items: got } = fromCSV([
                { Title: "Dune", Author: "Frank Herbert", "Exclusive Shelf": "read", "Date Read": "2026/03/05" },
            ]);
            const at = got[0].finishedAt as string; // cast: the date the CSV row was read as
            expect(dayKey(at)).toBe("2026-03-05");
            expect(fmtDate(at)).toBe("5 Mar 2026");
            const [row] = mapRows(
                [{ t: "Dune", d: "2026-03-05" }],
                { title: "t", finishedAt: "d" },
                { medium: "book" } as Parameters<typeof mapRows>[2] // cast: no scale or status chosen, as when they're left alone
            );
            expect(dayKey(row.finishedAt)).toBe("2026-03-05");
        });

        it("counts a streak by the days here", () => {
            for (const [id, b] of c.streak2.map((at, i) => book("s" + i, at))) items.set(id, b);
            expect(activityStats().streak).toBe(2);
            items.clear();
            for (const [id, b] of c.streak1.map((at, i) => book("t" + i, at))) items.set(id, b);
            expect(activityStats().streak).toBe(1);
        });

        it("lights today's square in the activity grid", () => {
            const lit = heatLook(new Map([[dayKey(new Date()), 30]]), 4).filter(d => d.style.startsWith("background"));
            expect(lit.map(d => d.title.split(":")[0])).toEqual([fmtDate(new Date())]);
        });

        it("puts a finish in the month it was here (Finished per month)", () => {
            const x = statLook({ cfg: { k: "month" }, A: [{ ...book("m", c.month)[1], id: "m" }] } as Parameters<
                typeof statLook
            >[0]); // cast: a block with only what this chart reads
            const tips = stackLook(x.cols!, SERIES).label.split("; "); // the chart's label, as StackChart.svelte draws it
            expect(tips.filter(t => !/: (none)?$/.test(t))).toEqual([`${c.monthLabel}: Books 1`]);
        });
    });
}
