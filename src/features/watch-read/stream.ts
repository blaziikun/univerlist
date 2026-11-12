// src/features/watch-read/stream.ts
// ─────────────────────────────────────────────────────────────────
//  Streaming help: subtitles that come with a source, how much of it has arrived, and starting when it won't stop
//
//  A source from an extension may carry `info` (a link that answers { size, downloaded, speed, duration, audio, subs })
//  and `subs` ([{ label, lang, url }], WebVTT). Everything here is optional: a plain link simply plays.
//    • Subtitles: the ones that come with the episode are offered under the player; your language is picked by itself.
//    • The badge on the video says how much is here and how fast the rest is coming.
//    • "Start when it won't stop" waits just long enough that the rest arrives before you reach it; "Start at once"
//    plays now
//      and, if it stalls, offers to wait that long instead.
//    • A file whose sound this browser can't play switches to a converted version by itself, at the same point.
//  What a companion answers is someone else's program talking: every field is checked before it's used.
// ─────────────────────────────────────────────────────────────────

import { fieldsOf, markDirty, meta, numOf, recordsOf, textOf, toast } from "../core/core";
import { PS, renderPlayer, srvDesc, W } from "./watch";
import type { SubTrack, WatchPlayer, WatchSource } from "../core/model";
import { stageChanged } from "./stage-state.svelte";
import type { Overlay } from "./player/overlay.svelte";

