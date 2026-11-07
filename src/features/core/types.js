// src/features/core/types.js
// ─────────────────────────────────────────────────────────────────
//  Types: what each kind is called and which kinds count as one (ONA and OVA sit with anime series by default)
// ─────────────────────────────────────────────────────────────────

const KIND_MERGE_DEFAULT = { anime: { ONA: "TV", OVA: "TV" } };
const KIND_LABEL_DEFAULT = { anime: { TV: "Anime" } };
const kindMerge = () => meta.settings.kindMerge || KIND_MERGE_DEFAULT;
const kindLabels = () => meta.settings.kindLabel || KIND_LABEL_DEFAULT;
// the kind an item is shown and grouped as (after merging); its stored kind never changes
function kindOf(b) {
    const k = b.kind || "";
    return (kindMerge()[b.medium] || {})[k] || k;
}
function kindName(medium, k) {
    return (kindLabels()[medium] || {})[k] || k || (MEDIA[medium] || {}).name || "";
}
const kindShown = b => kindName(b.medium, kindOf(b));
// the kinds of each medium: the usual ones, plus any your library has picked up (like genres, they grow with what you add)
function libKinds(m) {
    const seen = new Set(KINDS[m] || []);
    for (const b of items.values()) if (b.medium === m && b.kind && (!b.private || ui.private)) seen.add(b.kind);
    return [...seen];
}
function typesSettingsHTML(mode) {
    const M = kindMerge(),
        L = kindLabels(),
        used = new Set([...items.values()].map(b => b.medium)),
        media = mode ? MEDIA_KEYS.filter(k => kindToggles(mode.match || ["*"], k).some(x => x[1])) : null;
    const show = MEDIA_KEYS.filter(
        m => libKinds(m).length > 1 && (media ? media.includes(m) : ui.typesAll || used.has(m))
    );
    return (
        (show.length ? "" : `<p class="hint">Types show up here as your library grows.</p>`) +
        show
            .map(m => {
                const K = libKinds(m);
                return `<div class="kindrow"><b>${esc(MEDIA[m].name)}</b><div class="kinds">${K.map(k => {
                    const into = (M[m] || {})[k] || "";
                    return `<label class="kindc${into ? " merged" : ""}"><input class="inp" data-kindlabel="${m}|${esc(k)}" value="${esc((L[m] || {})[k] || "")}" placeholder="${esc(k)}" title="What ${esc(k)} is called" ${into ? "disabled" : ""}>
      <select class="sel" data-kindmerge="${m}|${esc(k)}" title="Show ${esc(k)} as its own type, or as part of another">${[["", "its own"], ...K.filter(x => x !== k && !(M[m] || {})[x]).map(x => [x, "→ " + ((L[m] || {})[x] || x)])].map(([v, l]) => `<option value="${esc(v)}"${v === into ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
                }).join("")}</div></div>`;
            })
            .join("")
    );
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.kindmerge) {
        const [m, k] = t.dataset.kindmerge.split("|"),
            M = clone(kindMerge());
        M[m] = { ...(M[m] || {}) };
        if (t.value) M[m][k] = t.value;
        else delete M[m][k];
        meta.settings.kindMerge = M;
        markDirty();
        renderMain();
    }
    if (t.dataset.kindlabel) {
        const [m, k] = t.dataset.kindlabel.split("|"),
            L = clone(kindLabels());
        L[m] = { ...(L[m] || {}) };
        const v = t.value.trim();
        if (v && v !== k) L[m][k] = v;
        else delete L[m][k];
        meta.settings.kindLabel = L;
        markDirty();
        renderMain();
    }
});

// ═══════════════════════════════════════════
//  GENRES: ONLY THE OFFICIAL LIST FOR EACH KIND OF THING; EVERYTHING ELSE A SOURCE CALLS A GENRE IS A THEME
// ═══════════════════════════════════════════
const GENRES_OFFICIAL = {
    // AniList's genre list (its tags are themes)
    culture: [
        "Action",
        "Adventure",
        "Comedy",
        "Drama",
        "Ecchi",
        "Fantasy",
        "Hentai",
        "Horror",
        "Mahou Shoujo",
        "Mecha",
        "Music",
        "Mystery",
        "Psychological",
        "Romance",
        "Sci-Fi",
        "Slice of Life",
        "Sports",
        "Supernatural",
        "Thriller",
    ],
    // TMDB's film and TV genres
    screen: [
        "Action",
        "Adventure",
        "Animation",
        "Comedy",
        "Crime",
        "Documentary",
        "Drama",
        "Family",
        "Fantasy",
        "History",
        "Horror",
        "Music",
        "Mystery",
        "Romance",
        "Science Fiction",
        "Thriller",
        "War",
        "Western",
        "Action & Adventure",
        "Kids",
        "News",
        "Reality",
        "Sci-Fi & Fantasy",
        "Soap",
        "Talk",
        "War & Politics",
        "TV Movie",
    ],
    // IGDB's game genres
    games: [
        "Adventure",
        "Arcade",
        "Card & Board Game",
        "Fighting",
        "Hack and slash/Beat 'em up",
        "Indie",
        "MOBA",
        "Music",
        "Pinball",
        "Platform",
        "Point-and-click",
        "Puzzle",
        "Quiz/Trivia",
        "Racing",
        "Real Time Strategy (RTS)",
        "Role-playing (RPG)",
        "Shooter",
        "Simulator",
        "Sport",
        "Strategy",
        "Tactical",
        "Turn-based strategy (TBS)",
        "Visual Novel",
        "Action",
        "Casual",
        "Family",
        "Massively Multiplayer",
        "Sports",
        "Educational",
        "Board Games",
        "Card",
    ],
};
const genreFamily = b =>
    ["anime", "manga", "manhwa", "novel"].includes(b.medium)
        ? "culture"
        : ["film", "tv"].includes(b.medium)
          ? "screen"
          : b.medium === "game"
            ? "games"
            : "books";
