// @vitest-environment happy-dom
// Import files are someone else's (import-export/importers.ts, packs.ts): a date that isn't one, an export whose parts
// aren't the shape the app keeps, or a Letterboxd zip with only its diary must not stop the import or get into your
// library half-read.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { clone, DEFAULT_SETTINGS, items, meta, ui } from "../../src/features/core/core";
import { readImportFile } from "../../src/features/import-export/importers";
import { applyParts } from "../../src/features/import-export/packs";
import { flushSync, mount, unmount } from "svelte";
import LearnPage from "../../src/features/learning-centre/pages/LearnPage.svelte";

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

    it("brings in a Learning Centre only as far as it's valid, and its course page still opens", async () => {
        await applyParts(
            {
                academic: {
                    v: 2,
                    subjects: [
                        { id: "s1", name: "Mathematics", goal: 9, fields: { Algebra: { lvl: 42 }, Topology: "x" } },
                        { name: "no id" },
                    ],
                    paths: [
                        {
                            id: "p1",
                            sub: "s1",
                            name: "Mathematics",
                            modules: [{ id: "m1", name: "Analysis", topics: "x", after: 3 }, { name: "no id" }],
                            books: [{ id: "b1", t: "Principles of Mathematical Analysis", after: "x" }, { t: "no id" }],
                        },
                        "not a pathway",
                    ],
                    curricula: { s1: { topics: [{ id: "t1", name: "Analysis" }, 4], progs: "x", hide: [1, "p"] } },
                },
            },
            {},
            "replace"
        );
        const S = meta.courses.subjects.find(s => s.id === "s1"),
            P = meta.courses.paths.find(p => p.id === "p1");
        expect(meta.courses.subjects.map(s => s.id)).toEqual(["s1"]);
        expect(S!.goal).toBe(5);
        expect(S!.fields).toEqual({ Algebra: { lvl: 5 } });
        expect(P!.modules!.map(m => [m.id, m.topics, m.after])).toEqual([["m1", [], undefined]]);
        expect(P!.books.map(b => [b.id, b.after])).toEqual([["b1", []]]);
        expect(meta.courses.curricula!.s1).toMatchObject({
            topics: [{ id: "t1", name: "Analysis" }],
            progs: [],
            hide: ["p"],
        });
        ui.learnSub = "s1";
        ui.pwId = null;
        // …and the course's page draws it
        const target = document.createElement("div");
        let page: ReturnType<typeof mount> | undefined;
        expect(() => {
            page = mount(LearnPage, { target });
            flushSync();
        }).not.toThrow();
        expect(target.querySelector<HTMLInputElement>('[data-f="name"]')!.value).toBe("Mathematics");
        unmount(page!);
        ui.learnSub = null;
    });
});
