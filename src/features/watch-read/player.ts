// src/features/watch-read/player.ts
// ─────────────────────────────────────────────────────────────────
//  The player's own controls, as the video plays
//
//  Laid out like a streaming site's (player/Controls.svelte): the scrub bar (what has loaded shows on it; hover for the
//  time; it also seeks converted streams, which the browser's own controls can't), then play, next, the volume and the
//  time on the left, and the settings, subtitles, cinema mode and full screen on the right. Over the picture
//  (player/CinStage.svelte): a click in the middle plays or pauses, the sides jump back and forward (a double click or
//  a double tap there too), and Skip intro while an opening plays. What moves as the video plays is drawn here
//  (pcDraw), on the video's own events, not through Svelte.
// ─────────────────────────────────────────────────────────────────

import { $, markDirty, meta, ownOf, ui } from "../core/core";
import { playingVideo } from "./player/pip";
import { playerRedraw, PS, renderPlayer, W } from "./watch";
import { ssKey } from "./series";
import { browser, chance } from "./playable";
import type { WatchPlayer, WatchSource } from "../core/model";

const fmtT = (s: number) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60),
        x = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
const video = () => playingVideo();
/** where you are in what's playing, counting a converted stream's starting point */
const curAt = () => {
    const p = W.player,
        v = video();
    return p && v ? (p.offset || 0) + (v.currentTime || 0) : 0;
};
const curDur = () => {
    const p = W.player,
        v = video();
    return (p && p.dur) || (p && v && Number.isFinite(v.duration) ? (p.offset || 0) + v.duration : 0);
};
/** seeking that works on every kind of source: a converted stream starts again from the new point */
export function pcSeekTo(t: number) {
    const p = W.player,
        v = video();
    if (!p || !v) return;
    const src: WatchSource = p.srcs[p.k] || {},
        D = curDur();
    t = Math.max(0, D ? Math.min(D - 1, t) : t);
    if (src.how === "converted") {
        p.keepAt = Math.max(t, 0.01);
        renderPlayer();
        return;
    } // (.01, not 0: 0 would mean "where you left off")
    v.currentTime = t - (p.offset || 0);
}
export const pcSeekBy = (d: number) => pcSeekTo(curAt() + d);
/** Skip intro (its button, or S): to where the opening ends, when that's known; otherwise ahead by your setting */
export function introSkip() {
    const p = W.player,
        at = curAt(),
        i = p?.intro;
    if (i && at >= i.start - 1 && at < i.end) pcSeekTo(i.end);
    else if (PS().skip) pcSeekBy(PS().skip);
}
/** the player's panels: the settings (⚙), the subtitles (CC), the servers, and the page's own settings. One at a time */
export type Panel = "opts" | "cc" | "srcs" | "page";
export function panelToggle(k: Panel) {
    const p = W.player;
    if (!p) return;
    const on = k === "opts" ? !p.opts : k === "cc" ? !p.cc : k === "srcs" ? !p.srcOpen : !ui.wpOpts;
    p.opts = k === "opts" && on;
    p.cc = k === "cc" && on;
    p.srcOpen = k === "srcs" && on;
    ui.wpOpts = k === "page" && on;
    playerRedraw();
}
/** every panel closes (a click outside them, Escape) */
export function panelsClose() {
    const p = W.player;
    if (!p || !(p.opts || p.cc || p.srcOpen || ui.wpOpts)) return;
    p.opts = p.cc = p.srcOpen = false;
    ui.wpOpts = false;
    playerRedraw();
}
// ── the player's own controls, as the video plays ──
// Controls.svelte draws them; what changes as the video plays (how far along it is, what has loaded, the time, play
// or pause, the volume) is written straight onto them here, on the video's own events: several times a second, which
// a component redrawing each time would only slow down. Each control says it's there through its attachment (pcPart).
type Part = "scrub" | "time" | "play" | "volr" | "mute" | "bigplay";
const CTL: Partial<Record<Part, HTMLElement>> = {};
let dragging = false; // the scrub bar is being dragged: it follows the pointer, not the video
/** draws the controls from the video playing now */
function pcDraw() {
    const p = W.player,
        v = video();
    if (!p || !v) return;
    const D = curDur(),
        at = curAt(),
        f = D ? Math.min(1, at / D) : 0,
        scrub = CTL.scrub,
        done = scrub?.querySelector<HTMLElement>(".pc-done"),
        knob = scrub?.querySelector<HTMLElement>(".pc-knob"),
        buf = scrub?.querySelector<HTMLElement>(".pc-buf");
    if (scrub && done && knob && !dragging) {
        done.style.width = (f * 100).toFixed(2) + "%";
        knob.style.left = (f * 100).toFixed(2) + "%";
        scrub.setAttribute("aria-valuenow", String(Math.round(at)));
        scrub.setAttribute("aria-valuemax", String(Math.round(D)));
        scrub.setAttribute("aria-valuetext", `${fmtT(at)} of ${fmtT(D)}`);
    }
    let b = 0;
    try {
        for (let i = 0; i < v.buffered.length; i++)
            if (v.buffered.start(i) <= v.currentTime + 0.5) b = Math.max(b, v.buffered.end(i));
    } catch (_) {}
    if (buf) buf.style.width = (D ? Math.min(1, ((p.offset || 0) + b) / D) * 100 : 0).toFixed(2) + "%";
    if (CTL.time) CTL.time.textContent = `${fmtT(at)} / ${D ? fmtT(D) : "–:––"}`;
    // play and pause: both icons are there, the button's state says which shows
    for (const el of [CTL.play, CTL.bigplay])
        if (el) {
            el.dataset.on = v.paused ? "" : "1";
            el.setAttribute("aria-label", v.paused ? "Play (space)" : "Pause (space)");
        }
}
// the volume's slider and the mute button, from the video
function pcVolume(v: HTMLVideoElement) {
    const off = v.muted || v.volume <= 0.02;
    if (CTL.volr instanceof HTMLInputElement) CTL.volr.value = String(v.muted ? 0 : v.volume);
    if (CTL.mute) {
        CTL.mute.dataset.on = off ? "" : "1";
        CTL.mute.setAttribute("aria-label", off ? "Unmute (M)" : "Mute (M)");
    }
}
/** a control's attachment: it's drawn from the video at once, and kept in step from then on */
export const pcPart =
    (part: Part) =>
    (el: HTMLElement): (() => void) => {
        CTL[part] = el;
        pcDraw();
        const v = video();
        if (v && (part === "volr" || part === "mute")) pcVolume(v);
        return () => {
            if (CTL[part] === el) delete CTL[part];
        };
    };
