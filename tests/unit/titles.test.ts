// @vitest-environment happy-dom
// How titles and names are compared (core/core.ts norm): letters of every script count, accents fold away, and a title
// in plain a–z folds exactly as it always did, so nothing saved under a key made from it changes.
import { afterEach, describe, expect, it } from "vitest";
import { findExisting, hash, idTitle, items, legacyNorm, norm } from "../../src/features/core/core";
import { titleLike } from "../../src/features/import-export/smartimport";
import { titleMatch } from "../../src/features/sources/sources";
import { entKey } from "../../src/features/library/tiers";
import { bare } from "./bare";

afterEach(() => items.clear());

describe("norm", () => {
    it("keeps letters beyond a–z, so a Japanese or Russian title isn't an empty string", () => {
        expect(norm("進撃の巨人")).toBe("進撃の巨人");
        expect(norm("Война и мир")).toBe("воина и мир");
        expect(norm("Ørsted")).toBe("orsted");
        expect(norm("Æon Flux")).toBe("aeon flux");
        expect(norm("Straße")).toBe("strasse");
        expect(norm("हिन्दी")).toBe("हिन्दी"); // a vowel sign is part of its letter, not a gap
        expect(norm("ガンダム")).toBe("ガンダム"); // ダ keeps its mark: not カンタム
    });

    it("folds accents, capitals, full-width letters and punctuation as before", () => {
        expect(norm("Pokémon: Legends — Arceus!")).toBe("pokemon legends arceus");
        expect(norm("ＦＵＬＬ　ＷＩＤＴＨ")).toBe("full width");
        expect(norm("Pokémon™")).toBe("pokemon");
        expect(norm("  Spirited\tAway  ")).toBe("spirited away");
    });

    it("gives a plain a–z title exactly what it gave before (ids made from it stay the same)", () => {
        const titles = [
            "The Lord of the Rings: The Two Towers (2002)",
            "Fullmetal Alchemist: Brotherhood",
            "Re:ZERO -Starting Life in Another World-",
            "Ys VIII: Lacrimosa of DANA",
            "Spider-Man 2",
            "Don't Look Up",
            "100% Orange Juice!",
            "C++ for Dummies, 3rd ed.",
            "Pokémon Legends: Z-A",
            "Mission: Impossible – Fallout",
            "Rainbow Six® Siege™",
            "№ 6",
        ];
        for (const t of titles) expect(norm(t), t).toBe(legacyNorm(t));
        for (let c = 0; c < 128; c++) {
            const s = `a${String.fromCharCode(c)}B`;
            expect(norm(s), JSON.stringify(s)).toBe(legacyNorm(s));
        }
    });
});

describe("matching titles in any script", () => {
    it("two different Japanese titles aren't the same title", () => {
        expect(idTitle("進撃の巨人")).not.toBe(idTitle("鬼滅の刃"));
        expect(titleLike("進撃の巨人", "鬼滅の刃")).toBeLessThan(0.5);
        expect(titleLike("進撃の巨人", "進撃の巨人")).toBe(1);
    });

    it("an online result only matches a book with that title", () => {
        const b = { title: "Война и мир", creator: "Лев Толстой" };
        expect(titleMatch(b, { title: "Война и мир", author: "Лев Толстой" })).toBe(true);
        expect(titleMatch(b, { title: "Анна Каренина", author: "Лев Толстой" })).toBe(false);
    });

    it("an import finds what's already there and nothing else, so it adds no duplicates and drops nothing", () => {
        items.set("anime-item", bare({ medium: "anime", title: "進撃の巨人" }));
        items.set("book-orsted", bare({ medium: "book", title: "Ørsted", creator: "Dan Ch. Christensen" }));
        expect(findExisting("進撃の巨人", "", "anime")).toBe("anime-item");
        expect(findExisting("鬼滅の刃", "", "anime")).toBe(null);
        expect(findExisting("Ørsted", "Dan Ch. Christensen", "book")).toBe("book-orsted");
    });
});

describe("characters and people pulled into a tier list", () => {
    const old = (name: string, from?: string) => "x" + hash(legacyNorm(name) + (from ? "|" + from : "")).toString(36);

    it("a name in any script gets a key of its own", () => {
        expect(entKey({}, "エレン・イェーガー", "anime-1")).not.toBe(entKey({}, "ミカサ・アッカーマン", "anime-1"));
        expect(entKey({}, "Eren Yeager", "anime-1")).toBe(old("Eren Yeager", "anime-1"));
    });

    it("keeps the key a list made before already uses, so adding them again doesn't duplicate them", () => {
        const ents = { [old("Ørsted", "anime-1")]: { name: "Ørsted" }, [old("梶裕貴")]: { name: "梶裕貴" } };
        expect(entKey(ents, "Ørsted", "anime-1")).toBe(old("Ørsted", "anime-1"));
        expect(entKey(ents, "梶裕貴")).toBe(old("梶裕貴"));
        // the older key every non-Latin name shared: someone else under it isn't this person
        expect(entKey(ents, "石川由依")).not.toBe(old("石川由依"));
    });
});