export const SUB_LANGS: [code: string, name: string][] = [
    ["en", "English"],
    ["es", "Español"],
    ["fr", "Français"],
    ["de", "Deutsch"],
    ["it", "Italiano"],
    ["pt", "Português"],
    ["ja", "日本語"],
    ["ar", "العربية"],
    ["ru", "Русский"],
    ["zh", "中文"],
    ["ko", "한국어"],
];
const fmtWait = (s: number) => {
    s = Math.max(0, Math.round(s));
    return s >= 3600
        ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
        : s >= 60
          ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
          : `${s} s`;
};
const fmtRate = (b: number) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB/s" : Math.round(b / 1e3) + " KB/s");
/** what a source's info link says about it */
interface StreamInfo {
    size: number;
    downloaded: number;
    progress: number; // 0 to 1
    speed: number; // bytes a second
    duration: number; // seconds
    audio: boolean; // it has sound this browser may not play
    subs: unknown;
}
const infoOf = (x: unknown): StreamInfo => {
    const i = fieldsOf(x);
    return {
        size: numOf(i.size) || 0,
        downloaded: numOf(i.downloaded) || 0,
        progress: numOf(i.progress) || 0,
        speed: numOf(i.speed) || 0,
        duration: numOf(i.duration) || 0,
        audio: !!i.audio,
        subs: i.subs,
    };
};
// how many seconds to wait so the rest arrives before playback reaches it (0: start now; null: can't tell yet)
function waitNeeded(i: StreamInfo, pos: number, rate: number): number | null {
    const T = i.duration;
    if (!T || !i.size || !rate) return i.progress >= 0.999 ? 0 : null;
    const left = Math.max(0, i.size - i.downloaded),
        playLeft = Math.max(1, T - pos);
    return Math.max(0, left / rate - playLeft * 0.92);
}
// parse WebVTT as it arrives and add each cue as soon as it is complete
function vttFeed(track: TextTrack, offset: number) {
    let buf = "",
        head = true;
    const time = (s: string) => {
        const m = /(?:(\d+):)?(\d\d):(\d\d)[.,](\d{3})/.exec(s);
        return m ? +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : null;
    };
    return (chunk: string, end: boolean) => {
        buf += chunk.replace(/\r/g, "");
        const blocks = buf.split(/\n\n+/);
        buf = end ? "" : (blocks.pop() ?? "");
        for (const b of blocks) {
            if (head) {
                head = false;
                if (/^﻿?WEBVTT/.test(b)) continue;
            }
            const lines = b.split("\n"),
                k = lines.findIndex(l => l.includes("-->"));
            if (k < 0) continue;
            const [a, z] = lines[k].split("-->").map(x => time(x));
            if (a == null || z == null) continue;
            const text = lines
                .slice(k + 1)
                .join("\n")
                .trim();
            if (!text) continue;
            try {
                track.addCue(new VTTCue(Math.max(0, a - offset), Math.max(0, z - offset), text));
            } catch (_) {}
        }
    };
}
// the subtitle tracks added to each video, by address
const TRACKS = new WeakMap<HTMLVideoElement, Map<string, TextTrack>>();
async function subLoad(v: HTMLVideoElement, s: SubTrack, offset: number) {
    const tracks = TRACKS.get(v) || new Map<string, TextTrack>();
    TRACKS.set(v, tracks);
    const had = tracks.get(s.url);
    if (had) return had;
    const track = v.addTextTrack("subtitles", s.label || "Subtitles", s.lang || "");
    track.mode = "disabled";
    tracks.set(s.url, track);
    try {
        const r = await fetch(s.url);
        if (!r.ok || !r.body) return track;
        const feed = vttFeed(track, offset || 0),
            rd = r.body.getReader(),
            dec = new TextDecoder();
        for (;;) {
            const { value, done } = await rd.read();
            if (done) {
                feed("", true);
                break;
            }
            feed(dec.decode(value, { stream: true }), false);
            if (!v.isConnected) {
                rd.cancel();
                break;
            }
        }
    } catch (_) {}
    return track;
}
function subShow(v: HTMLVideoElement, url: string | null) {
    for (const t of v.textTracks) t.mode = "disabled";
    const track = url ? TRACKS.get(v)?.get(url) : undefined;
    if (track) track.mode = "showing";
}
/** the subtitle picker under the player (Tool.svelte) draws again: a track arrived, or C changed which one shows */
export function subRefresh(_p: WatchPlayer) {
    stageChanged("subs");
}
export function subChoose(p: WatchPlayer, v: HTMLVideoElement, url: string, remember: boolean) {
    p.subPick = url || "";
    const s = (p.subList || []).find(x => x.url === url);
    if (remember) {
        meta.settings.player = { ...PS(), subLang: s ? s.lang || s.label : "off" };
        markDirty();
    }
    if (!s) {
        subShow(v, null);
        return;
    }
    subLoad(v, s, p.offset || 0).then(() => {
        if (W.player === p && p.subPick === url) subShow(v, url);
    });
    subShow(v, url);
}
// subtitle tracks as a companion or an extension lists them: only ones with a web address
const subsOf = (list: unknown): SubTrack[] =>
    recordsOf(list).flatMap(s => {
        const url = textOf(s.url);
        return /^https?:\/\//.test(url)
            ? [{ url, label: textOf(s.label), lang: textOf(s.lang), forced: !!s.forced }]
            : [];
    });
