// @vitest-environment happy-dom
// Import files are someone else's (import-export/importers.ts, packs.ts): a date that isn't one, an export whose parts
// aren't the shape the app keeps, or a Letterboxd zip with only its diary must not stop the import or get into your
// library half-read.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { clone, DEFAULT_SETTINGS, items, LEARNING_TAG, meta, migratePaths, ui } from "../../src/features/core/core";
import { readImportFile } from "../../src/features/import-export/importers";
import { applyParts } from "../../src/features/import-export/packs";

const enc = new TextEncoder();
const file = (bytes: BlobPart, name: string) => new File([bytes], name);

describe("reading an import file", () => {
    it("leaves out a MyAnimeList date that isn't one, instead of refusing the whole list", async () => {
        const xml = `<?xml version="1.0"?><myanimelist>
  <anime><series_title>Mushishi</series_title><series_type>TV</series_type><my_status>Completed</my_status>
    <my_start_date>2020-13-45</my_start_date><my_finish_date>2021-02-03</my_finish_date><my_score>9</my_score></anime>
</myanimelist>`;
        const p = await readImportFile(file(enc.encode(xml), "animelist.xml"));
        expect(p.kind).toBe("MyAnimeList");
        expect(p.items).toHaveLength(1);
        expect(p.items![0]).toMatchObject({ title: "Mushishi", status: "done", startedAt: null, rating: 9 });
        expect(p.items![0].finishedAt).toMatch(/^2021-02-0[23]T/);
    });

    it("doesn't take a Letterboxd diary entry's address as the film's, and leaves out a date that isn't one", async () => {
        const diary =
            "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n" +
            "2024-01-02,Heat,1995,https://boxd.it/diaryEntry1,4.5,,,2024-01-01\n" +
            "2024-02-02,Ran,1985,https://boxd.it/diaryEntry2,5,Yes,,not a date\n";
        const zip = zipSync({ "diary.csv": enc.encode(diary) });
        const p = await readImportFile(file(zip, "letterboxd-export.zip"));
        expect(p.kind).toBe("Letterboxd export");
        const heat = p.items!.find(x => x.title === "Heat"),
            ran = p.items!.find(x => x.title === "Ran");
        expect(heat).toMatchObject({ status: "done", rating: 9, year: 1995 });
        expect((heat!.ext as Record<string, unknown>).letterboxd).toBeUndefined(); // cast: what an import found, not yet checked
        expect(ran).toMatchObject({ status: "done", rating: 10, repeat: 1 });
        expect(ran!.finishedAt ?? null).toBeNull(); // its date wasn't one
    });
});