const gnorm = g => norm(String(g).replace(/\s*\(.*\)$/, ""));
// official name by its normalised form, so "drama", "Drama" and "Science-Fiction" all land on one spelling
const GEN_MAPS = Object.fromEntries(
    [
        ...Object.entries(GENRES_OFFICIAL),
        ["books", [...BOOK_GENRES.map(([n]) => n), "Fiction", "Non-fiction", "Textbook", "Reference"]],
    ].map(([k, L]) => [k, new Map(L.map(g => [gnorm(g), g]))])
);
GEN_MAPS.screen.set("science fiction", "Science Fiction");
GEN_MAPS.screen.set("sci fi", "Science Fiction");
GEN_MAPS.culture.set("science fiction", "Sci-Fi");
const officialName = (b, g) => GEN_MAPS[genreFamily(b)].get(gnorm(g)) || null;
function officialGenre(b, g) {
    return !!officialName(b, g);
}
// split an item's genres into official genres and themes; run once over the library, and on everything new
function splitGenres(b) {
    const G = b.genres || [];
    if (!G.length) return null;
    const keep = [...new Set(G.map(g => officialName(b, g)).filter(Boolean))],
        move = G.filter(g => !officialGenre(b, g));
    if (!move.length && keep.length === G.length && keep.every((g, i) => g === G[i])) return null;
    return { genres: keep, themes: [...new Set([...(b.themes || []), ...move])] };
}

// ═══════════════════════════════════════════
//  WHICH MODE A THING LIVES IN: THE MODE'S RULES, UNLESS YOU MOVED IT
// ═══════════════════════════════════════════
// b.modeHome = a mode id: it shows in that mode (and Hub) instead of wherever its type would put it
function moveToMode(ids, mid) {
    const L = [].concat(ids).filter(id => items.has(id));
    if (!L.length) return;
    change(
        L.length === 1
            ? `Move ${titleOf(items.get(L[0]))} to ${modeById(mid).name}`
            : `Move ${L.length} to ${modeById(mid).name}`,
        L,
        x => ({ ...x, modeHome: mid === "auto" ? undefined : mid })
    );
    toast(mid === "auto" ? "Back where its type puts it" : `Now in ${modeById(mid).name}`, { label: "Undo", fn: undo });
}

