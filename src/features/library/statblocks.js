// src/features/library/statblocks.js
// ─────────────────────────────────────────────────────────────────
//  Stats as blocks: each one can be shown as bars, columns, a donut or a ranked list
// ─────────────────────────────────────────────────────────────────

const CHART_TYPES = [
    ["bars", "Bars"],
    ["cols", "Columns"],
    ["donut", "Donut"],
    ["list", "List"],
];
const PAL = i => (i < 5 ? `var(--s${i + 1})` : `hsl(${(i * 47 + 200) % 360} 55% 58%)`);
function colsChart(rows, fmt = v => v) {
    const max = Math.max(1, ...rows.map(r => r[1]));
    return `<div class="cols">${rows.map(([l, v], i) => `<span title="${esc(String(l).replace(/<[^>]+>/g, ""))}: ${esc(fmt(v))}"><em>${esc(fmt(v))}</em><i style="height:${Math.max(2, Math.round((v / max) * 100))}%;opacity:${(0.45 + (0.55 * v) / max).toFixed(2)}"></i><small>${l}</small></span>`).join("")}</div>`;
}
function donutChart(rows, fmt = v => v) {
    const tot = rows.reduce((a, r) => a + r[1], 0) || 1,
        R = 46,
        C = 2 * Math.PI * R;
    let acc = 0;
    const arcs = rows
        .map(([l, v], i) => {
            const len = (v / tot) * C,
                off = acc;
            acc += len;
            return `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${PAL(i % 12)}" stroke-width="18" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}"><title>${esc(String(l).replace(/<[^>]+>/g, ""))}: ${esc(fmt(v))}</title></circle>`;
        })
        .join("");
    return `<div class="donutwrap"><svg class="donut" viewBox="0 0 120 120" role="img" aria-label="${esc(rows.map(([l, v]) => `${String(l).replace(/<[^>]+>/g, "")}: ${fmt(v)}`).join("; "))}"><g transform="rotate(-90 60 60)">${arcs}</g><text x="60" y="58" text-anchor="middle" class="dt1">${esc(fmt(tot))}</text><text x="60" y="74" text-anchor="middle" class="dt2">total</text></svg>
    <div class="dlegend">${rows.map(([l, v], i) => `<span><i style="background:${PAL(i % 12)}"></i>${l}<b>${Math.round((v / tot) * 100)}%</b></span>`).join("")}</div></div>`;
}
function listChart(rows, fmt = v => v) {
    const tot = rows.reduce((a, r) => a + r[1], 0) || 1;
    return `<table class="lib small ranked"><tbody>${rows.map(([l, v], i) => `<tr><td class="num">${i + 1}</td><td>${l}</td><td class="num">${esc(fmt(v))}</td><td class="num hint">${Math.round((v / tot) * 100)}%</td></tr>`).join("")}</tbody></table>`;
}
function chartOf(type, rows, fmt) {
    if (!rows.length) return `<p class="hint">Nothing to show yet.</p>`;
    return type === "cols"
        ? colsChart(rows, fmt)
        : type === "donut"
          ? donutChart(rows, fmt)
          : type === "list"
            ? listChart(rows, fmt)
            : hbars(rows, fmt);
}
const countBy = (A, f, n = 12) => {
    const m = {};
    for (const b of A) for (const k of [].concat(f(b) || [])) if (k != null && k !== "") m[k] = (m[k] || 0) + 1;
    return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
};
const dataBlock = (name, d, w, type, rowsOf, extra = {}) => ({
    name,
    d,
    w,
    type,
    types: CHART_TYPES,
    n: extra.n || 10,
    ...extra,
    html: c =>
        chartOf(
            c.type,
            rowsOf(c).map(([l, v]) => [esc(l), v]),
            extra.fmt
        ),
});
const STAT_BLOCKS = {
    tiles: {
        name: "Totals",
        d: "Items, finished, time, mean score, streak",
        w: 12,
        html: c => {
            const A = c.A,
                fin = A.filter(b => b.status === "done"),
                rated = A.filter(b => b.rating),
                st = c.st;
            return `<div class="tiles"><div class="tile"><div class="v">${A.length}</div><div class="k">Items</div></div><div class="tile"><div class="v">${fin.length}</div><div class="k">Finished</div></div><div class="tile"><div class="v">${st.doneYear}</div><div class="k">This year</div></div>
      <div class="tile"><div class="v">${(A.reduce((a, b) => a + minutesSpent(b), 0) / 1440).toFixed(1)}</div><div class="k">Days spent</div></div><div class="tile"><div class="v">${rated.length ? esc(fmtScore(rated.reduce((a, b) => a + b.rating, 0) / rated.length)) : "–"}</div><div class="k">Mean score</div></div><div class="tile"><div class="v">${st.streak}<span class="hint" style="font-size:14px"> / ${st.longest}</span></div><div class="k">Streak / longest</div></div></div>`;
        },
    },
    month: {
        name: "Finished per month",
        d: "The last 12 months, by family",
        w: 6,
        html: c => {
            const fin = c.A.filter(b => b.status === "done"),
                months = [],
                d = new Date();
            d.setDate(1);
            for (let i = 11; i >= 0; i--) {
                const m = new Date(d.getFullYear(), d.getMonth() - i, 1),
                    key = m.toISOString().slice(0, 7);
                months.push({
                    l: m.toLocaleDateString("en-GB", { month: "short" }),
                    v: SERIES.map(
                        s => fin.filter(b => catOf(b) === s[0] && String(b.finishedAt || "").slice(0, 7) === key).length
                    ),
                });
            }
            return legend(SERIES.map((_, i) => months.some(x => x.v[i]))) + stackChart(months);
        },
    },
    hours: {
        name: "Hours per week",
        d: "Logged sessions, last 16 weeks",
        w: 6,
        html: c => {
            const weeks = [];
            for (let i = 15; i >= 0; i--) {
                const end = Date.now() - i * 7 * 864e5,
                    start = end - 7 * 864e5;
                weeks.push({
                    l: new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
                    v: SERIES.map(
                        s =>
                            Math.round(
                                (c.st.ss
                                    .filter(
                                        x =>
                                            catOf(x.b) === s[0] &&
                                            Date.parse(x.date) > start &&
                                            Date.parse(x.date) <= end
                                    )
                                    .reduce((a, x) => a + x.min, 0) /
                                    60) *
                                    10
                            ) / 10
                    ),
                });
            }
            return (
                legend(SERIES.map((_, i) => weeks.some(x => x.v[i]))) +
                stackChart(weeks, { fmt: v => Math.round(v * 10) / 10, unit: " h" })
            );
        },
    },
    heat: { name: "Activity", d: "Every day you logged or finished something", w: 8, html: c => heatHTML(c.st.byDay) },
    shelves: dataBlock("By shelf", "How many on each shelf", 4, "donut", c =>
        shelvesOf()
            .map(s => [s.name, c.A.filter(b => s.test(b)).length])
            .filter(r => r[1])
    ),
    time: dataBlock(
        "Time by shelf",
        "Hours on each shelf",
        4,
        "bars",
        c =>
            shelvesOf()
                .map(s => [
                    s.name,
                    Math.round(c.A.filter(b => s.test(b)).reduce((a, b) => a + minutesSpent(b), 0) / 60),
                ])
                .filter(r => r[1]),
        { fmt: v => (v >= 1000 ? (v / 1000).toFixed(1) + "k h" : v + " h") }
    ),
    status: dataBlock("By status", "Planned, in progress, finished…", 4, "bars", c =>
        STATUS.map(s => [STATUS_WORDS[groupWord()][s], c.A.filter(b => b.status === s).length]).filter(r => r[1])
    ),
    genres: dataBlock("Top genres", "What you have most of", 6, "bars", c => countBy(c.A, b => b.genres, c.n), {
        n: 12,
    }),
    scores: dataBlock("Your scores", "How often you give each score", 6, "cols", c =>
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => [
            fmtScore(r),
            c.A.filter(b => b.rating && Math.round(b.rating) === r).length,
        ])
    ),
    types: dataBlock(
        "Types",
        "TV, films, novels, manhwa…",
        4,
        "donut",
        c => countBy(c.A, b => b.kind || MEDIA[b.medium].name, c.n),
        { n: 8 }
    ),
    decades: dataBlock("Release decades", "When the things you have came out", 6, "cols", c =>
        countBy(c.A, b => (b.year ? Math.floor(b.year / 10) * 10 + "s" : null), 20).sort((a, b) =>
            a[0].localeCompare(b[0])
        )
    ),
    creators: dataBlock(
        "Creators and studios",
        "Who made the most of what you have",
        4,
        "list",
        c => countBy(c.A, b => splitNames(b.creator).slice(0, 2), c.n),
        { n: 10 }
    ),
    themes: dataBlock(
        "Themes",
        "Tags from AniList and your own",
        4,
        "bars",
        c => countBy(c.A, b => [...(b.themes || []), ...(b.tags || [])], c.n),
        { n: 10 }
    ),
    platforms: dataBlock(
        "Platforms",
        "What you play on",
        4,
        "donut",
        c =>
            countBy(
                c.A.filter(b => b.medium === "game"),
                b => b.platform || (b.platforms || [])[0],
                c.n
            ),
        { n: 8, only: m => (m.match || []).some(p => p === "*" || p.startsWith("game")) || m.id === "games" }
    ),
    loved: {
        name: "Highest scores",
        d: "Your top-rated",
        w: 12,
        n: 12,
        html: c => {
            const T = c.A.filter(b => b.rating)
                .sort((a, b) => b.rating - a.rating || favPos(a.id) - favPos(b.id))
                .slice(0, c.n);
            return T.length
                ? `<div class="strip">${T.map(b => coverTile(b)).join("")}</div>`
                : `<p class="hint">Score a few things.</p>`;
        },
    },
    crowd: {
        name: "You vs the crowd",
        d: "Where you differ most",
        w: 6,
        n: 6,
        html: c => {
            const D = c.A.filter(b => b.rating && crowd(b).avg != null)
                .map(b => ({ ...b, d: mine(b) - crowd(b).avg }))
                .sort((a, b) => b.d - a.d);
            const row = b =>
                `<button class="drow" data-act="open" data-id="${esc(b.id)}">${coverHTML(b)}<span class="t">${esc(titleOf(b))}</span><span class="num">you ${esc(fmtScore(b.rating, scaleOf(b)))}</span><span class="num">crowd ${crowd(b).avg}</span><span class="num ${b.d >= 0 ? "up" : "down"}">${b.d >= 0 ? "+" : "−"}${Math.abs(Math.round(b.d))}</span></button>`;
            return D.length
                ? `<p class="label sub">You love more</p>${D.slice(0, c.n).map(row).join("")}<p class="label sub">The crowd loves more</p>${D.slice(-c.n).reverse().map(row).join("")}`
                : `<p class="hint">Scores from other sites fill this in.</p>`;
        },
    },
};
const DEFAULT_STATS = {
    universal: [
        ["tiles"],
        ["month", 6],
        ["hours", 6],
        ["heat", 8],
        ["shelves", 4, 0, "donut"],
        ["genres", 6],
        ["scores", 6, 0, "cols"],
        ["time", 4],
        ["status", 4],
        ["types", 4, 0, "donut"],
        ["loved"],
    ],
    games: [
        ["tiles"],
        ["platforms", 4, 0, "donut"],
        ["genres", 4],
        ["scores", 4, 0, "cols"],
        ["month", 6],
        ["heat", 6],
        ["loved"],
    ],
};
function statsHTML() {
    const A = ui.statsBasis === "done" ? modeItems().filter(b => b.status === "done") : modeItems();
    return blockGridHTML("st", { A, st: activityStats() });
}
// overview blocks that are just counts can be drawn any of the chart ways too
BLOCKS.genres = {
    ...BLOCKS.genres,
    type: "bars",
    types: CHART_TYPES,
    html: c =>
        chartOf(
            c.type,
            countBy(c.M, b => b.genres, c.n).map(([l, v]) => [esc(l), v])
        ),
};
BLOCKS.types = BLOCKS.types || {
    name: "Types",
    d: "TV, films, novels, manhwa…",
    w: 4,
    n: 8,
    type: "donut",
    types: CHART_TYPES,
    html: c =>
        chartOf(
            c.type,
            countBy(c.M, b => b.kind || MEDIA[b.medium].name, c.n).map(([l, v]) => [esc(l), v])
        ),
};
BLOCKS.statuses = BLOCKS.statuses || {
    name: "By status",
    d: "Planned, in progress, finished…",
    w: 4,
    type: "donut",
    types: CHART_TYPES,
    html: c =>
        chartOf(
            c.type,
            STATUS.map(s => [esc(STATUS_WORDS[groupWord()][s]), c.M.filter(b => b.status === s).length]).filter(
                r => r[1]
            )
        ),
};
