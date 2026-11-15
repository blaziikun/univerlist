// src/features/core/shell.ts
// ─────────────────────────────────────────────────────────────────
//  Shell: who you are and which mode, one search for everything, a sidebar that toggles, pins and pushes
// ─────────────────────────────────────────────────────────────────

import {
    $,
    allModes,
    coverCache,
    curMode,
    fileSync,
    isSealed,
    isSpace,
    items,
    meta,
    shelvesOf,
    stateChanged,
    STATUS,
    STATUS_WORDS,
    storage,
    ui,
} from "./core";
import { logoLook, resolveTheme } from "./theme";
import { alSync, renderAlStatus } from "../sources/anilist";
import { auto, renderAutoStatus, scoreQ } from "../sources/covers";
import { buildCallNumbers, groupWord, isUniversal, modeItems, visible } from "./views";
import { W } from "../watch-read/watch";
import { stageOn } from "../extensions/builtins";
import { stageThemeApply } from "../watch-read/stage";
import { stageChanged } from "../watch-read/stage-state.svelte";
import { setBusy, shellChanged } from "./shell/shell-state.svelte";
import { keyFor, keyLabel } from "./keys";
import { tabRemember, tabsFor } from "./tabs";
import type { List, Mode } from "./model";

// the app's own icons: fixed SVG, put into the page only by core/Icon.svelte (a name not in here is a type error)
export const ICON = {
    side: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
    x: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>`,
    search: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.6l-1.3-1.2C5.8 15 2.7 12.2 2.7 8.7 2.7 6 4.8 3.9 7.5 3.9c1.6 0 3.1.7 4.5 2.2 1.4-1.5 2.9-2.2 4.5-2.2 2.7 0 4.8 2.1 4.8 4.8 0 3.5-3.1 6.3-8 10.7z"/></svg>`,
    heartLine: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.6l-1.3-1.2C5.8 15 2.7 12.2 2.7 8.7 2.7 6 4.8 3.9 7.5 3.9c1.6 0 3.1.7 4.5 2.2 1.4-1.5 2.9-2.2 4.5-2.2 2.7 0 4.8 2.1 4.8 4.8 0 3.5-3.1 6.3-8 10.7z"/></svg>`,
    filter: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>`,
    size: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="7" height="9" rx="1.5"/><rect x="13" y="8" width="7" height="12" rx="1.5"/></svg>`,
    gap: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5v14M20 5v14M8 12h8M8 12l2-2M8 12l2 2M16 12l-2-2M16 12l-2 2"/></svg>`,
    v_cover: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="4" width="5" height="7.5" rx="1"/><rect x="9.5" y="4" width="5" height="7.5" rx="1"/><rect x="16" y="4" width="5" height="7.5" rx="1"/><rect x="3" y="13" width="5" height="7.5" rx="1"/><rect x="9.5" y="13" width="5" height="7.5" rx="1"/><rect x="16" y="13" width="5" height="7.5" rx="1"/></svg>`,
    v_grid: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="8" height="10" rx="1.2"/><rect x="13" y="3" width="8" height="10" rx="1.2"/><rect x="3" y="15" width="8" height="2" rx="1"/><rect x="13" y="15" width="8" height="2" rx="1"/><rect x="3" y="18.5" width="5" height="1.6" rx=".8"/><rect x="13" y="18.5" width="5" height="1.6" rx=".8"/></svg>`,
    v_spine: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="6" width="3" height="14" rx=".6"/><rect x="7" y="3" width="3.4" height="17" rx=".6"/><rect x="11.4" y="5" width="2.6" height="15" rx=".6"/><rect x="15" y="4" width="3.6" height="16" rx=".6" transform="rotate(8 16.8 12)"/><rect x="2" y="20.5" width="20" height="1.5" rx=".6"/></svg>`,
    v_list: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>`,
    play: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>`,
    servers: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3.5" y="4" width="17" height="6.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="7.25" r="1.15" fill="currentColor"/><circle cx="7.5" cy="16.75" r="1.15" fill="currentColor"/></svg>`,
    // the player's own (watch-read/player/): drawn at 1em, so a button's font size sets their size
    pause: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1"/><rect x="13.8" y="5" width="4.2" height="14" rx="1"/></svg>`,
    playBig: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.4-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"/></svg>`,
    nextEp: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M5 5.3v13.4a.8.8 0 0 0 1.2.7l9.6-6.7a.8.8 0 0 0 0-1.4L6.2 4.6A.8.8 0 0 0 5 5.3z"/><rect x="17" y="5" width="2.6" height="14" rx="1"/></svg>`,
    volume: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M4 9.2h3.6L12.3 5a.6.6 0 0 1 1 .5v13a.6.6 0 0 1-1 .5l-4.7-4.2H4a1 1 0 0 1-1-1V10.2a1 1 0 0 1 1-1z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
    muted: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M4 9.2h3.6L12.3 5a.6.6 0 0 1 1 .5v13a.6.6 0 0 1-1 .5l-4.7-4.2H4a1 1 0 0 1-1-1V10.2a1 1 0 0 1 1-1z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`,
    fullscreen: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/></svg>`,
    fullscreenOff: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20"/></svg>`,
    theater: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2"/></svg>`,
    theaterOff: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7.5" width="14" height="9" rx="1.6"/></svg>`,
    bulb: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>`,
    replay: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12A8 8 0 1 0 12 4"/><path d="M14.4 1.6L12 4l2.4 2.4"/></svg>`,
    forward: `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12A8 8 0 1 1 12 4"/><path d="M9.6 1.6L12 4 9.6 6.4"/></svg>`,
} satisfies Record<string, string>;
/** an icon's name in ICON */
export type IconName = keyof typeof ICON;
/** your picture, or your initial on the mode's colour (shell/Avatar.svelte draws it) */
export function avatarLook(mp: { avatar?: string; name?: string }) {
    return {
        src: mp.avatar ? coverCache.src(mp.avatar) : "",
        initial: (mp.name || "?").trim().charAt(0).toUpperCase() || "?",
    };
}
/** every mode, with a key to jump to it (customisable), its colour and its count: the profile header's mode menu
 *  (shell/ModeList.svelte) */