/** the scrub bar's attachment: hover for the time, click or drag to go there (a converted stream starts again from it),
 *  ← → on it jump */
export function pcScrub(scrub: HTMLElement): () => void {
    const tip = scrub.querySelector<HTMLElement>(".pc-tip"),
        done = scrub.querySelector<HTMLElement>(".pc-done"),
        knob = scrub.querySelector<HTMLElement>(".pc-knob"),
        off = pcPart("scrub")(scrub);
    const fracAt = (e: PointerEvent) => {
        const r = scrub.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    const move = (e: PointerEvent) => {
        const D = curDur();
        if (!D || !tip) return;
        const f = fracAt(e);
        tip.hidden = false;
        tip.textContent = fmtT(f * D);
        tip.style.left = f * 100 + "%";
        if (dragging && done && knob) done.style.width = knob.style.left = f * 100 + "%";
    };
    const leave = () => {
        if (!dragging && tip) tip.hidden = true;
    };
    const down = (e: PointerEvent) => {
        dragging = true;
        scrub.setPointerCapture(e.pointerId);
        const f = fracAt(e);
        if (done && knob) done.style.width = knob.style.left = f * 100 + "%";
    };
    const up = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        if (tip) tip.hidden = true;
        const D = curDur();
        if (D) pcSeekTo(fracAt(e) * D);
    };
    const key = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            pcSeekBy((e.key === "ArrowRight" ? 1 : -1) * PS().seek);
        }
    };
    scrub.addEventListener("pointermove", move);
    scrub.addEventListener("pointerleave", leave);
    scrub.addEventListener("pointerdown", down);
    scrub.addEventListener("pointerup", up);
    scrub.addEventListener("keydown", key);
    return () => {
        off();
        scrub.removeEventListener("pointermove", move);
        scrub.removeEventListener("pointerleave", leave);
        scrub.removeEventListener("pointerdown", down);
        scrub.removeEventListener("pointerup", up);
        scrub.removeEventListener("keydown", key);
        dragging = false;
    };
}
/** the volume slider moved */
export function pcVolumeSet(x: number) {
    const v = video();
    if (!v) return;
    v.volume = Math.max(0, x);
    v.muted = x <= 0.02;
}
/** play or pause */
export function pcToggle() {
    const v = video();
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
}
/** the player's own controls follow this video (video.ts): its events draw them */
export function pcBind(v: HTMLVideoElement, signal: AbortSignal) {
    for (const ev of ["timeupdate", "progress", "play", "pause", "durationchange", "loadedmetadata", "seeking"])
        v.addEventListener(ev, pcDraw, { signal });
    pcDraw();
    pcVolume(v);
    v.addEventListener("volumechange", () => pcVolume(v), { signal });
}
/** what a press on the picture does (CinStage's stage): in the middle, play or pause (a double click: full screen);
 *  on either side, a double click or tap jumps back or forward, and each further tap jumps again. On a phone a
 *  single tap shows or hides the controls instead, as a streaming app does. wake() shows the controls, sleep() hides
 *  them; shown() says whether they're up */
