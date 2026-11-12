// src/features/core/keys.ts
// ─────────────────────────────────────────────────────────────────
//  Keyboard: every shortcut can be changed in Settings → Keyboard
// ─────────────────────────────────────────────────────────────────

import { $, allModes, closestTo, curMode, items, markDirty, meta, toast, ui, undo, redo } from "./core";
import { curView, viewOpts } from "./views";
import { renderMain } from "./shell";
import { openModal } from "./modals";
import { renderPlayer, W } from "../watch-read/watch";
import { stageOffNote, stageOn } from "../extensions/builtins";
import { RD } from "../watch-read/read";
import { focusSearch } from "./search";
import {
    closeSettings,
    cycleMode,
    goSettings,
    goTab,
    openDiscover,
    render,
    setMode,
    setView,
    togglePrivate,
    toggleSide,
} from "./navigation";

/** every shortcut: its id, what it does, its usual keys, and the action */
export const KEY_ACTIONS: [id: string, label: string, keys: string[], run: () => void][] = [
    ["search", "Search everything", ["/", "Mod+k"], () => focusSearch()],
    ["add", "Add something (search)", ["n"], () => focusSearch()],
    ["sidebar", "Show or hide the sidebar", ["\\"], () => toggleSide()],
    ["prevmode", "Previous mode (in Watch & read: switch between them)", ["["], () => modeKey(-1)],
    ["nextmode", "Next mode (in Watch & read: switch between them)", ["]"], () => modeKey(1)],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n): [string, string, string[], () => void] => [
        "mode" + n,
        "Go to mode " + n,
        ["Shift+" + n],
        () => {
            const m = allModes()[n - 1];
            if (m) setMode(m.id);
        },
    ]),
    ["overview", "Overview", ["o"], () => goTab("overview")],
    ["library", "Library", ["l"], () => goTab("library")],
    ["favourites", "Favourites", ["f"], () => goTab("favourites")],
    ["stats", "Stats", ["t"], () => goTab("stats")],
    ["lists", "Lists", ["g"], () => goTab("lists")],
    ["discover", "Insights", ["d"], () => openDiscover()],
    ["pick", "Pick for me", ["p"], () => openModal("pick")],
    ["watch", "Watch & read (again to go back)", ["w"], () => toggleWatch()],
    ["settings", "Settings", [","], () => toggleSettings()],
    ["private", "Private collection", [], () => togglePrivate()],
    ["view1", "Cover view", ["1"], () => setView("cover")],
    ["view2", "Grid view", ["2"], () => setView("grid")],
    ["view3", "Spine view", ["3"], () => setView("spine")],
    ["view4", "List view", ["4"], () => setView("list")],
    ["bigger", "Bigger covers", ["=", "+"], () => zoomBy(0.1)],
    ["smaller", "Smaller covers", ["-"], () => zoomBy(-0.1)],
    [
        "filter",
        "Open the filter",
        ["Shift+f"],
        () => {
            goTab("library");
            ui.filterOpen = !ui.filterOpen;
            renderMain();
        },
    ],
    [
        "select",
        "Select several",
        ["s"],
        () => {
            if (ui.tab !== "library") return;
            ui.selecting = !ui.selecting;
            ui.sel.clear();
            renderMain();
        },
    ],
    ["undo", "Undo", ["Mod+z"], () => undo()],
    ["redo", "Redo", ["Mod+Shift+z", "Mod+y"], () => redo()],
    ["help", "Keyboard shortcuts", ["?"], () => goSettings("keys")],
];
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
function keyName(e: KeyboardEvent) {
    const base =
        e.code && e.code.startsWith("Digit")
            ? e.code.slice(5)
            : e.code && e.code.startsWith("Key")
              ? e.code.slice(3).toLowerCase()
              : e.key.length === 1
                ? e.key.toLowerCase()
                : e.key;
    const printable = base.length === 1 && !/[a-z0-9]/.test(base);
    return [e.metaKey || e.ctrlKey ? "Mod" : "", e.altKey ? "Alt" : "", e.shiftKey && !printable ? "Shift" : "", base]
        .filter(Boolean)
        .join("+");
}
export const keysOf = (id: string): string[] => {
    const o = (meta.settings.keys || {})[id];
    return o ? (Array.isArray(o) ? o : [o]) : KEY_ACTIONS.find(a => a[0] === id)?.[2] || [];
};
export const keyFor = (id: string) => keysOf(id)[0] || "";
export const keyLabel = (k: string) =>
    !k
        ? ""
        : k
              .split("+")
              .map(p =>
                  p === "Mod"
                      ? isMac
                          ? "⌘"
                          : "Ctrl"
                      : p === "Shift"
                        ? "⇧"
                        : p === "Alt"
                          ? isMac
                              ? "⌥"
                              : "Alt"
                          : p.length === 1
                            ? p.toUpperCase()
                            : p
              )
              .join(isMac ? "" : "+");
