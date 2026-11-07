// src/features/core/shell.js
// ─────────────────────────────────────────────────────────────────
//  Shell: who you are and which mode, one search for everything, a sidebar that toggles, pins and pushes
// ─────────────────────────────────────────────────────────────────

const ICON = {
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
};
// avatar: your picture, or your initial on the mode's colour
function avatarHTML(mp, size = 32, cls = "") {
    const src = mp.avatar ? coverCache.src(mp.avatar) : "";
    return src
        ? `<img class="av ${cls}" src="${esc(src)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer">`
        : `<span class="av ph ${cls}" style="width:${size}px;height:${size}px">${esc((mp.name || "?").trim().charAt(0).toUpperCase() || "?")}</span>`;
}
// every mode: a key to jump to it (customisable), its colour and its count
function modeMenuHTML(mode) {
    return `<div class="modemenu" role="menu">${allModes()
        .map(
            (x, i) =>
                `<button role="menuitem" data-act="mode" data-k="${esc(x.id)}" aria-current="${x.id === mode.id}" style="--mc:${resolveTheme(x.theme).accent}"><span class="mg">${esc(x.g || "•")}</span><span class="mn">${esc(x.name)}</span><span class="ct">${modeItems(x).length}</span>${keyFor("mode" + (i + 1)) ? `<kbd>${esc(keyLabel(keyFor("mode" + (i + 1))))}</kbd>` : ""}</button>`
        )
        .join("")}
    <div class="msep"></div>${stageOn() ? `<button role="menuitem" data-act="go-stage"><span class="mg">▶</span><span class="mn">Watch & read <span class="beta">beta</span></span></button>` : ""}
    <button role="menuitem" data-act="private-toggle"><span class="mg">${ui.private ? "↩" : "🔒"}</span><span class="mn">${ui.private ? "Leave the private collection" : "Private collection"}</span></button>
    <button role="menuitem" data-act="go-settings" data-k="modes"><span class="mg">✎</span><span class="mn">Edit modes</span></button></div>`;
}
// the bar is built once (so the search box keeps focus) and its two ends are redrawn
function renderTop() {
    const top = $("#top");
    if (!top.querySelector(".top"))
        top.innerHTML = `<div class="top"><div class="topl" id="top-l"></div><div class="topr" id="top-r"></div></div>`;
    // the search panel lives at the top of the page (outside the bar) so it can sit centred over a dimmed page
    if (!$("#gs")) {
        const g = document.createElement("div");
        g.className = "searchwrap";
        g.id = "gs";
        g.setAttribute("role", "dialog");
        g.setAttribute("aria-label", "Search");
        g.innerHTML = searchBoxHTML();
        document.body.append(g);
    }
    top.querySelector(".top").classList.toggle("priv", !!ui.private);
    top.classList.toggle("scrolled", scrollY > 40);
    const L = meta.layout.side,
        inSet = ui.page === "settings";
    const sbtn = `<button class="ib sidebtn" data-act="side-toggle" aria-label="Sidebar" aria-pressed="${!!L.pinned}" title="${L.pinned ? "Unpin the sidebar" : "Hover to peek, click to pin"} (${esc(keyLabel(keyFor("sidebar")))})">${ICON.side}</button>`,
        onRight = L.pos === "right";
    $("#top-l").innerHTML = `${onRight ? "" : sbtn}
    <button class="brand" data-act="go-mode" data-k="${esc(ui.mode)}" title="Overview">${logoHTML()}</button>${ui.private ? `<span class="privtag">private</span>` : ""}${stageSwitchHTML()}`;
    $("#top-r").innerHTML = `<button class="busy" id="busy" data-act="go-settings" data-k="data" hidden></button>
    <button class="ib" data-act="focus-search" title="Search (${esc(keyLabel(keyFor("search")))})" aria-label="Search">${ICON.search}</button>
    <button class="ib" data-act="open-discover" title="Insights (${esc(keyLabel(keyFor("discover")))})" aria-label="Insights">${ICON.spark}</button>
    <button class="ib" data-act="settings-toggle" aria-label="${inSet ? "Close settings" : "Settings"}" title="${inSet ? "Close settings" : "Settings (" + esc(keyLabel(keyFor("settings"))) + ")"}" aria-pressed="${inSet}">${inSet ? ICON.x : ICON.gear}</button>${onRight ? sbtn : ""}`;
    updateBusy();
}
addEventListener(
    "scroll",
    () => {
        const t = $("#top");
        if (t) t.classList.toggle("scrolled", scrollY > 40);
    },
    { passive: true }
);
function updateBusy() {
    const el = $("#busy");
    if (!el) return;
    const on = (auto.running && !auto.paused) || scoreQ.running || alSync.running || fileSync.state === "reconnect";
    el.hidden = !on;
    el.title =
        fileSync.state === "reconnect"
            ? "Your library file needs permission again"
            : alSync.running
              ? "Syncing AniList…"
              : auto.running
                ? `${auto.phase === "cache" ? "Saving pictures for offline" : "Finding artwork"} ${auto.done}/${auto.total} (click to see or stop)`
                : `Fetching scores ${scoreQ.done}/${scoreQ.total} (click to see or stop)`;
    el.classList.toggle("warn", fileSync.state === "reconnect");
}

