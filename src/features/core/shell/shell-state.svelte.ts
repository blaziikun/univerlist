// src/features/core/shell/shell-state.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  The shell's own news: when the sidebar, top bar or search box should draw again
//
//  The shell (the sidebar, the top bar, the search box: core/shell/) draws when the older code asks it to
//  (renderSide(), renderTop(), renderSideStatus(), a search's progress), exactly as often as it did as HTML, and not on
//  every change to your library: a cover arriving doesn't recount the sidebar. Asking bumps a number here, which only
//  the shell's components read, so pages aren't woken by it. What the top bar's busy light says is kept here too: the
//  background work that changes it (artwork, scores, AniList) reports it often (setBusy), and only that light redraws.
//  This module imports nothing of the app's, so the older modules can use it (they can't import the store).
// ─────────────────────────────────────────────────────────────────

import { flushSync } from "svelte";

const tick = $state({ side: 0, search: 0 });

/** the shell's components read this: they draw again when it moves */
export const shellNews = {
    get side() {
        return tick.side;
    },
    get search() {
        return tick.search;
    },
};
// asked from inside a Svelte update (a box Svelte removes sends "change" as it goes, and a listener redraws the
// sidebar), the news waits until that update is done: state can't change in the middle of one
const soon = (f: () => void) => {
    if ($effect.tracking()) queueMicrotask(f);
    else f();
};
/** the sidebar, top bar and profile header draw again now (now: so code that redraws and then reads them finds it
 *  drawn, as it did the HTML) */
export function shellChanged() {
    soon(() => {
        tick.side++;
        flushSync();
    });
}
/** the search box draws again now */
export function searchChanged() {
    soon(() => {
        tick.search++;
        flushSync();
    });
}
/** the top bar's busy light: whether it shows, what it says, and whether it's a warning (setBusy) */
const light = $state({ on: false, title: "", warn: false });
export const busy: Readonly<typeof light> = light;
export function setBusy(on: boolean, title: string, warn: boolean) {
    soon(() => Object.assign(light, { on, title, warn }));
}
