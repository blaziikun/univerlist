// src/features/watch-read/watch.js
// ─────────────────────────────────────────────────────────────────
//  Watch (beta): seasons and episodes, your own copies, a quiet cinema
//
//  It plays files you open, your own media servers (Jellyfin, Plex, a NAS or any folder you host, set up once for every
//  episode) and links on your own network: only your own sources, by one rule (own-sources.js).
//  Details come from TVmaze, AniList and TMDB/Wikidata. It doesn't look for streams.
// ─────────────────────────────────────────────────────────────────

const W = {
    view: "home",
    q: "",
    results: null,
    busy: false,
    err: "",
    show: null,
    seasons: [],
    si: 0,
    files: new Map(),
    player: null,
    lib: new Map(),
    libImg: new Map(),
    libNote: "",
    libMiss: false,
};
const PLAYER_DEF = {
    autoNext: true,
    speed: 1,
    skip: 85,
    seek: 10,
    fit: "contain",
    subSize: 100,
    resume: true,
    hideUI: true,
    volume: 1,
    startMode: "now",
    subLang: "en",
    netBadge: true,
};
const PS = () => ({ ...PLAYER_DEF, ...(meta.settings.player || {}) });
const servers = () => (meta.settings.servers || []).filter(s => s.on !== false && s.pattern);
const parseEp = name => {
    const n = String(name);
    let m = /s(\d{1,2})[ ._-]*e(\d{1,4})/i.exec(n) || /(\d{1,2})x(\d{1,3})/.exec(n);
    if (m) return [+m[1], +m[2]];
    m = /(?:ep?|episode|第)[ ._-]*(\d{1,4})/i.exec(n) || /[ ._\-\[]\s*(\d{1,3})\s*[\]._ -]/.exec(" " + n + " ");
    return m ? [0, +m[1]] : null;
};
const posKey = (si, e) => (W.show ? W.show.groupId || W.show.id || W.show.title : "x") + ":" + si + ":" + e;
const loadPos = () => {
    try {
        return JSON.parse(localStorage.getItem("ul-pos") || "{}");
    } catch (_) {
        return {};
    }
};
const savePos = (k, t) => {
    try {
        const P = loadPos();
        if (t) P[k] = Math.floor(t);
        else delete P[k];
        localStorage.setItem("ul-pos", JSON.stringify(P));
    } catch (_) {}
};
// anime split into separate AniList entries (Bungo Stray Dogs 1, 2, 3…) become one show with seasons: the sequel chain in your library
function animeChain(id) {
    const seen = new Set([id]),
        q = [id];
    while (q.length) {
        const x = items.get(q.shift());
        for (const l of (x && x.links) || [])
            if (["sequel", "prequel"].includes(l.type) && !seen.has(l.id)) {
                const y = items.get(l.id);
                if (y && y.medium === "anime" && !["Movie", "Special", "Music"].includes(y.kind)) {
                    seen.add(l.id);
                    q.push(l.id);
                }
            }
    }
    const L = [...seen]
        .map(i => ({ id: i, ...items.get(i) }))
        .filter(b => b.title)
        .sort(
            (a, b) =>
                (a.year || 0) - (b.year || 0) ||
                String(a.season || "").localeCompare(String(b.season || "")) ||
                titleOf(a).localeCompare(titleOf(b))
        );
    // follow the prequel → sequel links so seasons come out in watching order, even when two aired the same year
    const inSet = new Set(L.map(b => b.id)),
        link = (b, t) => ((b.links || []).find(l => l.type === t && inSet.has(l.id)) || {}).id;
    const out = [],
        used = new Set();
    for (const root of L.filter(b => !link(b, "prequel"))) {
        let x = root;
        while (x && !used.has(x.id)) {
            used.add(x.id);
            out.push(x);
            const n = link(x, "sequel");
            x = n && L.find(b => b.id === n);
        }
    }
    return [...out, ...L.filter(b => !used.has(b.id))];
}
// the seasons of a show: your combined entries, AniList's sequel links, and releases named like seasons of it
const seasonStem = t => {
    let x = norm(cleanTitle(t)),
        y;
    do {
        y = x;
        x = x
            .replace(/\s+(?:the\s+)?final\s+season(?:\s+part\s+\d+)?$/, "")
            .replace(/\s+(?:season|part|cour)\s+\d+$/, "")
            .replace(/\s+\d+(?:st|nd|rd|th)\s+season$/, "")
            .replace(/\s+(?:\d{1,2}|ii|iii|iv|v|vi)$/, "")
            .trim();
    } while (x !== y && x.length > 2);
    return x;
};
const isSeasonish = b => b && b.medium === "anime" && !["Movie", "Special", "Music"].includes(b.kind);
const SEASON_ORD = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
const seasonSort = (a, b) =>
    (a.year || 9999) - (b.year || 9999) ||
    (SEASON_ORD[String(a.season || "").toUpperCase()] ?? 4) - (SEASON_ORD[String(b.season || "").toUpperCase()] ?? 4) ||
    String(cleanTitle(titleOf(a))).localeCompare(String(cleanTitle(titleOf(b))), undefined, { numeric: true });
