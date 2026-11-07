// src/features/core/pages.ts
// ─────────────────────────────────────────────────────────────────
//  The pages drawn by Svelte
//
//  The classic page code (core/shell.js renderMain) asks for one of these when you open it, and lets it go when you
//  leave. While it's open, the page draws itself and keeps up with the store; renderMain leaves it alone.
//  Moving another page to Svelte is one line here, and its name in SVELTE_PAGES in shell.js.
// ─────────────────────────────────────────────────────────────────

import { type Component, mount, unmount } from "svelte";
import Guide from "../settings/Guide.svelte";
import Settings from "../settings/Settings.svelte";

const PAGES: Record<string, Component> = {
    settings: Settings,
    features: Guide, // "What's in here": the guide
};

let shown: { name: string; app: ReturnType<typeof mount> } | null = null;

export const hasPage = (name: string) => Object.hasOwn(PAGES, name);
export function showPage(name: string, main: HTMLElement) {
    if (shown?.name === name) return;
    hidePage();
    main.innerHTML = "";
    shown = { name, app: mount(PAGES[name], { target: main }) };
}
export function hidePage() {
    if (!shown) return;
    unmount(shown.app);
    shown = null;
}
