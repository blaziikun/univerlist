// src/features/insights/mode-pages.js
// ─────────────────────────────────────────────────────────────────
//  What each mode is for: the season's anime, series and quotes, a watch diary, now playing, discover
// ─────────────────────────────────────────────────────────────────

// ── Culture: this season's anime (AniList), kept for six hours so it isn't fetched again and again ──
const seasonState = { key: "", list: null, busy: false, err: "" };
const SEASON_NAME = { WINTER: "Winter", SPRING: "Spring", SUMMER: "Summer", FALL: "Autumn" };
function seasonKey() {
    const s = ui.season || seasonNow();
    return s.season + "-" + s.year;
}
async function loadSeason(force) {
    const s = ui.season || seasonNow(),
        key = s.season + "-" + s.year;
    if (!force && seasonState.key === key && seasonState.list) return;
    try {
        const c = JSON.parse(sessionStorage.getItem("ul-season-" + key) || "null");
        if (!force && c && Date.now() - c.at < 6 * 3600e3) {
            Object.assign(seasonState, { key, list: c.list, err: "" });
            return;
        }
    } catch (_) {}
    if (!navigator.onLine) {
        seasonState.err = "You're offline.";
        return;
    }
    Object.assign(seasonState, { key, busy: true, err: "" });
    renderMainSoft();
    try {
        const list = await alSeason(s.season, s.year);
        Object.assign(seasonState, { list, busy: false });
        try {
            sessionStorage.setItem("ul-season-" + key, JSON.stringify({ at: Date.now(), list }));
        } catch (_) {}
    } catch (e) {
        Object.assign(seasonState, {
            busy: false,
            err: e.offline ? "Couldn't reach AniList." : "AniList didn't answer. Try again in a minute.",
        });
    }
    renderMainSoft();
}
function renderMainSoft() {
    if (ui.page === "profile" && !mainTyping()) renderMain();
}
function seasonCard(r, byAl) {
    const id = byAl.get(r.ext.anilist),
        mine = id && items.get(id);
    return `<div class="scard">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="nocov">${esc(r.title)}</span>`}
    <div class="sb"><span class="t">${esc(r.title)}</span><span class="hint">${esc([r.creator, r.kind, r.total ? r.total + " eps" : ""].filter(Boolean).join(" · "))}</span>
      <span class="chips">${(r.genres || [])
          .slice(0, 3)
          .map(g => `<span class="chip ghostchip">${esc(g)}</span>`)
          .join("")}</span>
      <span class="sfoot">${r.airing ? `<span class="hint">Ep ${r.airing.ep} in ${esc(until(r.airing.at))}</span>` : `<span class="hint">${esc(r.airStatus === "NOT_YET_RELEASED" ? "Not out yet" : r.airStatus === "FINISHED" ? "Finished" : "Airing")}</span>`}${r.scores.anilist ? `<span class="crowd">${r.scores.anilist}</span>` : ""}
        ${mine ? `<button class="pill ${mine.status}" data-act="open" data-id="${esc(id)}">${esc(statusWord(mine.status, "anime"))}</button>` : `<button class="btn sm" data-act="seasonal-add" data-k="${r.ext.anilist}">+ Plan</button>`}</span></div></div>`;
}
function seasonalHTML() {
    const s = ui.season || seasonNow();
    if (seasonState.key !== seasonKey() || (!seasonState.list && !seasonState.busy && !seasonState.err))
        setTimeout(() => loadSeason(), 0);
    const byAl = new Map();
    for (const [id, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, id);
    const L = (seasonState.list || []).filter(r =>
        ui.seasonOnly === "mine" ? byAl.has(r.ext.anilist) : ui.seasonOnly === "new" ? !byAl.has(r.ext.anilist) : true
    );
    const groups = [
        ["TV", L.filter(r => r.kind === "TV")],
        ["Films", L.filter(r => r.kind === "Movie")],
        ["Shorts, OVAs and ONAs", L.filter(r => !["TV", "Movie"].includes(r.kind))],
    ].filter(g => g[1].length);
    return `<div class="ph"><div class="ttl"><h2 class="ltitle">${SEASON_NAME[s.season]} ${s.year}</h2><p>Anime airing this season, most popular first, from AniList.</p></div><span class="spacer"></span>
      <button class="btn sm ghost" data-act="season-step" data-k="-1">← Earlier</button><button class="btn sm ghost" data-act="season-step" data-k="0">Now</button><button class="btn sm ghost" data-act="season-step" data-k="1">Later →</button>
      <div class="seg">${[
          ["", "Everything"],
          ["new", "Not in my list"],
          ["mine", "In my list"],
      ]
          .map(
              ([k, l]) =>
                  `<button data-act="season-only" data-k="${k}" aria-pressed="${(ui.seasonOnly || "") === k}">${l}</button>`
          )
          .join("")}</div><button class="btn sm ghost" data-act="season-refresh" title="Fetch again">↻</button></div>
    ${seasonState.busy ? `<p class="think">Reading the season from AniList…</p>` : seasonState.err ? `<p class="err">${esc(seasonState.err)}</p>` : ""}
    ${groups.map(([n, list]) => `<section class="group"><div class="plaque"><h3>${esc(n)}</h3><span class="n">${list.length}</span></div><div class="schart">${list.map(r => seasonCard(r, byAl)).join("")}</div></section>`).join("")}`;
}
function seasonalMini() {
    if (seasonState.key !== seasonKey() || (!seasonState.list && !seasonState.busy && !seasonState.err))
        setTimeout(() => loadSeason(), 0);
    const byAl = new Map();
    for (const [id, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, id);
    const L = (seasonState.list || []).filter(r => r.kind === "TV").slice(0, 12);
    return seasonState.busy && !L.length
        ? `<p class="think">Reading this season…</p>`
        : L.length
          ? `<div class="strip">${L.map(r => {
                const id = byAl.get(r.ext.anilist);
                return `<div class="smini">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="t">${esc(r.title)}</span>${id ? `<span class="pill ${items.get(id).status}">${esc(statusWord(items.get(id).status, "anime"))}</span>` : `<button class="btn sm" data-act="seasonal-add" data-k="${r.ext.anilist}">+ Plan</button>`}</div>`;
            }).join("")}</div><button class="linkbtn" data-act="tab" data-k="seasonal">The whole season</button>`
          : `<p class="hint">${esc(seasonState.err || "Nothing yet.")}</p>`;
}

// ── Literature: series, kept as separate books but shown together ──
const SERIES_RE = /\(([^()#]+?),?\s*#\s*(\d+(?:\.\d+)?)\)\s*$/;
function seriesOf(b) {
    if (b.series) return [b.series, b.seriesNo || null];
    const m = SERIES_RE.exec(b.title || "");
    return m ? [m[1].trim(), parseFloat(m[2])] : null;
}
function seriesGroups(M) {
    const G = new Map();
    for (const b of M) {
        const s = seriesOf(b);
        if (!s) continue;
        const k = norm(s[0]);
        if (!G.has(k)) G.set(k, { name: s[0], items: [] });
        G.get(k).items.push({ b, n: s[1] });
    }
    // sequels and prequels you linked count too, for things without a series name
    const parent = new Map(),
        find = x => {
            while (parent.get(x) !== x) x = parent.get(x);
            return x;
        };
    const loose = M.filter(b => !seriesOf(b) && ["book", "novel", "comic"].includes(b.medium));
    for (const b of loose) parent.set(b.id, b.id);
    for (const b of loose)
        for (const l of b.links || [])
            if (["sequel", "prequel"].includes(l.type) && parent.has(l.id)) parent.set(find(b.id), find(l.id));
    const LG = new Map();
    for (const b of loose) {
        const r = find(b.id);
        if (!LG.has(r)) LG.set(r, []);
        LG.get(r).push(b);
    }
    for (const [, arr] of LG)
        if (arr.length > 1) {
            arr.sort((a, b) => (a.year || 9999) - (b.year || 9999));
            G.set("l:" + arr[0].id, { name: cleanTitle(titleOf(arr[0])), items: arr.map((b, i) => ({ b, n: i + 1 })) });
        }
    return [...G.values()]
        .filter(g => g.items.length > 1 || g.items.some(x => x.b.series))
        .map(g => {
            g.items.sort((x, y) => (x.n ?? 999) - (y.n ?? 999) || (x.b.year || 0) - (y.b.year || 0));
            g.done = g.items.filter(x => x.b.status === "done").length;
            g.next = g.items.find(x => x.b.status !== "done");
            return g;
        })
        .sort(
            (a, b) =>
                (b.done && b.next ? 1 : 0) - (a.done && a.next ? 1 : 0) ||
                b.items.length - a.items.length ||
                a.name.localeCompare(b.name)
        );
}
function seriesHTML() {
    const G = seriesGroups(modeItems());
    return `<div class="ph"><div class="ttl"><p>Trilogies and long series stay separate books, shown together in order. Set a book's series in Edit details, or link sequels in Connections; "(Series, #2)" in a title is picked up too.</p></div></div>
    ${
        G.length
            ? G.map(
                  g => `<section class="panel series"><h3>${esc(g.name)} <span class="r hint">${g.done} of ${g.items.length} ${esc(STATUS_WORDS[groupWord()].done.toLowerCase())}</span></h3>
      <div class="prog"><span style="width:${Math.round((g.done / g.items.length) * 100)}%"></span></div>
      <div class="sstack">${g.items.map(({ b, n }) => `<button class="sitem${b.status === "done" ? " done" : g.next && g.next.b.id === b.id ? " next" : ""}" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}<span class="hint">${n != null ? "#" + n : b.year || ""}</span></button>`).join("")}</div>
      ${g.next ? `<p class="hint">Next: <button class="linkbtn" data-act="open" data-id="${esc(g.next.b.id)}">${esc(cleanTitle(titleOf(g.next.b)))}</button></p>` : `<p class="hint">All done.</p>`}</section>`
              ).join("")
            : `<div class="empty"><h3>No series yet</h3><p>Give two or more books the same Series name in Edit details.</p></div>`
    }`;
}
function seriesMini(M) {
    const G = seriesGroups(M)
        .filter(g => g.next)
        .slice(0, 4);
    return G.length
        ? G.map(
              g =>
                  `<div class="serrow"><b>${esc(g.name)}</b><span class="hint">${g.done}/${g.items.length}</span><div class="sstack mini">${g.items
                      .slice(0, 8)
                      .map(
                          ({ b }) =>
                              `<button class="sitem${b.status === "done" ? " done" : ""}" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}</button>`
                      )
                      .join("")}</div></div>`
          ).join("")
        : `<p class="hint">Series you're partway through show here.</p>`;
}
function quotesHTML() {
    const q = norm(ui.quoteQ || ""),
        Q = modeItems()
            .flatMap(b => (b.quotes || []).map(x => ({ x, b })))
            .filter(({ x, b }) => !q || norm(x.text + " " + titleOf(b)).includes(q))
            .sort((a, b) => String(b.x.date).localeCompare(String(a.x.date)));
    return `<div class="ph"><div class="ttl"><p>Every line you saved, newest first. Add quotes from a card's ${esc("Journal")} tab.</p></div><span class="spacer"></span><input class="inp" id="quote-q" placeholder="Search quotes" value="${esc(ui.quoteQ || "")}" style="max-width:220px"></div>
    ${Q.length ? `<div class="qwall">${Q.map(({ x, b }) => `<figure class="qcard"><blockquote>${esc(x.text)}</blockquote><figcaption><button class="linkbtn" data-act="open" data-id="${esc(b.id)}">${esc(cleanTitle(titleOf(b)))}</button>${x.page ? " · " + esc(unitOf(b)[2]) + " " + esc(x.page) : ""}</figcaption></figure>`).join("")}</div>` : `<div class="empty"><h3>No quotes yet</h3><p>Open a book and save a line in its Journal tab.</p></div>`}`;
}

