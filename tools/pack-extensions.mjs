// tools/pack-extensions.mjs
// ─────────────────────────────────────────────────────────────────
//  Pack: each extension folder → <id>.zip
//
//  node tools/pack-extensions.mjs <folder of extensions> <out folder>
//  The companion goes in too (people need it), without node_modules or caches.
// ─────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";

export function packExtension(dir) {
    const files = {},
        skip = /(^|\/)(node_modules|cache)(\/|$)|\.DS_Store$/;
    const walk = rel => {
        for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const r = rel ? rel + "/" + e.name : e.name;
            if (skip.test(r)) continue;
            if (e.isDirectory()) walk(r);
            else files[path.basename(dir) + "/" + r] = new Uint8Array(fs.readFileSync(path.join(dir, r)));
        }
    };
    walk("");
    return zipSync(files, { level: 9 });
}

// run directly (not imported); real paths, so a symlinked folder still counts
const real = p => {
    try {
        return fs.realpathSync(p);
    } catch {
        return p;
    }
};
if (
    process.argv[1] &&
    pathToFileURL(real(new URL(import.meta.url).pathname)).href ===
        pathToFileURL(real(path.resolve(process.argv[1]))).href
) {
    const [from = "extensions", to = "dist/extensions"] = process.argv.slice(2);
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true }))
        if (e.isDirectory() && fs.existsSync(path.join(from, e.name, "extension.json"))) {
            const out = path.join(to, e.name + ".zip");
            fs.writeFileSync(out, packExtension(path.join(from, e.name)));
            console.log("packed", out);
        }
}
