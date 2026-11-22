// Subtitle tracks name their language every way there is (player/lang.ts): yours has to be found in all of them, and
// a full track picked over one that only has the signs, or nothing at all picked when none is yours.
import { describe, expect, it } from "vitest";
import { langCode, subFor } from "../../src/features/watch-read/player/lang";

describe("a subtitle track's language", () => {
    it("is read from a two-letter code, a three-letter one, a region, or a name", () => {
        for (const x of ["en", "EN", "eng", "en-GB", "en_US", "English", "english", "English (SDH)", "ENG Forced"])
            expect(langCode(x), x).toBe("en");
        expect(langCode("pt-BR")).toBe("pt");
        expect(langCode("Português (Brasil)")).toBe("pt");
        expect(langCode("fre")).toBe("fr");
        expect(langCode("fra")).toBe("fr");
        expect(langCode("deu")).toBe("de");
        expect(langCode("jpn")).toBe("ja");
        expect(langCode("日本語")).toBe("ja");
        expect(langCode("zh-Hans")).toBe("zh");
    });
    it("isn't guessed from a word that only looks like a code, or from nothing", () => {
        for (const x of ["", undefined, null, "Signs", "Track 2", "it's fine", "off"])
            expect(langCode(x), String(x)).toBe("");
    });
});

describe("the track that comes on", () => {
    const T = (lang: string, label: string, forced = false) => ({ lang, label, forced, url: lang + label });
    it("is yours, however it's labelled, the full one before signs or forced lines", () => {
        const L = [
            T("jpn", "Japanese"),
            T("eng", "Signs & Songs"),
            T("eng", "English"),
            T("en", "English Forced", true),
        ];
        expect(subFor(L, "en")?.label).toBe("English");
        expect(subFor([T("", "English (SDH)"), T("ja", "")], "en")?.label).toBe("English (SDH)");
    });
    it("is a partial one when that's all there is in your language", () => {
        expect(subFor([T("en", "Signs")], "en")?.label).toBe("Signs");
    });
    it("is none when none is yours", () => {
        expect(subFor([T("ja", "Japanese"), T("es", "Español")], "en")).toBeUndefined();
        expect(subFor([T("en", "English")], "")).toBeUndefined();
    });
});
