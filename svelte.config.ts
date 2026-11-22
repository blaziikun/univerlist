// The Svelte compiler's settings, read by Vite's Svelte plugin, Vitest and svelte-check: TypeScript and SCSS inside
// components go through Vite's own preprocessing
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import type { SvelteConfig } from "@sveltejs/vite-plugin-svelte";

export default { preprocess: vitePreprocess() } satisfies SvelteConfig;
