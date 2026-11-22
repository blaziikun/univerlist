// src/features/core/nav-handlers.ts
// ─────────────────────────────────────────────────────────────────
//  Getting around: what its buttons do
//
//  Modes, the sidebar, pages and tabs, search, opening dialogs, the welcome screen.
//  core/actions.ts calls navClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import { $, type ActEl, changeMeta, curMode, markDirty, meta, ui } from "./core";
import type { Modal } from "./model";
import { applyTheme } from "./theme";
import { runAniListSync } from "../sources/anilist";
import { renderMain, renderSide, renderSideStatus } from "./shell";
import { shellChanged } from "./shell/shell-state.svelte";
import { listOrder } from "../library/library";
import { addDefaults, closeModal, openModal } from "./modals";
import { focusSearch } from "./search";
import { goWatch, toggleSettings } from "./keys";
import { tabsFor } from "./tabs";
import {
    closeSettings,
    goLib,
    goList,
    goSettings,
    goShelf,
    goTab,
    openAdd,
    openDiscover,
    render,
    savePrefs,
    setMode,
    setView,
    togglePrivate,
    toggleSide,
} from "./navigation";
import { addFromAniList, openItem } from "../library/item-actions";
import { seqFrom } from "./actions";

// the last item selected, for shift-click ranges
let lastSelIdx = -1;
export async function navClick(
    e: Event,
    t: ActEl,
    act: string,
    k: string | undefined,
    id: string | undefined,
    m: Modal | null
): Promise<boolean> {
    switch (act) {
        case "settings-toggle":
            toggleSettings();
            return true;
        case "go-watch":
            ui.modeMenu = false;
            goWatch();
            return true;
        case "go-features":
            ui.page = "features";
            render();
            window.scrollTo(0, 0);
            return true;
        case "focus-search":
            if (m) closeModal();
            focusSearch();
            return true;
        case "side-sec": {
            const L = meta.layout.side,
                C = (L.closed = L.closed || []);
            const i = C.indexOf(k || "");
            if (i < 0) C.push(k || "");
            else C.splice(i, 1);
            markDirty();
            renderSide();
            return true;
        }
        case "hidden-view":
            ui.hiddenView = !ui.hiddenView;
            ui.page = "profile";
            ui.tab = "library";
            ui.status = "all";
            render();
            window.scrollTo(0, 0);
            return true;
        case "side-toggle":
            if (window.innerWidth < 860) $("#app")!.classList.toggle("side-peek");
            else toggleSide();
            return true;
        case "seasonal-add":
            await addFromAniList(Number(k), undefined, "want");
            renderMain();
            return true;
        case "mode":
            if (t.dataset.stay) {
                ui.mode = k || "";
                applyTheme();
                savePrefs();
                render();
            } else setMode(k || "");
            return true;
        case "go-mode":
            if (ui.page === "settings" && t.classList.contains("brand")) {
                closeSettings();
                return true;
            }
            ui.page = "profile";
            ui.modeMenu = false;
            if (t.classList.contains("brand")) ui.tab = "overview";
            if (k && k !== ui.mode) setMode(k);
            else {
                applyTheme();
                render();
            }
            window.scrollTo(0, 0);
            return true;
        case "mode-menu":
            ui.modeMenu = !ui.modeMenu;
            shellChanged();
            return true;
        case "private-toggle":
            togglePrivate();
            return true;
        case "side-pin":
            toggleSide();
            return true;
        case "side-text":
            meta.layout.side.text = k || "";
            markDirty();
            renderSide();
            if (ui.page === "settings") renderMain();
            return true;
        case "open-search":
            focusSearch();
            return true;
        case "pop":
            ui.pop = ui.pop === k ? null : k;
            if (k === "sidecust" || t.closest("#side")) renderSideStatus();
            else renderMain();
            return true;
        case "tab": {
            const tab = k || "";
            if (!tabsFor().includes(tab)) {
                const md = meta.modes.find(x => tabsFor(x).includes(tab));
                if (md) setMode(md.id);
            }
            goTab(tab);
            scrollTo(0, 0);
            return true;
        }
        case "shelf":
            goShelf(k);
            return true;
        case "lib-status":
        case "side-status":
            goLib({ status: k });
            return true;
        case "go-list":
            if (m) closeModal();
            goList(k);
            return true;
        case "go-tag":
            goLib({ tag: k });
            return true;
        case "go-genre":
            if (m) closeModal();
            goLib({ genre: k });
            return true;
        case "go-view": {
            const v = meta.views.find(x => x.id === k);
            if (v) {
                if (v.state.mode && v.state.mode !== ui.mode) {
                    ui.mode = v.state.mode;
                    applyTheme();
                }
                goLib({ ...v.state });
                ui.viewId = v.id;
                render();
            }
            return true;
        }
        case "del-view":
            e.stopPropagation();
            changeMeta("Delete view", "views", vs => vs.filter(v => v.id !== k));
            if (ui.viewId === k) ui.viewId = null;
            return true;
        case "go-settings":
            // Settings is a page: a dialog left open would sit over it (Keyboard shortcuts' "Change them")
            if (m) closeModal();
            goSettings(k);
            return true;
        case "side-alltags":
            meta.layout.side.allTags = !meta.layout.side.allTags;
            markDirty();
            renderSide();
            return true;
        case "view":
            setView(k || "");
            return true;
        case "f-status":
            ui.status = k || "";
            ui.viewId = null;
            savePrefs();
            renderMain();
            return true;
        case "lsort":
            curMode().sort = k;
            markDirty();
            renderMain();
            return true;
        case "search-all":
            ui.searchAll = true;
            renderMain();
            return true;
        case "search-clear": {
            ui.q = "";
            ui.searchAll = false;
            const q = $<HTMLInputElement>("#q");
            if (q) q.value = "";
            renderMain();
            return true;
        }
        case "save-view":
            openModal("saveview");
            return true;
        case "layout-view":
            meta.layout[t.dataset.key || ""] = k;
            markDirty();
            renderMain();
            return true;
        case "open": {
            if (
                e instanceof MouseEvent &&
                (e.metaKey || e.ctrlKey || e.shiftKey) &&
                !ui.selecting &&
                ui.page === "profile" &&
                ui.tab === "library" &&
                !t.closest("#overlay") &&
                !ui.arrange
            ) {
                ui.selecting = true;
                ui.sel.clear();
            }
            if (ui.selecting && ui.tab === "library" && !t.closest("#overlay")) {
                const sid = id || "",
                    i = listOrder.indexOf(sid);
                if (e instanceof MouseEvent && e.shiftKey && lastSelIdx >= 0 && i >= 0) {
                    const [a, b] = [Math.min(i, lastSelIdx), Math.max(i, lastSelIdx)];
                    for (const x of listOrder.slice(a, b + 1)) ui.sel.add(x);
                } else if (ui.sel.has(sid)) ui.sel.delete(sid);
                else ui.sel.add(sid);
                lastSelIdx = i;
                renderMain();
                return true;
            }
            const seq = seqFrom(t);
            if (m && m.kind !== "item") closeModal();
            openItem(id || "", seq);
            return true;
        }
        case "open-add":
            if (m) closeModal();
            openAdd({ medium: t.dataset.medium, private: !!t.dataset.private });
            return true;
        case "open-discover":
            openDiscover();
            return true;
        case "open-pick":
            openModal("pick");
            return true;
        case "open-io":
            openModal("io");
            return true;
        case "open-settings":
            goSettings();
            return true;
        case "open-keys":
            openModal("keys");
            return true;
        case "open-covers":
            openModal("covers");
            return true;
        case "open-palette":
            focusSearch();
            return true;
        case "open-paste":
            openModal("paste", { medium: k || addDefaults().medium });
            return true;
        case "open-char":
            openModal("char", { id: k });
            return true;
        case "open-person":
            openModal("person", { name: k });
            return true;
        case "open-franchise":
            // a franchise opens in Stats › Franchises (it went to a "franchises" tab, long gone, which fell back to the
            // mode's first tab)
            Object.assign(ui, { page: "profile", tab: "stats", statsView: "franchises", franchise: k || null });
            render();
            window.scrollTo(0, 0);
            return true;
        case "close":
            if (m && m.back) {
                const b = m.back;
                ui.modal = null;
                openModal(b.kind, b);
            } else closeModal();
            return true;
        case "stop":
            if (m && m.ctl) m.ctl.abort();
            return true;
        // a new device: straight to your account, where signing in brings your library (Account & sync switches on)
        case "welcome-signin":
            meta.settings.welcomed3 = true;
            meta.settings.builtins = { ...(meta.settings.builtins || {}), account: true };
            markDirty();
            closeModal();
            goSettings("account");
            return true;
        case "welcome-al":
            meta.settings.welcomed3 = true;
            markDirty();
            openModal("anilist");
            runAniListSync();
            return true;
    }
    return false;
}