export function runKey(e: KeyboardEvent): boolean {
    const k = keyName(e);
    if (["Shift", "Control", "Meta", "Alt"].includes(e.key)) return false;
    const a = KEY_ACTIONS.find(([id]) => keysOf(id).includes(k));
    if (!a) return false;
    e.preventDefault();
    a[3]();
    return true;
}
function zoomBy(d: number) {
    if (ui.tab !== "library" || curView() === "list") return;
    const md = curMode(),
        v = curView(md),
        o = viewOpts(md, v);
    md.vz = { ...(md.vz || {}), [v]: { ...o, z: Math.max(0.55, Math.min(1.9, Math.round((o.z + d) * 100) / 100)) } };
    markDirty();
    renderMain();
}
export function goWatch() {
    ui.page = "watch";
    ui.modeMenu = false;
    render();
    window.scrollTo(0, 0);
}
function toggleWatch() {
    ui.modeMenu = false;
    if (!stageOn()) {
        stageOffNote();
        return;
    }
    if (ui.page === "watch" || ui.page === "read") {
        if (W.player) {
            W.player = null;
            renderPlayer();
        }
        ui.page = "profile";
        render();
        return;
    }
    const to = meta.settings.stageLast || "watch";
    if (to === "read") RD.item = null;
    ui.page = to;
    render();
    window.scrollTo(0, 0);
}
// [ and ] move between your modes; inside Watch & read they move between Watch and Read instead, and never leave it
function modeKey(d: number) {
    if (ui.page === "settings") return;
    if (ui.page === "watch" || ui.page === "read") {
        if (W.player || $("#reader")) return;
        const to = ui.page === "watch" ? "read" : "watch";
        meta.settings.stageLast = to;
        markDirty();
        ui.page = to;
        render();
        window.scrollTo(0, 0);
        return;
    }
    cycleMode(d);
}
export function toggleSettings() {
    if (ui.page === "settings") closeSettings();
    else goSettings();
}

// ═══════════════════════════════════════════
//  RIGHT-CLICK: SCORE IT THERE AND THEN; LEFT-CLICK OPENS THE CARD
// ═══════════════════════════════════════════
// One menu box for everything you can right-click, and for the small menus a button opens (a block's settings, the tab
// editor, an episode's link). Every menu is Svelte (core/menus.ts) and is mounted in it; main.ts gives them here once it
// has started, as this module doesn't import the components that import it.
let svelteMenus: {
    draw: (kind: string, k: string, box: HTMLElement) => void;
    catchUp: () => void;
    shown: () => boolean;
    drop: () => void;
} | null = null;
export function useSvelteMenus(m: NonNullable<typeof svelteMenus>) {
    svelteMenus = m;
}
// A menu of choices is a menu; one with boxes to fill in (a block's settings, the tab editor, an episode's link) is a
// small dialog, named by its label
function menuBox(id: string | undefined, label?: string) {
    let el = $("#ctx");
    if (!el) {
        el = document.createElement("div");
        el.id = "ctx";
        el.className = "ctx";
        document.body.append(el);
    }
    el.setAttribute("role", label ? "dialog" : "menu");
    if (label) el.setAttribute("aria-label", label);
    else el.removeAttribute("aria-label");
    ctxY = scrollY;
    el.dataset.id = id || "";
    return el;
}
// shown where it was asked for, kept inside the window
function place(el: HTMLElement, x: number, y: number) {
    el.hidden = false;
    const w = el.offsetWidth,
        h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + "px";
    el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + "px";
}
/** a menu (core/menus.ts), for what it's about: an entry's id, a character's, a list's, a block's place… */
export function openMenu(kind: string, k: string, x: number, y: number, data: { id?: string; label?: string } = {}) {
    if (!svelteMenus) return;
    const el = menuBox(data.id, data.label);
    svelteMenus.draw(kind, k, el);
    place(el, x, y);
}
export function openCtx(id: string, x: number, y: number) {
    if (!items.has(id)) return;
    openMenu("item", id, x, y, { id });
}
/** after a change the store doesn't carry (or that has to show before the next line runs): the menu catches up, and
 *  closes if what it was about has gone */