describe("bringing an export's parts in", () => {
    let before: typeof meta;
    beforeEach(() => {
        document.body.innerHTML = `<div id="app"><header id="top"></header><aside id="side"></aside><main id="main"></main></div><div id="overlay"></div>`;
        before = clone(meta);
    });
    afterEach(() => {
        Object.assign(meta, before);
        items.clear();
    });

    it("leaves out what isn't the shape the app keeps, and changes nothing it can't use", async () => {
        const modes = meta.modes.map(m => m.id);
        await applyParts(
            {
                preferences: {
                    modes: 5,
                    views: "x",
                    layout: { side: { width: "wide", open: true }, tabs: 3 },
                    settings: { ratingScale: 5, theme: ["dark"], density: "compact", criteria: null },
                    tags: { good: { color: "#fff" }, bad: "red" },
                    orders: { a: ["x", 2, "y"], b: "no" },
                },
                favourites: { favOrder: "abc", chars: [1, { id: "c1", name: "Mushishi's Ginko" }, { name: "no id" }] },
                lists: { queue: 7, lists: [{ id: "l1", name: "Best", ids: ["a", 3] }, { name: "no id" }, null] },
                library: {
                    ok: { title: "Dune", medium: "book", status: "done" },
                    notitle: { medium: "book" },
                    junk: "not an entry",
                },
            },
            {},
            "merge"
        );
        expect(meta.modes.map(m => m.id)).toEqual(modes); // a number isn't a list of modes: yours stay
        expect(Array.isArray(meta.views)).toBe(true);
        expect(meta.settings.ratingScale).toBe(DEFAULT_SETTINGS.ratingScale);
        expect(meta.settings.theme).toBe(before.settings.theme);
        expect(meta.settings.density).toBe("compact");
        expect(meta.layout.side.width).toBe(before.layout.side.width);
        expect(meta.layout.side.open).toBe(true);
        expect(Array.isArray(meta.layout.tabs)).toBe(true);
        expect(meta.tags.good).toEqual({ color: "#fff" });
        expect(meta.tags.bad).toBeUndefined();
        expect(meta.orders).toEqual({ a: ["x", "y"] });
        expect(meta.favOrder.every(x => typeof x === "string")).toBe(true);
        expect(meta.chars.map(c => c.id)).toEqual(["c1"]);
        expect(meta.queue.every(x => typeof x === "string")).toBe(true);
        expect(meta.lists.find(l => l.id === "l1")!.ids).toEqual(["a"]);
        expect(meta.lists.every(l => typeof l.id === "string")).toBe(true);
        expect([...items.keys()]).toEqual(["ok"]);
    });

    it("an export from before 1.0: its courses aren't kept, but their books and its academic books carry the Learning tag", async () => {
        await applyParts(
            {
                library: {
                    rudin: { medium: "book", kind: "Novel", title: "Principles of Mathematical Analysis" },
                    spivak: { medium: "book", kind: "Academic", title: "Calculus" },
                    dune: { medium: "book", kind: "Novel", title: "Dune" },
                },
                // the shapes it had over time: version 3's courses, and an older version's pathways, with junk
                academic: {
                    v: 3,
                    courses: [
                        { id: "c1", name: "Maths", books: [{ id: "b1", t: "Rudin", lib: "rudin" }, { lib: "nobody" }] },
                        "not a course",
                    ],
                    paths: [{ books: [{ lib: 42 }, { lib: { lib: "dune-not-a-string" } }] }],
                },
            },
            {},
            "replace"
        );
        const tagged = [...items].filter(([, b]) => (b.tags || []).includes(LEARNING_TAG)).map(([id]) => id);
        expect(tagged.sort()).toEqual(["rudin", "spivak"]);
        expect(meta.tags[LEARNING_TAG]?.color).toBeTruthy();
        expect("courses" in meta).toBe(false);
    });

    it("a library from before 1.0: the Learning Centre's mode goes, its books are tagged, Literature takes academic books", () => {
        items.set("spivak", { id: "spivak", medium: "book", kind: "Academic", title: "Calculus", tags: [] } as never);
        items.set("rudin", { id: "rudin", medium: "book", kind: "Novel", title: "Analysis", tags: ["Fav"] } as never);
        const old = meta as typeof meta & { courses?: unknown };
        old.courses = { v: 3, courses: [{ id: "c1", books: [{ lib: "rudin" }] }] };
        meta.modes.push({ id: "academic", name: "Learning Centre", match: ["book:Academic"] });
        for (const m of meta.modes)
            if (m.id === "novels" || m.id === "universal") m.match = [...(m.match || []), "!book:Academic"];
        meta.settings.learning1 = false;
        ui.mode = "academic";
        migratePaths();
        expect(meta.modes.some(m => m.id === "academic")).toBe(false);
        expect(meta.modes.every(m => !(m.match || []).includes("!book:Academic"))).toBe(true);
        expect(ui.mode).toBe("novels");
        expect(items.get("spivak")!.tags).toEqual([LEARNING_TAG]);
        expect(items.get("rudin")!.tags).toEqual(["Fav", LEARNING_TAG]);
        expect("courses" in meta).toBe(false);
        // once: a tag you take off later stays off
        items.set("spivak", { ...items.get("spivak")!, tags: [] });
        migratePaths();
        expect(items.get("spivak")!.tags).toEqual([]);
    });
});
