// src/features/library/library.js
// ─────────────────────────────────────────────────────────────────
//  Library: four views (Cover, Grid, Spine, List), one detailed filter, size and spacing always to hand
// ─────────────────────────────────────────────────────────────────

const VIEW_LIST = [
    ["cover", "Cover", "Covers only, edge to edge"],
    ["grid", "Grid", "Covers with title and details underneath"],
    ["spine", "Spine", "Spines on a shelf, sized like the real thing"],
    ["list", "List", "A sortable table"],
];
const heartHTML = b =>
    `<span class="heart${b.fav ? " on" : ""}" data-act="fav-toggle" data-id="${esc(b.id)}" aria-hidden="true" title="${b.fav ? "Favourite · click to remove" : "Add to favourites"}">${b.fav ? ICON.heart : ICON.heartLine}</span>`;
const scoreTag = b => {
    const r = b.rating || (b.parts ? partsScore(b) : 0);
    return r
        ? `<span class="sctag${b.rating ? "" : " avg"}" title="${b.rating ? "Your score" : "Average of its parts"}">${esc(fmtScore(r, b.rating ? scaleOf(b) : undefined))}</span>`
        : "";
};
// the filter: every condition in one panel; status stays as chips above the shelf
// the season something first aired in (anime), as one word
const seasonWord = b =>
    ({ WINTER: "Winter", SPRING: "Spring", SUMMER: "Summer", FALL: "Autumn", AUTUMN: "Autumn" })[
        String(b.season || "").toUpperCase()
    ] || "";
