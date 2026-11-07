// src/features/watch-read/medialibs.js
// ─────────────────────────────────────────────────────────────────
//  Your media servers: Jellyfin / Emby, Plex, or any shared folder of your own videos
//
//  Add a server once; every show, season, episode and film is found on it by name. Keys live in this browser and your
//  backups, never in the app file.
// ─────────────────────────────────────────────────────────────────

const LIB_TYPES = {
    jellyfin: "Jellyfin",
    emby: "Emby",
    plex: "Plex",
    folder: "Shared folder",
    komga: "Komga",
    kavita: "Kavita",
    opds: "OPDS catalogue",
};
const LIB_SETS = { libs: ["jellyfin", "emby", "plex", "folder"], rlibs: ["komga", "kavita", "opds", "folder"] };
const allLibs = () => [...(meta.settings.libs || []), ...(meta.settings.rlibs || [])];
const libById = id => allLibs().find(l => l.id === id);
const libSetOf = id => ((meta.settings.rlibs || []).some(l => l.id === id) ? "rlibs" : "libs");
const VIDEO_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|ogv|m3u8)$/i,
    READ_EXT = /\.(cbz|zip|pdf|epub)$/i,
    IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i,
    ANY_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|ogv|m3u8|cbz|zip|pdf|epub|jpe?g|png|webp|gif|avif)$/i;
const LIBS = () => (meta.settings.libs || []).filter(l => l.on !== false && l.url);
const libKey = l => (KEYS.libs || {})[l.id] || "";
const libBase = l =>
    String(l.url || "")
        .trim()
        .replace(/\/+$/, "");
const LIBIDX = new Map(); // folder indexes, this session only
const nameNorm = s =>
    norm(
        String(s || "")
            .replace(
                /\[[^\]]*\]|\((?:19|20)\d\d\)|\b(1080p|720p|2160p|4k|x26[45]|hevc|bluray|web-?dl|bdrip|dual audio|multi)\b/gi,
                " "
            )
            .replace(/[._]+/g, " ")
    );
