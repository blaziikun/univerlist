// Every button says what it does in data-act, and each area's handlers.js knows its own. These keep that honest: a
// button nobody handles does nothing when pressed, and a name handled in two areas only ever reaches the first.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FEATURES = path.resolve(__dirname, "../../src/features");
const sourceFiles = [];
const collect = folder => {
    for (const name of fs.readdirSync(folder)) {
        const full = path.join(folder, name);
        if (fs.statSync(full).isDirectory()) collect(full);
        else if (/\.(js|ts|svelte)$/.test(name)) sourceFiles.push(full);
    }
};
collect(FEATURES);
const source = Object.fromEntries(sourceFiles.map(f => [path.relative(FEATURES, f), fs.readFileSync(f, "utf8")]));
const everything = Object.values(source).join("\n");
const caseNames = text => [...text.matchAll(/^\s*case "([a-z0-9-]+)":/gm)].map(m => m[1]);

describe("buttons", () => {
    it("every button's data-act is handled somewhere", () => {
        const handled = new Set(caseNames(everything));
        for (const m of everything.matchAll(/(?:\bact|\ba|\bk) === "([a-z0-9-]+)"/g)) handled.add(m[1]);
        for (const m of everything.matchAll(/\[data-act="([a-z0-9-]+)"\]/g)) handled.add(m[1]);
        const prefixes = [...everything.matchAll(/act\.startsWith\("([a-z0-9-]+)"\)/g)].map(m => m[1]);
        const unhandled = [];
        for (const [file, text] of Object.entries(source))
            for (const m of text.matchAll(/data-act=\\?["']([a-z0-9-]+)\\?["']/g))
                if (!handled.has(m[1]) && !prefixes.some(p => m[1].startsWith(p))) unhandled.push(`${m[1]} (${file})`);
        expect(unhandled).toEqual([]);
    });

    it("no button name is handled by two areas", () => {
        const handlers = Object.keys(source).filter(f => /(^|\/|-)handlers\.js$/.test(f));
        expect(handlers.length).toBeGreaterThan(5);
        const owner = {};
        const twice = [];
        for (const file of handlers)
            for (const name of caseNames(source[file])) {
                if (owner[name] && owner[name] !== file) twice.push(`${name}: ${owner[name]} and ${file}`);
                owner[name] = file;
            }
        expect(twice).toEqual([]);
    });
});
