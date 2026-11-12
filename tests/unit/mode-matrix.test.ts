// @vitest-environment happy-dom
// A mode's (or a shelf's) grid of media and types, Settings › Modes (settings/parts/Matrix.svelte): ticking a box gives
// what the grid now shows, worked out from what it showed (settings.ts matrixRead), the way the ticks were once read
// back from the page: a medium with every type ticked is the medium, otherwise each ticked type; none is "__none".
import { describe, expect, it } from "vitest";
import { KINDS, MEDIA_KEYS } from "../../src/features/core/core";
import { kindToggles, matrixRead } from "../../src/features/settings/settings";

const ANIME = ["", ...KINDS.anime];

describe("a mode's grid", () => {
    it("unticking one type keeps the medium's others, each by name", () => {
        const pats = matrixRead(["anime", "manga:Manga"], MEDIA_KEYS, "anime", "TV", false);
        expect(pats).toContain("manga:Manga");
        expect(pats).not.toContain("anime");
        expect(pats.filter(p => p.startsWith("anime:"))).toEqual(ANIME.filter(k => k !== "TV").map(k => "anime:" + k));
    });

    it("the medium's box ticks or unticks all of it", () => {
        expect(matrixRead(["anime:TV"], MEDIA_KEYS, "anime", "*", true)).toEqual(["anime"]);
        expect(matrixRead(["anime", "book"], MEDIA_KEYS, "anime", "*", false)).toEqual(["book"]);
    });

    it("ticking the last missing type makes it the whole medium again", () => {
        const most = ANIME.filter(k => k !== "Short").map(k => "anime:" + k);
        expect(matrixRead(most, MEDIA_KEYS, "anime", "Short", true)).toEqual(["anime"]);
    });

    it("nothing ticked shows nothing", () => {
        expect(matrixRead(["anime:TV"], MEDIA_KEYS, "anime", "TV", false)).toEqual(["__none"]);
    });

    it("what it reads back is what the grid then shows", () => {
        const pats = matrixRead(["*", "!film"], MEDIA_KEYS, "tv", "K-drama", false);
        expect(kindToggles(pats, "tv").find(([k]) => k === "K-drama")![1]).toBe(false);
        expect(
            kindToggles(pats, "tv")
                .filter(([k]) => k !== "K-drama")
                .every(([, on]) => on)
        ).toBe(true);
        expect(kindToggles(pats, "film").some(([, on]) => on)).toBe(false);
        expect(pats).toContain("book");
    });

    it("a shelf's grid lists only the mode's media, and reads back only those", () => {
        expect(matrixRead(["anime:TV"], ["anime", "manga"], "manga", "*", true).sort()).toEqual(["anime:TV", "manga"]);
    });
});
