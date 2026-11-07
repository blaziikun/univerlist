// src/features/watch-read/player.js
// ─────────────────────────────────────────────────────────────────
//  The player's own controls, and making the player page yours
//
//  Controls on the video: a scrub bar (what has loaded shows on it; hover for the time; it also seeks converted
//  streams, which the browser's own controls can't), play, time and volume, plus any button you put there. Every button
//  lives on the video, under it, or nowhere, chosen by dragging them around in "Edit on the page", or in ⋯. The same
//  edit mode sets the player's size, the side panel's width, corners, how big the controls are, how dark the shade
//  behind them is, how soon they hide, and where subtitles sit. The browser's own controls are one setting away (player
//  settings › Controls).
// ─────────────────────────────────────────────────────────────────

const LOOK_DEF = { size: 100, side: 340, radius: 12, ctl: 100, dim: 60, hideAfter: 2.6, subPos: 0, subBg: 55 };
const SPOT_DEF = {
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
const LOOK = () => ({ ...LOOK_DEF, ...(WP().look || {}) });
const spotOf = (wp, k) => (wp.off.includes(k) ? "off" : (wp.spot || {})[k] || SPOT_DEF[k] || "under");
const customControls = () => PS().controls !== "browser";
const fmtT = s => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600),
        m = Math.floor((s % 3600) / 60),
        x = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`;
};
// where you are in what's playing, counting a converted stream's starting point
const curAt = () => {
    const p = W.player,
        v = $("#cinema video");
    return p && v ? (p.offset || 0) + (v.currentTime || 0) : 0;
};
const curDur = () => {
    const p = W.player,
        v = $("#cinema video");
    return (p && p.dur) || (v && isFinite(v.duration) ? (p.offset || 0) + v.duration : 0);
};
// seeking that works on every kind of source: a converted stream starts again from the new point
function pcSeekTo(t) {
    const p = W.player,
        v = $("#cinema video");
    if (!p || !v) return;
    const src = p.srcs[p.k] || {},
        D = curDur();
    t = Math.max(0, D ? Math.min(D - 1, t) : t);
    if (src.how === "converted") {
        p.keepAt = Math.max(t, 0.01);
        renderPlayer();
        return;
    } // (.01, not 0: 0 would mean "where you left off")
    v.currentTime = t - (p.offset || 0);
}
const pcSeekBy = d => pcSeekTo(curAt() + d);
// the extra buttons only this player has
function pcTools(o) {
    const vol = W.vol && W.vol.muted ? "🔇" : "🔊";
    return {
        play: `<button class="cb pc-play" data-act="pc-play" title="Play / pause (space)" aria-label="Play or pause">▶</button>`,
        time: `<span class="pc-time" aria-live="off">0:00 / 0:00</span>`,
        vol: `<span class="pc-vol"><button class="cb" data-act="pc-mute" title="Mute (M)" aria-label="Mute or unmute">${vol}</button><input type="range" class="pc-volr" min="0" max="1" step="0.05" value="${o.volume}" aria-label="Volume"></span>`,
    };
}
// what the player draws on the video (and, in cinema mode, the buttons that would otherwise sit under it)
function pcHTML(T, wp, cinemaLayout) {
    const wrap = k =>
        ui.wpEdit
            ? `<span class="wt" draggable="true" data-tool="${k}" title="Drag to move: ${esc((TOOLS.find(t => t[0] === k) || [])[1] || k)}">${T[k] || `<span class="cb wtname">${esc((TOOLS.find(t => t[0] === k) || [])[1] || k)}</span>`}</span>`
            : T[k] || "";
    const on = wp.tools.filter(k => spotOf(wp, k) === "video"),
        under = cinemaLayout ? wp.tools.filter(k => spotOf(wp, k) === "under") : [];
    return `<div class="pc" data-zone="video"><div class="pc-scrub" role="slider" aria-label="Seek" tabindex="0" aria-valuemin="0" aria-valuenow="0"><span class="pc-buf"></span><span class="pc-done"></span><span class="pc-knob"></span><span class="pc-tip" hidden></span></div>
    <div class="pc-row wz" data-zone="video">${on.map(wrap).join("")}</div>${under.length || (ui.wpEdit && cinemaLayout) ? `<div class="pc-row wz under" data-zone="under">${under.map(wrap).join("")}</div>` : ""}</div>`;
}
function underHTML(T, wp) {
    const wrap = k =>
        ui.wpEdit
            ? `<span class="wt" draggable="true" data-tool="${k}">${T[k] || `<span class="cb wtname">${esc((TOOLS.find(t => t[0] === k) || [])[1] || k)}</span>`}</span>`
            : T[k] || "";
    return wp.tools
        .filter(k => spotOf(wp, k) === "under")
        .map(wrap)
        .join("");
}
// the edit bar: drag buttons; set the look
function wpEditHTML(wp) {
    const L = LOOK(),
        hidden = wp.tools.filter(k => spotOf(wp, k) === "off");
    const rng = (k, l, a, b, st, unit) =>
        `<label class="we-r">${l}<input type="range" min="${a}" max="${b}" step="${st}" data-look="${k}" value="${L[k]}"><output>${L[k]}${unit}</output></label>`;
    return `<div class="we-bar" role="dialog" aria-label="Edit the player"><div class="we-h"><b>Edit the player</b><span class="hint">Drag buttons onto the video, under it, or into Hidden.</span><span class="spacer"></span><button class="btn sm ghost" data-act="wp-look-reset">Reset look</button><button class="btn sm gold" data-act="wp-edit">Done</button></div>
    <div class="we-grid">${rng("size", "Player size", 50, 100, 1, "%")}${rng("side", "Side panel", 240, 560, 10, " px")}${rng("radius", "Corners", 0, 32, 1, " px")}${rng("ctl", "Controls size", 70, 160, 5, "%")}${rng("dim", "Shade behind controls", 0, 100, 5, "%")}${rng("hideAfter", "Hide controls after", 1, 10, 0.5, " s")}${rng("subPos", "Raise subtitles", 0, 10, 1, " lines")}${rng("subBg", "Subtitle background", 0, 100, 5, "%")}</div>
    <div class="we-hidden wz" data-zone="off"><span class="hint">Hidden:</span>${hidden.map(k => `<span class="wt" draggable="true" data-tool="${k}"><span class="cb wtname">${esc((TOOLS.find(t => t[0] === k) || [])[1] || k)}</span></span>`).join("") || `<span class="hint">nothing</span>`}</div></div>`;
}
// the look, as CSS variables on the player
function pcLook(el) {
    const L = LOOK();
    el.style.setProperty("--pl-size", L.size + "%");
    el.style.setProperty("--side-w", L.side + "px");
    el.style.setProperty("--pl-radius", L.radius + "px");
    el.style.setProperty("--ctl-scale", (L.ctl / 100).toFixed(2));
    el.style.setProperty("--pc-dim", (L.dim / 100).toFixed(2));
    el.style.setProperty("--sub-bg", (L.subBg / 100).toFixed(2));
}
// subtitles sit higher when you raise them (whole lines up from the bottom)
function subLines(v) {
    const n = LOOK().subPos;
    for (const t of v.textTracks)
        for (const c of [...(t.cues || [])])
            try {
                c.snapToLines = true;
                c.line = n ? -(1 + n) : "auto";
            } catch (_) {}
}
function pcAttach(v, p, el) {
    const pc = el.querySelector(".pc");
    if (!pc) return;
    const scrub = pc.querySelector(".pc-scrub"),
        done = pc.querySelector(".pc-done"),
        buf = pc.querySelector(".pc-buf"),
        knob = pc.querySelector(".pc-knob"),
        tip = pc.querySelector(".pc-tip");
    const time = el.querySelector(".pc-time"),
        play = el.querySelector(".pc-play"),
        volr = el.querySelector(".pc-volr"),
        mute = el.querySelector('[data-act="pc-mute"]');
    let dragging = false;
    const draw = () => {
        const D = curDur(),
            at = curAt(),
            f = D ? Math.min(1, at / D) : 0;
        if (!dragging) {
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
        buf.style.width = (D ? Math.min(1, ((p.offset || 0) + b) / D) * 100 : 0).toFixed(2) + "%";
        if (time) time.textContent = `${fmtT(at)} / ${D ? fmtT(D) : "–:––"}`;
        if (play) {
            play.textContent = v.paused ? "▶" : "❚❚";
            play.setAttribute("aria-pressed", String(!v.paused));
        }
    };
    ["timeupdate", "progress", "play", "pause", "durationchange", "loadedmetadata", "seeking"].forEach(ev =>
        v.addEventListener(ev, draw)
    );
    draw();
    const fracAt = e => {
        const r = scrub.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    scrub.addEventListener("pointermove", e => {
        const D = curDur();
        if (!D) return;
        const f = fracAt(e);
        tip.hidden = false;
        tip.textContent = fmtT(f * D);
        tip.style.left = f * 100 + "%";
        if (dragging) {
            done.style.width = knob.style.left = f * 100 + "%";
        }
    });
    scrub.addEventListener("pointerleave", () => {
        if (!dragging) tip.hidden = true;
    });
    scrub.addEventListener("pointerdown", e => {
        if (ui.wpEdit) return;
        dragging = true;
        scrub.setPointerCapture(e.pointerId);
        const f = fracAt(e);
        done.style.width = knob.style.left = f * 100 + "%";
    });
    scrub.addEventListener("pointerup", e => {
        if (!dragging) return;
        dragging = false;
        tip.hidden = true;
        const D = curDur();
        if (D) pcSeekTo(fracAt(e) * D);
    });
    scrub.addEventListener("keydown", e => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            pcSeekBy((e.key === "ArrowRight" ? 1 : -1) * PS().seek);
        }
    });
    if (volr) {
        volr.value = v.muted ? 0 : v.volume;
        volr.addEventListener("input", () => {
            v.volume = Math.max(0, +volr.value);
            v.muted = +volr.value <= 0.02;
        });
    }
    v.addEventListener("volumechange", () => {
        if (volr) volr.value = v.muted ? 0 : v.volume;
        if (mute) mute.textContent = v.muted || v.volume <= 0.02 ? "🔇" : "🔊";
    });
    // a click on the picture plays or pauses; a double click is full screen
    v.addEventListener("click", () => {
        if (ui.wpEdit) return;
        v.paused ? v.play().catch(() => {}) : v.pause();
    });
    v.addEventListener("dblclick", () => actOn(new Event("click"), el, "cin-full", "", "", null));
    v.addEventListener("loadedmetadata", () => subLines(v));
}
// dragging buttons between the video, under it and Hidden (and reordering them)
let wtDrag = null;
document.addEventListener("dragstart", e => {
    const w = e.target.closest && e.target.closest("#cinema .wt");
    if (!w) return;
    wtDrag = w.dataset.tool;
    e.dataTransfer.effectAllowed = "move";
    try {
        e.dataTransfer.setData("text/plain", wtDrag);
    } catch (_) {}
    w.classList.add("dragging");
});
document.addEventListener("dragend", e => {
    const w = e.target.closest && e.target.closest("#cinema .wt");
    if (w) w.classList.remove("dragging");
    wtDrag = null;
    $$("#cinema .wz.over").forEach(z => z.classList.remove("over"));
});
document.addEventListener("dragover", e => {
    const z = wtDrag && e.target.closest && e.target.closest("#cinema .wz");
    if (!z) return;
    e.preventDefault();
    $$("#cinema .wz.over").forEach(x => x !== z && x.classList.remove("over"));
    z.classList.add("over");
});
document.addEventListener("drop", e => {
    const z = wtDrag && e.target.closest && e.target.closest("#cinema .wz");
    if (!z) return;
    e.preventDefault();
    const before = [...z.querySelectorAll(".wt")].find(w => {
        const r = w.getBoundingClientRect();
        return w.dataset.tool !== wtDrag && e.clientX < r.left + r.width / 2 && e.clientY < r.bottom;
    });
    wtMove(wtDrag, z.dataset.zone, before ? before.dataset.tool : null);
    wtDrag = null;
});
function wtMove(k, zone, beforeK) {
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
    wpBarRedraw();
}
// the edit bar's sliders change the look as you drag
document.addEventListener("input", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.look) return;
    const p = WP(),
        v = +t.value;
    p.look = { ...(p.look || {}), [t.dataset.look]: v };
    wpSave(p);
    const out = t.nextElementSibling;
    if (out) out.textContent = v + out.textContent.replace(/^[\d.]+/, "");
    const el = $("#cinema");
    if (el) pcLook(el);
    const vd = $("#cinema video");
    if (vd && t.dataset.look === "subPos") subLines(vd);
});
// ── small things that make watching nicer ──
// the server you pick for a show is the one its other episodes start on (your own copy, a friend's, a server…)
const srvWho = x =>
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
function srvRemember(p) {
    const s = p.srcs[p.k],
        key = srvPrefKey();
    if (!s || !key) return;
    meta.settings.srvPref = { ...(meta.settings.srvPref || {}), [key]: { who: srvWho(s), how: s.how || "" } };
    markDirty();
}
// the index of your usual server for this show among these, or -1
function srvPreferred(p) {
    const pref = (meta.settings.srvPref || {})[srvPrefKey()];
    if (!pref) return -1;
    const i = p.srcs.findIndex(s => srvWho(s) === pref.who && (s.how || "") === pref.how);
    return i >= 0 ? i : p.srcs.findIndex(s => srvWho(s) === pref.who);
}
// when servers arrive: if your usual one is among them and you haven't really started, it plays
function srvApplyPref(p) {
    if (p.prefDone || p.single) return;
    const i = srvPreferred(p);
    if (i < 0 || i === p.k) return;
    const v = $("#cinema video");
    if (v && (p.offset || 0) + v.currentTime > 5) {
        p.prefDone = true;
        return;
    }
    p.prefDone = true;
    p.keepAt = v ? (p.offset || 0) + v.currentTime : p.keepAt;
    p.k = i;
    renderPlayer();
}
// "Resumed at 12:34 · Start over", for a few seconds after picking up where you left off
function resumeChip(el, at) {
    const stage = el.querySelector(".cin-stage");
    if (!stage || at < 30) return;
    stage.insertAdjacentHTML(
        "beforeend",
        `<div class="pc-chip" role="status">Resumed at ${fmtT(at)} <button class="linkbtn" data-act="pc-startover">Start over</button></div>`
    );
    const c = stage.querySelector(".pc-chip");
    setTimeout(() => c && c.remove(), 7000);
}
// "Next episode in 5…" at the end, with Play now and Cancel
function upNext(el, p, go) {
    const stage = el.querySelector(".cin-stage");
    if (!stage || stage.querySelector(".pc-next")) return;
    const S = W.seasons[p.si] || {},
        nx = (S.eps || []).find(x => x.e === p.e + 1),
        label = nx
            ? `Episode ${nx.e}${nx.title && !/^Episode \d+$/i.test(nx.title) ? " — " + nx.title : ""}`
            : (W.seasons[p.si + 1] || {}).label || "Next";
    let n = 5;
    stage.insertAdjacentHTML(
        "beforeend",
        `<div class="pc-next" role="dialog" aria-label="Up next"><p class="hint">Up next</p><p><b>${esc(label)}</b></p><p class="pc-cd">in ${n}…</p><div class="bar"><button class="btn sm gold" data-act="pc-next-now">Play now</button><button class="btn sm ghost" data-act="pc-next-cancel">Cancel</button></div></div>`
    );
    const card = stage.querySelector(".pc-next"),
        cd = card.querySelector(".pc-cd");
    p.upNextGo = () => {
        clearInterval(p.upNextT);
        card.remove();
        go();
    };
    p.upNextCancel = () => {
        clearInterval(p.upNextT);
        card.remove();
    };
    p.upNextT = setInterval(() => {
        if (!card.isConnected || W.player !== p) {
            clearInterval(p.upNextT);
            return;
        }
        n--;
        cd.textContent = `in ${n}…`;
        if (n <= 0) p.upNextGo();
    }, 1000);
}
