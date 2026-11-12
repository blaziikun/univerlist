// The identity guard (tools/guard.ts): a private word is found however it's written or hidden, and nothing else is.
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { fold, hitsIn, holdsWord, readWords, readings } from "../../tools/guard.ts";

const words = readWords({ PRIVATE_WORDS: "Jane Doe\nexample-person@example.com\n# a comment\nab" }, "/nowhere");
const found = (text: string) => readings(Buffer.from(text)).some(t => hitsIn(t, words).length);

describe("the identity guard", () => {
    it("reads one word or phrase per line, skipping comments and anything shorter than three letters", () => {
        expect(words).toEqual(["jane doe", "example person example com"]);
    });

    it("finds a phrase across capitals, accents, line breaks, punctuation and no-break spaces", () => {
        for (const text of ["by JANE DOE", "Jané\nDoe", "jane_doe", "jane doe", "Jane - Doe", "<b>Jane</b> Doe"])
            expect(found(text), text).toBe(true);
    });

    it("finds a word in UTF-16 and Latin-1, as picture metadata stores it", () => {
        const utf16 = Buffer.from("Artist: Jane Doe", "utf16le");
        expect(readings(utf16).some(t => hitsIn(t, words).length)).toBe(true);
        const latin1 = Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47]),
            Buffer.from("tEXtAuthor\0Jane Doe", "latin1"),
        ]);
        expect(readings(latin1).some(t => hitsIn(t, words).length)).toBe(true);
    });

    it("finds an email address, and a word right before a full stop or an @", () => {
        expect(found("contact: example-person@example.com")).toBe(true);
        expect(found("By Jane Doe.")).toBe(true);
        expect(found("jane.doe@example.org")).toBe(true);
    });

    it("looks inside zips, however deep", () => {
        const inner = zipSync({ "notes.txt": new TextEncoder().encode("written by Jane Doe") });
        const outer = Buffer.from(zipSync({ "backup.zip": inner }));
        expect(holdsWord(outer, words)).toBe(true);
        expect(holdsWord(Buffer.from(zipSync({ "a.txt": new TextEncoder().encode("nothing here") })), words)).toBe(
            false
        );
    });

    it("leaves other words alone, including ones that only contain a word", () => {
        for (const text of ["Janet Doerr", "jane", "doe", "a library of everything"])
            expect(found(text), text).toBe(false);
    });

    it("folds text the same way it folds the words", () => {
        expect(fold("Ĵane—DOE")).toBe("jane doe");
    });
});