function seasonChain(id) {
    const b = items.get(id),
        root = b && b.partOf && items.has(b.partOf) ? b.partOf : id,
        ids = new Set();
    const addChain = x => {
        for (const y of animeChain(x))
            if (!ids.has(y.id)) {
                ids.add(y.id);
                for (const p of partsOf(items.get(y.id))) ids.add(p);
            }
    };
    ids.add(root);
    for (const p of partsOf(items.get(root))) ids.add(p);
    addChain(root);
    // releases titled as later seasons that AniList's links in your library don't reach (Bungo Stray Dogs 4 and 5)
    const stems = new Set([...ids].map(i => seasonStem(items.get(i).title)));
    for (const [i, x] of items)
        if (!ids.has(i) && isSeasonish(x) && stems.has(seasonStem(x.title))) {
            ids.add(i);
            addChain(i);
        }
    const L = [...ids].map(i => ({ id: i, ...items.get(i) })).filter(isSeasonish);
    return L.length > 1 ? L.sort(seasonSort) : animeChain(root);
}
function commonName(list) {
    const T = list.map(b => cleanTitle(titleOf(b)));
    let p = T[0] || "";
    for (const t of T) while (p && !t.startsWith(p)) p = p.slice(0, -1);
    return (p.replace(/[\s:\-–—]+$/, "").trim().length > 2 ? p.replace(/[\s:\-–—]+$/, "").trim() : T[0]) || "";
}
function serversHTML() {
    const S = meta.settings.servers || [];
    return `<section class="panel wservers"><h3>Your media servers<span class="r"><button class="btn sm ghost" data-act="watch-servers">Done</button></span></h3>${libsPanelHTML()}
    <details class="wpat"${S.length ? " open" : ""}><summary>Link patterns <span class="advtag">advanced</span></summary><p class="hint">On your own network or a server you've added. For files at predictable addresses. Fill-ins: <code>{title}</code> <code>{stitle}</code> (the season's own title) <code>{year}</code> <code>{season}</code> <code>{episode}</code> <code>{s2}</code> <code>{e2}</code> (two digits) <code>{abs}</code> (episode number across every season).</p>
    ${S.map((s, i) => `<div class="srvrow"><input type="checkbox" data-srv="${i}" data-f="on" ${s.on !== false ? "checked" : ""} aria-label="Use this server"><input class="inp" data-srv="${i}" data-f="name" value="${esc(s.name || "")}" placeholder="Name" style="width:130px"><input class="inp" data-srv="${i}" data-f="pattern" value="${esc(s.pattern || "")}" placeholder="http://nas.local/videos/{title}/Season {season}/{title} S{s2}E{e2}.mp4" style="flex:1"><button class="btn sm ghost" data-act="srv-up" data-k="${i}" ${i ? "" : "disabled"} aria-label="Try earlier">↑</button><button class="btn sm ghost" data-act="srv-del" data-k="${i}" aria-label="Remove">✕</button></div>`).join("")}
    <div class="bar"><button class="btn sm" data-act="srv-add">+ Server</button><span class="hint">Tried in order after your servers; if one can't play an episode, the next is tried.</span></div></details></section>`;
}
// ----- one show -----
// the library entry for a season, with its id (entries are stored without one, so buttons that open or change it need it added)
const seasonItem = si => {
    const S = W.seasons[si],
        b = S && S.member && items.get(S.member);
    return b ? { ...b, id: S.member } : null;
};
function srcKey(si, e) {
    const s = W.show;
    return s.medium === "film" ? "film" : s.groupId ? "E" + e : "S" + W.seasons[si].n + "E" + e;
}
function epWatched(si, e) {
    const b = seasonItem(si);
    if (!b) return false;
    if (W.show.medium === "film") return b.status === "done";
    if (W.show.medium === "anime") return (b.prog || 0) >= e;
    return (b.epsSeen || []).includes(W.seasons[si].n + "x" + e);
}
function epHasSource(si, e) {
    return !!(
        W.files.get(si + ":" + e) ||
        (W.lib && W.lib.has(si + ":" + e)) ||
        savedLink(si, e) ||
        servers().length ||
        ssList().length
    );
}
// how the show page looks: thumbnails and episode descriptions are off unless you want them; sections in the order you choose
const WP_DEF = {
    eps: "numbers",
    thumbs: true,
    desc: true,
    about: true,
    order: ["about", "seasons", "eps"],
    place: { about: "side", seasons: "side", eps: "side" },
    tools: null,
    off: [],
};
const WP_NAMES = { about: "Description", seasons: "Seasons", eps: "Episodes" };
// every button the bar under the player can hold, in its default order
const TOOLS = [
    ["play", "Play / pause"],
    ["prev", "Previous episode"],
    ["back", "Jump back"],
    ["fwd", "Jump forward"],
    ["skip", "Skip intro"],
    ["time", "Time"],
    ["vol", "Volume"],
    ["ep", "Which episode"],
    ["gap", "Space"],
    ["src", "Source"],
    ["subs", "Subtitles"],
    ["speed", "Speed"],
    ["pip", "Picture in picture"],
    ["full", "Full screen"],
    ["cinema", "Cinema mode"],
    ["lights", "Lights"],
    ["settings", "Player settings"],
    ["mark", "Watched"],
    ["next", "Next episode"],
];
const WP = () => {
    const p = { ...WP_DEF, ...(meta.settings.watchPage || {}) };
    p.order = [...new Set([...(p.order || []).filter(k => WP_DEF.order.includes(k)), ...WP_DEF.order])];
    p.place = {
        ...WP_DEF.place,
        ...(p.where === "below" ? { about: "main", seasons: "main", eps: "main" } : {}),
        ...(p.place || {}),
    };
    // your order, with any button added since slotted in where it belongs by default (not piled at the end)
    const mine = [...new Set((p.tools || []).filter(k => TOOLS.some(t => t[0] === k)))],
        all = TOOLS.map(t => t[0]);
    for (const k of all)
        if (!mine.includes(k)) {
            const prev = all
                .slice(0, all.indexOf(k))
                .reverse()
                .find(x => mine.includes(x));
            mine.splice(prev ? mine.indexOf(prev) + 1 : 0, 0, k);
        }
    p.tools = mine;
    p.off = p.off || [];
    return p;
};
const wpSave = p => {
    const { where, ...rest } = p;
    meta.settings.watchPage = rest;
    markDirty();
};
function wpOptsHTML() {
    const p = WP(),
        mv = (act, k, i, n) =>
            `<button class="cb" data-act="${act}" data-k="${k}" data-d="-1" ${i ? "" : "disabled"} aria-label="Earlier">↑</button><button class="cb" data-act="${act}" data-k="${k}" data-d="1" ${i < n - 1 ? "" : "disabled"} aria-label="Later">↓</button>`;
    return `<div class="wpopts panel" role="dialog" aria-label="Customise this page"><div class="wpo-h"><b>This page</b><button class="cb" data-act="wp-opts" aria-label="Close">✕</button></div>
    <div class="wpo-grid"><div>
      <p class="ilab">Episodes</p><div class="seg">${[
          ["numbers", "Numbers"],
          ["detailed", "Detailed"],
      ]
          .map(([k, l]) => `<button data-act="wp-eps" data-k="${k}" aria-pressed="${p.eps === k}">${l}</button>`)
          .join("")}</div>
      ${p.eps === "detailed" ? `<label class="ctl"><input type="checkbox" data-wp="thumbs" ${p.thumbs ? "checked" : ""}> Pictures</label><label class="ctl"><input type="checkbox" data-wp="desc" ${p.desc ? "checked" : ""}> Episode descriptions</label>` : ""}
      <p class="ilab">Blocks</p>${p.order
          .map(
              (k, i) =>
                  `<div class="wpo"><span>${WP_NAMES[k]}</span><div class="seg sm">${[
                      ["main", "Under"],
                      ["side", "Side"],
                      ["off", "Off"],
                  ]
                      .map(
                          ([v, l]) =>
                              `<button data-act="wp-place" data-k="${k}" data-v="${v}" aria-pressed="${(k === "about" && !p.about ? "off" : p.place[k]) === v}">${l}</button>`
                      )
                      .join("")}</div>${mv("wp-move", k, i, p.order.length)}</div>`
          )
          .join("")}
      <p class="ilab">Page</p>
      <div class="wpo-row"><span>Sequels</span>${selOf(
          "",
          [
              ["together", "Together, as seasons"],
              ["separate", "Each on its own"],
          ],
          meta.settings.seasonsMode === "separate" ? "separate" : "together",
          'data-seasonsmode="1"'
      )}</div>
    </div><div>
      <p class="ilab">Buttons <button class="btn sm" data-act="wp-edit" style="margin-left:8px">Edit on the page…</button></p><div class="wpo-tools">${p.tools
          .map(
              (k, i) =>
                  `<div class="wpo"><span>${esc((TOOLS.find(t => t[0] === k) || [])[1])}</span><div class="seg sm">${[
                      ["video", "On video"],
                      ["under", "Under"],
                      ["off", "Hidden"],
                  ]
                      .map(
                          ([v, l]) =>
                              `<button data-act="wp-spot" data-k="${k}" data-v="${v}" aria-pressed="${spotOf(p, k) === v}">${l}</button>`
                      )
                      .join("")}</div>${mv("wp-tool", k, i, p.tools.length)}</div>`
          )
          .join("")}</div>
      <button class="linkbtn" data-act="wp-reset">Put everything back</button>
    </div></div></div>`;
}
function watchShowHTML() {
    const s = W.show,
        S = W.seasons[W.si] || { eps: [] },
        b = seasonItem(W.si),
        grouped = !!s.groupId,
        P = loadPos(),
        wp = WP();
    const name = grouped ? ((meta.watchGroups || {})[s.groupId] || {}).name || s.title : s.title;
    const list = S.eps || [];
    const parts = {};
    parts.head = `<div class="wshow${grouped ? " textonly" : ""}" style="${grouped ? "" : `--wb:url('${esc(coverCache.src(s.banner || s.cover || "")).replace(/'/g, "%27")}')`}"><div class="wshade"></div>
      <div class="wsh">${!grouped && s.cover ? `<img class="wposter" src="${esc(coverCache.src(s.cover))}" alt="" referrerpolicy="no-referrer">` : ""}<div><p class="eyebrow">${esc([MEDIA[s.medium].one, grouped ? plural(W.seasons.length, "season") : s.year, s.creator].filter(Boolean).join(" · "))}</p>
        ${grouped ? `<h2><input class="h2in wname" id="wg-name" value="${esc(name)}" aria-label="Name for these seasons together"></h2>` : `<h2>${esc(name)}</h2>`}
        ${!grouped && s.about && wp.about ? `<p class="wabout">${esc(s.about.slice(0, 420))}</p>` : ""}
        <div class="bar">${b ? `<span class="pill ${b.status}">${esc(statusWord(b.status, s.medium))}</span><button class="btn sm ghost" data-act="open" data-id="${esc(b.id)}">Open card</button>` : `<button class="btn sm gold" data-act="watch-add">+ Add to my list</button>`}
          <button class="btn sm" data-act="watch-files">${s.medium === "film" ? "Choose the file…" : "Add a folder of episodes…"}</button><button class="btn sm" data-act="ss-open" title="Links and addresses just for this series">Servers${ssList().length ? " · " + ssList().length : ""}</button>${grouped ? `<button class="btn sm ghost" data-act="wg-split">Show seasons separately</button>` : ""}</div>
        ${W.libNote ? `<p class="wlib${W.libMiss ? " miss" : ""}">${W.libMiss ? "" : "● "}${esc(W.libNote)} ${LIBS().length ? `<button class="linkbtn" data-act="lib-pick-open">${W.libMiss ? "Pick it…" : "Not the right one?"}</button>` : ""}</p>` : ""}</div></div></div>
    ${libPickHTML()}`;
    parts.seasons = `${W.seasons.length > 1 ? `<div class="chips wseasons">${W.seasons.map((x, i) => `<button class="chip" data-act="watch-season" data-k="${i}" aria-pressed="${i === W.si}">${esc(x.label)} <span class="cn">${x.eps ? x.eps.filter(e => epWatched(i, e.e)).length : (seasonItem(i) || {}).prog || 0}/${(x.eps || []).length || (seasonItem(i) || {}).total || "?"}</span></button>`).join("")}</div>` : ""}
