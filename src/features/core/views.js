// src/features/core/views.js
// ─────────────────────────────────────────────────────────────────
//  Derived data
//
//  chart series use the six media colours (layers/_media-colours.scss, a fixed order)
// ─────────────────────────────────────────────────────────────────

const SERIES = CATS.map(([k, l]) => [k, l]);
const catIdx = b => CATS.findIndex(c => c[0] === catOf(b));
const sVar = m => `var(--s${CATS.findIndex(c => c[2].includes(m)) + 1})`;
const glyph = s => (SUBJECTS[s] || [])[0] || "·";
const subjCode = s =>
    (SUBJECTS[s] || [])[1] ||
    String(s || "GEN")
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 4)
        .toUpperCase() ||
    "GEN";
const GENRE_CODE = {
    "Science Fiction": "SF",
    "Historical Fiction": "HIS",
    "Literary Fiction": "LIT",
    "Young Adult": "YA",
    "Magical Realism": "MRL",
    "Self Help": "SLF",
    "True Crime": "TCR",
    "Graphic Novels": "GN",
    "Short Stories": "SS",
};
const genreCode = g =>
    GENRE_CODE[g] ||
    String(g || "FIC")
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 3)
        .toUpperCase();
const shelfRank = s => ({ fiction: 0, academic: 1, nonfiction: 2, other: 3 })[s] ?? 3;
const subjRank = s => {
    const i = SUBJECT_ORDER.indexOf(s);
    return i < 0 ? 900 : i;
};
const mediumRank = m => MEDIA_KEYS.indexOf(m);
const statusRank = Object.fromEntries(STATUS.map((s, i) => [s, i]));
// the private collection is kept apart: the main library never sees it, and private mode only sees it
// sealed entries exist only inside the private collection; hidden ones only on the Hidden list
// the whole library and each mode's slice are worked out once per change, not on every call
for (const k of ["set", "delete", "clear"]) {
    const f = Map.prototype[k];
    items[k] = function (...a) {
        ITEMS_VER++;
        stateChanged("items");
        return f.apply(this, a);
    };
}
const viewKey = () =>
    ITEMS_VER +
    "|" +
    (ui.private ? 1 : 0) +
    (ui.hiddenView ? 1 : 0) +
    "|" +
    (vault.key ? vault.ids.size : -1) +
    "|" +
    JSON.stringify(sealedKinds());
const allCache = { key: "", v: [] },
    modeCache = new Map();
// everything you can see, the seasons and sequels kept inside a combined entry included (search finds those on their own)
const allWithParts = () =>
    [...items.entries()]
        .map(([id, b]) => ({ id, ...b }))
        .filter(
            b =>
                (!isSealed(b) || !!ui.private) &&
                !!b.private === !!ui.private &&
                (ui.hiddenView ? !!b.hidden : !b.hidden)
        );
const visible = b =>
    (!isSealed(b) || !!ui.private) &&
    !!b.private === !!ui.private &&
    (ui.hiddenView ? !!b.hidden : !b.hidden) &&
    !(b.partOf && items.has(b.partOf));
const all = () => {
    const k = viewKey();
    if (allCache.key !== k) {
        allCache.key = k;
        allCache.v = [...items.entries()].map(([id, b]) => ({ id, ...b })).filter(visible);
        modeCache.clear();
    }
    return allCache.v.slice();
};
const uniExcluded = b =>
    (meta.layout.uniExclude || []).some(mid => {
        const m = meta.modes.find(x => x.id === mid);
        return m && m.id !== "universal" && inMode(b, m);
    });
const modeItems = (mode = curMode()) => {
    const A = all(),
        k =
            mode.id +
            "|" +
            (mode.match || []).join(",") +
            "|" +
            (mode.id === "universal" ? (meta.layout.uniExclude || []).join(",") : "") +
            "|" +
            meta.modes.length;
    let c = modeCache.get(k);
    if (!c) {
        c = A.filter(b => inMode(b, mode) && (mode.id !== "universal" || !uniExcluded(b)));
        modeCache.set(k, c);
    }
    return c.slice();
};
const isUniversal = () => curMode().id === "universal" || (curMode().match || []).includes("*");
const gwCache = { k: "", v: "any" };
const groupWord = () => {
    const k = viewKey() + curMode().id;
    if (gwCache.k !== k) {
        const g = new Set(modeItems().map(b => MEDIA[b.medium].group));
        gwCache.k = k;
        gwCache.v = g.size === 1 ? [...g][0] : "any";
    }
    return gwCache.v;
};
// what the library shows: each mode remembers its own view, grouping, sort and zoom
const VIEW_ALIAS = { faceout: "cover", shelf: "spine" };
const curView = (mode = curMode()) =>
    VIEW_ALIAS[mode.view] || mode.view || VIEW_ALIAS[meta.settings.defaultView] || meta.settings.defaultView || "cover";