const FILT_EMPTY = () => ({
    kinds: [],
    genres: [],
    themes: [],
    tags: [],
    modes: [],
    seasons: [],
    own: "",
    smin: "",
    smax: "",
    ymin: "",
    ymax: "",
    fav: false,
    unscored: false,
    started: "",
    rules: [],
    any: false,
});
function filterCount(f = ui.filt || {}) {
    return (
        (f.rules || []).filter(r => r.v !== "" && r.v != null).length +
        ["kinds", "genres", "themes", "tags", "modes", "seasons"].reduce(
            (a, k) => a + ((f[k] || []).length ? 1 : 0),
            0
        ) +
        ["own", "smin", "smax", "ymin", "ymax", "started"].filter(k => f[k] !== "" && f[k] != null).length +
        (f.fav ? 1 : 0) +
        (f.unscored ? 1 : 0)
    );
}
function filterOk(b, f) {
    if (!f) return true;
    if ((f.kinds || []).length && !f.kinds.includes(kindShown(b))) return false;
    if ((f.themes || []).length && !f.themes.some(g => (b.themes || []).includes(g))) return false;
    if ((f.seasons || []).length && !f.seasons.includes(seasonWord(b))) return false;
    if ((f.rules || []).length && !rulesOk(b, f)) return false;
    if ((f.genres || []).length && !f.genres.some(g => (b.genres || []).includes(g))) return false;
    if ((f.tags || []).length && !f.tags.some(t => (b.tags || []).includes(t))) return false;
    if ((f.modes || []).length && !f.modes.some(mid => inMode(b, modeById(mid)))) return false;
    if (f.own) {
        const c = b.copy || "none";
        if (
            f.own === "owned"
                ? c === "none"
                : f.own === "buy"
                  ? !b.toBuy
                  : f.own === "physical"
                    ? !["physical", "both"].includes(c)
                    : f.own === "digital"
                      ? !["digital", "both"].includes(c)
                      : c !== f.own
        )
            return false;
    }
    const n = v => (v === "" || v == null ? null : Number(v));
    if (n(f.smin) != null && (b.rating || 0) < parseScore(f.smin)) return false;
    if (n(f.smax) != null && (!b.rating || b.rating > parseScore(f.smax))) return false;
    if (n(f.ymin) != null && (!b.year || b.year < n(f.ymin))) return false;
    if (n(f.ymax) != null && (!b.year || b.year > n(f.ymax))) return false;
    if (f.fav && !b.fav) return false;
    if (f.unscored && b.rating) return false;
    if (f.started === "yes" && !(b.prog > 0)) return false;
    if (f.started === "no" && b.prog > 0) return false;
    return true;
}
function libraryList() {
    const q = norm(ui.q),
        shelf = ui.shelfKey ? shelvesOf().find(s => s.key === ui.shelfKey) : null,
        f = ui.filt;
    return (ui.q && ui.searchAll ? all() : modeItems()).filter(
        b =>
            (!shelf || shelf.test(b)) &&
            (ui.status === "all" || b.status === ui.status) &&
            filterOk(b, f) &&
            (!q ||
                [
                    b.title,
                    b.alt && b.alt.en,
                    b.alt && b.alt.romaji,
                    b.alt && b.alt.native,
                    b.creator,
                    b.subject,
                    b.kind,
                    b.series,
                    b.notes,
                    (b.genres || []).join(" "),
                    (b.tags || []).join(" "),
                ].some(v => norm(v).includes(q)))
    );
}
function filterPanelHTML(base) {
    const f = (ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}) }),
        cnt = (arr, key) => {
            const c = {};
            for (const b of base) for (const x of [].concat(key(b) || [])) if (x) c[x] = (c[x] || 0) + 1;
            return Object.entries(c).sort((a, b) => b[1] - a[1]);
        };
    const chips = (k, list, max = 40) =>
        list.length
            ? `<div class="chips wrapchips">${list
                  .slice(0, max)
                  .map(
                      ([v, n]) =>
                          `<button class="chip" data-act="filt-tog" data-f="${k}" data-k="${esc(v)}" aria-pressed="${(f[k] || []).includes(v)}">${esc(v)} <span class="cn">${n}</span></button>`
                  )
                  .join("")}</div>`
            : `<p class="hint">None here.</p>`;
    const seasons = cnt(base, b => seasonWord(b)).sort(
            (a, b) =>
                ["Winter", "Spring", "Summer", "Autumn"].indexOf(a[0]) -
                ["Winter", "Spring", "Summer", "Autumn"].indexOf(b[0])
        ),
        kinds = cnt(base, b => kindShown(b)),
        genres = cnt(base, b => b.genres),
        themes = cnt(base, b => b.themes),
        tags = cnt(base, b => b.tags),
        adv = !!ui.filtAdv;
    const stc = {};
    for (const b of base) stc[b.status] = (stc[b.status] || 0) + 1;
    const sc = scoreMax(),
        step = meta.settings.ratingScale === "10d" ? ".1" : meta.settings.ratingScale === "5" ? ".5" : "1";
    return `<div class="filtpanel panel">
    <div class="fp-head"><b>Filter</b><div class="seg">${[
        ["", "Basic"],
        ["1", "Advanced"],
    ]
        .map(([k, l]) => `<button data-act="filt-adv" data-k="${k}" aria-pressed="${!!k === adv}">${l}</button>`)
        .join(
            ""
        )}</div><span class="hint">${filterCount(f) + (ui.status !== "all" ? 1 : 0) ? plural(filterCount(f) + (ui.status !== "all" ? 1 : 0), "condition") : "Nothing filtered"}</span><span class="spacer"></span><button class="linkbtn" data-act="filt-clear">Clear all</button><button class="btn sm ghost" data-act="filter-toggle">Done</button></div>
    <div class="fp-grid">
      <div class="fp wide"><p class="label">Status</p><div class="chips wrapchips">${[["all", "Everything", base.length], ...STATUS.filter(s => stc[s] || ui.status === s).map(s => [s, STATUS_WORDS[groupWord()][s], stc[s] || 0])].map(([k, l, n]) => `<button class="chip st-${k}" data-act="f-status" data-k="${k}" aria-pressed="${ui.status === k}">${esc(l)} <span class="cn">${n}</span></button>`).join("")}</div></div>
      ${
          isUniversal()
              ? `<div class="fp"><p class="label">Modes</p><div class="chips wrapchips">${meta.modes
                    .filter(x => x.id !== "universal")
                    .map(
                        x =>
                            `<button class="chip" data-act="filt-tog" data-f="modes" data-k="${esc(x.id)}" aria-pressed="${f.modes.includes(x.id)}">${esc(x.g || "")} ${esc(x.name)}</button>`
                    )
                    .join("")}</div></div>`
              : ""
      }
      <div class="fp"><p class="label">Type</p>${chips("kinds", kinds)}</div>
      <div class="fp wide"><p class="label">Genre <span class="hint">· any of</span></p>${chips("genres", genres, 60)}</div>
      ${adv && themes.length ? `<div class="fp wide"><p class="label">Themes <span class="hint">· from AniList, TMDB and IGDB · any of</span></p>${chips("themes", themes, 80)}</div>` : ""}
      ${tags.length ? `<div class="fp"><p class="label">Your tags</p>${chips("tags", tags)}</div>` : ""}
      <div class="fp"><p class="label">Your score</p><div class="bar"><input class="inp" data-filt="smin" inputmode="decimal" placeholder="from" value="${esc(f.smin)}" style="width:72px"><span class="hint">to</span><input class="inp" data-filt="smax" inputmode="decimal" placeholder="${sc}" value="${esc(f.smax)}" style="width:72px"><label class="ctl"><input type="checkbox" data-filtc="unscored" ${f.unscored ? "checked" : ""}> Not scored</label></div></div>
      <div class="fp"><p class="label">Released</p><div class="bar"><input class="inp" data-filt="ymin" inputmode="numeric" placeholder="from" value="${esc(f.ymin)}" style="width:72px"><span class="hint">to</span><input class="inp" data-filt="ymax" inputmode="numeric" placeholder="to" value="${esc(f.ymax)}" style="width:72px"></div></div>
      ${seasons.length ? `<div class="fp"><p class="label">Season</p>${chips("seasons", seasons)}</div>` : ""}
      ${
          adv
              ? `
      <div class="fp"><p class="label">Ownership</p>${selOf(
          "filt-own",
          [
              ["", "Any"],
              ["owned", "Own it"],
              ["physical", "Physical"],
              ["digital", "Digital"],
              ["none", "Don't own"],
              ["buy", "Plan to buy"],
          ],
          f.own
      )}</div>`
              : ""
      }
      <div class="fp"><p class="label">Progress</p>${selOf(
          "filt-started",
          [
              ["", "Any"],
              ["yes", "Started"],
              ["no", "Not started"],
          ],
          f.started
      )}<label class="ctl" style="margin-top:6px"><input type="checkbox" data-filtc="fav" ${f.fav ? "checked" : ""}> Favourites only</label></div>
    </div>${adv ? rulesHTML(f) : ""}<input type="hidden" value="${step}"></div>`;
}

