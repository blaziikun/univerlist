// @vitest-environment happy-dom
// CSVs in (Papa Parse, core/core.ts parseCSV): any separator, quotes, line breaks inside a cell, a column name used
// twice. CSVs out (csvCell, exportCSV): a cell can't become a spreadsheet formula, and a line break inside one stays inside.
import { afterEach, describe, expect, it, vi } from "vitest";
import { csvCell, exportCSV, items, parseCSV } from "../../src/features/core/core";
import { readImportFile } from "../../src/features/import-export/importers";
import { bare } from "./bare";

afterEach(() => {
    vi.restoreAllMocks();
    items.clear();
});

describe("reading a CSV", () => {
    it("works out the separator: a semicolon or tab file from Excel in another language reads as columns", async () => {
        const want = [{ Titel: "Die Verwandlung", Jahr: "1915", Note: "4,5" }];
        expect(await parseCSV("Titel;Jahr;Note\r\nDie Verwandlung;1915;4,5\r\n")).toEqual(want);
        expect(await parseCSV("Titel\tJahr\tNote\nDie Verwandlung\t1915\t4,5\n")).toEqual(want);
        expect(await parseCSV('Titel,Jahr,Note\n"Die Verwandlung",1915,"4,5"')).toEqual(want);
    });

    it('reads quotes ("" inside a quoted cell), line breaks inside one, a byte-order mark and blank lines', async () => {
        const rows = await parseCSV(
            '﻿Title,Notes\r\n"Dune","He said ""fear is the mind-killer""\r\nThen left, quickly"\r\n\r\nArrival,\r\n'
        );
        expect(rows).toEqual([
            { Title: "Dune", Notes: 'He said "fear is the mind-killer"\r\nThen left, quickly' },
            { Title: "Arrival", Notes: "" },
        ]);
    });

    it("keeps both columns when a name is used twice", async () => {
        expect(await parseCSV("Name,Year,Name\nDune,1965,Frank Herbert")).toEqual([
            { Name: "Dune", Year: "1965", "Name (2)": "Frank Herbert" },
        ]);
    });

    it("brings in a semicolon Goodreads export, and opens any other one in the column matcher with its columns", async () => {
        const gr = new File(
            ["Title;Author;Exclusive Shelf;My Rating;Date Read\nDune;Frank Herbert;read;5;2024/03/05\n"],
            "goodreads.csv"
        );
        const p = await readImportFile(gr);
        expect(p.kind).toBe("Goodreads");
        expect(p.items![0]).toMatchObject({ title: "Dune", creator: "Frank Herbert", status: "done", rating: 10 });
        const other = await readImportFile(new File(["Film;Gesehen am;Wertung\nM;2024-01-02;9\n"], "liste.csv"));
        expect(other.kind).toBe("custom");
        expect(other.columns).toEqual(["Film", "Gesehen am", "Wertung"]);
    });
});

describe("writing a CSV", () => {
    it("puts a ' before anything a spreadsheet would run as a formula", () => {
        expect(csvCell('=HYPERLINK("https://example.com","x")')).toBe('"\'=HYPERLINK(""https://example.com"",""x"")"');
        expect(csvCell("+1")).toBe("'+1");
        expect(csvCell("-2+3")).toBe("'-2+3");
        expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
        expect(csvCell("\tcmd")).toBe("'\tcmd");
        expect(csvCell("\r=1")).toBe('"\'\r=1"');
        expect(csvCell("Dune")).toBe("Dune");
        expect(csvCell(-3)).toBe("-3");
        expect(csvCell(null)).toBe("");
    });

    it("quotes a cell with a return in it, so the row isn't cut there", () => {
        expect(csvCell("one\rtwo")).toBe('"one\rtwo"');
        expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    });

    it("the whole library's CSV can't carry a formula", async () => {
        let blob = null;
        vi.spyOn(URL, "createObjectURL").mockImplementation(b => {
            blob = b;
            return "blob:x";
        });
        items.set(
            "film-x",
            bare({ medium: "film", title: "=1+1", notes: "-cmd|' /C calc'!A0", status: "done", rating: 8 })
        );
        exportCSV();
        const text = await blob!.text();
        expect(text).toContain(",'=1+1,");
        expect(text).toContain(",'-cmd|' /C calc'!A0,");
        expect(text).not.toMatch(/,[=+\-@]/);
    });
});
