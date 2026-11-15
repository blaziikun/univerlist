// src/features/watch-read/player/subtitles.ts
// ─────────────────────────────────────────────────────────────────
//  Subtitles, drawn by the player itself over the video
//
//  Browsers draw a video's text tracks their own way, and most ignore a page's styles for them (Safari and Firefox
//  take little of ::cue; Chrome sizes them from the video's height). So the track you picked is kept "hidden" (its cues
//  still arrive, and say when they change), and its lines are written into the player's own box (.pc-subtext), which
//  takes the size, height and background from your settings in every browser. The rest of the app turns tracks on by
//  setting them "showing", as it always did; this notices and takes them over. In an iPhone's own full screen, which
//  only draws the browser's way, the track shows natively until you come out of it.
// ─────────────────────────────────────────────────────────────────

// the track drawn now, and the one C brings back
const SHOWN = new WeakMap<HTMLVideoElement, TextTrack>();
const LAST = new WeakMap<HTMLVideoElement, TextTrack>();
const nativeFull = (v: HTMLVideoElement) => Reflect.get(v, "webkitDisplayingFullscreen") === true;
const box = (v: HTMLVideoElement) => v.closest(".cin-stage")?.querySelector<HTMLElement>(".pc-subtext") ?? null;

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
/** the video's tracks are watched from now until the signal ends: one set "showing" is taken over and drawn here */
export function subWatch(v: HTMLVideoElement, signal: AbortSignal) {
    const seen = new WeakSet<TextTrack>();
    const take = () => {
        if (nativeFull(v)) return;
        for (const t of v.textTracks) {
            if (!seen.has(t)) {
                seen.add(t);
                t.addEventListener("cuechange", () => SHOWN.get(v) === t && draw(v), { signal });
            }
            if (t.mode === "showing") {
                SHOWN.set(v, t);
                LAST.set(v, t);
                t.mode = "hidden";
            }
        }
        const cur = SHOWN.get(v);
        if (cur && cur.mode === "disabled") SHOWN.delete(v);
        draw(v);
    };
    v.textTracks.addEventListener("change", take, { signal });
    v.textTracks.addEventListener("addtrack", take, { signal });
    // an iPhone's own full screen draws only the browser's way: the track shows natively there, and back here after
    v.addEventListener(
        "webkitbeginfullscreen",
        () => {
            const t = SHOWN.get(v);
            if (t) t.mode = "showing";
        },
        { signal }
    );
    v.addEventListener(
        "webkitendfullscreen",
        () => {
            const t = SHOWN.get(v);
            if (t) t.mode = "hidden";
            draw(v);
        },
        { signal }
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