const curGroup = (mode = curMode()) => mode.group || "status";
const curSort = (mode = curMode()) => SORT_OLD[mode.sort] || mode.sort || "rank";
const viewOpts = (mode = curMode(), v = curView(mode)) => ({
    z: 1,
    gap: 1,
    titles: v === "grid",
    split: false,
    ...((mode.vz || {})[v] || {}),
});
let callMap = new Map();
function buildCallNumbers() {
    callMap = new Map();
    const groups = new Map();
    for (const [id, b] of items) {
        const k =
            b.medium === "book"
                ? "book|" +
                  (b.kind === "Academic"
                      ? "academic|" + (b.subject || "")
                      : b.kind === "Non-fiction"
                        ? "nonfiction|" + (b.subject || (b.genres || [])[0] || "")
                        : "fiction|" + ((b.genres || [])[0] || ""))
                : b.medium + "|" + (b.year || "") + "|";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push([id, b]);
    }
    for (const [k, arr] of groups) {
        const [m, a, sub] = k.split("|");
        if (m === "book") {
            if (a === "academic") {
                const code = subjCode(sub);
                arr.sort(
                    (x, y) =>
                        (x[1].trackIndex ?? 50) - (y[1].trackIndex ?? 50) ||
                        (x[1].order ?? 99) - (y[1].order ?? 99) ||
                        String(x[1].title).localeCompare(y[1].title)
                );
                const seen = {};
                for (const [id, b] of arr) {
                    const t = (b.trackIndex ?? 8) + 1;
                    seen[t] = (seen[t] || 0) + 1;
                    callMap.set(id, `${code} ${t}·${String(b.order ?? seen[t]).padStart(2, "0")}`);
                }
            } else {
                const code =
                    a === "nonfiction"
                        ? SUBJECTS[sub]
                            ? subjCode(sub)
                            : "NF " + genreCode(sub)
                        : "FIC " + (sub ? genreCode(sub) : "GEN");
                arr.sort(
                    (x, y) => (x[1].year || 9999) - (y[1].year || 9999) || String(x[1].title).localeCompare(y[1].title)
                );
                arr.forEach(([id], i) => callMap.set(id, `${code} ${String(i + 1).padStart(3, "0")}`));
            }
        } else {
            arr.sort((x, y) => String(titleOf(x[1])).localeCompare(titleOf(y[1])));
            arr.forEach(([id], i) =>
                callMap.set(id, `${MEDIA[m].code} ${a || "————"}·${String(i + 1).padStart(2, "0")}`)
            );
        }
    }
}
const callOf = id => callMap.get(id) || "";
const lenOf = b =>
    b.medium === "book"
        ? b.total ||
          (b.format === "Short"
              ? 260
              : b.format === "Long"
                ? 520
                : b.format === "Series"
                  ? 1300
                  : b.format === "Textbook"
                    ? 600
                    : 380)
        : b.medium === "film"
          ? b.runtime || 115
          : b.medium === "game"
            ? (b.total || 20) * 60
            : (b.total || 12) * minutesPerUnit(b);