`;
    parts.eps = `${S.loading ? `<p class="think">Loading episodes…</p>` : ""}
    <div class="weps">${
        list
            .map(e => {
                const pos = P[posKey(W.si, e.e)],
                    seen = epWatched(W.si, e.e);
                const img = e.image || (W.libImg && W.libImg.get(W.si + ":" + e.e));
                return `<div class="wep${seen ? " seen" : ""}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="wnum">${e.e}</span>`}
      <div class="wet">${s.medium === "film" ? `<b>${esc(s.title)}</b>` : img ? `<b>${e.e}. ${esc(e.title || "Episode " + e.e)}</b>` : e.title && !/^Episode \d+$/i.test(e.title) ? `<b>${esc(e.title)}</b>` : ""}<small>${esc([e.date ? fmtDate(e.date) : "", e.runtime ? e.runtime + " min" : "", pos && !seen ? "stopped at " + Math.floor(pos / 60) + " min" : ""].filter(Boolean).join(" · "))}</small>${e.about ? `<p class="hint">${esc(e.about.slice(0, 160))}</p>` : ""}</div>
      <div class="wea">${epHasSource(W.si, e.e) ? `<button class="btn sm gold" data-act="watch-play" data-s="${W.si}" data-k="${e.e}">${ICON.play} ${pos && !seen ? "Resume" : "Play"}</button>` : ""}<button class="btn sm ghost" data-act="watch-src" data-s="${W.si}" data-k="${e.e}" title="Add a file or link for just this episode">${epHasSource(W.si, e.e) ? "⋯" : "Add source"}</button>
        <button class="btn sm ghost" data-act="watch-mark" data-s="${W.si}" data-k="${e.e}" aria-pressed="${seen}" title="${seen ? "Watched" : "Mark watched"}">${seen ? "✓" : "○"}</button></div></div>`;
            })
            .join("") || (S.loading ? "" : `<p class="hint">No episode list for this season.</p>`)
    }</div>`;
    return parts.head + parts.seasons + parts.eps;
}
async function loadWatchSeason(si) {
    const S = W.seasons[si];
    if (!S || S.eps || S.loading) return;
    S.loading = true;
    if (ui.page === "watch") renderMain();
    const b = S.member && items.get(S.member),
        ext = (b && b.ext) || S.ext || {};
    let n = (b && b.total) || S.total || 0,
        thumbs = [];
    if (ext.anilist) {
        try {
            const d = await alEpisodes(ext.anilist);
            n = d.total || n;
            thumbs = d.eps || [];
            if (b && d.links.length) quietPatch(b.id, { streams: d.links });
        } catch (_) {}
    }
    const nums = thumbs.map(t => parseInt((/(\d+)/.exec(t.title) || [])[1], 10)).filter(n => n > 0),
        off =
            nums.length && Math.min(...nums) > 1 && Math.max(...nums) - Math.min(...nums) < (n || 999)
                ? Math.min(...nums) - 1
                : 0;
    const byNum = new Map(thumbs.map(t => [parseInt((/(\d+)/.exec(t.title) || [])[1], 10) - off, t]));
    S.eps = Array.from({ length: Math.min(3000, n || thumbs.length || 12) }, (_, i) => {
        const t = byNum.get(i + 1);
        return {
            e: i + 1,
            title: t ? t.title.replace(/^Episode \d+\s*[-:–]\s*/i, "") : "",
            image: t ? t.thumbnail : "",
        };
    });
    if (W.show && W.show.medium === "anime") await tvFill(si);
    S.loading = false;
    if (ui.page === "watch") renderMain();
    cinSideRedraw();
}
// anime: AniList has the episode count, TVmaze has titles, pictures and descriptions for most shows. Line them up by
// position across the whole series (season 2 of an anime is TVmaze's episodes 13 onwards when season 1 had 12)
async function tvFill(si) {
    const S = W.seasons[si],
        sh = W.show;
    if (!S || !S.eps || !sh) return;
    try {
        if (!W.tv || W.tv.key !== (sh.groupId || sh.id || sh.title)) {
            const key = sh.groupId || sh.id || sh.title,
                first = W.seasons[0] && W.seasons[0].member && items.get(W.seasons[0].member),
                base = first || sh;
            let id = (base.ext || {}).tvmaze || (sh.ext || {}).tvmaze;
            if (!id) {
                const names = [
                    ...new Set(
                        [
                            sh.groupId ? ((meta.watchGroups || {})[sh.groupId] || {}).name : "",
                            base.alt && base.alt.en,
                            cleanTitle(base.title),
                            cleanTitle(sh.title),
                        ].filter(Boolean)
                    ),
                ];
                for (const q of names) {
                    const R = (await tvmazeSearch(q).catch(() => [])).filter(
                        r =>
                            /anime|animation/i.test((r.genres || []).join(" ") + " " + (r.kind || "")) ||
                            r.medium === "anime" ||
                            r.lang === "Japanese"
                    );
                    const r = pickShow(R.length ? R : await tvmazeSearch(q).catch(() => []), {
                        title: q,
                        year: base.year,
                    });
                    if (r) {
                        id = r.ext.tvmaze;
                        break;
                    }
                }
            }
            W.tv = {
                key,
                eps: id
                    ? (await tvmazeEpisodes(id))
                          .filter(e => e.e != null && e.s > 0)
                          .sort((a, b) => a.s - b.s || a.e - b.e)
                    : [],
            };
        }
        const T = W.tv.eps;
        if (!T.length) return;
        // where this season starts in TVmaze's list
        let off = 0;
        for (let i = 0; i < si; i++) {
            const P = W.seasons[i];
            off += (P.eps && P.eps.length) || P.total || ((P.member && items.get(P.member)) || {}).total || 0;
        }
        if (W.seasons.length === 1) off = 0;
        S.eps.forEach((e, i) => {
            const t = T[off + i];
            if (!t) return;
            if (!e.title || /^Episode \d+$/i.test(e.title)) e.title = t.title || e.title;
            if (!e.image) e.image = t.image;
            if (!e.about) e.about = t.about;
            if (!e.date) e.date = t.date;
            if (!e.runtime) e.runtime = t.runtime;
        });
    } catch (_) {}
}
async function watchOpen(show, opts = { play: true }) {
    const lib =
        show.id && items.has(show.id) ? show.id : findExisting(show.title, show.creator || "", show.medium, show.ext);
    W.show = { ...show, id: lib || null };
    W.view = "show";
    W.seasons = [];
    W.si = 0;
    W.err = "";
    window.scrollTo(0, 0);
    W.lib = new Map();
    W.libImg = new Map();
    W.libNote = "";
    W.libMiss = false;
    ui.libPick = null;
    W.files = new Map();
    W.tv = null;
    if (opts.play) {
        W.player = {
            loading: true,
            show: cleanTitle(show.title),
            title: show.title,
            film: show.medium === "film",
            si: 0,
            e: show.medium === "film" ? null : 1,
            srcs: [],
            k: 0,
        };
        renderPlayer();
    }
    if (show.medium === "film") {
        W.seasons = [{ n: 1, label: "Film", member: lib, eps: [{ e: 1, title: show.title, runtime: show.runtime }] }];
        renderMain();
        await libMatchShow();
        if (opts.play) watchAutoPlay();
        return;
    }
    if (show.medium === "anime") {
        const chain = lib && meta.settings.seasonsMode !== "separate" ? seasonChain(lib) : [];
        if (chain.length > 1) {
            const gid = "g-" + chain[0].id;
            meta.watchGroups = meta.watchGroups || {};
            if (!meta.watchGroups[gid]) {
                meta.watchGroups[gid] = { name: commonName(chain) };
                markDirty();
            }
            W.show.groupId = gid;
            W.show.title = meta.watchGroups[gid].name;
            W.seasons = chain.map((x, i) => ({
                n: i + 1,
                label: cleanTitle(titleOf(x)),
                member: x.id,
                title: titleOf(x),
            }));
            W.si = Math.max(
                0,
                chain.findIndex(x => x.id === lib && x.status !== "done") >= 0
                    ? chain.findIndex(x => x.id === lib)
                    : chain.findIndex(x => x.status !== "done")
            );
        } else
            W.seasons = [
                {
                    n: 1,
                    label: cleanTitle(titleOf(show)),
                    title: titleOf(show),
                    member: lib,
                    ext: show.ext,
                    total: show.total,
                },
            ];
        renderMain();
        await Promise.all([loadWatchSeason(W.si), alMoreSeasons(lib, show)]);
        await libMatchShow();
        if (opts.play) watchAutoPlay();
        return;
    }
    W.busy = true;
    renderMain();
    try {
        let id = show.ext && show.ext.tvmaze;
        if (!id && show.ext && show.ext.imdb) {
            const t = await tvmazeByImdb(show.ext.imdb);
            id = t && t.ext.tvmaze;
        }
        if (!id) {
            const r = (await tvmazeSearch(cleanTitle(show.title)))[0];
            id = r && r.ext.tvmaze;
        }
        if (id) {
            const eps = await tvmazeEpisodes(id);
            const by = {},
                seenE = new Set();
            for (const e of eps) {
                const k = e.s + "x" + e.e;
                if (e.e == null || seenE.has(k)) continue;
                seenE.add(k);
                (by[e.s] = by[e.s] || []).push(e);
            }
            W.seasons = Object.keys(by)
                .map(Number)
                .sort((a, b) => a - b)
                .map(s => ({ n: s, label: "Season " + s, member: lib, eps: by[s] }));
            if (lib)
                W.si = Math.max(
                    0,
                    W.seasons.findIndex((x, i) => x.eps.some(e => !epWatched(i, e.e)))
                );
        }
    } catch (_) {
        W.err = "Couldn't load the episodes.";
    }
    if (!W.seasons.length) W.seasons = [{ n: 1, label: "Season 1", member: lib, eps: [] }];
    W.busy = false;
    if (ui.page === "watch") renderMain();
    await libMatchShow();
    if (opts.play) watchAutoPlay();
}
// the seasons you haven't added yet: AniList's sequel and prequel chain (Bungo Stray Dogs 4 and 5 when your library stops at 3)
async function alMoreSeasons(lib, show) {
    if (meta.settings.seasonsMode === "separate") return;
    const start =
        W.seasons.map(S => S.member && (items.get(S.member).ext || {}).anilist).find(Boolean) ||
        (show.ext || {}).anilist;
    if (!start) return;
    const want = new Set(["TV", "TV_SHORT", "ONA"]),
        seen = new Map(),
        q = [Number(start)];
    let calls = 0;
    try {
        while (q.length && calls < 10) {
            const id = q.shift();
            if (seen.has(id)) continue;
            calls++;
            const d = await AL.q(
                `query($id:Int){ Media(id:$id){ id format episodes seasonYear season title { romaji english } relations { edges { relationType node { id format type } } } } }`,
                { id },
                undefined,
                0,
                true
            );
            const m = d && d.Media;
            if (!m) continue;
            seen.set(id, m);
            for (const e of (m.relations || {}).edges || [])
                if (
                    ["SEQUEL", "PREQUEL"].includes(e.relationType) &&
                    e.node.type === "ANIME" &&
                    want.has(e.node.format) &&
                    !seen.has(e.node.id)
                )
                    q.push(e.node.id);
        }
    } catch (_) {
        return;
    }
    if (!W.show || seen.size < 2) return;
    const have = new Set(
        W.seasons.map(S => String(S.member ? (items.get(S.member).ext || {}).anilist : (S.ext || {}).anilist))
    );
    const add = [...seen.values()].filter(
        m => want.has(m.format) && !have.has(String(m.id)) && (m.format !== "ONA" || !m.episodes || m.episodes >= 6)
    );
    if (!add.length) return;
    const lang = meta.settings.titleLang === "romaji" ? "romaji" : "english",
        cur = W.seasons[W.si];
    const all2 = [
        ...W.seasons.map(S => ({
            S,
            year: S.member ? items.get(S.member).year : S.year,
            season: S.member ? items.get(S.member).season : S.season,
            t: S.label,
        })),
        ...add.map(m => ({
            S: {
                n: 0,
                label: m.title[lang] || m.title.romaji || m.title.english,
                title: m.title[lang] || m.title.romaji,
                member: null,
                ext: { anilist: m.id },
                total: m.episodes,
                year: m.seasonYear,
                season: m.season,
                notInLib: true,
            },
            year: m.seasonYear,
            season: m.season,
            t: m.title.romaji,
        })),
    ];
    all2.sort(
        (a, b) =>
            (a.year || 9999) - (b.year || 9999) ||
            (SEASON_ORD[a.season] ?? 4) - (SEASON_ORD[b.season] ?? 4) ||
            String(a.t).localeCompare(String(b.t), undefined, { numeric: true })
    );
    W.seasons = all2.map((x, i) => ({ ...x.S, n: i + 1 }));
    if (!W.show.groupId) {
        const gid = "g-" + (W.show.id || "x" + start);
        meta.watchGroups = meta.watchGroups || {};
        if (!meta.watchGroups[gid]) {
            meta.watchGroups[gid] = { name: cleanTitle(titleOf(W.show)) };
            markDirty();
        }
        W.show.groupId = gid;
    }
    W.si = Math.max(0, W.seasons.indexOf(cur));
    if (W.player) W.player.si = W.si;
    if (ui.page === "watch") renderMain();
    cinSideRedraw();
}
// opening something lands on its player page: the next episode cued, playing straight away if it's on your servers or in a file you added
async function watchAutoPlay() {
    if (ui.page !== "watch" || !W.show) return;
    // the first season you haven't finished
    const film = W.show.medium === "film",
        done = i => {
            const S = W.seasons[i],
                b = seasonItem(i);
            return S && (S.eps && S.eps.length ? S.eps.every(x => epWatched(i, x.e)) : b && b.status === "done");
        };
    if (!film && done(W.si)) {
        const i = W.seasons.findIndex((_, i) => i > W.si && !done(i));
        if (i > 0) {
            W.si = i;
            await loadWatchSeason(i);
        }
    }
    const S = W.seasons[W.si] || { eps: [] };
    const e = film ? 1 : ((S.eps || []).find(x => !epWatched(W.si, x.e)) || (S.eps || [])[0] || { e: 1 }).e;
    watchStart(W.si, e, { empty: true });
}
function watchFromItem(id) {
    const b = items.get(id);
    if (!b) return;
    if (!stageOn()) {
        stageOffNote();
        return;
    }
    closeCtx();
    closeModal();
    ui.page = "watch";
    render();
    watchOpen({ id, ...b });
}
// ----- sources -----
function fillPattern(p, si, e) {
    const S = W.seasons[si],
        abs = W.seasons.slice(0, si).reduce((a, x) => a + ((x.eps || []).length || 0), 0) + e,
        pad = n => String(n).padStart(2, "0");
    const title =
            (W.show.groupId ? ((meta.watchGroups || {})[W.show.groupId] || {}).name : null) || cleanTitle(W.show.title),
        stitle = S && S.title ? cleanTitle(S.title) : title;
    return p
        .replace(/\{title\}/g, encodeURIComponent(title).replace(/%20/g, " "))
        .replace(/\{stitle\}/g, encodeURIComponent(stitle).replace(/%20/g, " "))
        .replace(/\{year\}/g, W.show.year || "")
        .replace(/\{season\}/g, S ? S.n : 1)
        .replace(/\{episode\}/g, e)
        .replace(/\{s2\}/g, pad(S ? S.n : 1))
        .replace(/\{e2\}/g, pad(e))
        .replace(/\{abs\}/g, abs)
        .replace(/ /g, "%20");
}
function sourcesFor(si, e) {
    const out = [],
        f = W.files.get(si + ":" + e),
        own = savedLink(si, e);
    if (f) out.push(f instanceof Blob ? { name: "Your file", file: f } : { name: "Your link", url: f.url });
    if (own) out.push({ name: "Saved link", url: own.url });
    for (const x of (W.lib && W.lib.get(si + ":" + e)) || []) out.push(x);
    out.push(...ssSources(si, e)); // this series' own servers
    for (const s of servers()) out.push({ name: s.name || "Server", url: fillPattern(s.pattern, si, e) });
    return out.filter(isOwnSource); // only your own (own-sources.js)
}
function watchSetSource(si, e, val) {
    if (val.file) {
        W.files.set(si + ":" + e, val.file);
        renderMain();
        cinRefreshIfEmpty();
        return;
    }
    const b = seasonItem(si);
    if (!b) {
        W.files.set(si + ":" + e, { url: val.url });
        toast("Add it to your list to keep this link.");
        renderMain();
        cinRefreshIfEmpty();
        return;
    }
    quietPatch(b.id, { sources: { ...(b.sources || {}), [srcKey(si, e)]: { url: val.url, at: nowISO() } } });
    scheduleSave();
    renderMain();
    cinRefreshIfEmpty();
}
function watchPickFiles() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "video/*,.mkv,.mp4,.webm,.m4v,.mov";
    inp.multiple = true;
    inp.onchange = () => {
        const F = [...inp.files];
        if (!F.length) return;
        let n = 0;
        if (!W.show) {
            playFile(F[0]);
            return;
        }
        if (W.show.medium === "film") {
            W.files.set("0:1", F[0]);
            n = 1;
        } else
            F.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).forEach((f, i) => {
                const p = parseEp(f.name),
                    si =
                        p && p[0]
                            ? Math.max(
                                  0,
                                  W.seasons.findIndex(x => x.n === p[0])
                              )
                            : W.si;
                W.files.set(si + ":" + (p ? p[1] : i + 1), f);
                n++;
            });
        toast(`Matched ${plural(n, "file")} to episodes by their names`);
        renderMain();
        cinRefreshIfEmpty();
    };
    inp.click();
}
function playFile(f) {
    W.player = { title: f.name, srcs: [{ name: "Your file", file: f }], k: 0, single: true };
    renderPlayer();
}
// ----- the cinema -----
function watchStart(si, e, o = {}) {
    const L = sourcesFor(si, e);
    if (!L.length && !o.empty && !W.player) {
        toast("Add a file, a link or a server first");
        return;
    }
    const s = W.show,
        S = W.seasons[si],
        title =
            s.medium === "film"
                ? s.title
                : `${W.show.groupId ? ((meta.watchGroups || {})[W.show.groupId] || {}).name || s.title : s.title} · ${W.seasons.length > 1 ? S.label + " · " : ""}Episode ${e}`;
    const show =
            s.medium === "film"
                ? s.title
                : W.show.groupId
                  ? ((meta.watchGroups || {})[W.show.groupId] || {}).name || s.title
                  : s.title,
        ep = e != null && ((S && S.eps) || []).find(x => x.e === e);
    W.player = {
        title,
        show,
        epTitle: ep && ep.title && !/^Episode \d+$/i.test(ep.title) ? ep.title : "",
        film: s.medium === "film",
        si,
        e,
        srcs: L,
        k: 0,
        marked: epWatched(si, e),
    };
    {
        const pi = srvPreferred(W.player);
        if (pi > 0) W.player.k = pi;
    }
    renderPlayer();
    if (typeof extAddSources === "function") extAddSources(W.player);
}
function renderPlayer() {
    let el = $("#cinema");
    const p = W.player,
        o = PS();
    if (!p) {
        if (el) {
            const v = el.querySelector("video");
            if (v && v._hls) hlsStop(v);
            if (v) {
                if (p !== undefined && W.lastKey) savePos(W.lastKey, v.currentTime);
                v.pause();
                v.removeAttribute("src");
                v.load();
            }
            el.remove();
        }
        document.body.classList.remove("cinema-on");
        if (W.pageStale && ui.page === "watch") renderMain();
        return;
    }
    if (!el) {
        el = document.createElement("div");
        el.id = "cinema";
        document.body.append(el);
    }
    const old = el.querySelector("video");
    if (old && old._hls) hlsStop(old);
    if (old) {
        W.vol = W.vol || { muted: false, last: 0.6 };
        W.vol.muted = old.muted;
        if (old.volume > 0.02) W.vol.last = old.volume;
    } // what you set on the outgoing video carries to the next
    document.body.classList.add("cinema-on");
    const src = p.srcs[p.k] || {},
        refused = !!src.url && !src.file && !isOwnSource(src); // the last check, right before anything plays (own-sources.js)
    // a converted stream can't seek, so it starts where you are: the time goes into its link and the player counts from there
    if (src.how === "converted" && !src.file) {
        const k0 = p.e != null ? posKey(p.si, p.e) : null,
            at0 = p.keepAt || (k0 && PS().resume && loadPos()[k0]) || 0;
        p.offset = Math.max(0, Math.floor(at0));
    } else p.offset = 0;
    if ((src.info || src.url) !== p.subFor) {
        p.subFor = src.info || src.url;
        p.subList = [];
        p.subPick = undefined;
    }
    const url = refused
            ? ""
            : src.file
              ? (src.obj = src.obj || URL.createObjectURL(src.file))
              : src.how === "converted" && p.offset
                ? src.url + (src.url.includes("?") ? "&" : "?") + "t=" + p.offset
                : src.url,
        yt = url && /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url);
    const hasNext =
        (p.e != null && W.seasons.length && (W.seasons[p.si].eps || []).some(x => x.e === p.e + 1)) ||
        W.seasons[p.si + 1];
    const lay = !url ? "docked" : o.layout || "docked";
    el.className = "cin" + (o.hideUI ? " autohide" : "") + " lay-" + lay + (o.lights ? " lights" : "");
    const cb = (act, label, glyph, extra = "") =>
        `<button class="cb" data-act="${act}" title="${esc(label)}" aria-label="${esc(label)}" ${extra}>${glyph}</button>`;
    const epTag =
        p.e != null && !p.film
            ? (W.seasons.length > 1 ? `${esc((W.seasons[p.si] || {}).label || "S" + (p.si + 1))} · ` : "") +
              `Episode ${p.e}`
            : "";
    // the show's name on top; every button under the player (or over it in cinema mode and full screen)
    const showName = esc(cleanTitle(p.show || p.title || "")),
        mark =
            p.e != null
                ? cb(
                      "cin-mark",
                      p.marked ? "Watched (click to undo)" : "Mark watched",
                      p.marked ? "✓" : "○",
                      `aria-pressed="${!!p.marked}"`
                  )
                : "",
        next =
            p.e != null && hasNext
                ? `<button class="cb next" data-act="cin-next" title="Next episode (N)">Next ⏭</button>`
                : "";
    const view = `${cb("cin-lay", lay === "docked" ? "Cinema mode (T)" : "Show the episode list (T)", lay === "docked" ? "▭" : "☰")}${cb("cin-lights", o.lights ? "Lights on (L)" : "Lights off (L)", o.lights ? "☀" : "☾", `aria-pressed="${!!o.lights}"`)}${cb("cin-opts", "Player settings", "⚙", `aria-pressed="${!!p.opts}"`)}`;
    const play = url
        ? `${cb("cin-back", `Back ${o.seek}s (←)`, `−${o.seek}`)}${cb("cin-fwd", `Forward ${o.seek}s (→)`, `+${o.seek}`)}${o.skip ? `<button class="cb wide" data-act="cin-skip" title="Skip intro (S)">Skip intro</button>` : ""}`
        : "";
    const tools = url
        ? `<span class="cin-subpick">${subPickHTML(p)}</span>${cb("cin-subs", "Load subtitles from a file (.srt or .vtt)", "CC")}<select class="cinsel" id="cin-speed" aria-label="Speed" title="Speed">${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(v => `<option value="${v}"${v === +o.speed ? " selected" : ""}>${v}×</option>`).join("")}</select>${cb("cin-pip", "Picture in picture", "⧉")}${cb("cin-full", "Full screen (F)", "⛶")}`
        : "";
    const prev = p.e != null && !p.film ? cb("cin-prev", "Previous episode", "⏮") : "",
        stage = `<div class="cin-stage">${!url ? cinEmptyHTML(p) : yt ? `<iframe src="https://www.youtube-nocookie.com/embed/${esc(yt[1])}?autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>` : `<video ${isHLS(url) ? "" : `src="${esc(url || "")}"`} ${customControls() ? "" : "controls"} ${src.info && PS().startMode === "smooth" && p.hold !== false ? "" : "autoplay"} playsinline style="object-fit:${o.fit}"></video>`}</div>`;
    const wp = WP(),
        sh = W.show || {},
        bItem = seasonItem(p.listSi ?? p.si);
    const T = {
        prev,
        back: url ? cb("cin-back", `Back ${o.seek}s (←)`, `−${o.seek}`) : "",
        fwd: url ? cb("cin-fwd", `Forward ${o.seek}s (→)`, `+${o.seek}`) : "",
        skip:
            url && o.skip
                ? `<button class="cb wide" data-act="cin-skip" title="Skip intro (S)">Skip intro</button>`
                : "",
        ep: `<span class="cin-ep">${epTag}${p.epTitle ? " — " + esc(p.epTitle) : ""}</span>`,
        gap: `<span class="spacer"></span>`,
        src: "",
        subs: url
            ? `<span class="cin-subpick">${subPickHTML(p)}</span>` +
              cb("cin-subs", "Load subtitles from a file (.srt or .vtt)", "CC")
            : "",
        speed: url
            ? `<select class="cinsel" id="cin-speed" aria-label="Speed" title="Speed">${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(v => `<option value="${v}"${v === +o.speed ? " selected" : ""}>${v}×</option>`).join("")}</select>`
            : "",
        pip: url ? cb("cin-pip", "Picture in picture", "⧉") : "",
        full: url ? cb("cin-full", "Full screen (F)", "⛶") : "",
        cinema: cb("cin-lay", "Cinema mode (T)", "▭"),
        lights: cb(
            "cin-lights",
            o.lights ? "Lights on (L)" : "Lights off (L)",
            o.lights ? "☀" : "☾",
            `aria-pressed="${!!o.lights}"`
        ),
        settings: cb("cin-opts", "Player settings", "⚙", `aria-pressed="${!!p.opts}"`),
        mark,
        next,
        ...(url ? pcTools(o) : {}),
    };
    const custom = customControls() && url && !yt;
    const bar = wp.tools
            .filter(k => !wp.off.includes(k))
            .map(k => T[k] || "")
            .join(""),
        side = lay === "docked" ? cinSideHTML(p) : "";
    if (lay === "docked" && !side) el.className += " noside";
    el.innerHTML =
        lay === "docked"
            ? `<div class="cin-col"><div class="cin-head">${cb("cin-close", "Back (Esc)", "←")}<b>${showName}</b><span class="spacer"></span>${srvStrip(p)}${bItem ? cb("open", "Open its card", "◫", `data-id="${esc(bItem.id)}"`) : sh.title ? `<button class="cb wide" data-act="watch-add" title="Add to my list">+ List</button>` : ""}${cb("wp-opts", "Customise this page", "⋯", `aria-pressed="${!!ui.wpOpts}"`)}</div>
        <div class="cin-main">${stage}${custom ? pcHTML(T, wp, false) : ""}</div><div class="cin-under${custom ? " wz" : ""}" data-zone="under">${custom ? underHTML(T, wp) : bar}</div>${cinMainHTML(p)}</div>${side}${ui.wpOpts ? wpOptsHTML() : ""}`
            : `<div class="cin-main"><div class="cin-top">${cb("cin-close", "Back (Esc)", "←")}<div class="cin-title"><b>${showName}</b>${epTag ? `<small>${epTag}${p.epTitle ? " — " + esc(p.epTitle) : ""}</small>` : ""}</div><span class="spacer"></span>${srvStrip(p)}${view}</div>
        ${stage}${custom ? pcHTML(T, wp, true) : `<div class="cin-bot">${prev}${play}<span class="spacer"></span>${tools}${mark}${next}</div>`}</div>`;
    el.insertAdjacentHTML(
        "beforeend",
        `${p.srcOpen ? `<div class="cin-opts cin-srcs panel"><p class="ilab">Servers for this ${p.film ? "film" : "episode"}</p>${p.srcs.map((x, i) => `<button class="srcrow${i === p.k ? " on" : ""}${(p.failed || []).includes(i) ? " bad" : ""}" data-act="cin-src-pick" data-k="${i}"><span class="dot"></span><span class="sn"><b>Server ${i + 1}</b><small class="srvname">${esc(x.name)}</small><small>${esc([x.how === "adaptive" ? "Adaptive stream" : x.how === "converted" ? "Converted for this browser" : x.how === "original" ? "Original file" : x.file ? "From this computer" : "Link", x.owner ? "from " + x.owner : ""].filter(Boolean).join(" · "))}</small></span>${(p.failed || []).includes(i) ? `<span class="hint">didn't play</span>` : i === p.k ? `<span class="hint">playing</span>` : ""}</button>`).join("")}<p class="hint">If one won't play, the next is tried by itself. Your place is kept when you switch. <button class="linkbtn" data-act="ss-open">Add a server for this series</button></p></div>` : ""}
    ${
        p.opts
            ? `<div class="cin-opts panel">
      <label class="ctl"><input type="checkbox" data-po="autoNext" ${o.autoNext ? "checked" : ""}> Play the next episode automatically</label>
      <label class="ctl"><input type="checkbox" data-po="resume" ${o.resume ? "checked" : ""}> Resume where I stopped</label>
      <label class="ctl"><input type="checkbox" data-po="hideUI" ${o.hideUI ? "checked" : ""}> Hide the controls when I'm not moving the mouse</label>
      <label class="ctl">Skip intro by <input class="inp" data-pon="skip" value="${o.skip}" style="width:56px"> seconds (0 hides it)</label>
      <label class="ctl">Jump by <input class="inp" data-pon="seek" value="${o.seek}" style="width:56px"> seconds</label>
      <label class="ctl">Picture ${selOf(
          "",
          [
              ["contain", "Fit"],
              ["cover", "Fill the screen"],
              ["fill", "Stretch"],
          ],
          o.fit,
          'data-po="fit"'
      )}</label>
      <label class="ctl">Subtitle size <input type="range" min="60" max="200" step="10" data-pon="subSize" value="${o.subSize}"></label>
      <label class="ctl">Subtitles ${selOf("", [["off", "Off unless I pick them"], ...SUB_LANGS], o.subLang, 'data-po="subLang"')}</label>
      <label class="ctl">When a stream is slow ${selOf(
          "",
          [
              ["now", "Start at once (offer to wait if it stops)"],
              ["smooth", "Wait until it won't stop, then start"],
          ],
          o.startMode,
          'data-po="startMode"'
      )}</label>
      <label class="ctl"><input type="checkbox" data-po="netBadge" ${o.netBadge !== false ? "checked" : ""}> Show how much has arrived</label>
      <label class="ctl">Controls ${selOf(
          "",
          [
              ["custom", "UniverList's (buttons on the video, seeks everything)"],
              ["browser", "The browser's own"],
          ],
          o.controls === "browser" ? "browser" : "custom",
          'data-po="controls"'
      )}</label>
      <div class="bar"><button class="btn sm" data-act="wp-edit">Edit the player on the page…</button><button class="btn sm ghost" data-act="open-settings">All settings…</button></div>
      <p class="hint">Keys: space play/pause · ← → jump · ↑ ↓ volume · F full screen · M mute · N next · S skip intro · C subtitles · Esc close</p></div>`
            : ""
    }`
    );
    const v = url ? el.querySelector("video") : null;
    if (v && v.autoplay)
        v.addEventListener(
            "canplay",
            () => {
                if (!v.paused) return;
                // the browser blocked starting with sound (a long wait for a source can do it): start muted rather than sit still, and say so
                v.play().catch(() => {
                    v.muted = true;
                    v.play()
                        .then(() =>
                            toast("Started muted: the browser wouldn't play sound by itself. Press M to unmute.")
                        )
                        .catch(() => {});
                });
            },
            { once: true }
        );
    el.style.setProperty("--subsize", o.subSize + "%");
    if (v) {
        const key = p.e != null ? posKey(p.si, p.e) : null;
        W.lastKey = key;
        // volume and mute survive the player being redrawn (a late source, switching servers); a volume dragged to 0 never leaves you silent after unmuting
        W.vol = W.vol || { muted: false, last: o.volume > 0.02 ? o.volume : 0.6 };
        v.volume = o.volume > 0.02 ? o.volume : W.vol.last;
        v.muted = !!W.vol.muted;
        v.playbackRate = +o.speed || 1;
        if (isHLS(url)) attachHLS(v, url, () => fail());
        v.addEventListener(
            "loadedmetadata",
            () => {
                const fromSaved = !p.keepAt,
                    at = p.keepAt || (key && o.resume && loadPos()[key]);
                p.keepAt = 0;
                if (p.offset) {
                    if (fromSaved && !p.chipShown) {
                        p.chipShown = true;
                        resumeChip(el, p.offset);
                    }
                    return;
                }
                if (at && (!v.duration || at < v.duration - 30)) {
                    v.currentTime = at;
                    if (fromSaved && !p.chipShown) {
                        p.chipShown = true;
                        resumeChip(el, at);
                    }
                }
            },
            { once: true }
        );
        let last = 0;
        v.addEventListener("timeupdate", () => {
            const at = (p.offset || 0) + v.currentTime,
                D = p.dur || v.duration;
            if (key && Date.now() - last > 4000) {
                last = Date.now();
                savePos(key, at);
            }
            if (!p.reached && D && isFinite(D) && at / D > 0.9 && p.e != null) {
                p.reached = true;
                if (!p.marked) {
                    p.marked = true;
                    watchMark(p.si, p.e, true);
                    const b = el.querySelector('[data-act="cin-mark"]');
                    if (b) {
                        b.textContent = "✓";
                        b.setAttribute("aria-pressed", "true");
                    }
                } else {
                    const it = seasonItem(p.si);
                    if (it && it.status === "done") watchMark(p.si, p.e, true);
                }
            }
        });
        v.addEventListener("ended", () => {
            if (key) savePos(key, 0);
            if (o.autoNext && p.e != null && hasNext) upNext(el, p, () => watchStep(1));
        });
        v.addEventListener("volumechange", () => {
            // dragging the volume to 0 means muted; unmuting from there brings the last volume back instead of staying silent
            if (!v.muted && v.volume <= 0.02) {
                if (W.vol.muted) v.volume = W.vol.last;
                else v.muted = true;
                return;
            }
            W.vol.muted = v.muted;
            if (v.volume > 0.02) W.vol.last = v.volume;
            if (v.volume > 0.02 && v.volume !== PS().volume) {
                meta.settings.player = { ...PS(), volume: v.volume };
                markDirty();
            }
        });
        function fail() {
            if (!v.isConnected || W.player !== p) return;
            p.failed = [...new Set([...(p.failed || []), p.k])];
            const next = p.srcs.findIndex((_, i) => !p.failed.includes(i));
            if (next >= 0) {
                p.keepAt = (p.offset || 0) + (v.currentTime || 0) || p.keepAt || 0;
                p.k = next;
                toast(`Trying ${srcLabel(p.srcs[next])}…`);
                renderPlayer();
            } else {
                const n = el.querySelector(".cin-stage");
                if (n && !n.querySelector(".cin-err"))
                    n.insertAdjacentHTML(
                        "beforeend",
                        `<p class="cin-err">None of the servers could play this here. Links need to point straight at a video, or an adaptive stream; some formats (like MKV with certain codecs) only play through a server that converts them, such as Jellyfin or Plex.</p>`
                    );
            }
        }
        v.addEventListener("error", () => {
            if (v.error && v.error.code) fail();
        });
        if (p.subs) {
            const tr = document.createElement("track");
            tr.kind = "subtitles";
            tr.label = "Subtitles";
            tr.src = p.subs;
            tr.default = true;
            v.append(tr);
        }
        if (typeof streamAttach === "function") streamAttach(v, src, p, el);
        if (custom) pcAttach(v, p, el); // subtitles that come with it, how much has arrived, waiting so it won't stop
    }
    pcLook(el);
    el.classList.toggle("editing", !!ui.wpEdit);
    el.classList.toggle("custom", !!custom);
    if (ui.wpEdit) el.insertAdjacentHTML("beforeend", wpEditHTML(wp));
    let idle;
    const wake = () => {
        el.classList.remove("idle");
        clearTimeout(idle);
        idle = setTimeout(() => {
            if (!ui.wpEdit && !(v && v.paused && custom)) el.classList.add("idle");
        }, LOOK().hideAfter * 1000);
    };
    el.onpointermove = wake;
    wake();
    if (v) v.addEventListener("pause", wake);
}
// nothing to play yet: the show's art, which episode is cued, and the ways to add it
function cinEmptyHTML(p) {
    return `<div class="cin-empty"><div class="ce-in">${
        p.loading
            ? `<p class="think">Loading…</p>`
            : `${p.srcs[p.k] && p.srcs[p.k].url && !isOwnSource(p.srcs[p.k]) ? `<p class="hint">${esc(NOT_OWN_SOURCE)}</p>` : W.libNote ? `<p class="hint">${esc(W.libNote)}</p>` : `<p class="hint">Nothing to play yet.</p>`}${p.looking > 0 ? `<p class="think">Still checking your servers…</p>` : ""}
    <div class="ce-a"><button class="btn sm gold" data-act="ws-file" data-s="${p.si}" data-k="${p.e ?? 1}">Upload the file…</button>${p.film ? "" : `<button class="btn sm" data-act="watch-files">A folder of episodes…</button>`}<button class="btn sm ghost" data-act="watch-src" data-s="${p.si}" data-k="${p.e ?? 1}">Paste a link</button><button class="btn sm" data-act="ss-open">Servers for this show${ssList().length ? " · " + ssList().length : ""}</button><button class="btn sm ghost" data-act="cin-servers">Your servers</button></div>`
    }</div></div>`;
}
// beside the player (or under it on a phone): description, seasons and episodes, in the order you set
function cinBlocks(p) {
    const wp = WP(),
        sh = W.show || {},
        li = p.listSi ?? p.si,
        S = W.seasons[li] || { eps: [] },
        b = seasonItem(li),
        P = loadPos();
    const name = sh.groupId
        ? ((meta.watchGroups || {})[sh.groupId] || {}).name || sh.title
        : cleanTitle(sh.title || p.show || p.title || "");
    const headOld = `<div class="cs-h"><b class="cs-meta">${esc([MEDIA[sh.medium] ? MEDIA[sh.medium].one : "", W.seasons.length > 1 ? plural(W.seasons.length, sh.medium === "anime" || sh.groupId ? "part" : "season") : sh.year].filter(Boolean).join(" · "))}</b>${b ? `<button class="cb" data-act="open" data-id="${esc(b.id)}" title="Open its card">◫</button>` : sh.title ? `<button class="cb wide" data-act="watch-add" title="Add to my list">+ List</button>` : ""}<button class="cb" data-act="wp-opts" aria-pressed="${!!ui.wpOpts}" title="Customise this page">⋯</button></div>`;
    const parts = {
        about: wp.about && sh.about ? `<p class="cs-about">${esc(sh.about.slice(0, 700))}</p>` : "",
        seasons:
            W.seasons.length < 2
                ? ""
                : sh.medium === "anime" || sh.groupId
                  ? `<div class="cs-seasons"><select class="sel cs-sel" data-cinseason="1" aria-label="Season">${W.seasons.map((x, i) => `<option value="${i}"${i === li ? " selected" : ""}>${esc(x.title || x.label)}</option>`).join("")}</select></div>`
                  : `<div class="cs-seasons">${W.seasons.map((x, i) => `<button class="chip" data-act="cin-season" data-k="${i}" aria-pressed="${i === li}">${esc(x.label)}</button>`).join("")}</div>`,
        eps:
            p.film || sh.medium === "film"
                ? ""
                : `<div class="cs-epsh"><span class="ilab">Episodes</span><span class="hint">${(S.eps || []).filter(e => epWatched(li, e.e)).length}/${(S.eps || []).length || "?"}</span></div>
      <div class="cs-eps ${wp.eps}">${
          S.loading
              ? `<p class="hint">Loading…</p>`
              : (S.eps || [])
                    .map(e => {
                        const seen = epWatched(li, e.e),
                            on = li === p.si && e.e === p.e,
                            img = wp.thumbs && (e.image || (W.libImg && W.libImg.get(li + ":" + e.e))),
                            pos = P[posKey(li, e.e)];
                        if (wp.eps === "numbers")
                            return `<button class="cs-num${on ? " on" : ""}${seen ? " seen" : ""}${pos && !seen ? " part" : ""}" data-act="cin-ep" data-s="${li}" data-k="${e.e}" title="${esc(e.title || "Episode " + e.e)}">${e.e}</button>`;
                        return `<button class="cs-ep2${on ? " on" : ""}${seen ? " seen" : ""}" data-act="cin-ep" data-s="${li}" data-k="${e.e}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="n">${e.e}</span><span class="tx"><b>${esc(e.title && !/^Episode \d+$/i.test(e.title) ? e.title : "Episode " + e.e)}</b>${wp.desc && e.about ? `<small>${esc(e.about.replace(/<[^>]+>/g, "").slice(0, 150))}</small>` : ""}</span>${seen ? `<span class="ck">✓</span>` : ""}</button>`;
                    })
                    .join("") || `<p class="hint">No episode list.</p>`
      }</div>`,
    };
    const at = where =>
        wp.order
            .filter(k => (k !== "about" || wp.about) && wp.place[k] === where && parts[k])
            .map(k => `<section class="cblk cb-${k}">${parts[k]}</section>`)
            .join("");
    return { main: at("main"), side: at("side") };
}
function cinSideHTML(p) {
    const B = cinBlocks(p);
    return B.side ? `<aside class="cin-side"><div class="cs-body">${B.side}</div></aside>` : "";
}
function cinMainHTML(p) {
    return `<div class="cin-mb">${cinBlocks(p).main}</div>`;
}
function cinSideRedraw() {
    const p = W.player,
        el = $("#cinema");
    if (!p || !el) return;
    const B = cinBlocks(p),
        s = el.querySelector(".cin-side"),
        m = el.querySelector(".cin-mb");
    if (m) m.innerHTML = B.main;
    if (s && B.side) s.innerHTML = `<div class="cs-body">${B.side}</div>`;
    else if (s || B.side) {
        const v = el.querySelector("video");
        if (v) p.keepAt = v.currentTime;
        renderPlayer();
        return;
    }
    el.classList.toggle("noside", !B.side);
    const o = el.querySelector(".wpopts");
    if (ui.wpOpts && !o) el.insertAdjacentHTML("beforeend", wpOptsHTML());
    else if (o) ui.wpOpts ? (o.outerHTML = wpOptsHTML()) : o.remove();
}
// ----- one Servers bar at the top of the player: an icon (what each server is), Server 1 2 3…, and + to add one for this series -----
const SRV_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3.5" y="4" width="17" height="6.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="7.25" r="1.15" fill="currentColor"/><circle cx="7.5" cy="16.75" r="1.15" fill="currentColor"/></svg>`;
const srvDesc = x =>
    [
        x.name || "Source",
        x.how === "converted"
            ? "converted for this browser"
            : x.how === "adaptive"
              ? "adaptive stream"
              : x.file
                ? "from this computer"
                : "",
        x.owner ? "from " + x.owner : "",
    ]
        .filter(Boolean)
        .join(" · ");