// ── tiles ──
function cardHTML(b, badge = "") {
    const sub = ["book", "novel", "manga", "manhwa", "comic"].includes(b.medium)
        ? b.creator || ""
        : [kindShown(b) || MEDIA[b.medium].one, b.year].filter(Boolean).join(" · ");
    const bx = boxAttr(b);
    return `<button class="card${bx.cls}${ui.sel.has(b.id) ? " sel" : ""}" data-act="open" data-id="${esc(b.id)}" data-oid="${esc(b.id)}" draggable="true"${bx.st ? ` style="${bx.st}"` : ""}><span class="check">✓</span>${badge}<span class="cwrap">${coverHTML(b)}${scoreTag(b)}${partsBadge(b)}${heartHTML(b)}</span>
    <span class="t">${esc(titleOf(b))}</span><span class="a">${esc(sub)}</span>
    ${(b.status === "active" || b.status === "redo") && b.total ? `<span class="prog" title="${pct(b)}%"><span style="width:${pct(b)}%"></span></span>` : ""}</button>`;
}
function coverTile(b, badge = "") {
    const bx = boxAttr(b);
    return `<button class="fo${bx.cls}${ui.sel.has(b.id) ? " sel" : ""}" data-act="open" data-id="${esc(b.id)}" data-oid="${esc(b.id)}" draggable="true" style="${bx.st}${b.coverColor && b.coverColor !== "none" ? "--cc:" + b.coverColor + ";" : ""}--ts:${(spineDims(b)[0] / 19).toFixed(3)}"><span class="check">✓</span>${badge}${coverHTML(b)}${scoreTag(b)}${partsBadge(b)}${heartHTML(b)}<span class="hov">${esc(titleOf(b))}</span>${(b.status === "active" || b.status === "redo") && b.total ? `<span class="foprog"><span style="width:${pct(b)}%"></span></span>` : ""}</button>`;
}
// ── spines: heights and widths from the real object (cm), so a shelf looks like a shelf ──
// Books use their printed size when Open Library knows it; games use the case for the platform you play on.
const CM = 8,
    THICK = 1.7;
