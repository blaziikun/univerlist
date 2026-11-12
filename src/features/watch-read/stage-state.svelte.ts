// src/features/watch-read/stage-state.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  Watch & read's own news: when its pages, the player and the reader should draw again
//
//  Watch & read keep their state in plain objects the older code changes in place (W, RD, RLS…), so the components
//  can't see a change by themselves. They draw when the older code asks them to, exactly as often as the HTML was
//  redrawn, and not on every change to your library: renderMain() for the Watch and Read pages, renderPlayer() for the
//  whole player (a new <video>), and the smaller asks for a part of it (the list beside it, its server strip, its
//  subtitles, the Watched tick); renderReader() for the reader. Asking bumps a number here that only those components
//  read, and draws at once (so code that redraws and then reads the page finds it drawn, as it did the HTML).
//  This module imports nothing of the app's, so the older modules can use it (they can't import the store).
// ─────────────────────────────────────────────────────────────────

import { flushSync } from "svelte";

const tick = $state({
    page: 0,
    res: 0,
    video: 0,
    player: 0,
    side: 0,
    srv: 0,
    subs: 0,
    mark: 0,
    look: 0,
    reader: 0,
    rdlive: 0,
});

/** the components read these: each draws again when its number moves */
export const stageNews = {
    /** the Watch or Read page (renderMain) */
    get page() {
        return tick.page;
    },
    /** what a search found, and the mark moving through it (the rest of the page stays as it is) */
    get res() {
        return tick.res;
    },
    /** a new <video> (or what stands in for one): renderPlayer() */
    get video() {
        return tick.video;
    },
    /** the player around the video: its buttons, panels and bar (renderPlayer(), or playerRedraw() alone) */
    get player() {
        return tick.player;
    },
    /** the blocks beside and under the player, and "Customise this page" (cinSideRedraw) */
    get side() {
        return tick.side;
    },
    /** the server strip at the top of the player (srvRefresh) */
    get srv() {
        return tick.srv;
    },
    /** the subtitle picker under the player (subRefresh) */
    get subs() {
        return tick.subs;
    },
    /** the Watched tick and the Lights button, which change while it plays (the Lights' class on #cinema too) */
    get mark() {
        return tick.mark;
    },
    /** the player's look (its size, corners, shade…), which follows a slider as you drag it */
    get look() {
        return tick.look;
    },
    /** the reader (renderReader) */
    get reader() {
        return tick.reader;
    },
    /** where you are in it, which moves as you scroll a long strip (the reader isn't drawn again for that) */
    get rdlive() {
        return tick.rdlive;
    },
};
type Part = keyof typeof tick;
// asked from inside a Svelte update (a box Svelte removes sends "change" as it goes, and a listener redraws), the news
// waits until that update is done: state can't change in the middle of one
const soon = (f: () => void) => {
    if ($effect.tracking()) queueMicrotask(f);
    else f();
};
/** these parts draw again now */
export function stageChanged(...parts: Part[]) {
    soon(() => {
        for (const p of parts) tick[p]++;
        flushSync();
    });
}