export function modeListView(mode: Mode) {
    return {
        modes: allModes().map((x, i) => {
            const key = keyFor("mode" + (i + 1));
            return {
                id: x.id,
                g: x.g || "•",
                name: x.name,
                on: x.id === mode.id,
                mc: `--mc:${resolveTheme(x.theme).accent}`,
                n: modeItems(x).length,
                key: key ? keyLabel(key) : "",
            };
        }),
        stage: stageOn(),
        priv: !!ui.private,
    };
}

// ── the shell Svelte draws (core/shell/: the top bar, the sidebar, the search box), as main.ts hands it over: this
// module doesn't import the components, as they import it. Each is mounted the first time it's drawn, and after that
// asked to draw again (shellChanged), as often as the HTML was redrawn
interface SvelteShell {
    top: (target: HTMLElement) => void;
    side: (target: HTMLElement) => void;
    search: (target: HTMLElement) => void;
}
let svelteShell: SvelteShell | null = null;
export function useSvelteShell(s: SvelteShell) {
    svelteShell = s;
}
const mounted = { top: false, side: false };
// the top bar: the sidebar's button, the logo, the switch on the Watch and Read pages; search, Insights and Settings
export function renderTop() {
    const top = $("#top")!;
    if (svelteShell && !mounted.top) {
        mounted.top = true;
        svelteShell.top(top);
    }
    // the search panel lives at the top of the page (outside the bar) so it can sit centred over a dimmed page
    if (svelteShell && !$("#gs")) {
        const g = document.createElement("div");
        g.className = "searchwrap";
        g.id = "gs";
        g.setAttribute("role", "dialog");
        g.setAttribute("aria-label", "Search");
        document.body.append(g);
        svelteShell.search(g);
    }
    top.classList.toggle("scrolled", scrollY > 40);
    shellChanged();
    updateBusy();
}
/** what the top bar shows (shell/TopBar.svelte) */
export function topView() {
    const L = meta.layout.side,
        inSet = ui.page === "settings";
    return {
        priv: !!ui.private,
        right: L.pos === "right",
        pinned: !!L.pinned,
        sideTitle: `${L.pinned ? "Unpin the sidebar" : "Hover to peek, click to pin"} (${keyLabel(keyFor("sidebar"))})`,
        mode: ui.mode,
        logo: logoLook(),
        stage: ui.page === "watch" || ui.page === "read" ? ui.page : "",
        searchTitle: `Search (${keyLabel(keyFor("search"))})`,
        insightsTitle: `Insights (${keyLabel(keyFor("discover"))})`,
        inSet,
        setTitle: inSet ? "Close settings" : "Settings (" + keyLabel(keyFor("settings")) + ")",
    };
}
// the busy light: artwork, scores or AniList at work, or the library file waiting for permission again
export function updateBusy() {
    setBusy(
        (auto.running && !auto.paused) || scoreQ.running || alSync.running || fileSync.state === "reconnect",
        fileSync.state === "reconnect"
            ? "Your library file needs permission again"
            : alSync.running
              ? "Syncing AniList…"
              : auto.running
                ? `${auto.phase === "cache" ? "Saving pictures for offline" : "Finding artwork"} ${auto.done}/${auto.total} (click to see or stop)`
                : `Fetching scores ${scoreQ.done}/${scoreQ.total} (click to see or stop)`,
        fileSync.state === "reconnect"
    );
}

