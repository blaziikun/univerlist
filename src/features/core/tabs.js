// src/features/core/tabs.js
// ─────────────────────────────────────────────────────────────────
//  Tabs, mode by mode: add, remove and reorder them where they are, choose the one each mode opens on
//
//  A mode's tabs live on the mode (mode.tabs, in order). A mode saved before that keeps the arrangement it had until you
//  change it here.
// ─────────────────────────────────────────────────────────────────

const ALL_TABS = () => [...DEFAULT_TABS, ...EXTRA_TABS].filter(k => TAB_NAME[k]);
function tabsFor(mode = curMode()) {
    if (Array.isArray(mode.tabs) && mode.tabs.length) {
        const T = mode.tabs.filter(k => TAB_NAME[k]);
        if (T.length) return T;
    }
    return defaultTabsFor(mode);
}
const tabsOwn = md => {
    if (!Array.isArray(md.tabs) || !md.tabs.length) md.tabs = defaultTabsFor(md);
    return md.tabs;
};
function tabEditHTML() {
    const md = curMode(),
        on = tabsFor(md),
        off = ALL_TABS().filter(k => !on.includes(k)),
        home = md.homeTab && on.includes(md.homeTab) ? md.homeTab : "";
    const row = (
        k,
        i
    ) => `<div class="tedrow" draggable="true" data-tedk="${k}"><span class="tgrip" aria-hidden="true">⋮⋮</span><label class="ctl"><input type="checkbox" data-tabon="${k}" checked> ${esc(TAB_NAME[k])}</label>
    <button class="tst${home === k ? " on" : ""}" data-act="tab-home" data-k="${k}" title="${home === k ? "Opens here" : "Open " + esc(md.name) + " on this tab"}" aria-pressed="${home === k}">★</button>
    <button class="cb" data-act="tab-move" data-k="${k}" data-d="-1" ${i ? "" : "disabled"} aria-label="Earlier">↑</button><button class="cb" data-act="tab-move" data-k="${k}" data-d="1" ${i < on.length - 1 ? "" : "disabled"} aria-label="Later">↓</button></div>`;
    return `<div class="ctx-h"><b>Tabs in ${esc(md.name)}</b><small>Drag to reorder · ★ opens here</small></div><div class="tedit">${on.map(row).join("")}
    ${off.length ? `<p class="ilab">Add</p>${off.map(k => `<label class="ctl tedoff"><input type="checkbox" data-tabon="${k}"> ${esc(TAB_NAME[k])}</label>`).join("")}` : ""}
    <p class="hint">${home ? `${esc(md.name)} opens on ${esc(TAB_NAME[home])}` : `${esc(md.name)} opens where you left it`}. <button class="linkbtn" data-act="tab-home" data-k="">${home ? "Open where I left it instead" : ""}</button></p></div>`;
}
function tabsSet(md, T, label) {
    const before = md.tabs ? [...md.tabs] : null;
    md.tabs = T;
    if (!T.includes(ui.tab)) ui.tab = T[0];
    modeChanged();
    refreshCtx();
    if (label)
        toast(label, {
            label: "Undo",
            fn: () => {
                md.tabs = before;
                modeChanged();
                refreshCtx();
            },
        });
}
function tabsClick(act, t, k) {
    const md = curMode();
    if (act === "tab-edit") {
        const r = t.getBoundingClientRect();
        openMenuAt(r.right - 300, r.bottom + 6, tabEditHTML);
        return true;
    }
    if (act === "tab-move") {
        const T = [...tabsOwn(md)],
            i = T.indexOf(k),
            j = i + Number(t.dataset.d);
        if (i < 0 || j < 0 || j >= T.length) return true;
        [T[i], T[j]] = [T[j], T[i]];
        tabsSet(md, T);
        return true;
    }
    if (act === "tab-home") {
        md.homeTab = k || undefined;
        markDirty();
        refreshCtx();
        return true;
    }
    if (act === "tab-hide") {
        const T = tabsOwn(md);
        if (T.length <= 1) return true;
        closeCtx();
        tabsSet(
            md,
            T.filter(x => x !== k),
            `Hid ${TAB_NAME[k]} in ${md.name}`
        );
        return true;
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.tabon) return;
    const md = curMode(),
        k = t.dataset.tabon,
        T = [...tabsOwn(md)];
    if (t.checked) {
        if (!T.includes(k)) T.push(k);
        tabsSet(md, T);
    } else {
        if (T.length <= 1) {
            t.checked = true;
            return;
        }
        tabsSet(
            md,
            T.filter(x => x !== k)
        );
    }
});
// drag a tab along the bar, or a row in the editor, to put it somewhere else
let tabDrag = null;
document.addEventListener("dragstart", e => {
    const el = e.target.closest && e.target.closest('.ptabs [data-act="tab"], .tedrow');
    if (!el) return;
    tabDrag = el.dataset.k || el.dataset.tedk;
    e.dataTransfer.effectAllowed = "move";
    try {
        e.dataTransfer.setData("text/plain", tabDrag);
    } catch (_) {}
});
document.addEventListener("dragover", e => {
    if (!tabDrag) return;
    const el = e.target.closest && e.target.closest('.ptabs [data-act="tab"], .tedrow');
    if (!el) return;
    e.preventDefault();
    $$(".tabins-a, .tabins-b").forEach(x => x.classList.remove("tabins-a", "tabins-b"));
    const r = el.getBoundingClientRect(),
        row = el.classList.contains("tedrow"),
        after = row ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    el.classList.add(after ? "tabins-a" : "tabins-b");
});
document.addEventListener("drop", e => {
    if (!tabDrag) return;
    const el = e.target.closest && e.target.closest('.ptabs [data-act="tab"], .tedrow');
    const from = tabDrag;
    tabDrag = null;
    const after = el && el.classList.contains("tabins-a");
    $$(".tabins-a, .tabins-b").forEach(x => x.classList.remove("tabins-a", "tabins-b"));
    if (!el) return;
    e.preventDefault();
    const to = el.dataset.k || el.dataset.tedk;
    if (to === from) return;
    const md = curMode(),
        T = tabsOwn(md).filter(x => x !== from);
    T.splice(T.indexOf(to) + (after ? 1 : 0), 0, from);
    tabsSet(md, T);
});
document.addEventListener("dragend", () => {
    tabDrag = null;
    $$(".tabins-a, .tabins-b").forEach(x => x.classList.remove("tabins-a", "tabins-b"));
});
// each mode remembers its tab: Hub on Overview, Culture on Stats, and back to Stats when you return to Culture
function tabOnEnter(id) {
    const md = modeById(id) || curMode(),
        T = tabsFor(md),
        last = (meta.settings.lastTabs || {})[id],
        home = md.homeTab;
    const pick = meta.settings.modeOpens === "home" ? home || last : last || home;
    return T.includes(pick) ? pick : T.includes(ui.tab) && !last && !home ? ui.tab : T[0];
}
function tabRemember() {
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
function placeRestore() {
    let P = null;
    try {
        P = JSON.parse(sessionStorage.getItem("ul-place") || "null");
    } catch (_) {}
    if (!P || !meta.modes.some(x => x.id === P.mode)) return false;
    ui.mode = P.mode;
    ui.page = ["profile", "settings", "watch", "read", "features"].includes(P.page) ? P.page : "profile";
    ui.tab = tabsFor(curMode()).includes(P.tab) ? P.tab : tabOnEnter(P.mode);
    for (const k of ["setSec", "statsView", "listId", "learnSub", "uniSub"]) if (P[k] != null) ui[k] = P[k];
    placeRestore.y = P.y || 0;
    placeRestore.item = P.item && items.has(P.item) ? P.item : null;
    return true;
}
addEventListener("beforeunload", placeSave);
addEventListener("pagehide", placeSave);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") placeSave();
});
document.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset && t.dataset.gameboxes) {
        meta.settings.gameBoxes = t.checked;
        markDirty();
        renderMain();
    }
});
