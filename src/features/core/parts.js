// src/features/core/parts.js
// ─────────────────────────────────────────────────────────────────
//  Parts: several entries kept as one (seasons of a show, a trilogy, the volumes of a manga), each keeping its own
//  score
//
//  The entry you keep holds parts: [ids]. Each part keeps all its own data and points back with partOf, and stays out
//  of lists and stats until you split it out again. Nothing is deleted either way.
// ─────────────────────────────────────────────────────────────────

const partsOf = b => (b.parts || []).filter(id => items.has(id));
const isPart = b => !!(b.partOf && items.has(b.partOf));
const partOrder = (a, b) =>
    (a.year || 9999) - (b.year || 9999) ||
    (a.seriesNo || 0) - (b.seriesNo || 0) ||
    String(titleOf(a)).localeCompare(String(titleOf(b)), undefined, { numeric: true });
// the shared start of two titles ("Little Busters!" and "Little Busters! Refrain") or a shared series
function sameSeries(a, b) {
    if (a.series && a.series === b.series) return true;
    if (a.franchise && a.franchise === b.franchise) return true;
    const x = norm(cleanTitle(titleOf(a))),
        y = norm(cleanTitle(titleOf(b))),
        n = Math.min(x.length, y.length);
    let i = 0;
    while (i < n && x[i] === y[i]) i++;
    const stem = x.slice(0, i).trim();
    return (
        stem.length >= 5 &&
        stem.split(" ").length >= 1 &&
        (x.startsWith(stem + " ") || x === stem || y.startsWith(stem + " ") || y === stem)
    );
}
function combineItems(ids, keepId) {
    ids = [...new Set(ids)].filter(id => items.has(id));
    if (ids.length < 2) return null;
    // folding in an entry that already has parts brings its parts along
    const flat = [...new Set(ids.flatMap(id => [id, ...partsOf(items.get(id))]))];
    const L = flat.map(id => ({ id, ...items.get(id) })).sort(partOrder),
        keep = keepId && flat.includes(keepId) ? keepId : L[0].id;
    const others = L.filter(x => x.id !== keep).map(x => x.id);
    change(`Combine ${L.length} into ${titleOf(items.get(keep))}`, flat, (x, id) =>
        id === keep ? { ...x, parts: others, partOf: undefined } : { ...x, partOf: keep, parts: undefined }
    );
    ui.sel.clear();
    toast(`${titleOf(items.get(keep))} now holds ${plural(others.length, "part")}. Each keeps its own score.`, {
        label: "Undo",
        fn: undo,
    });
    return keep;
}
function splitPart(parentId, childId) {
    const p = items.get(parentId);
    if (!p) return;
    const ids = childId ? [childId] : partsOf(p);
    change(
        childId ? `Split out ${titleOf(items.get(childId))}` : `Split ${titleOf(p)} apart`,
        [parentId, ...ids],
        (x, id) =>
            id === parentId
                ? { ...x, parts: childId ? partsOf(p).filter(c => c !== childId) : undefined }
                : { ...x, partOf: undefined }
    );
    toast(childId ? "Split out: it's its own entry again" : "Split apart", { label: "Undo", fn: undo });
}
// the score a combined entry shows when you haven't scored the whole: the average of its parts
function partsScore(b) {
    const R = partsOf(b)
        .map(id => items.get(id).rating)
        .filter(Boolean);
    return R.length ? Math.round((R.reduce((a, x) => a + x, 0) / R.length) * 10) / 10 : 0;
}
function partsBadge(b) {
    const n = partsOf(b).length;
    return n ? `<span class="partsb" title="${n + 1} parts in one entry">${n + 1}</span>` : "";
}
function partsSectionHTML(b) {
    const P = partsOf(b)
            .map(id => ({ id, ...items.get(id) }))
            .sort(partOrder),
        unit = ["manga", "manhwa", "novel", "book", "comic"].includes(b.medium)
            ? b.medium === "book"
                ? "books"
                : "volumes"
            : "seasons";
    const same = all()
        .filter(x => x.id !== b.id && x.medium === b.medium && !isPart(x) && sameSeries(x, b))
        .slice(0, 8);
    const avg = partsScore(b);
    return `<div class="sec partsec"><div class="bar"><span class="label">${P.length ? `${P.length + 1} ${unit} in this entry` : "Parts"}</span>${avg ? `<span class="hint">· average of parts ${esc(fmtScore(avg))}</span>` : ""}<span class="spacer"></span>${P.length ? `<button class="linkbtn" data-act="parts-split" data-k="">Split all apart</button>` : ""}</div>
    ${P.length ? `<div class="parts">${[{ id: b.id, ...b, self: true }, ...P].map((x, i) => `<div class="ppart${x.self ? " self" : ""}"><span class="pn">${i + 1}</span><span class="pc">${coverHTML(x)}</span><button class="pt" data-act="${x.self ? "" : "open"}" data-id="${esc(x.id)}"><b>${esc(titleOf(x))}</b><small>${esc([x.year, statusWord(x.status, x.medium)].filter(Boolean).join(" · "))}</small></button><span class="ps">${x.rating ? esc(fmtScore(x.rating, scaleOf(x))) : "–"}</span>${x.self ? `<span class="hint">this one</span>` : `<button class="linkbtn" data-act="parts-split" data-k="${esc(x.id)}">Split out</button>`}</div>`).join("")}</div>` : `<p class="hint">Keep seasons, sequels or volumes together as one entry. Each part keeps its own score and dates; split any back out whenever you like. You can also drag one cover onto another in the library.</p>`}
    <div class="bar">${same.length ? same.map(x => `<button class="chip" data-act="parts-add" data-k="${esc(x.id)}" title="Combine ${esc(titleOf(x))} into this entry">+ ${esc(titleOf(x))}</button>`).join("") : ""}
      <input class="inp" list="parts-opts" placeholder="Combine another…" data-partsadd="1" style="flex:1;min-width:160px"><datalist id="parts-opts">${all()
          .filter(x => x.id !== b.id && x.medium === b.medium && !isPart(x))
          .slice(0, 400)
          .map(x => `<option value="${esc(titleOf(x))} · ${esc(MEDIA[x.medium].one)}">`)
          .join("")}</datalist>
      ${["manga", "manhwa", "novel", "comic"].includes(b.medium) && b.vols > 1 && !P.length ? `<button class="btn sm ghost" data-act="parts-vols">Split into ${b.vols} volumes</button>` : ""}</div></div>`;
}
// one entry per volume, held as parts, each with its own cover when Apple Books has it
async function splitIntoVolumes(id) {
    const b = items.get(id);
    if (!b || !(b.vols > 1)) return;
    const n = Math.min(120, b.vols),
        art = await volumeCovers(b).catch(() => ({})),
        made = [];
    for (let v = 2; v <= n; v++)
        made.push(
            addItem(
                {
                    medium: b.medium,
                    kind: b.kind,
                    title: `${cleanTitle(titleOf(b))}, Vol. ${v}`,
                    creator: b.creator,
                    year: b.year,
                    seriesNo: v,
                    cover: art[v] || "",
                    status: (b.ownedVols || []).includes(v) && b.status === "done" ? "done" : "want",
                    copy: (b.ownedVols || []).includes(v) ? b.copy : "none",
                    partOf: id,
                    genres: b.genres,
                },
                "Volume " + v
            )
        );
    change(`Split ${titleOf(b)} into volumes`, [id], x => ({
        ...x,
        parts: [...(x.parts || []), ...made],
        seriesNo: 1,
        ...(art[1] && !x.coverPicked ? { volCover: art[1] } : {}),
    }));
    toast(`Made ${n} volumes${Object.keys(art).length ? `, ${Object.keys(art).length} with their own cover` : ""}`);
}
// volume covers: Apple Books lists most manga and light novels volume by volume
async function volumeCovers(b, signal) {
    const t = cleanTitle(titleOf(b)),
        out = {};
    const j = await itunesJSON(
        { term: t, media: "ebook", limit: "200", country: (meta.settings.region || "GB").toLowerCase() },
        signal
    );
    for (const r of j.results || []) {
        const name = r.trackName || "",
            m = name.match(/(?:vol(?:ume)?\.?|#)\s*(\d{1,3})\b/i) || name.match(/\b(\d{1,3})\s*$/);
        if (!m || !norm(name).includes(norm(t).slice(0, 18))) continue;
        const v = +m[1];
        if (!out[v] && r.artworkUrl100) out[v] = r.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x900bb.");
    }
    return out;
}
function partsClick(act, t, k) {
    const m = ui.modal && ui.modal.kind === "item" ? ui.modal : null;
    if (!m) return false;
    if (act === "parts-split") {
        splitPart(m.id, k || null);
        renderOverlay();
        renderMain();
        return true;
    }
    if (act === "parts-add") {
        combineItems([m.id, k], m.id);
        renderOverlay();
        renderMain();
        return true;
    }
    if (act === "parts-vols") {
        splitIntoVolumes(m.id).then(() => {
            renderOverlay();
            renderMain();
        });
        return true;
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.partsadd) return;
    const m = ui.modal;
    if (!m || m.kind !== "item") return;
    const iid = idFromOption(t.value);
    if (iid && iid !== m.id) {
        combineItems([m.id, iid], m.id);
        renderOverlay();
        renderMain();
    }
});

// ═══════════════════════════════════════════
//  SEASONS: FOUND, COMBINED, RE-FRONTED AND SPLIT, A WHOLE LIBRARY AT A TIME
// ═══════════════════════════════════════════
// the seasons of each show among these entries that aren't all in one entry yet: [[front, ...others]], the front being the
// entry that already holds the others when there is one (so a season you put on the front stays there)
function seasonGroups(ids) {
    const done = new Set(),
        out = [];
    for (const id of ids) {
        const b = items.get(id);
        if (!b || done.has(id) || !isSeasonish(b)) continue;
        const C = seasonChain(isPart(b) ? b.partOf : id).filter(x => !!x.private === !!b.private);
        C.forEach(x => done.add(x.id));
        if (C.length < 2) continue;
        const head = (C.find(x => partsOf(items.get(x.id)).length && !isPart(items.get(x.id))) || C[0]).id;
        if (C.every(x => x.id === head || items.get(x.id).partOf === head)) continue;
        out.push([head, ...C.map(x => x.id).filter(x => x !== head)]);
    }
    return out;
}
function combineGroups(groups, label) {
    const ids = [...new Set(groups.flat())];
    change(label, ids, (x, id) => {
        const g = groups.find(G => G.includes(id));
        return id === g[0] ? { ...x, parts: g.slice(1), partOf: undefined } : { ...x, partOf: g[0], parts: undefined };
    });
}
// new anime join their other seasons by themselves, unless sequels are set to "each on its own"
let seasonQ = new Set(),
    seasonT = 0;
function queueSeasonCombine(id) {
    if (meta.settings.seasonsMode === "separate" || meta.settings.autoCombine === false) return;
    seasonQ.add(id);
    clearTimeout(seasonT);
    seasonT = setTimeout(runSeasonCombine, 600);
}
function runSeasonCombine() {
    const ids = [...seasonQ].filter(id => items.has(id));
    seasonQ = new Set();
    // on its own, it only goes by what's certain: AniList's sequel links, or a title that says it's a season or part
    const sure = g => {
        const chain = new Set(animeChain(g[0]).map(x => x.id));
        return [
            g[0],
            ...g
                .slice(1)
                .filter(
                    id =>
                        chain.has(id) ||
                        /\b(season|part|cour|final|\d+(?:st|nd|rd|th))\b|\s(?:ii|iii|iv|v|vi)\s*$/i.test(
                            items.get(id).title
                        )
                ),
        ];
    };
    const groups = seasonGroups(ids)
        .map(sure)
        .filter(g => g.length > 1);
    if (!groups.length) return;
    combineGroups(
        groups,
        `Put ${plural(groups.length, "show")} with ${groups.length > 1 ? "their" : "its"} other seasons`
    );
    toast(
        groups.length > 1
            ? `Put ${groups.length} shows with their other seasons`
            : `${titleOf(items.get(groups[0][0]))} now holds ${plural(groups[0].length - 1, "season")}`,
        { label: "Undo", fn: undo }
    );
    if (ui.page === "profile") renderMain();
}
// put another season on the front: it becomes the entry that holds the rest, and the show's ranking and favourite come with it
const FRONT_CARRY = ["elo", "h2h", "welo", "wh2h", "fav", "favWhy", "favArt"];
function seasonFront(headId, newId) {
    const h = items.get(headId);
    if (!h || headId === newId || !partsOf(h).includes(newId)) return;
    const rest = [headId, ...partsOf(h)]
        .filter(x => x !== newId)
        .map(id => ({ id, ...items.get(id) }))
        .sort(partOrder)
        .map(x => x.id);
    const carry = Object.fromEntries(FRONT_CARRY.filter(k => h[k] != null).map(k => [k, h[k]]));
    change(`Put ${titleOf(items.get(newId))} on the front`, [headId, ...partsOf(h)], (x, id) =>
        id === newId
            ? { ...x, ...carry, parts: rest, partOf: undefined }
            : {
                  ...x,
                  partOf: newId,
                  parts: undefined,
                  ...(id === headId ? Object.fromEntries(FRONT_CARRY.map(k => [k, undefined])) : {}),
              }
    );
    if (meta.favOrder) meta.favOrder = meta.favOrder.map(x => (x === headId ? newId : x));
    toast(`${titleOf(items.get(newId))} is on the front now`, { label: "Undo", fn: undo });
}
// the Seasons panel on the Rank page: together or apart, which season is on the front, combine or split any of them
function seasonsPanelHTML() {
    const S = meta.settings,
        apart = S.seasonsMode === "separate",
        L = modeItems();
    if (!L.some(b => ["anime", "tv"].includes(b.medium))) return "";
    const heads = L.filter(b => partsOf(b).length && ["anime", "tv"].includes(b.medium)).sort((a, b) =>
        titleOf(a).localeCompare(titleOf(b))
    );
    const loose = seasonGroups(L.map(b => b.id)),
        q = norm(ui.seasonQ || "");
    const show = heads.filter(
        b => !q || [b, ...partsOf(b).map(id => items.get(id))].some(x => norm(titleOf(x)).includes(q))
    );
    return `<details class="panel seasonsp" data-seasonsopen="1"${ui.seasonsOpen ? " open" : ""}><summary><h3>Seasons and sequels</h3><span class="hint">${plural(heads.length, "show")} combined${loose.length ? ` · ${loose.length} more could be` : ""}</span></summary>
    <p class="hint">A combined show is ranked once, as a whole; its score is the average of its seasons until you score the whole. Each season keeps its own score inside it.</p>
    <div class="bar"><span class="lbk">Anime sequels</span><div class="seg">${[
        ["together", "Together"],
        ["separate", "Each on its own"],
    ]
        .map(
            ([k, l]) =>
                `<button data-act="seasons-mode" data-k="${k}" aria-pressed="${(apart ? "separate" : "together") === k}">${l}</button>`
        )
        .join("")}</div>
      <label class="ctl"><input type="checkbox" data-seasons="tv" ${(S.seasons || {}).tv ? "checked" : ""}> Score TV shows season by season</label>
      <label class="ctl"><input type="checkbox" data-autocombine="1" ${S.autoCombine !== false && !apart ? "checked" : ""}${apart ? " disabled" : ""}> Put new seasons with their show</label></div>
    ${
        loose.length
            ? `<div class="seasonsloose"><p class="label">Not combined yet <button class="btn sm gold" data-act="seasons-combine" data-k="">Combine all ${loose.length}</button></p>${loose
                  .slice(0, 30)
                  .map(
                      g =>
                          `<div class="srowx"><span class="t">${esc(commonName(g.map(id => items.get(id))))}</span><span class="hint">${plural(g.length, "entry", "entries")}</span><button class="btn sm" data-act="seasons-combine" data-k="${esc(g.join(","))}">Combine</button></div>`
                  )
                  .join("")}</div>`
            : ""
    }
    ${
        heads.length
            ? `<div class="bar" style="margin-top:10px"><span class="label">Combined</span><span class="spacer"></span><input class="inp" id="season-q" placeholder="Find a show" value="${esc(ui.seasonQ || "")}" style="max-width:200px"></div>
      <div class="seasonslist">${show
          .slice(0, 200)
          .map(b => {
              const P = [b.id, ...partsOf(b)].map(id => ({ id, ...items.get(id) })).sort(partOrder),
                  avg = partsScore(b);
              return `<div class="srowx"><span class="pc">${coverHTML(b)}</span><button class="t linkbtn" data-act="open" data-id="${esc(b.id)}">${esc(titleOf(b))}</button><span class="hint">${P.length} seasons${avg ? " · avg " + esc(fmtScore(avg)) : ""}</span>
          <label class="ctl">On the front ${selOf(
              "",
              P.map(x => [x.id, titleOf(x)]),
              b.id,
              `data-seasonfront="${esc(b.id)}"`
          )}</label><button class="btn sm ghost" data-act="seasons-split" data-k="${esc(b.id)}">Split</button></div>`;
          })
          .join("")}</div>`
            : ""
    }
  </details>`;
}
function seasonsClick(act, t, k) {
    if (act === "seasons-mode") {
        meta.settings.seasonsMode = k;
        meta.watchSplit = [];
        markDirty();
        seasonsAcrossLibrary(k === "together");
        renderMain();
        return true;
    }
    if (act === "seasons-combine") {
        const groups = k ? [k.split(",")] : seasonGroups(modeItems().map(b => b.id));
        if (!groups.length) return true;
        combineGroups(groups, `Combine ${plural(groups.length, "show")}`);
        toast(`Combined ${plural(groups.length, "show")}`, { label: "Undo", fn: undo });
        renderMain();
        return true;
    }
    if (act === "seasons-split") {
        splitPart(k, null);
        renderMain();
        return true;
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.seasonfront) {
        seasonFront(t.dataset.seasonfront, t.value);
        renderMain();
    }
    if (t.dataset.autocombine) {
        meta.settings.autoCombine = t.checked;
        markDirty();
    }
});
document.addEventListener("input", e => {
    if (e.target.id === "season-q") {
        ui.seasonQ = e.target.value;
        const p = e.target.selectionStart;
        renderMain();
        const n = $("#season-q");
        if (n) {
            n.focus();
            n.setSelectionRange(p, p);
        }
    }
});
document.addEventListener(
    "toggle",
    e => {
        const d = e.target;
        if (d.dataset && d.dataset.seasonsopen) ui.seasonsOpen = d.open;
    },
    true
);