const GAME_CASE = [
    [/PlayStation 5|PS5|PlayStation 4|PS4/i, 17, 1.25, "PS"],
    [/PlayStation 3|PS3/i, 17, 1.4, "PS3"],
    [/PlayStation 2|PS2/i, 19, 1.4, "PS2"],
    [/PS Vita|PlayStation Vita/i, 13.5, 1, "Vita"],
    [/PSP/i, 17.8, 1.4, "PSP"],
    [/^PlayStation$|PS1|PSX/i, 14.2, 1, "PS1"],
    [/Switch/i, 17, 1.1, "Switch"],
    [/Wii U/i, 19, 1.4, "Wii U"],
    [/Wii/i, 19, 1.4, "Wii"],
    [/GameCube/i, 19, 1.4, "GC"],
    [/3DS/i, 13.6, 1.5, "3DS"],
    [/\bDS\b|Nintendo DS/i, 13.6, 1.5, "DS"],
    [/Game Boy/i, 12.5, 3, "GB"],
    [/Xbox/i, 19, 1.4, "Xbox"],
    [/PC|Windows|macOS|Linux|Steam/i, 19, 1.4, "PC"],
    [/iOS|Android|Mobile/i, 14, 0.8, "Mobile"],
];
// the front of the box, width ÷ height: a Switch case is narrow, a DS case nearly square, an American SNES box lies on its side
const GAME_BOX = [
    [/PlayStation 5|PS5|PlayStation 4|PS4|PlayStation 3|PS3|Xbox One|Xbox Series|Wii U/i, 0.79],
    [/PS Vita|PlayStation Vita/i, 0.78],
    [/PSP/i, 0.58],
    [/Switch/i, 0.62],
    [/3DS|\bDS\b|Nintendo DS/i, 0.91],
    [/^PlayStation$|PS1|PSX/i, 1.12],
    [/Game Boy|GBA/i, 0.96],
    [/Super Nintendo|SNES|Nintendo 64|N64/i, 1.38],
    [/\bNES\b|Nintendo Entertainment/i, 0.73],
    [/Wii|GameCube|Xbox|PlayStation 2|PS2|Mega Drive|Genesis|Dreamcast|Saturn/i, 0.71],
    [/PC|Windows|macOS|Mac|Linux|Steam/i, 0.71],
    [/iOS|Android|Mobile/i, 1],
];
const gameAspect = b => {
    const p = b.platform || (b.platforms || [])[0] || "";
    return (GAME_BOX.find(([re]) => re.test(p)) || [null, 0.71])[1];
};
const boxShapes = () => meta.settings.gameBoxes !== false;
const boxAttr = b =>
    b.medium === "game" && boxShapes() ? { cls: " gbox", st: `--ar:${gameAspect(b)};` } : { cls: "", st: "" };
