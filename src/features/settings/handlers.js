// src/features/settings/handlers.js
// ─────────────────────────────────────────────────────────────────
//  Settings: what its buttons do
//
//  Themes, modes and shelves, layout, keys, and starting over. core/actions.js calls settingsClick() for every button
//  with a data-act; it returns true when the button is one of these. e is the click, t the button, k and id its data-k
//  and data-id, and m the dialog that's open (if any).
//
//  Edits to modes and themes apply straight away. Themes are shared: editing one changes every mode that uses it.
// ─────────────────────────────────────────────────────────────────

const themeTarget = () => (ui.page === "settings" && ui.setSec === "themes" ? editThemeId() : curMode().theme);
function setThemeVal(k, v) {
    const tid = themeTarget();
    meta.themes[tid] = { ...(meta.themes[tid] || {}), [k]: v };
    applyTheme(resolveTheme(tid));
    markDirty();
}
const editingMode = () =>
    modeById(ui.editMode && meta.modes.some(m => m.id === ui.editMode) ? ui.editMode : curMode().id);
// the patterns for one of a mode's automatic shelves (by type or medium): what's on it now, as medium:type
function modePatsForShelf(mode, s) {
    const P = new Set();
    for (const b of items.values()) if (inMode(b, mode) && s.test(b)) P.add(b.medium + ":" + (b.kind || ""));
    return [...P];
}
function modeChanged() {
    if (curMode() === SEALED_MODE) {
        vault.sealDue = true;
        scheduleSave();
    }
    markDirty();
    renderSide();
    renderMain();
}
function autoToCustom(mode) {
    const media = MEDIA_KEYS.filter(k => kindToggles(mode.match || ["*"], k).some(x => x[1]));
    return media.map(k => {
        const pats = (mode.match || []).filter(p => p.replace("!", "").split(":")[0] === k);
        return { name: MEDIA[k].name, match: pats.some(p => !p.startsWith("!")) ? pats : [k, ...pats] };
    });
}
function splitShelf(mode, i) {
    const s = mode.shelves[i],
        media = MEDIA_KEYS.filter(k => kindToggles(s.match, k).some(x => x[1]));
    let parts;
    if (media.length > 1)
        parts = media
            .map(k => ({
                name: MEDIA[k].name,
                match: s.match.filter(p => p.replace("!", "").split(":")[0] === k).length
                    ? s.match.filter(p => p.replace("!", "").split(":")[0] === k)
                    : [k],
            }))
            .map(p => ({
                ...p,
                match: p.match.some(x => !x.startsWith("!"))
                    ? p.match
                    : [p.match[0].replace("!", "").split(":")[0], ...p.match],
            }));
    else if (media.length === 1) {
        const k = media[0],
            on = kindToggles(s.match, k)
                .filter(x => x[1])
                .map(x => x[0]);
        const named = on.filter(Boolean);
        parts = named.map(kind => ({ name: kind, match: [k + ":" + kind] }));
        if (parts.length && on.includes("")) parts[0].match.push(k + ":");
    }
    if (!parts || parts.length < 2) {
        toast("Nothing to split: this shelf has one type.");
        return;
    }
    mode.shelves.splice(i, 1, ...parts);
    ui.shelfKey = null;
    modeChanged();
}