export function tapZones(o: { wake: () => void; sleep: () => void; shown: () => boolean }) {
    return (el: HTMLElement) => {
        let timer: ReturnType<typeof setTimeout> | undefined,
            lastSide = "",
            lastAt = 0,
            burst = false;
        const side = (e: PointerEvent) => {
            const r = el.getBoundingClientRect(),
                x = (e.clientX - r.left) / r.width;
            return x < 0.3 ? "back" : x > 0.7 ? "fwd" : "mid";
        };
        const jump = (s: string) => {
            pcSeekBy((s === "back" ? -1 : 1) * PS().seek);
            flash(el, s);
            o.wake();
        };
        const up = (e: PointerEvent) => {
            // only the picture itself (a card or a button over it does its own thing)
            const t = e.target;
            if (
                e.button > 0 ||
                !(t instanceof HTMLVideoElement || t === el || (t instanceof Element && t.matches(".pc-mid")))
            )
                return;
            const s = side(e),
                touch = e.pointerType === "touch",
                now = Date.now(),
                again = s === lastSide && now - lastAt < 320;
            lastSide = s;
            lastAt = now;
            clearTimeout(timer);
            // a double press on a side jumps; while you keep tapping it, each tap jumps again
            if (s !== "mid" && (again || burst)) {
                burst = true;
                jump(s);
                timer = setTimeout(() => (burst = false), 600);
                return;
            }
            // one press: wait a moment in case it's the first of two (on the sides), then do what a single one does
            const single = () => {
                if (touch) {
                    if (o.shown()) o.sleep();
                    else o.wake();
                } else {
                    pcToggle();
                    o.wake();
                }
            };
            if (s === "mid" && !touch) single();
            else timer = setTimeout(single, 280);
        };
        // a double click in the middle: full screen (each click of it played or paused, as on a streaming site)
        const dbl = (e: MouseEvent) => {
            const t = e.target,
                r = el.getBoundingClientRect(),
                x = (e.clientX - r.left) / r.width;
            if (x >= 0.3 && x <= 0.7 && (t instanceof HTMLVideoElement || t === el)) cinFull();
        };
        el.addEventListener("pointerup", up);
        el.addEventListener("dblclick", dbl);
        return () => {
            clearTimeout(timer);
            el.removeEventListener("pointerup", up);
            el.removeEventListener("dblclick", dbl);
        };
    };
}
// the ⟲ or ⟳ that flashes where you double-tapped
function flash(el: HTMLElement, s: string) {
    const f = el.querySelector<HTMLElement>(`.pc-flash.${s}`);
    if (!f) return;
    f.classList.remove("go");
    void f.offsetWidth;
    f.classList.add("go");
}
// ── full screen ──
const fsEl = () => document.fullscreenElement || (Reflect.get(document, "webkitFullscreenElement") as Element | null);
/** full screen: the player alone (its picture and controls), or back. On an iPhone, whose browser lets only a video go
 *  full screen, the video's own full screen */
