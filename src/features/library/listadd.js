// src/features/library/listadd.js
// ─────────────────────────────────────────────────────────────────
//  Filling lists quickly: pick many things at once, or every character or cast member of a title
//
//  Lists of things: search everything (not only this mode or your favourites), tick as many as you like, add them
//  together.
// ─────────────────────────────────────────────────────────────────

MODALS.pickitem = function (m) {
    const q = norm(m.q || ""),
        added = m.added || new Set(),
        sel = (m.sel = m.sel || new Set()),
        many = m.purpose === "list";
    const pool = (m.scope === "mode" ? modeItems() : all()).filter(
        b =>
            (!m.filter || m.filter(b)) &&
            (!m.med || b.medium === m.med) &&
            (!q || norm(titleOf(b) + " " + (b.creator || "") + " " + ((b.alt && b.alt.romaji) || "")).includes(q))
    );
    const list = pool
        .sort((a, b) => (b.status === "done") - (a.status === "done") || (b.rating || 0) - (a.rating || 0))
        .slice(0, many ? 160 : 40);
    const meds = [...new Set((m.scope === "mode" ? modeItems() : all()).map(b => b.medium))];
    const row = b =>
        many
            ? `<button class="pirow${sel.has(b.id) ? " on" : ""}" data-act="pi-pick" data-id="${esc(b.id)}" ${added.has(b.id) ? "disabled" : ""} aria-pressed="${sel.has(b.id)}"><span class="pick">${added.has(b.id) ? "✓" : sel.has(b.id) ? "■" : ""}</span>${coverHTML(b)}<span class="t">${esc(titleOf(b))}</span><span class="hint">${added.has(b.id) ? "In the list" : esc([b.kind || MEDIA[b.medium].one, b.year, b.rating ? fmtScore(b.rating, scaleOf(b)) : ""].filter(Boolean).join(" · "))}</span></button>`
            : `<button data-act="pi-pick" data-id="${esc(b.id)}" ${added.has(b.id) ? "disabled" : ""}><span class="t">${mDot(b.medium)}${esc(titleOf(b))}</span><span class="hint">${added.has(b.id) ? "✓ Added" : esc(b.kind || MEDIA[b.medium].one) + (b.year ? " · " + b.year : "") + (b.rating ? " · " + b.rating : "") + (b.fav ? " · ♥" : "")}</span></button>`;
    return (
        head(esc(m.title || "Choose")) +
        `<div class="bar"><input class="inp" id="pi-q" autofocus placeholder="Search your library" value="${esc(m.q || "")}" style="flex:1;min-width:180px">
      ${
          many
              ? `<div class="seg">${[
                    ["mode", curMode().name],
                    ["all", "Everything"],
                ]
                    .map(
                        ([k, l]) =>
                            `<button data-act="pi-scope" data-k="${k}" aria-pressed="${(m.scope || "mode") === k}">${esc(l)}</button>`
                    )
                    .join(
                        ""
                    )}</div>${selOf("pi-med", [["", "Any type"], ...meds.map(k => [k, MEDIA[k].name || MEDIA[k].one])], m.med || "")}`
              : ""
      }</div>
    <div class="${many ? "pigrid" : "mini"}" style="margin-top:8px">${list.map(row).join("") || `<p class="hint">Nothing matches.</p>`}</div>${pool.length > list.length ? `<p class="hint">Showing ${list.length} of ${pool.length}; search to narrow it.</p>` : ""}
    ${many ? `<div class="bar pibar"><button class="linkbtn" data-act="pi-all">Select all ${list.filter(b => !added.has(b.id)).length} shown</button>${sel.size ? `<button class="linkbtn" data-act="pi-none">Clear</button>` : ""}<span class="spacer"></span><button class="btn gold" data-act="pi-add" ${sel.size ? "" : "disabled"}>Add ${sel.size || ""}</button><button class="btn ghost" data-act="close">Done</button></div>` : ""}`
    );
};
function pickClick(act, t, k, id, m) {
    if (!m || m.kind !== "pickitem") return false;
    if (act === "pi-pick" && m.purpose === "list") {
        const s = (m.sel = m.sel || new Set());
        s.has(id) ? s.delete(id) : s.add(id);
        renderOverlay();
        return true;
    }
    if (act === "pi-scope") {
        m.scope = k;
        renderOverlay();
        return true;
    }
    if (act === "pi-all") {
        const s = (m.sel = m.sel || new Set());
        for (const b of $$(".pigrid .pirow:not([disabled])")) s.add(b.dataset.id);
        renderOverlay();
        return true;
    }
    if (act === "pi-none") {
        m.sel = new Set();
        renderOverlay();
        return true;
    }
    if (act === "pi-add") {
        const ids = [...(m.sel || [])];
        if (!ids.length) return true;
        if (m.lid === "queue") ids.forEach(x => queueAdd(x));
        else listAdd(m.lid, ids);
        ids.forEach(x => (m.added = m.added || new Set()).add(x));
        m.sel = new Set();
        renderOverlay();
        toast(`Added ${plural(ids.length, "entry", "entries")}`, { label: "Undo", fn: undo });
        return true;
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target,
        m = ui.modal;
    if (t.id === "pi-med" && m && m.kind === "pickitem") {
        m.med = t.value;
        renderOverlay();
    }
});
// a title's characters or cast, into a ranked or tier list, in one go
MODALS.castlist = function (m) {
    const b = items.get(m.id),
        cast = (castCache.get(m.id) || []).filter(c => (m.what === "chars" ? c.name : c.va)),
        sel = (m.sel = m.sel || new Set(cast.map((_, i) => i)));
    const lists = meta.lists.filter(l => l.kind === "tier" && tierWhat(l) === m.what);
    const nm = c => (m.what === "chars" ? c.name : c.va),
        sub = c =>
            m.what === "chars"
                ? c.va
                    ? (c.role === "Voice" || ["anime", "game"].includes(b.medium) ? "voiced by " : "played by ") + c.va
                    : c.role || ""
                : c.name
                  ? "as " + c.name
                  : "";
    const img = c =>
        m.what === "chars"
            ? c.src === "tmdb"
                ? ""
                : c.image || ""
            : c.vaImage || (c.src === "tmdb" ? c.image : "") || "";
    return (
        head(`${m.what === "chars" ? "Characters" : "Cast"} of ${esc(titleOf(b))} → a list`) +
        `<div class="bar"><label class="ctl">Into ${selOf("cl-dest", [...lists.map(l => [l.id, l.name]), ["new-rank", "A new ranked list"], ["new-tier", "A new tier list"]], m.dest || (lists[0] ? lists[0].id : "new-rank"))}</label>
      <button class="linkbtn" data-act="cl-all">All</button><button class="linkbtn" data-act="cl-none">None</button></div>
    <div class="pigrid">${cast.map((c, i) => `<button class="pirow${sel.has(i) ? " on" : ""}" data-act="cl-pick" data-k="${i}" aria-pressed="${sel.has(i)}"><span class="pick">${sel.has(i) ? "■" : ""}</span>${img(c) ? `<img src="${esc(img(c))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="noimg">${esc(nm(c).charAt(0))}</span>`}<span class="t">${esc(nm(c))}</span><span class="hint">${esc(sub(c))}</span></button>`).join("") || `<p class="hint">Nothing loaded for this yet.</p>`}</div>
    <div class="bar pibar"><span class="spacer"></span><button class="btn gold" data-act="cl-add" ${sel.size ? "" : "disabled"}>Add ${sel.size}</button></div>`
    );
};
function castListClick(act, t, k, m) {
    if (act === "cast-tolist") {
        const im = ui.modal;
        if (!im || im.kind !== "item") return true;
        const what = k || "chars",
            id = im.id;
        const go = () => openModal("castlist", { id, what, back: { ...im } });
        if (castCache.has(id)) go();
        else
            fetchCast(id)
                .then(go)
                .catch(() => toast("Couldn't load the list for this"));
        return true;
    }
    if (!m || m.kind !== "castlist") return false;
    if (act === "cl-pick") {
        const i = Number(k);
        m.sel.has(i) ? m.sel.delete(i) : m.sel.add(i);
        renderOverlay();
        return true;
    }
    if (act === "cl-all") {
        m.sel = new Set((castCache.get(m.id) || []).filter(c => (m.what === "chars" ? c.name : c.va)).map((_, i) => i));
        renderOverlay();
        return true;
    }
    if (act === "cl-none") {
        m.sel = new Set();
        renderOverlay();
        return true;
    }
    if (act === "cl-add") {
        const b = items.get(m.id),
            cast = (castCache.get(m.id) || []).filter(c => (m.what === "chars" ? c.name : c.va)),
            dest = ($("#cl-dest") || {}).value || "new-rank";
        const add = {};
        for (const i of m.sel) {
            const c = cast[i];
            if (!c) continue;
            if (m.what === "chars")
                add["x" + hash(norm(c.name) + "|" + m.id).toString(36)] = {
                    name: c.name,
                    image: c.src === "tmdb" ? "" : c.image || "",
                    sub: titleOf(b),
                };
            else
                add["x" + hash(norm(c.va)).toString(36)] = {
                    name: c.va,
                    image: c.vaImage || (c.src === "tmdb" ? c.image : "") || "",
                    sub: c.name ? `${c.name} · ${titleOf(b)}` : titleOf(b),
                };
        }
        const keys = Object.keys(add);
        if (!keys.length) return true;
        const lid = dest.startsWith("new-")
            ? newTierList({
                  name: `${titleOf(b)}: ${m.what === "chars" ? "characters" : "cast"}`,
                  layout: dest === "new-rank" ? "rank" : "tiers",
                  what: m.what,
              })
            : dest;
        setTier(
            lid,
            X => {
                X.ents = { ...(X.ents || {}), ...add };
                if (X.layout === "rank") {
                    const have = new Set(X.rows[0].ids);
                    X.rows[0].ids.push(...keys.filter(x => !have.has(x)));
                }
                return X;
            },
            "Add to list"
        );
        closeModal();
        toast(`Added ${plural(keys.length, "entry", "entries")}`, {
            label: "Open the list",
            fn: () => {
                ui.page = "profile";
                ui.tab = "lists";
                ui.listId = lid;
                if (!tabsFor().includes("lists")) {
                    const md = meta.modes.find(x => tabsFor(x).includes("lists"));
                    if (md) ui.mode = md.id;
                }
                render();
                scrollTo(0, 0);
            },
        });
        return true;
    }
    return false;
}