async function settingsClick(e, t, act, k, id, m) {
    switch (act) {
        case "theme-preview":
            ui.previewTheme = k;
            ui.editTheme = k;
            applyTheme(resolveTheme(k));
            renderMain();
            return true;
        case "theme-cancel":
            ui.previewTheme = null;
            ui.editTheme = null;
            applyTheme();
            renderMain();
            return true;
        case "theme-assign": {
            const md = modeById(k),
                tid = ui.previewTheme || editThemeId();
            md.theme = tid;
            ui.previewTheme = null;
            markDirty();
            applyTheme();
            renderSide();
            renderMain();
            toast(`${md.name} now uses ${resolveTheme(tid).name}`);
            return true;
        }
        case "theme-dup": {
            const src = ui.previewTheme || editThemeId(),
                nid = "t" + Date.now().toString(36);
            meta.themes[nid] = { ...clone(resolveTheme(src)), name: (resolveTheme(src).name || "Theme") + " copy" };
            delete meta.themes[nid].id;
            ui.editTheme = nid;
            ui.previewTheme = nid;
            applyTheme(resolveTheme(nid));
            markDirty();
            renderMain();
            toast("New theme. Change it below, then use it for a mode.");
            return true;
        }
        case "theme-del": {
            if (themeList().length < 2) return true;
            const name = resolveTheme(k).name,
                users = themesUsing(k),
                fallback = themeList().find(([x]) => x !== k)[0],
                before = clone(meta.themes[k]);
            for (const md of users) md.theme = fallback;
            delete meta.themes[k];
            if (ui.previewTheme === k) ui.previewTheme = null;
            if (ui.editTheme === k) ui.editTheme = null;
            markDirty();
            applyTheme();
            render();
            toast(
                `Deleted ${name}${users.length ? `; ${users.map(x => x.name).join(", ")} now use${users.length === 1 ? "s" : ""} ${resolveTheme(fallback).name}` : ""}`,
                {
                    label: "Undo",
                    fn: () => {
                        meta.themes[k] = before;
                        for (const md of users) md.theme = k;
                        markDirty();
                        applyTheme();
                        render();
                    },
                }
            );
            return true;
        }
        case "mode-extra": {
            const md = editingMode(),
                on = (EXTRA_TABS.includes(k) ? (md.extra || []).includes(k) : true) && !(md.offTabs || []).includes(k);
            if (on) {
                md.offTabs = [...new Set([...(md.offTabs || []), k])];
            } else {
                md.extra = [...new Set([...(md.extra || []), k])];
                md.offTabs = (md.offTabs || []).filter(x => x !== k);
            }
            modeChanged();
            return true;
        }
        case "erase":
            ui.confirmErase = true;
            renderMain();
            return true;
        case "erase-no":
            ui.confirmErase = false;
            renderMain();
            return true;
        case "erase-yes":
            eraseEverything();
            return true;
        case "set-close":
            closeSettings();
            return true;
        case "watch-order":
            meta.settings.watchOrder = k;
            markDirty();
            renderMain();
            return true;
        case "theme-edit":
            ui.editTheme = k;
            goSettings("themes");
            return true;
        case "set-favsplit":
            meta.layout.favSplit = k;
            markDirty();
            renderMain();
            return true;
        case "set-charsplit":
            meta.layout.charSplit = k;
            markDirty();
            renderMain();
            return true;
        case "set-status":
            setStatus(m.id, k);
            return true;
        case "set-kind": {
            const b = items.get(m.id);
            const kind = b.kind === k ? "" : k;
            patch(
                m.id,
                b.medium === "book"
                    ? {
                          kind,
                          shelf: kind === "Academic" ? "academic" : kind === "Non-fiction" ? "nonfiction" : "fiction",
                      }
                    : { kind },
                "Change type"
            );
            if (!inMode(items.get(m.id)))
                toast(`It's now outside ${curMode().name}; it shows in the modes that include ${kind || "it"}.`);
            return true;
        }
        case "set-copy":
            patch(m.id, { copy: k, toBuy: k === "none" ? items.get(m.id).toBuy : false }, "Change ownership");
            return true;
        case "set-logo":
            meta.settings.logo = k;
            markDirty();
            render();
            return true;
        case "set-amb":
            meta.settings.ambience = k;
            markDirty();
            ambApply();
            renderMain();
            return true;
        case "side-pos":
            meta.layout.side.pos = k;
            markDirty();
            renderSide();
            renderMain();
            return true;
        case "set-libview":
            meta.layout.libView = k;
            ui.view = null;
            markDirty();
            renderMain();
            return true;
        case "set-favview":
            meta.layout.favView = k;
            markDirty();
            renderMain();
            return true;
        case "set-charview":
            meta.layout.charView = k;
            markDirty();
            renderMain();
            return true;
        case "tab-move": {
            const T = meta.layout.tabs.filter(x => TAB_NAME[x.k]),
                i = T.findIndex(x => x.k === k),
                j = i + Number(t.dataset.d);
            if (i < 0 || j < 0 || j >= T.length) return true;
            [T[i], T[j]] = [T[j], T[i]];
            meta.layout.tabs = [...T, ...meta.layout.tabs.filter(x => !TAB_NAME[x.k])];
            markDirty();
            renderMain();
            return true;
        }
        case "layout-reset": {
            const open = meta.layout.side.open;
            meta.layout = { ...clone(DEFAULT_LAYOUT), side: { ...DEFAULT_LAYOUT.side, open } };
            ui.view = null;
            markDirty();
            render();
            toast("Layout reset");
            return true;
        }
        case "edit-mode":
            ui.editMode = k;
            ui.confirmModeDel = false;
            ui.openShelf = null;
            renderMain();
            return true;
        // your Hub profile in the modes you tick (their own picture, banner, name and bio go; undo brings them back)
        // split a mode: each ticked shelf becomes a mode of its own (same look) and leaves this one
        case "mode-split": {
            const src = editingMode(),
                sh = Array.isArray(src.shelves)
                    ? src.shelves
                    : shelvesOf(src).map(s => ({ name: s.name, match: [s.key.replace(/^a:/, "")] })),
                pick = $$("[data-splitmode]")
                    .filter(x => x.checked)
                    .map(x => +x.dataset.splitmode);
            if (!pick.length) {
                toast("Tick the shelves to split off.");
                return true;
            }
            const pats = i => (Array.isArray(src.shelves) ? sh[i].match : modePatsForShelf(src, shelvesOf(src)[i]));
            const before = clone(meta.modes);
            let at = meta.modes.indexOf(src);
            for (const i of pick) {
                const nid = "m" + Date.now().toString(36) + i,
                    P = pats(i).filter(p => !p.startsWith("!"));
                meta.modes.splice(++at, 0, {
                    ...clone(src),
                    id: nid,
                    name: sh[i].name,
                    g: sh[i].name.charAt(0),
                    match: P,
                    shelves: "kind",
                    profile: {},
                    blocks: undefined,
                    split: undefined,
                });
                src.match = [...(src.match || ["*"]), ...P.map(p => "!" + p)];
            }
            if (Array.isArray(src.shelves)) src.shelves = src.shelves.filter((_, i) => !pick.includes(i));
            modeChanged();
            renderSide();
            renderMain();
            toast(`Made ${plural(pick.length, "mode")}`, {
                label: "Undo",
                fn: () => {
                    meta.modes = before;
                    modeChanged();
                    render();
                },
            });
            return true;
        }
        case "mode-look-reset": {
            const md = editingMode(),
                d = DEFAULT_MODES.find(x => x.id === md.id);
            md.theme = d ? d.theme : "galaxy";
            delete md.vz;
            modeChanged();
            applyTheme();
            render();
            toast(`${md.name}'s look is back to how it came`);
            return true;
        }
        case "mode-new": {
            const nid = "m" + Date.now().toString(36);
            meta.modes.push({
                id: nid,
                name: "New mode",
                g: "✧",
                match: ["__none"],
                shelves: "kind",
                theme: "stacks",
                profile: {},
            });
            ui.editMode = nid;
            modeChanged();
            return true;
        }
        case "mode-dup": {
            const src = editingMode(),
                nid = "m" + Date.now().toString(36);
            meta.modes.splice(meta.modes.indexOf(src) + 1, 0, { ...clone(src), id: nid, name: src.name + " copy" });
            ui.editMode = nid;
            modeChanged();
            return true;
        }
        case "mode-move": {
            const md = editingMode(),
                i = meta.modes.indexOf(md),
                j = i + Number(k);
            if (j < 0 || j >= meta.modes.length) return true;
            [meta.modes[i], meta.modes[j]] = [meta.modes[j], meta.modes[i]];
            modeChanged();
            return true;
        }
        case "mode-del":
            ui.confirmModeDel = true;
            renderMain();
            return true;
        case "mode-del-no":
            ui.confirmModeDel = false;
            renderMain();
            return true;
        case "mode-del-yes": {
            const md = editingMode();
            if (md.id === "universal") return true;
            meta.modes = meta.modes.filter(x => x.id !== md.id);
            ui.confirmModeDel = false;
            ui.editMode = null;
            if (ui.mode === md.id) {
                ui.mode = "universal";
                applyTheme();
            }
            modeChanged();
            toast("Deleted the mode. Nothing in your library was removed.");
            return true;
        }
        case "mode-shelfmode": {
            const md = editingMode();
            md.shelves = k === "custom" ? (Array.isArray(md.shelves) ? md.shelves : autoToCustom(md)) : k;
            ui.shelfKey = null;
            modeChanged();
            return true;
        }
        case "shelf-add": {
            const md = editingMode();
            md.shelves.push({ name: "New shelf", match: ["__none"] });
            ui.openShelf = md.shelves.length - 1;
            modeChanged();
            return true;
        }
        case "shelf-del": {
            const md = editingMode();
            md.shelves.splice(Number(k), 1);
            ui.shelfKey = null;
            modeChanged();
            return true;
        }
        case "shelf-move": {
            const md = editingMode(),
                i = Number(k),
                j = i + Number(t.dataset.d);
            if (j < 0 || j >= md.shelves.length) return true;
            [md.shelves[i], md.shelves[j]] = [md.shelves[j], md.shelves[i]];
            ui.shelfKey = null;
            modeChanged();
            return true;
        }
        case "shelf-merge": {
            const md = editingMode(),
                i = Number(k),
                a = md.shelves[i],
                b = md.shelves[i + 1];
            if (!b) return true;
            const pos = [...new Set([...a.match, ...b.match].filter(p => !p.startsWith("!")))],
                neg = a.match.filter(p => p.startsWith("!") && b.match.includes(p));
            md.shelves.splice(i, 2, { name: a.name + " & " + b.name, match: [...pos, ...neg] });
            ui.shelfKey = null;
            modeChanged();
            return true;
        }
        case "shelf-split":
            splitShelf(editingMode(), Number(k));
            return true;
        case "theme-spine":
            setThemeVal("spine", k);
            renderMain();
            return true;
        case "theme-reset": {
            const tid = editThemeId();
            if (THEME_PRESETS[tid]) {
                meta.themes[tid] = clone(THEME_PRESETS[tid]);
                markDirty();
                applyTheme(resolveTheme(tid));
                renderMain();
            }
            return true;
        }
        case "modes-reset":
            meta.modes = clone(DEFAULT_MODES);
            meta.themes = { ...meta.themes, ...publicPresets() };
            ui.mode = "universal";
            ui.editMode = null;
            applyTheme();
            markDirty();
            render();
            toast("Modes are back to the defaults");
            return true;
        case "key-save": {
            const v = $("#key-" + k).value.trim();
            KEYS[k] = v;
            saveKeys();
            ui.keyState = { ...(ui.keyState || {}), [k]: "checking" };
            renderMain();
            const r = v ? await testKey(k) : null;
            ui.keyState[k] = r;
            renderMain();
            if (r === "ok" && (k === "igdb" || k === "rawg")) {
                toast(KEY_INFO[k][0] + " works", {
                    label: "Check my games",
                    fn: () => {
                        goSettings("data");
                        gamesUpdate();
                    },
                });
                if (k === "igdb") return true;
            }
            if (r === "ok") {
                toast(KEY_INFO[k][0] + " key works");
                for (const [iid, b] of items)
                    if ((k === "rawg" && b.medium === "game") || (k !== "rawg" && ["film", "tv"].includes(b.medium)))
                        quietPatch(iid, { scoresAt: null });
                scoreQ.stopped = false;
                scoreQ.start();
            }
            return true;
        }
        case "key-clear":
            KEYS[k] = "";
            saveKeys();
            if (ui.keyState) delete ui.keyState[k];
            renderMain();
            return true;
        case "remind-later":
            meta.settings.remindAfter = new Date(Date.now() + 7 * 864e5).toISOString();
            markDirty();
            renderMain();
            return true;
        case "reset":
            ui.confirmReset = true;
            renderMain();
            return true;
        case "reset-no":
            ui.confirmReset = false;
            renderMain();
            return true;
    }
    return false;
}
