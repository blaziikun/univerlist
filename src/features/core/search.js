// src/features/core/search.js
// ─────────────────────────────────────────────────────────────────
//  Search: an icon that opens one box; results split by where they come from (Culture, Literature, Film & TV, Games)
// ─────────────────────────────────────────────────────────────────

const GS = {
    q: "",
    i: 0,
    rows: [],
    web: {},
    webQ: "",
    busy: {},
    slow: {},
    more: {},
    added: new Map(),
    adding: new Set(),
    timer: null,
    open: false,
    ctl: null,
};
const GS_COLS = [
    ["culture", "Culture", ["anime", "manga", "manhwa", "novel"], "AniList"],
    ["lit", "Literature", ["book", "comic"], "Open Library"],
    ["screen", "Film & TV", ["film", "tv"], ""],
    ["games", "Games", ["game"], ""],
    ["music", "Music", ["album"], "MusicBrainz"],
];
const GS_SUBS = [
    ["anime", "Anime"],
    ["manga", "Manga"],
    ["manhwa", "Manhwa & manhua"],
    ["novel", "Light novels"],
    ["book", "Books"],
    ["comic", "Comics"],
    ["film", "Films"],
    ["tv", "Series"],
    ["game", "Games"],
    ["album", "Music"],
];
const subOf = b => (b.medium === "film" && b.kind === "Anime film" ? "anime" : b.medium);
const colOf = b =>
    b.medium === "film" && b.kind === "Anime film"
        ? "culture"
        : (GS_COLS.find(c => c[2].includes(b.medium)) || GS_COLS[0])[0];
