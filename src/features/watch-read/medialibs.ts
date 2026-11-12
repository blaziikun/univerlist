// src/features/watch-read/medialibs.ts
// ─────────────────────────────────────────────────────────────────
//  Your media servers: Jellyfin / Emby, Plex, or any shared folder of your own videos
//
//  Add a server once; every show, season, episode and film is found on it by name. Keys live in this browser and your
//  backups, never in the app file. What a server answers (its JSON, a folder's listing) is read as someone else's data:
//  every field is checked, and a listing that isn't what it should be gives fewer titles, never a broken page.
// ─────────────────────────────────────────────────────────────────

import {
    $,
    at,
    cleanTitle,
    errMessage,
    fieldsOf,
    isRecord,
    items,
    KEYS,
    listOf,
    markDirty,
    meta,
    norm,
    numOf,
    ownOf,
    plural,
    recordsOf,
    safeJSON,
    saveKeys,
    textOf,
    titleOf,
    toast,
    ui,
} from "../core/core";
import { renderMain } from "../core/shell";
import { parseEp, W, watchOpen } from "./watch";
import { OP } from "./readlibs";
import type { MediaServer, ServerPick, WatchShow, WatchSource } from "../core/model";

const LIB_TYPES: Record<string, string> = {
    jellyfin: "Jellyfin",
    emby: "Emby",
    plex: "Plex",
    folder: "Shared folder",
    komga: "Komga",
    kavita: "Kavita",
    opds: "OPDS catalogue",
};
/** the two lists of servers in Settings: what you watch from, and what you read from */
type ServerSet = "libs" | "rlibs";
const LIB_SETS: Record<ServerSet, string[]> = {
    libs: ["jellyfin", "emby", "plex", "folder"],
    rlibs: ["komga", "kavita", "opds", "folder"],
};
const setOf = (x: string | undefined): ServerSet => (x === "rlibs" ? "rlibs" : "libs");
/** a server's kind, as it's shown ("" for one this app doesn't know) */
export const typeName = (t: string) => ownOf(LIB_TYPES, t) || "";
const optStr = (x: unknown) => x === undefined || typeof x === "string";
const isServer = (l: unknown): l is MediaServer =>
    isRecord(l) &&
    typeof l.id === "string" &&
    typeof l.type === "string" &&
    optStr(l.url) &&
    optStr(l.name) &&
    optStr(l.from) &&
    (l.on === undefined || typeof l.on === "boolean");
/** the servers in one of the lists (settings come from storage and backups: an entry that isn't a server is left out) */
export const serversIn = (set: ServerSet): MediaServer[] => listOf(meta.settings[set]).filter(isServer);
const allLibs = () => [...serversIn("libs"), ...serversIn("rlibs")];
export const libById = (id: string | null | undefined) => allLibs().find(l => l.id === id);
const libSetOf = (id: string | undefined): ServerSet => (serversIn("rlibs").some(l => l.id === id) ? "rlibs" : "libs");
const VIDEO_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|ogv|m3u8)$/i;
export const READ_EXT = /\.(cbz|zip|pdf|epub)$/i,
    IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const ANY_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|ts|m2ts|ogv|m3u8|cbz|zip|pdf|epub|jpe?g|png|webp|gif|avif)$/i;
/** your media servers that are on */
export const LIBS = () => serversIn("libs").filter(l => l.on !== false && l.url);
export const libKey = (l: MediaServer) => ownOf(KEYS.libs || {}, l.id) || "";
export const libBase = (l: MediaServer) =>
    String(l.url || "")
        .trim()
        .replace(/\/+$/, "");
