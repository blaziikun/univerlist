// src/features/library/custom-stats.js
// ─────────────────────────────────────────────────────────────────
//  More stats, and stats you build yourself: pick what to measure, what to split it by, and how to draw it
// ─────────────────────────────────────────────────────────────────

const STAT_MEASURES = [
    ["count", "How many"],
    ["done", "How many finished"],
    ["hours", "Hours spent"],
    ["avg", "Your average score"],
    ["crowd", "Average crowd score"],
    ["gap", "You vs the crowd"],
];
const STAT_SPLITS = [
    ["type", "Type", b => kindShown(b) || MEDIA[b.medium].name],
    ["medium", "Medium", b => MEDIA[b.medium].name],
    ["genre", "Genre", b => b.genres || []],
    ["theme", "Theme", b => b.themes || []],
    ["status", "Status", b => statusWord(b.status, b.medium)],
    ["year", "Release year", b => b.year || null],
    ["decade", "Decade", b => (b.year ? Math.floor(b.year / 10) * 10 + "s" : null)],
    ["finished", "Year finished", b => (b.status === "done" && endedAt(b) ? String(endedAt(b)).slice(0, 4) : null)],
    ["creator", "Creator", b => (b.creator ? b.creator.split(/ & |, /).slice(0, 2) : null)],
    ["tag", "Your tags", b => b.tags || []],
    [
        "shelf",
        "Shelf",
        b => {
            const s = shelfOfItem(b);
            return s ? s.name : null;
        },
    ],
];
function statRows(A, cfg) {
    const by = (STAT_SPLITS.find(x => x[0] === cfg.by) || STAT_SPLITS[0])[2],
        me = cfg.metric || "count",
        min = cfg.min || (["avg", "crowd", "gap"].includes(me) ? 3 : 1);
    const src = cfg.fin ? A.filter(b => b.status === "done") : A,
        G = new Map();
    for (const b of src)
        for (const k of [].concat(by(b) || []))
            if (k != null && k !== "") {
                if (!G.has(k)) G.set(k, []);
                G.get(k).push(b);
            }
    const val = L =>
        me === "count"
            ? L.length
            : me === "done"
              ? L.filter(b => b.status === "done").length
              : me === "hours"
                ? Math.round(L.reduce((a, b) => a + minutesSpent(b), 0) / 60)
                : me === "avg"
                  ? avgOf(L.map(b => b.rating).filter(Boolean))
                  : me === "crowd"
                    ? avgOf(L.map(b => crowd(b).avg).filter(v => v != null))
                    : avgOf(L.filter(b => b.rating && crowd(b).avg != null).map(b => b.rating * 10 - crowd(b).avg));
    const n = L =>
        me === "avg"
            ? L.filter(b => b.rating).length
            : me === "crowd"
              ? L.filter(b => crowd(b).avg != null).length
              : me === "gap"
                ? L.filter(b => b.rating && crowd(b).avg != null).length
                : L.length;
    let rows = [...G.entries()]
        .filter(([, L]) => n(L) >= min)
        .map(([k, L]) => [String(k), val(L), n(L)])
        .filter(r => r[1] != null && (r[1] || me === "gap"));
    rows.sort((a, b) =>
        cfg.by === "year" || cfg.by === "decade" || cfg.by === "finished"
            ? String(a[0]).localeCompare(String(b[0]))
            : b[1] - a[1]
    );
    return rows.slice(0, cfg.n || 12);
}
const avgOf = V => (V.length ? Math.round((V.reduce((a, v) => a + v, 0) / V.length) * 10) / 10 : null);
const statFmt = me =>
    me === "avg"
        ? v => fmtScore(v)
        : me === "hours"
          ? v => (v >= 1000 ? (v / 1000).toFixed(1) + "k h" : v + " h")
          : me === "gap"
            ? v => (v > 0 ? "+" : "") + v
            : v => v;
