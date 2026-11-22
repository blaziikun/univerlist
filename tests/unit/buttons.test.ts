// Every button says what it does in data-act, and each area's handlers file knows its own. These keep that honest: a
// button nobody handles does nothing when pressed, and a name handled in two areas only ever reaches the first.
// A Svelte component may handle a button of its own itself (onclick on the same tag, or onchange on a box): it keeps its data-act name for
// tests and keybinds to find it by, and no handlers file may then handle that name too, or a press would act twice.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FEATURES = path.resolve(import.meta.dirname, "../../src/features");
const sourceFiles: string[] = [];
const collect = (folder: string) => {
    for (const name of fs.readdirSync(folder)) {
        const full = path.join(folder, name);
        if (fs.statSync(full).isDirectory()) collect(full);
        else if (/\.(js|ts|svelte)$/.test(name)) sourceFiles.push(full);
    }
};
collect(FEATURES);
const source = Object.fromEntries(
    sourceFiles.map((f): [string, string] => [path.relative(FEATURES, f), fs.readFileSync(f, "utf8")])
);
const everything = Object.values(source).join("\n");
/** each opening <name …> tag in a component, whole: a > inside {…} (an arrow function) doesn't end it */
const openTags = (text: string, name: string) => {
    const tags = [];
    for (let i = text.indexOf("<" + name); i >= 0; i = text.indexOf("<" + name, i + 1)) {
        let depth = 0,
            j = i;
        while (j < text.length && !(text[j] === ">" && depth === 0)) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") depth--;
            j++;
        }
        tags.push(text.slice(i, j + 1));
    }
    return tags;
};
/** the data-act names of buttons a Svelte component handles itself: an onclick on the same tag (or, for a box with a
 *  data-act such as Pick for me's "Only things I own", an onchange) */
const ownButtons = () => {
    const names = new Set<string>();
    for (const [file, text] of Object.entries(source))
        if (file.endsWith(".svelte")) {
            // a button, or something pressed like one (the reader's progress bar, a slider you click)
            for (const tag of [...openTags(text, "button"), ...openTags(text, "div")]) {
                const name = /\sdata-act="([a-z0-9-]+)"/.exec(tag);
                if (name && /\sonclick=\{/.test(tag)) names.add(name[1]);
            }
            for (const tag of openTags(text, "input")) {
                const name = /\sdata-act="([a-z0-9-]+)"/.exec(tag);
                if (name && /\sonchange=\{/.test(tag)) names.add(name[1]);
            }
        }
    return names;
};
const caseNames = (text: string) => [...text.matchAll(/^\s*case "([a-z0-9-]+)":/gm)].map(m => m[1]);

describe("buttons", () => {
    it("every button's data-act is handled somewhere", () => {
        const handled = new Set(caseNames(everything));
        for (const m of everything.matchAll(/(?:\bact|\ba|\bk) === "([a-z0-9-]+)"/g)) handled.add(m[1]);
        for (const m of everything.matchAll(/\[data-act="([a-z0-9-]+)"\]/g)) handled.add(m[1]);
        for (const name of ownButtons()) handled.add(name);
        const prefixes = [...everything.matchAll(/act\.startsWith\("([a-z0-9-]+)"\)/g)].map(m => m[1]);
        const unhandled = [];
        for (const [file, text] of Object.entries(source))
            for (const m of text.matchAll(/data-act=\\?["']([a-z0-9-]+)\\?["']/g))
                if (!handled.has(m[1]) && !prefixes.some(p => m[1].startsWith(p))) unhandled.push(`${m[1]} (${file})`);
        expect(unhandled).toEqual([]);
    });

    it("a button a component handles itself isn't handled by a handlers file too", () => {
        const own = ownButtons();
        expect(own.size).toBeGreaterThan(10);
        const cases = new Set(
            Object.entries(source)
                .filter(([f]) => /(^|\/|-)handlers\.(js|ts)$/.test(f))
                .flatMap(([, text]) => caseNames(text))
        );
        expect([...own].filter(n => cases.has(n))).toEqual([]);
    });

    it("no button name is handled by two areas", () => {
        const handlers = Object.keys(source).filter(f => /(^|\/|-)handlers\.(js|ts)$/.test(f));
        expect(handlers.length).toBeGreaterThan(5);
        const owner: Record<string, string> = {};
        const twice: string[] = [];
        for (const file of handlers)
            for (const name of caseNames(source[file])) {
                if (owner[name] && owner[name] !== file) twice.push(`${name}: ${owner[name]} and ${file}`);
                owner[name] = file;
            }
        expect(twice).toEqual([]);
    });
});
