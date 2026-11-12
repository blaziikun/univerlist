// src/features/watch-read/player/video.ts
// ─────────────────────────────────────────────────────────────────
//  The <video> itself: everything that has to happen to it as it plays, kept as plain code on purpose
//
//  CinStage.svelte draws the <video> and hands it to videoRig() (an attachment). From then on it's the browser's
//  element, driven by its own events: picking up where you left off, saving your place every few seconds, ticking
//  the episode watched near the end, Up next, volume and mute carried from one video to the next, trying the next
//  server when one can't play, adaptive streams through hls.js, subtitles, and the player's own controls drawn as it
//  plays (player.ts pcBind). None of that goes through Svelte: timeupdate fires several times a second, and a
//  component working its markup out again each time would only cost time while you watch. What does change what's
//  drawn (the Watched tick, the overlay's cards) changes one small piece of state, and only that redraws.
// ─────────────────────────────────────────────────────────────────

import type HlsPlayer from "hls.js";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { markDirty, meta, numOf, toast } from "../../core/core";
import type { WatchPlayer, WatchSource } from "../../core/model";
import { pcBind } from "../player";
import { stageChanged } from "../stage-state.svelte";
import { streamAttach } from "../stream";
import { loadPos, posKey, PS, renderPlayer, savePos, seasonItem, W, watchMark, watchStep } from "../watch";
import type { PlayerPrefs } from "../watch";
import { type Overlay, resumeChip, upNext } from "./overlay.svelte";

// the stream player (hls.js) for the video it's attached to
const HLS_ON = new WeakMap<HTMLVideoElement, HlsPlayer>();
// adaptive streams play natively in Safari; elsewhere through hls.js, part of the site, loaded once when first needed.
// It's one of this site's own files, never fetched from anywhere else, so the site's script rule holds
let HLSlib: typeof HlsPlayer | null = null;
/** stops a stream gently: anything still in flight finishes before it's torn down */
export function hlsStop(v: HTMLVideoElement) {
    const h = HLS_ON.get(v);
    if (!h) return;
    HLS_ON.delete(v);
    try {
        h.stopLoad();
        h.detachMedia();
    } catch (_) {}
    setTimeout(() => {
        try {
            h.destroy();
        } catch (_) {}
    }, 1500);
}
async function attachHLS(v: HTMLVideoElement, url: string, onFail: () => void) {
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = url;
        return;
    }
    try {
        if (!HLSlib) HLSlib = (await import("hls.js")).default;
        const Hls = HLSlib;
        if (!Hls || !Hls.isSupported()) return onFail();
        const h = new Hls({ maxBufferLength: 60 });
        h.loadSource(url);
        h.attachMedia(v);
        HLS_ON.set(v, h);
        h.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) {
                hlsStop(v);
                onFail();
            }
        });
    } catch (_) {
        onFail();
    }
}
const srcLabel = (x: WatchSource | undefined) =>
    x ? (x.name || "Source") + (x.how === "adaptive" ? " · stream" : x.how === "converted" ? " · converted" : "") : "";
/** what the video needs to know: the episode and its source, the address, the settings it opened with, whether the
 *  player's own controls are on it, its overlay, and what to call when it pauses (the controls stay up) */
export interface Rig {
    p: WatchPlayer;
    src: WatchSource;
    url: string;
    hls: boolean;
    o: PlayerPrefs;
    custom: boolean;
    hasNext: boolean;
    ov: Overlay;
    wake: () => void;
}
/** the <video>'s attachment: everything above, set up once for this video */
export const videoRig =
    (r: Rig): Attachment<HTMLVideoElement> =>
    v =>
        untrack(() => setUp(v, r));