const SCORE_DEF = {
    anilist: ["AniList", v => v + "%", v => v],
    mal: ["MyAnimeList", v => (+v).toFixed(2), v => v * 10],
    imdb: ["IMDb", v => (+v).toFixed(1), v => v * 10],
    rt: ["RT critics", v => v + "%", v => v],
    meta: ["Metacritic", v => v, v => v],
    tmdb: ["TMDB", v => (+v).toFixed(1), v => v * 10],
    tvmaze: ["TVmaze", v => (+v).toFixed(1), v => v * 10],
    rawg: ["RAWG", v => (+v).toFixed(2) + "/5", v => v * 20],
    ol: ["Open Library", v => (+v).toFixed(2) + "/5", v => v * 20],
    gb: ["Google Books", v => (+v).toFixed(1) + "/5", v => v * 20],
    goodreads: ["Goodreads", v => (+v).toFixed(2) + "/5", v => v * 20],
    mdl: ["MyDramaList", v => (+v).toFixed(1), v => v * 10],
    letterboxd: ["Letterboxd", v => (+v).toFixed(1) + "/5", v => v * 20],
    backloggd: ["Backloggd", v => (+v).toFixed(1) + "/5", v => v * 20],
    rym: ["Rate Your Music", v => (+v).toFixed(2) + "/5", v => v * 20],
    aoty: ["Album of the Year", v => v, v => v],
    serializd: ["Serializd", v => (+v).toFixed(1) + "/10", v => v * 10],
    animeplanet: ["Anime-Planet", v => (+v).toFixed(1) + "/5", v => v * 20],
};
const MANUAL_SCORES = {
    book: ["goodreads"],
    comic: ["goodreads"],
    tv: ["serializd", "mdl"],
    film: ["letterboxd", "mdl"],
    game: ["backloggd"],
    album: ["rym", "aoty"],
    anime: ["animeplanet", "serializd"],
    manga: ["animeplanet"],
    manhwa: ["animeplanet"],
    novel: ["goodreads"],
};
function crowd(b) {
    const parts = Object.entries(b.scores || {})
        .filter(([k, v]) => SCORE_DEF[k] && v != null && !isNaN(v))
        .map(([k, v]) => ({ k, label: SCORE_DEF[k][0], show: SCORE_DEF[k][1](v), n: SCORE_DEF[k][2](+v) }));
    const avg = parts.length ? Math.round(parts.reduce((a, p) => a + p.n, 0) / parts.length) : null;
    return { parts, avg };
}
const mine = b => (b.rating ? b.rating * 10 : null);
// your own shelf arrangement, per mode; anything you haven't placed follows in library order
// two orders you control: "Shelf look" arranges covers by how the shelf looks; "My order" is your ranking and watch order, used inside each status group
// positions in your saved orders, looked up from an index built once per order (not a scan per comparison)
const posIdx = new WeakMap();
const posIn = (arr, id) => {
    if (!arr || !arr.length) return 1e6;
    let m = posIdx.get(arr);
    if (!m || m.n !== arr.length) {
        m = new Map(arr.map((x, i) => [x, i]));
        m.n = arr.length;
        posIdx.set(arr, m);
    }
    const i = m.get(id);
    return i == null ? 1e6 : i;
};
const shelfPos = (id, mode = curMode()) => posIn((meta.orders || {})[mode.id], id);
const minePos = (id, mode = curMode()) => posIn((meta.myOrder || {})[mode.id], id);
function defaultOrder(x, y) {
    return (
        catIdx(x) - catIdx(y) ||
        mediumRank(x.medium) - mediumRank(y.medium) ||
        (x.medium === "book"
            ? shelfRank(x.shelf) - shelfRank(y.shelf) || subjRank(x.subject) - subjRank(y.subject)
            : 0) ||
        callOf(x.id).localeCompare(callOf(y.id), undefined, { numeric: true })
    );
}
const endedAt = b => (b.status === "dnf" ? b.droppedAt || b.lastAt || "" : b.finishedAt || "");
function sortBy(key) {
    const t = (x, y) => String(titleOf(x)).localeCompare(String(titleOf(y)));
    switch (SORT_OLD[key] || key) {
        case "rank":
            return (a, b) => (b.rating || 0) - (a.rating || 0) || minePos(a.id) - minePos(b.id) || t(a, b);
        case "title":
            return t;
        case "added":
            return (a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")) || t(a, b);
        case "ended":
            return (a, b) => String(endedAt(b)).localeCompare(String(endedAt(a))) || t(a, b);
        case "release":
            return (a, b) => (b.year || 0) - (a.year || 0) || t(a, b);
        case "order": {
            const pos = readingOrder();
            return (a, b) => {
                const x = orderKey(a, pos),
                    y = orderKey(b, pos);
                return x[0] - y[0] || x[1].localeCompare(y[1]) || x[2] - y[2] || t(a, b);
            };
        }
        default:
            return (a, b) => shelfPos(a.id) - shelfPos(b.id) || defaultOrder(a, b);
    }
}
// reading and watch order: a Learning Centre book goes where its pathway puts it; anything in a series goes with its series,
// in release order or, when you've set it, story order (Settings for this: the ⋯ by the views, "Story order")
function readingOrder() {
    const pos = new Map();
    if (typeof PWS !== "function") return pos;
    let i = 0;
    for (const P of PWS()) {
        const stg = pwStages(P);
        for (const b of P.books.slice().sort((x, y) => (stg[x.id] || 0) - (stg[y.id] || 0))) {
            const id = pwLib(b);
            if (id && !pos.has(id)) pos.set(id, i);
            i++;
        }
    }
    return pos;
}
function orderKey(b, pos) {
    const story = meta.settings.watchOrder === "story",
        series =
            b.series ||
            b.franchise ||
            (b.partOf && items.has(b.partOf) ? titleOf(items.get(b.partOf)) : "") ||
            seasonStemOf(b);
    const n =
        story && b.chrono != null ? +b.chrono : b.seriesNo != null ? +b.seriesNo + (b.year || 0) / 1e5 : b.year || 9999;
    return [pos.has(b.id) ? pos.get(b.id) : 1e6, norm(series), n];
}
const seasonStemOf = b => (typeof seasonStem === "function" ? seasonStem(b.title) : norm(cleanTitle(b.title)));
const favPos = id => {
    const i = meta.favOrder.indexOf(id);
    return i < 0 ? 1e6 : i;
};
const SORTS = [
    ["rank", "Ranking"],
    ["shelf", "Shelf"],
    ["order", "Reading / watch order"],
    ["title", "Title"],
    ["release", "Release date"],
    ["added", "Date added"],
    ["ended", "Date ended"],
];
const GROUPS = [
    ["status", "Status"],
    ["kind", "Shelf"],
    ["type", "Type"],
    ["genre", "Genre"],
    ["none", "No grouping"],
];
function groupKey(b, g) {
    switch (g) {
        case "status":
            return [b.status, STATUS_WORDS[groupWord()][b.status], statusRank[b.status]];
        // Type follows the mode's own shelves when it has them (Hub: Culture, Literature, Film, TV, Games), otherwise each item's type
        case "kind": {
            const mode = curMode();
            if (Array.isArray(mode.shelves)) {
                const sh = shelvesOf(mode),
                    i = sh.findIndex(s => s.test(b));
                return i < 0 ? ["other", "Other", 99] : [sh[i].key, sh[i].name, i];
            }
            const k = kindShown(b) || MEDIA[b.medium].name;
            return [k, k, 0];
        }
        case "type": {
            const k = kindShown(b) || MEDIA[b.medium].name;
            return [
                b.medium + ":" + kindOf(b),
                k,
                mediumIdx(b.medium) * 20 + Math.max(0, (KINDS[b.medium] || []).indexOf(kindOf(b))),
            ];
        }
        case "genre": {
            const k = (b.genres || [])[0] || "No genre yet";
            return [k, k, 0];
        }
        default:
            return ["", "", 0];
    }
}

// ═══════════════════════════════════════════
//  BUILDING BLOCKS
// ═══════════════════════════════════════════
function palette2(b) {
    if (b.medium === "book") {
        const h = hash((b.genres || [])[0] || b.subject || b.shelf || b.title) % 360,
            s = b.kind === "Academic" ? 24 : b.kind === "Non-fiction" ? 30 : 36,
            hh = b.kind === "Academic" ? 200 + (h % 60) : h;
        return [`hsl(${hh} ${s}% 30%)`, `hsl(${hh} ${s}% 13%)`];
    }
    const h =
        (hash(b.title) % 50) +
        ({ manga: 340, manhwa: 300, novel: 260, comic: 20, anime: 210, tv: 170, film: 0, game: 120, album: 290 }[
            b.medium
        ] || 0);
    return [`hsl(${h % 360} 34% 30%)`, `hsl(${h % 360} 30% 12%)`];
}
function coverHTML(b, cls = "") {
    const src = coverSrc(b),
        [c1, c2] = palette2(b),
        m = MEDIA[b.medium] || MEDIA.book;
    return `<div class="cover m-${b.medium}${src ? " has-img" : ""} ${cls}" style="--c1:${c1};--c2:${c2}" aria-hidden="true"><div class="ct">${esc(titleOf(b))}</div><div class="orn"></div><div class="ca">${esc(b.medium === "book" ? firstAuthor(b.creator) : m.code + (b.year ? " · " + b.year : ""))}</div>${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</div>`;
}
function lum(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return 0.2;
    const n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function spineColour(b) {
    const base = b.color || (b.coverColor && b.coverColor !== "none" ? b.coverColor : null);
    return base ? [base, lum(base) > 0.62 ? "#1c1a16" : "#f2e8cf"] : [palette2(b)[0], "#f2e8cf"];
}
// Spines are cut from the real cover (no free source has spine photos), so a spine with art carries no text: the art says what it is.
const rateShow = (r, sc) => (r ? `<span class="myscore" title="Your score">${esc(fmtScore(r, sc))}</span>` : "");
const statusPill = b =>
    b.status === "want" ? "" : `<span class="pill ${b.status}">${esc(statusWord(b.status, b.medium))}</span>`;
const copyPill = b =>
    b.copy !== "none"
        ? `<span class="pill own">${b.copy === "digital" ? "Digital" : "Owned"}</span>`
        : b.toBuy
          ? `<span class="pill buy">To buy</span>`
          : "";
const mDot = m =>
    isUniversal() ? `<span class="mdot" style="background:${sVar(m)}" title="${esc(MEDIA[m].name)}"></span>` : "";
const pct = b => (b.total ? Math.min(100, Math.round(((b.prog || 0) / b.total) * 100)) : 0);
function progText(b, long) {
    const [one, many, abbr] = unitOf(b);
    if (b.medium === "film") return b.runtime ? b.runtime + " min" : "";
    if (b.medium === "book") return b.total ? `p. ${b.prog || 0} of ${b.total}` : `p. ${b.prog || 0}`;
    if (b.medium === "game") return `${b.prog || 0} h played${b.total ? ` · ~${b.total} h to finish` : ""}`;
    const base = `${long ? one.charAt(0).toUpperCase() + one.slice(1) : abbr} ${b.prog || 0}${b.total ? " / " + b.total : ""}`;
    return base + (b.vol ? ` · vol ${b.vol}${b.vols ? "/" + b.vols : ""}` : "");
}
function crowdPill(b) {
    const c = crowd(b);
    return c.avg != null
        ? `<span class="crowd" title="${esc(c.parts.map(p => p.label + " " + p.show).join(" · "))}">${c.avg}</span>`
        : "";
}
function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    return s < 90
        ? "just now"
        : s < 5400
          ? Math.round(s / 60) + " min ago"
          : s < 129600
            ? Math.round(s / 3600) + " h ago"
            : Math.round(s / 86400) + " days ago";
}
function until(ms) {
    const s = (ms - Date.now()) / 1000;
    if (s <= 0) return "out now";
    const d = Math.floor(s / 86400),
        h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const STATS_VIEWS = [
    ["charts", "Charts"],
    ["wrapped", "Year in review"],
    ["taste", "Your taste"],
    ["compare", "Compare"],
    ["franchises", "Franchises"],
    ["people", "People"],
    ["airing", "Coming up"],
    ["log", "Log"],
    ["dupes", "Duplicates"],
];
function airingList() {
    return modeItems()
        .filter(
            b =>
                b.airing &&
                b.airing.at &&
                b.airing.at > Date.now() - 864e5 &&
                ["active", "want", "paused", "done"].includes(b.status) &&
                (b.status !== "done" || b.airStatus === "RELEASING")
        )
        .sort((a, b) => a.airing.at - b.airing.at);
}
function mediumStatsOf(test) {
    const A = modeItems().filter(test),
        fin = A.filter(b => b.status === "done"),
        rated = A.filter(b => b.rating);
    return {
        n: A.length,
        fin: fin.length,
        active: A.filter(b => b.status === "active").length,
        min: A.reduce((a, b) => a + minutesSpent(b), 0),
        mean: rated.length ? rated.reduce((a, b) => a + b.rating, 0) / rated.length : null,
    };
}
// ── overview: a summary of the mode's stats, library, favourites and lists ──
function airRow(b) {
    const unit = b.medium === "anime" || b.medium === "tv" ? "Ep" : "Ch";
    return `<button class="air" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}<span class="t">${esc(titleOf(b))}<small>${unit} ${b.airing.ep || "?"}${b.airing.season ? " · S" + b.airing.season : ""}${b.status === "active" && b.prog && b.airing.ep && b.airing.ep - 1 > b.prog ? ` · you're ${b.airing.ep - 1 - b.prog} behind` : ""}</small></span><span class="when" data-at="${b.airing.at}">${esc(until(b.airing.at))}</span></button>`;
}

// ── library: status first, your own views per mode, zoom, and an arrangement you control ──
function renderBulk() {
    let el = $("#bulk");
    if (!ui.selecting || ui.page !== "profile" || ui.tab !== "library") {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement("div");
        el.id = "bulk";
        el.className = "bulk";
        document.body.append(el);
    }
    const n = ui.sel.size,
        tags = Object.keys(meta.tags).sort();
    el.innerHTML = `<span class="n">${n} selected</span>
    <button class="btn sm" data-act="sel-all">Select all ${listOrder.length}</button>${
        n
            ? `<button class="btn sm ghost" data-act="sel-none">Clear</button>
    <select class="sel" id="bulk-status"><option value="">Status…</option>${STATUS.map(k => `<option value="${k}">${STATUS_WORDS.any[k]}</option>`).join("")}</select>
    <select class="sel" id="bulk-copy"><option value="">Ownership…</option>${COPY.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}<option value="buy">Plan to buy</option><option value="nobuy">Not buying</option></select>
    <select class="sel" id="bulk-kind"><option value="">Set type…</option>${[...new Set([...ui.sel].map(id => (items.get(id) || {}).medium).filter(Boolean))].length === 1 ? KINDS[items.get([...ui.sel][0]).medium].map(k => `<option>${esc(k)}</option>`).join("") : ""}</select>
    <select class="sel" id="bulk-list"><option value="">Add to list…</option>${meta.lists
        .filter(l => l.kind !== "tier")
        .map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`)
        .join("")}<option value="__new">New list…</option></select>
    <input class="inp" id="bulk-tag" list="taglist" placeholder="Add tag…" style="width:120px;padding:5px 8px;font-size:12px"><datalist id="taglist">${tags.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
    ${tags.length ? `<select class="sel" id="bulk-untag"><option value="">Remove tag…</option>${tags.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>` : ""}
    ${n > 1 ? `<button class="btn sm" data-act="bulk-combine" title="Keep them as one entry (seasons, sequels, volumes); each keeps its score">Combine</button>` : ""}
    <select class="sel" id="bulk-mode"><option value="">Move to mode…</option>${meta.modes
        .filter(x => x.id !== "universal")
        .map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`)
        .join("")}<option value="auto">Where its type puts it</option></select>
    <button class="btn sm" data-act="bulk-queue">Up next</button><button class="btn sm" data-act="bulk-covers">Pick covers</button><button class="btn sm" data-act="bulk-refresh">Refresh scores</button>${vault.key && !ui.private ? `<button class="btn sm" data-act="bulk-private">Move to private</button>` : ""}
    ${ui.confirmBulkDelete ? `<span class="err">Delete ${n}?</span><button class="btn sm danger" data-act="bulk-delete-yes">Delete</button><button class="btn sm ghost" data-act="bulk-delete-no">Keep</button>` : `<button class="btn sm danger" data-act="bulk-delete">Delete</button>`}`
            : ""
    }`;
}

// ── coming up, log ──
function airingHTML() {
    const list = airingList(),
        releasing = modeItems().filter(
            b => b.airStatus === "RELEASING" && !b.airing && ["active", "want", "paused"].includes(b.status)
        );
    return `<div class="ph"><div class="ttl"><p>Next episodes and chapters for things you're following, from AniList and TVmaze${TMDB_ON() ? " and TMDB" : ""}.</p></div><span class="spacer"></span><button class="btn" data-act="airing-refresh">Refresh</button></div>
    ${list.length ? `<div class="panel"><div class="airs big">${list.map(airRow).join("")}</div></div>` : `<div class="empty"><h3>Nothing scheduled</h3><p>When something you're following has a date for its next episode, it appears here.</p></div>`}
    ${
        releasing.length
            ? `<div class="panel" style="margin-top:16px"><h3>Still releasing, no date yet</h3><div class="strip">${releasing
                  .slice(0, 30)
                  .map(b => cardHTML(b))
                  .join("")}</div></div>`
            : ""
    }`;
}
function allSessions() {
    const out = [];
    for (const [id, b] of items) {
        if (!visible(b) || !inMode(b)) continue;
        for (const s of b.log || []) {
            const n = Math.max(0, (s.to || 0) - (s.from || 0));
            out.push({ id, b, ...s, n, min: s.min != null ? s.min : n * minutesPerUnit(b) });
        }
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function logHTML() {
    const ss = allSessions(),
        events = [];
    for (const [id, b] of items) {
        if (!visible(b) || !inMode(b)) continue;
        if (b.finishedAt) events.push({ date: b.finishedAt, id, b, kind: "done" });
        if (b.startedAt) events.push({ date: b.startedAt, id, b, kind: "started" });
    }
    const evs = ss
        .map(s => ({ ...s, kind: "session" }))
        .concat(events)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const days = new Map();
    for (const e of evs) {
        const d = String(e.date).slice(0, 10);
        if (!days.has(d)) days.set(d, []);
        days.get(d).push(e);
    }
    const sess = e => {
        const [, , abbr] = unitOf(e.b);
        return e.b.medium === "game"
            ? `${e.n} h played`
            : e.b.medium === "book"
              ? `p. ${e.from} → ${e.to}`
              : e.b.medium === "film"
                ? "Watched"
                : `${abbr} ${e.from} → ${e.to}`;
    };
    return evs.length
        ? [...days.entries()]
              .slice(0, 150)
              .map(
                  ([
                      d,
                      es,
                  ]) => `<div class="panel" style="margin-bottom:10px"><h3>${esc(fmtDate(d))}<span class="r hint">${es.some(e => e.kind === "session") ? "≈ " + fmtHours(es.filter(e => e.kind === "session").reduce((a, e) => a + e.min, 0)) : ""}</span></h3>
      <div class="sessions">${es.map(e => `<div>${mDot(e.b.medium)}<b>${e.kind === "session" ? esc(sess(e)) : e.kind === "done" ? esc(STATUS_WORDS[MEDIA[e.b.medium].group].done) : "Started"}</b><button class="linkbtn" data-act="open" data-id="${esc(e.id)}">${esc(titleOf(e.b))}</button>${e.lane ? `<span>${e.lane}</span>` : ""}</div>`).join("")}</div></div>`
              )
              .join("")
        : `<div class="empty"><h3>Nothing logged yet</h3><p>Use +1, +10 or "Set…" on anything in progress to log where you are.</p></div>`;
}

// ── stats ──
function activityStats() {
    const ss = allSessions(),
        byDay = new Map();
    for (const s of ss) {
        const d = String(s.date).slice(0, 10);
        byDay.set(d, (byDay.get(d) || 0) + s.min);
    }
    for (const b of items.values())
        if (b.finishedAt && visible(b) && inMode(b)) {
            const d = b.finishedAt.slice(0, 10);
            if (!byDay.has(d)) byDay.set(d, 0);
        }
    const y = new Date().getFullYear(),
        A = modeItems();
    const doneYear = A.filter(
        b => b.status === "done" && b.finishedAt && new Date(b.finishedAt).getFullYear() === y
    ).length;
    const cutoff = Date.now() - 30 * 864e5,
        min30 = ss.filter(s => Date.parse(s.date) >= cutoff).reduce((a, s) => a + s.min, 0);
    let streak = 0;
    const d = new Date();
    if (!byDay.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
    while (byDay.has(d.toISOString().slice(0, 10))) {
        streak++;
        d.setDate(d.getDate() - 1);
    }
    let longest = 0,
        run = 0,
        prev = null;
    for (const day of [...byDay.keys()].sort()) {
        const t = Date.parse(day);
        run = prev && t - prev === 864e5 ? run + 1 : 1;
        longest = Math.max(longest, run);
        prev = t;
    }
    return { ss, byDay, doneYear, min30, streak, longest };
}
function stackChart(data, { h = 160, fmt = v => v, unit = "" } = {}) {
    const w = 640,
        pad = 30,
        tot = d => d.v.reduce((a, x) => a + x, 0),
        max = Math.max(1, ...data.map(tot)),
        bw = (w - pad) / data.length;
    const ticks = [0, max / 2, max];
    const tipFor = d =>
        `${d.l}: ` +
            SERIES.map((s, k) => (d.v[k] ? `${s[1]} ${fmt(d.v[k])}${unit}` : ""))
                .filter(Boolean)
                .join(", ") || `${d.l}: none`;
    return `<svg class="chart" viewBox="0 0 ${w} ${h + 22}" role="img" aria-label="${esc(data.map(tipFor).join("; "))}">${ticks
        .map(t => {
            const y = h - (t / max) * (h - 10);
            return `<line class="gridl" x1="${pad}" x2="${w}" y1="${y}" y2="${y}"/><text x="${pad - 6}" y="${y + 3}" text-anchor="end">${esc(fmt(t))}</text>`;
        })
        .join("")}
    ${data
        .map((d, i) => {
            let y = h;
            const x = pad + i * bw + bw * 0.16,
                bwid = bw * 0.68;
            const segs = d.v
                .map((v, s) => {
                    if (!v) return "";
                    const bh = (v / max) * (h - 10);
                    y -= bh;
                    return `<rect x="${x}" y="${y}" width="${bwid}" height="${Math.max(0, bh)}" fill="var(--s${s + 1})" class="seg"/>`;
                })
                .join("");
            const tip = tipFor(d);
            return `<g class="col"><title>${esc(tip)}</title><rect class="hit" x="${pad + i * bw}" y="0" width="${bw}" height="${h}"/>${segs}</g>${data.length <= 14 || i % Math.ceil(data.length / 10) === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${h + 15}" text-anchor="middle">${esc(d.l)}</text>` : ""}`;
        })
        .join("")}</svg>`;
}
const legend = present =>
    `<div class="legend">${SERIES.map((s, i) => (present[i] ? `<span><i style="background:var(--s${i + 1})"></i>${esc(s[1])}</span>` : "")).join("")}</div>`;
function hbars(rows, fmt = v => v) {
    const max = Math.max(1, ...rows.map(r => r[1]));
    return `<div class="hbars">${rows.map(([l, v, color]) => `<div><span>${l}</span><span class="b"><span style="width:${(v / max) * 100}%;${color ? "background:" + color : ""}"></span></span><span class="v">${esc(fmt(v))}</span></div>`).join("")}</div>`;
}
function heatHTML(byDay, weeks = 20) {
    const vals = [...byDay.values()],
        max = Math.max(1, ...vals),
        heat = [];
    const start = new Date();
    start.setDate(start.getDate() - 7 * weeks - start.getDay());
    for (let i = 0; i < 7 * (weeks + 1); i++) {
        const x = new Date(start);
        x.setDate(start.getDate() + i);
        const k = x.toISOString().slice(0, 10),
            has = byDay.has(k),
            v = byDay.get(k) || 0;
        heat.push(
            `<i title="${fmtDate(x.toISOString())}: ${has ? (v ? "≈ " + fmtHours(v) : "finished something") : "nothing"}" style="${has ? `background:color-mix(in srgb,var(--accent) ${30 + Math.round((v / max) * 70)}%,var(--panel3))` : ""}"></i>`
        );
    }
    return `<div style="overflow-x:auto"><div class="heat">${heat.join("")}</div></div>`;
}

// ── rank ──
const rankState = { mode: "liked", pair: null, recent: [] };
const RF = () => (rankState.mode === "want" ? ["welo", "wh2h"] : ["elo", "h2h"]);
const rankScore = b => b.rating || (partsOf(b).length ? partsScore(b) : 0);
const eloOf = b =>
    rankState.mode === "want"
        ? b.welo || 1500 + (b.favRank ? (9 - b.favRank) * 15 : 0) + (b.copy !== "none" ? 20 : 0)
        : b.elo || 1500 + ((rankScore(b) || 6) - 6) * 30 + (b.fav ? 40 : 0);
const h2hOf = b => b[RF()[1]] || 0;
function rankPool() {
    const sh = ui.rankShelf ? shelvesOf().find(s => s.key === ui.rankShelf) : null;
    return modeItems().filter(
        b =>
            (!sh || sh.test(b)) &&
            (rankState.mode === "want"
                ? b.status === "want"
                : b.status === "done" || rankScore(b) || b.status === "active" || b.elo)
    );
}
function nextPair() {
    const pool = rankPool();
    if (pool.length < 2) return null;
    pool.sort((a, b) => h2hOf(a) - h2hOf(b) || Math.random() - 0.5);
    const a = pool[Math.floor(Math.random() * Math.max(1, Math.ceil(pool.length / 3)))];
    const others = pool
        .filter(b => b.id !== a.id && !rankState.recent.includes([a.id, b.id].sort().join("|")))
        .sort((x, y) => Math.abs(eloOf(x) - eloOf(a)) - Math.abs(eloOf(y) - eloOf(a)));
    const b = others[Math.floor(Math.random() * Math.min(4, others.length))] || pool.find(x => x.id !== a.id);
    return [a.id, b.id];
}
function rankHTML() {
    const pool = rankPool();
    if (
        !rankState.pair ||
        !items.has(rankState.pair[0]) ||
        !items.has(rankState.pair[1]) ||
        !inMode(items.get(rankState.pair[0]))
    )
        rankState.pair = nextPair();
    const board = pool.filter(b => h2hOf(b)).sort((a, b) => eloOf(b) - eloOf(a));
    const contender = (id, side) => {
        const b = { id, ...items.get(id) };
        return `<button class="contender" data-act="rank-pick" data-k="${side}">${coverHTML(b)}<div><div class="call">${esc(b.kind || MEDIA[b.medium].one)} · ${esc(callOf(id))}</div><div class="t">${esc(titleOf(b))}</div><div class="hint">${esc(b.creator || "")}${b.year ? " · " + b.year : ""}${partsOf(b).length ? ` · ${partsOf(b).length + 1} seasons` : ""}${rankScore(b) ? ` · ${b.rating ? "you gave it" : "seasons average"} ${fmtScore(rankScore(b))}` : ""}</div><p class="hint" style="margin-top:8px">${esc((b.why || b.about || "").slice(0, 140))}</p></div></button>`;
    };
    return `<div class="ph"><div class="ttl"><p>${rankState.mode === "want" ? `Pick the one you want to start more. The order becomes the "Most wanted" sort.` : `Pick the one you liked more. After a few dozen picks this is your real ranking, and "My ranking" becomes a sort option.`}</p></div><span class="spacer"></span>
      <div class="seg">${[
          ["liked", "Finished"],
          ["want", "Backlog"],
      ]
          .map(
              ([k, l]) =>
                  `<button data-act="rank-mode" data-k="${k}" aria-pressed="${rankState.mode === k}">${l}</button>`
          )
          .join("")}</div>
      <select class="sel" id="rank-shelf" aria-label="Shelf"><option value="">Every shelf</option>${shelvesOf()
          .map(s => `<option value="${esc(s.key)}"${ui.rankShelf === s.key ? " selected" : ""}>${esc(s.name)}</option>`)
          .join("")}</select></div>
    ${
        rankState.pair
            ? `<div class="duel">${contender(rankState.pair[0], 0)}<div class="vs">or</div>${contender(rankState.pair[1], 1)}</div>
      <div class="bar" style="justify-content:center;margin:14px 0 26px"><button class="btn" data-act="rank-pick" data-k="draw">Can't decide <span class="kbd">↓</span></button><button class="btn ghost" data-act="rank-skip">Skip</button><span class="hint">Keys: <span class="kbd">←</span> <span class="kbd">→</span></span></div>`
            : `<div class="empty"><h3>Not enough to compare yet</h3>${rankState.mode === "want" ? `<p>You need at least two planned items here.</p>` : `<p>This ranks things you've finished, scored or are in the middle of.</p><div class="bar" style="justify-content:center"><button class="btn gold" data-act="rank-mode" data-k="want">Rank my backlog</button></div>`}</div>`
    }
    ${
        board.length
            ? `<div class="panel"><h3>${rankState.mode === "want" ? "Most wanted" : "Your ranking"} · ${board.length} compared</h3><div class="board">${board
                  .slice(0, 50)
                  .map(
                      (b, i) =>
                          `<button data-act="open" data-id="${esc(b.id)}"><span class="r">${String(i + 1).padStart(2, "0")}</span>${coverHTML(b)}<span class="t">${mDot(b.medium)}${esc(titleOf(b))}</span><span class="hint">${plural(h2hOf(b), "pick")}</span></button>`
                  )
                  .join("")}</div></div>`
            : ""
    }
    ${seasonsPanelHTML()}`;
}
function rankPick(side) {
    const [ia, ib] = rankState.pair || [];
    if (!ia) return;
    const A = items.get(ia),
        B = items.get(ib);
    const ea = eloOf(A),
        eb = eloOf(B),
        exp = 1 / (1 + Math.pow(10, (eb - ea) / 400));
    const sa = side === "draw" ? 0.5 : side === 0 ? 1 : 0,
        k = n => Math.max(14, 40 - 2 * (n || 0));
    const [fe, fh] = RF(),
        na = Math.round(ea + k(A[fh]) * (sa - exp)),
        nb = Math.round(eb + k(B[fh]) * (1 - sa - (1 - exp)));
    change(side === "draw" ? "Tie" : "Pick " + titleOf(side === 0 ? A : B), [ia, ib], (b, id) => ({
        ...b,
        [fe]: id === ia ? na : nb,
        [fh]: (b[fh] || 0) + 1,
    }));
    rankState.recent = [[ia, ib].sort().join("|"), ...rankState.recent].slice(0, 12);
    rankState.pair = nextPair();
    renderMain();
}

// ── duplicates ──
// two entries are only the same thing when nothing says they're different: not seasons of one show (combined, or a chain of
// sequels), not two different records on the same site, not a different year, season, volume or number
const DUP_IDS = ["anilist", "mal", "tmdb", "tvmaze", "imdb", "igdb", "rawg", "olKey", "gb", "isbn"];
function notSame(a, b) {
    if (a.partOf === b.id || b.partOf === a.id || (a.partOf && a.partOf === b.partOf)) return true;
    const A = a.ext || {},
        B = b.ext || {};
    if (DUP_IDS.some(k => A[k] && B[k] && String(A[k]) !== String(B[k]))) return true;
    if (a.year && b.year && a.year !== b.year) return true;
    if (a.season && b.season && String(a.season) !== String(b.season)) return true;
    if ((a.seriesNo || b.seriesNo) && a.seriesNo !== b.seriesNo) return true;
    if (a.kind && b.kind && a.kind !== b.kind && ["anime", "tv"].includes(a.medium)) return true;
    if (
        norm(a.title) !== norm(b.title) &&
        /\b(season|part|cour|vol(ume)?|book|\d+(st|nd|rd|th))\b|\d\s*$/i.test(a.title + " " + b.title)
    )
        return true;
    return false;
}
function dupGroups() {
    const m = new Map();
    for (const [id, b] of items) {
        const k = b.medium + "|" + norm(cleanTitle(b.title)) + "|" + (b.medium === "book" ? surname(b.creator) : "");
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(id);
    }
    const out = [];
    for (const g of m.values()) {
        if (g.length < 2) continue;
        const keep = g.filter(id =>
            g.some(o => o !== id && !notSame({ id, ...items.get(id) }, { id: o, ...items.get(o) }))
        );
        if (keep.length > 1) out.push(keep);
    }
    return out;
}
function dupesHTML() {
    const g = dupGroups();
    return `<div class="ph"><div class="ttl"><p>Same title and medium. Keep one: its tags, notes, quotes, links and log absorb the others.</p></div></div>
    ${
        g.length
            ? g
                  .map(
                      ids =>
                          `<div class="panel" style="margin-bottom:12px"><h3>${esc(titleOf(items.get(ids[0])))}</h3><div class="queue">${ids
                              .map(id => {
                                  const b = { id, ...items.get(id) };
                                  return `<div class="qi" style="grid-template-columns:34px minmax(0,1fr) auto">${coverHTML(b)}<div><button class="t" data-act="open" data-id="${esc(id)}">${esc(titleOf(b))}</button><div class="hint">${esc(MEDIA[b.medium].one)} · ${esc(b.creator || "")} · ${esc(statusWord(b.status, b.medium))} · from ${esc(b.source || "you")} · added ${esc(fmtDate(b.addedAt))}</div></div><button class="btn sm gold" data-act="dup-keep" data-id="${esc(id)}" data-k="${esc(ids.join(","))}">Keep this one</button></div>`;
                              })
                              .join("")}</div></div>`
                  )
                  .join("")
            : `<div class="empty"><h3>No duplicates</h3><p>Every title is unique within its medium.</p></div>`
    }`;
}
function mergeInto(keepId, ids) {
    const others = ids.filter(i => i !== keepId),
        order = { done: 5, active: 4, paused: 3, dnf: 2, want: 1, passed: 0 };
    change("Merge duplicates", [keepId, ...others], (b, id) => {
        if (id !== keepId) return null;
        const A = [b, ...others.map(o => items.get(o)).filter(Boolean)],
            m = { ...b };
        for (const k of ["tags", "genres"]) m[k] = [...new Set(A.flatMap(x => x[k] || []))];
        for (const k of ["quotes", "journal", "log"]) m[k] = A.flatMap(x => x[k] || []);
        m.links = A.flatMap(x => x.links || []).filter(
            (l, i, a) => l.id !== keepId && !others.includes(l.id) && a.findIndex(y => y.id === l.id) === i
        );
        m.rating = Math.max(...A.map(x => x.rating || 0));
        m.prog = Math.max(...A.map(x => x.prog || 0));
        m.notes = A.map(x => x.notes)
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join("\n\n");
        m.status = A.map(x => x.status).sort((x, y) => order[y] - order[x])[0];
        m.copy = A.map(x => x.copy).find(c => c && c !== "none") || "none";
        m.ext = Object.assign({}, ...A.map(x => x.ext || {}).reverse());
        m.scores = Object.assign({}, ...A.map(x => x.scores || {}).reverse());
        for (const f of [
            "cover",
            "year",
            "total",
            "about",
            "why",
            "startedAt",
            "finishedAt",
            "favRank",
            "fav",
            "creator",
            "banner",
            "runtime",
            "kind",
            "lane",
            "vibe",
        ])
            if (!m[f]) m[f] = A.map(x => x[f]).find(Boolean) || m[f] || null;
        return m;
    });
    const sw = q => (others.includes(q) ? keepId : q),
        uniq = (v, i, a) => a.indexOf(v) === i;
    meta.queue = meta.queue.map(sw).filter(uniq);
    meta.favOrder = meta.favOrder.map(sw).filter(uniq);
    meta.lists = meta.lists.map(l => ({
        ...l,
        ids: l.ids.map(sw).filter(uniq),
        ...(l.rows ? { rows: l.rows.map(r => ({ ...r, ids: r.ids.map(sw).filter(uniq) })) } : {}),
    }));
    markDirty();
}

// ── stats, with the deeper views one click away ──
function statsPageHTML() {
    const v = ui.statsView || "charts",
        views = STATS_VIEWS.filter(([k]) => k !== "airing" || hasAnimanga());
    const body =
        {
            charts: statsHTML,
            wrapped: wrappedHTML,
            taste: tasteHTML,
            compare: compareHTML,
            franchises: franchisesHTML,
            people: peopleHTML,
            airing: airingHTML,
            log: logHTML,
            dupes: dupesHTML,
        }[v] || statsHTML;
    return `<div class="chips subnav" role="group" aria-label="Which stats">${views.map(([k, l]) => `<button class="chip" data-act="stats-view" data-k="${k}" aria-pressed="${v === k}">${esc(l)}</button>`).join("")}${
        v === "charts"
            ? `<span class="spacer"></span><div class="seg">${[
                  ["all", "Everything"],
                  ["done", "Finished only"],
              ]
                  .map(
                      ([k, l]) =>
                          `<button data-act="stats-basis" data-k="${k}" aria-pressed="${(ui.statsBasis || "all") === k}">${l}</button>`
                  )
                  .join("")}</div>`
            : ""
    }</div>${body()}`;
}