// ── the sidebar: where you are, what you're in the middle of, and every shortcut ──
export function renderSide() {
    const L = meta.layout.side,
        app = $("#app")!;
    app.dataset.side = L.pos;
    app.classList.toggle("side-open", !!L.pinned);
    app.style.setProperty("--side-w", L.width + "px");
    app.dataset.stext = L.text || "m";
    document.documentElement.dataset.private = ui.private ? "1" : "";
    if (svelteShell && !mounted.side) {
        mounted.side = true;
        svelteShell.side($("#side")!);
    }
    renderTop();
}
/** one of the sidebar's buttons: where it goes (act, k), its icon and name, whether you're there, and how many */
export interface SideButton {
    act: string;
    k?: string;
    label: string;
    ic: string;
    on: boolean;
    ct: number | null;
    cls: string;
}
const navBtn = (
    act: string,
    label: string,
    ic: string,
    on: boolean,
    ct: number | null,
    k?: string,
    cls = ""
): SideButton => ({ act, k, label, ic, on, ct, cls: `nb ${cls}${on ? " on" : ""}` });
/** what the sidebar shows (shell/Side.svelte): its head, then each section you haven't hidden, folded or not */
export function sideView() {
    const L = meta.layout.side,
        mode = curMode(),
        M = modeItems(),
        sh = shelvesOf(),
        lib = ui.page === "profile" && ui.tab === "library";
    const st: Record<string, number> = {};
    for (const b of M) st[b.status] = (st[b.status] || 0) + 1;
    const lists = meta.lists.filter(l => listInMode(l) && !l.private === !ui.private);
    const hiddenN = [...items.values()].filter(
        b => b.hidden && !!b.private === !!ui.private && (!isSealed(b) || ui.private)
    ).length;
    const hid = L.hide || SIDE_HIDE_DEFAULT,
        shut = (k: string) => (L.closed || []).includes(k),
        stage = ui.page === "watch" || ui.page === "read";
    const views = meta.views.filter(v => !v.state.mode || v.state.mode === mode.id);
    return {
        pinned: !!L.pinned,
        pinTitle: `${L.pinned ? "Unpin" : "Pin it open"} (${keyLabel(keyFor("sidebar"))})`,
        modeName: curMode().name + (ui.private ? " · private" : ""),
        text: SIDE_TEXT.map(([k, n]) => ({ k, n, on: (L.text || "m") === k })),
        modes: hid.includes("modes")
            ? null
            : {
                  shut: shut("modes"),
                  list: allModes().map(x => ({
                      id: x.id,
                      on: x.id === mode.id && !stage,
                      mc: `--mc:${resolveTheme(x.theme).accent}`,
                      g: x.g || "•",
                      name: x.name,
                      n: modeItems(x).length,
                  })),
                  stage: stageOn() ? { on: stage } : null,
              },
        lib: hid.includes("lib")
            ? null
            : {
                  shut: shut("lib"),
                  name: mode.name,
                  rows: [
                      navBtn(
                          "shelf",
                          "Everything",
                          "▤",
                          lib && !ui.shelfKey && ui.status === "all" && !ui.hiddenView,
                          M.length,
                          ""
                      ),
                      ...(isUniversal()
                          ? []
                          : sh.map(s =>
                                navBtn(
                                    "shelf",
                                    s.name,
                                    "",
                                    lib && ui.shelfKey === s.key,
                                    M.filter(b => s.test(b)).length,
                                    s.key,
                                    "sub"
                                )
                            )),
                      ...STATUS.filter(s => st[s]).map(s =>
                          navBtn(
                              "side-status",
                              STATUS_WORDS[groupWord()][s],
                              "",
                              lib && ui.status === s,
                              st[s],
                              s,
                              "sub st-" + s
                          )
                      ),
                  ],
              },
        lists: hid.includes("lists")
            ? null
            : {
                  shut: shut("lists"),
                  rows: [
                      ...(ui.private
                          ? []
                          : [
                                navBtn(
                                    "go-list",
                                    "Up next",
                                    "⧗",
                                    ui.tab === "lists" && ui.listId === "queue",
                                    meta.queue.filter(id => {
                                        const b = items.get(id);
                                        return !!b && visible(b);
                                    }).length || null,
                                    "queue"
                                ),
                            ]),
                      ...lists.map(l =>
                          navBtn(
                              "go-list",
                              l.name,
                              l.numbered ? "№" : "≡",
                              ui.tab === "lists" && ui.listId === l.id,
                              l.ids.filter(id => items.has(id)).length,
                              l.id
                          )
                      ),
                  ],
                  hidden: hiddenN ? navBtn("hidden-view", "Hidden", "◌", ui.hiddenView, hiddenN) : null,
              },
        views:
            views.length && !hid.includes("views")
                ? { shut: shut("views"), list: views.map(v => ({ id: v.id, name: v.name, on: ui.viewId === v.id })) }
                : null,
        quick: hid.includes("do")
            ? null
            : {
                  shut: shut("do"),
                  add: keyLabel(keyFor("add")),
                  pick: keyLabel(keyFor("pick")),
                  io: !hid.includes("io"),
              },
        priv: hid.includes("private") ? null : { on: !!ui.private },
    };
}
// sidebar text size: three steps, remembered with the layout
export const SIDE_TEXT: [string, string][] = [
    ["s", "Small"],
    ["m", "Medium"],
    ["l", "Large"],
];
// the sidebar's footer: only what needs saying (not saving, offline, a file to reconnect), shortcuts, and what the sidebar shows
export const SIDE_SECS = [
    ["modes", "Modes"],
    ["lib", "This mode's shelves"],
    ["lists", "Lists"],
    ["views", "Saved views"],
    ["do", "Quick actions"],
    ["io", "Import or export"],
    ["private", "Private collection"],
];
export const SIDE_HIDE_DEFAULT: string[] = ["io"];
/** the sidebar's footer draws again (online or not, the library file, the Customise menu) */
export function renderSideStatus() {
    shellChanged();
    updateBusy();
}
/** what the sidebar's footer shows (shell/SideStatus.svelte): what needs saying, and the Customise menu */
export function sideStatusView() {
    const warn = storage !== "idb" && storage !== "local" ? "Not saving: export a backup" : "",
        reconnect = fileSync.handle && fileSync.state === "reconnect" ? fileSync.handle.name : "",
        fileErr = fileSync.handle && fileSync.state !== "on" && !reconnect ? "Library file error" : "",
        offline = navigator.onLine ? "" : "Offline";
    const hid = meta.layout.side.hide || SIDE_HIDE_DEFAULT;
    // one line: the words around the button to reconnect the file, each run of them as one piece of text
    return {
        warn:
            warn || reconnect || fileErr || offline
                ? reconnect
                    ? { pre: warn ? warn + " · " : "", reconnect, post: offline ? " · " + offline : "" }
                    : { pre: [warn, fileErr, offline].filter(Boolean).join(" · "), reconnect: "", post: "" }
                : null,
        pop: ui.pop === "sidecust",
        secs: SIDE_SECS.map(([k, l]) => ({ k, l, on: !hid.includes(k) })),
    };
}
export const listInMode = (l: List) => !l.mode || l.mode === curMode().id || isUniversal();
/** what Settings › Data says under "When it goes online" besides the work in progress
 *  (settings/sections/data/WorkStatus.svelte): the library file to reconnect, being offline, the last backup */
