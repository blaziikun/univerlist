// src/features/watch-read/stage.js
// ─────────────────────────────────────────────────────────────────
//  Watch & Read: one quiet place to play and read your own things
//
//  A long search box that answers as you type (a plain list by default, covers if you like), a switch between Watch and
//  Read next to the app name, and only what you need: what you were in the middle of, your servers, and files from this
//  computer.
// ─────────────────────────────────────────────────────────────────

const STAGE_CATS = {
    watch: [
        ["all", "All"],
        ["anime", "Anime"],
        ["tv", "TV"],
        ["film", "Film"],
    ],
    read: [
        ["all", "All"],
        ["manga", "Manga"],
        ["manhwa", "Manhwa & manhua"],
        ["novel", "Light novels"],
        ["book", "Books"],
        ["comic", "Comics"],
    ],
};
const SG = { cat: { watch: "all", read: "all" }, ri: 0, rq: "", rres: null, rbusy: false, t: 0 };
const stageCovers = () => !!meta.settings.stageCovers;
function stageHeadHTML(kind) {
    const w = kind === "watch",
        q = w ? W.q : SG.rq,
        cat = SG.cat[kind];
    return `<div class="shead"><div class="sq">${ICON.search}<input id="${w ? "wq" : "rq"}" placeholder="${w ? "Search anime, shows and films" : "Search manga, manhwa, novels and books"}" value="${esc(q || "")}" autocomplete="off" spellcheck="false" aria-label="Search">${q ? `<button class="sqx" data-act="stage-clear" aria-label="Clear">${ICON.x}</button>` : ""}</div>
    <div class="sgrow"><label class="lbsel"><span class="lbk">Type</span>${selOf(
        "",
        STAGE_CATS[kind].map(([k, l]) => [k, k === "all" ? "Any" : l]),
        cat,
        `data-stagecat="${kind}" aria-label="Type"`
    )}</label><span class="spacer"></span>
      <label class="ctl stog"><input type="checkbox" data-stagecovers="1" ${stageCovers() ? "checked" : ""}> Covers</label>
      <button class="btn sm ghost" data-act="${w ? "watch-servers" : "rl-servers"}" aria-pressed="${!!(w ? ui.watchServers : ui.readServers)}">Servers${w ? (servers().length + LIBS().length ? " · " + (servers().length + LIBS().length) : "") : RLIBS().length ? " · " + RLIBS().length : ""}</button>
      <button class="btn sm ghost" data-act="${w ? "watch-files" : "read-files"}">Upload files</button></div></div>`;
}
// the results, as a list you can arrow through (or covers)
function stageResHTML(kind) {
    const w = kind === "watch",
        R = w ? W.results : SG.rres,
        busy = w ? W.busy : SG.rbusy,
        q = w ? W.q : SG.rq;
    if (!q) return "";
    if (busy && !(R || []).length) return `<p class="think sres-busy">Searching…</p>`;
    if (!R) return "";
    if (!R.length) return `<p class="hint">Nothing found for “${esc(q)}”.</p>`;
    // Watch searches the catalogues, not your library, so it doesn't mark what you have; Read still lists your own files first
    const have = r => {
        if (w) return null;
        const id = r.id && items.has(r.id) ? r.id : findExisting(r.title, r.creator || "", r.medium, r.ext);
        return id ? items.get(id) : null;
    };
    if (stageCovers())
        return `<div class="wgrid">${R.map((r, i) => {
            const h = have(r);
            return `<button class="wtile${i === SG.ri ? " on" : ""}" data-act="stage-pick" data-k="${i}">${r.cover ? `<img src="${esc(coverCache.src(r.cover))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="nocov">${esc(r.title)}</span>`}<span class="t">${esc(r.title)}</span><span class="hint">${esc([r.year, MEDIA[r.medium] ? MEDIA[r.medium].one : "", h ? statusWord(h.status, h.medium) : ""].filter(Boolean).join(" · "))}</span></button>`;
        }).join("")}</div>`;
    return `<div class="slist" role="listbox">${R.map((r, i) => {
        const h = have(r);
        return `<button class="sli${i === SG.ri ? " on" : ""}" role="option" data-act="stage-pick" data-k="${i}"><span class="st">${esc(r.title)}</span><span class="sm">${esc([r.year, r.kind && r.kind !== (MEDIA[r.medium] || {}).one ? r.kind : MEDIA[r.medium] ? MEDIA[r.medium].one : ""].filter(Boolean).join(" · "))}</span>${h ? `<span class="pill ${h.status}">${esc(statusWord(h.status, h.medium))}</span>` : ""}</button>`;
    }).join("")}</div>`;
}
function stageContinueHTML(kind) {
    const w = kind === "watch",
        L = all()
            .filter(
                b =>
                    (w ? ["tv", "anime", "film"].includes(b.medium) : readable(b)) &&
                    ["active", "redo"].includes(b.status)
            )
            .sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")))
            .slice(0, 24);
    if (!L.length) return "";
    const open = meta.settings.stageCont !== false;
    return `<details class="stcont"${open ? " open" : ""} data-stagecont="1"><summary><span>Continue ${w ? "watching" : "reading"}</span><span class="cn">${L.length}</span></summary>
    ${
        stageCovers()
            ? `<div class="wstrip">${L.map(b => `<button class="wtile" data-act="${w ? "watch-item" : "read-open"}" data-id="${esc(b.id)}">${coverHTML(b)}<span class="t">${esc(cleanTitle(titleOf(b)))}</span><span class="hint">${esc(b.medium === "film" ? b.year || "Film" : progText(b))}</span></button>`).join("")}</div>`
            : `<div class="slist">${L.map(b => `<button class="sli" data-act="${w ? "watch-item" : "read-open"}" data-id="${esc(b.id)}"><span class="st">${esc(cleanTitle(titleOf(b)))}</span><span class="sm">${esc(b.medium === "film" ? b.year || "Film" : progText(b))}</span><span class="sbar"><i style="width:${pct(b)}%"></i></span></button>`).join("")}</div>`
    }</details>`;
}
function watchPageHTML() {
    return `<div class="watch stage">${stageHeadHTML("watch")}
    ${ui.watchServers ? serversHTML() : ""}
    ${
        W.view === "show" && W.show
            ? watchShowHTML()
            : `<div id="sres">${stageResHTML("watch")}</div>${W.q ? "" : stageContinueHTML("watch")}${W.q || !LIBS().length ? "" : libBrowseHTML()}
      ${!W.q && !all().some(b => ["tv", "anime", "film"].includes(b.medium) && ["active", "redo"].includes(b.status)) ? `<div class="empty"><h3>Find something to watch</h3><p>Type above. Episodes come from TVmaze and AniList; you play your own files, links or servers.</p></div>` : ""}`
    }</div>`;
}
function readPageHTML() {
    if (RD.item && items.has(RD.item)) return readerPageHTML();
    return `<div class="watch read stage">${stageHeadHTML("read")}
    ${ui.readServers ? `<section class="panel wservers"><h3>Your reading servers<span class="r"><button class="btn sm ghost" data-act="rl-servers">Done</button></span></h3>${libsPanelHTML("rlibs")}</section>` : ""}
    <div id="sres">${stageResHTML("read")}</div>${SG.rq ? "" : stageContinueHTML("read")}${SG.rq || !RLIBS().length ? "" : readBrowseHTML()}
    ${!SG.rq && !all().some(b => readable(b) && ["active", "redo"].includes(b.status)) ? `<div class="empty"><h3>Nothing open</h3><p>Search above, upload a file, or connect a server.</p></div>` : ""}
    <p class="hint wnote">Nothing is uploaded anywhere: files you open stay on this computer, and chapters on your servers are read straight from them.</p></div>`;
}
// One list of the shows that match, from AniList, TVmaze and the film source, never from your library:
//  - the same show listed as anime and as TV (same name, first aired within a year of each other) is one entry
//  - seasons AniList lists separately (Bungo Stray Dogs, 2nd Season, 3rd Season…) are one entry; Watch gathers its seasons when you open it
//  - its OVAs, specials and trailers are extras, not shows: hidden while the series is in the list (search for one by name and it shows)
//  - an animated TVmaze listing of the same series (Bleach, Bleach: Thousand-Year Blood War) joins that series, whatever its year
//  - an anime film that is also listed as a film is one entry (the film); its franchise films come before unrelated films that only share the name, which are kept to two
//  - different shows that only share a name stay apart, and the year tells them apart
//  - best name matches first; loose, fuzzy matches only fill the list when there are few real ones
function mergeWatchResults(q, an, tv, fl) {
    const names = r => {
        const A =
            r.alt && typeof r.alt === "object" && !Array.isArray(r.alt) ? Object.values(r.alt) : [].concat(r.alt || []);
        return [r.title, r.en, r.romaji, r.native, ...A].filter(t => typeof t === "string" && t.trim());
    };
    const keys = r => names(r).map(idTitle).filter(Boolean);
    const same = (a, b) => {
        const ka = keys(a),
            kb = new Set(keys(b));
        if (!ka.some(k => kb.has(k))) return false;
        const ya = Number(a.year),
            yb = Number(b.year);
        return !ya || !yb || Math.abs(ya - yb) <= 1;
    };
    const merge = (into, r) => {
        into.ext = { ...(r.ext || {}), ...(into.ext || {}) };
        if (!into.cover && r.cover) into.cover = r.cover;
        if (!into.year && r.year) into.year = r.year;
    };
    const okFlag = r => ui.private || !r.flag;
    const nq = idTitle(q),
        words = nq.split(" ").filter(Boolean);
    // 1. anime: one entry per series. Its OVAs, specials and trailers are extras of it, not shows of their own
    const anime = [],
        extras = [],
        bySeries = new Map();
    for (const r of an.filter(r => r.medium === "anime" && okFlag(r))) {
        if (["OVA", "Special"].includes(r.kind)) {
            extras.push(r);
            continue;
        }
        if (!isSeasonish(r)) {
            anime.push(r);
            continue;
        }
        const s = seasonStem(r.title),
            first = bySeries.get(s);
        if (!first) {
            bySeries.set(s, r);
            anime.push(r);
        } else {
            const earlier = seasonSort(r, first) < 0,
                keep = earlier ? r : first,
                drop = earlier ? first : r;
            merge(keep, drop);
            if (earlier) {
                anime[anime.indexOf(first)] = r;
                bySeries.set(s, r);
            }
        }
    }
    // an extra is hidden when its series is in the list, unless you searched for the extra itself
    for (const x of extras) {
        const k = keys(x),
            stem = [...bySeries.keys()].find(s => s && k.some(t => t.startsWith(s + " ")));
        if (stem && !(nq.length > stem.length && k.some(t => t.includes(nq)))) continue;
        anime.push(x);
    }
    const out = [...anime];
    // 2. films, then the anime films that are the same film
    const films = [];
    for (const r of fl.filter(okFlag)) {
        const o = films.find(x => same(x, r));
        if (o) merge(o, r);
        else films.push(r);
    }
    for (const f of films) {
        const i = out.findIndex(a => a.kind === "Movie" && same(a, f));
        if (i >= 0) {
            merge(f, out[i]);
            out.splice(i, 1);
        }
    }
    // 3. TV: the same show as an anime entry adds what TVmaze knows to it (an animated listing of the same series counts, whatever its year: Bleach and Bleach: Thousand-Year Blood War); otherwise it is its own entry
    const animeish = r => /anim/i.test(r.kind || "") || (r.genres || []).some(g => /anime/i.test(g));
    for (const r of tv.filter(okFlag)) {
        const o = out.find(
            x =>
                x.medium === "anime" &&
                (same(x, r) ||
                    (isSeasonish(x) &&
                        seasonStem(x.title) === seasonStem(r.title) &&
                        (animeish(r) || !x.year || !r.year || Math.abs(x.year - r.year) <= 1)))
        );
        if (o) {
            merge(o, r);
            continue;
        }
        const t = out.find(x => x.medium === "tv" && same(x, r));
        if (t) {
            merge(t, r);
            continue;
        }
        out.push(r);
    }
    // films: when a series matched, its own movies come first, and unrelated films that merely share its name are kept to a few
    const penalty = new Map(),
        series = out.filter(r => r.medium !== "film");
    if (series.length) {
        const sk = new Set(series.flatMap(keys)),
            stems = [...new Set(series.map(r => seasonStem(r.title)).filter(Boolean))];
        const cls = f =>
            keys(f).some(k => sk.has(k))
                ? "same"
                : f.kind === "Anime film" ||
                    (/\b(movie|film)\b/.test(keys(f).join(" ")) &&
                        stems.some(s => keys(f).some(k => k.startsWith(s + " "))))
                  ? "franchise"
                  : "other";
        const left = { same: 2, other: 3, franchise: 6 };
        for (const f of [...films].sort((a, b) => !!b.cover - !!a.cover)) {
            const c = cls(f);
            if (left[c]-- <= 0) films.splice(films.indexOf(f), 1);
            else if (c !== "franchise") penalty.set(f, c === "same" ? 1.5 : 0.25);
        }
    }
    out.push(...films);
    // 4. best matches first
    const score = r =>
        Math.max(
            0,
            ...keys(r).map(k =>
                k === nq
                    ? 4
                    : k.startsWith(nq)
                      ? 3
                      : k.includes(nq)
                        ? 2
                        : words.length > 1 && words.every(w => (" " + k + " ").includes(" " + w + " "))
                          ? 1.5
                          : 0
            )
        ) - (penalty.get(r) || 0);
    const ranked = out.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => b.s - a.s || a.i - b.i);
    const strong = ranked.filter(x => x.s > 0);
    return (strong.length >= 3 ? strong : ranked).slice(0, 24).map(x => x.r);
}
// searching: as you type, without redrawing the page (so the box keeps your cursor)
async function watchSearch(q) {
    W.q = q;
    W.err = "";
    W.view = "home";
    SG.ri = 0;
    if (!q.trim()) {
        W.results = null;
        W.busy = false;
        stageRefresh();
        return;
    }
    W.busy = true;
    stageRefresh();
    const cat = SG.cat.watch,
        my = ++SG.t;
    const [tv, an, fl] = await Promise.all([
        cat === "all" || cat === "tv" ? tvmazeSearch(q).catch(() => []) : [],
        cat === "all" || cat === "anime" ? alSearch(q, "anime").catch(() => []) : [],
        cat === "all" || cat === "film"
            ? (TMDB_ON() ? tmdbSearch(q, "film") : filmSearchKeyless(q)).catch(() => [])
            : [],
    ]);
    if (my !== SG.t) return;
    W.results = mergeWatchResults(q, an, tv, fl); // the catalogues only: your library has no say in what a search finds
    W.busy = false;
    if (!W.results.length && !navigator.onLine) W.err = "Search needs the internet.";
    stageRefresh();
}
async function readSearch(q) {
    SG.rq = q;
    SG.ri = 0;
    RD.item = null;
    if (!q.trim()) {
        SG.rres = null;
        SG.rbusy = false;
        stageRefresh();
        return;
    }
    SG.rbusy = true;
    stageRefresh();
    const cat = SG.cat.read,
        my = ++SG.t;
    const local = all()
        .filter(
            b =>
                readable(b) &&
                (cat === "all" || b.medium === cat) &&
                norm(titleOf(b) + " " + b.title + " " + (b.creator || "")).includes(norm(q))
        )
        .slice(0, 12)
        .map(b => ({ ...b }));
    const web =
        cat === "book" || cat === "comic"
            ? await olSearch(q, 8).catch(() => [])
            : await alSearch(q, "manga").catch(() => []);
    if (my !== SG.t) return;
    const seen = new Set(local.map(b => idTitle(b.title)));
    SG.rres = [
        ...local,
        ...web.filter(
            r =>
                (cat === "all" || r.medium === cat || (cat === "manga" && r.medium === "manga")) &&
                (ui.private || !r.flag) &&
                !seen.has(idTitle(r.title))
        ),
    ];
    SG.rbusy = false;
    stageRefresh();
}
function stageRefresh() {
    const box = $("#sres"),
        kind = ui.page === "read" ? "read" : "watch";
    if (!box || (kind === "watch" && W.view === "show")) return renderMain();
    box.innerHTML = stageResHTML(kind);
    const sc = $(".stcont");
    if (sc) sc.hidden = !!(kind === "watch" ? W.q : SG.rq);
    const x = $(".sqx");
    const q = kind === "watch" ? W.q : SG.rq;
    if (!x && q) {
        const s = $(".sq");
        if (s)
            s.insertAdjacentHTML(
                "beforeend",
                `<button class="sqx" data-act="stage-clear" aria-label="Clear">${ICON.x}</button>`
            );
    } else if (x && !q) x.remove();
}
document.addEventListener("input", e => {
    const id = e.target.id;
    if (id !== "wq" && id !== "rq") return;
    clearTimeout(SG.timer);
    const q = e.target.value;
    if (id === "wq") {
        W.q = q;
        if (W.view === "show") {
            W.view = "home";
            W.show = null;
            renderMain();
            const i = $("#wq");
            if (i) {
                i.focus();
                i.setSelectionRange(q.length, q.length);
            }
        }
    } else SG.rq = q;
    SG.timer = setTimeout(() => (id === "wq" ? watchSearch(q) : readSearch(q)), q.length < 2 ? 0 : 320);
});
document.addEventListener(
    "keydown",
    e => {
        const id = e.target.id;
        if (id !== "wq" && id !== "rq") return;
        const R = (id === "wq" ? W.results : SG.rres) || [];
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!R.length) return;
            SG.ri = Math.max(0, Math.min(R.length - 1, SG.ri + (e.key === "ArrowDown" ? 1 : -1)));
            stageRefresh();
            const on = $("#sres .on");
            on && on.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopImmediatePropagation();
            clearTimeout(SG.timer);
            if (R.length) stagePick(id === "wq" ? "watch" : "read", SG.ri);
            else (id === "wq" ? watchSearch : readSearch)(e.target.value);
        }
        // Escape clears the search and puts the page back as it was (covers or list, whatever was open); a second Escape just leaves the box
        else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (e.target.value) {
                e.target.value = "";
                SG.ri = 0;
                id === "wq" ? watchSearch("") : readSearch("");
            } else e.target.blur();
        }
    },
    true
);
function stagePick(kind, i) {
    if (kind === "watch") {
        const r = (W.results || [])[i];
        if (r) watchOpen(r.id && items.has(r.id) ? { id: r.id, ...items.get(r.id) } : r, { play: true });
        return;
    }
    const r = (SG.rres || [])[i];
    if (!r) return;
    let id = r.id && items.has(r.id) ? r.id : findExisting(r.title, r.creator || "", r.medium, r.ext);
    if (!id) {
        id = addItem(
            { ...r, status: "want", copy: "none", rating: 0, source: r.src || "you", src: undefined, recs: undefined },
            "Add " + r.title
        );
        toast(`Added ${r.title} to your library`, { label: "Undo", fn: undo });
    }
    SG.rq = "";
    SG.rres = null;
    readFromItem(id);
}
function stageClick(act, t, k) {
    const kind = ui.page === "read" ? "read" : "watch";
    if (act === "stage-pick") {
        stagePick(kind, Number(k));
        return true;
    }
    if (act === "stage-cat") {
        SG.cat[kind] = k;
        const q = kind === "watch" ? W.q : SG.rq;
        renderMain();
        if (q) (kind === "watch" ? watchSearch : readSearch)(q);
        return true;
    }
    if (act === "stage-clear") {
        if (kind === "watch") {
            W.q = "";
            W.results = null;
        } else {
            SG.rq = "";
            SG.rres = null;
        }
        renderMain();
        const i = $(kind === "watch" ? "#wq" : "#rq");
        i && i.focus();
        return true;
    }
    if (act === "wp-seasons") {
        seasonsAcrossLibrary(k === "together");
        return true;
    }
    if (act === "wp-opts") {
        ui.wpOpts = !ui.wpOpts;
        cinSideRedraw();
        return true;
    }
    if (act === "wp-place") {
        const p = WP(),
            v = t.dataset.v;
        if (k === "about") p.about = v !== "off";
        p.place = { ...p.place, [k]: v === "off" && k === "about" ? p.place.about : v };
        if (v === "off" && k !== "about") p.place[k] = "off";
        wpSave(p);
        cinSideRedraw();
        return true;
    }
    if (act === "wp-tool") {
        const p = WP(),
            i = p.tools.indexOf(k),
            j = i + Number(t.dataset.d);
        if (i < 0 || j < 0 || j >= p.tools.length) return true;
        [p.tools[i], p.tools[j]] = [p.tools[j], p.tools[i]];
        wpSave(p);
        wpBarRedraw();
        return true;
    }
    if (act === "wp-reset") {
        meta.settings.watchPage = {};
        markDirty();
        if (W.player) {
            const v = $("#cinema video");
            if (v) W.player.keepAt = v.currentTime;
            renderPlayer();
        }
        return true;
    }
    if (act === "wp-spot") {
        const p = WP();
        p.spot = { ...(p.spot || {}) };
        p.off = p.off.filter(x => x !== k);
        if (t.dataset.v === "off") p.off.push(k);
        else p.spot[k] = t.dataset.v;
        wpSave(p);
        wpBarRedraw();
        cinSideRedraw();
        return true;
    }
    if (act === "wp-edit") {
        ui.wpEdit = !ui.wpEdit;
        ui.wpOpts = false;
        if (W.player) W.player.opts = false;
        wpBarRedraw();
        return true;
    }
    if (act === "wp-look-reset") {
        const p = WP();
        delete p.look;
        wpSave(p);
        wpBarRedraw();
        return true;
    }
    if (act === "wp-eps") {
        wpSave({ ...WP(), eps: k });
        cinSideRedraw();
        return true;
    }
    if (act === "wp-move") {
        const p = WP(),
            i = p.order.indexOf(k),
            j = i + Number(t.dataset.d);
        if (i < 0 || j < 0 || j >= p.order.length) return true;
        [p.order[i], p.order[j]] = [p.order[j], p.order[i]];
        wpSave(p);
        cinSideRedraw();
        return true;
    }
    if (act === "stage-switch") {
        if (k === "read") {
            ui.page = "read";
            RD.item = null;
        } else ui.page = "watch";
        meta.settings.stageLast = k;
        render();
        scrollTo(0, 0);
        return true;
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.cinseason && W.player) {
        const i = +t.value;
        W.player.listSi = i;
        cinSideRedraw();
        loadWatchSeason(i);
    }
    if (t.dataset.wp) {
        wpSave({ ...WP(), [t.dataset.wp]: t.checked });
        cinSideRedraw();
    }
    if (t.dataset.wptool) {
        const p = WP(),
            k = t.dataset.wptool;
        p.off = t.checked ? p.off.filter(x => x !== k) : [...new Set([...p.off, k])];
        wpSave(p);
        wpBarRedraw();
    }
    if (t.dataset.stagecat) {
        const kind = t.dataset.stagecat,
            q = kind === "watch" ? W.q : SG.rq;
        SG.cat[kind] = t.value;
        renderMain();
        if (q) (kind === "watch" ? watchSearch : readSearch)(q);
        return;
    }
    if (t.dataset.stagetheme != null) {
        meta.settings.stageTheme = t.value;
        markDirty();
        stageThemeApply(true);
        cinSideRedraw();
        if (ui.page === "settings") renderMain();
    }
    if (t.dataset.seasonsmode) {
        meta.settings.seasonsMode = t.value;
        meta.watchSplit = [];
        markDirty();
        if (W.show && ui.page === "watch") {
            const m = (W.seasons[W.si] && W.seasons[W.si].member) || W.show.id;
            if (m && items.has(m)) watchOpen({ id: m, ...items.get(m) });
            else renderMain();
        } else renderMain();
    }
});
// Watch & Read can wear their own theme (Settings › Appearance, or ⋯ on a player page)
let stageThemeOn = null;
const stageLook = () =>
    meta.settings.stageTheme == null || meta.settings.stageTheme === "" ? "black" : meta.settings.stageTheme;