const customBlock = {
    name: "Your own stat",
    d: "Choose what to measure, how to split it and how to draw it (⋯ to set up)",
    w: 6,
    type: "bars",
    types: CHART_TYPES,
    n: 10,
    custom: true,
    html: c => {
        const cfg = c.cfg || {},
            rows = statRows(c.A || c.M, { ...cfg, n: c.n }),
            me = cfg.metric || "count";
        return (
            `<p class="hint statdesc">${esc((STAT_MEASURES.find(x => x[0] === me) || STAT_MEASURES[0])[1])} by ${esc((STAT_SPLITS.find(x => x[0] === cfg.by) || STAT_SPLITS[0])[1].toLowerCase())}${cfg.fin ? ", finished only" : ""}</p>` +
            (me === "gap"
                ? gapChart(rows)
                : chartOf(
                      c.type,
                      rows.map(([l, v]) => [esc(l), Math.max(0, v)]),
                      statFmt(me)
                  ))
        );
    },
};
// above or below the crowd: bars either side of the middle
function gapChart(rows) {
    if (!rows.length) return `<p class="hint">Nothing to show yet.</p>`;
    const max = Math.max(1, ...rows.map(r => Math.abs(r[1])));
    return `<div class="gapc">${rows.map(([l, v, n]) => `<div class="gr"><span class="gl">${esc(l)}</span><span class="gb"><i class="${v < 0 ? "neg" : "pos"}" style="width:${(Math.abs(v) / max) * 50}%"></i></span><span class="gv">${v > 0 ? "+" : ""}${v}</span></div>`).join("")}</div><p class="hint">Your score ×10 minus the crowd's, averaged. Right of centre: you like these more than most people do.</p>`;
}
const PLUS_BLOCKS = {
    timetype: {
        ...customBlock,
        name: "Time by type",
        d: "Hours on each type (anime, film, novel…)",
        w: 6,
        custom: false,
        html: c =>
            chartOf(
                c.type || "bars",
                statRows(c.A || c.M, { by: "type", metric: "hours", n: c.n }).map(([l, v]) => [esc(l), v]),
                statFmt("hours")
            ),
    },
    genrescore: {
        ...customBlock,
        name: "Genres by your score",
        d: "Genres you rate highest (at least 3 scored)",
        w: 6,
        custom: false,
        type: "list",
        html: c =>
            chartOf(
                c.type || "list",
                statRows(c.A || c.M, { by: "genre", metric: "avg", n: c.n }).map(([l, v, n]) => [
                    `${esc(l)} <small class="hint">· ${n}</small>`,
                    v,
                ]),
                statFmt("avg")
            ),
    },
    themescore: {
        ...customBlock,
        name: "Themes by your score",
        d: "The themes (time travel, found family…) you rate highest",
        w: 6,
        custom: false,
        type: "list",
        html: c =>
            chartOf(
                c.type || "list",
                statRows(c.A || c.M, { by: "theme", metric: "avg", n: c.n }).map(([l, v, n]) => [
                    `${esc(l)} <small class="hint">· ${n}</small>`,
                    v,
                ]),
                statFmt("avg")
            ),
    },
    crowdgap: {
        ...customBlock,
        name: "You vs the crowd, by genre",
        d: "Where your taste parts from everyone else's",
        w: 6,
        custom: false,
        html: c => gapChart(statRows(c.A || c.M, { by: "genre", metric: "gap", n: c.n })),
    },
    custom: customBlock,
};
Object.assign(STAT_BLOCKS, PLUS_BLOCKS);
Object.assign(BLOCKS, Object.fromEntries(Object.entries(PLUS_BLOCKS).map(([k, d]) => [k, { ...d }])));
// the set-up controls for a custom block, inside its ⋯ menu
function customBlockMenu(kind, i, cfg) {
    return `<div class="ctx-s"><span class="ilab">Measure</span>${selOf("", STAT_MEASURES, cfg.metric || "count", `data-blkc="metric" data-k="${i}" data-bkind="${kind}"`)}</div>
    <div class="ctx-s"><span class="ilab">Split by</span>${selOf(
        "",
        STAT_SPLITS.map(x => [x[0], x[1]]),
        cfg.by || "type",
        `data-blkc="by" data-k="${i}" data-bkind="${kind}"`
    )}</div>
    <div class="ctx-s"><label class="ctl"><input type="checkbox" data-blkc="fin" data-k="${i}" data-bkind="${kind}" ${cfg.fin ? "checked" : ""}> Finished only</label></div>`;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.blkc) return;
    const i = Number(t.dataset.k),
        kd = t.dataset.bkind || "ov",
        f = t.dataset.blkc,
        v = t.type === "checkbox" ? t.checked : t.value;
    setBlocks(curMode(), B => B.map((x, j) => (j === i ? { ...x, [f]: v } : x)), kd);
    refreshCtx && refreshCtx();
});