// ── Film & TV: a diary of every watch, like a ticket stub drawer ──
function diaryEvents(M) {
    const ev = [];
    for (const b of M) {
        if (MEDIA[b.medium].group !== "watch") continue;
        if (b.medium === "film") {
            const L = (b.log || []).filter(s => s.from === 0);
            L.forEach((s, i) => ev.push({ date: s.date, b, re: i > 0 }));
            if (!L.length && b.finishedAt) ev.push({ date: b.finishedAt, b, re: false });
        } else {
            for (const r of b.reads || []) if (r.finishedAt) ev.push({ date: r.finishedAt, b, re: false, show: true });
            if (b.status === "done" && b.finishedAt)
                ev.push({ date: b.finishedAt, b, re: (b.reads || []).length > 0, show: true });
        }
    }
    return ev.filter(e => e.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function diaryHTML() {
    const E = diaryEvents(modeItems()),
        byM = new Map();
    for (const e of E) {
        const k = String(e.date).slice(0, 7);
        if (!byM.has(k)) byM.set(k, []);
        byM.get(k).push(e);
    }
    return `<div class="ph"><div class="ttl"><p>Every film you watched and every show you finished, by date, with rewatches marked. Log a watch from a card, or "Mark watched today".</p></div></div>
    ${
        E.length
            ? [...byM.entries()]
                  .map(
                      ([
                          k,
                          es,
                      ]) => `<section class="diarymonth"><h3 class="dm">${esc(new Date(k + "-15").toLocaleDateString("en-GB", { month: "long", year: "numeric" }))} <span class="hint">${es.length}</span></h3>
      <div class="drows">${es.map(e => `<button class="drow2" data-act="open" data-id="${esc(e.b.id)}"><span class="dd">${new Date(e.date).getDate()}</span>${coverHTML(e.b)}<span class="dt"><b>${esc(titleOf(e.b))}</b><small>${esc([e.b.year, e.show ? MEDIA[e.b.medium].one : e.b.creator].filter(Boolean).join(" · "))}</small></span><span class="dr">${e.b.rating ? esc(fmtScore(e.b.rating, scaleOf(e.b))) : ""}</span><span class="dx">${e.re ? "↻" : ""}${e.b.fav ? " ♥" : ""}</span></button>`).join("")}</div></section>`
                  )
                  .join("")
            : `<div class="empty"><h3>No diary yet</h3><p>Films you mark as watched and shows you finish appear here by date.</p></div>`
    }`;
}
function diaryMini(M) {
    const E = diaryEvents(M).slice(0, 7);
    return E.length
        ? `<div class="drows small">${E.map(e => `<button class="drow2" data-act="open" data-id="${esc(e.b.id)}"><span class="dd">${esc(new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}</span><span class="dt"><b>${esc(titleOf(e.b))}</b></span><span class="dr">${e.b.rating ? esc(fmtScore(e.b.rating, scaleOf(e.b))) : ""}</span><span class="dx">${e.re ? "↻" : ""}</span></button>`).join("")}</div><button class="linkbtn" data-act="tab" data-k="diary">The whole diary</button>`
        : `<p class="hint">Watches show here by date.</p>`;
}

// ── Games: now playing, the backlog in hours, platforms ──
const COMP = { story: "Main story", extras: "Story + extras", full: "100%", endless: "Endless" };
function gameCard(b) {
    const c = gameCase(b);
    return `<div class="gcard"><button class="gc" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}</button><div class="gb"><button class="t" data-act="open" data-id="${esc(b.id)}">${esc(titleOf(b))}</button>
    <span class="hint">${esc([b.platform || c[3], b.completion ? COMP[b.completion] : ""].filter(Boolean).join(" · "))}</span>
    <div class="pg"><span>${b.prog || 0} h played</span>${b.total ? `<span>~${b.total} h to beat</span>` : ""}</div>${b.total ? `<div class="prog"><span style="width:${Math.min(100, Math.round(((b.prog || 0) / b.total) * 100))}%"></span></div>` : ""}
    <div class="bar"><button class="btn sm" data-act="log-add" data-id="${esc(b.id)}" data-k="1">+1 h</button><button class="btn sm" data-act="log-add" data-id="${esc(b.id)}" data-k="2">+2 h</button><button class="btn sm ghost" data-act="finish" data-id="${esc(b.id)}">Beaten</button></div></div></div>`;
}
function playingHTML() {
    const M = modeItems(),
        now = activeOf(M),
        back = M.filter(b => b.status === "want"),
        hrs = back.reduce((a, b) => a + (b.total || 0), 0),
        plat = {};
    for (const b of M) {
        const p = b.platform || (b.platforms || [])[0];
        if (p) plat[p] = (plat[p] || 0) + 1;
    }
    const quick = back
        .filter(b => b.total && b.total <= 12)
        .sort((a, b) => a.total - b.total)
        .slice(0, 10);
    return `<div class="ph"><div class="ttl"><p>What you're playing, how long the backlog really is, and what you play on.</p></div></div>
    <section class="group"><div class="plaque"><h3>Now playing</h3><span class="n">${now.length}</span></div>${now.length ? `<div class="gcards">${now.map(gameCard).join("")}</div>` : `<p class="hint">Start something from the library.</p>`}</section>
    <div class="dash"><section class="panel span4"><h3>Backlog</h3><div class="tiles"><div class="tile"><div class="v">${back.length}</div><div class="k">Planned</div></div><div class="tile"><div class="v">${hrs ? "~" + hrs : "–"}</div><div class="k">Hours to beat them all</div></div></div></section>
      <section class="panel span4"><h3>Short ones (12 h or less)</h3>${quick.length ? `<div class="mini">${quick.map(b => `<button data-act="open" data-id="${esc(b.id)}"><span class="t">${esc(titleOf(b))}</span><span class="hint">~${b.total} h</span></button>`).join("")}</div>` : `<p class="hint">Time-to-beat fills in with a RAWG key, or set it in Edit details.</p>`}</section>
      <section class="panel span4"><h3>Platforms</h3>${
          Object.keys(plat).length
              ? hbars(
                    Object.entries(plat)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([p, n]) => [esc(p), n])
                )
              : `<p class="hint">Choose a platform on a game's card.</p>`
      }</section></div>`;
}
function playingMini(M) {
    const now = activeOf(M).slice(0, 3);
    return now.length
        ? `<div class="gcards">${now.map(gameCard).join("")}</div>`
        : `<p class="hint">Nothing in progress. <button class="linkbtn" data-act="lib-status" data-k="want">Pick from the backlog</button></p>`;
}

// ── Insights (the "discover" tab): a reading of your own library, plus the bigger searches for new things ──
// ── Insights: what your own library says about you, then where to look further ──
// how often you finish what you start, by genre, theme and type: started = finished + dropped + on hold + in progress
function finishRates(L, key, min = 3) {
    const t = new Map();
    for (const b of L) {
        if (!["done", "dnf", "paused", "active", "redo"].includes(b.status)) continue;
        for (const k of [].concat(key(b) || [])) {
            if (!k) continue;
            const r = t.get(k) || { k, n: 0, done: 0, drop: 0, sum: 0, sc: 0 };
            r.n++;
            if (b.status === "done" || b.status === "redo") r.done++;
            if (b.status === "dnf") r.drop++;
            if (b.rating) {
                r.sum += b.rating;
                r.sc++;
            }
            t.set(k, r);
        }
    }
    return [...t.values()]
        .filter(r => r.n >= min)
        .map(r => ({ ...r, pct: Math.round((r.done / r.n) * 100), avg: r.sc ? r.sum / r.sc : 0 }));
}
function rateBars(rows, mean) {
    return `<div class="ratebars">${rows.map(r => `<div class="rb"><span class="l">${esc(r.k)}</span><span class="b"><span style="width:${r.pct}%"></span>${mean ? `<i style="left:${mean}%" title="Your overall rate: ${mean}%"></i>` : ""}</span><span class="v">${r.pct}%</span><span class="hint">${r.done}/${r.n}${r.drop ? ` · ${r.drop} dropped` : ""}${r.avg ? ` · avg ${esc(fmtScore(Math.round(r.avg * 10) / 10))}` : ""}</span></div>`).join("")}</div>`;
}
function insightsHTML() {
    const L = modeItems(),
        N = nextUp(L, 8),
        mode = curMode();
    const started = L.filter(b => ["done", "dnf", "paused", "active", "redo"].includes(b.status)),
        done = started.filter(b => ["done", "redo"].includes(b.status));
    const mean = started.length ? Math.round((done.length / started.length) * 100) : 0;
    const byG = finishRates(L, b => b.genres)
        .sort((a, b) => b.n - a.n)
        .slice(0, 14)
        .sort((a, b) => b.pct - a.pct);
    const byT = finishRates(L, b => b.themes, 4)
        .sort((a, b) => b.n - a.n)
        .slice(0, 14)
        .sort((a, b) => b.pct - a.pct);
    const byK = finishRates(L, b => kindShown(b), 2).sort((a, b) => b.pct - a.pct);
    const drops = finishRates(L, b => b.genres)
        .filter(r => r.drop)
        .sort((a, b) => b.drop / b.n - a.drop / a.n)
        .slice(0, 5);
    // how long things take you, start to finish
    const days = b =>
        b.startedAt && b.finishedAt ? Math.max(0, (Date.parse(b.finishedAt) - Date.parse(b.startedAt)) / 864e5) : null;
    const tk = new Map();
    for (const b of done) {
        const d = days(b);
        if (d == null) continue;
        const k = kindShown(b);
        (tk.get(k) || tk.set(k, []).get(k)).push(d);
    }
    const med = a => {
        const s = a.slice().sort((x, y) => x - y);
        return s[Math.floor(s.length / 2)];
    };
    const take = [...tk.entries()]
        .filter(([, a]) => a.length >= 2)
        .map(([k, a]) => [k, Math.round(med(a))])
        .sort((a, b) => b[1] - a[1]);
    // the oldest of what you said you'd get to
    const old = L.filter(b => b.status === "want" && b.addedAt)
        .sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)))
        .slice(0, 6);
    const has = p => (mode.match || []).some(x => x === "*" || x.replace("!", "").startsWith(p));
    const engines = [
        [
            "versions",
            "Other versions",
            "Sequels, adaptations and spin-offs of what you loved (AniList, Wikidata)",
            true,
        ],
        [
            "fans",
            "Fans also liked",
            "What AniList users recommend after your favourite anime and manga",
            has("anime") || has("manga"),
        ],
        [
            "screen",
            "Film & TV",
            "TMDB recommendations from your best films and shows (free key)",
            has("film") || has("tv"),
        ],
        ["games", "Games", "Games tagged with what you score highest (free RAWG key)", has("game")],
        [
            "books",
            "Books from forums",
            "Books Reddit, Hacker News and Stack Exchange recommend alongside yours",
            has("book"),
        ],
    ].filter(e => e[3]);
    if (!started.length)
        return `<div class="empty"><h3>Nothing to read yet</h3><p>Start or finish a few things and this fills in: how often you finish what you start, by genre, theme and type, and how long things take you.</p></div>
    <section class="panel"><h3>Look further</h3>${engines.map(([k, l, d]) => `<button class="engine" data-act="disc-open" data-k="${k}"><b>${esc(l)}</b><small>${esc(d)}</small></button>`).join("")}</section>`;
    return `<div class="ph"><div class="ttl"><p>What your own library says: how often you finish what you start, where you drop off, and how long things take you. Then where to look further.</p></div></div>
    <div class="ihero"><div><b>${mean}%</b><span>of what you start, you finish</span></div><div><b>${done.length}</b><span>finished</span></div><div><b>${started.filter(b => b.status === "dnf").length}</b><span>dropped</span></div><div><b>${L.filter(b => b.status === "want").length}</b><span>waiting</span></div></div>
    <div class="dash">${tasteReadHTML()}
      ${byG.length ? `<section class="panel span6"><h3>Finished, by genre</h3><p class="hint">The line is your overall rate.</p>${rateBars(byG, mean)}</section>` : ""}
      ${byT.length ? `<section class="panel span6"><h3>Finished, by theme</h3><p class="hint">Themes from AniList, TMDB and IGDB.</p>${rateBars(byT, mean)}</section>` : ""}
      ${byK.length > 1 ? `<section class="panel span6"><h3>Finished, by type</h3>${rateBars(byK, mean)}</section>` : ""}
      ${
          drops.length
              ? `<section class="panel span6"><h3>Where you drop off</h3>${hbars(
                    drops.map(r => [esc(r.k), Math.round((r.drop / r.n) * 100)]),
                    v => v + "%"
                )}</section>`
              : ""
      }
      ${
          take.length
              ? `<section class="panel span6"><h3>How long things take you</h3><p class="hint">Middle time from starting to finishing.</p>${hbars(
                    take.map(([k, d]) => [esc(k), d]),
                    v => (v === 1 ? "1 day" : v + " days")
                )}</section>`
              : ""
      }
      ${old.length ? `<section class="panel span6"><h3>Waiting longest</h3><div class="mini">${old.map(b => `<button data-act="open" data-id="${esc(b.id)}"><span class="t">${esc(cleanTitle(titleOf(b)))}</span><span class="hint">added ${esc(fmtDate(b.addedAt))}</span></button>`).join("")}</div></section>` : ""}
      <section class="panel span6"><h3>Look further</h3>${engines.map(([k, l, d]) => `<button class="engine" data-act="disc-open" data-k="${k}"><b>${esc(l)}</b><small>${esc(d)}</small></button>`).join("")}</section>
      ${N.length ? `<section class="panel span12"><h3>From your own backlog</h3><div class="nexts row">${N.map(({ b, why }) => `<button class="nx" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}<span><b>${esc(titleOf(b))}</b><small>${esc(why)}</small></span></button>`).join("")}</div></section>` : ""}
    </div>`;
}

// ── Stats: Year in review ──
function wrappedHTML() {
    const A = modeItems(),
        yrs = [...new Set(A.map(b => endedAt(b) && new Date(endedAt(b)).getFullYear()).filter(Boolean))].sort(
            (a, b) => b - a
        ),
        yr = ui.wrapYear || yrs[0] || new Date().getFullYear();
    const Y = A.filter(b => b.status === "done" && b.finishedAt && new Date(b.finishedAt).getFullYear() === yr),
        D = A.filter(b => b.status === "dnf" && b.droppedAt && new Date(b.droppedAt).getFullYear() === yr);
    const mins = Y.reduce((a, b) => a + minutesSpent(b), 0),
        top = Y.filter(b => b.rating)
            .sort((a, b) => b.rating - a.rating || favPos(a.id) - favPos(b.id))
            .slice(0, 5);
    const g = {};
    for (const b of Y) for (const x of b.genres || []) g[x] = (g[x] || 0) + 1;
    const tg = Object.entries(g)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const months = Array.from({ length: 12 }, (_, i) => Y.filter(b => new Date(b.finishedAt).getMonth() === i).length),
        mx = Math.max(1, ...months),
        best = months.indexOf(Math.max(...months));
    const ss = allSessions().filter(s => new Date(s.date).getFullYear() === yr),
        days = new Set(ss.map(s => String(s.date).slice(0, 10)).concat(Y.map(b => b.finishedAt.slice(0, 10)))).size;
    const first = Y.slice().sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)))[0],
        sh = shelvesOf();
    return `<div class="wrapped">
    <div class="wbar"><div class="seg">${(yrs.length ? yrs : [yr])
        .slice(0, 8)
        .map(y => `<button data-act="wrap-year" data-k="${y}" aria-pressed="${y === yr}">${y}</button>`)
        .join("")}</div></div>
    ${
        Y.length
            ? `<section class="whero"><p class="eyebrow">${esc(curMode().name)} · ${yr}</p><h2>${Y.length} ${esc(STATUS_WORDS[groupWord()].done.toLowerCase())}</h2><p>${fmtHours(mins)} across ${days} day${days === 1 ? "" : "s"}${D.length ? `, and ${D.length} dropped` : ""}.${months[best] ? ` Your biggest month was ${new Date(yr, best, 1).toLocaleDateString("en-GB", { month: "long" })}.` : ""}</p></section>
      ${top.length ? `<section class="wtop"><p class="label">Your top ${top.length}</p><div class="wpod">${top.map((b, i) => `<button class="wp p${i + 1}" data-act="open" data-id="${esc(b.id)}"><span class="wn">${i + 1}</span>${coverHTML(b)}<b>${esc(cleanTitle(titleOf(b)))}</b><small>${esc(fmtScore(b.rating, scaleOf(b)))}</small></button>`).join("")}</div></section>` : ""}
      <div class="dash"><section class="panel span6"><h3>Month by month</h3><div class="ybars big">${months.map((n, i) => `<span title="${n}"><i style="height:${Math.round((n / mx) * 100)}%"></i><small>${"JFMAMJJASOND"[i]}</small></span>`).join("")}</div></section>
        <section class="panel span6"><h3>Genres of the year</h3>${tg.length ? hbars(tg.map(([x, n]) => [esc(x), n])) : `<p class="hint">No genres yet.</p>`}</section>
        ${sh.length > 1 ? `<section class="panel span6"><h3>By shelf</h3>${hbars(sh.map(s => [esc(s.name), Y.filter(b => s.test(b)).length]).filter(r => r[1]))}</section>` : ""}
        <section class="panel span6"><h3>Firsts and favourites</h3><div class="mini">${first ? `<button data-act="open" data-id="${esc(first.id)}"><span class="t">First of the year: ${esc(cleanTitle(titleOf(first)))}</span><span class="hint">${esc(fmtDate(first.finishedAt))}</span></button>` : ""}
          ${Y.filter(b => b.fav)
              .slice(0, 5)
              .map(
                  b =>
                      `<button data-act="open" data-id="${esc(b.id)}"><span class="t">♥ ${esc(cleanTitle(titleOf(b)))}</span><span class="hint">favourite</span></button>`
              )
              .join("")}</div></section></div>`
            : `<div class="empty"><h3>Nothing finished in ${yr}</h3><p>Finish something and this fills in.</p></div>`
    }</div>`;
}
