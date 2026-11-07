// src/features/library/frame.js
// ─────────────────────────────────────────────────────────────────
//  Framing: crop and reposition any picture (profile picture, banner, cover, character)
//
//  Drag to move, scroll or slide to zoom. Saving draws the framed part at full quality into your copy;
//  the original stays available ("Use the original" puts it back).
// ─────────────────────────────────────────────────────────────────

const FRAME_SPEC = {
    avatar: [1, 640, 640, "Profile picture"],
    banner: [4.4, 3200, 727, "Banner"],
    cover: [2 / 3, 800, 1200, "Cover"],
    char: [3 / 4, 720, 960, "Character picture"],
    fav: [2 / 3, 800, 1200, "Favourite picture"],
};
function openFrame(src, target) {
    if (!src) return toast("There's no picture to adjust yet.");
    let [ar, , , name] = FRAME_SPEC[target.t];
    const gb = target.t === "cover" && items.get(target.id);
    if (gb && gb.medium === "game" && boxShapes()) {
        ar = gameAspect(gb);
        name = "Box (" + (gb.platform || (gb.platforms || [])[0] || "game") + ")";
    }
    const back = ui.modal && ui.modal.kind !== "frame" ? { ...ui.modal } : null;
    openModal("frame", {
        src,
        target,
        ar,
        name,
        z: 1,
        x: 0,
        y: 0,
        back,
        gif: /^data:image\/gif|\.gif(\?|$)/i.test(src),
    });
}
MODALS.frame = function (m) {
    return (
        head(`Adjust: ${esc(m.name)}`) +
        `<div class="fwrap"><div class="fview" id="fview" style="aspect-ratio:${m.ar}"><img id="fimg" src="${esc(coverCache.src(m.src))}" alt="" draggable="false" referrerpolicy="no-referrer"><div class="fguide"></div></div></div>
    <div class="bar fctl"><span class="hint">Drag to move · scroll to zoom</span><span class="spacer"></span><label class="ctl">Zoom <input type="range" id="fzoom" min="1" max="5" step=".01" value="${m.z}"></label><button class="btn sm ghost" data-act="frame-reset">Centre</button></div>
    ${m.gif ? `<p class="hint">This is an animated GIF: a framed copy keeps only its first frame.</p>` : ""}${m.err ? `<p class="err">${esc(m.err)}</p>` : ""}
    <div class="bar"><button class="btn gold" data-act="frame-save" ${m.busy ? "disabled" : ""}>${m.busy ? "Saving…" : "Save"}</button><button class="btn ghost" data-act="frame-cancel">Cancel</button></div>`
    );
};
// keep the picture covering the frame: work out its base scale and clamp the offsets
function frameGeom(m) {
    const v = $("#fview"),
        im = $("#fimg");
    if (!v || !im || !im.naturalWidth) return null;
    const vw = v.clientWidth,
        vh = v.clientHeight,
        base = Math.max(vw / im.naturalWidth, vh / im.naturalHeight),
        s = base * m.z,
        w = im.naturalWidth * s,
        h = im.naturalHeight * s;
    m.x = Math.max(-(w - vw) / 2, Math.min((w - vw) / 2, m.x));
    m.y = Math.max(-(h - vh) / 2, Math.min((h - vh) / 2, m.y));
    return { vw, vh, s, w, h, left: vw / 2 + m.x - w / 2, top: vh / 2 + m.y - h / 2 };
}
function framePaint() {
    const m = ui.modal;
    if (!m || m.kind !== "frame") return;
    const g = frameGeom(m),
        im = $("#fimg");
    if (!g) return;
    Object.assign(im.style, { width: g.w + "px", height: g.h + "px", left: g.left + "px", top: g.top + "px" });
}
document.addEventListener(
    "load",
    e => {
        if (e.target && e.target.id === "fimg") framePaint();
    },
    true
);
new MutationObserver(() => {
    if ($("#fimg")) requestAnimationFrame(framePaint);
}).observe(document.getElementById("overlay"), { childList: true });
addEventListener("resize", () => framePaint());
let fdrag = null;
document.addEventListener("pointerdown", e => {
    const v = e.target.closest && e.target.closest("#fview");
    if (!v) return;
    const m = ui.modal;
    fdrag = { x: e.clientX, y: e.clientY, ox: m.x, oy: m.y };
    v.setPointerCapture && v.setPointerCapture(e.pointerId);
    e.preventDefault();
});
document.addEventListener("pointermove", e => {
    if (!fdrag) return;
    const m = ui.modal;
    if (!m || m.kind !== "frame") {
        fdrag = null;
        return;
    }
    m.x = fdrag.ox + e.clientX - fdrag.x;
    m.y = fdrag.oy + e.clientY - fdrag.y;
    framePaint();
});
document.addEventListener("pointerup", () => {
    fdrag = null;
});
document.addEventListener(
    "wheel",
    e => {
        const v = e.target.closest && e.target.closest("#fview");
        if (!v) return;
        e.preventDefault();
        const m = ui.modal;
        m.z = Math.max(1, Math.min(5, m.z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
        const z = $("#fzoom");
        if (z) z.value = m.z;
        framePaint();
    },
    { passive: false }
);
document.addEventListener("input", e => {
    if (e.target.id !== "fzoom") return;
    const m = ui.modal;
    if (m && m.kind === "frame") {
        m.z = +e.target.value;
        framePaint();
    }
});
// draw the framed part; pictures from other sites go through the image proxy if their site won't share pixels
async function frameRender(m) {
    let [, W, H] = FRAME_SPEC[m.target.t];
    const g = frameGeom(m);
    if (!g) throw new Error("not loaded");
    if (m.target.t === "cover" && Math.abs(m.ar - 2 / 3) > 0.01) {
        W = m.ar >= 1 ? 1200 : 900;
        H = Math.round(W / m.ar);
    }
    const load = u =>
        new Promise((res, rej) => {
            const i = new Image();
            i.crossOrigin = "anonymous";
            i.referrerPolicy = "no-referrer";
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = u;
        });
    const tries = /^data:/.test(m.src) ? [m.src] : [m.src, coverCache.proxied(m.src)];
    for (const u of tries) {
        try {
            const img = await load(u),
                k = img.naturalWidth / $("#fimg").naturalWidth;
            const c = document.createElement("canvas");
            c.width = W;
            c.height = H;
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, (-g.left / g.s) * k, (-g.top / g.s) * k, (g.vw / g.s) * k, (g.vh / g.s) * k, 0, 0, W, H);
            return c.toDataURL("image/jpeg", 0.92);
        } catch (_) {}
    }
    throw new Error("blocked");
}
async function frameSave(m) {
    m.busy = true;
    m.err = "";
    renderOverlay();
    let data;
    try {
        data = await frameRender(m);
    } catch (_) {
        m.busy = false;
        m.err = "That site won't share the picture for editing. Download it and upload it instead, then adjust.";
        renderOverlay();
        return;
    }
    const T = m.target;
    if (T.t === "avatar" || T.t === "banner") {
        const key = T.t === "avatar" ? "avatarData" : "bannerData",
            mode = modeById(T.mode || "universal");
        if (mode.id === "universal")
            changeMeta(`Adjust ${m.name.toLowerCase()}`, "profile", p => ({ ...p, [key]: data }));
        else {
            mode.profile = { ...(mode.profile || {}), [key]: data };
            modeChanged();
        }
    } else if (T.t === "cover") {
        patch(T.id, { coverData: data, coverColor: null, color: null, coverPicked: true }, "Adjust cover");
        cacheAndColour(T.id)
            .then(() => updateItemTiles(T.id))
            .catch(() => {});
    } else if (T.t === "char") {
        const c = meta.chars.find(x => x.id === T.id);
        if (c) patchChar(T.id, { imageData: data, uploads: [...(c.uploads || []), data] }, "Adjust picture");
    } else if (T.t === "fav") patch(T.id, { favArtData: data }, "Adjust favourite picture");
    toast(`${m.name} adjusted`, { label: "Undo", fn: undo });
    const back = m.back;
    ui.modal = null;
    if (back) openModal(back.kind, back);
    else closeModal();
    render();
}
function frameClick(act) {
    const m = ui.modal;
    if (!m || m.kind !== "frame") return false;
    if (act === "frame-reset") {
        m.x = 0;
        m.y = 0;
        m.z = 1;
        const z = $("#fzoom");
        if (z) z.value = 1;
        framePaint();
        return true;
    }
    if (act === "frame-cancel") {
        const back = m.back;
        ui.modal = null;
        if (back) openModal(back.kind, back);
        else closeModal();
        return true;
    }
    if (act === "frame-save") {
        frameSave(m);
        return true;
    }
    return false;
}
// a card's "More" section stays open across redraws (deleting, hiding), so you never lose your place
document.addEventListener(
    "toggle",
    e => {
        const d = e.target;
        if (!d.classList || !d.classList.contains("imore")) return;
        const m = ui.modal;
        if (m && m.kind === "item") m.moreOpen = d.open;
    },
    true
);
document.addEventListener(
    "keydown",
    e => {
        const m = ui.modal;
        if (!m || m.kind !== "char" || m.view == null) return;
        const G = charGallery(meta.chars.find(x => x.id === m.id) || {});
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            m.view = (m.view + (e.key === "ArrowRight" ? 1 : -1) + G.length) % G.length;
            renderOverlay();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            m.view = null;
            renderOverlay();
        }
    },
    true
);