export function workStatusView() {
    const s = meta.settings,
        days = s.lastBackup ? Math.floor((Date.now() - Date.parse(s.lastBackup)) / 864e5) : null;
    return {
        reconnect: fileSync.state === "reconnect" ? { name: fileSync.handle?.name ?? "" } : null,
        hint: `${!navigator.onLine ? "You're offline. Everything works; new artwork and scores wait until you're back and you press Refresh. " : ""}${days == null ? "No backup yet." : `Last backup ${days ? days + " days ago" : "today"}.`}`,
    };
}

// ── tabs: the same core in every mode, plus what that mode is for ──
export const TAB_NAME: Record<string, string> = {
    overview: "Overview",
    library: "Library",
    favourites: "Favourites",
    stats: "Stats",
    lists: "Lists",
    discover: "Insights",
    rank: "Rank",
    seasonal: "This season",
    releasing: "Releasing",
    series: "Series",
    quotes: "Quotes",
    diary: "Diary",
    playing: "Playing",
    learn: "Courses",
    paths: "Pathways",
    curricula: "Curricula",
};
export const EXTRA_TABS: string[] = [
    "seasonal",
    "releasing",
    "series",
    "quotes",
    "diary",
    "playing",
    "learn",
    "paths",
    "curricula",
];
/** the media a mode is for (its match, without what it leaves out): "*" for everything */
const modeMedia = (mode: Mode) =>
    (mode.match || []).filter(p => !p.startsWith("!")).map(p => (p === "*" ? "*" : p.split(":")[0]));
