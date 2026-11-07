// src/features/library/connect.js
// ─────────────────────────────────────────────────────────────────
//  Favourites (with characters), people, lists, franchises, compare
// ─────────────────────────────────────────────────────────────────

const favArt = b => b.favArtData || (b.favArt ? coverCache.src(b.favArt) : "") || coverSrc(b);
const charImg = c => c.imageData || coverCache.src(c.image || c.alImage || "");
const viewSeg = (key, opts) =>
    `<div class="seg" role="group">${opts.map(([k, l]) => `<button data-act="layout-view" data-key="${key}" data-k="${k}" aria-pressed="${meta.layout[key] === k}">${l}</button>`).join("")}</div>`;
// one tile everywhere: the picture, the name on hover; "large" adds name and details underneath
function favTileHTML(b, drag) {
    const src = favArt(b);
    return `<div class="ftile2"${drag ? ` draggable="true" data-favid="${esc(b.id)}"` : ""}><button class="cwrap" data-act="open" data-id="${esc(b.id)}" title="${esc(titleOf(b))}"><span class="rk">${favPos(b.id) + 1}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : coverHTML(b)}<span class="hov">${esc(titleOf(b))}</span></button></div>`;
}
// a character card is just the picture with the name along the bottom; everything else is one click away
function charTile(c, drag, big) {
    const src = charImg(c),
        from = (c.media || [])[0];
    return `<div class="ctile2${big ? " large" : ""}"${drag ? ` draggable="true" data-charid="${esc(c.id)}"` : ""}><button class="ctile" data-act="open-char" data-k="${esc(c.id)}" title="${esc(c.name)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="noimg">${esc(c.name.charAt(0))}</span>`}<span class="nm">${esc(c.name)}</span></button>
    ${big ? `<span class="t">${esc(c.name)}</span><span class="hint">${esc([from && from.title, c.va && (from && ["tv", "film"].includes(from.medium) ? "played by " : "voiced by ") + c.va].filter(Boolean).join(" · "))}</span>` : ""}</div>`;
}
const CHAR_GROUPS = ["Female", "Male", "Non-binary", "Animal", "Other"];
const charGroup = c =>
    c.group ||
    (c.gender === "Female"
        ? "Female"
        : c.gender === "Male"
          ? "Male"
          : /non-binary/i.test(c.gender || "")
            ? "Non-binary"
            : "Other");
// favourites follow the mode's shelves, so they split and merge exactly like the library does
function favouritesHTML() {
    const favs = modeItems()
        .filter(b => b.fav)
        .sort((a, b) => favPos(a.id) - favPos(b.id));
    const v = meta.layout.favView === "large" ? "large" : "grid",
        split = meta.layout.favSplit !== "together",
        cs = meta.layout.charSplit === "group";
    const sh = shelvesOf();
    const groups =
        split && sh.length > 1
            ? sh.map(s => [s.name, favs.filter(b => s.test(b))]).filter(g => g[1].length)
            : [["", favs]];
    const tile = b => {
        if (v === "large")
            return `<div class="ftile2 large" draggable="true" data-favid="${esc(b.id)}"><button class="cwrap" data-act="open" data-id="${esc(b.id)}"><span class="rk">${favPos(b.id) + 1}</span>${favArt(b) ? `<img src="${esc(favArt(b))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : coverHTML(b)}</button>
      <span class="t">${esc(titleOf(b))}</span><span class="hint">${esc([b.kind || MEDIA[b.medium].one, b.year].filter(Boolean).join(" · "))}${b.rating ? " · " + b.rating : ""}</span>${b.favWhy ? `<p class="why">${esc(b.favWhy.slice(0, 160))}</p>` : ""}<button class="linkbtn" data-act="fav-edit" data-id="${esc(b.id)}">Picture & why</button></div>`;
        return favTileHTML(b, true);
    };
    const chars = charsInMode(),
        cgroups = cs
            ? CHAR_GROUPS.map(g => [g, chars.filter(c => charGroup(c) === g)]).filter(x => x[1].length)
            : [["", chars]];
    const q = norm(ui.charQ || "");
    return `<div class="ph"><div class="ttl"><p>One master order; every mode shows its slice. Split follows this mode's shelves. Drag to reorder.</p></div><span class="spacer"></span>
      ${
          sh.length > 1
              ? viewSeg("favSplit", [
                    ["shelf", "By shelf"],
                    ["together", "All together"],
                ])
              : ""
      }${viewSeg("favView", [
          ["grid", "Covers"],
          ["large", "Large"],
      ])}<button class="btn sm ghost" data-act="fav-nums" aria-pressed="${meta.layout.favNums !== false}" title="Show or hide the position numbers">№</button><button class="btn gold" data-act="fav-add">+ Favourite</button></div>
    ${
        favs.length
            ? groups
                  .map(
                      ([
                          name,
                          list,
                      ]) => `<section class="group">${name ? `<div class="plaque"><h3>${esc(name)}</h3><span class="n">${list.length}</span></div>` : ""}
      <div class="favgrid ${v}${meta.layout.favNums === false ? " nonum" : ""}">${list.map(tile).join("")}</div></section>`
                  )
                  .join("")
            : `<div class="empty"><h3>No favourites here yet</h3><p>Press ♥ on anything's card.</p></div>`
    }
    <section class="group chars"><div class="plaque"><h3>Characters</h3><span class="n">${chars.length}</span><span class="spacer"></span>${viewSeg(
        "charSplit",
        [
            ["together", "Together"],
            ["group", "By gender"],
        ]
    )}
      <input class="inp" id="char-q" placeholder="Filter" value="${esc(ui.charQ || "")}" style="max-width:150px"><button class="btn sm gold" data-act="char-add">+ Character</button></div>
      ${
          chars.length
              ? cgroups
                    .map(([g, list]) => {
                        const shown = list.filter(
                            c =>
                                !q ||
                                norm(
                                    c.name + " " + (c.va || "") + " " + (c.media || []).map(m => m.title).join(" ")
                                ).includes(q)
                        );
                        return `${g ? `<p class="label sub">${esc(g)} · ${shown.length}</p>` : ""}<div class="chargrid2 ${v}">${shown.map(c => charTile(c, true, v === "large")).join("")}</div>`;
                    })
                    .join("")
              : `<p class="hint">Add characters from anything's Cast tab (anime, shows and films), or search for one.</p>`
      }</section>`;
}

// ── characters: one master list; each mode shows the ones from its media ──
function charInMode(c, mode = curMode()) {
    if (mode.id === "universal" || (mode.match || []).includes("*")) return true;
    return (c.media || []).some(x => {
        const it = x.id && items.get(x.id);
        return it ? inMode(it, mode) : x.medium ? matchPats({ medium: x.medium, kind: "" }, mode.match) : false;
    });
}
const charsInMode = () =>
    ui.private ? [] : meta.chars.filter(c => charInMode(c)).sort((a, b) => (a.rank || 999) - (b.rank || 999));

// ── people: one record per person, any number of roles across any media ──
const ROLE_LIST = [
    "Author",
    "Mangaka",
    "Artist",
    "Illustrator",
    "Writer",
    "Screenwriter",
    "Director",
    "Producer",
    "Showrunner",
    "Creator",
    "Actor",
    "Actress",
    "Voice actor",
    "Composer",
    "Studio",
    "Developer",
    "Publisher",
    "Network",
    "Original creator",
];
const roleFor = b =>
    ({
        book: "Author",
        novel: "Author",
        manga: "Author",
        manhwa: "Author",
        comic: "Writer",
        anime: "Studio",
        tv: "Creator",
        film: "Director",
        game: "Developer",
        album: "Artist",
    })[b.medium] || "Creator";
const splitNames = s =>
    String(s || "")
        .split(/\s*(?:&|,|;|\/|\band\b)\s*/)
        .map(x => x.trim())
        .filter(x => x.length > 1 && x.length < 60);
function peopleIndex(mode = curMode()) {
    const map = new Map(),
        key = n => norm(n);
    const get = name => {
        const k = key(name);
        if (!map.has(k)) map.set(k, { key: k, name, roles: new Set(), credits: [], saved: null });
        return map.get(k);
    };
    for (const b of modeItems(mode)) {
        for (const n of splitNames(b.creator)) {
            const p = get(n);
            const r = roleFor(b);
            p.roles.add(r);
            p.credits.push({ id: b.id, role: r });
        }
        for (const n of b.staff || []) {
            const p = get(n);
            p.roles.add("Original creator");
            p.credits.push({ id: b.id, role: "Original creator" });
        }
    }
    for (const s of meta.people || []) {
        const credits = (s.credits || []).filter(c => items.has(c.id) && inMode(items.get(c.id), mode));
        const derived = map.get(key(s.name));
        if (!derived && !credits.length && !(mode.id === "universal" || (mode.match || []).includes("*"))) continue;
        const p = get(s.name);
        p.saved = s;
        for (const r of s.roles || (s.role ? [s.role] : [])) p.roles.add(r);
        for (const c of credits) if (!p.credits.some(x => x.id === c.id && x.role === c.role)) p.credits.push(c);
    }
    return [...map.values()]
        .map(p => ({ ...p, roles: [...p.roles], n: new Set(p.credits.map(c => c.id)).size }))
        .sort(
            (a, b) =>
                !!(b.saved && b.saved.fav) - !!(a.saved && a.saved.fav) || b.n - a.n || a.name.localeCompare(b.name)
        );
}
function peopleHTML() {
    const P = peopleIndex(),
        role = ui.peopleRole || "",
        q = norm(ui.peopleQ || ""),
        v = meta.layout.peopleView || "grid";
    const roles = {};
    for (const p of P) for (const r of p.roles) roles[r] = (roles[r] || 0) + 1;
    const shown = P.filter(
        p =>
            (!role || p.roles.includes(role)) &&
            (!q || norm(p.name).includes(q)) &&
            (ui.peopleAll || p.n > 1 || (p.saved && p.saved.fav))
    );
    const img = p => p.saved && (p.saved.imageData || p.saved.image);
    return `<div class="ph"><div class="ttl"><p>Everyone behind what you love: authors, mangaka, directors, actors, voice actors, studios, developers. A person can hold any number of roles.</p></div><span class="spacer"></span>
      ${viewSeg("peopleView", [
          ["grid", "Grid"],
          ["list", "List"],
      ])}<input class="inp" id="people-q" placeholder="Filter" value="${esc(ui.peopleQ || "")}" style="max-width:180px"><button class="btn gold" data-act="person-add">+ Add a person</button></div>
    <div class="chips" style="margin-bottom:12px"><button class="chip" data-act="people-role" data-k="" aria-pressed="${!role}">Everyone</button>${Object.entries(
        roles
    )
        .sort((a, b) => b[1] - a[1])
        .map(
            ([r, n]) =>
                `<button class="chip" data-act="people-role" data-k="${esc(r)}" aria-pressed="${role === r}">${esc(r)} <span class="cn">${n}</span></button>`
        )
        .join("")}
      <label class="ctl" style="margin-left:8px"><input type="checkbox" id="people-all" ${ui.peopleAll ? "checked" : ""}> Include people with one credit</label></div>
    ${
        shown.length
            ? `<div class="pgrid ${v}">${shown
                  .slice(0, 300)
                  .map(
                      p => `<div class="pcard"><button class="pimg" data-act="open-person" data-k="${esc(p.name)}">${img(p) ? `<img src="${esc(img(p))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="noimg">${esc(p.name.charAt(0))}</span>`}</button>
      <div class="cbody"><button class="t" data-act="open-person" data-k="${esc(p.name)}">${p.saved && p.saved.fav ? "♥ " : ""}${esc(p.name)}</button><div class="hint">${esc(p.roles.join(" · "))}</div>
        <div class="pcov">${[...new Set(p.credits.map(c => c.id))]
            .slice(0, 6)
            .map(id => {
                const b = items.get(id);
                return b
                    ? `<button data-act="open" data-id="${esc(id)}" title="${esc(titleOf(b))}">${coverHTML({ id, ...b })}</button>`
                    : "";
            })
            .join("")}${p.n > 6 ? `<span class="hint">+${p.n - 6}</span>` : ""}</div></div></div>`
                  )
                  .join("")}</div>`
            : `<div class="empty"><h3>No people here yet</h3><p>Creators appear as you add things; tick "Include people with one credit" to see everyone.</p></div>`
    }`;
}

// ── lists: Up next, custom and ordered lists (reading orders), and the private vault ──
const listCard = (id, name, desc, ids, icon) => {
    const l = meta.lists.find(x => x.id === id);
    if (l && l.kind === "tier" && l.layout === "rank") {
        const top = l.rows[0].ids
            .slice(0, 5)
            .map(k => tierEnt(l, k))
            .filter(Boolean);
        return `<button class="lcard tiercard" data-act="go-list" data-k="${esc(id)}"><span class="rkprev">${top.map(e => (e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="noimg"></span>`)).join("")}</span><span class="t">№ ${esc(name)}</span><span class="hint">Ranked ${esc(TIER_WHAT[tierWhat(l)].toLowerCase())} · ${listCount(l)}</span></button>`;
    }
    if (l && l.kind === "tier")
        return `<button class="lcard tiercard" data-act="go-list" data-k="${esc(id)}"><span class="tprev">${l.rows.map(r => `<span style="background:${esc(r.color)};flex:${Math.max(1, r.ids.length)}">${esc(r.label)}</span>`).join("")}</span><span class="t">▤ ${esc(name)}</span><span class="hint">Tier list · ${esc(TIER_WHAT[tierWhat(l)].toLowerCase())} · ${listCount(l)} placed</span></button>`;
    return `<button class="lcard" data-act="go-list" data-k="${esc(id)}"><span class="lcov">${ids
        .slice(0, 4)
        .map(x => items.get(x))
        .filter(Boolean)
        .map(b => coverHTML(b))
        .join(
            ""
        )}</span><span class="t">${icon} ${esc(name)}</span><span class="hint">${ids.filter(x => items.has(x)).length} entries${desc ? " · " + esc(desc.slice(0, 60)) : ""}</span></button>`;
};
function listsHTML() {
    if (ui.listId) return listViewHTML(ui.listId);
    const L = meta.lists.filter(l => listInMode(l) && !l.private === !ui.private);
    return `<div class="ph"><div class="ttl"><p>Reading orders, watch orders, shortlists and tier lists. Numbered lists keep their order; drag to change it. Right-click a list to rename or duplicate it.</p></div><span class="spacer"></span><button class="btn" data-act="list-new" data-k="tier">+ Tier list</button><button class="btn gold" data-act="list-new">+ List</button></div>
    <div class="frgrid">${
        ui.private
            ? ""
            : listCard(
                  "queue",
                  "Up next",
                  "Your queue across everything",
                  meta.queue.filter(id => items.has(id) && visible(items.get(id)) && inMode(items.get(id))),
                  "⧗"
              )
    }
      ${L.map(l => listCard(l.id, l.name, l.desc, l.ids, l.numbered ? "№" : "≡")).join("")}</div>`;
}
function listRows(ids, { numbered, lid, notes = {}, queue }) {
    return `<div class="queue">${ids
        .map((id, i) => {
            const b = { id, ...items.get(id) };
            return `<div class="qi" draggable="true" data-lid="${esc(lid)}" data-qid="${esc(id)}"><span class="h" aria-hidden="true">⋮⋮</span>${numbered ? `<span class="num rk">${i + 1}</span>` : ""}${coverHTML(b)}
    <div style="min-width:0"><button class="t" data-act="open" data-id="${esc(id)}">${esc(titleOf(b))}</button><div class="hint">${mDot(b.medium)}${esc([b.kind || MEDIA[b.medium].one, b.year, b.creator].filter(Boolean).join(" · "))} · ${esc(statusWord(b.status, b.medium))}</div>
      ${queue ? "" : `<input class="inp lnote" data-lnote="${esc(lid)}" data-id="${esc(id)}" value="${esc(notes[id] || "")}" placeholder="Note for this entry">`}</div>
    <div class="bar"><button class="btn sm" data-act="li-move" data-lid="${esc(lid)}" data-id="${esc(id)}" data-k="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button><button class="btn sm" data-act="li-move" data-lid="${esc(lid)}" data-id="${esc(id)}" data-k="1" ${i === ids.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
      ${queue ? `<button class="btn sm gold" data-act="start" data-id="${esc(id)}">Start</button>` : ""}<button class="btn sm ghost" data-act="li-remove" data-lid="${esc(lid)}" data-id="${esc(id)}" aria-label="Remove">✕</button></div></div>`;
        })
        .join("")}</div>`;
}
function listViewHTML(id) {
    const back = `<div class="eyebrow"><button class="linkbtn" data-act="go-list" data-k="">Lists</button> /</div>`;
    if (id === "queue") {
        const ids = meta.queue.filter(x => items.has(x) && visible(items.get(x)) && inMode(items.get(x)));
        return `<div class="ph"><div class="ttl">${back}<h2 class="ltitle">Up next</h2><p>One queue for everything. Drag to reorder; starting something takes it off.</p></div><span class="spacer"></span><button class="btn" data-act="li-add" data-k="queue">+ Add</button></div>
      ${ids.length ? listRows(ids, { numbered: true, lid: "queue", queue: true }) : `<div class="empty"><h3>Nothing queued</h3><p>Add what you plan to start next.</p></div>`}`;
    }
    if (id === "private") {
        ui.listId = null;
        return listsHTML();
    }
    const l = meta.lists.find(x => x.id === id);
    if (!l) {
        ui.listId = null;
        return listsHTML();
    }
    if (l.kind === "tier") return tierListHTML(l);
    const ids = l.ids.filter(x => items.has(x) && visible(items.get(x)));
    return `<div class="ph"><div class="ttl">${back}<h2><input class="h2in" id="list-name" value="${esc(l.name)}" aria-label="List name"></h2><input class="inp ldesc" id="list-desc" value="${esc(l.desc || "")}" placeholder="What this list is for (optional)"></div><span class="spacer"></span>
      <label class="ctl"><input type="checkbox" id="list-numbered" ${l.numbered ? "checked" : ""}> Numbered order</label>
      <select class="sel" id="list-sort"><option value="">Sort once by…</option><option value="year">Release year</option><option value="title">Title</option><option value="rating">Your score</option><option value="added">Date added</option></select>
      <button class="btn" data-act="li-add" data-k="${esc(l.id)}">+ Add</button>${ui.confirmListDel ? `<button class="btn danger" data-act="list-del-yes">Delete list</button><button class="btn ghost" data-act="list-del-no">Keep</button>` : `<button class="btn danger" data-act="list-del">Delete</button>`}</div>
    ${ids.length ? listRows(ids, { numbered: l.numbered, lid: l.id, notes: l.notes || {} }) : `<div class="empty"><h3>Empty list</h3><p>Add entries with + Add, or from any card's "Lists" section, or select several in the library.</p></div>`}`;
}

// ── franchises ──
function franchises() {
    const parent = new Map(),
        find = x => {
            while (parent.get(x) !== x) {
                parent.set(x, parent.get(parent.get(x)));
                x = parent.get(x);
            }
            return x;
        },
        uni = (a, b) => {
            parent.set(find(a), find(b));
        };
    for (const id of items.keys()) parent.set(id, id);
    const byName = new Map();
    for (const [id, b] of items) {
        if (!visible(b)) continue;
        for (const l of b.links || []) if (FRANCHISE_TYPES.has(l.type) && items.has(l.id)) uni(id, l.id);
        if (b.franchise) {
            const k = norm(b.franchise);
            if (byName.has(k)) uni(id, byName.get(k));
            else byName.set(k, id);
        }
    }
    const groups = new Map();
    for (const [id, b] of items) {
        if (!visible(b)) continue;
        const r = find(id);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(id);
    }
    return [...groups.values()]
        .filter(g => g.length > 1)
        .map(ids => {
            const members = ids
                .map(id => ({ id, ...items.get(id) }))
                .sort((a, b) => (a.year || 9999) - (b.year || 9999) || mediumRank(a.medium) - mediumRank(b.medium));
            const named = members.find(b => b.franchise);
            return {
                key: ids.slice().sort()[0],
                name: named ? named.franchise : cleanTitle(titleOf(members[0])),
                members,
                media: [...new Set(members.map(b => b.medium))],
                done: members.filter(b => b.status === "done").length,
            };
        })
        .filter(f => f.members.some(b => inMode(b)))
        .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
}
function franchisesHTML() {
    const F = franchises();
    if (ui.franchise) {
        const f = F.find(x => x.key === ui.franchise || x.members.some(m => m.id === ui.franchise));
        if (f) return franchiseHTML(f);
        ui.franchise = null;
    }
    const cross = F.filter(f => f.media.length > 1);
    return `<div class="ph"><div class="ttl"><p>Adaptations, sequels, spin-offs and shared worlds, joined up across media. AniList relations link automatically; link anything else from a card's Connections tab.</p></div></div>
    ${
        F.length
            ? `${cross.length ? `<p class="label" style="margin-bottom:10px">Across media · ${cross.length}</p><div class="frgrid">${cross.map(frCard).join("")}</div>` : ""}
      ${
          F.length > cross.length
              ? `<p class="label" style="margin:18px 0 10px">Within one medium · ${F.length - cross.length}</p><div class="frgrid">${F.filter(
                    f => f.media.length === 1
                )
                    .map(frCard)
                    .join("")}</div>`
              : ""
      }`
            : `<div class="empty"><h3>No franchises yet</h3><p>Sync AniList, or link something to its adaptation or sequel in the Connections tab.</p></div>`
    }`;
}
function frCard(f) {
    return `<button class="frcard" data-act="open-franchise" data-k="${esc(f.key)}"><span class="collage">${f.members
        .slice(0, 4)
        .map(b => coverHTML(b))
        .join("")}</span>
    <span class="t">${esc(f.name)}</span><span class="hint">${f.media.map(m => esc(MEDIA[m].name)).join(" · ")}</span><span class="hint">${f.members.length} entries · ${f.done} finished</span>
    <span class="prog"><span style="width:${Math.round((f.done / f.members.length) * 100)}%"></span></span></button>`;
}
function franchiseHTML(f) {
    const inLib = new Set(f.members.map(b => b.ext && b.ext.anilist).filter(Boolean)),
        missing = new Map();
    for (const b of f.members)
        for (const r of b.rel || [])
            if (FRANCHISE_TYPES.has(r.type) && !inLib.has(r.id) && !missing.has(r.id)) missing.set(r.id, r);
    return `<div class="ph"><div class="ttl">
      <h2><input class="h2in" id="fr-name" data-k="${esc(f.key)}" value="${esc(f.name)}" aria-label="Franchise name"></h2><p>${f.members.length} entries across ${f.media.map(m => esc(MEDIA[m].name.toLowerCase())).join(", ")} · ${f.done} finished · in release order</p></div><span class="spacer"></span><button class="btn" data-act="fr-tolist" data-k="${esc(f.key)}">Make a watch/read-order list</button></div>
    <div class="timeline">${f.members
        .map(
            b => `<div class="tl"><span class="yr">${b.year || "—"}</span><span class="node" style="background:${sVar(b.medium)}"></span>
      <button class="tlc" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}<span><span class="eyebrow" style="font-size:9.5px">${esc(b.kind || MEDIA[b.medium].one)}</span><span class="t">${esc(titleOf(b))}</span>
        <span class="meta">${statusPill(b) || `<span class="hint">${esc(statusWord("want", b.medium))}</span>`}${rateShow(b.rating, scaleOf(b))}${crowdPill(b)}</span></span></button></div>`
        )
        .join("")}</div>
    ${
        missing.size
            ? `<div class="panel" style="margin-top:20px"><h3>Other parts, not in your library · ${missing.size}</h3><div class="cands">${[
                  ...missing.values(),
              ]
                  .sort((a, b) => (a.year || 9999) - (b.year || 9999))
                  .map(
                      r =>
                          `<div class="cand">${r.cover ? `<img src="${esc(r.cover)}" alt="" referrerpolicy="no-referrer">` : `<span class="nocov">${esc(MEDIA[r.medium].code)}</span>`}<span class="t">${esc(r.title)}</span><span class="hint">${esc(r.label)} · ${esc(r.kind)}${r.year ? " · " + r.year : ""}</span><button class="btn sm" data-act="rel-add" data-k="${r.id}" data-src="${esc(f.members[0].id)}">+ Add</button></div>`
                  )
                  .join("")}</div></div>`
            : ""
    }`;
}