function searchBoxHTML() {
    return `<div class="gsbox"><span class="gsic">${ICON.search}</span><input id="gq" placeholder="Search your library and the web" autocomplete="off" spellcheck="false" aria-label="Search"><button class="gsx" type="button" tabindex="-1" data-act="search-close" aria-label="Clear or close search" title="Clear (Esc closes)">${ICON.x}</button></div><div class="gsres" id="gsres" hidden></div>`;
}
async function alSearchAny(q, signal) {
    const fl = ui.private ? "" : ", isAdult: false";
    const d = await AL.q(
        `query($q:String){ Page(perPage: 16){ media(search:$q${fl}, sort:[SEARCH_MATCH, POPULARITY_DESC]){ ${AL_MEDIA} } } }`,
        { q },
        signal
    );
    return (d.Page.media || []).map(m => ({ src: "anilist", ...alToFields(m) }));
}
// each column searches on its own, so a slow source never holds up the others
const GS_WEB = {
    culture: (q, s) => alSearchAny(q, s),
    music: (q, s) => (window.ulMusic ? ulMusic.searchAlbums(q, s) : Promise.resolve([])), // src/features/music
    lit: async (q, s) => {
        const [b, c] = await Promise.allSettled([olSearch(q, 8, s), gbSearch(q + " graphic novel", 3, s)]);
        return [...(b.value || []), ...(c.value || []).map(x => ({ ...x, medium: "comic", kind: "Graphic novel" }))];
    },
    screen: async (q, s) => {
        const [t, f] = await Promise.allSettled([
            TMDB_ON() ? tmdbSearch(q, "tv", s) : tvmazeSearch(q, s),
            TMDB_ON() ? tmdbSearch(q, "film", s) : filmSearchKeyless(q, s),
        ]);
        const T = (t.value || []).slice(0, 6),
            F = (f.value || []).slice(0, 6),
            out = [];
        for (let i = 0; i < 6; i++) {
            if (F[i]) out.push(F[i]);
            if (T[i]) out.push(T[i]);
        }
        return out;
    },
    games: async (q, s) => {
        const [m, a] = await Promise.allSettled([
            IGDB_ON()
                ? igdbSearch(q, s).catch(() => (KEYS.rawg ? rawgSearch(q, s) : wdSearch(q, "game", s)))
                : KEYS.rawg
                  ? rawgSearch(q, s)
                  : wdSearch(q, "game", s),
            sleep(0).then(() => archiveGames(q, s)),
        ]);
        const M = m.value || [],
            seen = new Set(M.map(x => idTitle(x.title)));
        return [...M, ...(a.value || []).filter(x => !seen.has(idTitle(x.title))).slice(0, M.length > 8 ? 2 : 4)];
    },
};
function gsLocal(q) {
    const nq = norm(q);
    if (!nq) return [];
    return allWithParts()
        .map(b => {
            const t = norm(titleOf(b)),
                t2 = norm([(b.alt || {}).romaji, (b.alt || {}).native, b.title].join(" "));
            return {
                b,
                s:
                    (t === nq ? 5 : 0) +
                    (t.startsWith(nq) ? 3 : 0) +
                    (t.includes(nq) || t2.includes(nq) ? 2 : 0) +
                    (norm(b.creator).includes(nq) ? 1 : 0) +
                    (b.fav ? 0.3 : 0),
            };
        })
        .filter(x => x.s > 1)
        .sort((a, b) => b.s - a.s)
        .slice(0, 40)
        .map(x => x.b);
}
function renderSearch() {
    const box = $("#gsres");
    if (!box) return;
    const q = GS.q.trim();
    if (!GS.open || !q) {
        box.hidden = true;
        return;
    }
    const loc = gsLocal(q),
        lib = new Map(),
        byExt = new Map();
    for (const b of allWithParts()) {
        for (const t of [b.title, (b.alt || {}).en, (b.alt || {}).romaji].filter(Boolean))
            lib.set(b.medium + "|" + idTitle(t), b);
        for (const [k, v] of Object.entries(b.ext || {}))
            if (v && ["anilist", "tmdb", "rawg", "igdb", "tvmaze", "imdb", "olKey", "mal"].includes(k))
                byExt.set(k + ":" + v, b);
    }
    const haveOf = r => {
        for (const [k, v] of Object.entries(r.ext || {}))
            if (v && byExt.has(k + ":" + v)) return byExt.get(k + ":" + v);
        return lib.get(r.medium + "|" + idTitle(r.title));
    };
    GS.rows = [];
    GS.cands = [];
    const row = (html, fn, cls = "") => {
        const i = GS.rows.length;
        GS.rows.push(fn);
        return `<div class="gsr${i === GS.i ? " on" : ""} ${cls}" data-gs="${i}" role="option">${html}</div>`;
    };
    const libRow = b =>
        row(
            `<span class="gsc">${coverHTML(b)}</span><span class="gst"><b>${esc(titleOf(b))}</b><small>${esc([b.kind || MEDIA[b.medium].one, b.year, statusWord(b.status, b.medium), b.partOf && items.has(b.partOf) ? "in " + titleOf(items.get(b.partOf)) : ""].filter(Boolean).join(" · "))}</small></span>${b.rating ? `<span class="gss">${esc(fmtScore(b.rating, scaleOf(b)))}</span>` : `<span class="gsin">✓</span>`}`,
            () => openItem(b.id),
            "mine"
        );
    const webRow = r => {
        const have = haveOf(r);
        return have
            ? libRow({ id: have.id, ...have })
            : row(
                  `<span class="gsc">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="nocov"></span>`}</span><span class="gst"><b>${esc(r.title)}</b><small>${esc([r.kind && r.kind !== (MEDIA[r.medium] || {}).one ? r.kind : MEDIA[r.medium] ? MEDIA[r.medium].one : "", r.year, r.creator].filter(Boolean).join(" · "))}</small></span>${GS.adding.has(r.medium + "|" + idTitle(r.title)) ? `<span class="gsadd busy" aria-label="Adding"></span>` : `<button class="gsadd" type="button" tabindex="-1" data-gsq="${GS.cands.length}" title="Add as ${esc(statusWord(meta.settings.quickStatus || "want", r.medium))} (click the row to fill in details)" aria-label="Quick add ${esc(r.title)}">${ICON.plus}</button>`}`,
                  () => addFromCandidate(r),
                  "web" + (GS.cands.push(r), "")
              );
    };
    const here = colOf({ medium: (addDefaults() || {}).medium || "anime", kind: "" });
    const cols = GS_COLS.map(([k, name]) => {
        // split by type inside the column (Anime / Manga / Manhwa / Light novels; Films / Series…), each with its own few
        const big = !!GS.more[k],
            mineAll = loc.filter(b => colOf(b) === k),
            seenAll = new Set(mineAll.map(b => b.id));
        const webAll = (GS.webQ === q ? GS.web[k] || [] : []).filter(r => {
            const h = haveOf(r);
            return !h || !seenAll.has(h.id);
        });
        const subs = GS_SUBS.filter(([sk]) => mineAll.some(b => subOf(b) === sk) || webAll.some(r => subOf(r) === sk));
        const parts = subs.map(([sk, sl]) => [
            sl,
            mineAll.filter(b => subOf(b) === sk).slice(0, big ? 40 : 3),
            webAll.filter(r => subOf(r) === sk).slice(0, big ? 40 : subs.length > 1 ? 4 : 6),
        ]);
        const mine = parts.flatMap(p => p[1]),
            web = parts.flatMap(p => p[2]);
        const hiddenN = mineAll.length - mine.length + webAll.length - web.length;
        const body = parts
            .map(
                ([sl, M, Wb]) =>
                    (subs.length > 1 ? `<div class="gssub">${esc(sl)}</div>` : "") +
                    M.map(libRow).join("") +
                    Wb.map(webRow).join("")
            )
            .join("");
        return `<div class="gscol${k === here ? " here" : ""}"><div class="gsg">${esc(name)}${GS.busy[k] ? `<span class="hint">${GS.slow[k] ? "still looking…" : "searching…"}</span>` : GS.slow[k] === "timeout" ? `<button class="linkbtn" data-gsretry="${k}">slow · try again</button>` : ""}</div>${body}${!mine.length && !web.length && !GS.busy[k] ? `<p class="hint gsp">${GS.webQ === q || !navigator.onLine ? "Nothing here" : "…"}</p>` : ""}${hiddenN > 0 || big ? `<button class="gsmore" data-gsmore="${k}">${big ? "Show fewer" : `Show all · ${hiddenN} more`}</button>` : ""}</div>`;
    }).join("");
    const chars = meta.chars.filter(c => norm(c.name).includes(norm(q))).slice(0, 4),
        lists = meta.lists.filter(l => !l.private === !ui.private && norm(l.name).includes(norm(q))).slice(0, 3);
    const qs = meta.settings.quickStatus || "want";
    box.innerHTML = `<div class="gsbar"><span class="hint">＋ adds straight to</span>${["want", "active", "done"].map(k => `<button class="chip" data-gsqs="${k}" aria-pressed="${qs === k}">${esc(STATUS_WORDS.any[k] || k)}</button>`).join("")}<span class="spacer"></span><span class="hint">↑↓ to move · Enter to open · Esc to close</span></div><div class="gscols">${cols}</div>
    ${chars.length || lists.length ? `<div class="gsextra">${chars.map(c => row(`<span class="gsc round">${charImg(c) ? `<img src="${esc(charImg(c))}" alt="" referrerpolicy="no-referrer">` : ""}</span><span class="gst"><b>${esc(c.name)}</b><small>Character</small></span>`, () => openModal("char", { id: c.id }), "chip")).join("")}${lists.map(l => row(`<span class="gsi">${l.numbered ? "№" : "≡"}</span><span class="gst"><b>${esc(l.name)}</b><small>List</small></span>`, () => goList(l.id), "chip")).join("")}</div>` : ""}
    <div class="gsfoot">${row(`<span class="gsi">${ICON.plus}</span><span class="gst"><b>Add “${esc(q)}” yourself</b></span>`, () => openModal("add", { step: "review", medium: addDefaults().medium, draft: { title: q, medium: addDefaults().medium, kind: addDefaults().kind, status: "want", copy: "none" }, coverData: "" }), "chip")}${ui.private && vault.prefs && (vault.prefs.links || []).length ? `<span class="gslinks">${vault.prefs.links.map(l => `<a class="chip" href="${esc(safeUrl(l.url.replace("{q}", encodeURIComponent(q))))}" target="_blank" rel="noopener noreferrer">${esc(l.name)} ↗</a>`).join("")}</span>` : `<span class="hint">↑ ↓ to move · Enter to open · + to add</span>`}</div>`;
    GS.i = Math.min(GS.i, Math.max(0, GS.rows.length - 1));
    box.hidden = false;
}
async function addFromCandidate(c) {
    closeSearch();
    openModal("add", {
        step: "review",
        busy: true,
        medium: c.medium,
        draft: { ...c, status: "want", copy: "none" },
        coverData: "",
    });
    const d = await candidateDetails(c),
        m = ui.modal;
    if (!m || m.kind !== "add") return;
    const med = d.medium || c.medium,
        kind = d.kind || (med === "book" ? "Novel" : "");
    Object.assign(m, {
        busy: false,
        medium: med,
        draft: {
            ...d,
            medium: med,
            kind,
            status: "want",
            copy: "none",
            format: med === "book" ? (d.total ? (d.total < 350 ? "Short" : "Long") : "") : undefined,
        },
    });
    renderOverlay(true);
}
// quick add: straight into the library with your default status; the search stays open for the next one
async function quickAdd(r) {
    const key = r.medium + "|" + idTitle(r.title);
    if (GS.adding.has(key)) return;
    GS.adding.add(key);
    renderSearch();
    let d = r;
    try {
        d = (await Promise.race([candidateDetails(r), sleep(7000).then(() => null)])) || r;
    } catch (_) {
        d = r;
    }
    const st = meta.settings.quickStatus || "want",
        med = d.medium || r.medium;
    const data = {
        ...r,
        ...d,
        medium: med,
        kind: d.kind || r.kind || (med === "book" ? "Novel" : ""),
        status: st,
        copy: "none",
        rating: 0,
        source: d.src || r.src || "you",
    };
    for (const k of [
        "src",
        "recs",
        "cast",
        "votes",
        "score",
        "seeds",
        "reason",
        "add",
        "popularity",
        "lang",
        "desc",
        "filmKind",
        "id",
    ])
        delete data[k];
    if (st === "done") data.finishedAt = nowISO();
    if (st === "active") data.startedAt = nowISO();
    let nid = addItem(data, "Add " + data.title);
    if (ui.private && vault.key) nid = makePrivate(nid);
    GS.adding.delete(key);
    renderSearch();
    renderMain();
    toast(`Added ${data.title} · ${statusWord(st, med)}`, { label: "Undo", fn: undo });
    if (!data.cover) setTimeout(() => autoCovers([nid]), 300);
    else cacheAndColour(nid).then(() => updateItemTiles(nid));
    setTimeout(
        () =>
            refreshItem(nid, undefined, { full: false })
                .then(() => upgradeGameCover(nid))
                .then(afterChange)
                .catch(() => {}),
        1200
    );
}
function gsRun(i) {
    const fn = GS.rows[i];
    if (!fn) return;
    const q = GS.q;
    closeSearch();
    fn(q);
}
function closeSearch() {
    GS.open = false;
    document.body.classList.remove("gs-on");
    GS.more = {};
    const box = $("#gsres");
    if (box) box.hidden = true;
    const i = $("#gq");
    if (i) {
        i.value = "";
        if (document.activeElement === i) i.blur();
    }
    GS.q = "";
    const w = $("#gs");
    if (w) w.classList.remove("open");
}
function focusSearch() {
    const w = $("#gs"),
        i = $("#gq");
    if (!i) return;
    w.classList.add("open");
    document.body.classList.add("gs-on");
    GS.open = true;
    i.focus();
    i.select();
    requestAnimationFrame(() => {
        if (document.activeElement !== i) i.focus();
    });
    renderSearch();
}
document.addEventListener("input", e => {
    if (e.target.id !== "gq") return;
    GS.q = e.target.value;
    GS.i = 0;
    GS.open = true;
    renderSearch();
    clearTimeout(GS.timer);
    const q = GS.q.trim();
    if (q.length >= 2 && navigator.onLine)
        GS.timer = setTimeout(() => {
            if (GS.ctl) GS.ctl.abort();
            GS.ctl = new AbortController();
            const sig = GS.ctl.signal;
            GS.webQ = q;
            GS.web = {};
            for (const [k] of GS_COLS) gsCol(k, q, sig);
            renderSearch();
        }, 420);
});
// each column on its own clock: "still looking" after 4s, give up after 12s with a retry
function gsCol(k, q, sig) {
    GS.busy[k] = true;
    GS.slow[k] = false;
    const slowT = setTimeout(() => {
        if (GS.webQ === q && GS.busy[k]) {
            GS.slow[k] = true;
            renderSearch();
        }
    }, 4000);
    Promise.race([
        GS_WEB[k](q, sig),
        sleep(12000).then(() => {
            throw new Error("timeout");
        }),
    ])
        .then(r => {
            if (GS.webQ === q) {
                GS.web[k] = (r || []).filter(x => x && x.title && (ui.private || !x.flag));
                GS.slow[k] = false;
            }
        })
        .catch(e => {
            if (GS.webQ === q && e && e.message === "timeout") GS.slow[k] = "timeout";
        })
        .finally(() => {
            clearTimeout(slowT);
            if (GS.webQ === q) {
                GS.busy[k] = false;
                renderSearch();
            }
        });
}
document.addEventListener(
    "keydown",
    e => {
        if (e.target.id !== "gq") return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            GS.i = Math.max(0, Math.min(GS.rows.length - 1, GS.i + (e.key === "ArrowDown" ? 1 : -1)));
            renderSearch();
            const on = $("#gsres .gsr.on");
            on && on.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (GS.rows.length && GS.q.trim()) gsRun(GS.i);
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            closeSearch();
        }
    },
    true
);
document.addEventListener(
    "pointerdown",
    e => {
        const qa = e.target.closest("[data-gsq]");
        if (qa) {
            e.preventDefault();
            e.stopPropagation();
            const r = GS.cands[Number(qa.dataset.gsq)];
            if (r) quickAdd(r);
            return;
        }
        const qs = e.target.closest("[data-gsqs]");
        if (qs) {
            e.preventDefault();
            meta.settings.quickStatus = qs.dataset.gsqs;
            markDirty();
            renderSearch();
            return;
        }
        const mo = e.target.closest("[data-gsmore]");
        if (mo) {
            e.preventDefault();
            GS.more[mo.dataset.gsmore] = !GS.more[mo.dataset.gsmore];
            renderSearch();
            return;
        }
        const rt = e.target.closest("[data-gsretry]");
        if (rt) {
            e.preventDefault();
            if (!GS.ctl || GS.ctl.signal.aborted) GS.ctl = new AbortController();
            gsCol(rt.dataset.gsretry, GS.webQ, GS.ctl.signal);
            renderSearch();
            return;
        }
        const r = e.target.closest("[data-gs]");
        if (r) {
            e.preventDefault();
            gsRun(Number(r.dataset.gs));
            return;
        }
        if (e.target.closest('[data-act="search-close"]')) {
            e.preventDefault();
            const i = $("#gq");
            if (i && i.value) {
                i.value = "";
                GS.q = "";
                GS.webQ = "";
                GS.more = {};
                renderSearch();
                i.focus();
            } else closeSearch();
            return;
        }
        if (GS.open && !e.target.closest("#gs") && !e.target.closest('[data-act="focus-search"]')) closeSearch();
    },
    true
);