// ── the sidebar: where you are, what you're in the middle of, and every shortcut ──
function renderSide() {
    const L = meta.layout.side,
        app = $("#app");
    app.dataset.side = L.pos;
    app.classList.toggle("side-open", !!L.pinned);
    app.style.setProperty("--side-w", L.width + "px");
    app.dataset.stext = L.text || "m";
    document.documentElement.dataset.private = ui.private ? "1" : "";
    renderTop();
    const mode = curMode(),
        M = modeItems(),
        sh = shelvesOf(),
        lib = ui.page === "profile" && ui.tab === "library";
    const st = {};
    for (const b of M) st[b.status] = (st[b.status] || 0) + 1;
    const lists = meta.lists.filter(l => listInMode(l) && !l.private === !ui.private);
    const active = M.filter(b => b.status === "active" || b.status === "redo")
        .sort((a, b) => String(b.lastAt || b.startedAt || "").localeCompare(String(a.lastAt || a.startedAt || "")))
        .slice(0, 4);
    const hiddenN = [...items.values()].filter(
        b => b.hidden && !!b.private === !!ui.private && (!isSealed(b) || ui.private)
    ).length;
    const hid = L.hide || SIDE_HIDE_DEFAULT,
        sec = (k, label, body, extra = "") =>
            hid.includes(k)
                ? ""
                : `<div class="sgroup${(L.closed || []).includes(k) ? " shut" : ""}"><button class="sl" data-act="side-sec" data-k="${k}"><span>${label}</span>${extra}<span class="chev">▾</span></button><div class="sbody">${body}</div></div>`;
    let h = `<div class="side-in"><div class="side-head"><button class="ib sidepin${L.pinned ? " on" : ""}" data-act="side-pin" title="${L.pinned ? "Unpin" : "Pin it open"} (${esc(keyLabel(keyFor("sidebar")))})" aria-pressed="${!!L.pinned}">${ICON.side}</button><span class="sh-mode">${esc(curMode().name)}${ui.private ? " · private" : ""}</span>${sideTextHTML(L)}</div>
    ${sec(
        "modes",
        "Modes",
        allModes()
            .map(
                (x, i) =>
                    `<button class="nb${x.id === mode.id && ui.page !== "watch" && ui.page !== "read" ? " on" : ""}" data-act="mode" data-k="${esc(x.id)}" style="--mc:${resolveTheme(x.theme).accent}"><span class="ic mgi">${esc(x.g || "•")}</span><span class="nl">${esc(x.name)}</span><span class="ct">${modeItems(x).length}</span></button>`
            )
            .join("") +
            `<div class="nsep" role="separator"></div>` +
            (stageOn()
                ? `<button class="nb${ui.page === "watch" || ui.page === "read" ? " on" : ""}" data-act="go-stage"><span class="ic mgi">▶</span><span class="nl">Watch & read <span class="beta">beta</span></span></button>`
                : "")
    )}
    ${sec(
        "lib",
        esc(mode.name),
        navBtn(
            "shelf",
            "Everything",
            "▤",
            lib && !ui.shelfKey && ui.status === "all" && !ui.hiddenView,
            M.length,
            'data-k=""'
        ) +
            (isUniversal()
                ? ""
                : sh
                      .map(s =>
                          navBtn(
                              "shelf",
                              s.name,
                              "",
                              lib && ui.shelfKey === s.key,
                              M.filter(b => s.test(b)).length,
                              `data-k="${esc(s.key)}"`,
                              "sub"
                          )
                      )
                      .join("")) +
            STATUS.filter(s => st[s])
                .map(s =>
                    navBtn(
                        "side-status",
                        STATUS_WORDS[groupWord()][s],
                        "",
                        lib && ui.status === s,
                        st[s],
                        `data-k="${s}"`,
                        "sub st-" + s
                    )
                )
                .join("")
    )}
    ${sec(
        "lists",
        "Lists",
        (ui.private
            ? ""
            : navBtn(
                  "go-list",
                  "Up next",
                  "⧗",
                  ui.tab === "lists" && ui.listId === "queue",
                  meta.queue.filter(id => items.has(id) && visible(items.get(id))).length || null,
                  'data-k="queue"'
              )) +
            lists
                .map(l =>
                    navBtn(
                        "go-list",
                        l.name,
                        l.numbered ? "№" : "≡",
                        ui.tab === "lists" && ui.listId === l.id,
                        l.ids.filter(id => items.has(id)).length,
                        `data-k="${esc(l.id)}"`
                    )
                )
                .join("") +
            `<button class="nb ghost" data-act="list-new"><span class="ic">+</span><span class="nl">New list</span></button>` +
            (hiddenN ? navBtn("hidden-view", "Hidden", "◌", ui.hiddenView, hiddenN, "") : "")
    )}`;
    const views = meta.views.filter(v => !v.state.mode || v.state.mode === mode.id);
    if (views.length)
        h += sec(
            "views",
            "Saved views",
            views
                .map(
                    v =>
                        `<button class="nb${ui.viewId === v.id ? " on" : ""}" data-act="go-view" data-k="${esc(v.id)}"><span class="ic">☆</span><span class="nl">${esc(v.name)}</span><span class="x" data-act="del-view" data-k="${esc(v.id)}" role="button" aria-label="Delete view">✕</span></button>`
                )
                .join("")
        );
    h += sec(
        "do",
        "Quick",
        `<button class="nb" data-act="focus-search"><span class="ic">+</span><span class="nl">Add something</span><kbd>${esc(keyLabel(keyFor("add")))}</kbd></button><button class="nb" data-act="open-pick"><span class="ic">⚄</span><span class="nl">Pick for me</span><kbd>${esc(keyLabel(keyFor("pick")))}</kbd></button>
    ${hid.includes("io") ? "" : `<button class="nb" data-act="go-settings" data-k="io"><span class="ic">⇅</span><span class="nl">Import or export</span></button>`}<button class="nb" data-act="go-features"><span class="ic">✦</span><span class="nl">Guide</span></button>`
    );
    if (!hid.includes("private"))
        h += `<div class="sdiv"></div><button class="nb" data-act="private-toggle"><span class="ic">${ui.private ? "↩" : "🔒"}</span><span class="nl">${ui.private ? "Leave private" : "Private collection"}</span></button>`;
    h += `<span class="sfill"></span><div class="sfoot2" id="sidestatus"></div></div><div class="side-grip" title="Drag to resize"></div>`;
    $("#side").innerHTML = h;
    renderSideStatus();
}
// sidebar text size: three steps, remembered with the layout
const SIDE_TEXT = [
    ["s", "Small"],
    ["m", "Medium"],
    ["l", "Large"],
];
function sideTextHTML(L) {
    const cur = L.text || "m";
    return `<span class="stext" role="group" aria-label="Sidebar text size">${SIDE_TEXT.map(([k, n]) => `<button class="st-${k}${cur === k ? " on" : ""}" data-act="side-text" data-k="${k}" title="${n} text" aria-pressed="${cur === k}">A</button>`).join("")}</span>`;
}
function navBtn(act, label, ic, on, ct, extra = "", cls = "") {
    return `<button class="nb ${cls}${on ? " on" : ""}" data-act="${act}" ${extra}><span class="ic">${ic}</span><span class="nl">${esc(label)}</span>${ct != null ? `<span class="ct">${ct}</span>` : ""}</button>`;
}
// the sidebar's footer: only what needs saying (not saving, offline, a file to reconnect), shortcuts, and what the sidebar shows
const SIDE_SECS = [
    ["modes", "Modes"],
    ["lib", "This mode's shelves"],
    ["lists", "Lists"],
    ["views", "Saved views"],
    ["do", "Quick actions"],
    ["io", "Import or export"],
    ["private", "Private collection"],
];
const SIDE_HIDE_DEFAULT = ["io"];
function renderSideStatus() {
    const el = $("#sidestatus");
    if (!el) return;
    const warn = storage !== "idb" && storage !== "local" ? "Not saving: export a backup" : "";
    const f =
        fileSync.handle && fileSync.state === "reconnect"
            ? `<button class="linkbtn" data-act="file-reconnect">Reconnect ${esc(fileSync.handle.name)}</button>`
            : fileSync.handle && fileSync.state !== "on"
              ? "Library file error"
              : "";
    const hid = meta.layout.side.hide || SIDE_HIDE_DEFAULT;
    el.innerHTML = `${warn || f || !navigator.onLine ? `<p class="swarn">${[warn, f, navigator.onLine ? "" : "Offline"].filter(Boolean).join(" · ")}</p>` : ""}
    <div class="sfrow"><button class="sfl" data-act="go-settings" data-k="keys">Shortcuts</button><span class="pop"><button class="sfl" data-act="pop" data-k="sidecust" aria-expanded="${ui.pop === "sidecust"}">Customise</button>${
        ui.pop === "sidecust"
            ? `<div class="popbody up">
      <p class="label">Show in the sidebar</p>${SIDE_SECS.map(([k, l]) => `<label class="ctl"><input type="checkbox" data-sidesec="${k}" ${hid.includes(k) ? "" : "checked"}> ${l}</label>`).join("")}</div>`
            : ""
    }</span></div>`;
    updateBusy();
}
const listInMode = l => !l.mode || l.mode === curMode().id || isUniversal();
function statusPanelHTML() {
    const s = meta.settings,
        days = s.lastBackup ? Math.floor((Date.now() - Date.parse(s.lastBackup)) / 864e5) : null;
    return `<div class="banner" id="covstat" hidden></div><div class="banner" id="alstat" hidden></div>
    ${fileSync.state === "reconnect" ? `<div class="banner"><span class="b-ic">⇅</span> Your library file ${esc(fileSync.handle.name)} needs permission again. <button class="btn sm gold" data-act="file-reconnect">Reconnect</button></div>` : ""}
    <p class="hint">${!navigator.onLine ? "You're offline. Everything works; new artwork and scores wait until you're back and you press Refresh. " : ""}${days == null ? "No backup yet." : `Last backup ${days ? days + " days ago" : "today"}.`}</p>`;
}

