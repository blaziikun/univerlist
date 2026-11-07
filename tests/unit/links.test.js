// The project's own addresses live in public/_redirects only. Everything else links to the site's /source, /issues,
// /report and /sponsor, so moving the code (another GitHub name, another host) means changing that one file.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".git", "dist", "dist-file", ".wrangler", "out", "fixtures"]);
const files = [];
const collect = folder => {
    for (const name of fs.readdirSync(folder)) {
        if (SKIP.has(name)) continue;
        const full = path.join(folder, name);
        if (fs.statSync(full).isDirectory()) collect(full);
        else if (/\.(js|ts|svelte|html|md|yml|json|jsonc|scss)$/.test(name) && name !== "pnpm-lock.yaml")
            files.push(full);
    }
};
collect(ROOT);

const redirects = fs
    .readFileSync(path.join(ROOT, "public/_redirects"), "utf8")
    .split("\n")
    .filter(l => l.trim() && !l.startsWith("#"))
    .map(l => l.trim().split(/\s+/));

describe("the project's own addresses", () => {
    it("are each sent somewhere, temporarily (302), so they can change", () => {
        expect(redirects.map(r => r[0]).sort()).toEqual(["/issues", "/report", "/source", "/sponsor"]);
        for (const [, to, code] of redirects) {
            expect(to).toMatch(/^https:\/\//);
            expect(code).toBe("302");
        }
    });

    it("are linked through the site, never to a GitHub account directly", () => {
        const direct = files.filter(f =>
            /github\.com\/(sponsors\/[\w-]+|[\w-]+\/univerlist\b)/.test(fs.readFileSync(f, "utf8"))
        );
        expect(direct.map(f => path.relative(ROOT, f))).toEqual([]);
    });

    it("and every one the app links to exists", () => {
        const used = new Set();
        for (const f of files)
            for (const m of fs
                .readFileSync(f, "utf8")
                .matchAll(/univerlist\.sayel\.dev(\/(?:source|issues|report|sponsor))\b/g))
                used.add(m[1]);
        const known = new Set(redirects.map(r => r[0]));
        expect([...used].filter(u => !known.has(u))).toEqual([]);
        expect(used.has("/source")).toBe(true);
    });
});