// ═══════════════════════════════════════════
//  SELECTING: DRAG A BOX OVER COVERS, SHIFT-CLICK A RANGE, CTRL/⌘-CLICK ONE; DRAG THE SELECTION ONTO A GROUP TO MOVE IT THERE
// ═══════════════════════════════════════════
let lbox = null;
document.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.pointerType !== "mouse" || ui.arrange || ui.page !== "profile" || ui.tab !== "library")
        return;
    // start on any empty part of the library page, or (while selecting) on a cover that isn't selected yet
    const page = e.target.closest && e.target.closest(".tabbody.t-library, main.main");
    if (!page || !$(".libbody")) return;
    const tile = e.target.closest("[data-oid]");
    if (
        tile
            ? !(ui.selecting && !ui.sel.has(tile.dataset.oid))
            : e.target.closest("button, a, input, select, label, .libbar, .filtpanel, .prof, .plaque, .note")
    )
        return;
    lbox = {
        x: e.clientX,
        y: e.clientY,
        add: e.shiftKey || e.metaKey || e.ctrlKey,
        el: null,
        base: new Set(e.shiftKey || e.metaKey || e.ctrlKey ? ui.sel : []),
    };
});
document.addEventListener("pointermove", e => {
    if (!lbox) return;
    const dx = e.clientX - lbox.x,
        dy = e.clientY - lbox.y;
    if (!lbox.el) {
        if (Math.hypot(dx, dy) < 6) return;
        lbox.el = document.createElement("div");
        lbox.el.className = "lbox";
        document.body.append(lbox.el);
        document.body.classList.add("marqing");
    }
    const r = {
        l: Math.min(e.clientX, lbox.x),
        t: Math.min(e.clientY, lbox.y),
        r: Math.max(e.clientX, lbox.x),
        b: Math.max(e.clientY, lbox.y),
    };
    Object.assign(lbox.el.style, {
        left: r.l + "px",
        top: r.t + "px",
        width: r.r - r.l + "px",
        height: r.b - r.t + "px",
    });
    lbox.hit = new Set(lbox.base);
    for (const el of $$(".libbody [data-oid]")) {
        const q = el.getBoundingClientRect();
        const on = q.right > r.l && q.left < r.r && q.bottom > r.t && q.top < r.b;
        if (on) lbox.hit.add(el.dataset.oid);
        el.classList.toggle("sel", on || lbox.base.has(el.dataset.oid));
    }
    if (e.clientY > innerHeight - 40) scrollBy(0, 14);
    else if (e.clientY < 80) scrollBy(0, -14);
});
document.addEventListener("pointerup", () => {
    if (!lbox) return;
    const m = lbox;
    lbox = null;
    if (!m.el) return;
    m.el.remove();
    document.body.classList.remove("marqing");
    ui.sel = m.hit || new Set();
    ui.selecting = true;
    ui.confirmBulkDelete = false;
    renderMain();
    // swallow the click that follows the drag
    addEventListener(
        "click",
        ev => {
            ev.stopPropagation();
            ev.preventDefault();
        },
        { capture: true, once: true }
    );
});

