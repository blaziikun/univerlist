// src/features/library/blocks.js
// ─────────────────────────────────────────────────────────────────
//  Overview: a grid of blocks you arrange per mode (drag to move, − to remove, + to add, S/M/L/Full widths)
// ─────────────────────────────────────────────────────────────────

function nowRow(b) {
    const st = MEDIA[b.medium].steps;
    return `<div class="nrow"><button class="nc" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}</button><div class="nb2"><button class="t" data-act="open" data-id="${esc(b.id)}">${esc(titleOf(b))}</button>
    <div class="pg"><span>${esc(progText(b))}</span>${b.total ? `<span>${pct(b)}%</span>` : ""}</div><div class="prog"><span style="width:${pct(b)}%"></span></div></div>
    ${st.length ? `<button class="btn sm" data-act="log-add" data-id="${esc(b.id)}" data-k="${st[0]}" title="Log +${st[0]}">+${st[0]}</button>` : `<button class="btn sm" data-act="finish" data-id="${esc(b.id)}" title="Mark as ${esc(statusWord("done", b.medium))}">✓</button>`}</div>`;
}
const activeOf = M =>
    M.filter(b => b.status === "active" || b.status === "redo").sort((a, b) =>
        String(b.lastAt || b.startedAt || "").localeCompare(String(a.lastAt || a.startedAt || ""))
    );
