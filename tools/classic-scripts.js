// tools/classic-scripts.js
// ─────────────────────────────────────────────────────────────────
//  Classic scripts: most of the app, joined into one script
//
//  The .js files in src/features/<feature>/ share one global scope, so they're joined in the order of
//  src/features/order.json and loaded as a classic <script>, exactly as in the single-file app. New code (src/main.ts,
//  and the .ts/.svelte files in src/features/) is normal ES modules and talks to them through the globals they share.
//    dev     served at /app.js, and the page reloads when a script changes
//    build   minified into assets/univerlist-<hash>.js
//    file    written straight into index.html (the one-file offline build)
// ─────────────────────────────────────────────────────────────────
// @ts-check

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { transform } from "esbuild";

/** @param {{ inline?: boolean }} opts */
export default function classicScripts({ inline = false } = {}) {
    const dir = path.resolve("src/features"),
        list = path.resolve("src/features/order.json"),
        proxyFile = path.resolve("worker/proxy.js");
    const join = () => {
        const { order } = JSON.parse(fs.readFileSync(list, "utf8"));
        const proxySrc = JSON.stringify(fs.readFileSync(proxyFile, "utf8")); // the stand-alone proxy the app offers to copy
        return order
            .map(n => `// ---- ${n}.js\n` + fs.readFileSync(path.join(dir, n + ".js"), "utf8"))
            .join("\n")
            .replace('/*@PROXY_SOURCE@*/""', () => proxySrc); // a function, so "$" in the code stays as it is
    };
    // top-level names stay as they are (they're shared between modules); everything inside functions is minified
    const minify = async () =>
        (await transform(join(), { minify: true, legalComments: "none", target: "es2022" })).code;
    let command = "serve",
        script = "";
    return {
        name: "univerlist-classic-scripts",
        configResolved(c) {
            command = c.command;
        },
        configureServer(server) {
            server.middlewares.use("/app.js", (_req, res) => {
                res.setHeader("Content-Type", "text/javascript");
                res.end(join());
            });
            server.watcher.add([dir, list, proxyFile]);
            server.watcher.on("change", f => {
                if ((f.startsWith(dir) && f.endsWith(".js")) || f === list || f === proxyFile)
                    server.ws.send({ type: "full-reload" });
            });
        },
        async buildStart() {
            if (command !== "build") return;
            const code = await minify();
            if (inline) {
                script = `<script>${code.replace(/<\/script/gi, () => "<\\/script")}</script>`;
                return;
            }
            const fileName = `assets/univerlist-${crypto.createHash("sha256").update(code).digest("hex").slice(0, 10)}.js`;
            this.emitFile({ type: "asset", fileName, source: code });
            script = `<script src="./${fileName}"></script>`;
        },
        transformIndexHtml: {
            order: "post",
            handler(html) {
                const tag = command === "build" ? script : `<script src="/app.js"></script>`;
                return html.replace("<!-- app scripts -->", () => tag);
            },
        },
    };
}
