// src/features/watch-read/player/overlay.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  What's drawn over the video while it plays: how much of a stream has arrived, waiting so it won't stop,
//  "Resumed at 12:34 · Start over", "Up next", and "None of the servers could play this here"
//
//  Each <video> gets its own (player/CinStage.svelte makes one beside it), so a new episode or server starts clean, as
//  the HTML player did when it drew a new video. The code that watches the video (video.ts, stream.ts) changes it as
//  things happen, and only the piece that changed redraws: a countdown ticking or the badge's numbers don't touch the
//  rest of the player.
// ─────────────────────────────────────────────────────────────────

import type { WatchPlayer } from "../../core/model";

/** the card over the video while a stream is getting started, or keeps stopping */
export type HoldCard =
    | { t: "start" } // "Getting it started…": working out how long to wait
    | { t: "wait"; wait: string } // "Starts in 1:30"
    | { t: "stops"; wait: string; alt: { k: number; title: string } | null }; // "Keeps stopping?": wait, or another server

export class Overlay {
    /** how much has arrived (null: the source doesn't say) */
    net = $state<{ hidden: boolean; text: string } | null>(null);
    /** the waiting card (kept, hidden, once it's done with, as the HTML one was) */
    hold = $state<{ hidden: boolean; card: HoldCard | null } | null>(null);
    /** "Resumed at 12:34 " */
    chip = $state("");
    /** "Up next", counting down */
    next = $state<{ label: string; n: number } | null>(null);
    /** none of the servers could play it */
    err = $state(false);
}

// the overlay of the video playing now, for the buttons on it (Start over, Play now, Cancel: handlers.ts)
let current: Overlay | null = null;
export const overlayNow = () => current;
export const overlayUse = (o: Overlay | null) => {
    current = o;
};

const clock = (s: number) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60),
        x = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
/** "Resumed at 12:34 · Start over", for a few seconds after picking up where you left off */
export function resumeChip(at: number) {
    const o = current;
    if (!o || at < 30) return;
    const text = `Resumed at ${clock(at)} `;
    o.chip = text;
    setTimeout(() => {
        if (o.chip === text) o.chip = "";
    }, 7000);
}
/** "Next episode in 5…" at the end, with Play now and Cancel; going on by itself when it reaches 0 */
export function upNext(p: WatchPlayer, label: string, go: () => void) {
    const o = current;
    if (!o || o.next) return;
    o.next = { label, n: 5 };
    const done = () => {
        clearInterval(p.upNextT);
        o.next = null;
    };
    p.upNextGo = () => {
        done();
        go();
    };
    p.upNextCancel = done;
    p.upNextT = setInterval(() => {
        // the player closed, or another video took its place
        if (!o.next || current !== o) {
            clearInterval(p.upNextT);
            return;
        }
        o.next = { ...o.next, n: o.next.n - 1 };
        if (o.next.n <= 0) p.upNextGo?.();
    }, 1000);
}
