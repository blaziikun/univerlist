// src/features/sources/work-state.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  Background work's own news: when what Settings › Data says about it should draw again
//
//  Finding artwork, crowd scores, an AniList sync and reading LaunchBox's database run for minutes and report every
//  step (renderAutoStatus, renderAlStatus, the LaunchBox import), far more often than the page is drawn. Their state
//  is in plain objects the older code changes in place (auto, scoreQ, alSync, LB), so the components that show it
//  (settings/sections/data/) can't see a step by themselves. Each step bumps a number here that only those read, and
//  draws at once, exactly as the banners were written straight into the page: the rest of Settings isn't drawn again.
//  This module imports nothing of the app's, so the older modules can use it (they can't import the store).
// ─────────────────────────────────────────────────────────────────

import { flushSync } from "svelte";

const tick = $state({ auto: 0, al: 0, lb: 0 });

/** the components read these: each draws again when its number moves */
export const workNews = {
    /** finding artwork, saving it for offline, crowd scores (renderAutoStatus) */
    get auto() {
        return tick.auto;
    },
    /** an AniList sync (renderAlStatus) */
    get al() {
        return tick.al;
    },
    /** reading LaunchBox's database, and what's kept of it */
    get lb() {
        return tick.lb;
    },
};
type Part = keyof typeof tick;
// asked from inside a Svelte update, the news waits until that update is done: state can't change in the middle of one
const soon = (f: () => void) => {
    if ($effect.tracking()) queueMicrotask(f);
    else f();
};
/** this part draws again now */
export function workChanged(part: Part) {
    soon(() => {
        tick[part]++;
        flushSync();
    });
}
