// tools/no-test-hook.ts
// ─────────────────────────────────────────────────────────────────
//  No test hook: fails if the browser tests' way into the page (window.__ulTest, core/test-hook.ts) is in a build
//  people get. pnpm build and pnpm build:file run it on what they've just built, so the site can't deploy with it and
//  the one-file build can't be handed out with it.
//
//    node tools/no-test-hook.ts <build folder>…      e.g. dist dist-file
//
//  It looks for the hook's own name and for names only the hook puts in a build as text (a minified build keeps a
//  function's name only where something asks for it by name, as the hook does). With --has, it checks the opposite: a
//  test build (dist-file-e2e) has every one of them, so the list can't quietly stop matching what the hook writes.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";

/** the hook's name, and names the hook writes into a build that nothing else does */
export const MARKS = [
    "__ulTest",
    "quietPatch",
    "goSettings",
    "watchFromItem",
    "lcStripPersonal",
    "seasonsAcrossLibrary",
];

/** every file in a folder, however deep */
function filesIn(dir: string): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap(e => (e.isDirectory() ? filesIn(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** which of the marks each built file that the browser loads (HTML, scripts, the service worker) holds */
export function marksIn(dir: string): Map<string, string[]> {
    const found = new Map<string, string[]>();
    for (const file of filesIn(dir).filter(f => /\.(html|js|mjs)$/.test(f))) {
        const text = fs.readFileSync(file, "utf8");
        const hits = MARKS.filter(m => text.includes(m));
        if (hits.length) found.set(path.relative(dir, file), hits);
    }
    return found;
}

function main(args: string[]) {
    const has = args[0] === "--has";
    const dirs = has ? args.slice(1) : args;
    if (!dirs.length) {
        console.error("no-test-hook: name the build folders to check, e.g. node tools/no-test-hook.ts dist dist-file");
        process.exit(2);
    }
    let bad = false;
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            console.error(`no-test-hook: ${dir} isn't there (build it first)`);
            bad = true;
            continue;
        }
        const found = marksIn(dir);
        if (has) {
            const seen = new Set([...found.values()].flat());
            const missing = MARKS.filter(m => !seen.has(m));
            if (missing.length) {
                console.error(`no-test-hook: ${dir} should have the test hook, but has no ${missing.join(", ")}`);
                bad = true;
            } else console.log(`no-test-hook: ${dir} has the test hook, as a test build should`);
        } else if (found.size) {
            for (const [file, hits] of found) console.error(`no-test-hook: ${dir}/${file} has ${hits.join(", ")}`);
            bad = true;
        } else console.log(`no-test-hook: ${dir} has no test hook`);
    }
    process.exit(bad ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
    main(process.argv.slice(2));