// what to start next: what you're in, your queue, sequels to things you finished, then the best-loved things you planned
function nextUp(M, n = 6) {
    const done = new Set(M.filter(b => b.status === "done").map(b => b.id)),
        out = new Map(),
        add = (b, s, why) => {
            const e = out.get(b.id);
            if (!e || e.s < s) out.set(b.id, { b, s, why });
        };
    for (const b of M.filter(b => b.status === "paused"))
        add(b, 70, "Paused " + (b.lastAt ? ago(b.lastAt) : "a while ago"));
    meta.queue.forEach((id, i) => {
        const b = M.find(x => x.id === id);
        if (b && b.status === "want") add(b, 90 - i, `#${i + 1} in Up next`);
    });
    for (const b of M.filter(b => b.status === "want")) {
        const prev = (b.links || []).find(l => l.type === "prequel" && done.has(l.id));
        if (prev) add(b, 85, `Sequel to ${cleanTitle(titleOf(items.get(prev.id)))}`);
        const src = (b.links || []).find(
            l => l.type === "adaptation" && done.has(l.id) && (items.get(l.id) || {}).rating >= 8
        );
        if (src) add(b, 75, `You gave ${cleanTitle(titleOf(items.get(src.id)))} ${fmtScore(items.get(src.id).rating)}`);
        const c = crowd(b).avg;
        if (c) add(b, c / 2, `Crowd ${c}/100`);
    }
    return [...out.values()].sort((a, b) => b.s - a.s).slice(0, n);
}
function healthOf(M) {
    const now = Date.now();
    return {
        dupes: dupGroups().filter(g => g.some(id => M.some(b => b.id === id))).length,
        noCover: M.filter(b => !coverSrc(b)).length,
        unscored: M.filter(b => b.status === "done" && !b.rating).length,
        stale: M.filter(
            b => b.status === "active" && Date.parse(b.lastAt || b.startedAt || b.addedAt || 0) < now - 60 * 864e5
        ).length,
        noYear: M.filter(b => !b.year).length,
        hidden: [...items.values()].filter(
            b => b.hidden && inMode(b) && !!b.private === !!ui.private && (!isSealed(b) || ui.private)
        ).length,
    };
}
const countUp = (v, fmt = "") => `<span class="cu" data-cu="${esc(v)}" data-fmt="${fmt}">${esc(v)}</span>`;
const BLOCKS = {
    summary: {
        name: "Summary",
        d: "Totals for this mode",
        w: 12,
        html: c => {
            const fin = c.M.filter(b => b.status === "done"),
                rated = c.M.filter(b => b.rating),
                yr = new Date().getFullYear(),
                mins = c.M.reduce((a, b) => a + minutesSpent(b), 0);
            return `<div class="sumtiles">
      <button class="tile" data-act="tab" data-k="library"><div class="v">${countUp(c.M.length)}</div><div class="k">In ${esc(c.mode.name)}</div></button>
      <button class="tile" data-act="lib-status" data-k="done"><div class="v">${countUp(fin.length)}</div><div class="k">${esc(STATUS_WORDS[groupWord()].done)}</div></button>
      <button class="tile" data-act="lib-status" data-k="active"><div class="v">${countUp(activeOf(c.M).length)}</div><div class="k">${esc(STATUS_WORDS[groupWord()].active)}</div></button>
      <div class="tile"><div class="v">${countUp(mins >= 1440 ? (mins / 1440).toFixed(1) : Math.round(mins / 60), mins >= 1440 ? "1" : "")}</div><div class="k">${mins >= 1440 ? "Days" : "Hours"} spent</div></div>
      <div class="tile"><div class="v">${rated.length ? esc(fmtScore(rated.reduce((a, b) => a + b.rating, 0) / rated.length)) : "–"}</div><div class="k">Mean score</div></div>
      <div class="tile"><div class="v">${countUp(fin.filter(b => b.finishedAt && new Date(b.finishedAt).getFullYear() === yr).length)}</div><div class="k">${esc(STATUS_WORDS[groupWord()].done)} in ${yr}</div></div></div>`;
        },
    },
    bio: {
        name: "About you",
        d: "Your bio for this mode",
        w: 12,
        html: c =>
            c.mp.bio
                ? `<p class="biotext">${esc(c.mp.bio)}</p>`
                : `<p class="hint">No bio yet. <button class="linkbtn" data-act="profile-edit" data-k="${esc(c.mode.id)}">Write one</button></p>`,
    },
    favs: {
        name: "Favourites",
        d: "Fills whole rows; choose how many",
        w: 8,
        rows: 2,
        nums: true,
        link: ["tab", "favourites"],
        html: c => {
            const F = c.M.filter(b => b.fav).sort((a, b) => favPos(a.id) - favPos(b.id));
            return F.length
                ? `<div class="favgrid ov fillrows${c.cfg.nonum ? " nonum" : ""}" data-rows="${c.cfg.rows || 2}">${F.map(b => favTileHTML(b)).join("")}</div>`
                : `<p class="hint">Press the ♡ on any cover to add a favourite.</p>`;
        },
    },
    chars: {
        name: "Characters",
        d: "Your favourite characters from this mode",
        w: 8,
        rows: 1,
        link: ["tab", "favourites"],
        html: c => {
            const C = charsInMode();
            return C.length
                ? `<div class="chargrid2 ov fillrows" data-rows="${c.cfg.rows || 1}">${C.map(x => charTile(x)).join("")}</div>`
                : `<p class="hint">Add characters from anything's Characters tab.</p>`;
        },
    },
    progress: {
        name: "In progress",
        d: "Where you are, with quick +1",
        w: 4,
        html: c => {
            const A = activeOf(c.M);
            return A.length
                ? `<div class="nrows">${A.slice(0, c.n).map(nowRow).join("")}</div>${A.length > c.n ? `<button class="linkbtn" data-act="lib-status" data-k="active">All ${A.length}</button>` : ""}`
                : `<p class="hint">Nothing in progress.</p>`;
        },
        n: 8,
    },
    airing: {
        name: "Coming up",
        d: "Next episodes and chapters (AniList)",
        w: 4,
        html: c => {
            const A = airingList().slice(0, 6);
            return A.length
                ? `<div class="airs">${A.map(airRow).join("")}</div>`
                : `<p class="hint">Nothing you follow has a date yet.</p>`;
        },
    },
    queue: {
        name: "Up next",
        d: "Your queue",
        w: 4,
        link: ["go-list", "queue"],
        html: c => {
            const Q = meta.queue.map(id => ({ id, ...items.get(id) })).filter(b => b.title && visible(b) && inMode(b));
            return Q.length
                ? `<div class="board">${Q.slice(0, 6)
                      .map(
                          (b, i) =>
                              `<button data-act="open" data-id="${esc(b.id)}"><span class="r">${i + 1}</span>${coverHTML(b)}<span class="t">${esc(titleOf(b))}</span><span class="hint">${esc(b.kind || MEDIA[b.medium].one)}</span></button>`
                      )
                      .join("")}</div>`
                : `<p class="hint">Queue things from their cards.</p>`;
        },
    },
    nextup: {
        name: "Next up",
        d: "Your priority order (drag to change it), then suggestions",
        w: 4,
        n: 6,
        link: ["go-list", "queue"],
        html: c => {
            const Q = meta.queue
                .map(id => ({ id, ...items.get(id) }))
                .filter(b => b.title && visible(b) && inMode(b) && b.status !== "done");
            const sug =
                Q.length < c.n
                    ? nextUp(c.M, c.n * 2)
                          .filter(x => !meta.queue.includes(x.b.id))
                          .slice(0, c.n - Q.length)
                    : [];
            return `${
                Q.length
                    ? `<div class="queue nq">${Q.slice(0, c.n)
                          .map(
                              (b, i) =>
                                  `<div class="qi nx" draggable="true" data-lid="queue" data-qid="${esc(b.id)}"><span class="rk">${i + 1}</span><button class="nc" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}</button><span><b>${esc(titleOf(b))}</b><small>${esc(b.status === "active" ? progText(b) : b.kind || MEDIA[b.medium].one)}</small></span><button class="btn sm ghost" data-act="start" data-id="${esc(b.id)}" title="${esc(verbOf(b.medium)[0])}">▶</button></div>`
                          )
                          .join("")}</div>`
                    : `<p class="hint">Nothing queued. Right-click anything and choose “+ Up next”: the order here is your priority.</p>`
            }
      ${sug.length ? `<p class="label sub">Suggested</p><div class="nexts">${sug.map(({ b, why }) => `<div class="nx">${coverHTML(b)}<span><b>${esc(titleOf(b))}</b><small>${esc(why)}</small></span><button class="btn sm ghost" data-act="q-add" data-id="${esc(b.id)}" title="Add to Up next">+</button></div>`).join("")}</div>` : ""}`;
        },
    },
    quicklog: {
        name: "Quick log",
        d: "Log progress or a finish in one go",
        w: 4,
        html: c => {
            const A = activeOf(c.M).slice(0, 5),
                opts = c.M.filter(b => b.status !== "done").slice(0, 400);
            return `${A.map(b => {
                const st = MEDIA[b.medium].steps;
                return `<div class="qlrow"><span class="t">${esc(cleanTitle(titleOf(b)))}</span><span class="hint">${esc(progText(b))}</span>${st.map(n => `<button class="btn sm" data-act="log-add" data-id="${esc(b.id)}" data-k="${n}">+${n}</button>`).join("")}<button class="btn sm ghost" data-act="finish" data-id="${esc(b.id)}" title="Finished">✓</button></div>`;
            }).join("")}
      <div class="bar" style="margin-top:8px"><input class="inp" id="ql-q" list="ql-opts" placeholder="Finished something else today…" style="flex:1"><datalist id="ql-opts">${opts.map(b => `<option value="${esc(titleOf(b))} · ${esc(MEDIA[b.medium].one)}">`).join("")}</datalist><button class="btn sm gold" data-act="ql-log">Log</button></div>`;
        },
    },
    recent: {
        name: "Recently ended",
        d: "Finished or dropped lately",
        w: 12,
        n: 16,
        html: c => {
            const R = c.M.filter(b => endedAt(b))
                .sort((a, b) => String(endedAt(b)).localeCompare(String(endedAt(a))))
                .slice(0, c.n);
            return R.length
                ? `<div class="strip">${R.map(b => coverTile(b)).join("")}</div>`
                : `<p class="hint">Nothing finished yet.</p>`;
        },
    },
    shelves: {
        name: "Shelves",
        d: "Totals per shelf",
        w: 8,
        html: c => {
            const sh = shelvesOf(c.mode);
            return `<div class="mstats">${sh
                .map(s => {
                    const x = mediumStatsOf(s.test);
                    if (!x.n) return "";
                    return `<button class="mstat" data-act="shelf" data-k="${esc(s.key)}"><b>${esc(s.name)}</b><span class="row"><span><em>${x.n}</em> total</span><span><em>${x.fin}</em> finished</span></span><span class="row"><span><em>${x.min >= 1440 ? (x.min / 1440).toFixed(1) : (x.min / 60).toFixed(0)}</em> ${x.min >= 1440 ? "days" : "hours"}</span><span><em>${x.mean ? esc(fmtScore(x.mean)) : "–"}</em> mean</span></span></button>`;
                })
                .join("")}</div>`;
        },
    },
    genres: {
        name: "Top genres",
        d: "What you have most of",
        w: 6,
        n: 7,
        html: c => {
            const g = {};
            for (const b of c.M) for (const x of b.genres || []) g[x] = (g[x] || 0) + 1;
            const top = Object.entries(g)
                .sort((a, b) => b[1] - a[1])
                .slice(0, c.n);
            return top.length
                ? hbars(
                      top.map(([x, n]) => [
                          `<button class="linkbtn plain" data-act="go-genre" data-k="${esc(x)}">${esc(x)}</button>`,
                          n,
                      ])
                  )
                : `<p class="hint">Genres fill in as details load.</p>`;
        },
    },
    activity: {
        name: "Activity",
        d: "Every day you logged or finished something",
        w: 6,
        html: c => {
            const st = activityStats();
            return `<p class="hint" style="margin:-4px 0 8px">${st.streak} day streak · longest ${st.longest}</p>${heatHTML(st.byDay, 22)}`;
        },
    },
    lists: {
        name: "Lists",
        d: "Your lists for this mode",
        w: 12,
        link: ["tab", "lists"],
        html: c => {
            const L = meta.lists.filter(l => listInMode(l) && !l.private === !ui.private).slice(0, 6);
            return L.length
                ? `<div class="frgrid">${L.map(l => listCard(l.id, l.name, l.desc, l.ids, l.numbered ? "№" : "≡")).join("")}</div>`
                : `<p class="hint">No lists yet. <button class="linkbtn" data-act="list-new">Make one</button></p>`;
        },
    },
    health: {
        name: "Library health",
        d: "Duplicates, gaps and stalled things to tidy",
        w: 4,
        html: c => {
            const H = healthOf(c.M);
            const row = (n, label, act, k = "") =>
                `<div class="hrow${n ? "" : " ok"}"><span class="n">${n || "✓"}</span><span>${label}</span>${n && act ? `<button class="linkbtn" data-act="${act}" data-k="${esc(k)}">Fix</button>` : ""}</div>`;
            return `${row(H.dupes, "possible duplicates", "health-dupes")}${row(H.noCover, "without a cover", "health-covers")}${row(H.unscored, "finished but not scored", "health-unscored")}${row(H.stale, "in progress, untouched for 2 months", "health-stale")}${H.hidden ? row(H.hidden, "hidden", "hidden-view") : ""}`;
        },
    },
    revisits: {
        name: "Revisits",
        d: "What you've watched, read or played again",
        w: 6,
        n: 10,
        html: c => {
            const R = c.M.filter(b => b.repeat > 0 || (b.reads || []).length)
                .sort((a, b) => (b.repeat || 0) - (a.repeat || 0))
                .slice(0, c.n);
            return R.length
                ? `<div class="mini">${R.map(b => `<button data-act="open" data-id="${esc(b.id)}"><span class="t">${mDot(b.medium)}${esc(titleOf(b))}</span><span class="hint">×${(b.repeat || 0) + 1}${b.rating ? " · " + esc(fmtScore(b.rating, scaleOf(b))) : ""}</span></button>`).join("")}</div>`
                : `<p class="hint">Nothing revisited yet. "Watch again" on a card keeps the history.</p>`;
        },
    },
    year: {
        name: "This year",
        d: "Month by month, and your best so far",
        w: 6,
        html: c => {
            const yr = new Date().getFullYear(),
                Y = c.M.filter(b => b.status === "done" && b.finishedAt && new Date(b.finishedAt).getFullYear() === yr);
            const byM = Array.from(
                    { length: 12 },
                    (_, i) => Y.filter(b => new Date(b.finishedAt).getMonth() === i).length
                ),
                mx = Math.max(1, ...byM),
                best = Y.filter(b => b.rating)
                    .sort((a, b) => b.rating - a.rating)
                    .slice(0, 4);
            return `<div class="ybars">${byM.map((n, i) => `<span title="${new Date(yr, i, 1).toLocaleDateString("en-GB", { month: "long" })}: ${n}"><i style="height:${Math.round((n / mx) * 100)}%"></i><small>${"JFMAMJJASOND"[i]}</small></span>`).join("")}</div>
      ${best.length ? `<div class="strip tight">${best.map(b => coverTile(b)).join("")}</div>` : ""}<button class="linkbtn" data-act="stats-view" data-k="wrapped">Year in review</button>`;
        },
    },
    seasonal: {
        name: "This season",
        d: "Anime airing this season (AniList)",
        w: 12,
        only: m => hasAnimanga(m),
        html: c => seasonalMini(),
    },
    diary: { name: "Diary", d: "What you watched, most recent first", w: 6, html: c => diaryMini(c.M) },
    playing: { name: "Now playing", d: "Hours, platform and how far", w: 8, html: c => playingMini(c.M) },
    series: { name: "Series", d: "Series you're partway through", w: 6, html: c => seriesMini(c.M) },
    quote: {
        name: "A quote",
        d: "One of the lines you saved",
        w: 4,
        html: c => {
            const Q = c.M.flatMap(b => (b.quotes || []).map(q => ({ q, b })));
            if (!Q.length) return `<p class="hint">Save a quote from a card's Journal tab.</p>`;
            const x = Q[Math.floor(Date.now() / 864e5) % Q.length];
            return `<blockquote class="bq">${esc(x.q.text)}</blockquote><button class="linkbtn" data-act="open" data-id="${esc(x.b.id)}">— ${esc(cleanTitle(titleOf(x.b)))}${x.q.page ? ", " + esc(x.q.page) : ""}</button>`;
        },
    },
    discover: {
        name: "Insights",
        d: "How often you finish what you start, by genre",
        w: 6,
        html: c => {
            const L = modeItems(),
                R = finishRates(L, b => b.genres)
                    .sort((a, b) => b.n - a.n)
                    .slice(0, 6)
                    .sort((a, b) => b.pct - a.pct);
            return R.length
                ? rateBars(R) +
                      `<p class="hint"><button class="linkbtn" data-act="open-discover">More insights</button></p>`
                : `<p class="hint">Start or finish a few things and this fills in. <button class="linkbtn" data-act="open-discover">Insights</button></p>`;
        },
    },
};
const DEFAULT_BLOCKS = {
    universal: [
        ["summary"],
        ["favs", 8, 2],
        ["progress", 4],
        ["nextup", 4],
        ["health", 4],
        ["genres", 4],
        ["recent"],
        ["shelves", 6],
        ["activity", 6],
        ["lists"],
    ],
    animanga: [
        ["summary"],
        ["favs", 8, 2],
        ["airing", 4],
        ["progress", 4],
        ["chars", 8],
        ["queue", 4],
        ["seasonal"],
        ["recent"],
        ["genres", 6],
        ["activity", 6],
    ],
    novels: [
        ["summary"],
        ["favs", 8, 2],
        ["progress", 4],
        ["quote", 4],
        ["series", 6],
        ["year", 6],
        ["recent"],
        ["genres", 6],
        ["lists", 6],
    ],
    screen: [
        ["summary"],
        ["favs", 8, 2],
        ["diary", 4],
        ["progress", 6],
        ["revisits", 6],
        ["chars", 8],
        ["queue", 4],
        ["recent"],
        ["genres", 6],
        ["activity", 6],
    ],
    games: [["summary"], ["playing", 8], ["nextup", 4], ["favs", 12, 1], ["recent"], ["genres", 6], ["year", 6]],
    academic: [["summary"], ["learn", 12], ["paths", 8], ["progress", 4], ["recent"], ["shelves", 12]],
    sealed: [["summary"], ["favs", 8, 2], ["progress", 4], ["recent"]],
};
// two kinds of block page share one engine: the overview ("ov") and stats ("st")
const BKIND = {
    ov: {
        reg: () => BLOCKS,
        key: "blocks",
        defs: id => DEFAULT_BLOCKS[id] || DEFAULT_BLOCKS.universal,
        word: "overview",
    },
    st: {
        reg: () => STAT_BLOCKS,
        key: "statBlocks",
        defs: id => DEFAULT_STATS[id] || DEFAULT_STATS.universal,
        word: "stats page",
    },
};
// a mode uses its own layout if you saved one there, otherwise the layout you shared with every mode, otherwise its default
function blocksOf(mode, kind = "ov") {
    const K = BKIND[kind],
        R = K.reg(),
        own = mode[K.key],
        shared = (meta.layout.shared || {})[K.key];
    const L =
        own && own.length
            ? own
            : shared && shared.length
              ? shared
              : K.defs(mode.id).map(([k, w, rows, type]) => ({ k, w: w || R[k].w, rows, type }));
    return L.filter(x => R[x.k] && (!R[x.k].only || R[x.k].only(mode)));
}
const blockSource = (mode, kind = "ov") =>
    (mode[BKIND[kind].key] || []).length
        ? "own"
        : ((meta.layout.shared || {})[BKIND[kind].key] || []).length
          ? "shared"
          : "default";
