// @vitest-environment happy-dom
// The entry form (library/entry/): its boxes are kept as typed, and read back as an entry's fields, only those the
// medium shows. Add and Edit details both save what this reads.
import { describe, expect, it } from "vitest";
import { boxesOf, readFields } from "../../src/features/library/entry/fields";
import type { ItemDraft } from "../../src/features/core/model";

describe("the entry form", () => {
    it("fills its boxes from an entry, and reads them back the same", () => {
        const b: ItemDraft = {
            title: "Moss Lane",
            medium: "manga",
            kind: "Manga",
            status: "active",
            year: 2011,
            total: 125,
            vols: 16,
            genres: ["Romance", "Drama"],
            copy: "physical",
        };
        const f = readFields(boxesOf(b));
        expect(f).toMatchObject({
            title: "Moss Lane",
            medium: "manga",
            status: "active",
            year: 2011,
            total: 125,
            vols: 16,
            genres: ["Romance", "Drama"],
            copy: "physical",
        });
    });
    it("reads numbers as numbers, an empty or odd one as nothing, and genres split at commas", () => {
        const v = boxesOf({ title: "x", medium: "book" });
        Object.assign(v, { year: " 1999 ", total: "abc", genres: " Fantasy, , Magic ", seriesNo: "2.5" });
        const f = readFields(v);
        expect(f.year).toBe(1999);
        expect(f.total).toBeNull();
        expect(f.seriesNo).toBe(2.5);
        expect(f.genres).toEqual(["Fantasy", "Magic"]);
    });
    it("leaves out what the medium doesn't show, so switching medium never wipes it", () => {
        const v = boxesOf({ title: "x", medium: "manga", vols: 9, runtime: 24 });
        v.medium = "book";
        const f = readFields(v);
        expect("vols" in f).toBe(false);
        expect("runtime" in f).toBe(false);
        expect("subject" in f).toBe(true);
        v.medium = "film";
        expect("total" in readFields(v)).toBe(false);
        expect(readFields(v).runtime).toBe(24);
    });
    it("puts a book on its shelf from its type", () => {
        const v = boxesOf({ title: "x", medium: "book", kind: "Academic" });
        expect(readFields(v).shelf).toBe("academic");
        v.kind = "Non-fiction";
        expect(readFields(v).shelf).toBe("nonfiction");
        v.kind = "Novel";
        expect(readFields(v).shelf).toBe("fiction");
    });
    it("shows a choice its list doesn't have as the first one, which is what's kept", () => {
        const v = boxesOf({ title: "x", medium: "nonsense", status: "lost", copy: "rented" } as unknown as ItemDraft); // cast: values no entry should hold, on purpose
        expect([v.medium, v.status, v.copy]).toEqual(["book", "redo", "none"]);
    });
});
