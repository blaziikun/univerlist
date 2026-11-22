// @vitest-environment happy-dom
// A show's seasons (watch-read/watch.ts seasonChain): your combined entries, AniList's sequel links, and releases named
// like seasons of it. It finds the last kind through an index of the library made once per change, instead of going
// through the whole library for every show (Rank's Seasons panel asks for every show). The answers must be exactly
// what going through the library gave, in the same order, and follow the library as it changes.
import { beforeEach, describe, expect, it } from "vitest";
import { entryOf, items, markDirty, migrateItem, present } from "../../src/features/core/core";
import { partsOf } from "../../src/features/core/parts";
import { animeChain, isSeasonish, seasonChain, seasonSort, seasonStem } from "../../src/features/watch-read/watch";
import type { Entry, Item } from "../../src/features/core/model";

// the way it was found before: a pass over the whole library for each show
function scanned(id: string) {
    const b = items.get(id),
        root = b && b.partOf && items.has(b.partOf) ? b.partOf : id,
        ids = new Set<string>();
    const addChain = (x: string) => {
        for (const y of animeChain(x))
            if (!ids.has(y.id)) {
                ids.add(y.id);
                for (const p of partsOf(items.get(y.id))) ids.add(p);
            }
    };
    ids.add(root);
    for (const p of partsOf(items.get(root))) ids.add(p);
    addChain(root);
    const stems = new Set([...ids].map(i => seasonStem(items.get(i)?.title ?? "")));
    for (const [i, x] of items)
        if (!ids.has(i) && isSeasonish(x) && stems.has(seasonStem(x.title))) {
            ids.add(i);
            addChain(i);
        }
    const L = [...ids].map(entryOf).filter(present).filter(isSeasonish);
    return L.length > 1 ? L.sort(seasonSort) : animeChain(root);
}
const put = (id: string, x: Partial<Item>) => items.set(id, migrateItem({ status: "done", ...x }));
const ids = (list: Entry[]) => list.map(x => x.id);

beforeEach(() => {
    items.clear();
    // a few hundred entries: seasons named every way, sequel links, a show with its seasons in one entry, films and
    // specials that share a name, the same year and season twice (a tie the sort must leave in library order)
    const NAMES = [
        "Bungo Stray Dogs",
        "Mushishi",
        "Attack on Titan",
        "Little Busters",
        "Quiet Harbour",
        "Paper Lantern",
    ];
    let n = 0;
    for (let r = 0; r < 12; r++)
        for (const name of NAMES) {
            const base = r ? `${name} ${r}` : name;
            put(`a${n++}`, { medium: "anime", kind: "TV", title: base, year: 2010 + (r % 5), season: "SPRING" });
            put(`a${n++}`, { medium: "anime", kind: "TV", title: `${base} 2`, year: 2011 + (r % 5), season: "FALL" });
            put(`a${n++}`, {
                medium: "anime",
                kind: "TV",
                title: `${base} Season 3`,
                year: 2011 + (r % 5),
                season: "FALL",
            });
            put(`a${n++}`, {
                medium: "anime",
                kind: "TV",
                title: `${base}: The Final Season Part 2`,
                year: 2013 + (r % 5),
            });
            put(`a${n++}`, { medium: "anime", kind: "Movie", title: `${base} 2`, year: 2012 });
            put(`a${n++}`, { medium: "anime", kind: "Special", title: `${base} II`, year: 2012 });
            put(`a${n++}`, { medium: "manga", title: `${base} 2`, year: 2009 });
        }
    // sequel links and a combined show
    const L = (a: string, b: string, t: string) => {
        items.get(a)!.links = [...(items.get(a)!.links || []), { id: b, type: t }];
    };
    L("a0", "a1", "sequel");
    L("a1", "a0", "prequel");
    items.get("a7")!.parts = ["a8", "a9"];
    items.get("a8")!.partOf = "a7";
    items.get("a9")!.partOf = "a7";
    markDirty();
});

describe("a show's seasons", () => {
    it("are the same, in the same order, as going through the whole library", () => {
        const bad = [];
        for (const id of items.keys())
            if (JSON.stringify(ids(seasonChain(id))) !== JSON.stringify(ids(scanned(id)))) bad.push(id);
        expect(bad).toEqual([]);
        expect(ids(seasonChain("a0")).length).toBeGreaterThan(2);
    });

    it("follow the library as it changes: a new season, a renamed one, one taken away", () => {
        seasonChain("a0");
        put("new", { medium: "anime", kind: "TV", title: "Bungo Stray Dogs 5", year: 2023 });
        expect(ids(seasonChain("a0"))).toContain("new");
        expect(ids(seasonChain("a0"))).toEqual(ids(scanned("a0")));
        items.set("new", { ...items.get("new")!, title: "Something Else Entirely" });
        expect(ids(seasonChain("a0"))).not.toContain("new");
        items.delete("a2");
        expect(ids(seasonChain("a0"))).toEqual(ids(scanned("a0")));
    });
});
