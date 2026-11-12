// src/features/core/modals.ts
// ─────────────────────────────────────────────────────────────────
//  Overlays
// ─────────────────────────────────────────────────────────────────

import { $, curMode, esc, items, MEDIA, meta, shelvesOf, ui } from "./core";
import type { Item, Modal } from "./model";

let lastFocus: Element | null = null;
// While a dialog is open, everything else on the page is inert: Tab, a screen reader and a click can't reach the page
// behind it. Toasts stay reachable (their Undo is often about the dialog). Only what this set is unset again, and it
// follows whatever is in #overlay, so a dialog opened from another, or cleared without closeModal, still ends right
const INERT_MARK = "data-dialog-inert";
function syncInert() {
    const ov = document.getElementById("overlay");
    if (!ov) return;
    const open = !!ov.querySelector('[aria-modal="true"]');
    for (const el of document.body.children) {
        if (!(el instanceof HTMLElement) || el === ov || /^(SCRIPT|TEMPLATE|STYLE|LINK)$/.test(el.tagName)) continue;
        const ours = el.hasAttribute(INERT_MARK);
        if (open && !ours && !el.inert && !el.matches('.toast, [role="status"], [role="alert"]')) {
            el.inert = true;
            el.setAttribute(INERT_MARK, "");
        } else if (!open && ours) {
            el.inert = false;
            el.removeAttribute(INERT_MARK);
        }
    }
}
export function openModal(kind: string, data: Partial<Modal> = {}) {
    if (!ui.modal) lastFocus = document.activeElement;
    ui.modal = { kind, ...data };
    renderOverlay(true);
}
// The dialogs Svelte draws (core/dialogs.ts): main.ts gives them here once it has started, as this module doesn't import
// the components that import it
let svelteDialogs: {
    has: (kind: string) => boolean;
    isDrawn: (kind: string, box: Element | null) => boolean;
    draw: (kind: string, box: HTMLElement) => void;
    drop: () => void;
} | null = null;
export function useSvelteDialogs(d: NonNullable<typeof svelteDialogs>) {
    svelteDialogs = d;
}
export function closeModal() {
    const m = ui.modal;
    if (m && m.ctl) m.ctl.abort();
    ui.modal = null;
    svelteDialogs?.drop();
    $("#overlay")!.innerHTML = "";
    syncInert();
    if (lastFocus instanceof HTMLElement && document.body.contains(lastFocus)) lastFocus.focus();
}
export function overlayTyping(): boolean {
    const a = document.activeElement;
    return !!a && $("#overlay")!.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
}
export function renderOverlay(focus?: boolean) {
    const m = ui.modal,
        ov = $("#overlay")!;
    if (!m) {
        svelteDialogs?.drop();
        ov.innerHTML = "";
        syncInert();
        return;
    }
    if (m.kind === "item" && !items.has(m.id || "")) {
        closeModal();
        return;
    }
    const svelte = !!svelteDialogs?.has(m.kind);
    // a dialog Svelte draws is drawn once, then keeps itself up to date: nothing in it is replaced
    if (!svelte || !svelteDialogs?.isDrawn(m.kind, ov.querySelector(".modal"))) svelteDialogs?.drop();
    const active = document.activeElement && document.activeElement.id,
        prev = ov.querySelector(".modal"),
        st = prev ? prev.scrollTop : 0,
        frame = (inner: string) =>
            `<div class="scrim" data-act="close"></div><div class="modal${["item", "discover", "io", "covers", "add", "char", "favedit", "anilist", "profile-edit", "person", "paste", "csvmap", "coverpick", "lcimport", "smartmatch"].includes(m.kind) ? " wide" : ""}" role="dialog" aria-modal="true">${inner}</div>`;
    if (svelteDialogs && svelte) {
        if (!svelteDialogs.isDrawn(m.kind, prev)) ov.innerHTML = frame("");
        svelteDialogs.draw(m.kind, ov.querySelector<HTMLElement>(".modal")!);
    } else ov.innerHTML = frame(""); // every dialog is drawn by Svelte: this is only the frame, until main.ts has started
    syncInert();
    const md = ov.querySelector(".modal")!;
    if (!focus) md.scrollTop = st;
    if (focus) focusDialog();
    else if (active) {
        const a = document.getElementById(active);
        if (a && a !== document.activeElement) a.focus({ preventScroll: true });
    }
}
/** move focus into the open dialog, to what asks for it (autofocus) or else its Close button, back at its top */
export function focusDialog() {
    const ov = $("#overlay")!,
        f = ov.querySelector<HTMLElement>("[autofocus]") || ov.querySelector<HTMLElement>(".x"),
        md = ov.querySelector(".modal");
    f?.focus({ preventScroll: true });
    if (md) md.scrollTop = 0;
}

export const sec = (label: string, text: unknown) =>
    text ? `<div class="sec"><p class="label">${label}</p><p>${esc(text)}</p></div>` : "";