/** the kinds of thing each extra tab is about: a mode shows it only if it holds one of them */
const TAB_MEDIA: Record<string, string[]> = {
    seasonal: ["anime"], // This season: the anime airing now
    releasing: ["tv", "anime"], // what's still coming out, and when its next episode is
    series: ["book", "novel", "comic", "manga", "manhwa"],
    quotes: ["book", "novel", "comic", "manga", "manhwa"],
    diary: ["film", "tv", "anime"],
    playing: ["game"],
};
/** whether a tab belongs in a mode: the core tabs everywhere; the Learning Centre's own tabs only in it, and it
 *  shows nothing else of the extras; the rest only where the mode holds what they're about */
export function tabFits(mode: Mode, k: string): boolean {
    if (!EXTRA_TABS.includes(k)) return true;
    const lc = mode.space === "learning-centre";
    if (["learn", "paths", "curricula"].includes(k)) return lc;
    if (lc) return false;
    const M = modeMedia(mode);
    return M.includes("*") || (TAB_MEDIA[k] || []).some(x => M.includes(x));
}
// the tabs a mode shows when it has no list of its own (core/tabs.ts keeps each mode's own list)
export function defaultTabsFor(mode: Mode): string[] {
    const base = meta.layout.tabs
        .filter(
            t =>
                TAB_NAME[t.k] &&
                !EXTRA_TABS.includes(t.k) &&
                (t.on || t.k === ui.tab) &&
                !(mode.offTabs || []).includes(t.k)
        )
        .map(t => t.k);
    const ex = (mode.extra || []).filter(
        k => EXTRA_TABS.includes(k) && !(mode.offTabs || []).includes(k) && tabFits(mode, k)
    );
    if (isSpace(mode)) {
        const i = base.indexOf("library");
        base.splice(i < 0 ? 0 : i + 1, 0, ...ex);
    } else if (!base.length) {
        base.push(...ex);
        return base;
    } else {
        const i = Math.max(0, base.indexOf("library"));
        base.splice(i + 1, 0, ...ex);
    }
    return base;
}
// the pages Svelte draws (core/pages.ts lists the same ones); renderMain hands them over instead of drawing them.
// A mode's tabs are one page, "profile": the profile header and the tab (core/shell/ProfilePage.svelte)
const SVELTE_PAGES = ["settings", "features", "profile", "watch", "read"];
/** the Svelte pages, as main.ts hands them over: show one in its element (or bring it up to date there), let it go */
interface SveltePages {
    show: (page: string, target: HTMLElement) => void;
    hide: () => void;
}
// …which main.ts gives once it has started: this module doesn't import the Svelte pages, as they import it
let sveltePages: SveltePages | null = null;
export function useSveltePages(pages: SveltePages) {
    sveltePages = pages;
}
let lastPage = ""; // the page, tab and mode last drawn
// the browser tests wrap it to count redraws (core/test-hook.ts), so it can be replaced
export let renderMain = (): void => {
    // the Watch page behind an open player can't be seen: drawing it (367 episodes, say) mid-episode only risks a stutter, so it waits until the player closes
    if (ui.page === "watch" && W.player && document.getElementById("cinema")) {
        W.pageStale = true;
        return;
    }
    W.pageStale = false;
    stateChanged("ui"); // the Svelte pages update themselves from the store
    buildCallNumbers();
    if (typeof stageThemeApply === "function") stageThemeApply();
    let page = ui.page; // a Svelte page (core/pages.ts): it draws itself
    if (!SVELTE_PAGES.includes(ui.page) || ui.page === "profile") {
        // a mode's tabs, under its profile header
        page = "profile";
        const tabs = tabsFor();
        if (!tabs.includes(ui.tab)) ui.tab = tabs[0] || "overview";
    }
    // the same page redrawn keeps its place and doesn't replay the entrance; a new page or tab fades in
    const main = $("#main")!,
        sig = [ui.page, ui.tab, ui.mode, !!ui.private].join("|"),
        same = sig === lastPage,
        y = scrollY;
    // a redraw from background work (covers arriving, a sync) keeps the cursor in the box you're typing in
    const fa = document.activeElement,
        fid = same && fa && fa.id && main.contains(fa) && /INPUT|TEXTAREA/.test(fa.tagName) ? fa.id : "",
        fsel: [number | null, number | null] | null =
            fid && (fa instanceof HTMLInputElement || fa instanceof HTMLTextAreaElement)
                ? [fa.selectionStart, fa.selectionEnd]
                : null;
    if (sveltePages) sveltePages.show(page, main);
    else main.innerHTML = `<p class="hint">Opening…</p>`; // main.ts hasn't started yet: it redraws once it has
    // Watch and Read draw when they're asked to, as the HTML pages did (watch-read/stage-state.svelte.ts)
    if (page === "watch" || page === "read") stageChanged("page");
    lastPage = sig;
    if (fid) {
        const n = document.getElementById(fid);
        if (n && n !== document.activeElement) {
            n.focus({ preventScroll: true });
            try {
                if (fsel && (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement))
                    n.setSelectionRange(fsel[0], fsel[1]);
            } catch (_) {}
        }
    }
    main.classList.toggle("enter", !same);
    if (!same) requestAnimationFrame(() => setTimeout(() => main.classList.remove("enter"), 400));
    else
        requestAnimationFrame(() => {
            if (Math.abs(scrollY - y) > 2) scrollTo(0, y);
        });
    main.classList.toggle("selecting", ui.selecting);
    main.classList.toggle("is-settings", ui.page === "settings");
    main.classList.toggle("is-watch", ui.page === "watch");
    renderAutoStatus();
    renderAlStatus();
    afterRender();
    if (typeof tabRemember === "function") tabRemember();
};
// the browser tests wrap it to count redraws, through the test hook (core/test-hook.ts)
export function replaceRenderMain(f: () => void) {
    renderMain = f;
}
// work that needs the page on screen: the search filter in settings
export const afterRenderHooks: (() => void)[] = [];
function afterRender() {
    for (const f of afterRenderHooks)
        try {
            f();
        } catch (e) {
            console.warn(e);
        }
}