/** a title on a server: a show (a folder of episodes) or a film */
interface LibTitle {
    ref: string;
    title: string;
    year: number | null;
    type: "movie" | "show";
    image?: string;
    ids?: Record<string, unknown>; // its ids at the catalogues, when the server knows them
    n?: number; // a folder's files
}
/** an address to play something from, and how it plays ("original", "adaptive", "converted") */
interface PlayURL {
    u: string;
    k: string;
}
/** an episode on a server, with the addresses it plays from */
interface LibEpisode {
    s: number;
    e: number;
    title: string;
    urls: PlayURL[];
    image: string;
}
/** what every kind of media server can be asked */
interface LibApi {
    test(l: MediaServer): Promise<string>;
    search(l: MediaServer, q: string): Promise<LibTitle[]>;
    browse(l: MediaServer): Promise<LibTitle[]>;
    episodes(l: MediaServer, ref: string): Promise<LibEpisode[]>;
    movie(l: MediaServer, ref: string): Promise<{ urls: PlayURL[] }>;
}
/** a shared folder's files, as one crawl found them */
export interface FolderIndex {
    base: string;
    files: string[]; // paths under base, decoded
    withKey: (u: string) => string; // an address with the folder's token added
}
const LIBIDX = new Map<string, FolderIndex>(); // folder indexes, this session only
const nameNorm = (s: unknown) =>
    norm(
        String(s || "")
            .replace(
                /\[[^\]]*\]|\((?:19|20)\d\d\)|\b(1080p|720p|2160p|4k|x26[45]|hevc|bluray|web-?dl|bdrip|dual audio|multi)\b/gi,
                " "
            )
            .replace(/[._]+/g, " ")
    );