function setBlocks(mode, fn, kind = "ov") {
    mode[BKIND[kind].key] = fn(blocksOf(mode, kind).map(x => ({ ...x })));
    markDirty();
    renderMain();
}
function blockGridHTML(kind, ctxBase) {
    const mode = curMode(),
        K = BKIND[kind],
        R = K.reg(),
        B = blocksOf(mode, kind),
        edit = ui.blocksEdit === kind,
        src = blockSource(mode, kind);
    const body = B.map((cfg, i) => {
        const def = R[cfg.k],
            ctx = { ...ctxBase, mode, cfg, n: cfg.n || def.n || 8, type: cfg.type || def.type };
        let inner = "";
        try {
            inner = def.html(ctx);
        } catch (e) {
            console.warn(cfg.k, e);
            inner = `<p class="hint">This block couldn't load.</p>`;
        }
        return `<section class="panel blk w${cfg.w || def.w}" data-bi="${i}" data-bk="${cfg.k}" data-bkind="${kind}" draggable="${edit}">
      <h3 class="bh"><span class="bt">${esc(cfg.title || def.name)}</span>${def.link ? `<span class="r"><button class="linkbtn" data-act="${def.link[0]}" data-k="${def.link[1]}">All</button></span>` : ""}</h3>
      <div class="btools">${edit ? `<span class="bdrag" title="Drag to move">⋮⋮</span>` : ""}<button class="bset" data-act="blk-menu" data-k="${i}" data-bkind="${kind}" title="Block settings (or right-click)" aria-label="Settings for ${esc(def.name)}">⋯</button><button class="bx" data-act="blk-del" data-k="${i}" data-bkind="${kind}" title="Remove this block" aria-label="Remove ${esc(def.name)}">−</button></div>
      <div class="bbody">${inner}</div></section>`;
    }).join("");
    const opts = Object.entries(R).filter(([, d]) => !d.only || d.only(mode));
    return `<div class="blocks${edit ? " editing" : ""}" data-bkind="${kind}">${body}</div>
    <div class="blkbar">${
        ui.blockAdd === kind
            ? `<div class="blkpick panel"><p class="label">Add a block</p><div class="blkopts">${opts.map(([k, d]) => `<button class="blkopt" data-act="blk-add" data-k="${k}" data-bkind="${kind}"><b>${esc(d.name)}</b><small>${esc(d.d)}</small>${B.some(x => x.k === k) ? `<em>on</em>` : ""}</button>`).join("")}</div><div class="bar"><button class="btn sm ghost" data-act="blk-addclose">Close</button></div></div>`
            : `<button class="btn sm ghost" data-act="blk-addopen" data-bkind="${kind}">+ Add a block</button><button class="btn sm ghost" data-act="blk-edit" data-bkind="${kind}">${edit ? "Done arranging" : "Arrange"}</button>
        <span class="blksrc hint">${src === "own" ? `This layout is ${esc(mode.name)}'s own.` : src === "shared" ? "Using the layout shared by every mode." : `${esc(mode.name)}'s default layout.`}</span>
        <button class="btn sm ghost" data-act="blk-share" data-bkind="${kind}" title="Every mode without its own layout uses this one">Use this layout in every mode</button>
        ${src === "own" ? `<button class="btn sm ghost" data-act="blk-unown" data-bkind="${kind}">${((meta.layout.shared || {})[K.key] || []).length ? "Go back to the shared layout" : "Go back to the default"}</button>` : ""}`
    }</div>`;
}
function overviewHTML() {
    const mode = curMode(),
        M = modeItems(),
        mp = modeProfile(mode);
    if (!M.length && !ui.private)
        return `<div class="empty hello"><h3>${meta.settings.fresh && !items.size ? "Welcome. Start with anything." : `Nothing in ${esc(mode.name)} yet`}</h3><p>Search for a book, show, film, game or anime (the magnifier at the top right) and press +. Or bring in what you already track: an AniList or Letterboxd profile link, or an export file.</p>
    <div class="bar" style="justify-content:center"><button class="btn gold" data-act="focus-search">Search to add</button><button class="btn" data-act="go-settings" data-k="io">Import</button>${!meta.profile.name ? `<button class="btn ghost" data-act="profile-edit" data-k="${esc(mode.id)}">Add your name and picture</button>` : ""}</div></div>`;
    return blockGridHTML("ov", { M, mp });
}
// the settings for one block, shown on ⋯ or right-click
function blockMenuHTML(kind, i) {
    const mode = curMode(),
        R = BKIND[kind].reg(),
        cfg = blocksOf(mode, kind)[i];
    if (!cfg) return "";
    const def = R[cfg.k],
        w = String(cfg.w || def.w),
        types = def.types || [];
    return `<div class="ctx-h"><b>${esc(cfg.title || def.name)}</b><small>${esc(def.d)}</small></div>
    <div class="ctx-s"><span class="ilab">Title</span><input class="inp" data-blkt="${i}" data-bkind="${kind}" value="${esc(cfg.title || "")}" placeholder="${esc(def.name)}"></div>
    ${def.custom ? customBlockMenu(kind, i, cfg) : ""}${def.nums ? `<div class="ctx-s"><label class="ctl"><input type="checkbox" data-blkc="nonum" data-k="${i}" data-bkind="${kind}" ${cfg.nonum ? "checked" : ""}> Hide the position numbers</label></div>` : ""}
    <div class="ctx-s"><span class="ilab">Width</span><div class="ctx-st">${[
        ["4", "Small"],
        ["6", "Half"],
        ["8", "Large"],
        ["12", "Full"],
    ]
        .map(
            ([x, l]) =>
                `<button data-act="blk-w" data-k="${i}" data-w="${x}" data-bkind="${kind}" aria-pressed="${w === x}">${l}</button>`
        )
        .join("")}</div></div>
    ${types.length ? `<div class="ctx-s"><span class="ilab">Show as</span><div class="ctx-st">${types.map(([x, l]) => `<button data-act="blk-type" data-k="${i}" data-t="${x}" data-bkind="${kind}" aria-pressed="${(cfg.type || def.type) === x}">${l}</button>`).join("")}</div></div>` : ""}
    ${def.rows ? `<div class="ctx-s"><span class="ilab">Rows · ${cfg.rows || def.rows}</span><div class="ctx-st"><button data-act="blk-rows" data-k="${i}" data-d="-1" data-bkind="${kind}">Fewer</button><button data-act="blk-rows" data-k="${i}" data-d="1" data-bkind="${kind}">More</button></div></div>` : ""}
    ${def.n ? `<div class="ctx-s"><span class="ilab">How many · ${cfg.n || def.n}</span><div class="ctx-st">${[3, 5, 8, 12, 20].map(n => `<button data-act="blk-n" data-k="${i}" data-n="${n}" data-bkind="${kind}" aria-pressed="${(cfg.n || def.n) === n}">${n}</button>`).join("")}</div></div>` : ""}
    <div class="ctx-a"><button data-act="blk-move" data-k="${i}" data-d="-1" data-bkind="${kind}">↑ Earlier</button><button data-act="blk-move" data-k="${i}" data-d="1" data-bkind="${kind}">↓ Later</button><button data-act="blk-dup" data-k="${i}" data-bkind="${kind}">Duplicate</button><button data-act="blk-del" data-k="${i}" data-bkind="${kind}">Remove</button></div>`;
}
// favourites and characters fill whole rows: never one lonely cover on the last line
function fitRows() {
    for (const g of $$(".fillrows")) {
        const cols = getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length || 1,
            rows = Number(g.dataset.rows) || 2,
            kids = [...g.children],
            n = kids.length;
        let show = Math.min(n, cols * rows);
        if (n > cols && show % cols) show -= show % cols;
        kids.forEach((k, i) => {
            k.style.display = i < show ? "" : "none";
        });
    }
}
// masonry: each block spans as many 6px rows as it's tall, and dense packing fills the gaps
function packBlocks() {
    const grid = $(".blocks");
    if (!grid) return;
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    for (const b of grid.children) {
        b.style.gridRowEnd = "auto";
        const h = b.getBoundingClientRect().height;
        b.style.gridRowEnd = "span " + Math.max(1, Math.ceil((h + gap) / (6 + gap)));
    }
}
let blkRO = null;
const countedUp = new Set();
afterRenderHooks.push(() => {
    fitRows();
    packBlocks();
    for (const el of $$(".blk .donut, .blk .cols")) void el;
    if (blkRO) blkRO.disconnect();
    const grid = $(".blocks");
    if (grid && "ResizeObserver" in window) {
        let w = grid.clientWidth;
        blkRO = new ResizeObserver(() => {
            if (Math.abs(grid.clientWidth - w) > 2) {
                w = grid.clientWidth;
                fitRows();
                packBlocks();
            }
        });
        blkRO.observe(grid);
    }
    // numbers count up when the overview opens
    // only the first time you open a mode's overview, not every time something changes
    const cuKey = ui.mode + (ui.private ? "p" : "");
    if (countedUp.has(cuKey) || !$(".cu")) return;
    countedUp.add(cuKey);
    for (const el of $$(".cu")) {
        const end = parseFloat(el.dataset.cu);
        if (!Number.isFinite(end) || end <= 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) continue;
        const dec = el.dataset.fmt === "1" ? 1 : 0,
            t0 = performance.now();
        const tick = t => {
            const k = Math.min(1, (t - t0) / 650),
                v = end * (1 - Math.pow(1 - k, 3));
            el.textContent = v.toFixed(dec);
            if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }
});
addEventListener("load", () => {
    if (document.fonts)
        document.fonts.ready.then(() => {
            fitRows();
            packBlocks();
        });
});
document.addEventListener(
    "load",
    e => {
        if (e.target.tagName === "IMG" && e.target.closest(".blocks")) {
            clearTimeout(packBlocks.t);
            packBlocks.t = setTimeout(packBlocks, 120);
        }
    },
    true
);