// short descriptions so a genre says what it means
const GENRE_DESC: Record<string, string> = {
    Fantasy: "Magic, invented worlds or the impossible treated as real.",
    "Science Fiction": "Stories built on science, technology or the future.",
    Dystopian: "A society gone wrong, usually by design.",
    Mystery: "A puzzle, usually a crime, solved over the story.",
    Thriller: "Suspense and danger; the pressure keeps rising.",
    Crime: "Criminals, investigators and the law.",
    Horror: "Built to unsettle or frighten.",
    Romance: "A relationship at the centre, with an emotionally satisfying end.",
    "Historical Fiction": "Invented stories set in a real past.",
    "Literary Fiction": "Character and language first; plot second.",
    Contemporary: "Set in the present-day, everyday world.",
    "Young Adult": "Teen protagonists and coming-of-age concerns.",
    Classics: "Long-lasting, widely studied works.",
    Adventure: "Journeys, quests and physical stakes.",
    Humor: "Written mainly to amuse.",
    "Magical Realism": "The ordinary world with one or two quietly magical things.",
    Mythology: "Myths, legends and folklore, retold or reimagined.",
    Paranormal: "Ghosts, psychics and the supernatural in the real world.",
    "Short Stories": "Collections of shorter pieces.",
    Poetry: "Verse.",
    "Graphic Novels": "Book-length comics.",
    Biography: "Someone's life, told by someone else.",
    Memoir: "A life, or part of it, told by the person who lived it.",
    History: "What happened and why.",
    Philosophy: "Questions about knowledge, mind, ethics and existence.",
    Psychology: "How minds and behaviour work.",
    Science: "Explaining the natural world.",
    Mathematics: "Proofs, problems and mathematical ideas.",
    "Self Help": "Practical advice for changing your own life.",
    Religion: "Faith, theology and spiritual practice.",
    Politics: "Power, government and policy.",
    Economics: "Markets, money and incentives.",
    Business: "Companies, work and management.",
    Technology: "Computing and how technology changes things.",
    Nature: "Animals, ecology and the outdoors.",
    "True Crime": "Real crimes, investigated.",
    Essays: "Short non-fiction pieces with a point of view.",
    Action: "Fights, chases and set pieces drive it.",
    Comedy: "Played for laughs.",
    Drama: "Serious, character-driven conflict.",
    "Slice of Life": "Everyday moments, little plot.",
    "Sci-Fi": "Science fiction: technology, space or the future.",
    Supernatural: "Spirits, curses and powers beyond nature.",
    Psychological: "Inside a character's head: perception, manipulation, breakdown.",
    Mecha: "Giant robots and their pilots.",
    Sports: "Training, rivals and competition.",
    Music: "Musicians and performance.",
    Ecchi: "Suggestive fan service.",
    "Mahou Shoujo": "Magical girls.",
    Isekai: "Transported to (or reborn in) another world.",
    Shounen: "Aimed at teen boys: action, growth, rivals.",
    Seinen: "Aimed at adult men: often darker or more complex.",
    Shoujo: "Aimed at teen girls: relationships and feelings.",
    Josei: "Aimed at adult women.",
    Animation: "Animated rather than live action.",
    Documentary: "Real events and people.",
    Family: "Made for all ages.",
    War: "Soldiers, battles and what war does.",
    Western: "The American frontier.",
    RPG: "Role-playing: stats, choices and a character who grows.",
    Shooter: "Aim and shoot.",
    Platformer: "Running and jumping through levels.",
    Puzzle: "Solve it to progress.",
    Strategy: "Plan, manage and outthink.",
    Indie: "Made by small independent teams.",
    Simulation: "Model a real activity or system.",
    Racing: "Speed and vehicles.",
    Fighting: "One-on-one combat.",
    "Visual Novel": "Story told through text, art and choices.",
};
/** what a genre means, for its tooltip (empty when it needs no explaining) */
export const genreDesc = (g: string) => GENRE_DESC[g] || "";
// the medium and type a new entry starts with, from the mode you're in
export function addDefaults(): { medium: string; kind: string } {
    const mode = curMode(),
        key = ui.shelfKey,
        sh = key && shelvesOf(mode).find(s => s.key === key);
    const pats =
        Array.isArray(mode.shelves) && sh && key
            ? (mode.shelves[Number(key.slice(1))] || {}).match || []
            : mode.match || ["*"];
    const pos = pats.filter(p => p !== "*" && !p.startsWith("!"));
    if (!pos.length) return { medium: "book", kind: "Novel" };
    const [medium, kind] = pos[0].split(":");
    return {
        medium: MEDIA[medium] ? medium : "book",
        kind: kind !== undefined ? kind : medium === "book" ? "Novel" : "",
    };
}

// seasons: TV is scored as a whole unless you turn seasons on (per show, or for all shows in Settings); anime seasons are already separate entries
export const seasonsOn = (b: Item) => (b.bySeason != null ? b.bySeason : !!(meta.settings.seasons || {})[b.medium]);
// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initModals() {
    // the page behind a dialog stays inert however the dialog comes and goes, and whatever is added to the page meanwhile
    const ov = document.getElementById("overlay");
    if (ov) {
        const watch = new MutationObserver(syncInert);
        watch.observe(ov, { childList: true });
        watch.observe(document.body, { childList: true });
    }
}