/** how alike two names are, 0 to 1, ignoring release tags and dots */
export function titleScore(a: unknown, b: unknown): number {
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
async function libJSON(url: string): Promise<unknown> {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
}
const showOrMovie = (x: Record<string, unknown>) => x.type === "show" || x.type === "movie";
// ── Jellyfin and Emby speak the same language ──
const JF = {
    q: (l: MediaServer, path: string, p: Record<string, string> = {}) =>
        `${libBase(l)}${path}?${new URLSearchParams({ ...p, api_key: libKey(l) })}`,
    async test(l: MediaServer) {
        const r = await libJSON(JF.q(l, "/System/Info"));
        return textOf(at(r, "ServerName")) || "Connected";
    },
    map(l: MediaServer, x: Record<string, unknown>): LibTitle {
        const id = textOf(x.Id);
        return {
            ref: id,
            title: textOf(x.Name),
            year: numOf(x.ProductionYear) || null,
            type: x.Type === "Movie" ? "movie" : "show",
            image: at(x, "ImageTags", "Primary") ? JF.q(l, `/Items/${id}/Images/Primary`, { maxWidth: "360" }) : "",
            ids: fieldsOf(x.ProviderIds),
        };
    },
    async search(l: MediaServer, q: string) {
        const r = await libJSON(
            JF.q(l, "/Items", {
                searchTerm: q,
                IncludeItemTypes: "Series,Movie",
                Recursive: "true",
                Limit: "12",
                Fields: "ProductionYear,ProviderIds",
            })
        );
        return recordsOf(at(r, "Items")).map(x => JF.map(l, x));
    },
    async browse(l: MediaServer) {
        const r = await libJSON(
            JF.q(l, "/Items", {
                IncludeItemTypes: "Series,Movie",
                Recursive: "true",
                SortBy: "SortName",
                Limit: "400",
                Fields: "ProductionYear,ProviderIds",
            })
        );
        return recordsOf(at(r, "Items")).map(x => JF.map(l, x));
    },
    play: (l: MediaServer, id: string): PlayURL[] => [
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
    async episodes(l: MediaServer, ref: string) {
        const r = await libJSON(JF.q(l, `/Shows/${ref}/Episodes`, { Fields: "Overview" }));
        return recordsOf(at(r, "Items")).flatMap((x): LibEpisode[] => {
            const e = numOf(x.IndexNumber),
                id = textOf(x.Id);
            return e === undefined
                ? []
                : [
                      {
                          s: numOf(x.ParentIndexNumber) ?? 1,
                          e,
                          title: textOf(x.Name),
                          urls: JF.play(l, id),
                          image: at(x, "ImageTags", "Primary")
                              ? JF.q(l, `/Items/${id}/Images/Primary`, { maxWidth: "480" })
                              : "",
                      },
                  ];
        });
    },
    async movie(l: MediaServer, ref: string) {
        return { urls: JF.play(l, ref) };
    },
};
// ── Plex ──
const PX = {
    q: (l: MediaServer, path: string, p: Record<string, string> = {}) =>
        `${libBase(l)}${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ ...p, "X-Plex-Token": libKey(l) })}`,
    async test(l: MediaServer) {
        const r = await libJSON(PX.q(l, "/identity"));
        return textOf(at(r, "MediaContainer", "friendlyName")) || "Connected";
    },
    map(l: MediaServer, x: Record<string, unknown>): LibTitle {
        const thumb = textOf(x.thumb);
        return {
            ref: textOf(x.ratingKey),
            title: textOf(x.title),
            year: numOf(x.year) || null,
            type: x.type === "movie" ? "movie" : "show",
            image: thumb ? PX.q(l, thumb) : "",
        };
    },
    async search(l: MediaServer, q: string) {
        try {
            const r = await libJSON(PX.q(l, "/hubs/search", { query: q, limit: "10" }));
            return recordsOf(at(r, "MediaContainer", "Hub"))
                .flatMap(h => recordsOf(h.Metadata))
                .filter(showOrMovie)
                .map(x => PX.map(l, x));
        } catch (_) {
            const r = await libJSON(PX.q(l, "/search", { query: q }));
            return recordsOf(at(r, "MediaContainer", "Metadata"))
                .filter(showOrMovie)
                .map(x => PX.map(l, x));
        }
    },
    async browse(l: MediaServer) {
        const s = await libJSON(PX.q(l, "/library/sections"));
        const out: LibTitle[] = [];
        for (const d of recordsOf(at(s, "MediaContainer", "Directory")).filter(showOrMovie)) {
            const r = await libJSON(PX.q(l, `/library/sections/${textOf(d.key)}/all`));
            out.push(...recordsOf(at(r, "MediaContainer", "Metadata")).map(x => PX.map(l, x)));
        }
        return out.sort((a, b) => a.title.localeCompare(b.title));
    },
    part: (l: MediaServer, x: unknown): PlayURL[] => {
        const key = textOf(at(x, "Media", 0, "Part", 0, "key"));
        if (!key) return [];
        return [
            { u: PX.q(l, key), k: "original" },
            {
                u: PX.q(l, "/video/:/transcode/universal/start.m3u8", {
                    path: "/library/metadata/" + textOf(at(x, "ratingKey")),
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
    async episodes(l: MediaServer, ref: string) {
        const r = await libJSON(PX.q(l, `/library/metadata/${ref}/allLeaves`));
        return recordsOf(at(r, "MediaContainer", "Metadata")).flatMap((x): LibEpisode[] => {
            const e = numOf(x.index),
                thumb = textOf(x.thumb);
            return e === undefined
                ? []
                : [
                      {
                          s: numOf(x.parentIndex) ?? 1,
                          e,
                          title: textOf(x.title),
                          urls: PX.part(l, x),
                          image: thumb ? PX.q(l, thumb) : "",
                      },
                  ];
        });
    },
    async movie(l: MediaServer, ref: string) {
        const r = await libJSON(PX.q(l, `/library/metadata/${ref}`));
        return { urls: PX.part(l, at(r, "MediaContainer", "Metadata", 0)) };
    },
};
// a path from a listing, decoded: each run of %-escapes on its own, so a stray "%" in a file's name (100% Orange.mp4)
// stays as it is instead of making the whole listing unreadable
const unescapePath = (s: string) =>
    s.replace(/(?:%[0-9a-f]{2})+/gi, m => {
        try {
            return decodeURIComponent(m);
        } catch (_) {
            return m;
        }
    });
// ── a shared folder: any web address that lists its files (nginx, Apache, Caddy, rclone serve, a NAS share link) ──
export const FD = {
    async crawl(l: MediaServer, onStep?: (pages: number, files: number) => void): Promise<FolderIndex> {
        const had = LIBIDX.get(l.id);
        if (had) return had;
        const base = libBase(l) + "/",
            files: string[] = [],
            seen = new Set<string>(),
            queue: [string, number][] = [[base, 0]];
        let n = 0;
        const withKey = (u: string) =>
            libKey(l) ? u + (u.includes("?") ? "&" : "?") + libKey(l).replace(/^[?&]/, "") : u;
        while (queue.length && n < 400) {
            const [url, depth] = queue.shift() ?? [base, 0];
            if (seen.has(url)) continue;
            seen.add(url);
            n++;
            let html: string;
            try {
                const r = await fetch(withKey(url));
                if (!r.ok) continue;
                html = await r.text();
            } catch (e) {
                if (n === 1) throw e;
                continue;
            }
            let hrefs: (string | null)[] = [];
            if (/^\s*[[{]/.test(html)) {
                try {
                    const j = safeJSON(html),
                        list = Array.isArray(j) ? j : listOf(fieldsOf(j).items || fieldsOf(j).files);
                    hrefs = list.map(item => {
                        const x = fieldsOf(item),
                            name = textOf(x.url || x.name || x.Name || x.path),
                            dir =
                                (x.is_dir || x.IsDir || x.type === "directory") && !/\/$/.test(textOf(x.url || x.name));
                        return name + (dir ? "/" : "");
                    });
                } catch (_) {}
            } else
                hrefs = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("a[href]")].map(a =>
                    a.getAttribute("href")
                );
            for (const h of hrefs) {
                if (!h || /^(\?|#|mailto:|javascript:)/i.test(h) || h === "../" || h === "./") continue;
                let u: string;
                try {
                    u = new URL(h, url).href;
                } catch (_) {
                    continue;
                }
                if (!u.startsWith(base) || u === url) continue;
                const path = u.split("?")[0];
                if (/\/$/.test(path)) {
                    if (depth < 4) queue.push([path, depth + 1]);
                } else if (ANY_EXT.test(unescapePath(path)))
                    files.push(unescapePath(u.slice(base.length).split("?")[0]));
            }
            if (onStep) onStep(n, files.length);
        }
        const idx = { base, files, withKey };
        LIBIDX.set(l.id, idx);
        return idx;
    },
    async test(l: MediaServer) {
        const i = await FD.crawl(l);
        LIBIDX.delete(l.id);
        const v = i.files.filter(f => VIDEO_EXT.test(f)).length,
            r = i.files.length - v;
        const s = [v ? plural(v, "video") : "", r ? plural(r, "reading file") : ""].filter(Boolean).join(" and ");
        return s ? s + " found" : "Connected, but no videos or books found";
    },
    // a "title" is a folder of episodes (Season folders inside are fine), or one video file for a film
    titles(idx: FolderIndex): LibTitle[] {
        const SEASON = /^(season|series|s)\s*\d+$|^specials?$|^extras?$|^ova$/i,
            clean = (t: string) =>
                t
                    .replace(/\[[^\]]*\]/g, " ")
                    .replace(/[._]+/g, " ")
                    .replace(/\s*[([]?\b(19|20)\d\d\b.*$/, "")
                    .replace(/\s+/g, " ")
                    .trim(),
            yr = (t: string) => {
                const m = /\b((?:19|20)\d\d)\b/.exec(t);
                return m ? +m[1] : null;
            },
            last = (p: string) => p.split("/").pop() || "";
        const groups = new Map<string, string[]>();
        for (const f of idx.files.filter(x => VIDEO_EXT.test(x))) {
            const dirs = f.split("/").slice(0, -1);
            while (dirs.length && SEASON.test(dirs[dirs.length - 1].trim())) dirs.pop();
            const d = dirs.join("/");
            groups.set(d, [...(groups.get(d) || []), f]);
        }
        const out: LibTitle[] = [];
        for (const [d, F] of groups) {
            const epish = F.filter(f => parseEp(last(f))).length;
            if (d && (epish >= 2 || (F.length >= 3 && epish >= F.length / 2)))
                out.push({
                    ref: d + "/",
                    title: clean(last(d)) || last(d),
                    year: yr(last(d)),
                    type: "show",
                    n: F.length,
                });
            else
                for (const f of F) {
                    const name = last(f).replace(VIDEO_EXT, ""),
                        t = F.length === 1 && d ? last(d) : name;
                    out.push({ ref: f, title: clean(t) || t, year: yr(t) || yr(name), type: "movie" });
                }
        }
        return out;
    },
    async search(l: MediaServer, q: string) {
        const idx = await FD.crawl(l);
        return FD.titles(idx)
            .map(t => ({ t, s: titleScore(t.title, q) }))
            .filter(x => x.s > 0.3)
            .sort((a, b) => b.s - a.s)
            .slice(0, 12)
            .map(x => x.t);
    },
    async browse(l: MediaServer) {
        const idx = await FD.crawl(l);
        return FD.titles(idx).sort((a, b) => a.title.localeCompare(b.title));
    },
    url: (idx: FolderIndex, f: string) => idx.withKey(idx.base + f.split("/").map(encodeURIComponent).join("/")),
    async episodes(l: MediaServer, ref: string) {
        const idx = await FD.crawl(l);
        return idx.files
            .filter(f => f.startsWith(ref) && VIDEO_EXT.test(f))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((f, i): LibEpisode => {
                const rest = f.slice(ref.length),
                    sm = /(?:^|\/)(?:season|s)\s*(\d+)\//i.exec(rest),
                    p = parseEp(rest.split("/").pop() || "");
                return {
                    s: p && p[0] ? p[0] : sm ? +sm[1] : 1,
                    e: p ? p[1] : i + 1,
                    title: "",
                    urls: [{ u: FD.url(idx, f), k: "original" }],
                    image: "",
                };
            });
    },
    async movie(l: MediaServer, ref: string) {
        const idx = await FD.crawl(l);
        const f = ref.endsWith("/") ? idx.files.find(x => x.startsWith(ref) && VIDEO_EXT.test(x)) : ref;
        return { urls: f ? [{ u: FD.url(idx, f), k: "original" }] : [] };
    },
};
const LIBAPI = (t: string): LibApi => (t === "plex" ? PX : t === "folder" ? FD : JF);
/** why a server couldn't be used, in words */
export const libReach = (e: unknown, l?: MediaServer | null) =>
    /http 401|http 403/.test(errMessage(e))
        ? "The key was refused."
        : /http 404/.test(errMessage(e))
          ? "That address answered, but not like a media server. Check the address."
          : location.protocol === "https:" && l && /^http:/.test(l.url || "")
            ? "This page is on https, so the browser won't load an http server. Open index.html from your computer instead, or use the server's https address."
            : "Couldn't reach it from here. Is this device on the same network (or using the server's remote address)? Some servers also need “allow other sites” (CORS) switched on.";

// ── matching a show or film to your servers ──
const showKey = () => (W.show ? W.show.groupId || W.show.id || W.show.medium + ":" + nameNorm(W.show.title) : "");
// the title you picked on a server for a show (meta.watchMap), as it was kept
const pickedOf = (x: unknown): { ref: string; title: string } | null =>
    isRecord(x) && typeof x.ref === "string" ? { ref: x.ref, title: textOf(x.title) } : null;
let matching = 0; // each match is numbered: a newer one (another show, or this one again) makes an older one stop
export async function libMatchShow() {
    const libs = LIBS(),
        run = ++matching,
        s = W.show,
        lib = new Map<string, WatchSource[]>(),
        libImg = new Map<string, string>();
    W.lib = lib;
    W.libImg = libImg;
    W.libNote = "";
    if (!libs.length || !s) return;
    // you've opened something else meanwhile (or this again): what's still arriving belongs to nothing on the page
    const gone = () => run !== matching || W.show !== s;
    const key = showKey(),
        maps = fieldsOf(meta.watchMap?.[key]),
        film = s.medium === "film";
    const name = s.groupId ? meta.watchGroups?.[s.groupId]?.name || s.title : cleanTitle(s.title);
    W.libNote = "Looking on your servers…";
    if (ui.page === "watch") renderMain();
    const found: { l: MediaServer; title: string; n: number; err?: string }[] = [];
    const add = (si: number, e: number, l: MediaServer, urls: PlayURL[], image?: string) => {
        const k = si + ":" + e,
            L = lib.get(k) || [];
        for (const x of urls) L.push({ name: l.name || typeName(l.type), how: x.k, url: x.u, owner: l.from || "" });
        lib.set(k, L);
        if (image && !libImg.has(k)) libImg.set(k, image);
    };
    for (const l of libs) {
        const api = LIBAPI(l.type);
        try {
            const pick = async (q: string) => {
                const kept = pickedOf(maps[l.id]);
                if (kept) return kept;
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
                if (gone()) return;
                if (!m) continue;
                const mv = await api.movie(l, m.ref);
                if (gone()) return;
                if (!mv.urls.length) continue;
                add(0, 1, l, mv.urls);
                found.push({ l, title: m.title, n: 1 });
                continue;
            }
            const m = await pick(name);
            if (gone()) return;
            if (m) {
                const eps = await api.episodes(l, m.ref),
                    seasonsOnServer = new Set(eps.map(x => x.s));
                if (gone()) return;
                // a show the episode guides don't know: take its seasons from the server
                if (!s.groupId && W.seasons.every(S => !(S.eps || []).length) && eps.length) {
                    const by = new Map<number, { e: number; title: string; image: string }[]>();
                    for (const x of eps)
                        by.set(x.s, [...(by.get(x.s) || []), { e: x.e, title: x.title, image: x.image }]);
                    W.seasons = [...by.keys()]
                        .sort((a, b) => a - b)
                        .map(n => ({
                            n,
                            label: "Season " + n,
                            member: s.id,
                            eps: (by.get(n) || []).sort((a, b) => a.e - b.e),
                        }));
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
                            mm = S.title ? await pick(cleanTitle(S.title)) : null;
                        if (gone()) return;
                        if (mm && mm.ref !== m.ref) {
                            const more = await api.episodes(l, mm.ref);
                            if (gone()) return;
                            for (const x of more) {
                                add(si, x.e, l, x.urls, x.image);
                                n++;
                            }
                        }
                    }
                if (n) found.push({ l, title: m.title, n });
            }
        } catch (e) {
            if (gone()) return;
            found.push({ l, title: "", n: 0, err: libReach(e, l) });
        }
    }
    const ok = found.filter(f => f.n);
    W.libNote = ok.length
        ? "On " +
          ok.map(({ l, n }) => `${l.name || typeName(l.type)}${film ? "" : ` (${plural(n, "episode")})`}`).join(" and ")
        : found.find(f => f.err)?.err || "Not found on your servers.";
    W.libMiss = !ok.length;
    if (ui.page === "watch") renderMain();
}
// choosing by hand when the names don't match
/** "Not the right one?": the titles on your servers with that name, to pick from by hand (page/LibPick.svelte) */
export async function libPickOpen(q?: string) {
    const sh = W.show;
    if (!sh) return;
    const libs = LIBS(),
        film = sh.medium === "film";
    const P: ServerPick = {
        q: q || (sh.groupId ? meta.watchGroups?.[sh.groupId]?.name || "" : cleanTitle(sh.title)),
        busy: true,
        res: [],
    };
    ui.libPick = P;
    renderMain();
    for (const l of libs) {
        try {
            for (const r of (await LIBAPI(l.type).search(l, P.q)).filter(r =>
                film ? r.type === "movie" : r.type === "show"
            ))
                P.res.push({ ...r, lib: l.id, libName: l.name || typeName(l.type) });
        } catch (_) {}
    }
    P.busy = false;
    renderMain();
}
/** "Which one is it?" (page/LibPick.svelte): what was searched, and what your servers have by that name */
export function libPickView() {
    const P = ui.libPick;
    return P
        ? {
              q: P.q,
              busy: P.busy,
              res: P.res.map((r, i) => ({
                  i,
                  title: r.title,
                  image: r.image || "",
                  sub: [r.libName, r.year].filter(Boolean).join(" · "),
              })),
          }
        : null;
}
/** the one picked by hand: kept for this show, and its episodes looked up there */
export function libPick(i: number) {
    const r = ui.libPick?.res[i];
    if (!r) return;
    keepPick(r.lib, r.ref, r.title);
    ui.libPick = null;
    libMatchShow();
}
/** the panel closed */
export function libPickClose() {
    ui.libPick = null;
    renderMain();
}
// ── browsing what's on a server ──
const libBrowse: { lib: string | null; items: LibTitle[] | null; busy: boolean; err: string; q: string } = {
    lib: null,
    items: null,
    busy: false,
    err: "",
    q: "",
};
const browseShown = () =>
    libBrowse.items && libBrowse.q
        ? libBrowse.items.filter(x => nameNorm(x.title).includes(nameNorm(libBrowse.q)))
        : libBrowse.items;
/** what's on one of your servers, read in full (page/LibBrowse.svelte) */
export async function libBrowseOpen(id: string | undefined) {
    const l = serversIn("libs").find(x => x.id === id);
    if (!l) return;
    Object.assign(libBrowse, { lib: l.id, items: null, busy: true, err: "" });
    renderMain();
    try {
        libBrowse.items = await LIBAPI(l.type).browse(l);
    } catch (e) {
        libBrowse.err = libReach(e, l);
    }
    libBrowse.busy = false;
    renderMain();
}
/** "On your servers" on the Watch page (page/LibBrowse.svelte): your servers to pick from, and what's on the one picked,
 *  filtered by what's typed (240 at most) */
export function libBrowseView() {
    const L = browseShown();
    return {
        libs: LIBS().map(l => ({ id: l.id, name: l.name || typeName(l.type), on: libBrowse.lib === l.id })),
        read: !!libBrowse.items,
        q: libBrowse.q,
        busy: libBrowse.busy,
        err: libBrowse.err,
        list: L
            ? L.slice(0, 240).map((r, i) => ({
                  i,
                  title: r.title,
                  image: r.image || "",
                  sub: [r.type === "movie" ? "Film" : "Show", r.year].filter(Boolean).join(" · "),
              }))
            : null,
    };
}
/** the filter over what's on a server (Enter, or leaving the box) */
export function libBrowseFilter(q: string) {
    libBrowse.q = q;
    renderMain();
}
/** a title on the server opened on the Watch page */
export function libBrowsePick(i: number) {
    const r = browseShown()?.[i];
    if (r) libOpenEntry(r);
}
// what you picked on a server, kept for the show open now
function keepPick(libId: string, ref: string, title: string) {
    const all = (meta.watchMap = meta.watchMap || {}),
        k = showKey();
    all[k] = { ...(all[k] || {}), [libId]: { ref, title } };
    markDirty();
}
async function libOpenEntry(r: LibTitle) {
    const l = serversIn("libs").find(x => x.id === libBrowse.lib);
    if (!l) return;
    const film = r.type === "movie",
        guess = [...items.entries()].find(
            ([, b]) =>
                (film ? b.medium === "film" : b.medium === "tv" || b.medium === "anime") &&
                titleScore(titleOf(b), r.title) >= 0.8
        );
    const show: WatchShow = guess
        ? { ...guess[1], id: guess[0] }
        : { title: r.title, year: r.year, medium: film ? "film" : "tv", ext: {} };
    await watchOpen(show);
    keepPick(l.id, r.ref, r.title);
    libMatchShow();
}
// ── the servers panel ──
/** one of the two server lists (page/ServerList.svelte): each server's fields, how its test went, and the kinds you can add */
export function serverListView(set: ServerSet = "libs") {
    const st = ui.libTest || {},
        read = set === "rlibs";
    const ph = (l: MediaServer) =>
        ownOf(
            {
                plex: "http://192.168.1.10:32400",
                folder: read ? "https://my-nas.example/manga/" : "https://my-nas.example/videos/",
                komga: "http://192.168.1.10:25600",
                kavita: "http://192.168.1.10:5000",
                opds: "https://example.org/opds",
            },
            l.type
        ) || "http://192.168.1.10:8096";
    const kph = (l: MediaServer) =>
        ownOf(
            {
                folder: "Share token (optional)",
                plex: "Plex token",
                komga: "API key, or email:password",
                kavita: "API key",
                opds: "user:password (if it asks)",
            },
            l.type
        ) || "API key";
    return {
        set,
        read,
        rows: serversIn(set).map(l => {
            const test = ownOf(st, l.id);
            return {
                id: l.id,
                type: typeName(l.type),
                on: l.on !== false,
                name: l.name || "",
                url: l.url || "",
                key: libKey(l),
                ph: ph(l),
                kph: kph(l),
                testing: test === "…",
                from: l.from || "",
                result: test && test !== "…" ? test : null,
            };
        }),
        kinds: LIB_SETS[set].map(t => ({ t, name: typeName(t) })),
    };
}
/** a new, empty server of a kind; its address box is focused */
export function libAdd(set: string | undefined, type: string) {
    const to = setOf(set),
        id = "l" + Date.now().toString(36);
    meta.settings[to] = [...listOf(meta.settings[to]), { id, type, name: typeName(type), url: "", on: true }];
    markDirty();
    renderMain();
    setTimeout(() => $(`[data-lib="${id}"][data-f="url"]`)?.focus(), 30);
}
/** a server removed, with its key */
export function libDel(id: string) {
    const set = libSetOf(id);
    meta.settings[set] = listOf(meta.settings[set]).filter(l => !(isRecord(l) && l.id === id));
    if (KEYS.libs) {
        delete KEYS.libs[id];
        saveKeys();
    }
    LIBIDX.delete(id);
    markDirty();
    renderMain();
}
/** a code a friend can paste to add this server, copied (its key is in it) */
export async function libShare(id: string) {
    const l = libById(id);
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
                        r: libSetOf(id) === "rlibs" ? 1 : 0,
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
/** a friend's server, from the code they sent: false (and a note) when it isn't one */
export function libCode(raw: string): boolean {
    const d = serverFromCode(raw.trim());
    if (!d) {
        toast("That doesn't look like a server code");
        return false;
    }
    const to: ServerSet = d.read ? "rlibs" : "libs",
        id = "l" + Date.now().toString(36);
    meta.settings[to] = [
        ...listOf(meta.settings[to]),
        { id, type: d.type, name: d.name || typeName(d.type), url: d.url, on: true, from: d.from || "a friend" },
    ];
    if (d.key) {
        KEYS.libs = { ...(KEYS.libs || {}), [id]: d.key };
        saveKeys();
    }
    markDirty();
    toast(`Added ${d.name || "their server"}${d.from ? " from " + d.from : ""}`);
    renderMain();
    return true;
}
/** Test: asks the server, and says how it went beside it */
export async function libTest(id: string) {
    const l = libById(id);
    if (!l || !l.url) {
        toast("Add its address first");
        return;
    }
    setTest(l.id, "…");
    renderMain();
    try {
        const r = await (["komga", "kavita", "opds"].includes(l.type) ? OP : LIBAPI(l.type)).test(l);
        setTest(l.id, { ok: true, t: "✓ " + r });
    } catch (err) {
        setTest(l.id, { ok: false, t: libReach(err, l) });
    }
    renderMain();
}
/** a server's box changed: its name, address or key (the key is kept with your keys), or whether it's used */
export function libField(id: string, f: string, v: string | boolean) {
    const l = libById(id);
    if (!l) return;
    if (f === "key") {
        KEYS.libs = { ...(KEYS.libs || {}), [id]: String(v).trim() };
        saveKeys();
    } else if (f === "on") l.on = v === true;
    else if (f === "name" || f === "url") l[f] = String(v).trim();
    LIBIDX.delete(id);
    markDirty();
}
/** a server a friend shared, as its code says (null when it isn't a server code, or names a kind of server there isn't) */
export function serverFromCode(raw: string) {
    let d: Record<string, unknown>;
    try {
        d = fieldsOf(safeJSON(decodeURIComponent(escape(atob(raw.trim().replace(/^UL1:/, ""))))));
    } catch (_) {
        return null;
    }
    const type = textOf(d.t),
        url = textOf(d.u);
    if (!url || !typeName(type)) return null;
    return { type, url, name: textOf(d.n), key: textOf(d.k), from: textOf(d.f), read: !!d.r };
}
const setTest = (k: string, v: "…" | { ok: boolean; t: string }) => {
    ui.libTest = { ...(ui.libTest || {}), [k]: v };
};