// add newly known tracks; pick yours if nothing is picked yet
function subOffer(p: WatchPlayer, v: HTMLVideoElement, list: unknown) {
    const add = subsOf(list).filter(s => !(p.subList || []).some(x => x.url === s.url));
    if (!add.length) return;
    for (const s of add) {
        const base = s.label || "Subtitles",
            same = (p.subList || [])
                .concat(add.slice(0, add.indexOf(s)))
                .filter(x => (x.baseLabel || x.label) === base).length;
        s.baseLabel = base;
        if (same) s.label = `${base} ${same + 1}`;
    } // two "English" tracks read "English" and "English 2"
    p.subList = [...(p.subList || []), ...add];
    subRefresh(p);
    if (p.subPick !== undefined) return;
    const want = String(PS().subLang || "en").toLowerCase();
    if (want === "off") {
        p.subPick = "";
        return;
    }
    const L = p.subList,
        pick =
            L.find(s => s.lang.toLowerCase() === want && !s.forced) ||
            L.find(s => s.label.toLowerCase() === want) ||
            L.find(s => s.lang.toLowerCase() === want);
    if (pick) {
        subChoose(p, v, pick.url, false);
        subRefresh(p);
    }
}
// the badge, the waiting card and the no-sound check, for one video: what they say is its overlay's
// (player/overlay.svelte.ts), drawn over the video by player/CinStage.svelte
export function streamAttach(v: HTMLVideoElement, src: WatchSource, p: WatchPlayer, ov: Overlay) {
    if (src.subs) subOffer(p, v, src.subs);
    const infoURL = src.info;
    if (!infoURL) return;
    ov.net = { hidden: true, text: "" };
    ov.hold = { hidden: true, card: null };
    const o = PS();
    let rate = 0,
        info: StreamInfo | null = null,
        stalls = 0,
        offered = false,
        released = false;
    p.hold = p.hold ?? o.startMode === "smooth";
    const pos = () => (p.offset || 0) + (v.currentTime || 0);
    const card = (c: NonNullable<Overlay["hold"]>["card"]) => {
        ov.hold = { hidden: false, card: c };
    };
    const hide = () => {
        if (ov.hold) ov.hold = { ...ov.hold, hidden: true };
    };
    const draw = () => {
        if (!info) return;
        const w = waitNeeded(info, pos(), rate),
            done = info.progress >= 0.999;
        if (o.netBadge !== false)
            ov.net = {
                hidden: done && Date.now() - (p.doneAt || (p.doneAt = Date.now())) > 4000,
                text: done
                    ? "All here"
                    : `${Math.floor(info.progress * 100)}% here · ${rate ? fmtRate(rate) : "waiting for the rest…"}`,
            };
        if (p.hold && !released) {
            if (w === null && !done) {
                card({ t: "start" });
                if (!v.paused) v.pause();
                return;
            }
            if (w !== null && w > 1.5) {
                card({ t: "wait", wait: fmtWait(w) });
                if (!v.paused) v.pause();
                return;
            }
            released = true;
            hide();
            v.play().catch(() => {});
            return;
        }
        // playing at once and it keeps stopping: offer to wait just long enough
        if (!p.hold && stalls >= 2 && !offered && w !== null && w > 5) {
            offered = true;
            // another server for the same episode (a friend's copy, say) might be quicker: offer it alongside waiting
            const alt = p.srcs.findIndex((x, i) => i !== p.k && !(p.failed || []).includes(i) && x.info !== src.info);
            card({ t: "stops", wait: fmtWait(w), alt: alt >= 0 ? { k: alt, title: srvDesc(p.srcs[alt]) } : null });
        }
    };
    v.addEventListener("waiting", () => {
        if (v.currentTime > 1) stalls++;
        draw();
    });
    p.release = () => {
        released = true;
        p.hold = false;
        hide();
        v.play().catch(() => {});
    };
    p.holdNow = () => {
        p.hold = true;
        released = false;
        offered = true;
        draw();
    };
    p.holdNo = hide;
    const tick = async () => {
        if (!v.isConnected || W.player !== p) return;
        try {
            const r = await fetch(infoURL, { cache: "no-store" });
            if (r.ok) {
                const got = infoOf(await r.json());
                info = got;
                rate = rate ? rate * 0.6 + got.speed * 0.4 : got.speed;
                if (got.duration) p.dur = got.duration;
                subOffer(p, v, got.subs);
            }
        } catch (_) {}
        draw();
        // the sound check: this browser plays some files without their sound (AC-3, DTS); the converted version has it
        if (!p.audioChecked && v.currentTime > 4 && !v.paused && src.how === "original" && info && info.audio) {
            p.audioChecked = true;
            const j = p.srcs.findIndex(s => s.how === "converted" && s.info === src.info);
            if (silent(v) && j >= 0) {
                p.keepAt = pos();
                p.k = j;
                toast("No sound in this format here: switching to the converted version");
                renderPlayer();
                return;
            }
        }
        setTimeout(tick, info && info.progress >= 0.999 ? 8000 : 2000);
    };
    tick();
}
// playing without sound: Chrome counts the sound it has decoded, Firefox says whether there is any
function silent(v: HTMLVideoElement): boolean {
    const decoded: unknown = Reflect.get(v, "webkitAudioDecodedByteCount"),
        hasAudio: unknown = Reflect.get(v, "mozHasAudio");
    return decoded === 0 || hasAudio === false;
}
