// src/features/insights/pick/pick.ts
// ─────────────────────────────────────────────────────────────────
//  Pick for me: what fits the time you have, best first
//
//  What's in progress comes first, then Up next, then what you rank highest in your backlog (welo), favourites, the
//  crowd's score and what you own. "Shuffle" adds a random amount to each, once (`jitter`, by id).
//  PickForMe.svelte shows it.
// ─────────────────────────────────────────────────────────────────

import { CATS, catOf, meta, minutesPerUnit } from "../../core/core";
import { crowd, modeItems, pct, progText } from "../../core/views";
import type { Entry } from "../../core/model";

/** how much time you have: its key and what the button says */
export const PICK_TIMES: [key: string, label: string][] = [
    ["short", "25 minutes"],
    ["hours", "An hour or two"],
    ["evening", "An evening"],
    ["weekend", "A weekend"],
];
/** whether an entry fits the time you have */
function fits(b: Entry, time: string) {
    const ep = b.runtime || minutesPerUnit(b),
        left = b.total ? Math.max(0, b.total - (b.prog || 0)) : null;
    switch (time) {
        case "short":
            return (
                (["anime", "tv"].includes(b.medium) && ep <= 35) ||
                ["manga", "manhwa", "novel", "comic"].includes(b.medium) ||
                (b.medium === "book" && (b.status === "active" || b.format === "Short"))
            );
        case "hours":
            return b.medium === "film"
                ? (b.runtime || 115) <= 150
                : ["anime", "tv"].includes(b.medium) ||
                      b.medium === "game" ||
                      b.medium === "book" ||
                      ["manga", "manhwa", "novel"].includes(b.medium);
        case "evening":
            return (
                b.medium === "film" ||
                b.medium === "game" ||
                (["anime", "tv"].includes(b.medium) && (left == null || left * ep <= 360)) ||
                b.medium === "book"
            );
        default:
            return (
                b.medium === "book" ||
                b.medium === "game" ||
                (["anime", "tv"].includes(b.medium) && (left == null || left * ep <= 1200)) ||
                ["manga", "manhwa", "novel"].includes(b.medium)
            );
    }
}
/** why it's suggested, in a line */
export const pickWhy = (b: Entry) =>
    b.status === "active"
        ? `You're ${pct(b) ? pct(b) + "% " : ""}through it: ${progText(b)}.`
        : meta.queue.includes(b.id)
          ? `It's #${meta.queue.indexOf(b.id) + 1} in Up next.`
          : b.why || b.about || "";
/** the media families this mode has, the best fit and six more */
export function pickFor(time: string, media: string[], own: boolean, jitter: ReadonlyMap<string, number> | null) {
    const M = modeItems(),
        present = CATS.filter(c => M.some(b => catOf(b) === c[0]));
    const pool = M.filter(
        b =>
            ["want", "active", "paused"].includes(b.status) &&
            (!media.length || media.includes(catOf(b))) &&
            (!own || b.copy !== "none") &&
            fits(b, time)
    );
    const score = (b: Entry) =>
        (b.status === "active" ? 3 : b.status === "paused" ? 1 : 0) +
        (meta.queue.includes(b.id) ? 2 - meta.queue.indexOf(b.id) * 0.1 : 0) +
        ((b.welo || 1500) - 1500) / 100 +
        (b.fav ? 0.5 : 0) +
        (crowd(b).avg || 60) / 100 +
        (b.copy !== "none" ? 0.3 : 0) +
        (jitter?.get(b.id) || 0);
    pool.sort((a, b) => score(b) - score(a));
    const top: Entry | undefined = pool[0];
    return { present, top, rest: pool.slice(1, 7) };
}