// ── compare ──
function compareHTML() {
    const A = modeItems(),
        rated = A.filter(b => b.rating && crowd(b).avg != null);
    const W = 640,
        H = 360,
        P = 36,
        lo = 30,
        sx = v => P + ((Math.max(lo, v) - lo) / (100 - lo)) * (W - P - 10),
        sy = v => H - P - ((Math.max(lo, v) - lo) / (100 - lo)) * (H - P - 10);
    const ticks = [40, 60, 80, 100];
    const scatter = rated.length
        ? `<svg class="chart scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your score against the crowd">
    ${ticks.map(t => `<line class="gridl" x1="${sx(t)}" x2="${sx(t)}" y1="10" y2="${H - P}"/><line class="gridl" x1="${P}" x2="${W - 10}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${sx(t)}" y="${H - P + 16}" text-anchor="middle">${t}</text><text x="${P - 6}" y="${sy(t) + 3}" text-anchor="end">${t}</text>`).join("")}
    <line class="diag" x1="${sx(lo)}" y1="${sy(lo)}" x2="${sx(100)}" y2="${sy(100)}"/>
    <text x="${W / 2}" y="${H - 4}" text-anchor="middle">Crowd score</text><text x="12" y="${H / 2}" text-anchor="middle" transform="rotate(-90 12 ${H / 2})">Your score</text>
    ${rated
        .map(b => {
            const c = crowd(b).avg,
                m = mine(b);
            return `<g class="dotg" data-act="open" data-id="${esc(b.id)}"><circle class="hit" cx="${sx(c)}" cy="${sy(m)}" r="10"/><circle cx="${sx(c)}" cy="${sy(m)}" r="5" fill="var(--s${catIdx(b) + 1})" class="dot"/><title>${esc(titleOf(b))}: you ${b.rating}/10, crowd ${c}/100</title></g>`;
        })
        .join("")}</svg>`
        : "";
    const delta = rated.map(b => ({ ...b, d: mine(b) - crowd(b).avg })).sort((a, b) => b.d - a.d);
    const row = b =>
        `<button class="drow" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}<span class="t">${esc(titleOf(b))}</span><span class="num">you ${b.rating}</span><span class="num">crowd ${crowd(b).avg}</span><span class="num ${b.d >= 0 ? "up" : "down"}">${b.d >= 0 ? "+" : "−"}${Math.abs(Math.round(b.d))}</span></button>`;
    const sh = shelvesOf();
    const mrows = sh
        .map(s => {
            const L = A.filter(b => s.test(b)),
                r = L.filter(b => b.rating),
                c = L.map(b => crowd(b).avg).filter(v => v != null);
            return {
                name: s.name,
                n: L.length,
                fin: L.filter(b => b.status === "done").length,
                mean: r.length ? r.reduce((a, b) => a + b.rating, 0) / r.length : null,
                crowd: c.length ? c.reduce((a, b) => a + b, 0) / c.length : null,
                min: L.reduce((a, b) => a + minutesSpent(b), 0),
            };
        })
        .filter(r => r.n);
    const gcount = {};
    for (const b of A) for (const g of b.genres || []) gcount[g] = (gcount[g] || 0) + 1;
    const topG = Object.entries(gcount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(x => x[0]);
    const cell = (g, s) => {
        const L = A.filter(b => s.test(b) && (b.genres || []).includes(g));
        const r = L.filter(b => b.rating);
        const mean = r.length ? r.reduce((a, b) => a + b.rating, 0) / r.length : null;
        return `<td class="hc" style="${mean ? `background:color-mix(in srgb,var(--accent) ${Math.round((Math.max(0, mean - 4) / 6) * 70)}%,transparent)` : ""}" title="${esc(g)} · ${esc(s.name)}: ${L.length} items${mean ? ", your mean " + mean.toFixed(1) : ""}">${L.length ? `<b>${L.length}</b>${mean ? `<small>${mean.toFixed(1)}</small>` : ""}` : ""}</td>`;
    };
    const opts = all()
        .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
        .map(b => `<option value="${esc(titleOf(b))} · ${esc(MEDIA[b.medium].one)}">`)
        .join("");
    const pa = ui.cmpA && items.get(ui.cmpA),
        pb = ui.cmpB && items.get(ui.cmpB),
        present = SERIES.map(s => rated.some(b => catOf(b) === s[0]));
    return `<div class="dash">
      <section class="panel span8"><h3>You vs the crowd · ${rated.length} scored</h3>${rated.length ? (present.filter(Boolean).length > 1 ? legend(present) : "") + scatter + `<p class="hint">Above the line you liked it more than most people did. Crowd scores average every site that has one, scaled to 100.</p>` : `<p class="hint">Score a few things on their cards (or sync AniList) and crowd scores fill in automatically.</p>`}</section>
      <section class="panel span4"><h3>You love more than most</h3>${
          delta
              .filter(b => b.d > 0)
              .slice(0, 8)
              .map(row)
              .join("") || `<p class="hint">Nothing yet.</p>`
      }
        <h3 style="margin-top:16px">The crowd loves more than you</h3>${
            delta
                .filter(b => b.d < 0)
                .slice(-8)
                .reverse()
                .map(row)
                .join("") || `<p class="hint">Nothing yet.</p>`
        }</section>
      ${
          mrows.length > 1
              ? `<section class="panel span12"><h3>Across shelves</h3><div class="tablewrap"><table class="lib small"><thead><tr><th>Shelf</th><th>Items</th><th>Finished</th><th>Your mean</th><th>Crowd mean</th><th>Time</th></tr></thead><tbody>
        ${mrows.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.n}</td><td class="num">${r.fin}</td><td class="num">${r.mean ? r.mean.toFixed(1) + " / 10" : "–"}</td><td class="num">${r.crowd ? Math.round(r.crowd) + " / 100" : "–"}</td><td class="num">${fmtHours(r.min)}</td></tr>`).join("")}</tbody></table></div></section>`
              : ""
      }
      ${
          topG.length && sh.length > 1
              ? `<section class="panel span12"><h3>Genres across shelves</h3><p class="hint" style="margin-bottom:8px">How many of each genre you have per shelf, with your mean score. Darker means you rate it higher.</p><div class="tablewrap"><table class="lib small heatt"><thead><tr><th>Genre</th>${sh.map(s => `<th>${esc(s.name)}</th>`).join("")}</tr></thead><tbody>
        ${topG.map(g => `<tr><td><button class="linkbtn" data-act="go-genre" data-k="${esc(g)}">${esc(g)}</button></td>${sh.map(s => cell(g, s)).join("")}</tr>`).join("")}</tbody></table></div></section>`
              : ""
      }
      <section class="panel span12"><h3>Side by side</h3><div class="bar"><input class="inp" id="cmp-a" list="cmp-opts" placeholder="Pick anything…" value="${pa ? esc(titleOf(pa)) + " · " + esc(MEDIA[pa.medium].one) : ""}" style="max-width:300px"><span class="hint">vs</span><input class="inp" id="cmp-b" list="cmp-opts" placeholder="…and something else" value="${pb ? esc(titleOf(pb)) + " · " + esc(MEDIA[pb.medium].one) : ""}" style="max-width:300px"><datalist id="cmp-opts">${opts}</datalist></div>
        ${pa && pb ? sideBySide({ id: ui.cmpA, ...pa }, { id: ui.cmpB, ...pb }) : `<p class="hint" style="margin-top:8px">Compare any two things, even a book and a game.</p>`}</section>
    </div>`;
}
function sideBySide(a, b) {
    const rows = [
        ["Type", x => x.kind || MEDIA[x.medium].one],
        ["Year", x => x.year || "–"],
        ["Creator", x => x.creator || "–"],
        ["Your score", x => (x.rating ? x.rating + " / 10" : "–")],
        [
            "Crowd",
            x =>
                crowd(x).avg != null
                    ? crowd(x).avg +
                      " / 100 (" +
                      crowd(x)
                          .parts.map(p => p.label + " " + p.show)
                          .join(", ") +
                      ")"
                    : "–",
        ],
        [
            "Length",
            x => (x.medium === "film" ? (x.runtime || "?") + " min" : x.total ? x.total + " " + unitOf(x)[1] : "–"),
        ],
        ["Time it takes", x => fmtHours(lenOf(x))],
        ["Your time so far", x => fmtHours(minutesSpent(x))],
        ["Status", x => statusWord(x.status, x.medium)],
        ["Genres", x => (x.genres || []).join(", ") || "–"],
        ["Ranking", x => (x.elo ? x.elo + " (" + plural(x.h2h || 0, "pick") + ")" : "–")],
        ["Your notes", x => x.why || x.notes || x.favWhy || "–"],
    ];
    const shared = (a.genres || []).filter(g => (b.genres || []).includes(g));
    return `<div class="sbs"><div class="sbh">${[a, b].map(x => `<button data-act="open" data-id="${esc(x.id)}">${coverHTML(x)}<span class="t">${esc(titleOf(x))}</span></button>`).join("<span class='vs'>vs</span>")}</div>
    <table class="lib small"><tbody>${rows.map(([l, f]) => `<tr><th>${esc(l)}</th><td>${esc(f(a))}</td><td>${esc(f(b))}</td></tr>`).join("")}</tbody></table>
    ${shared.length ? `<p class="hint">Shared genres: ${esc(shared.join(", "))}.</p>` : ""}<div class="bar"><button class="btn sm" data-act="cmp-link">Link these two</button><button class="btn sm ghost" data-act="cmp-rank">Pick a winner in Rank</button></div></div>`;
}