// ── tabs: the same core in every mode, plus what that mode is for ──
const TAB_NAME = {
    overview: "Overview",
    library: "Library",
    favourites: "Favourites",
    stats: "Stats",
    lists: "Lists",
    discover: "Insights",
    rank: "Rank",
    seasonal: "This season",
    series: "Series",
    quotes: "Quotes",
    diary: "Diary",
    playing: "Playing",
    learn: "Courses",
    paths: "Pathways",
    curricula: "Curricula",
};
const EXTRA_TABS = ["seasonal", "series", "quotes", "diary", "playing", "learn", "paths", "curricula"];
// the tabs a mode shows when it has no list of its own (core/tabs.js keeps each mode's own list)
function defaultTabsFor(mode) {
    const base = meta.layout.tabs
        .filter(
            t =>
                TAB_NAME[t.k] &&
                !EXTRA_TABS.includes(t.k) &&
                (t.on || t.k === ui.tab) &&
                !(mode.offTabs || []).includes(t.k)
        )
        .map(t => t.k);
    const ex = (mode.extra || []).filter(k => EXTRA_TABS.includes(k) && !(mode.offTabs || []).includes(k));
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
const TAB_BODY = () => ({
    overview: overviewHTML,
    library: libraryHTML,
    favourites: favouritesHTML,
    stats: statsPageHTML,
    lists: listsHTML,
    rank: rankHTML,
    discover: insightsHTML,
    seasonal: seasonalHTML,
    series: seriesHTML,
    quotes: quotesHTML,
    diary: diaryHTML,
    playing: playingHTML,
    paths: pathsHTML,
    learn: learnHTML,
    curricula: curriculaHTML,
});
let listOrder = [];
// the pages Svelte draws (core/pages.ts lists the same ones); renderMain hands them over instead of drawing them
const SVELTE_PAGES = ["settings", "features"];
function renderMain() {
    // the Watch page behind an open player can't be seen: drawing it (367 episodes, say) mid-episode only risks a stutter, so it waits until the player closes
    if (ui.page === "watch" && W.player && document.getElementById("cinema")) {
        W.pageStale = true;
        return;
    }
    W.pageStale = false;
    stateChanged("ui"); // the Svelte parts (Settings) update themselves from the store
    buildCallNumbers();
    if (typeof stageThemeApply === "function") stageThemeApply();
    let html;
    if (SVELTE_PAGES.includes(ui.page))
        html = null; // a Svelte page (core/pages.ts): it draws itself
    else if (ui.page === "watch") html = watchPageHTML();
    else if (ui.page === "read") html = readPageHTML();
    else {
        const tabs = tabsFor();
        if (!tabs.includes(ui.tab)) ui.tab = tabs[0] || "overview";
        html =
            profileHeadHTML(tabs) +
            `<div class="tabbody t-${ui.tab}">${ui.hiddenView ? `<div class="note"><span class="b-ic">◌</span> Hidden: these are left out of every list, stat and overview. <button class="linkbtn" data-act="hidden-view">Back to everything</button></div>` : ""}${(TAB_BODY()[ui.tab] || overviewHTML)()}</div>`;
    }
    // the same page redrawn keeps its place and doesn't replay the entrance; a new page or tab fades in
    const main = $("#main"),
        sig = [ui.page, ui.tab, ui.mode, !!ui.private].join("|"),
        same = sig === renderMain.sig,
        y = scrollY;
    // a redraw from background work (covers arriving, a sync) keeps the cursor in the box you're typing in
    const fa = document.activeElement,
        fid = same && fa && fa.id && main.contains(fa) && /INPUT|TEXTAREA/.test(fa.tagName) ? fa.id : "",
        fsel = fid ? [fa.selectionStart, fa.selectionEnd] : null;
    if (html == null) {
        if (window.ulPages) ulPages.show(ui.page, main);
        else main.innerHTML = `<p class="hint">Opening…</p>`; // main.ts hasn't started yet: it redraws once it has
    } else {
        if (window.ulPages) ulPages.hide();
        main.innerHTML = html;
    }
    renderMain.sig = sig;
    if (fid) {
        const n = document.getElementById(fid);
        if (n && n !== document.activeElement) {
            n.focus({ preventScroll: true });
            try {
                n.setSelectionRange(...fsel);
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
    renderBulk();
    afterRender();
    if (typeof tabRemember === "function") tabRemember();
}
// work that needs the page on screen: whole rows of favourites, the rest of a long library, the search filter in settings
const afterRenderHooks = [];
function afterRender() {
    for (const f of afterRenderHooks)
        try {
            f();
        } catch (e) {
            console.warn(e);
        }
}

// ── profile header: a full-width banner, your picture and name, the mode underneath ──
function modeProfile(mode = curMode()) {
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
const profileBanner = (mode = curMode()) => modeProfile(mode).banner;
function profileHeadHTML(tabs) {
    const mode = curMode(),
        mp = modeProfile(mode),
        banner = ui.private && !mode.sealedOnly ? "" : profileBanner(mode);
    return `<div class="prof">
    <div class="pbanner${banner ? "" : " none"}" style="${banner ? `background-image:url('${esc(coverCache.src(banner)).replace(/'/g, "%27")}')` : ""}"><div class="pshade"></div>
      <div class="phead"><button class="pavedit" data-act="profile-edit" data-k="${esc(mode.id)}" title="Change picture, banner and bio" aria-label="Edit profile">${avatarHTML(mp, 96, "avatar")}<span class="pencil" aria-hidden="true">✎</span></button>
        <div class="pname"><h2>${mp.name ? esc(mp.name) : `<button class="linkbtn addname" data-act="profile-edit" data-k="${esc(mode.id)}">Add your name</button>`}</h2>
          <div class="modepick pmode"><button class="modebtn pmodebtn" data-act="mode-menu" aria-expanded="${!!ui.modeMenu}" aria-haspopup="menu" title="Switch mode" style="--mc:${resolveTheme(mode.theme).accent}"><span class="mg">${esc(mode.g || "")}</span> ${esc(mode.name)}${ui.private ? " · private" : ""} <span class="ct">· ${modeItems(mode).length}</span><span class="car">▾</span></button>${ui.modeMenu ? modeMenuHTML(mode) : ""}</div></div>
        <span class="spacer"></span><button class="btn sm ghost pedit" data-act="profile-edit" data-k="${esc(mode.id)}" title="Name, picture, banner and bio for ${esc(mode.name)}">✎ Edit profile</button></div></div>
    <nav class="tabs ptabs" aria-label="Tabs"><div class="ptabs-in"><div class="ptabs-list" role="tablist">${tabs.map(t => `<button role="tab" aria-selected="${ui.tab === t}" data-act="tab" data-k="${t}" draggable="true">${esc(TAB_NAME[t])}</button>`).join("")}</div><button class="tabedit" data-act="tab-edit" title="Add, remove or reorder the tabs in ${esc(curMode().name)}" aria-label="Edit tabs">⋯</button></div></nav>
  </div>`;
}
const hasAnimanga = (mode = curMode()) =>
    (mode.match || []).some(p => p === "*" || /^(anime|manga|manhwa|novel)/.test(p));