// ═══════════════════════════════════════════
//  ADVANCED FILTER: RULES YOU BUILD (FIELD, TEST, VALUE), ALL OR ANY
// ═══════════════════════════════════════════
const RULE_FIELDS = [
    ["title", "Title", "text", b => [titleOf(b), b.title, (b.alt || {}).romaji, (b.alt || {}).native].join(" ")],
    ["creator", "Creator", "text", b => b.creator],
    ["genre", "Genre", "list", b => b.genres],
    ["theme", "Theme", "list", b => b.themes],
    ["tag", "Your tag", "list", b => b.tags],
    ["kind", "Type", "set", b => kindShown(b)],
    ["medium", "Medium", "set", b => MEDIA[b.medium].name],
    ["status", "Status", "set", b => statusWord(b.status, b.medium)],
    ["score", "Your score", "num", b => (b.rating ? fmtScore(b.rating, scaleOf(b)) : null)],
    ["crowd", "Crowd score", "num", b => crowd(b).avg],
    ["year", "Release year", "num", b => b.year],
    ["length", "Length (episodes, chapters, pages, hours)", "num", b => b.total],
    ["progress", "Progress %", "num", b => (b.total ? pct(b) : null)],
    ["added", "Added", "date", b => b.addedAt],
    ["ended", "Finished", "date", b => endedAt(b)],
    ["fav", "Favourite", "bool", b => !!b.fav],
    ["notes", "Notes", "text", b => b.notes],
];
const RULE_OPS = {
    text: [
        ["has", "contains"],
        ["not", "doesn't contain"],
    ],
    list: [
        ["has", "has"],
        ["not", "doesn't have"],
    ],
    set: [
        ["is", "is"],
        ["isnt", "isn't"],
    ],
    num: [
        ["ge", "at least"],
        ["le", "at most"],
        ["eq", "exactly"],
    ],
    date: [
        ["after", "after"],
        ["before", "before"],
    ],
    bool: [
        ["yes", "yes"],
        ["no", "no"],
    ],
};
function ruleOk(b, r) {
    const F = RULE_FIELDS.find(x => x[0] === r.f);
    if (!F) return true;
    const [, , type, get] = F,
        v = get(b);
    if (type === "bool") return r.op === "no" ? !v : !!v;
    if (r.v === "" || r.v == null) return true;
    if (type === "text") {
        const hit = norm(v).includes(norm(r.v));
        return r.op === "not" ? !hit : hit;
    }
    if (type === "list") {
        const hit = (v || []).some(x => norm(x) === norm(r.v));
        return r.op === "not" ? !hit : hit;
    }
    if (type === "set") {
        const hit = norm(v) === norm(r.v);
        return r.op === "isnt" ? !hit : hit;
    }
    if (type === "num") {
        const n = parseFloat(v),
            w = parseFloat(r.v);
        if (!Number.isFinite(n)) return false;
        return r.op === "le" ? n <= w : r.op === "eq" ? Math.abs(n - w) < 1e-9 : n >= w;
    }
    if (type === "date") {
        if (!v) return false;
        return r.op === "before" ? String(v) < r.v : String(v) >= r.v;
    }
    return true;
}
const rulesOk = (b, f) => {
    const R = (f.rules || []).filter(r => r.f);
    return !R.length || (f.any ? R.some(r => ruleOk(b, r)) : R.every(r => ruleOk(b, r)));
};
function ruleValues(fid) {
    const F = RULE_FIELDS.find(x => x[0] === fid);
    if (!F || !["list", "set"].includes(F[2])) return [];
    const c = new Map();
    for (const b of modeItems()) for (const v of [].concat(F[3](b) || [])) if (v) c.set(v, (c.get(v) || 0) + 1);
    return [...c.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 200)
        .map(x => x[0]);
}
function rulesHTML(f) {
    const R = f.rules || [];
    return `<div class="rules"><div class="fp-head"><b>Rules</b><span class="hint">match</span><div class="seg">${[
        ["", "all"],
        ["1", "any"],
    ]
        .map(([k, l]) => `<button data-act="rule-any" data-k="${k}" aria-pressed="${!!k === !!f.any}">${l}</button>`)
        .join("")}</div><span class="spacer"></span><button class="btn sm" data-act="rule-add">+ Rule</button></div>
    ${
        R.length
            ? R.map((r, i) => {
                  const F = RULE_FIELDS.find(x => x[0] === r.f) || RULE_FIELDS[0],
                      type = F[2],
                      vals = ruleValues(F[0]);
                  return `<div class="rule">${selOf(
                      "",
                      RULE_FIELDS.map(x => [x[0], x[1]]),
                      F[0],
                      `data-rule="${i}" data-rk="f"`
                  )}${selOf("", RULE_OPS[type], r.op || RULE_OPS[type][0][0], `data-rule="${i}" data-rk="op"`)}
        ${type === "bool" ? "" : `<input class="inp" data-rule="${i}" data-rk="v" value="${esc(r.v || "")}" ${type === "num" ? 'inputmode="decimal"' : type === "date" ? 'type="date"' : ""} ${vals.length ? `list="rv-${i}"` : ""} placeholder="${type === "num" ? "number" : "value"}">${vals.length ? `<datalist id="rv-${i}">${vals.map(v => `<option value="${esc(v)}">`).join("")}</datalist>` : ""}`}
        <button class="linkbtn" data-act="rule-del" data-k="${i}" aria-label="Remove rule">✕</button></div>`;
              }).join("")
            : `<p class="hint">Rules for anything the chips above can't say: “Crowd score at least 80”, “Finished after 2025-01-01”, “Theme has Time Travel”, “Notes contain rewatch”.</p>`
    }</div>`;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || t.dataset.rule == null) return;
    const f = (ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}) }),
        R = (f.rules = (f.rules || []).slice()),
        i = Number(t.dataset.rule),
        k = t.dataset.rk;
    R[i] = { ...R[i], [k]: t.value };
    if (k === "f") {
        const F = RULE_FIELDS.find(x => x[0] === t.value);
        R[i].op = RULE_OPS[F[2]][0][0];
        R[i].v = "";
    }
    ui.viewId = null;
    renderMain();
});
