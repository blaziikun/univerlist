// src/features/core/tabs.ts
// ─────────────────────────────────────────────────────────────────
//  Tabs, mode by mode: add, remove and reorder them where they are, choose the one each mode opens on
//
//  A mode's tabs live on the mode (mode.tabs, in order). A mode saved before that keeps the arrangement it had until you
//  change it here.
// ─────────────────────────────────────────────────────────────────

import {
    type ActEl,
    curMode,
    DEFAULT_TABS,
    isRecord,
    items,
    markDirty,
    meta,
    modeById,
    scheduleSave,
    toast,
    ui,
} from "./core";
import type { Mode } from "./model";
import { defaultTabsFor, EXTRA_TABS, TAB_NAME } from "./shell";
import { closeCtx, openMenu } from "./keys";
import { modeChanged } from "../settings/handlers";

const ALL_TABS = () => [...DEFAULT_TABS, ...EXTRA_TABS].filter(k => TAB_NAME[k]);
export function tabsFor(mode = curMode()) {
    if (Array.isArray(mode.tabs) && mode.tabs.length) {
        const T = mode.tabs.filter(k => TAB_NAME[k]);
        if (T.length) return T;
    }
    return defaultTabsFor(mode);
}
const tabsOwn = (md: Mode): string[] => {
    if (!Array.isArray(md.tabs) || !md.tabs.length) md.tabs = defaultTabsFor(md);
    return md.tabs;
};
/** the tab editor (core/menus/TabEditor.svelte): the mode's tabs in order, the ones it could add, and the one it opens on */
export function tabEditView() {
    const md = curMode(),
        on = tabsFor(md);
    return {
        name: md.name,
        on,
        off: ALL_TABS().filter(k => !on.includes(k)),
        home: md.homeTab && on.includes(md.homeTab) ? md.homeTab : "",
    };
}
/** a tab ticked on or off in the editor; false when it's the last one, which stays */
export function tabToggle(k: string, on: boolean): boolean {
    const md = curMode(),
        T = [...tabsOwn(md)];
    if (on) {
        if (!T.includes(k)) T.push(k);
        tabsSet(md, T);
        return true;
    }
    if (T.length <= 1) return false;
    tabsSet(
        md,
        T.filter(x => x !== k)
    );
    return true;
}
/** a tab dragged (from the bar, or a row of the editor) put before or after another */
export function tabDropOn(from: string, to: string, after: boolean) {
    if (to === from) return;
    const md = curMode(),
        T = tabsOwn(md).filter(x => x !== from);
    T.splice(T.indexOf(to) + (after ? 1 : 0), 0, from);
    tabsSet(md, T);
}
function tabsSet(md: Mode, T: string[], label?: string) {
    const before = md.tabs ? [...md.tabs] : null;
    md.tabs = T;
    if (!T.includes(ui.tab)) ui.tab = T[0];
    modeChanged();
    if (label)
        toast(label, {
            label: "Undo",
            fn: () => {
                md.tabs = before;
                modeChanged();
            },
        });
}
export function tabsClick(act: string, t: ActEl, k: string | undefined): boolean {
    const md = curMode();
    if (act === "tab-edit") {
        const r = t.getBoundingClientRect();
        openMenu("tabedit", "", r.right - 300, r.bottom + 6, { label: "Tabs" });
        return true;
    }
    if (act === "tab-move") {
        const T = [...tabsOwn(md)],
            i = T.indexOf(k || ""),
            j = i + Number(t.dataset.d);
        if (i < 0 || j < 0 || j >= T.length) return true;
        [T[i], T[j]] = [T[j], T[i]];
        tabsSet(md, T);
        return true;
    }
    if (act === "tab-home") {
        md.homeTab = k || undefined;
        markDirty();
        return true;
    }
    if (act === "tab-hide") {
        const T = tabsOwn(md);
        if (T.length <= 1) return true;
        closeCtx();
        tabsSet(
            md,
            T.filter(x => x !== k),
            `Hid ${TAB_NAME[k || ""]} in ${md.name}`
        );
        return true;
    }
    return false;
}
// drag a tab along the bar (shell/TabsBar.svelte), or a row in the editor, to put it somewhere else: the tab being
// dragged, which both read and set, so a tab can go from one to the other
let tabDrag: string | null = null;
export const tabDragged = () => tabDrag;
export function setTabDrag(k: string | null) {
    tabDrag = k;
}
// each mode remembers its tab: Hub on Overview, Culture on Stats, and back to Stats when you return to Culture
export function tabOnEnter(id: string): string {
    const md = modeById(id) || curMode(),
        T = tabsFor(md),
        last = (meta.settings.lastTabs || {})[id],
        home = md.homeTab;
    const pick = meta.settings.modeOpens === "home" ? home || last : last || home;
    return pick && T.includes(pick) ? pick : T.includes(ui.tab) && !last && !home ? ui.tab : T[0];
}
export function tabRemember() {
    if (ui.page !== "profile" || !ui.tab) return;
    const L = (meta.settings.lastTabs = meta.settings.lastTabs || {});
    if (L[ui.mode] !== ui.tab) {
        L[ui.mode] = ui.tab;
        scheduleSave();
    }
}
// a refresh puts you back where you were: the page, mode, tab and any card that was open
function placeSave() {
    try {
        const m = ui.modal && ui.modal.kind === "item" ? ui.modal.id : null;
        sessionStorage.setItem(
            "ul-place",
            JSON.stringify({
                mode: ui.mode,
                page: ui.page,
                tab: ui.tab,
                setSec: ui.setSec,
                statsView: ui.statsView,
                listId: ui.listId,
                item: m,
                y: Math.round(scrollY),
                learnSub: ui.learnSub,
                uniSub: ui.uniSub,
                at: Date.now(),
            })
        );
    } catch (_) {}
}
export function placeRestore(): boolean {
    let P: unknown = null;
    try {
        P = JSON.parse(sessionStorage.getItem("ul-place") || "null");
    } catch (_) {}
    if (!isRecord(P)) return false;
    const mode = P.mode,
        page = P.page,
        tab = P.tab;
    if (typeof mode !== "string" || !meta.modes.some(x => x.id === mode)) return false;
    ui.mode = mode;
    ui.page =
        typeof page === "string" && ["profile", "settings", "watch", "read", "features"].includes(page)
            ? page
            : "profile";
    ui.tab = typeof tab === "string" && tabsFor(curMode()).includes(tab) ? tab : tabOnEnter(mode);
    for (const k of ["setSec", "statsView", "listId", "learnSub", "uniSub"]) {
        const v = P[k];
        if (typeof v === "string") ui[k] = v;
    }
    restoredPlace.y = Number(P.y) || 0;
    restoredPlace.item = typeof P.item === "string" && items.has(P.item) ? P.item : null;
    return true;
}
/** where the page was scrolled to, and the card that was open, before a refresh (set by placeRestore) */
export const restoredPlace: { y: number; item: string | null } = { y: 0, item: null };

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initTabs() {
    addEventListener("beforeunload", placeSave);
    addEventListener("pagehide", placeSave);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") placeSave();
    });
}
