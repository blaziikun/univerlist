// src/features/core/menus.ts
// ─────────────────────────────────────────────────────────────────
//  The right-click menus drawn by Svelte
//
//  Every right-click menu shows in one box (#ctx), which the older code in core/keys.ts places, closes on a click
//  elsewhere, Escape or a scroll away, and hides. A menu listed here is mounted in that box when it opens (with what
//  it's about: an entry's id, a list's, a mode's…) and keeps itself up to date through the store; it's let go when the
//  menu closes or another opens. The small menus a button opens (a block's settings, the tab editor, an episode's link)
//  are the same, opened at the button (openMenu in core/keys.ts).
//  Moving another menu to Svelte is one line here (its kind and its component).
// ─────────────────────────────────────────────────────────────────

import { type Component, flushSync, mount, unmount } from "svelte";
import BlockMenu from "./menus/BlockMenu.svelte";
import CharMenu from "./menus/CharMenu.svelte";
import EpisodeMenu from "./menus/EpisodeMenu.svelte";
import ItemMenu from "./menus/ItemMenu.svelte";
import ListMenu from "./menus/ListMenu.svelte";
import ModeMenu from "./menus/ModeMenu.svelte";
import TabEditor from "./menus/TabEditor.svelte";
import TabMenu from "./menus/TabMenu.svelte";
import TierMenu from "./menus/TierMenu.svelte";
import { store } from "./store.svelte";

const MENUS: Record<string, Component<{ k: string }>> = {
    item: ItemMenu,
    char: CharMenu,
    list: ListMenu,
    mode: ModeMenu,
    tab: TabMenu,
    tier: TierMenu,
    block: BlockMenu,
    tabedit: TabEditor,
    episode: EpisodeMenu,
};

let shown: { box: HTMLElement; app: ReturnType<typeof mount> } | null = null;

/** draw a menu in the box, for the thing it's about (k) */
export function drawMenu(kind: string, k: string, box: HTMLElement) {
    dropMenu();
    box.innerHTML = "";
    box.dataset.svelte = ""; // the older code that reaches into the page leaves this box to the menu
    shown = { box, app: mount(MENUS[kind], { target: box, props: { k } }) };
    flushSync();
}
/** bring the menu up to date now: before it's measured, or after the older code changed something in place */
export function menuCatchUp() {
    if (shown) store.flush();
}
export const menuShown = () => !!shown;
export function dropMenu() {
    if (!shown) return;
    unmount(shown.app);
    delete shown.box.dataset.svelte;
    shown = null;
}
