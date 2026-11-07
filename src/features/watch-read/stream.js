// src/features/watch-read/stream.js
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
// ─────────────────────────────────────────────────────────────────

const SUB_LANGS = [
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
const fmtWait = s => {
    s = Math.max(0, Math.round(s));
    return s >= 3600
        ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
        : s >= 60
          ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
          : `${s} s`;
};
const fmtRate = b => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB/s" : Math.round(b / 1e3) + " KB/s");
// how many seconds to wait so the rest arrives before playback reaches it (0: start now; null: can't tell yet)
function waitNeeded(i, pos, rate) {
    const T = i && i.duration;
    if (!T || !i.size || !rate) return i && i.progress >= 0.999 ? 0 : null;
    const left = Math.max(0, i.size - i.downloaded),
        playLeft = Math.max(1, T - pos);
    return Math.max(0, left / rate - playLeft * 0.92);
}
// parse WebVTT as it arrives and add each cue as soon as it is complete
function vttFeed(track, offset) {
    let buf = "",
        head = true;
    const time = s => {
        const m = /(?:(\d+):)?(\d\d):(\d\d)[.,](\d{3})/.exec(s);
        return m ? +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : null;
    };
    return (chunk, end) => {
        buf += chunk.replace(/\r/g, "");
        const blocks = buf.split(/\n\n+/);
        buf = end ? "" : blocks.pop();
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
async function subLoad(v, s, offset) {
    v._tt = v._tt || new Map();
    if (v._tt.has(s.url)) return v._tt.get(s.url);
    const track = v.addTextTrack("subtitles", s.label || "Subtitles", s.lang || "");
    track.mode = "disabled";
    v._tt.set(s.url, track);
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
function subShow(v, url) {
    for (const t of v.textTracks) t.mode = "disabled";
    if (url && v._tt && v._tt.get(url)) v._tt.get(url).mode = "showing";
}
// the subtitle picker under the player: Off, then every track that came with this source
function subPickHTML(p) {
    const L = p.subList || [],
        cur = p.subPick || "";
    if (!L.length) return "";
    return `<select class="cinsel" id="cin-sub" aria-label="Subtitles" title="Subtitles (C)"><option value="">Subtitles off</option>${L.map(s => `<option value="${esc(s.url)}"${s.url === cur ? " selected" : ""}>${esc(s.label)}${s.forced ? "" : ""}</option>`).join("")}</select>`;
}
function subRefresh(p) {
    const n = $("#cinema .cin-subpick");
    if (n) n.innerHTML = subPickHTML(p);
}
function subChoose(p, v, url, remember) {
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
// add newly known tracks; pick yours if nothing is picked yet
function subOffer(p, v, list) {
    const add = (list || []).filter(
        s => s && /^https?:\/\//.test(s.url) && !(p.subList || []).some(x => x.url === s.url)
    );
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
            L.find(s => (s.lang || "").toLowerCase() === want && !s.forced) ||
            L.find(s => (s.label || "").toLowerCase() === want) ||
            L.find(s => (s.lang || "").toLowerCase() === want);
    if (pick) {
        subChoose(p, v, pick.url, false);
        subRefresh(p);
    }
}
// the badge, the waiting card and the no-sound check, for one video
function streamAttach(v, src, p, el) {
    if (src.subs) subOffer(p, v, src.subs);
    if (!src.info) return;
    const stage = el.querySelector(".cin-stage");
    if (!stage) return;
    stage.insertAdjacentHTML(
        "beforeend",
        `<div class="cin-net" hidden aria-live="polite"></div><div class="cin-hold" hidden></div>`
    );
    const badge = stage.querySelector(".cin-net"),
        card = stage.querySelector(".cin-hold"),
        o = PS();
    let rate = 0,
        info = null,
        stalls = 0,
        offered = false,
        released = false;
    p.hold = p.hold ?? o.startMode === "smooth";
    const pos = () => (p.offset || 0) + (v.currentTime || 0);
    const draw = () => {
        if (!info) return;
        const w = waitNeeded(info, pos(), rate),
            done = info.progress >= 0.999;
        if (o.netBadge !== false) {
            badge.hidden = done && Date.now() - (p.doneAt || (p.doneAt = Date.now())) > 4000;
            badge.textContent = done
                ? "All here"
                : `${Math.floor(info.progress * 100)}% here · ${rate ? fmtRate(rate) : "waiting for the rest…"}`;
        }
        if (p.hold && !released) {
            if (w === null && !done) {
                card.hidden = false;
                card.innerHTML = `<p><b>Getting it started…</b></p><p class="hint">Working out how long to wait so it won't stop.</p><button class="btn sm" data-act="cin-startnow">Start now</button>`;
                if (!v.paused) v.pause();
                return;
            }
            if (w > 1.5) {
                card.hidden = false;
                card.innerHTML = `<p><b>Starts in ${fmtWait(w)}</b></p><p class="hint">Then it plays to the end without stopping.</p><button class="btn sm" data-act="cin-startnow">Start now</button>`;
                if (!v.paused) v.pause();
                return;
            }
            released = true;
            card.hidden = true;
            v.play().catch(() => {});
            return;
        }
        // playing at once and it keeps stopping: offer to wait just long enough
        if (!p.hold && stalls >= 2 && !offered && w > 5) {
            offered = true;
            card.hidden = false;
            // another server for the same episode (a friend's copy, say) might be quicker: offer it alongside waiting
            const alt = p.srcs.findIndex((x, i) => i !== p.k && !(p.failed || []).includes(i) && x.info !== src.info);
            card.innerHTML = `<p><b>Keeps stopping?</b></p><p class="hint">Wait ${fmtWait(w)} and it plays to the end without stopping${alt >= 0 ? `, or try Server ${alt + 1}` : ""}.</p><div class="bar"><button class="btn sm gold" data-act="cin-hold">Wait</button>${alt >= 0 ? `<button class="btn sm" data-act="cin-src-pick" data-k="${alt}" title="${esc(srvDesc(p.srcs[alt]))}">Try Server ${alt + 1}</button>` : ""}<button class="btn sm ghost" data-act="cin-holdno">Keep going</button></div>`;
        }
    };
    v.addEventListener("waiting", () => {
        if (v.currentTime > 1) stalls++;
        draw();
    });
    p.release = () => {
        released = true;
        p.hold = false;
        card.hidden = true;
        v.play().catch(() => {});
    };
    p.holdNow = () => {
        p.hold = true;
        released = false;
        offered = true;
        draw();
    };
    p.holdNo = () => {
        card.hidden = true;
    };
    const tick = async () => {
        if (!v.isConnected || W.player !== p) return;
        try {
            const r = await fetch(src.info, { cache: "no-store" });
            if (r.ok) {
                info = await r.json();
                rate = rate ? rate * 0.6 + (info.speed || 0) * 0.4 : info.speed || 0;
                if (info.duration) p.dur = info.duration;
                subOffer(p, v, info.subs);
            }
        } catch (_) {}
        draw();
        // the sound check: this browser plays some files without their sound (AC-3, DTS); the converted version has it
        if (!p.audioChecked && v.currentTime > 4 && !v.paused && src.how === "original" && info && info.audio) {
            p.audioChecked = true;
            const silent =
                ("webkitAudioDecodedByteCount" in v && v.webkitAudioDecodedByteCount === 0) || v.mozHasAudio === false;
            const j = p.srcs.findIndex(s => s.how === "converted" && s.info === src.info);
            if (silent && j >= 0) {
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
