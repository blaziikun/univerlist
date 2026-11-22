// src/features/watch-read/playable.ts
// ─────────────────────────────────────────────────────────────────
//  Which of an episode's servers this browser can play, so it starts on one that works
//
//  A server may say what it sends (`type`, a MIME type), or its address says it (.mkv, .m3u8…). Safari, on a phone
//  or a Mac, plays no Matroska (.mkv) at all, while Chrome and Firefox play most; adaptive streams (.m3u8) play
//  natively in Safari and through hls.js elsewhere. What can't play here goes to the end of the list, the rest keep
//  the order they came in: the player still tries the next one by itself if one fails.
// ─────────────────────────────────────────────────────────────────

import type { WatchSource } from "../core/model";

const HLS = "application/vnd.apple.mpegurl";
const BY_EXT: Record<string, string> = {
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    m3u8: HLS,
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
};
/** what a source is, as a MIME type: what it says, or what its address ends in ("" when neither says) */
export function typeOf(s: WatchSource): string {
    if (s.type) return s.type.toLowerCase();
    if (s.file) return s.file.type.toLowerCase();
    const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(s.url || "");
    return (m && BY_EXT[m[1].toLowerCase()]) || "";
}
/** what this browser can do, asked once (a tiny interface so the tests can stand in for any browser) */
export interface Browser {
    can: (mime: string) => string; // HTMLMediaElement.canPlayType
    apple: boolean; // Safari's engine: every browser on an iPhone or iPad, and Safari on a Mac
    mse: boolean; // MediaSource, which hls.js plays adaptive streams through
}
/** how likely a source plays here: 2 surely, 1 probably or can't tell, 0 it can't */
export function chance(s: WatchSource, b: Browser): number {
    const t = typeOf(s);
    if (!t) return 1;
    const base = t.split(";")[0].trim();
    if (base === HLS || base === "application/x-mpegurl") return b.can(HLS) ? 2 : b.mse ? 1 : 0;
    if (base === "video/x-matroska") return b.apple ? 0 : b.can(t) ? 2 : 1; // Chrome plays it without saying so
    if (base === "video/x-msvideo") return b.can(t) ? 1 : 0;
    const c = b.can(t);
    return c === "probably" ? 2 : c === "maybe" ? 1 : 0;
}
/** the sources' places, best first; equal ones keep their order */
export function playOrder(srcs: WatchSource[], b: Browser): number[] {
    return srcs
        .map((s, i) => ({ i, c: chance(s, b) }))
        .sort((x, y) => y.c - x.c || x.i - y.i)
        .map(x => x.i);
}
let here: Browser | null = null;
/** this browser */
export function browser(): Browser {
    if (here) return here;
    const v = document.createElement("video"),
        ua = navigator.userAgent,
        apple =
            /iP(hone|ad|od)/.test(ua) ||
            (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || // an iPad asking for the desktop site
            (/Safari\//.test(ua) && /Apple/.test(navigator.vendor) && !/Chrome|Chromium|Edg|Firefox/.test(ua));
    here = { can: m => v.canPlayType(m), apple, mse: typeof MediaSource !== "undefined" };
    return here;
}
/** the first source worth starting on */
export const firstPlayable = (srcs: WatchSource[]): number => playOrder(srcs, browser())[0] ?? 0;
