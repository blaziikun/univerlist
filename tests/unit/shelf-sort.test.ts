// @vitest-environment happy-dom
// The Shelf sort (core/views.ts sortBy): how a shelf looks when you haven't arranged it. Entries that sort the same
// on everything else (their call numbers not worked out yet, or the same) come out in one order, whatever order they
// arrive in: by title, then by id. Before, they kept the order they came in, which differs between a page just used
// and one reloaded, and between devices.
import { afterEach, describe, expect, it } from "vitest";
import { items, migrateItem } from "../../src/features/core/core";
import { buildCallNumbers, sortBy } from "../../src/features/core/views";
import type { Entry, Item } from "../../src/features/core/model";

afterEach(() => items.clear());
const entry = (id: string, title: string, more: Partial<Item> = {}) => ({
    id,
    ...migrateItem({ medium: "film", title, status: "done", ...more }),
});
const order = (list: Entry[]) =>
    list
        .slice()
        .sort(sortBy("shelf"))
        .map(b => b.id);

describe("the Shelf sort", () => {
    it("puts entries that tie in the same order whatever order they arrive in", () => {
        const a = entry("film-b", "Brazil"),
            b = entry("film-a", "Amelie"),
            c = entry("film-c", "Amelie");
        expect(order([a, b, c])).toEqual(["film-a", "film-c", "film-b"]);
        expect(order([c, a, b])).toEqual(["film-a", "film-c", "film-b"]);
        expect(order([b, c, a])).toEqual(["film-a", "film-c", "film-b"]);
    });

    it("still goes by call number first, once they're worked out", () => {
        const x = entry("film-x", "Zodiac", { year: 2007 }),
            y = entry("film-y", "Alien", { year: 1979 });
        for (const e of [x, y]) items.set(e.id, e);
        buildCallNumbers();
        // films are numbered by year, then title: FLM 1979 before FLM 2007
        expect(order([x, y])).toEqual(["film-y", "film-x"]);
    });
});