export function cinFull() {
    const box = $<HTMLElement>("#cinema .cin-main"),
        v = video();
    if (fsEl()) {
        (document.exitFullscreen ? document.exitFullscreen() : Promise.resolve()).catch(() => {});
        const wexit: unknown = Reflect.get(document, "webkitExitFullscreen");
        if (!document.exitFullscreen && typeof wexit === "function") wexit.call(document);
        return;
    }
    if (box && typeof box.requestFullscreen === "function" && document.fullscreenEnabled !== false) {
        box.requestFullscreen({ navigationUI: "hide" }).catch(() => nativeFull(v));
        return;
    }
    const wreq: unknown = box ? Reflect.get(box, "webkitRequestFullscreen") : null;
    if (box && typeof wreq === "function" && Reflect.get(document, "webkitFullscreenEnabled")) {
        wreq.call(box);
        return;
    }
    nativeFull(v);
}
// the video's own full screen (iPhone)
function nativeFull(v: HTMLVideoElement | null) {
    const enter: unknown = v ? Reflect.get(v, "webkitEnterFullscreen") : null;
    if (v && typeof enter === "function") enter.call(v);
}
/** whether the player is full screen now */
export const isFull = () => !!fsEl();
/** the look the player's styles read, as CSS variables (Cinema.svelte puts them on #cinema): the subtitles' size,
 *  height and background */
export function lookVars() {
    const o = PS();
    return {
        sub: (Math.max(50, Math.min(250, o.subSize)) / 100).toFixed(2),
        subPos: String(Math.max(0, Math.min(12, o.subPos))),
        subBg: (Math.max(0, Math.min(100, o.subBg)) / 100).toFixed(2),
    };
}
// ── small things that make watching nicer ──
// the server you pick for a show is the one its other episodes start on (your own copy, a friend's, a server…)
const srvWho = (x: WatchSource | undefined) =>
    String((x && x.name) || "")
        .split(" · ")[0]
        .trim();
function srvPrefKey() {
    try {
        return ssKey();
    } catch (_) {
        return "";
    }
}
export function srvRemember(p: WatchPlayer) {
    const s = p.srcs[p.k],
        key = srvPrefKey();
    if (!s || !key) return;
    meta.settings.srvPref = { ...(meta.settings.srvPref || {}), [key]: { who: srvWho(s), how: s.how || "" } };
    markDirty();
}
/** the index of your usual server for this show among these, or -1 */
export function srvPreferred(p: WatchPlayer): number {
    const pref = ownOf(meta.settings.srvPref || {}, srvPrefKey());
    if (!pref) return -1;
    const i = p.srcs.findIndex(s => srvWho(s) === pref.who && (s.how || "") === pref.how);
    return i >= 0 ? i : p.srcs.findIndex(s => srvWho(s) === pref.who);
}
/** when servers arrive: if your usual one for this show is among them and you haven't really started, it plays */
export function srvApplyPref(p: WatchPlayer) {
    if (p.prefDone || p.single) return;
    const i = srvPreferred(p);
    // (not one this browser can't play, however much you like it elsewhere)
    if (i < 0 || i === p.k || chance(p.srcs[i], browser()) === 0) return;
    const v = video();
    if (v && (p.offset || 0) + v.currentTime > 5) {
        p.prefDone = true;
        return;
    }
    p.prefDone = true;
    p.keepAt = v ? (p.offset || 0) + v.currentTime : p.keepAt;
    p.k = i;
    renderPlayer();
}