// ── dragging tiles: onto a group header to move them there, onto another cover to combine ──
let tileDrag = null;
document.addEventListener("dragstart", e => {
    if (ui.arrange || ui.page !== "profile" || ui.tab !== "library") return;
    const tile = e.target.closest && e.target.closest(".libbody [data-oid]");
    if (!tile) return;
    if (lbox) {
        e.preventDefault();
        return;
    }
    const id = tile.dataset.oid,
        ids = ui.sel.has(id) ? [...ui.sel] : [id];
    tileDrag = { ids };
    e.dataTransfer.effectAllowed = "move";
    try {
        e.dataTransfer.setData("text/plain", ids.join(","));
    } catch (_) {}
    if (ids.length > 1) {
        const g = document.createElement("div");
        g.className = "dragcount";
        g.textContent = ids.length + " selected";
        document.body.append(g);
        e.dataTransfer.setDragImage(g, 20, 20);
        setTimeout(() => g.remove(), 0);
    }
    document.body.classList.add("tiledrag");
});
const dropGroup = el => {
    const s = el.closest && el.closest(".libbody section.group");
    return s && s.querySelector("[data-gdrop]");
};
// over a cover: near its edges a line shows where it will go; hold over the middle for a moment to combine instead
const DRAG_MARKS = ".dropok, .combineok, .ins-before, .ins-after";
const clearMarks = () =>
    $$(DRAG_MARKS).forEach(x => x.classList.remove("dropok", "combineok", "ins-before", "ins-after"));
