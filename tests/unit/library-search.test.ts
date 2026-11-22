// @vitest-environment happy-dom
// Searching your own library as you type (core/search.ts gsLocal): typos and any script are forgiven (uFuzzy), what
// matches as typed still comes first, and the titles are folded once per change to the library, not on every key.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { items } from "../../src/features/core/core";
import { gsLocal } from "../../src/features/core/search";
import type { Item, Medium } from "../../src/features/core/model";
import { bare } from "./bare";

const add = (id: string, medium: Medium, title: string, more: Partial<Item> = {}) =>
    items.set(id, bare({ medium, title, status: "want", ...more }));
beforeEach(() => {
    add("anime-fma", "anime", "Fullmetal Alchemist: Brotherhood");
    add("anime-aot", "anime", "進撃の巨人", { alt: { romaji: "Shingeki no Kyojin" } });
    add("game-arceus", "game", "Pokémon Legends: Arceus");
    add("book-dune", "book", "Dune", { creator: "Frank Herbert" });
    add("book-messiah", "book", "Dune Messiah", { creator: "Frank Herbert" });
    add("book-children", "book", "Children of Dune", { creator: "Frank Herbert" });
    add("book-alchemist", "book", "The Alchemist", { creator: "Paulo Coelho" });
    add("book-war", "book", "Война и мир", { creator: "Лев Толстой" });
});
afterEach(() => items.clear());
const ids = (q: string) => gsLocal(q).map(b => b.id);

describe("searching your library", () => {
    it("forgives a typo", () => {
        expect(ids("fullmetal alchmist")[0]).toBe("anime-fma");
        expect(ids("alchmist")).toEqual(expect.arrayContaining(["anime-fma", "book-alchemist"]));
    });

    it("finds titles in any script, by any part", () => {
        expect(ids("巨人")).toEqual(["anime-aot"]);
        expect(ids("shingeki")).toEqual(["anime-aot"]);
        expect(ids("война")).toEqual(["book-war"]);
    });

    it("ignores accents", () => {
        expect(ids("pokemon")).toEqual(["game-arceus"]);
    });

    it("puts the exact title first, then titles that start with it, then the rest", () => {
        expect(ids("dune")).toEqual(["book-dune", "book-messiah", "book-children"]);
    });

    it("gives back your entries as they are, with their ids", () => {
        const [b] = gsLocal("dune messiah");
        expect(b).toMatchObject({
            id: "book-messiah",
            medium: "book",
            title: "Dune Messiah",
            creator: "Frank Herbert",
        });
    });

    it("folds the titles once per change to the library, not on every key", () => {
        let reads = 0;
        items.set(
            "film-x",
            bare({
                medium: "film",
                status: "want",
                get title() {
                    reads++;
                    return "Perfect Days";
                },
            })
        );
        for (const q of ["p", "pe", "per", "perf", "perfect", "perfect d"]) gsLocal(q);
        expect(reads).toBe(1);
        add("film-y", "film", "Perfect Blue");
        expect(ids("perfect blue")[0]).toBe("film-y");
        expect(reads).toBe(2);
    });
});