function gameCase(b) {
    const p = b.platform || (b.platforms || [])[0] || "";
    return GAME_CASE.find(([re]) => re.test(p)) || [null, 19, 1.4, p ? p.slice(0, 6) : "Game"];
}
function spineDims(b) {
    const m = b.medium,
        h0 = (hash(b.title) % 10) / 10 - 0.5;
    if (m === "book") {
        if (b.dims && b.dims.h)
            return [b.dims.h, Math.min(6, b.dims.d || Math.max(0.8, (b.total || 300) * 0.0062 + 0.25))];
        const pages = Math.min(
                900,
                b.total || (b.format === "Short" ? 260 : b.format === "Long" || b.format === "Textbook" ? 520 : 360)
            ),
            h =
                b.kind === "Academic" || b.format === "Textbook"
                    ? 24.5
                    : b.kind === "Poetry"
                      ? 20
                      : pages > 650
                        ? 23.5
                        : b.format === "Short"
                          ? 19.6
                          : 21;
        return [h + h0 * 0.8, Math.min(5.5, Math.max(0.8, pages * 0.0062 + 0.25))];
    }
    if (m === "novel") return [18.5 + h0 * 0.4, Math.max(1, (b.vols || 1) * 1.7)];
    if (m === "manga") return [17.6, b.vols ? Math.min(14, b.vols * 1.6) : 1.6];
    if (m === "manhwa") return [21, b.vols ? Math.min(14, b.vols * 1.5) : 1.5];
    if (m === "comic") return [25.8 + h0 * 0.6, Math.max(1, (b.total || 6) * 0.25 + 0.4)];
    if (m === "game") {
        const c = gameCase(b);
        return [c[1], c[2]];
    }
    // films and series: a DVD case, a Blu-ray case, or a box set for a long show
    const blu = b.copy === "physical" && /blu/i.test(b.format || ""),
        h = blu ? 17 : 19;
    if (m === "film" || b.kind === "Movie") return [h, 1.4];
    const seasons = (b.seasons || []).length || Math.max(1, Math.ceil((b.total || 12) / (m === "anime" ? 12 : 10)));
    return [h, Math.min(9, 1.4 * seasons)];
}
function spineHTML(b, call, vol) {
    const [bg, fg] = spineColour(b),
        m = b.medium,
        real = !vol && b.spineArt ? coverCache.src(b.spineArt) : "",
        src = real || (modeTheme().spine === "cover" ? coverSrc(b) : "");
    let [hcm, wcm] = spineDims(b);
    if (vol) wcm = m === "manhwa" ? 1.5 : m === "novel" ? 1.7 : 1.6;
    const w = Math.max(10, Math.round(wcm * CM * THICK)),
        h = Math.round(hcm * CM);
    const dot = b.status === "active" || b.status === "redo" ? "var(--good)" : "";
    const lbl = vol
        ? String(vol)
        : m === "game"
          ? gameCase(b)[3]
          : m === "book"
            ? call.replace(/^FIC /, "").replace(/^NF /, "").replace(" ", "\n")
            : b.vols
              ? b.vols + "\nvol"
              : MEDIA[m].code;
    const text = (!src || viewOpts().titles) && !real;
    // a spine that shows its title is named by what it shows; one that's only a picture gets a name
    return `<button class="spine sp-${m}${w >= 40 ? " wide" : ""}${src ? " has-art" : ""}${ui.sel.has(b.id) ? " sel" : ""}" data-act="open" data-id="${esc(b.id)}" data-oid="${vol ? "" : esc(b.id)}" data-call="${esc(call)}" ${ui.arrange && !vol ? 'draggable="true"' : ""} style="--sp:${bg};--sp-fg:${src ? "#fff" : fg};width:calc(${w}px * var(--z, 1));height:calc(${h}px * var(--z, 1))" ${text && !vol ? "" : `aria-label="${esc(titleOf(b))}${vol ? " volume " + vol : ""}"`}>
    ${src ? `<span class="art${real ? " real" : ""}" style="background-image:url('${esc(src).replace(/'/g, "%27")}');--bp:${vol ? ((vol * 17) % 80) + 10 : (hash(b.id) % 70) + 15}%"></span>` : ""}${dot ? `<span class="sdot" style="background:${dot}"></span>` : ""}${vol ? `<span class="vnum">${vol}</span>` : ""}${text && !vol ? `<span class="st">${esc(cleanTitle(titleOf(b)))}</span><span class="sa">${esc(firstAuthor(b.creator))}</span><span class="lbl">${esc(lbl)}</span>` : ""}</button>`;
}
// manga, manhwa and light novels can stand as separate volumes: the ones you own, or every volume
function spinesFor(b, vo) {
    if (vo.split && ["manga", "manhwa", "novel"].includes(b.medium) && (b.vols || (b.volsOwned || []).length)) {
        const vols = (b.volsOwned || []).length
            ? b.volsOwned.slice().sort((x, y) => x - y)
            : Array.from({ length: Math.min(80, b.vols) }, (_, i) => i + 1);
        return `<span class="volset" data-oid="${esc(b.id)}" ${ui.arrange ? 'draggable="true"' : ""}>${vols.map(v => spineHTML(b, "", v)).join("")}</span>`;
    }
    return spineHTML(b, callOf(b.id));
}

// size and spacing sliders: inline on wide screens, inside ⋯ on narrow ones
const sizersHTML =
    vo => `<label class="sizer" title="Size (− and +)">${ICON.size}<input type="range" data-vz="z" min=".55" max="1.9" step=".05" value="${vo.z}" aria-label="Size"><output>${Math.round(vo.z * 100)}%</output></label>
  <label class="sizer" title="Spacing">${ICON.gap}<input type="range" data-vz="gap" min="0" max="2.5" step=".1" value="${vo.gap}" aria-label="Spacing"><output>${Math.round(vo.gap * 100)}%</output></label>`;
