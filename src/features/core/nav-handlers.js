// src/features/core/nav-handlers.js
// ─────────────────────────────────────────────────────────────────
//  Getting around: what its buttons do
//
//  Modes, the sidebar, pages and tabs, search, opening dialogs, the welcome screen and the command palette.
//  core/actions.js calls navClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function navClick(e, t, act, k, id, m) {
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
            const i = C.indexOf(k);
            i < 0 ? C.push(k) : C.splice(i, 1);
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
            if (window.innerWidth < 860) $("#app").classList.toggle("side-peek");
            else toggleSide();
            return true;
        case "seasonal-add":
            await addFromAniList(Number(k), null, "want");
            renderMain();
            return true;
        case "mode":
            if (t.dataset.stay) {
                ui.mode = k;
                applyTheme();
                savePrefs();
                render();
            } else setMode(k);
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
        case "mode-menu": {
            ui.modeMenu = !ui.modeMenu;
            const pm = t.closest(".modepick");
            $$(".modemenu").forEach(x => x.remove());
            if (pm && ui.modeMenu) pm.insertAdjacentHTML("beforeend", modeMenuHTML(curMode()));
            t.setAttribute("aria-expanded", String(ui.modeMenu));
            return true;
        }
        case "private-toggle":
            togglePrivate();
            return true;
        case "side-pin":
            toggleSide();
            return true;
        case "side-text":
            meta.layout.side.text = k;
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
            if (!tabsFor().includes(k)) {
                const md = meta.modes.find(x => tabsFor(x).includes(k));
                if (md) setMode(md.id);
            }
            goTab(k);
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
            goSettings(k);
            return true;
        case "side-alltags":
            meta.layout.side.allTags = !meta.layout.side.allTags;
            markDirty();
            renderSide();
            return true;
        case "view":
            setView(k);
            return true;
        case "f-status":
            ui.status = k;
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
            const q = $("#q");
            if (q) q.value = "";
            renderMain();
            return true;
        }
        case "save-view":
            openModal("saveview");
            return true;
        case "sv-save": {
            const name = $("#sv-name").value.trim();
            if (!name) return true;
            const { mode, shelfKey, tag, kind, genre, status, copy, sort, group, view, q } = ui;
            const vid = "v" + Date.now().toString(36);
            changeMeta("Save view", "views", vs => [
                ...vs,
                { id: vid, name, state: { mode, shelfKey, tag, kind, genre, status, copy, sort, group, view, q } },
            ]);
            ui.viewId = vid;
            closeModal();
            toggleSide(true);
            toast("Saved to the sidebar");
            return true;
        }
        case "layout-view":
            meta.layout[t.dataset.key] = k;
            markDirty();
            renderMain();
            return true;
        case "open": {
            if (
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
                const i = listOrder.indexOf(id);
                if (e.shiftKey && lastSelIdx >= 0 && i >= 0) {
                    const [a, b] = [Math.min(i, lastSelIdx), Math.max(i, lastSelIdx)];
                    listOrder.slice(a, b + 1).forEach(x => ui.sel.add(x));
                } else ui.sel.has(id) ? ui.sel.delete(id) : ui.sel.add(id);
                lastSelIdx = i;
                renderMain();
                return true;
            }
            const seq = seqFrom(t);
            if (m && m.kind !== "item") closeModal();
            openItem(id, seq);
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
            ui.franchise = k || null;
            if (ui.tab !== "franchises") goTab("franchises");
            else {
                renderMain();
                window.scrollTo(0, 0);
            }
            return true;
        case "open-tier":
            ui.tierId = k || null;
            ui.tierSel = null;
            ui.tierQ = "";
            ui.confirmTierDel = false;
            renderMain();
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
        case "welcome-done": {
            const n = ($("#wl-name") || {}).value;
            meta.settings.welcomed3 = true;
            if (n && n.trim()) meta.profile.name = n.trim();
            markDirty();
            closeModal();
            render();
            return true;
        }
        case "welcome-import": {
            const n = ($("#wl-name") || {}).value;
            meta.settings.welcomed3 = true;
            if (n && n.trim()) meta.profile.name = n.trim();
            markDirty();
            closeModal();
            goSettings("io");
            return true;
        }
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
        case "pal-run":
            runPalette(Number(k));
            return true;
    }
    return false;
}
