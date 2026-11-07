// src/features/core/navigation.js
// ─────────────────────────────────────────────────────────────────
//  Navigation: modes, profile tabs, settings
// ─────────────────────────────────────────────────────────────────

function savePrefs() {
    try {
        localStorage.setItem("univerlist-ui", JSON.stringify({ mode: ui.mode }));
    } catch (_) {}
}
function resetSub() {
    ui.filt = FILT_EMPTY();
    ui.filterOpen = false;
    ui.blocksEdit = false;
    ui.blockAdd = false;
    ui.shelfKey = null;
    ui.kind = null;
    ui.genre = null;
    ui.tag = null;
    ui.viewId = null;
    ui.listId = null;
    ui.tierId = null;
    ui.tierSel = null;
    ui.franchise = null;
    ui.selecting = false;
    ui.sel.clear();
    ui.confirmListDel = false;
    ui.arrange = false;
    ui.pop = null;
    ui.status = "all";
    ui.q = "";
}
function setMode(id, { stay = false } = {}) {
    if (!allModes().some(m => m.id === id)) return;
    const changed = ui.mode !== id;
    ui.mode = id;
    ui.modeMenu = false;
    if (changed) {
        resetSub();
        rankState.pair = null;
        ui.searchAll = false;
        ui.tab = tabOnEnter(id);
    }
    if (!stay) ui.page = "profile";
    ui.previewTheme = null;
    ui.hiddenView = false;
    document.documentElement.classList.add("modewash");
    setTimeout(() => document.documentElement.classList.remove("modewash"), 420);
    applyTheme();
    savePrefs();
    render();
    if (!stay) window.scrollTo(0, 0);
}
function cycleMode(d) {
    const M = allModes(),
        i = M.findIndex(m => m.id === ui.mode);
    setMode(M[(i + d + M.length) % M.length].id);
}
function goTab(k) {
    ui.page = "profile";
    if (ui.tab === k && k === "lists") {
        ui.listId = null;
        ui.tquick = null;
        tierSel.clear();
    }
    if (ui.tab !== k) {
        ui.listId = null;
        ui.tierId = null;
        ui.franchise = null;
        ui.selecting = false;
        ui.sel.clear();
    }
    ui.tab = k;
    render();
    window.scrollTo(0, 0);
}
function goLib(p = {}) {
    ui.page = "profile";
    ui.tab = "library";
    ui.modeMenu = false;
    ui.filt = FILT_EMPTY();
    if (p.genre) ui.filt.genres = [p.genre];
    if (p.tag) ui.filt.tags = [p.tag];
    if (p.kind) ui.filt.kinds = [p.kind];
    if (p.filt) ui.filt = { ...ui.filt, ...p.filt };
    const q = { ...p };
    delete q.genre;
    delete q.tag;
    delete q.kind;
    delete q.filt;
    Object.assign(ui, { shelfKey: null, status: "all", viewId: null }, q);
    render();
    window.scrollTo(0, 0);
}
function goStats(k) {
    ui.page = "profile";
    ui.tab = "stats";
    ui.statsView = k;
    ui.franchise = null;
    render();
    window.scrollTo(0, 0);
}
const goShelf = key => goLib({ shelfKey: key || null });
function goList(id) {
    ui.page = "profile";
    ui.tab = "lists";
    ui.listId = id || null;
    ui.confirmListDel = false;
    ui.vaultErr = "";
    render();
    window.scrollTo(0, 0);
}
// Settings remembers exactly where you were (Watch, Read, a mode's tab, how far down) and Escape, ✕ or the logo take you back there
function closeSettings() {
    const f = ui.settingsFrom || { page: "profile" };
    ui.page = f.page || "profile";
    ui.setQ = "";
    ui.keyCapture = null;
    render();
    requestAnimationFrame(() => window.scrollTo(0, f.y || 0));
    // opened from the player: it comes back where it was, paused at the same moment
    if (f.player && ui.page === "watch" && !W.player) {
        W.player = f.player;
        f.player = null;
        renderPlayer();
    }
}
function goSettings(sec) {
    // the player and the reader sit over everything: step out of them first (your place is kept), so Settings isn't hidden underneath
    let player = null;
    if (W.player) {
        const v = $("#cinema video");
        if (v && W.lastKey) savePos(W.lastKey, (W.player.offset || 0) + v.currentTime);
        if (v) W.player.keepAt = Math.max((W.player.offset || 0) + v.currentTime, 0.01);
        player = W.player;
        W.player = null;
        renderPlayer();
        if (W.show) W.view = "show";
    }
    if (typeof RD !== "undefined" && (RD.pages || RD.chapters)) {
        RD.pages = null;
        RD.chapters = null;
        renderReader();
    }
    if (ui.page !== "settings") ui.settingsFrom = { page: ui.page, y: window.scrollY, player };
    ui.page = "settings";
    ui.keyCapture = null;
    if (sec) ui.setSec = sec;
    ui.confirmReset = false;
    ui.confirmModeDel = false;
    render();
    window.scrollTo(0, 0);
    // a section that shows what's on the server (Account & sync) checks again, even if it was already open
    document.dispatchEvent(new CustomEvent("ul:settings-open", { detail: ui.setSec }));
}
function setView(v) {
    v = VIEW_ALIAS[v] || v;
    curMode().view = v;
    ui.arrange = ui.arrange && v !== "list";
    markDirty();
    if (ui.page !== "profile" || ui.tab !== "library") {
        ui.page = "profile";
        ui.tab = "library";
    }
    render();
}
function toggleSide(force) {
    const s = meta.layout.side;
    s.pinned = force ?? !s.pinned;
    $("#app").classList.remove("side-peek");
    markDirty();
    renderSide();
}
function peekSide(on) {
    if (meta.layout.side.pinned) return;
    $("#app").classList.toggle("side-peek", on);
}
async function togglePrivate() {
    ui.modeMenu = false;
    if (ui.private) {
        ui.private = false;
        if (ui.mode === SEALED_MODE.id) {
            ui.mode = "universal";
            applyTheme();
        }
        resetSub();
        render();
        toast("Back in your main library");
        return;
    }
    if (!meta.vault) {
        goSettings("privacy");
        return;
    }
    if (!vault.key) {
        openModal("unlock", {});
        renderTop();
        return;
    }
    ui.private = true;
    sweepSealed();
    resetSub();
    ui.page = "profile";
    render();
    toast("In your private collection. Everything here stays encrypted.");
}
function applyDensity() {
    const r = document.documentElement;
    if (meta.settings.density === "compact") r.dataset.density = "compact";
    else delete r.dataset.density;
}
function render() {
    stateChanged("ui");
    document.title = meta.settings.appName || "UniverList";
    if (!stageOn() && (ui.page === "watch" || ui.page === "read")) ui.page = "profile";
    renderSide();
    renderMain();
    if (ui.modal) renderOverlay();
}
afterChange = () => {
    stateChanged("ui");
    renderSide();
    if (!mainTyping()) renderMain();
    if (ui.modal && !overlayTyping() && !ui.modal.editing) renderOverlay();
};
function mainTyping() {
    const a = document.activeElement;
    return (
        a &&
        $("#main").contains(a) &&
        (/TEXTAREA/.test(a.tagName) ||
            (a.tagName === "INPUT" && !["checkbox", "radio", "range", "color"].includes(a.type)) ||
            (a.classList && a.classList.contains("h2in")))
    );
}
function openAdd(o = {}) {
    const d = addDefaults();
    openModal("add", {
        step: "search",
        medium: o.medium || d.medium,
        ikind: o.medium ? "" : d.kind,
        private: !!o.private,
    });
}
function openDiscover() {
    const mode = curMode(),
        has = p => (mode.match || []).some(x => x === "*" || x.replace("!", "").startsWith(p));
    const m =
        mode.id === "universal"
            ? "versions"
            : has("book") && !has("anime")
              ? "books"
              : has("anime") || has("manga")
                ? "fans"
                : has("game")
                  ? "games"
                  : has("tv") || has("film")
                    ? "screen"
                    : "versions";
    openModal("discover", { mode: m, shelf: (mode.match || []).includes("book:Academic") ? "academic" : "fiction" });
}
const titleKey = s => String(s || "").replace(/ · [^·]+$/, "");
function idFromOption(v) {
    const t = titleKey(v).trim(),
        m = (/ · ([^·]+)$/.exec(v) || [])[1];
    const med = m && MEDIA_KEYS.find(k => MEDIA[k].one === m.trim());
    for (const [id, b] of items) if (titleOf(b) === t && (!med || b.medium === med)) return id;
    return null;
}