function srvStrip(p) {
    const L = (p && p.srcs) || [],
        bad = (p && p.failed) || [];
    return `<div class="cin-srv" role="group" aria-label="Servers"><button class="srv ico" data-act="cin-srcs" aria-expanded="${!!(p && p.srcOpen)}" title="Servers: what each one is">${SRV_ICON}</button>${L.map((x, i) => `<button class="srv${i === p.k ? " on" : ""}${bad.includes(i) ? " bad" : ""}" data-act="cin-src-pick" data-k="${i}" aria-pressed="${i === p.k}" aria-label="Server ${i + 1}" title="Server ${i + 1}: ${esc(srvDesc(x))}${bad.includes(i) ? " (didn't play)" : ""}">${i + 1}</button>`).join("")}${p && p.looking > 0 ? `<span class="srv wait" title="Still checking your servers" aria-label="Still checking your servers"><span class="dots"></span></span>` : ""}<button class="srv add" data-act="ss-open" title="Add a server for this series" aria-label="Add a server for this series">+</button></div>`;
}
// update the bar in place (a server arriving late mustn't restart what's playing)
function srvRefresh(p) {
    const n = $("#cinema .cin-srv");
    if (n && W.player === p) n.outerHTML = srvStrip(p);
}
const srcLabel = x =>
    x ? (x.name || "Source") + (x.how === "adaptive" ? " · stream" : x.how === "converted" ? " · converted" : "") : "";
const isHLS = u => /\.m3u8(\?|$)/i.test(u || "");
// adaptive streams play natively in Safari; elsewhere through hls.js, part of the site, loaded once when first needed
let HLSlib = null;
// stop a stream gently: let anything still in flight finish before it's torn down
function hlsStop(v) {
    const h = v && v._hls;
    if (!h) return;
    v._hls = null;
    try {
        h.stopLoad();
        h.detachMedia();
    } catch (_) {}
    setTimeout(() => {
        try {
            h.destroy();
        } catch (_) {}
    }, 1500);
}
async function attachHLS(v, url, onFail) {
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = url;
        return;
    }
    try {
        if (!HLSlib) HLSlib = await window.ulHls();
        if (!HLSlib || !HLSlib.isSupported()) return onFail();
        const h = new HLSlib({ maxBufferLength: 60 });
        h.loadSource(url);
        h.attachMedia(v);
        v._hls = h;
        h.on(HLSlib.Events.ERROR, (_, d) => {
            if (d.fatal) {
                hlsStop(v);
                onFail();
            }
        });
    } catch (_) {
        onFail();
    }
}
function watchStep(d) {
    const p = W.player;
    if (!p || p.e == null) return;
    let si = p.si,
        e = p.e + d;
    const S = W.seasons[si];
    if (!(S.eps || []).some(x => x.e === e)) {
        if (d > 0 && W.seasons[si + 1]) {
            si++;
            e = 1;
            loadWatchSeason(si);
        } else if (d < 0 && si > 0) {
            si--;
            e = (W.seasons[si].eps || []).length || 1;
        } else return;
    }
    const v = $("#cinema video");
    if (v && W.lastKey) savePos(W.lastKey, v.currentTime);
    watchStart(si, e);
}
function watchMark(si, e, on = true, force = false) {
    const sh = W.show;
    if (!sh) return;
    let b = seasonItem(si);
    if (!b) {
        const d = cleanCandidate({ ...sh, status: "active", startedAt: nowISO(), source: sh.src || "watch" });
        delete d.groupId;
        const nid = addItem(d, "Add " + sh.title);
        W.seasons.forEach(x => {
            if (!x.member) x.member = nid;
        });
        b = seasonItem(si);
    }
    const id = W.seasons[si].member,
        film = sh.medium === "film";
    // a finished show stays finished: un-ticking one of its episodes doesn't quietly turn it back into "watching" (you can still, on purpose)
    if (!on && b.status === "done" && !force) {
        toast(`${cleanTitle(b.title)} stays finished`, {
            label: film ? "Mark not watched" : "Untick anyway",
            fn: () => {
                watchMark(si, e, false, true);
                if (W.player && W.player.si === si && W.player.e === e) {
                    W.player.marked = false;
                    renderPlayer();
                }
            },
        });
        if (W.player && W.player.si === si && W.player.e === e) {
            W.player.marked = true;
            const bt = $('#cinema [data-act="cin-mark"]');
            if (bt) {
                bt.textContent = "✓";
                bt.setAttribute("aria-pressed", "true");
            }
        }
        return;
    }
    // watching a finished show again: reaching its last episode counts as another time through (like watching a film again)
    const lastSi = W.seasons.length - 1,
        lastE = Math.max(0, ...((W.seasons[lastSi] || {}).eps || []).map(x => x.e)),
        isLast = film || (si === lastSi && lastE && e === lastE);
    if (on && b.status === "done" && !isLast && !film) return; // part-way through watching it again: nothing to change
    if (on && b.status === "done" && isLast && !film) {
        change("Watched again", id, x => ({
            ...x,
            repeat: (x.repeat || 0) + 1,
            finishedAt: nowISO(),
            lastAt: nowISO(),
        }));
        toast(`Another time through ${cleanTitle(b.title)}`, { label: "Undo", fn: undo });
        if (ui.page === "watch") renderMain();
        return;
    }
    if (film) {
        if (on) finishItem(id);
        else patch(id, { status: "want", finishedAt: null }, "Not watched");
    } else if (sh.medium === "anime") logProgress(id, on ? Math.max(b.prog || 0, e) : e - 1);
    else {
        const S = new Set(b.epsSeen || []),
            k = W.seasons[si].n + "x" + e;
        on ? S.add(k) : S.delete(k);
        const tot = W.seasons.reduce((a, x) => a + (x.eps || []).length, 0);
        patch(
            id,
            {
                epsSeen: [...S],
                prog: S.size,
                total: tot || b.total,
                status: tot && S.size >= tot ? "done" : S.size ? (b.status === "done" ? "done" : "active") : b.status,
                lastAt: nowISO(),
            },
            "Episode watched"
        );
    }
    if (ui.page === "watch") renderMain();
}
const srtToVtt = s => "WEBVTT\n\n" + s.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2");
// keyboard in the cinema
document.addEventListener(
    "keydown",
    e => {
        if (
            !W.player ||
            ui.modal ||
            /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)
        )
            return;
        const v = $("#cinema video"),
            o = PS(),
            k = e.key.toLowerCase();
        let done = true;
        if (e.key === "Escape") {
            if (v && W.lastKey) savePos(W.lastKey, (W.player.offset || 0) + v.currentTime);
            W.player = null;
            renderPlayer();
            W.view = W.show ? "show" : "home";
            ui.wpOpts = false;
            renderMain();
        } // one level up: the show
        else if (!v) {
            done = e.key === "Escape";
        } else if (k === " " || k === "k") {
            v.paused ? v.play() : v.pause();
        } else if (e.key === "ArrowRight") pcSeekBy(o.seek);
        else if (e.key === "ArrowLeft") pcSeekBy(-o.seek);
        else if (e.key === "ArrowUp") {
            v.muted = false;
            v.volume = Math.min(1, v.volume + 0.1);
        } else if (e.key === "ArrowDown") v.volume = Math.max(0, v.volume - 0.1);
        else if (k === "f") {
            const c = $("#cinema");
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else if (c.requestFullscreen) c.requestFullscreen().catch(() => {});
        } else if (k === "t") actOn(e, $("#cinema"), "cin-lay", "", "", null);
        else if (k === "l") actOn(e, $("#cinema"), "cin-lights", "", "", null);
        else if (k === "m") v.muted = !v.muted;
        else if (k === "n") watchStep(1);
        else if (k === "p") watchStep(-1);
        else if (k === "s" && o.skip) pcSeekBy(o.skip);
        else if (k === "c") {
            const p = W.player,
                L = (p && p.subList) || [];
            if (L.length) {
                const on = p.subPick,
                    back = p.subLast || (L.find(s => (s.lang || "") === PS().subLang) || L[0]).url;
                if (on) p.subLast = on;
                subChoose(p, v, on ? "" : back, false);
                subRefresh(p);
            } else {
                const t = v.textTracks[0];
                if (t) t.mode = t.mode === "showing" ? "hidden" : "showing";
            }
        } else done = false;
        if (done) {
            e.preventDefault();
            e.stopPropagation();
        }
    },
    true
);

// switching the season in the list beside the player only changes the list