export function refreshCtx() {
    const el = $("#ctx");
    if (!el || el.hidden || !svelteMenus?.shown()) return;
    svelteMenus.catchUp();
    if (!el.firstElementChild) el.hidden = true;
}
export const closeCtx = () => {
    const el = $("#ctx");
    if (el) el.hidden = true;
    svelteMenus?.drop(); // only what's open is in memory
};
let ctxY = 0;

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initKeys() {
    // capture the next key press when you're changing a shortcut
    document.addEventListener(
        "keydown",
        e => {
            if (!ui.keyCapture) return;
            if (["Shift", "Control", "Meta", "Alt"].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") {
                ui.keyCapture = null;
                renderMain();
                return;
            }
            const k = keyName(e),
                id = ui.keyCapture,
                action = KEY_ACTIONS.find(a => a[0] === id),
                clash = KEY_ACTIONS.find(([x]) => x !== id && keysOf(x).includes(k));
            meta.settings.keys = { ...(meta.settings.keys || {}), [id]: [k] };
            if (clash) meta.settings.keys[clash[0]] = keysOf(clash[0]).filter(x => x !== k);
            ui.keyCapture = null;
            markDirty();
            render();
            toast(`${action?.[1]}: ${keyLabel(k)}${clash ? ` (taken from “${clash[1]}”)` : ""}`);
        },
        true
    );
    document.addEventListener("contextmenu", e => {
        if (e.shiftKey || closestTo(e, "input, textarea")) return;
        const at = (sel: string) => closestTo(e, sel),
            X = e.clientX,
            Y = e.clientY;
        let t: HTMLElement | null;
        if ((t = at(".tchip[data-tkey], .rkrow[data-tkey]"))) {
            e.preventDefault();
            const k = t.dataset.tkey || "";
            openMenu("tier", k, X, Y);
            return;
        }
        if (
            (t = at('[data-act="open"][data-id], [data-act="watch-item"][data-id]')) &&
            !t.closest("#overlay .item7 .iside")
        ) {
            e.preventDefault();
            openCtx(t.dataset.id || "", X, Y);
            return;
        }
        if ((t = at('[data-act="open-char"][data-k], [data-charid]'))) {
            e.preventDefault();
            openMenu("char", t.dataset.k || t.dataset.charid || "", X, Y);
            return;
        }
        if ((t = at('[data-act="go-list"][data-k]'))) {
            e.preventDefault();
            const id = t.dataset.k;
            if (!id) return;
            openMenu("list", id, X, Y);
            return;
        }
        if ((t = at('[data-act="mode"][data-k], [data-act="edit-mode"][data-k]'))) {
            e.preventDefault();
            openMenu("mode", t.dataset.k || "", X, Y);
            return;
        }
        if ((t = at('.ptabs [data-act="tab"][data-k]'))) {
            e.preventDefault();
            openMenu("tab", t.dataset.k || "", X, Y);
            return;
        }
        if ((t = at(".blk[data-bi]"))) {
            e.preventDefault();
            openMenu("block", `${t.dataset.bkind || "ov"}:${Number(t.dataset.bi)}`, X, Y, { label: "Block settings" });
            return;
        }
    });
    document.addEventListener(
        "pointerdown",
        e => {
            const el = $("#ctx");
            if (el && !el.hidden && !closestTo(e, "#ctx")) closeCtx();
        },
        true
    );
    // a scroll still settling when the menu opens shouldn't close it; a real scroll away does
    addEventListener(
        "scroll",
        () => {
            const el = $("#ctx");
            if (el && !el.hidden && Math.abs(scrollY - ctxY) > 48) closeCtx();
        },
        { passive: true }
    );
}
