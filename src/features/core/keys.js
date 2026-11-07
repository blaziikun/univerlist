// src/features/core/keys.js
// ─────────────────────────────────────────────────────────────────
//  Keyboard: every shortcut can be changed in Settings → Keyboard
// ─────────────────────────────────────────────────────────────────

const KEY_ACTIONS = [
    ["search", "Search everything", ["/", "Mod+k"], () => focusSearch()],
    ["add", "Add something (search)", ["n"], () => focusSearch()],
    ["sidebar", "Show or hide the sidebar", ["\\"], () => toggleSide()],
    ["prevmode", "Previous mode (in Watch & read: switch between them)", ["["], () => modeKey(-1)],
    ["nextmode", "Next mode (in Watch & read: switch between them)", ["]"], () => modeKey(1)],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [
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
function keyName(e) {
    let base =
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
const keysOf = id => {
    const o = (meta.settings.keys || {})[id];
    return o ? [].concat(o) : (KEY_ACTIONS.find(a => a[0] === id) || [, , []])[2];
};
const keyFor = id => keysOf(id)[0] || "";
const keyLabel = k =>
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
function runKey(e) {
    const k = keyName(e);
    if (["Shift", "Control", "Meta", "Alt"].includes(e.key)) return false;
    const a = KEY_ACTIONS.find(([id]) => keysOf(id).includes(k));
    if (!a) return false;
    e.preventDefault();
    a[3]();
    return true;
}
function zoomBy(d) {
    if (ui.tab !== "library" || curView() === "list") return;
    const md = curMode(),
        v = curView(md),
        o = viewOpts(md, v);
    md.vz = { ...(md.vz || {}), [v]: { ...o, z: Math.max(0.55, Math.min(1.9, Math.round((o.z + d) * 100) / 100)) } };
    markDirty();
    renderMain();
}
function goWatch() {
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
function modeKey(d) {
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
function toggleSettings() {
    if (ui.page === "settings") closeSettings();
    else goSettings();
}
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
            clash = KEY_ACTIONS.find(([x]) => x !== id && keysOf(x).includes(k));
        meta.settings.keys = { ...(meta.settings.keys || {}), [id]: [k] };
        if (clash) meta.settings.keys[clash[0]] = keysOf(clash[0]).filter(x => x !== k);
        ui.keyCapture = null;
        markDirty();
        render();
        toast(`${KEY_ACTIONS.find(a => a[0] === id)[1]}: ${keyLabel(k)}${clash ? ` (taken from “${clash[1]}”)` : ""}`);
    },
    true
);

// ═══════════════════════════════════════════
//  RIGHT-CLICK: SCORE IT THERE AND THEN; LEFT-CLICK OPENS THE CARD
// ═══════════════════════════════════════════
function ctxMenuHTML(b) {
    const words = STATUS_WORDS[MEDIA[b.medium].group];
    return `<div class="ctx-h"><b>${esc(cleanTitle(titleOf(b)))}</b><small>${esc([MEDIA[b.medium].one, b.year].filter(Boolean).join(" · "))}</small></div>
    <div class="ctx-s"><span class="ilab">Score${b.rating ? ` · <b>${esc(fmtScore(b.rating, scaleOf(b)))}</b>` : ""}</span>${rateWidget(b, { key: "ctx-rate" })}</div>
    <div class="ctx-st">${STATUS.map(k => `<button data-act="ctx-status" data-k="${k}" aria-pressed="${b.status === k}">${esc(words[k])}</button>`).join("")}</div>
    <div class="ctx-a">${!stageOn() ? "" : ["anime", "tv", "film"].includes(b.medium) ? `<button data-act="watch-open" data-id="${esc(b.id)}">▶ Watch</button>` : ["book", "manga", "manhwa", "novel", "comic"].includes(b.medium) ? `<button data-act="read-open" data-id="${esc(b.id)}">❡ Read</button>` : ""}<button data-act="ctx-fav">${b.fav ? "♥ Unfavourite" : "♡ Favourite"}</button><button data-act="ctx-queue">${meta.queue.includes(b.id) ? "✓ In Up next" : "+ Up next"}</button><button data-act="ctx-lists">≡ Lists…</button>
      <button data-act="ctx-hide">${b.hidden ? "Show in lists" : "Hide from lists"}</button><button data-act="ctx-open">Open card</button></div>
    <div class="ctx-m"><span class="ilab">Lives in</span>${selOf("ctx-mode", [["auto", "Where its type puts it"], ...meta.modes.filter(x => x.id !== "universal").map(x => [x.id, x.name])], b.modeHome || "auto")}</div>`;
}
// one menu element for everything you can right-click; each kind knows how to redraw itself after a change
let ctxDraw = null;
function openMenuAt(x, y, draw, data = {}) {
    let el = $("#ctx");
    if (!el) {
        el = document.createElement("div");
        el.id = "ctx";
        el.className = "ctx";
        el.setAttribute("role", "menu");
        document.body.append(el);
    }
    ctxY = scrollY;
    el.dataset.id = data.id || "";
    ctxDraw = draw;
    el.innerHTML = draw();
    el.hidden = false;
    const w = el.offsetWidth,
        h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + "px";
    el.style.top = Math.max(8, Math.min(innerHeight - h - 8, y)) + "px";
}
function openCtx(id, x, y) {
    if (!items.has(id)) return;
    openMenuAt(x, y, () => (items.has(id) ? ctxMenuHTML({ id, ...items.get(id) }) : ""), { id });
}
function refreshCtx() {
    const el = $("#ctx");
    if (el && !el.hidden && ctxDraw) {
        const h = ctxDraw();
        if (h) el.innerHTML = h;
        else el.hidden = true;
    }
}
const closeCtx = () => {
    const el = $("#ctx");
    if (el) el.hidden = true;
};
// right-click works on covers, characters, lists, modes, blocks and tier entries (hold Shift for the browser's own menu)
function charMenuHTML(id) {
    const c = meta.chars.find(x => x.id === id);
    if (!c) return "";
    return `<div class="ctx-h"><b>${esc(c.name)}</b><small>${esc(((c.media || [])[0] || {}).title || "Character")} · #${c.rank || "–"}</small></div>
    <div class="ctx-a"><button data-act="ctx-char-open" data-k="${esc(id)}">Open</button><button data-act="ctx-char-top" data-k="${esc(id)}">Move to the top</button><button data-act="ctx-char-group" data-k="${esc(id)}">Group…</button><button data-act="ctx-char-del" data-k="${esc(id)}">Remove</button></div>`;
}
function listMenuHTML(lid) {
    const l = meta.lists.find(x => x.id === lid);
    if (!l)
        return lid === "queue"
            ? `<div class="ctx-h"><b>Up next</b><small>Your priority queue</small></div><div class="ctx-a"><button data-act="ctx-list-open" data-k="queue">Open</button></div>`
            : "";
    return `<div class="ctx-h"><b>${esc(l.name)}</b><small>${l.kind === "tier" ? "Tier list" : l.numbered ? "Numbered list" : "List"} · ${listCount(l)} entries</small></div>
    <div class="ctx-s"><span class="ilab">Name</span><input class="inp" data-lrename="${esc(lid)}" value="${esc(l.name)}"></div>
    <div class="ctx-a"><button data-act="ctx-list-open" data-k="${esc(lid)}">Open</button><button data-act="ctx-list-dup" data-k="${esc(lid)}">Duplicate</button>${l.kind !== "tier" ? `<button data-act="ctx-list-num" data-k="${esc(lid)}">${l.numbered ? "Unnumbered" : "Numbered"}</button>` : ""}<button data-act="ctx-list-del" data-k="${esc(lid)}">Delete</button></div>`;
}
function modeCtxHTML(mid) {
    const m = modeById(mid);
    return `<div class="ctx-h"><b>${esc(m.g || "")} ${esc(m.name)}</b><small>${modeItems(m).length} things</small></div>
    <div class="ctx-a"><button data-act="mode" data-k="${esc(mid)}">Go there</button>${m.sealedOnly ? "" : `<button data-act="ctx-mode-edit" data-k="${esc(mid)}">Edit mode and look</button><button data-act="ctx-mode-start" data-k="${esc(mid)}">Open in it when I start</button>`}<button data-act="profile-edit" data-k="${esc(mid)}">Profile for this mode</button></div>`;
}
function tierMenuHTML(key) {
    const L = meta.lists.find(x => x.id === ui.listId);
    if (!L || !L.rows) return "";
    const e = tierEnt(L, key) || { name: "" },
        sel = tierSel.has(key) && tierSel.size > 1 ? [...tierSel] : [key];
    return `<div class="ctx-h"><b>${esc(sel.length > 1 ? plural(sel.length, "entry", "entries") : e.name)}</b><small>${L.layout === "rank" ? "Ranking" : "Move to"}</small></div><div class="ctx-st">${L.layout === "rank" ? `<button data-act="ctx-tier" data-k="${esc(key)}" data-row="0">Add to the ranking</button>` : L.rows.map((r, i) => `<button data-act="ctx-tier" data-k="${esc(key)}" data-row="${i}" style="border-color:${esc(r.color)}">${esc(r.label)}</button>`).join("")}<button data-act="ctx-tier" data-k="${esc(key)}" data-row="pool">Unplaced</button></div>
    ${e.item ? `<div class="ctx-a"><button data-act="ctx-open" data-k="${esc(key)}">Open card</button></div>` : e.char ? `<div class="ctx-a"><button data-act="open-char" data-k="${esc(key)}">Open character</button></div>` : ""}${(L.ents || {})[key] ? `<div class="ctx-a"><button data-act="ctx-tier-forget" data-k="${esc(key)}">Remove from this list</button></div>` : ""}`;
}
document.addEventListener("contextmenu", e => {
    if (e.shiftKey || e.target.closest("input, textarea")) return;
    const at = sel => e.target.closest(sel),
        X = e.clientX,
        Y = e.clientY;
    let t;
    if ((t = at(".tchip[data-tkey], .rkrow[data-tkey]"))) {
        e.preventDefault();
        const k = t.dataset.tkey;
        openMenuAt(X, Y, () => tierMenuHTML(k));
        return;
    }
    if (
        (t = at('[data-act="open"][data-id], [data-act="watch-item"][data-id]')) &&
        !t.closest("#overlay .item7 .iside")
    ) {
        e.preventDefault();
        openCtx(t.dataset.id, X, Y);
        return;
    }
    if ((t = at('[data-act="open-char"][data-k], [data-charid]'))) {
        e.preventDefault();
        const id = t.dataset.k || t.dataset.charid;
        openMenuAt(X, Y, () => charMenuHTML(id));
        return;
    }
    if ((t = at('[data-act="go-list"][data-k]'))) {
        e.preventDefault();
        const id = t.dataset.k;
        if (!id) return;
        openMenuAt(X, Y, () => listMenuHTML(id));
        return;
    }
    if ((t = at('[data-act="mode"][data-k], [data-act="edit-mode"][data-k]'))) {
        e.preventDefault();
        const id = t.dataset.k;
        openMenuAt(X, Y, () => modeCtxHTML(id));
        return;
    }
    if ((t = at('.ptabs [data-act="tab"][data-k]'))) {
        e.preventDefault();
        const k = t.dataset.k;
        openMenuAt(
            X,
            Y,
            () =>
                `<div class="ctx-h"><b>${esc(TAB_NAME[k] || k)}</b><small>${esc(curMode().name)}</small></div><div class="ctx-a"><button data-act="tab-hide" data-k="${esc(k)}">Hide in ${esc(curMode().name)}</button><button data-act="tab-edit">Add, remove or reorder tabs…</button></div>`
        );
        return;
    }
    if ((t = at(".blk[data-bi]"))) {
        e.preventDefault();
        const kd = t.dataset.bkind || "ov",
            i = Number(t.dataset.bi);
        openMenuAt(X, Y, () => blockMenuHTML(kd, i));
        return;
    }
});
document.addEventListener(
    "pointerdown",
    e => {
        const el = $("#ctx");
        if (el && !el.hidden && !e.target.closest("#ctx")) closeCtx();
    },
    true
);
let ctxY = 0;
// a scroll still settling when the menu opens shouldn't close it; a real scroll away does
addEventListener(
    "scroll",
    () => {
        const el = $("#ctx");
        if (el && !el.hidden && Math.abs(scrollY - ctxY) > 48) closeCtx();
    },
    { passive: true }
);
