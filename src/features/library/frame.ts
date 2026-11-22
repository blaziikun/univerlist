// src/features/library/frame.ts
// ─────────────────────────────────────────────────────────────────
//  Framing: crop and reposition any picture (profile picture, banner, cover, character)
//
//  Drag to move, scroll or slide to zoom (frame/AdjustPicture.svelte). Saving draws the framed part at full quality
//  into your copy; the original stays available ("Use the original" puts it back).
// ─────────────────────────────────────────────────────────────────

import { $, changeMeta, coverCache, isRecord, items, meta, modeById, patch, toast, ui, undo } from "../core/core";
import { cacheAndColour, updateItemTiles } from "../sources/covers";
import { boxShapes, gameAspect } from "./tiles/tiles";
import { closeModal, openModal, renderOverlay } from "../core/modals";
import { charGallery } from "./connect";
import { render } from "../core/navigation";
import { patchChar } from "./item-actions";
import { modeChanged } from "../settings/handlers";
import type { FrameTarget, Modal } from "../core/model";

/** what a "frame-open" button says it adjusts (its data-k, written by the app's own markup) */
export const isFrameTarget = (x: unknown): x is FrameTarget =>
    isRecord(x) &&
    typeof x.t === "string" &&
    (x.id === undefined || typeof x.id === "string") &&
    (x.mode === undefined || typeof x.mode === "string");
const targetOf = (m: Modal): FrameTarget => (typeof m.target === "object" ? m.target : { t: "" });

/** a picture being adjusted: its frame's shape, and the size it's saved at */
type FrameSpec = [aspect: number, width: number, height: number, name: string];
const FRAME_SPEC: Record<string, FrameSpec> = {
    avatar: [1, 640, 640, "Profile picture"],
    banner: [4.4, 3200, 727, "Banner"],
    cover: [2 / 3, 800, 1200, "Cover"],
    char: [3 / 4, 720, 960, "Character picture"],
    fav: [2 / 3, 800, 1200, "Favourite picture"],
};
export function openFrame(src: string | undefined, target: FrameTarget) {
    if (!src) return toast("There's no picture to adjust yet.");
    let [ar, , , name] = FRAME_SPEC[target.t];
    const gb = target.t === "cover" ? items.get(target.id || "") : undefined;
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
// keep the picture covering the frame: work out its base scale and clamp the offsets
function frameGeom(m: Modal) {
    const v = $("#fview"),
        im = $<HTMLImageElement>("#fimg");
    if (!v || !im || !im.naturalWidth) return null;
    const vw = v.clientWidth,
        vh = v.clientHeight,
        base = Math.max(vw / im.naturalWidth, vh / im.naturalHeight),
        s = base * (m.z || 1),
        w = im.naturalWidth * s,
        h = im.naturalHeight * s;
    const x = (m.x = Math.max(-(w - vw) / 2, Math.min((w - vw) / 2, m.x || 0)));
    const y = (m.y = Math.max(-(h - vh) / 2, Math.min((h - vh) / 2, m.y || 0)));
    return { vw, vh, s, w, h, left: vw / 2 + x - w / 2, top: vh / 2 + y - h / 2 };
}
// draw the framed part; pictures from other sites go through the image proxy if their site won't share pixels
async function frameRender(m: Modal) {
    const t = targetOf(m).t,
        ar = m.ar || 1,
        src = m.src || "";
    let [, W, H] = FRAME_SPEC[t];
    const g = frameGeom(m);
    if (!g) throw new Error("not loaded");
    if (t === "cover" && Math.abs(ar - 2 / 3) > 0.01) {
        W = ar >= 1 ? 1200 : 900;
        H = Math.round(W / ar);
    }
    const load = (u: string) =>
        new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.crossOrigin = "anonymous";
            i.referrerPolicy = "no-referrer";
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = u;
        });
    const tries = /^data:/.test(src) ? [src] : [src, coverCache.proxied(src)];
    for (const u of tries) {
        try {
            const img = await load(u),
                shown = $<HTMLImageElement>("#fimg");
            if (!shown) continue;
            const k = img.naturalWidth / shown.naturalWidth;
            const c = document.createElement("canvas");
            c.width = W;
            c.height = H;
            const ctx = c.getContext("2d");
            if (!ctx) continue;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, (-g.left / g.s) * k, (-g.top / g.s) * k, (g.vw / g.s) * k, (g.vh / g.s) * k, 0, 0, W, H);
            return c.toDataURL("image/jpeg", 0.92);
        } catch (_) {}
    }
    throw new Error("blocked");
}
async function frameSave(m: Modal) {
    m.busy = true;
    m.err = "";
    renderOverlay();
    let data: string;
    try {
        data = await frameRender(m);
    } catch (_) {
        m.busy = false;
        m.err = "That site won't share the picture for editing. Download it and upload it instead, then adjust.";
        renderOverlay();
        return;
    }
    const T = targetOf(m),
        tid = T.id || "",
        name = m.name || "";
    if (T.t === "avatar" || T.t === "banner") {
        const key = T.t === "avatar" ? "avatarData" : "bannerData",
            mode = modeById(T.mode || "universal");
        if (mode.id === "universal")
            changeMeta(`Adjust ${name.toLowerCase()}`, "profile", p => ({ ...p, [key]: data }));
        else {
            mode.profile = { ...(mode.profile || {}), [key]: data };
            modeChanged();
        }
    } else if (T.t === "cover") {
        patch(tid, { coverData: data, coverColor: null, color: null, coverPicked: true }, "Adjust cover");
        cacheAndColour(tid)
            .then(() => updateItemTiles(tid))
            .catch(() => {});
    } else if (T.t === "char") {
        const c = meta.chars.find(x => x.id === tid);
        if (c) patchChar(tid, { imageData: data, uploads: [...(c.uploads || []), data] }, "Adjust picture");
    } else if (T.t === "fav") patch(tid, { favArtData: data }, "Adjust favourite picture");
    toast(`${name} adjusted`, { label: "Undo", fn: undo });
    const back = m.back;
    ui.modal = null;
    if (back) openModal(back.kind, back);
    else closeModal();
    render();
}
export function frameClick(act: string) {
    const m = ui.modal;
    if (!m || m.kind !== "frame") return false;
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

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initFrame() {
    // a character's pictures, viewed one at a time: ← and → go through them, Esc goes back to the character
    document.addEventListener(
        "keydown",
        e => {
            const m = ui.modal;
            if (!m || m.kind !== "char" || m.view == null) return;
            const view = m.view,
                G = charGallery(meta.chars.find(x => x.id === m.id) || { id: "", name: "" });
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                m.view = (view + (e.key === "ArrowRight" ? 1 : -1) + G.length) % G.length;
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
}
