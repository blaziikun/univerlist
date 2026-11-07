// ============ build ============
//   pnpm build        → dist/        the website: hashed files, works offline after the first visit, installable
//   pnpm build:file   → dist-file/   one index.html that works opened straight from disk, no internet needed
import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";
import classicScripts from "./tools/classic-scripts.js";

// the one-file build has no service worker: the offline-install code becomes a no-op
const noServiceWorker = (): Plugin => ({
  name: "no-service-worker",
  resolveId: id => (id === "virtual:pwa-register" ? "\0pwa-off" : null),
  load: id => (id === "\0pwa-off" ? "export const registerSW = () => async () => {};" : null)
});

export default defineConfig(({ mode }) => {
  const file = mode === "file";
  return {
    base: "./",
    publicDir: file ? false : "public",
    // tests use Svelte's browser runtime, so runes and effects run in them as they do in the app (Svelte's testing guide)
    resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
    build: { outDir: file ? "dist-file" : "dist", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 4000 },
    plugins: [
      classicScripts({ inline: file }),
      svelte(),
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
          globIgnores: ["**/hls-*.js"],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/assets/") && /\.(woff2|js)$/.test(url.pathname),
              handler: "CacheFirst", // their names change whenever they do, so a kept copy is never out of date
              options: { cacheName: "on-first-use", expiration: { maxEntries: 60 } },
            },
          ],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          // the redirects in public/_redirects go to the network, not to the app kept offline
          navigateFallbackDenylist: [/^\/api\//, /^\/extensions\//, /^\/(source|issues|report|sponsor)$/]
        }
      })
    ]
  };
});
