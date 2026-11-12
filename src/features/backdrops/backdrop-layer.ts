// src/features/backdrops/backdrop-layer.ts
// ─────────────────────────────────────────────────────────────────
//  Backdrops: putting yours behind the page
//
//  A theme whose backdrop is one of yours has html[data-backdrop="mine:<id>"] (core/theme.ts). Then a canvas goes into the
//  ambience layer (#amb, look/ambience.ts) and draws it; any other backdrop takes the canvas away again, so nothing of
//  this runs unless you're using a backdrop you made. While you edit one in Settings › Backdrops, preview() shows that one
//  instead, live, and done() goes back to the theme's.
// ─────────────────────────────────────────────────────────────────

import { Painter } from "./engine";
import { myBackdrops, type Backdrop } from "./backdrop";
import { changeListeners, meta } from "../core/core";

const root = document.documentElement;
let painter: Painter | null = null,
    cv: HTMLCanvasElement | null = null,
    previewing: Backdrop | null = null,
    showing = "";

/** the backdrop the page should show now: the one being edited, or the theme's if it's one of yours */
function wanted(): Backdrop | null {
    if (previewing) return previewing;
    const w = root.dataset.backdrop || "";
    if (!w.startsWith("mine:")) return null;
    return myBackdrops(meta.settings.backdrops).find(x => "mine:" + x.id === w) || null;
}
const level = (): "off" | "calm" | "alive" => {
    const a = root.dataset.amb;
    return a === "off" || a === "alive" ? a : "calm";
};
const accent = () => getComputedStyle(root).getPropertyValue("--accent").trim() || "#d4ad55";

function update() {
    const w = wanted();
    if (!w) {
        painter?.stop();
        cv?.remove();
        painter = cv = null;
        showing = "";
        return;
    }
    if (!painter) {
        cv = document.createElement("canvas");
        cv.className = "mybackdrop";
        document.getElementById("amb")?.append(cv);
        painter = new Painter(cv);
    }
    painter.look.level = level();
    painter.setAccent(accent());
    const key = JSON.stringify(w);
    if (key !== showing) {
        showing = key;
        painter.set(w);
    } else painter.run();
}

/** show this backdrop while it's being edited (or null to stop showing it) */
export function preview(w: Backdrop | null) {
    previewing = w;
    update();
}
export const done = () => preview(null);

export function startBackdrops() {
    // the theme (its backdrop and accent: applyTheme sets data-backdrop every time) or the motion level changed
    new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["data-backdrop", "data-amb"] });
    // your backdrops changed (edited here, or synced from another device)
    changeListeners.push(part => {
        if (part === "meta") update();
    });
    document.addEventListener("visibilitychange", () => (document.hidden ? painter?.stop() : painter?.run()));
    addEventListener("resize", () => painter?.size(), { passive: true });
    // Alive: the near layers follow the pointer and scroll (as the built-in backdrops do)
    addEventListener(
        "pointermove",
        e => {
            if (painter && e.pointerType === "mouse") {
                painter.look.x = e.clientX / innerWidth - 0.5;
                painter.look.y = e.clientY / innerHeight - 0.5;
            }
        },
        { passive: true }
    );
    addEventListener("scroll", () => painter && (painter.look.scroll = scrollY), { passive: true });
    update();
}
