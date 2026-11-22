// src/features/watch-read/player/subtitles.ts
// ─────────────────────────────────────────────────────────────────
//  Subtitles, drawn by the player itself over the video, and by the browser wherever the video goes without the page
//
//  Browsers draw a video's text tracks their own way, and most ignore a page's styles for them (Safari and Firefox
//  take little of ::cue; Chrome sizes them from the video's height). So the track you picked is kept "hidden" (its cues
//  still arrive, and say when they change), and its lines are written into the player's own box (.pc-subtext), which
//  takes the size, height and background from your settings in every browser. The rest of the app turns tracks on by
//  setting them "showing", as it always did; this notices and takes them over.
//  Where the video goes without the page, the browser has to draw them, so the track shows its way there and comes
//  back here after: an iPhone's own full screen, and picture-in-picture in Safari and Chrome (both say when it starts
//  and ends). Firefox and Zen draw a track in their picture-in-picture window only while it's "showing", and don't tell
//  the page when it opens, so there the track stays "showing" all along and the browser's own drawing of it on the
//  page is made invisible (`.cues-hidden`, _player.scss): ours shows on the page, the browser's in the small window.
//  A video's own tracks (in the file, or an adaptive stream's) in your language come on by themselves, once, as the
//  ones an extension or companion lists do (stream.ts): subtitles are on unless you turn them off.
// ─────────────────────────────────────────────────────────────────

import { langCode } from "./lang";

// the track drawn now, and the one C brings back
const SHOWN = new WeakMap<HTMLVideoElement, TextTrack>();
const LAST = new WeakMap<HTMLVideoElement, TextTrack>();
const nativeFull = (v: HTMLVideoElement) => Reflect.get(v, "webkitDisplayingFullscreen") === true;
const inPip = (v: HTMLVideoElement) =>
    document.pictureInPictureElement === v || Reflect.get(v, "webkitPresentationMode") === "picture-in-picture";
/** the browser draws the track itself now: the video is somewhere the page isn't */
const away = (v: HTMLVideoElement) => nativeFull(v) || inPip(v);
/** Firefox and Zen (Gecko): picture-in-picture the page can't see, so the track stays "showing" */
const GECKO =
    typeof navigator !== "undefined" &&
    /\bGecko\/\d/.test(navigator.userAgent) &&
    /Firefox\//.test(navigator.userAgent);
const box = (v: HTMLVideoElement) => v.closest(".cin-stage")?.querySelector<HTMLElement>(".pc-subtext") ?? null;
const words = (t: TextTrack) => t.kind === "subtitles" || t.kind === "captions";

/** writes the lines showing now into the player's box */
function draw(v: HTMLVideoElement) {
    const el = box(v);
    if (!el) return;
    const t = SHOWN.get(v);
    const lines: Node[] = [];
    if (t && t.mode !== "disabled" && t.activeCues)
        for (const c of [...t.activeCues]) {
            if (!(c instanceof VTTCue)) continue;
            const ln = document.createElement("span");
            ln.className = "ln";
            // the WebVTT parser's own fragment: only its few text tags (i, b, u, ruby, c, v), never anything else
            ln.append(c.getCueAsHTML());
            lines.push(ln);
        }
    el.replaceChildren(...lines);
    el.hidden = !lines.length;
}
/** the video's tracks are watched from now until the signal ends: one set "showing" is taken over and drawn here.
 *  want: the language to switch on by itself while nothing has shown yet (null: you turned subtitles off) */
export function subWatch(v: HTMLVideoElement, signal: AbortSignal, want: () => string | null = () => null) {
    const seen = new WeakSet<TextTrack>();
    let chosen = false; // a track has shown on this video: nothing comes on by itself after that
    if (GECKO) v.classList.add("cues-hidden");
    const take = () => {
        if (away(v)) return;
        for (const t of v.textTracks) {
            if (!seen.has(t)) {
                seen.add(t);
                t.addEventListener("cuechange", () => SHOWN.get(v) === t && draw(v), { signal });
            }
            if (t.mode === "showing") {
                SHOWN.set(v, t);
                LAST.set(v, t);
                chosen = true;
                if (!GECKO) t.mode = "hidden";
            }
        }
        const cur = SHOWN.get(v);
        if (cur && cur.mode === "disabled") SHOWN.delete(v);
        // nothing on yet: the video's own track in your language comes on
        const lang = chosen ? null : langCode(want());
        if (lang && !SHOWN.has(v)) {
            const L = [...v.textTracks].filter(t => words(t) && t.mode === "disabled");
            const t = L.find(x => langCode(x.language) === lang || langCode(x.label) === lang);
            if (t) {
                chosen = true;
                t.mode = "showing"; // the change it makes runs this again, which takes it over
            }
        }
        draw(v);
    };
    // the video went where only the browser can draw the track: it shows its way there
    const toBrowser = () => {
        const t = SHOWN.get(v);
        if (t) t.mode = "showing";
    };
    // …and back: whichever track shows (you may have picked another meanwhile) is drawn here again
    const back = () => {
        for (const t of v.textTracks)
            if (t.mode === "showing") {
                SHOWN.set(v, t);
                LAST.set(v, t);
                if (!GECKO) t.mode = "hidden";
            }
        draw(v);
    };
    v.textTracks.addEventListener("change", take, { signal });
    v.textTracks.addEventListener("addtrack", take, { signal });
    v.addEventListener("webkitbeginfullscreen", toBrowser, { signal });
    v.addEventListener("webkitendfullscreen", back, { signal });
    v.addEventListener("enterpictureinpicture", toBrowser, { signal });
    v.addEventListener("leavepictureinpicture", back, { signal });
    v.addEventListener(
        "webkitpresentationmodechanged",
        () => (inPip(v) ? toBrowser() : nativeFull(v) ? null : back()),
        {
            signal,
        }
    );
    take();
}
/** whether a track is on (drawn by the player) */
export const subOn = (v: HTMLVideoElement | null) => {
    const t = v ? SHOWN.get(v) : undefined;
    return !!t && t.mode !== "disabled";
};
/** C, for a track that came with the video or a file you loaded: off, or back on */
export function subToggle(v: HTMLVideoElement) {
    const t = SHOWN.get(v);
    if (t && t.mode !== "disabled") {
        t.mode = "disabled";
        SHOWN.delete(v);
        draw(v);
        return;
    }
    const back = LAST.get(v) || v.textTracks[0];
    if (back) back.mode = "showing";
}
/** every track off */
export function subAllOff(v: HTMLVideoElement) {
    for (const t of v.textTracks) t.mode = "disabled";
    SHOWN.delete(v);
    draw(v);
}
