// src/features/watch-read/intro.ts
// ─────────────────────────────────────────────────────────────────
//  Where an episode's opening is, for Skip intro
//
//  Skip intro shows only while an opening is actually playing, as on a streaming site, so it has to know where the
//  opening is. Two places say: the file itself, when its chapters name one ("Opening", "OP", "Intro"; a companion
//  that reads files reports them, stream.ts), and, for anime, AniSkip (free, no key: openings marked by viewers, by
//  MyAnimeList id and episode), asked straight from the browser, or through the site's /api when that's refused.
//  When neither knows, there's no button (S still jumps ahead by your setting).
// ─────────────────────────────────────────────────────────────────

import { at, numOf, recordsOf, textOf } from "../core/core";

/** where the opening starts and ends, in seconds */
export type Intro = { start: number; end: number };
const KNOWN = new Map<string, Intro | null>();

/** the opening AniSkip has for one episode, from its answer: the first marked as an opening, or null */
export function aniskipIntro(answer: unknown): Intro | null {
    if (at(answer, "found") !== true) return null;
    for (const r of recordsOf(at(answer, "results"))) {
        const type = textOf(r.skipType),
            start = numOf(at(r, "interval", "startTime")),
            end = numOf(at(r, "interval", "endTime"));
        if (
            (type === "op" || type === "mixed-op") &&
            start !== undefined &&
            end !== undefined &&
            end > start &&
            end - start < 400
        )
            return { start, end };
    }
    return null;
}
/** the opening named among a file's chapters ({ start, end, title }), or null */
export function chapterIntro(chapters: unknown): Intro | null {
    for (const c of recordsOf(chapters)) {
        const start = numOf(c.start),
            end = numOf(c.end);
        if (
            /^\s*(op|opening|intro|introduction|opening (credits|song|theme))\b/i.test(textOf(c.title)) &&
            start !== undefined &&
            end !== undefined &&
            end > start + 5 &&
            end - start < 400
        )
            return { start, end };
    }
    return null;
}
async function ask(url: string): Promise<unknown> {
    const r = await fetch(url);
    if (r.status === 404) return { found: false };
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
}
/** an anime episode's opening, from AniSkip (null when nobody has marked it, or it can't be reached) */
export async function introOf(mal: number, ep: number): Promise<Intro | null> {
    const key = mal + ":" + ep;
    if (KNOWN.has(key)) return KNOWN.get(key) ?? null;
    let answer: unknown = null;
    try {
        answer = await ask(
            `https://api.aniskip.com/v2/skip-times/${mal}/${ep}?types=op&types=mixed-op&episodeLength=0`
        );
    } catch (_) {
        // refused from this page (or unreachable): the site's own Worker asks instead
        if (/^https?:$/.test(location.protocol))
            try {
                answer = await ask(`${location.origin}/api/aniskip/${mal}/${ep}`);
            } catch (_) {}
    }
    const found = aniskipIntro(answer);
    KNOWN.set(key, found);
    return found;
}
