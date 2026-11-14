// ============ build ============
//   pnpm build        → dist/        the website: hashed files, works offline after the first visit, installable
//   pnpm build:file   → dist-file/   one index.html that works opened straight from disk, no internet needed
//   pnpm build:e2e    → dist-e2e/ and dist-file-e2e/: the same two, plus the test hook the browser tests drive the
//                       page through (core/test-hook.ts). Nothing else differs: the hook is in only where
//                       __UL_TEST_HOOK__ is true, and every other build is checked for it (tools/no-test-hook.ts)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

// the one-file build has no service worker: the offline-install code becomes a no-op
const noServiceWorker = (): Plugin => ({
  name: "no-service-worker",
  resolveId: id => (id === "virtual:pwa-register" ? "\0pwa-off" : null),
  load: id => (id === "\0pwa-off" ? "export const registerSW = () => async () => {};" : null)
});

// Settings › Data offers the stand-alone catalogue proxy to copy into a Worker of your own: worker/proxy.ts, given to the
// app (import "virtual:proxy-script") as plain JavaScript. The types come out and the comments stay, then Biome lays it
// out as the rest of the code is, so it reads like a file written by hand. Blank lines are kept through a marker, since
// TypeScript's output drops them.
const PROXY_SOURCE = fileURLToPath(new URL("worker/proxy.ts", import.meta.url));
const BLANK = "/*\u2063*/";
function proxyScript(source: string): string {
  const marked = source.replace(/^[ \t]*$/gm, BLANK);
  const js = ts.transpileModule(marked, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: true }
  }).outputText.replace(/^[ \t]*\/\*\u2063\*\/[ \t]*$/gm, "");
  const biome = fileURLToPath(new URL("node_modules/.bin/biome", import.meta.url));
  return execFileSync(biome, ["format", "--stdin-file-path=src/proxy-script.js"], { input: js, encoding: "utf8" });
}
const proxyScriptModule = (): Plugin => ({
  name: "proxy-script",
  resolveId: id => (id === "virtual:proxy-script" ? "\0proxy-script" : null),
  load(id) {
    if (id !== "\0proxy-script") return null;
    this.addWatchFile(PROXY_SOURCE);
    return `export default ${JSON.stringify(proxyScript(readFileSync(PROXY_SOURCE, "utf8")))};`;
  }
});

export default defineConfig(({ mode }) => {
  const e2e = mode === "e2e" || mode === "file-e2e";
  const file = mode === "file" || mode === "file-e2e";
  return {
    base: "./",
    define: { __UL_TEST_HOOK__: JSON.stringify(e2e) },
    publicDir: file ? false : "public",
    // tests use Svelte's browser runtime, so runes and effects run in them as they do in the app (Svelte's testing guide)
    resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
    build: { outDir: (file ? "dist-file" : "dist") + (e2e ? "-e2e" : ""), emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 4000 },
    plugins: [
      svelte(),
      proxyScriptModule(),
      file ? [viteSingleFile(), noServiceWorker()] : VitePWA({
        registerType: "prompt",
        injectRegister: false,
        includeAssets: ["icon.svg"],
        manifest: {
          name: "UniverList", short_name: "UniverList",
          description: "Track everything you watch, read and play.",
          theme_color: "#05060a", background_color: "#05060a", display: "standalone", start_url: "./",
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon.svg", sizes: "any", type: "image/svg+xml" }
          ]
        },
        workbox: {
          // the app itself is kept for offline use at once. Fonts and the stream player (hls.js) aren't: each is
          // fetched the first time it's needed, then kept, so a visit doesn't download every theme's fonts
          globPatterns: ["**/*.{html,js,css,svg,png}"],
          // ext-host.html is never kept: its security rules are its headers (public/_headers), and a kept copy keeps
          // the headers it came with until the file itself changes, so a fix to them would never reach you
          globIgnores: ["**/hls-*.js", "ext-host.html"],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && /\.(woff2|js)$/.test(url.pathname),
              handler: "CacheFirst", // their names change whenever they do, so a kept copy is never out of date
              options: { cacheName: "on-first-use", expiration: { maxEntries: 60 } },
            },
          ],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          // the redirects in public/_redirects go to the network, not to the app kept offline
          // ext-host.html too (and /ext-host, where Cloudflare sends it): an extension's frame is a page load, and it must be
          // that page, from the site, never the app
          navigateFallbackDenylist: [/^\/api\//, /^\/extensions\//, /^\/(source|issues|report|sponsor)$/, /^\/ext-host(\.html)?$/]
        }
      })
    ]
  };
});
