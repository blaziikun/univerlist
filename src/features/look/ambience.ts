// src/features/look/ambience.ts
// ─────────────────────────────────────────────────────────────────
//  Ambience: the backdrop behind each theme, layered under the page
//
//  Pure CSS layers (stars, beams, lamplight, scanlines, rain) keyed by html[data-backdrop], moving only with transform and
//  opacity. Calm: slow drift. Alive: also follows scroll and the pointer. Still: no movement. Reduced motion always
//  means still.
// ─────────────────────────────────────────────────────────────────

import { meta, ui } from "../core/core";

const ambEl = (() => {
    const d = document.createElement("div");
    d.id = "amb";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = `<i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i>`;
    return d;
})();
const ambReduced = matchMedia("(prefers-reduced-motion: reduce)");
export function ambApply() {
    const r = document.documentElement,
        lvl = ambReduced.matches ? "off" : meta.settings.ambience || "calm";
    r.dataset.amb = lvl;
    r.dataset.motion = ambReduced.matches ? "off" : "";
    if (lvl !== "alive") for (const k of ["--sy", "--mx", "--my"]) r.style.removeProperty(k);
}
let ambRaf = 0,
    ambY = 0,
    ambX = 0.5,
    ambPY = 0.5;
function ambTick() {
    ambRaf = 0;
    const r = document.documentElement.style;
    r.setProperty("--sy", String(ambY));
    r.setProperty("--mx", (ambX - 0.5).toFixed(3));
    r.setProperty("--my", (ambPY - 0.5).toFixed(3));
}
const ambQueue = () => {
    if (!ambRaf && document.documentElement.dataset.amb === "alive") ambRaf = requestAnimationFrame(ambTick);
};
// back to the top of long pages
const topBtn = (() => {
    const b = document.createElement("button");
    b.className = "totop";
    b.type = "button";
    b.setAttribute("aria-label", "Back to top");
    b.title = "Back to top";
    b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
    b.addEventListener("click", () => window.scrollTo({ top: 0, behavior: ambReduced.matches ? "auto" : "smooth" }));
    return b;
})();

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initAmbience() {
    document.body.prepend(ambEl);
    addEventListener(
        "scroll",
        () => {
            ambY = Math.min(4000, scrollY);
            ambQueue();
        },
        { passive: true }
    );
    addEventListener(
        "pointermove",
        e => {
            if (e.pointerType !== "mouse") return;
            ambX = e.clientX / innerWidth;
            ambPY = e.clientY / innerHeight;
            ambQueue();
        },
        { passive: true }
    );
    document.addEventListener("visibilitychange", () => {
        document.documentElement.dataset.hiddenTab = document.hidden ? "1" : "";
    });
    ambReduced.addEventListener && ambReduced.addEventListener("change", ambApply);
    ambApply();
    // a change of backdrop fades the new one in rather than snapping
    new MutationObserver(() => {
        if (document.documentElement.dataset.amb !== "off" && ambEl.animate)
            ambEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: "cubic-bezier(.16,1,.3,1)" });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-backdrop"] });
    document.body.append(topBtn);
    addEventListener("scroll", () => topBtn.classList.toggle("on", scrollY > 1400 && !ui.modal), { passive: true });
}