document.addEventListener("dragover", e => {
    if (!tileDrag) return;
    clearMarks();
    const tile = e.target.closest && e.target.closest(".libbody [data-oid]");
    if (tile && !tileDrag.ids.includes(tile.dataset.oid)) {
        const q = tile.getBoundingClientRect(),
            cx = (e.clientX - q.left) / q.width;
        e.preventDefault();
        if (cx > 0.3 && cx < 0.7) {
            if (tileDrag.over !== tile.dataset.oid) {
                tileDrag.over = tile.dataset.oid;
                tileDrag.since = Date.now();
            }
        } else tileDrag.over = null;
        const merge = tileDrag.over === tile.dataset.oid && Date.now() - tileDrag.since > 650;
        tile.classList.add(merge ? "combineok" : cx < 0.5 ? "ins-before" : "ins-after");
        tileDrag.mode = merge ? "merge" : cx < 0.5 ? "before" : "after";
        tileDrag.at = tile.dataset.oid;
        return;
    }
    tileDrag.mode = null;
    const g = dropGroup(e.target);
    if (g && groupMoveOk(g.dataset.gdrop, tileDrag.ids)) {
        e.preventDefault();
        g.classList.add("dropok");
    }
});
document.addEventListener("drop", e => {
    if (!tileDrag) return;
    const D = tileDrag,
        ids = D.ids;
    tileDrag = null;
    clearMarks();
    document.body.classList.remove("tiledrag");
    const tile = e.target.closest && e.target.closest(".libbody [data-oid]");
    if (tile && !ids.includes(tile.dataset.oid)) {
        e.preventDefault();
        const to = tile.dataset.oid;
        if (D.mode === "merge") {
            const A = items.get(to),
                B = items.get(ids[0]);
            if (
                A &&
                B &&
                (sameSeries(A, B) ||
                    ids.length > 1 ||
                    confirm(`Combine “${titleOf(B)}” into “${titleOf(A)}”? They don't look like the same series.`))
            ) {
                combineItems([to, ...ids], to);
                renderMain();
            }
            return;
        }
        moveTiles(ids, to, D.mode === "after");
        return;
    }
    const g = dropGroup(e.target);
    if (g) {
        e.preventDefault();
        groupMove(g.dataset.gdrop, ids);
    }
});
document.addEventListener("dragend", () => {
    tileDrag = null;
    document.body.classList.remove("tiledrag");
    clearMarks();
});
// put covers where you dropped them: your Shelf order (or, with Ranking, your order among equal scores)
function moveTiles(ids, to, after) {
    const mode = curMode(),
        box = $(`.libbody [data-oid="${CSS.escape(to)}"]`),
        grp = box && box.closest("[data-gsort]"),
        gs = grp ? grp.dataset.gsort : curSort();
    let key = gs === "rank" || gs === "mine" ? "myOrder" : "orders";
    if (!["shelf", "rank", "mine"].includes(gs)) {
        mode.sort = "shelf";
        mode.gsort = {};
        key = "orders";
        toast("Switched to Shelf order so your arrangement stays");
    }
    const before = clone(meta[key] || {}),
        cur = (listOrder.length ? listOrder : modeItems().map(b => b.id)).filter(x => !ids.includes(x)),
        i = cur.indexOf(to);
    cur.splice(i < 0 ? cur.length : i + (after ? 1 : 0), 0, ...ids);
    meta[key] = { ...(meta[key] || {}), [mode.id]: cur };
    markDirty();
    renderMain();
    if (key === "myOrder" && ids.some(id => (items.get(id) || {}).rating !== (items.get(to) || {}).rating))
        toast("Moved. Ranking puts higher scores first, so your order only shows among equal scores.", {
            label: "Undo",
            fn: () => {
                meta[key] = before;
                markDirty();
                renderMain();
            },
        });
    else
        toast(`Moved ${plural(ids.length, "entry")}`, {
            label: "Undo",
            fn: () => {
                meta[key] = before;
                markDirty();
                renderMain();
            },
        });
}
function groupMoveOk(key, ids) {
    const [g, ...rest] = key.split(":"),
        v = rest.join(":");
    if (g === "status") return STATUS.includes(v);
    if (g === "type") {
        const [med] = v.split(":");
        return ids.every(id => (items.get(id) || {}).medium === med);
    }
    if (g === "kind")
        return (
            !Array.isArray(curMode().shelves) &&
            ids.every(id => (KINDS[(items.get(id) || {}).medium] || []).includes(v))
        );
    return false;
}
function groupMove(key, ids) {
    if (!groupMoveOk(key, ids)) return toast("That grouping can't be changed by dragging.");
    const [g, ...rest] = key.split(":"),
        v = rest.join(":");
    if (g === "status")
        change(`Move ${plural(ids.length, "entry")} to ${statusWord(v)}`, ids, x => ({
            ...x,
            status: v,
            ...(v === "done" && !x.finishedAt ? { finishedAt: nowISO() } : {}),
            ...(v === "active" && !x.startedAt ? { startedAt: nowISO() } : {}),
            ...(v === "dnf" ? { droppedAt: nowISO() } : {}),
        }));
    else {
        const kind = g === "type" ? v.split(":").slice(1).join(":") : v;
        change(`Set type of ${plural(ids.length, "entry")}`, ids, x => ({ ...x, kind }));
    }
    toast(`Moved ${plural(ids.length, "entry")}`, { label: "Undo", fn: undo });
    renderMain();
}