// ── profile header: a full-width banner, your picture and name, the mode underneath ──
export function modeProfile(mode: Mode = curMode()): { name: string; avatar: string; bio: string; banner: string } {
    const p = meta.profile,
        mp = mode.profile || {},
        al = p.anilist || {};
    return {
        name: mp.name || p.name,
        avatar: mp.avatarData || mp.avatar || p.avatarData || p.avatar || al.avatar || "",
        bio: mp.bio != null && mp.bio !== "" ? mp.bio : p.bio,
        banner: mp.noBanner
            ? ""
            : mp.bannerData || mp.banner || p.bannerData || p.banner || (hasAnimanga(mode) ? al.banner : "") || "",
    };
}
/** what the profile header shows above a mode's tabs (shell/ProfileHead.svelte): its banner, your picture and name,
 *  the mode with its menu, and the mode's tabs */
export function profileView() {
    const mode = curMode(),
        mp = modeProfile(mode),
        banner = ui.private && !mode.sealedOnly ? "" : mp.banner;
    return {
        id: mode.id,
        mp,
        banner: banner ? `background-image:url('${coverCache.src(banner).replace(/'/g, "%27")}')` : "",
        name: mp.name,
        menu: !!ui.modeMenu,
        mc: `--mc:${resolveTheme(mode.theme).accent}`,
        g: mode.g || "",
        mode: mode.name + (ui.private ? " · private" : ""),
        n: modeItems(mode).length,
        editTitle: `Name, picture, banner and bio for ${mode.name}`,
        tabs: tabsFor().map(t => ({ k: t, name: TAB_NAME[t], on: ui.tab === t })),
        tabTitle: `Add, remove or reorder the tabs in ${mode.name}`,
    };
}
export const hasAnimanga = (mode: Mode = curMode()) =>
    (mode.match || []).some(p => p === "*" || /^(anime|manga|manhwa|novel)/.test(p));

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initShell() {
    addEventListener(
        "scroll",
        () => {
            const t = $("#top");
            if (t) t.classList.toggle("scrolled", scrollY > 40);
        },
        { passive: true }
    );
}