function titleScore(a, b) {
    const x = nameNorm(a),
        y = nameNorm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.startsWith(y) || y.startsWith(x)) return 0.8 - Math.abs(x.length - y.length) / 200;
    if (x.includes(y) || y.includes(x)) return 0.6;
    const A = new Set(x.split(" ")),
        B = y.split(" ");
    const hit = B.filter(w => A.has(w)).length;
    return (hit / Math.max(A.size, B.length)) * 0.55;
}
async function libJSON(url, opts = {}) {
    const r = await fetch(url, { headers: { Accept: "application/json" }, ...opts });
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
}
// ── Jellyfin and Emby speak the same language ──
const JF = {
    q: (l, path, p = {}) => `${libBase(l)}${path}?${new URLSearchParams({ ...p, api_key: libKey(l) })}`,
    async test(l) {
        const r = await libJSON(JF.q(l, "/System/Info"));
        return r.ServerName || "Connected";
    },
    map(l, x) {
        return {
            ref: x.Id,
            title: x.Name,
            year: x.ProductionYear || null,
            type: x.Type === "Movie" ? "movie" : "show",
            image:
                x.ImageTags && x.ImageTags.Primary ? JF.q(l, `/Items/${x.Id}/Images/Primary`, { maxWidth: 360 }) : "",
            ids: x.ProviderIds || {},
        };
    },
    async search(l, q) {
        const r = await libJSON(
            JF.q(l, "/Items", {
                searchTerm: q,
                IncludeItemTypes: "Series,Movie",
                Recursive: "true",
                Limit: "12",
                Fields: "ProductionYear,ProviderIds",
            })
        );
        return (r.Items || []).map(x => JF.map(l, x));
    },
    async browse(l) {
        const r = await libJSON(
            JF.q(l, "/Items", {
                IncludeItemTypes: "Series,Movie",
                Recursive: "true",
                SortBy: "SortName",
                Limit: "400",
                Fields: "ProductionYear,ProviderIds",
            })
        );
        return (r.Items || []).map(x => JF.map(l, x));
    },
    play: (l, id) => [
        { u: JF.q(l, `/Videos/${id}/stream`, { static: "true" }), k: "original" },
        {
            u: JF.q(l, `/Videos/${id}/master.m3u8`, {
                MediaSourceId: id,
                DeviceId: "univerlist",
                VideoCodec: "h264",
                AudioCodec: "aac",
                TranscodingMaxAudioChannels: "2",
                SegmentContainer: "ts",
                MinSegments: "1",
                BreakOnNonKeyFrames: "true",
                MaxStreamingBitrate: "20000000",
            }),
            k: "adaptive",
        },
        {
            u: JF.q(l, `/Videos/${id}/stream.mp4`, {
                VideoCodec: "h264",
                AudioCodec: "aac",
                MaxStreamingBitrate: "20000000",
            }),
            k: "converted",
        },
    ],
    async episodes(l, ref) {
        const r = await libJSON(JF.q(l, `/Shows/${ref}/Episodes`, { Fields: "Overview" }));
        return (r.Items || [])
            .filter(x => x.IndexNumber != null)
            .map(x => ({
                s: x.ParentIndexNumber ?? 1,
                e: x.IndexNumber,
                title: x.Name,
                urls: JF.play(l, x.Id),
                image:
                    x.ImageTags && x.ImageTags.Primary
                        ? JF.q(l, `/Items/${x.Id}/Images/Primary`, { maxWidth: 480 })
                        : "",
            }));
    },
    async movie(l, ref) {
        return { urls: JF.play(l, ref) };
    },
};
// ── Plex ──
const PX = {
    q: (l, path, p = {}) =>
        `${libBase(l)}${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ ...p, "X-Plex-Token": libKey(l) })}`,
    async test(l) {
        const r = await libJSON(PX.q(l, "/identity"));
        return (r.MediaContainer && r.MediaContainer.friendlyName) || "Connected";
    },
    map(l, x) {
        return {
            ref: x.ratingKey,
            title: x.title,
            year: x.year || null,
            type: x.type === "movie" ? "movie" : "show",
            image: x.thumb ? PX.q(l, x.thumb) : "",
        };
    },
    async search(l, q) {
        try {
            const r = await libJSON(PX.q(l, "/hubs/search", { query: q, limit: "10" }));
            return (r.MediaContainer.Hub || [])
                .flatMap(h => h.Metadata || [])
                .filter(x => ["show", "movie"].includes(x.type))
                .map(x => PX.map(l, x));
        } catch (_) {
            const r = await libJSON(PX.q(l, "/search", { query: q }));
            return (r.MediaContainer.Metadata || [])
                .filter(x => ["show", "movie"].includes(x.type))
                .map(x => PX.map(l, x));
        }
    },
    async browse(l) {
        const s = await libJSON(PX.q(l, "/library/sections"));
        const out = [];
        for (const d of (s.MediaContainer.Directory || []).filter(d => ["show", "movie"].includes(d.type))) {
            const r = await libJSON(PX.q(l, `/library/sections/${d.key}/all`));
            out.push(...(r.MediaContainer.Metadata || []).map(x => PX.map(l, x)));
        }
        return out.sort((a, b) => a.title.localeCompare(b.title));
    },
    part: (l, x) => {
        const p = x.Media && x.Media[0] && x.Media[0].Part && x.Media[0].Part[0];
        if (!p) return [];
        return [
            { u: PX.q(l, p.key), k: "original" },
            {
                u: PX.q(l, "/video/:/transcode/universal/start.m3u8", {
                    path: "/library/metadata/" + x.ratingKey,
                    mediaIndex: "0",
                    partIndex: "0",
                    protocol: "hls",
                    fastSeek: "1",
                    directPlay: "0",
                    directStream: "1",
                    videoQuality: "100",
                    maxVideoBitrate: "20000",
                    "X-Plex-Client-Identifier": "univerlist",
                    "X-Plex-Product": "UniverList",
                    "X-Plex-Platform": "Chrome",
                }),
                k: "adaptive",
            },
        ];
    },
    async episodes(l, ref) {
        const r = await libJSON(PX.q(l, `/library/metadata/${ref}/allLeaves`));
        return (r.MediaContainer.Metadata || [])
            .filter(x => x.index != null)
            .map(x => ({
                s: x.parentIndex ?? 1,
                e: x.index,
                title: x.title,
                urls: PX.part(l, x),
                image: x.thumb ? PX.q(l, x.thumb) : "",
            }));
    },
    async movie(l, ref) {
        const r = await libJSON(PX.q(l, `/library/metadata/${ref}`));
        return { urls: PX.part(l, (r.MediaContainer.Metadata || [])[0] || {}) };
    },
};
// ── a shared folder: any web address that lists its files (nginx, Apache, Caddy, rclone serve, a NAS share link) ──
const FD = {
    async crawl(l, onStep) {
        if (LIBIDX.has(l.id)) return LIBIDX.get(l.id);
        const base = libBase(l) + "/",
            files = [],
            seen = new Set(),
            queue = [[base, 0]];
        let n = 0;
        const withKey = u => (libKey(l) ? u + (u.includes("?") ? "&" : "?") + libKey(l).replace(/^[?&]/, "") : u);
        while (queue.length && n < 400) {
            const [url, depth] = queue.shift();
            if (seen.has(url)) continue;
            seen.add(url);
            n++;
            let html;
            try {
                const r = await fetch(withKey(url));
                if (!r.ok) continue;
                html = await r.text();
            } catch (e) {
                if (n === 1) throw e;
                continue;
            }
            let hrefs = [];
            if (/^\s*[\[{]/.test(html)) {
                try {
                    const j = JSON.parse(html);
                    hrefs = (Array.isArray(j) ? j : j.items || j.files || []).map(
                        x =>
                            (x.url || x.name || x.Name || x.path || "") +
                            ((x.is_dir || x.IsDir || x.type === "directory") && !/\/$/.test(x.url || x.name || "")
                                ? "/"
                                : "")
                    );
                } catch (_) {}
            } else
                hrefs = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("a[href]")].map(a =>
                    a.getAttribute("href")
                );
            for (const h of hrefs) {
                if (!h || /^(\?|#|mailto:|javascript:)/i.test(h) || h === "../" || h === "./") continue;
                let u;
                try {
                    u = new URL(h, url).href;
                } catch (_) {
                    continue;
                }
                if (!u.startsWith(base) || u === url) continue;
                if (/\/$/.test(u.split("?")[0])) {
                    if (depth < 4) queue.push([u.split("?")[0], depth + 1]);
                } else if (ANY_EXT.test(decodeURIComponent(u.split("?")[0])))
                    files.push(decodeURIComponent(u.slice(base.length).split("?")[0]));
            }
            onStep && onStep(n, files.length);
        }
        const idx = { base, files, withKey };
        LIBIDX.set(l.id, idx);
        return idx;
    },
    async test(l) {
        const i = await FD.crawl(l);
        LIBIDX.delete(l.id);
        const v = i.files.filter(f => VIDEO_EXT.test(f)).length,
            r = i.files.length - v;
        const s = [v ? plural(v, "video") : "", r ? plural(r, "reading file") : ""].filter(Boolean).join(" and ");
        return s ? s + " found" : "Connected, but no videos or books found";
    },
    // a "title" is a folder of episodes (Season folders inside are fine), or one video file for a film
    titles(idx) {
        const SEASON = /^(season|series|s)\s*\d+$|^specials?$|^extras?$|^ova$/i,
            clean = t =>
                t
                    .replace(/\[[^\]]*\]/g, " ")
                    .replace(/[._]+/g, " ")
                    .replace(/\s*[([]?\b(19|20)\d\d\b.*$/, "")
                    .replace(/\s+/g, " ")
                    .trim(),
            yr = t => +(/\b((?:19|20)\d\d)\b/.exec(t) || [])[1] || null;
        const groups = new Map();
        for (const f of idx.files.filter(x => VIDEO_EXT.test(x))) {
            const dirs = f.split("/").slice(0, -1);
            while (dirs.length && SEASON.test(dirs[dirs.length - 1].trim())) dirs.pop();
            const d = dirs.join("/");
            if (!groups.has(d)) groups.set(d, []);
            groups.get(d).push(f);
        }
        const out = [];
        for (const [d, F] of groups) {
            const epish = F.filter(f => parseEp(f.split("/").pop())).length;
            if (d && (epish >= 2 || (F.length >= 3 && epish >= F.length / 2)))
                out.push({
                    ref: d + "/",
                    title: clean(d.split("/").pop()) || d.split("/").pop(),
                    year: yr(d.split("/").pop()),
                    type: "show",
                    n: F.length,
                });
            else
                for (const f of F) {
                    const name = f.split("/").pop().replace(VIDEO_EXT, ""),
                        t = F.length === 1 && d ? d.split("/").pop() : name;
                    out.push({ ref: f, title: clean(t) || t, year: yr(t) || yr(name), type: "movie" });
                }
        }
        return out;
    },
    async search(l, q) {
        const idx = await FD.crawl(l);
        return FD.titles(idx)
            .map(t => ({ ...t, s: titleScore(t.title, q) }))
            .filter(t => t.s > 0.3)
            .sort((a, b) => b.s - a.s)
            .slice(0, 12);
    },
    async browse(l) {
        const idx = await FD.crawl(l);
        return FD.titles(idx).sort((a, b) => a.title.localeCompare(b.title));
    },
    url: (idx, f) => idx.withKey(idx.base + f.split("/").map(encodeURIComponent).join("/")),
    async episodes(l, ref) {
        const idx = await FD.crawl(l);
        return idx.files
            .filter(f => f.startsWith(ref) && VIDEO_EXT.test(f))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((f, i) => {
                const rest = f.slice(ref.length),
                    sm = /(?:^|\/)(?:season|s)\s*(\d+)\//i.exec(rest),
                    p = parseEp(rest.split("/").pop());
                return {
                    s: p && p[0] ? p[0] : sm ? +sm[1] : 1,
                    e: p ? p[1] : i + 1,
                    title: "",
                    urls: [{ u: FD.url(idx, f), k: "original" }],
                    image: "",
                };
            });
    },
    async movie(l, ref) {
        const idx = await FD.crawl(l);
        const f = ref.endsWith("/") ? idx.files.find(x => x.startsWith(ref) && VIDEO_EXT.test(x)) : ref;
        return { urls: f ? [{ u: FD.url(idx, f), k: "original" }] : [] };
    },
};
const LIBAPI = t => (t === "plex" ? PX : t === "folder" ? FD : JF);
const libReach = (e, l) =>
    /http 401|http 403/.test(e.message)
        ? "The key was refused."
        : /http 404/.test(e.message)
          ? "That address answered, but not like a media server. Check the address."
          : location.protocol === "https:" && l && /^http:/.test(l.url || "")
            ? "This page is on https, so the browser won't load an http server. Open index.html from your computer instead, or use the server's https address."
            : "Couldn't reach it from here. Is this device on the same network (or using the server's remote address)? Some servers also need “allow other sites” (CORS) switched on.";

// ── matching a show or film to your servers ──
const showKey = () => (W.show ? W.show.groupId || W.show.id || W.show.medium + ":" + nameNorm(W.show.title) : "");
async function libMatchShow() {
    const libs = LIBS();
    W.lib = new Map();
    W.libImg = new Map();
    W.libNote = "";
    if (!libs.length || !W.show) return;
    const s = W.show,
        key = showKey(),
        maps = (meta.watchMap || {})[key] || {},
        film = s.medium === "film";
    const name = s.groupId ? ((meta.watchGroups || {})[s.groupId] || {}).name || s.title : cleanTitle(s.title);
    W.libNote = "Looking on your servers…";
    if (ui.page === "watch") renderMain();
    const found = [];
    for (const l of libs) {
        const api = LIBAPI(l.type);
        try {
            const pick = async q => {
                if (maps[l.id]) return maps[l.id];
                const R = (await api.search(l, q)).filter(r => (film ? r.type === "movie" : r.type === "show"));
                const best = R.map(r => ({
                    r,
                    sc:
                        titleScore(r.title, q) +
                        (s.year && r.year && Math.abs(r.year - s.year) <= 1 ? 0.15 : 0) +
                        (s.ext && s.ext.imdb && r.ids && r.ids.Imdb === s.ext.imdb ? 1 : 0),
                })).sort((a, b) => b.sc - a.sc)[0];
                return best && best.sc >= 0.55 ? { ref: best.r.ref, title: best.r.title } : null;
            };
            if (film) {
                const m = await pick(name);
                if (!m) continue;
                const mv = await api.movie(l, m.ref);
                if (!mv.urls.length) continue;
                add(0, 1, l, mv.urls);
                found.push([l, m.title, 1]);
                continue;
            }
            const m = await pick(name);
            if (m) {
                const eps = await api.episodes(l, m.ref),
                    seasonsOnServer = new Set(eps.map(x => x.s));
                // a show the episode guides don't know: take its seasons from the server
                if (!s.groupId && W.seasons.every(S => !(S.eps || []).length) && eps.length) {
                    const by = {};
                    for (const x of eps) (by[x.s] = by[x.s] || []).push({ e: x.e, title: x.title, image: x.image });
                    W.seasons = Object.keys(by)
                        .map(Number)
                        .sort((a, b) => a - b)
                        .map(n => ({ n, label: "Season " + n, member: s.id, eps: by[n].sort((a, b) => a.e - b.e) }));
                    W.si = 0;
                }
                // "Bungo Stray Dogs 2" on its own: season 2 of the show on the server
                const tail =
                        !s.groupId && s.medium === "anime"
                            ? /(?:season\s*|\bs)(\d+)\s*$|\s(\d{1,2})\s*$|(\d+)(?:st|nd|rd|th)\s+season/i.exec(
                                  cleanTitle(s.title)
                              )
                            : null,
                    tn = tail ? +(tail[1] || tail[2] || tail[3]) : 0;
                let n = 0;
                W.seasons.forEach((S, si) => {
                    const want = s.groupId
                        ? seasonsOnServer.size > 1
                            ? si + 1
                            : null
                        : tn && seasonsOnServer.has(tn)
                          ? tn
                          : S.n;
                    for (const x of eps)
                        if (
                            want == null
                                ? si === 0
                                : x.s === want || (seasonsOnServer.size === 1 && W.seasons.length === 1)
                        ) {
                            add(si, x.e, l, x.urls, x.image);
                            n++;
                        }
                });
                // seasons kept as separate shows on the server (common for anime): look each one up by its own title
                if (s.groupId && seasonsOnServer.size <= 1)
                    for (let si = 1; si < W.seasons.length; si++) {
                        const S = W.seasons[si],
                            mm = S.title && (await pick(cleanTitle(S.title)));
                        if (mm && mm.ref !== m.ref) {
                            for (const x of await api.episodes(l, mm.ref)) {
                                add(si, x.e, l, x.urls, x.image);
                                n++;
                            }
                        }
                    }
                if (n) found.push([l, m.title, n]);
            }
        } catch (e) {
            found.push([l, null, 0, libReach(e, l)]);
        }
    }
    const ok = found.filter(f => f[2]);
    W.libNote = ok.length
        ? "On " +
          ok
              .map(([l, t, n]) => `${l.name || LIB_TYPES[l.type]}${film ? "" : ` (${plural(n, "episode")})`}`)
              .join(" and ")
        : found.some(f => f[3])
          ? found.find(f => f[3])[3]
          : "Not found on your servers.";
    W.libMiss = !ok.length;
    if (ui.page === "watch") renderMain();
    function add(si, e, l, urls, image) {
        const k = si + ":" + e,
            L = W.lib.get(k) || [];
        urls.forEach(x => L.push({ name: l.name || LIB_TYPES[l.type], how: x.k, url: x.u, owner: l.from || "" }));
        W.lib.set(k, L);
        if (image && !W.libImg.has(k)) W.libImg.set(k, image);
    }
}
// choosing by hand when the names don't match
async function libPickOpen(q) {
    const libs = LIBS(),
        film = W.show.medium === "film";
    ui.libPick = {
        q: q || (W.show.groupId ? ((meta.watchGroups || {})[W.show.groupId] || {}).name : cleanTitle(W.show.title)),
        busy: true,
        res: [],
    };
    renderMain();
    for (const l of libs) {
        try {
            for (const r of (await LIBAPI(l.type).search(l, ui.libPick.q)).filter(r =>
                film ? r.type === "movie" : r.type === "show"
            ))
                ui.libPick.res.push({ ...r, lib: l.id, libName: l.name || LIB_TYPES[l.type] });
        } catch (_) {}
    }
    ui.libPick.busy = false;
    renderMain();
}
function libPickHTML() {
    const P = ui.libPick;
    if (!P) return "";
    return `<section class="panel libpick"><h3>Which one is it?<span class="r"><button class="linkbtn" data-act="lib-pick-close">Close</button></span></h3>
    <div class="bar"><input class="inp" id="lib-q" value="${esc(P.q)}" style="flex:1"><button class="btn sm" data-act="lib-pick-go">Search</button></div>
    ${P.busy ? `<p class="think">Looking…</p>` : P.res.length ? `<div class="wgrid sm">${P.res.map((r, i) => `<button class="wtile" data-act="lib-pick" data-k="${i}">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : `<span class="nocov">${esc(r.title)}</span>`}<span class="t">${esc(r.title)}</span><span class="hint">${esc([r.libName, r.year].filter(Boolean).join(" · "))}</span></button>`).join("")}</div>` : `<p class="hint">Nothing with that name on your servers.</p>`}</section>`;
}
// ── browsing what's on a server ──
const libBrowse = { lib: null, items: null, busy: false, err: "", q: "" };
async function libBrowseOpen(id) {
    const l = (meta.settings.libs || []).find(x => x.id === id);
    if (!l) return;
    Object.assign(libBrowse, { lib: id, items: null, busy: true, err: "" });
    renderMain();
    try {
        libBrowse.items = await LIBAPI(l.type).browse(l);
    } catch (e) {
        libBrowse.err = libReach(e, l);
    }
    libBrowse.busy = false;
    renderMain();
}
function libBrowseHTML() {
    const libs = LIBS();
    if (!libs.length)
        return `<section class="wrow wsrvhint"><h3>Your own videos</h3><p class="hint">Add your Jellyfin, Emby or Plex server, or a shared folder from your NAS or cloud, and everything on it can be played here: shows, seasons and films are matched by name. <button class="linkbtn" data-act="watch-servers">Add a server</button></p></section>`;
    const L =
        libBrowse.items && libBrowse.q
            ? libBrowse.items.filter(x => nameNorm(x.title).includes(nameNorm(libBrowse.q)))
            : libBrowse.items;
    return `<section class="wrow"><h3>On your servers <span class="chips inl">${libs.map(l => `<button class="chip" data-act="lib-browse" data-k="${esc(l.id)}" aria-pressed="${libBrowse.lib === l.id}">${esc(l.name || LIB_TYPES[l.type])}</button>`).join("")}</span>${libBrowse.items ? `<input class="inp sm" id="lib-bq" placeholder="Filter" value="${esc(libBrowse.q)}">` : ""}</h3>
    ${
        libBrowse.busy
            ? `<p class="think">Reading the server…</p>`
            : libBrowse.err
              ? `<p class="err">${esc(libBrowse.err)}</p>`
              : L
                ? L.length
                    ? `<div class="wgrid">${L.slice(0, 240)
                          .map(
                              (r, i) =>
                                  `<button class="wtile" data-act="lib-open" data-k="${i}">${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy">` : `<span class="nocov">${esc(r.title)}</span>`}<span class="t">${esc(r.title)}</span><span class="hint">${esc([r.type === "movie" ? "Film" : "Show", r.year].filter(Boolean).join(" · "))}</span></button>`
                          )
                          .join("")}</div>`
                    : `<p class="hint">Nothing matches.</p>`
                : `<p class="hint">Pick a server to see what's on it.</p>`
    }</section>`;
}
async function libOpenEntry(r) {
    const l = (meta.settings.libs || []).find(x => x.id === libBrowse.lib);
    if (!l) return;
    const film = r.type === "movie",
        guess = [...items.entries()].find(
            ([, b]) =>
                (film ? b.medium === "film" : ["tv", "anime"].includes(b.medium)) &&
                titleScore(titleOf(b), r.title) >= 0.8
        );
    const show = guess
        ? { id: guess[0], ...guess[1] }
        : { title: r.title, year: r.year, medium: film ? "film" : "tv", ext: {} };
    await watchOpen(show);
    meta.watchMap = meta.watchMap || {};
    const k = showKey();
    meta.watchMap[k] = { ...(meta.watchMap[k] || {}), [l.id]: { ref: r.ref, title: r.title } };
    markDirty();
    libMatchShow();
}
// ── the servers panel ──
function libsPanelHTML(set = "libs") {
    const L = meta.settings[set] || [],
        st = ui.libTest || {},
        read = set === "rlibs";
    const ph = l =>
        ({
            plex: "http://192.168.1.10:32400",
            folder: read ? "https://my-nas.example/manga/" : "https://my-nas.example/videos/",
            komga: "http://192.168.1.10:25600",
            kavita: "http://192.168.1.10:5000",
            opds: "https://example.org/opds",
        })[l.type] || "http://192.168.1.10:8096";
    const kph = l =>
        ({
            folder: "Share token (optional)",
            plex: "Plex token",
            komga: "API key, or email:password",
            kavita: "API key",
            opds: "user:password (if it asks)",
        })[l.type] || "API key";
    return `<div class="libs">${L.map(
        l => `<div class="librow"><span class="libt">${esc(LIB_TYPES[l.type])}</span><input type="checkbox" data-lib="${esc(l.id)}" data-f="on" ${l.on !== false ? "checked" : ""} aria-label="Use this server">
      <input class="inp" data-lib="${esc(l.id)}" data-f="name" value="${esc(l.name || "")}" placeholder="Name" style="width:130px">
      <input class="inp" data-lib="${esc(l.id)}" data-f="url" value="${esc(l.url || "")}" placeholder="${ph(l)}" style="flex:1;min-width:200px">
      <input class="inp" type="password" data-lib="${esc(l.id)}" data-f="key" value="${esc(libKey(l))}" placeholder="${kph(l)}" style="width:180px" autocomplete="off">
      <button class="btn sm" data-act="lib-test" data-k="${esc(l.id)}">${st[l.id] === "…" ? "Testing…" : "Test"}</button><button class="btn sm ghost" data-act="lib-share" data-k="${esc(l.id)}" title="Copy a code a friend can paste to add this server">Share</button><button class="btn sm ghost" data-act="lib-del" data-k="${esc(l.id)}" aria-label="Remove">✕</button>
      ${l.from ? `<span class="libfrom">from ${esc(l.from)}</span>` : ""}${st[l.id] && st[l.id] !== "…" ? `<span class="libst ${st[l.id].ok ? "ok" : "bad"}">${esc(st[l.id].t)}</span>` : ""}</div>`
    ).join("")}
    <div class="bar">${LIB_SETS[set].map(t => `<button class="btn sm" data-act="lib-add" data-set="${set}" data-k="${t}">+ ${esc(LIB_TYPES[t])}</button>`).join("")}<span class="spacer"></span><input class="inp sm" id="lib-code-${set}" placeholder="Paste a friend's server code" style="width:220px"><button class="btn sm" data-act="lib-code" data-set="${set}">Add</button></div>
    <p class="hint">${read ? "Komga: Account → API keys (or your email:password). Kavita: Settings → your API key. OPDS: any catalogue address (Calibre-web is <code>/opds</code>). Shared folder: an address that lists your CBZ, ZIP, PDF, EPUB files or folders of pages." : "Jellyfin/Emby: Dashboard → API keys. Plex: your X-Plex-Token. Shared folder: any address that lists your video files (a NAS or cloud share link, rclone serve, nginx/Caddy file browsing), with the token if the link needs one."} Keys are saved in this browser and in your backups, never inside index.html. A share code includes the key, so only send it to people you'd give the key to.</p></div>`;
}
document.addEventListener(
    "click",
    async e => {
        const t = e.target.closest("[data-act]");
        if (!t) return;
        const a = t.dataset.act,
            k = t.dataset.k;
        if (!a.startsWith("lib-")) return;
        e.preventDefault();
        e.stopPropagation();
        if (a === "lib-add") {
            const set = t.dataset.set || "libs",
                id = "l" + Date.now().toString(36);
            meta.settings[set] = [
                ...(meta.settings[set] || []),
                { id, type: k, name: LIB_TYPES[k], url: "", on: true },
            ];
            markDirty();
            renderMain();
            setTimeout(() => {
                const i = $(`[data-lib="${id}"][data-f="url"]`);
                i && i.focus();
            }, 30);
        }
        if (a === "lib-del") {
            const set = libSetOf(k);
            meta.settings[set] = (meta.settings[set] || []).filter(l => l.id !== k);
            if (KEYS.libs) {
                delete KEYS.libs[k];
                saveKeys();
            }
            LIBIDX.delete(k);
            markDirty();
            renderMain();
        }
        if (a === "lib-share") {
            const l = libById(k);
            if (!l || !l.url) {
                toast("Add its address first");
                return;
            }
            const code =
                "UL1:" +
                btoa(
                    unescape(
                        encodeURIComponent(
                            JSON.stringify({
                                t: l.type,
                                n: l.name,
                                u: l.url,
                                k: libKey(l),
                                f: meta.profile.name || "",
                                r: libSetOf(k) === "rlibs" ? 1 : 0,
                            })
                        )
                    )
                );
            try {
                await navigator.clipboard.writeText(code);
                toast("Copied. Send it to a friend; they paste it under Your servers.");
            } catch (_) {
                prompt("Copy this code:", code);
            }
        }
        if (a === "lib-code") {
            const set = t.dataset.set || "libs",
                inp = $("#lib-code-" + set),
                raw = ((inp && inp.value) || "").trim();
            let d = null;
            try {
                d = JSON.parse(decodeURIComponent(escape(atob(raw.replace(/^UL1:/, "")))));
            } catch (_) {}
            if (!d || !d.u || !LIB_TYPES[d.t]) {
                toast("That doesn't look like a server code");
                return;
            }
            const to = d.r ? "rlibs" : "libs",
                id = "l" + Date.now().toString(36);
            meta.settings[to] = [
                ...(meta.settings[to] || []),
                { id, type: d.t, name: d.n || LIB_TYPES[d.t], url: d.u, on: true, from: d.f || "a friend" },
            ];
            if (d.k) {
                KEYS.libs = { ...(KEYS.libs || {}), [id]: d.k };
                saveKeys();
            }
            markDirty();
            toast(`Added ${d.n || "their server"}${d.f ? " from " + d.f : ""}`);
            renderMain();
        }
        if (a === "lib-test") {
            const l = libById(k);
            if (!l || !l.url) {
                toast("Add its address first");
                return;
            }
            ui.libTest = { ...(ui.libTest || {}), [k]: "…" };
            renderMain();
            try {
                const r = await (["komga", "kavita", "opds"].includes(l.type) ? OP : LIBAPI(l.type)).test(l);
                ui.libTest[k] = { ok: true, t: "✓ " + r };
            } catch (err) {
                ui.libTest[k] = { ok: false, t: libReach(err, l) };
            }
            renderMain();
        }
        if (a === "lib-browse") libBrowseOpen(k);
        if (a === "lib-open") {
            const L = libBrowse.q
                ? libBrowse.items.filter(x => nameNorm(x.title).includes(nameNorm(libBrowse.q)))
                : libBrowse.items;
            const r = L && L[Number(k)];
            if (r) libOpenEntry(r);
        }
        if (a === "lib-pick-open") libPickOpen();
        if (a === "lib-pick-go") libPickOpen(($("#lib-q") || {}).value);
        if (a === "lib-pick-close") {
            ui.libPick = null;
            renderMain();
        }
        if (a === "lib-pick") {
            const r = ui.libPick.res[Number(k)];
            if (!r) return;
            meta.watchMap = meta.watchMap || {};
            const sk = showKey();
            meta.watchMap[sk] = { ...(meta.watchMap[sk] || {}), [r.lib]: { ref: r.ref, title: r.title } };
            markDirty();
            ui.libPick = null;
            libMatchShow();
        }
    },
    true
);
document.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.lib) {
        const id = t.dataset.lib,
            f = t.dataset.f,
            l = libById(id);
        if (!l) return;
        if (f === "key") {
            KEYS.libs = { ...(KEYS.libs || {}), [id]: t.value.trim() };
            saveKeys();
        } else if (f === "on") l.on = t.checked;
        else l[f] = t.value.trim();
        LIBIDX.delete(id);
        markDirty();
    }
    if (t.id === "lib-bq") {
        libBrowse.q = t.value;
        renderMain();
    }
});
document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.id === "lib-q") {
        e.preventDefault();
        libPickOpen(e.target.value);
    }
    if (e.key === "Enter" && e.target.id === "lib-bq") {
        libBrowse.q = e.target.value;
        renderMain();
    }
});
