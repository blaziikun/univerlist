// src/features/watch-read/player.ts
// ─────────────────────────────────────────────────────────────────
//  The player's own controls, and making the player page yours
//
//  Controls on the video: a scrub bar (what has loaded shows on it; hover for the time; it also seeks converted
//  streams, which the browser's own controls can't), play, time and volume, plus any button you put there. Every button
//  lives on the video, under it, or nowhere, chosen by dragging them around in "Edit on the page", or in ⋯. The same
//  edit mode sets the player's size, the side panel's width, corners, how big the controls are, how dark the shade
//  behind them is, how soon they hide, and where subtitles sit. The browser's own controls are one setting away (player
//  settings › Controls). player/*.svelte draw all of it; what moves as the video plays is drawn here (pcDraw).
// ─────────────────────────────────────────────────────────────────

import { $, markDirty, meta, ownOf, ui } from "../core/core";
import { playerRedraw, PS, renderPlayer, W, WP, wpSave } from "./watch";
import type { WatchPage } from "./watch";
import { ssKey } from "./series";
import { stageChanged } from "./stage-state.svelte";
import type { WatchPlayer, WatchSource } from "../core/model";

/** how the player looks: its size, the side panel, corners, controls, the shade behind them, subtitles */
export interface Look {
    size: number;
    side: number;
    radius: number;
    ctl: number;
    dim: number;
    hideAfter: number;
    subPos: number;
    subBg: number;
}
const LOOK_DEF: Look = { size: 100, side: 340, radius: 12, ctl: 100, dim: 60, hideAfter: 2.6, subPos: 0, subBg: 55 };
const SPOT_DEF: Record<string, string> = {
    play: "video",
    back: "video",
    fwd: "video",
    skip: "video",
    time: "video",
    vol: "video",
    gap: "video",
    subs: "video",
    speed: "video",
    full: "video",
};
export const LOOK = (): Look => {
    const mine = WP().look || {},
        get = (k: keyof Look) => ownOf(mine, k) ?? LOOK_DEF[k];
    return {
        size: get("size"),
        side: get("side"),
        radius: get("radius"),
        ctl: get("ctl"),
        dim: get("dim"),
        hideAfter: get("hideAfter"),
        subPos: get("subPos"),
        subBg: get("subBg"),
    };
};
/** where a button sits: "video", "under" or "off" */
export const spotOf = (wp: WatchPage, k: string): string =>
    wp.off.includes(k) ? "off" : ownOf(wp.spot || {}, k) || ownOf(SPOT_DEF, k) || "under";
export const customControls = () => PS().controls !== "browser";
const fmtT = (s: number) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60),
        x = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
const video = () => $<HTMLVideoElement>("#cinema video");
/** where you are in what's playing, counting a converted stream's starting point */
export const curAt = () => {
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
// ── the player's own controls, as the video plays ──
// Controls.svelte and Tool.svelte draw them; what changes as the video plays (how far along it is, what has loaded, the
// time, ▶ or ❚❚, the volume) is written straight onto them here, on the video's own events: several times a second,
// which a component redrawing each time would only slow down. Each control says it's there through its attachment
// (pcPart), wherever you've put it, so moving one or drawing the player again needs nothing more.
type Part = "scrub" | "time" | "play" | "volr" | "mute";
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
    if (CTL.play) {
        CTL.play.textContent = v.paused ? "▶" : "❚❚";
        CTL.play.setAttribute("aria-pressed", String(!v.paused));
    }
}
// the volume's slider and the mute button, from the video
function pcVolume(v: HTMLVideoElement) {
    if (CTL.volr instanceof HTMLInputElement) CTL.volr.value = String(v.muted ? 0 : v.volume);
    if (CTL.mute) CTL.mute.textContent = v.muted || v.volume <= 0.02 ? "🔇" : "🔊";
}
/** a control's attachment: it's drawn from the video at once, and kept in step from then on */
export const pcPart =
    (part: Part) =>
    (el: HTMLElement): (() => void) => {
        // with the browser's own controls these buttons still work when pressed, but nothing draws on them
        if (!W.player?.frame?.custom) return () => {};
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
        if (ui.wpEdit) return;
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
/** the player's own controls follow this video (video.ts): its events draw them; a click on the picture plays or
 *  pauses, a double click is full screen */
export function pcBind(v: HTMLVideoElement) {
    for (const ev of ["timeupdate", "progress", "play", "pause", "durationchange", "loadedmetadata", "seeking"])
        v.addEventListener(ev, pcDraw);
    pcDraw();
    pcVolume(v);
    v.addEventListener("volumechange", () => pcVolume(v));
    v.addEventListener("click", () => {
        if (ui.wpEdit) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
    });
    v.addEventListener("dblclick", () => cinFull());
    v.addEventListener("loadedmetadata", () => subLines(v));
}
/** full screen, or back */
export function cinFull() {
    const el = $("#cinema");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
}
/** the look, as the CSS variables the player's styles read (Cinema.svelte puts them on #cinema) */
export function lookVars() {
    const L = LOOK();
    return {
        size: L.size + "%",
        side: L.side + "px",
        radius: L.radius + "px",
        ctl: (L.ctl / 100).toFixed(2),
        dim: (L.dim / 100).toFixed(2),
        subBg: (L.subBg / 100).toFixed(2),
    };
}
/** one of the look's sliders moved (EditBar.svelte): kept, and the player follows as you drag */
export function lookSet(k: keyof Look, v: number) {
    const p = WP();
    p.look = { ...(p.look || {}), [k]: v };
    wpSave(p);
    stageChanged("look");
    const vd = video();
    if (vd && k === "subPos") subLines(vd);
}
// subtitles sit higher when you raise them (whole lines up from the bottom)
function subLines(v: HTMLVideoElement) {
    const n = LOOK().subPos;
    for (const t of v.textTracks)
        for (const c of [...(t.cues || [])])
            try {
                if (!(c instanceof VTTCue)) continue;
                c.snapToLines = true;
                c.line = n ? -(1 + n) : "auto";
            } catch (_) {}
}
/** a button dragged onto the video, under it or into Hidden, before another (Cinema.svelte's dragging) */
export function wtMove(k: string, zone: string, beforeK: string | null) {
    const p = WP();
    p.spot = { ...(p.spot || {}) };
    p.off = p.off.filter(x => x !== k);
    if (zone === "off") p.off.push(k);
    else p.spot[k] = zone;
    p.tools = p.tools.filter(x => x !== k);
    const i = beforeK ? p.tools.indexOf(beforeK) : -1;
    if (i >= 0) p.tools.splice(i, 0, k);
    else p.tools.push(k);
    wpSave(p);
    playerRedraw();
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
    if (i < 0 || i === p.k) return;
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
