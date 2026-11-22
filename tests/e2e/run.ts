// ============ run every browser test, one after another ============
// Each test prints "ok   …" or "FAIL …" per check; this sums them up and fails if any check failed.
//   node tests/e2e/run.ts [part of a name…]    (pnpm test:e2e builds the test build first, then runs this)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const dir = import.meta.dirname;
const only = process.argv.slice(2);
const HELPERS = ["env.ts", "mocks.ts", "sync-server.ts", "helpers.ts", "run.ts"];
const tests = fs
    .readdirSync(dir)
    .filter(f => f.endsWith(".ts") && !HELPERS.includes(f) && (!only.length || only.some(o => f.includes(o))))
    .sort();
let failed = 0,
    passed = 0,
    skipped = 0;
for (const t of tests) {
    const r = spawnSync(process.execPath, [path.join(dir, t)], { encoding: "utf8", timeout: 300000 });
    const out = (r.stdout || "") + (r.stderr || ""),
        ok = (out.match(/^ok /gm) || []).length,
        bad = out.split("\n").filter(l => /^FAIL /.test(l));
    const skip = out.match(/^skip +(.*)$/m);
    if (skip && !ok) {
        skipped++;
        console.log(`skip  ${t}  (${skip[1]})`);
        continue;
    }
    const crashed = r.status !== 0 || (!ok && !bad.length);
    if (bad.length || crashed) {
        failed++;
        console.log(`FAIL  ${t}`);
        for (const l of bad) console.log("      " + l);
        if (crashed) console.log(out.split("\n").slice(-8).join("\n"));
    } else {
        passed++;
        console.log(`ok    ${t}  (${ok} checks)`);
    }
}
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