const STAGE_BLACK = () => ({
    ...resolveTheme("galaxy"),
    name: "Black",
    backdrop: "none",
    bg: "#000000",
    panel: "#0d0d0f",
    text: "#ededef",
    muted: "#8a8a90",
    accent: "#f2f2f4",
    hi: "#ffffff",
    bgStyle: "plain",
    bgAmt: 0,
});
const STAGE_LOOKS = () => [
    ["black", "Black, no theme"],
    ["mode", "Same as the mode I came from"],
    ...themeList().map(([k]) => [k, resolveTheme(k).name]),
];
function stageThemeApply(force) {
    // Settings opened from Watch or Read keeps their look too (it is still that space, just its settings)
    const on =
            ui.page === "watch" ||
            ui.page === "read" ||
            (ui.page === "settings" && /^(watch|read)$/.test((ui.settingsFrom || {}).page || "")),
        L = stageLook(),
        want = !on || L === "mode" ? null : L === "black" ? "black" : meta.themes[L] || THEME_PRESETS[L] ? L : "black";
    if (!force && want === stageThemeOn) return;
    stageThemeOn = want;
    applyTheme(want === "black" ? STAGE_BLACK() : want ? resolveTheme(want) : undefined);
}
// a file, link or server match arriving while the player page waits for one: start it
function cinRefreshIfEmpty() {
    const p = W.player;
    if (p && !p.loading && !p.srcs.length && ui.page === "watch") watchStart(p.si, p.e ?? 1, { empty: true });
}
// every anime with sequels in your library, combined into one entry each (or all split apart again)
function seasonsAcrossLibrary(together) {
    if (!together) {
        const P = all().filter(b => partsOf(b).length && b.medium === "anime");
        if (!P.length) {
            toast("Nothing combined to split.");
            return;
        }
        const ids = P.flatMap(b => [b.id, ...partsOf(b)]);
        change(`Split ${plural(P.length, "show")} into seasons`, ids, x => ({
            ...x,
            parts: undefined,
            partOf: undefined,
        }));
        toast(`Split ${plural(P.length, "show")} back into seasons`, { label: "Undo", fn: undo });
        renderMain();
        return;
    }
    const groups = seasonGroups(all().map(b => b.id));
    if (!groups.length) {
        toast("No sequels to combine: the links come from AniList, so refresh details first if some are missing.");
        return;
    }
    combineGroups(groups, `Combine ${plural(groups.length, "show")}`);
    toast(`Combined the seasons of ${plural(groups.length, "show")}. Each keeps its own score.`, {
        label: "Undo",
        fn: undo,
    });
    renderMain();
}
document.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset && t.dataset.stagecovers) {
        meta.settings.stageCovers = t.checked;
        markDirty();
        renderMain();
    }
});
document.addEventListener(
    "toggle",
    e => {
        const d = e.target;
        if (d.dataset && d.dataset.stagecont) {
            meta.settings.stageCont = d.open;
            markDirty();
        }
    },
    true
);
// the switch in the top bar, only on these pages
const stageSwitchHTML = () =>
    ui.page === "watch" || ui.page === "read"
        ? `<div class="seg stageseg" role="group" aria-label="Watch or read">${[
              ["watch", "Watch"],
              ["read", "Read"],
          ]
              .map(
                  ([k, l]) =>
                      `<button data-act="stage-switch" data-k="${k}" aria-pressed="${ui.page === k}">${l}</button>`
              )
              .join("")}</div>`
        : "";
// the toolbar changes without restarting the video: redraw the player around the same playback position
function wpBarRedraw() {
    if (!W.player) return;
    const v = $("#cinema video");
    if (v) {
        W.player.keepAt = curAt();
    }
    renderPlayer();
}