function setUp(v: HTMLVideoElement, { p, src, url, hls, o, custom, hasNext, ov, wake }: Rig) {
    const si = p.si ?? 0;
    if (v.autoplay)
        v.addEventListener(
            "canplay",
            () => {
                if (!v.paused) return;
                // the browser blocked starting with sound (a long wait for a source can do it): start muted rather than sit still, and say so
                v.play().catch(() => {
                    v.muted = true;
                    v.play()
                        .then(() =>
                            toast("Started muted: the browser wouldn't play sound by itself. Press M to unmute.")
                        )
                        .catch(() => {});
                });
            },
            { once: true }
        );
    const key = p.e != null ? posKey(si, p.e) : null;
    W.lastKey = key;
    // volume and mute survive the player being drawn again (a late source, switching servers); a volume dragged to 0 never leaves you silent after unmuting
    const vol = (W.vol = W.vol || { muted: false, last: o.volume > 0.02 ? o.volume : 0.6 });
    v.volume = o.volume > 0.02 ? o.volume : vol.last;
    v.muted = !!vol.muted;
    v.playbackRate = +o.speed || 1;
    const fail = () => {
        if (!v.isConnected || W.player !== p) return;
        const failed = (p.failed = [...new Set([...(p.failed || []), p.k])]);
        const next = p.srcs.findIndex((_, i) => !failed.includes(i));
        if (next >= 0) {
            p.keepAt = (p.offset || 0) + (v.currentTime || 0) || p.keepAt || 0;
            p.k = next;
            toast(`Trying ${srcLabel(p.srcs[next])}…`);
            renderPlayer();
        } else ov.err = true;
    };
    if (hls) attachHLS(v, url, () => fail());
    v.addEventListener(
        "loadedmetadata",
        () => {
            const fromSaved = !p.keepAt,
                at = p.keepAt || (key && o.resume && numOf(loadPos()[key])) || 0;
            p.keepAt = 0;
            if (p.offset) {
                if (fromSaved && !p.chipShown) {
                    p.chipShown = true;
                    resumeChip(p.offset);
                }
                return;
            }
            if (at && (!v.duration || at < v.duration - 30)) {
                v.currentTime = at;
                if (fromSaved && !p.chipShown) {
                    p.chipShown = true;
                    resumeChip(at);
                }
            }
        },
        { once: true }
    );
    let last = 0;
    v.addEventListener("timeupdate", () => {
        const at = (p.offset || 0) + v.currentTime,
            D = p.dur || v.duration;
        if (key && Date.now() - last > 4000) {
            last = Date.now();
            savePos(key, at);
        }
        if (!p.reached && D && Number.isFinite(D) && at / D > 0.9 && p.e != null) {
            p.reached = true;
            if (!p.marked) {
                p.marked = true;
                watchMark(si, p.e, true);
                stageChanged("mark");
            } else {
                const it = seasonItem(si);
                if (it && it.status === "done") watchMark(si, p.e, true);
            }
        }
    });
    v.addEventListener("ended", () => {
        if (key) savePos(key, 0);
        if (o.autoNext && p.e != null && hasNext) {
            const nx = (W.seasons[si]?.eps || []).find(x => x.e === (p.e ?? 0) + 1),
                label = nx
                    ? `Episode ${nx.e}${nx.title && !/^Episode \d+$/i.test(nx.title) ? " — " + nx.title : ""}`
                    : W.seasons[si + 1]?.label || "Next";
            upNext(p, label, () => watchStep(1));
        }
    });
    v.addEventListener("volumechange", () => {
        // dragging the volume to 0 means muted; unmuting from there brings the last volume back instead of staying silent
        if (!v.muted && v.volume <= 0.02) {
            if (vol.muted) v.volume = vol.last;
            else v.muted = true;
            return;
        }
        vol.muted = v.muted;
        if (v.volume > 0.02) vol.last = v.volume;
        if (v.volume > 0.02 && v.volume !== PS().volume) {
            meta.settings.player = { ...PS(), volume: v.volume };
            markDirty();
        }
    });
    v.addEventListener("error", () => {
        if (v.error && v.error.code) fail();
    });
    if (p.subs) {
        const tr = document.createElement("track");
        tr.kind = "subtitles";
        tr.label = "Subtitles";
        tr.src = p.subs;
        tr.default = true;
        v.append(tr);
    }
    streamAttach(v, src, p, ov); // subtitles that come with it, how much has arrived, waiting so it won't stop
    if (custom) pcBind(v);
    v.addEventListener("pause", wake);
}