// ── the page ──
const CHUNK = 96;
const libChunks = new Map();
function libraryHTML() {
    const mode = curMode(),
        M = modeItems(),
        sh = shelvesOf(mode),
        shelf = sh.find(s => s.key === ui.shelfKey);
    const view = curView(),
        g = curGroup(),
        so = curSort(),
        vo = viewOpts();
    if (
        ui.arrange &&
        !["shelf", "rank"].includes(so) &&
        !Object.values(mode.gsort || {}).some(x => ["shelf", "rank"].includes(SORT_OLD[x] || x))
    )
        ui.arrange = false;
    const list = libraryList();
    const base = shelf ? M.filter(b => shelf.test(b)) : M;
    const counts = {};
    for (const b of base.filter(b => filterOk(b, ui.filt))) counts[b.status] = (counts[b.status] || 0) + 1;
    const st = [
        ["all", "Everything", Object.values(counts).reduce((a, n) => a + n, 0)],
        ...STATUS.filter(s => counts[s] || ui.status === s).map(s => [s, STATUS_WORDS[groupWord()][s], counts[s] || 0]),
    ];
    const nF = filterCount();
    let h = `${
        !isUniversal() && sh.length > 1
            ? `<div class="chips shelfchips" role="group" aria-label="Shelves"><button class="chip" data-act="shelf" data-k="" aria-pressed="${!ui.shelfKey}">All <span class="cn">${M.length}</span></button>${sh
                  .map(s => [s, M.filter(b => s.test(b)).length])
                  .filter(([s, n]) => n || ui.shelfKey === s.key)
                  .map(
                      ([s, n]) =>
                          `<button class="chip" data-act="shelf" data-k="${esc(s.key)}" aria-pressed="${ui.shelfKey === s.key}">${esc(s.name)} <span class="cn">${n}</span></button>`
                  )
                  .join("")}</div>`
            : ""
    }
    <div class="libbar"><div class="libctl">
        <div class="lb-left"><div class="seg views" role="group" aria-label="View">${VIEW_LIST.map(([k, l, d], i) => `<button data-act="view" data-k="${k}" aria-pressed="${view === k}" title="${esc(l)}: ${esc(d)} (${i + 1})">${ICON["v_" + k]}<span class="vl">${l}</span></button>`).join("")}</div>
          ${ui.status !== "all" ? `<button class="chip on stchip" data-act="f-status" data-k="all" title="Showing only ${esc(STATUS_WORDS[groupWord()][ui.status] || ui.status)}: click to show everything">${esc(STATUS_WORDS[groupWord()][ui.status] || ui.status)} ✕</button>` : ""}</div>
        <div class="lb-right">
          <button class="btn sm fbtn${nF || ui.filterOpen ? " on" : ""}" data-act="filter-toggle" aria-label="Filter" aria-expanded="${!!ui.filterOpen}">${ICON.filter}<span>Filter</span>${nF ? ` <span class="fcount">${nF}</span>` : ""}</button>
          <label class="lbsel"><span class="lbk">Group</span>${selOf("group", GROUPS, g)}</label>
          <label class="lbsel"><span class="lbk">Sort</span>${selOf("sort", SORTS, so)}</label>
          <div class="pop"><button class="btn sm ghost lb-more" data-act="pop" data-k="viewopt" aria-expanded="${ui.pop === "viewopt"}" title="Size, spacing and more" aria-label="Size, spacing and more">⋯</button>
          ${
              ui.pop === "viewopt"
                  ? `<div class="popbody right">
            ${view !== "list" ? `<p class="label">Size and spacing</p><div class="lb-sizes-pop">${sizersHTML(vo)}</div>` : ""}
            ${view !== "list" ? `<label class="ctl"><input type="checkbox" data-vzc="titles" ${vo.titles ? "checked" : ""}> ${view === "spine" ? "Titles on spines" : view === "cover" ? "Titles under covers" : "Titles and details"}</label>` : ""}
            ${view === "cover" ? `<label class="ctl"><input type="checkbox" data-vzc="true" ${vo.true ? "checked" : ""}> True size (a Wii case taller than a DS case)</label>` : ""}
            ${modeItems().some(b => b.medium === "game") ? `<label class="ctl"><input type="checkbox" data-gameboxes="1" ${boxShapes() ? "checked" : ""}> Game boxes in their real shape (a DS box nearly square, a Switch case narrow)</label>` : ""}
            ${view === "spine" ? `<label class="ctl"><input type="checkbox" data-vzc="split" ${vo.split ? "checked" : ""}> Manga as separate volumes</label>` : ""}
            ${
                curSort() === "order"
                    ? `<p class="label" style="margin-top:10px">Order within a series</p><div class="seg">${[
                          ["release", "Release"],
                          ["story", "Story"],
                      ]
                          .map(
                              ([k, l]) =>
                                  `<button data-act="watch-order" data-k="${k}" aria-pressed="${(meta.settings.watchOrder || "release") === k}">${l}</button>`
                          )
                          .join(
                              ""
                          )}</div><p class="hint">Story order uses each entry's place in the story (set it under More › Edit details).</p>`
                    : ""
            }
            <p class="label" style="margin-top:10px">Make ${esc(VIEW_LIST.find(x => x[0] === view)[1])} the default</p>
            <div class="bar"><button class="btn sm" data-act="view-default" data-k="mode">For ${esc(mode.name)}</button><button class="btn sm" data-act="view-default" data-k="all">For every mode</button></div>
            <div class="bar" style="margin-top:4px"><button class="btn sm" data-act="vz-all">Use this size and spacing everywhere</button></div>
            <div class="msep"></div>
            ${view !== "list" ? `<button class="linkbtn" data-act="arrange">${ui.arrange ? "Done arranging" : "Rank or arrange by dragging"}</button><br>` : ""}<button class="linkbtn" data-act="save-view">Save these filters to the sidebar</button></div>`
                  : ""
          }</div>
          ${ui.arrange ? `<button class="btn sm gold" data-act="arrange">Done arranging</button>` : ""}
          <button class="btn sm${ui.selecting ? " gold" : ""}" data-act="select-toggle" title="Select several (S). Or drag a box over covers, Shift-click for a range, Ctrl/⌘-click to add one.">${ui.selecting ? "Done" : "Select"}</button>
        </div>
      </div></div>
    ${ui.filterOpen ? filterPanelHTML(base) : ""}`;
    if (ui.arrange)
        h += `<div class="note">Drag into place. <b>Shelf</b> saves how the shelf looks; <b>Ranking</b> keeps scores first and saves your order among equal scores. Kept for ${esc(mode.name)}.</div>`;
    if (ui.q)
        h =
            `<div class="note"><span class="b-ic">⌕</span> ${list.length} match${list.length === 1 ? "" : "es"} for “${esc(ui.q)}”${ui.searchAll || isUniversal() ? "" : ` in ${esc(mode.name)}. <button class="linkbtn" data-act="search-all">Search everything</button>`} <button class="linkbtn" data-act="search-clear">Clear</button></div>` +
            h;
    if (!list.length) {
        listOrder = [];
        return (
            h +
            `<div class="empty"><h3>${M.length ? "Nothing here" : "An empty shelf"}</h3><p>${base.length ? "Nothing matches these filters." : M.length ? "Nothing on this shelf yet." : `Search for anything in the bar at the top and press +, or import what you already track.`}</p><div class="bar" style="justify-content:center">${base.length ? `<button class="btn" data-act="clear-filters">Clear filters</button>` : ""}<button class="btn gold" data-act="focus-search">Search to add</button><button class="btn" data-act="go-settings" data-k="io">Import</button></div></div>`
        );
    }
    const groups = [],
        idx = new Map();
    for (const b of list) {
        const [k, label, rank] = groupKey(b, g);
        if (!idx.has(k)) {
            idx.set(k, groups.length);
            groups.push({ k, label, rank, items: [] });
        }
        groups[idx.get(k)].items.push(b);
    }
    if (g === "status" || g === "type" || (g === "kind" && Array.isArray(mode.shelves)))
        groups.sort((a, b) => a.rank - b.rank);
    else if (g !== "none") groups.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
    const gs = mode.gsort || {};
    for (const gr of groups) {
        gr.sort = SORT_OLD[gs[g + ":" + gr.k]] || gs[g + ":" + gr.k] || so;
        gr.items.sort(sortBy(gr.sort));
    }
    listOrder = groups.flatMap(gr => gr.items.map(b => b.id));
    const style = `--z:${vo.z};--gz:${vo.gap}`;
    if (view === "list")
        return (
            h +
            `<div class="libbody v-list">${groups.map(gr => `${gr.k ? plaque(gr, g, gs, so) : ""}${listTableHTML(gr.items)}`).join("")}</div>`
        );
    const rk = (gr, i) => (gr.sort === "rank" && ui.arrange ? `<span class="rkb">${i + 1}</span>` : "");
    const tile = (gr, b, i) =>
        view === "spine" ? spinesFor(b, vo) : view === "cover" ? coverTile(b, rk(gr, i)) : cardHTML(b, rk(gr, i));
    const wrapCls =
        view === "spine"
            ? "shelf"
            : view === "cover"
              ? `faceout${vo.titles ? " titled" : ""}${vo.true ? " truesize" : ""}`
              : `grid${vo.titles ? "" : " notitles"}`;
    libChunks.clear();
    return (
        h +
        `<div class="libbody v-${view}${ui.arrange ? " arranging" : ""}" style="${style}">` +
        groups
            .map((gr, gi) => {
                const first = gr.items
                    .slice(0, CHUNK)
                    .map((b, i) => tile(gr, b, i))
                    .join("");
                if (gr.items.length > CHUNK) libChunks.set("g" + gi, { gr, at: CHUNK, tile });
                return `<section class="group">${gr.k ? plaque(gr, g, gs, so) : ""}<div class="${wrapCls}" data-gsort="${gr.sort}">${first}</div>${gr.items.length > CHUNK ? `<div class="more" data-more="g${gi}"><span class="hint">Loading ${gr.items.length - CHUNK} more…</span></div>` : ""}</section>`;
            })
            .join("") +
        `</div>`
    );
}
// long shelves arrive as you scroll, so switching modes and tabs stays instant
let moreObs = null;
afterRenderHooks.push(() => {
    if (moreObs) moreObs.disconnect();
    const els = $$(".more[data-more]");
    if (!els.length) return;
    moreObs = new IntersectionObserver(
        es => {
            for (const en of es) if (en.isIntersecting) loadMore(en.target);
        },
        { rootMargin: "800px 0px" }
    );
    els.forEach(el => moreObs.observe(el));
});
function loadMore(el) {
    const c = libChunks.get(el.dataset.more);
    if (!c) return;
    const box = el.previousElementSibling,
        next = c.gr.items.slice(c.at, c.at + CHUNK);
    box.insertAdjacentHTML("beforeend", next.map((b, i) => c.tile(c.gr, b, c.at + i)).join(""));
    c.at += next.length;
    if (c.at >= c.gr.items.length) {
        moreObs && moreObs.unobserve(el);
        el.remove();
        libChunks.delete(el.dataset.more);
    }
}
function plaque(gr, g, gs, so) {
    return `<div class="plaque" data-gdrop="${esc(g + ":" + gr.k)}"><h3>${esc(gr.label)}</h3><span class="n">${gr.items.length}</span></div>`;
}
function listTableHTML(list) {
    const th = (k, l) =>
        k
            ? `<th><button data-act="lsort" data-k="${k}" ${curSort() === k ? 'aria-sort="descending"' : ""}>${l}</button></th>`
            : `<th>${l}</th>`;
    return `<div class="tablewrap"><table class="lib"><thead><tr><th></th><th></th>${th("title", "Title")}<th>Creator</th><th>Type</th><th>Genre</th>${th("release", "Year")}<th>Progress</th><th>Status</th>${th("rank", "Score")}<th>Crowd</th>${th("ended", "Ended")}</tr></thead><tbody>
    ${list
        .slice(0, 2000)
        .map(
            b => `<tr class="tr${ui.sel.has(b.id) ? " sel" : ""}" data-act="open" data-id="${esc(b.id)}"><td style="width:28px"><span class="check">✓</span></td><td class="mini">${coverHTML(b)}</td>
      <td><span class="tt">${esc(titleOf(b))}</span>${b.fav ? ' <span class="favmark inline">♥</span>' : ""}</td>
      <td>${esc(b.creator || "")}</td><td>${esc(b.kind === "Academic" ? b.subject || "Academic" : kindShown(b) || MEDIA[b.medium].one)}</td><td class="gen">${esc((b.genres || []).slice(0, 2).join(", "))}</td><td class="num">${b.year || ""}</td><td class="num">${esc(b.status === "done" && b.medium !== "film" ? (b.total ? b.total + " " + unitOf(b)[2] : "") : progText(b))}</td><td>${statusPill(b) || `<span class="hint">${esc(statusWord("want", b.medium))}</span>`}</td><td>${rateShow(b.rating, scaleOf(b))}</td><td>${crowdPill(b)}</td><td class="num">${endedAt(b) ? esc(fmtDate(endedAt(b))) : ""}</td></tr>`
        )
        .join("")}
  </tbody></table></div>${list.length > 2000 ? `<p class="hint">Showing 2,000 of ${list.length}.</p>` : ""}`;
}
