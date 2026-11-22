// src/features/watch-read/watch.ts
// ─────────────────────────────────────────────────────────────────
//  Watch (beta): seasons and episodes, your own copies, a quiet cinema
//
//  It plays files you open, your own media servers (Jellyfin, Plex, a NAS or any folder you host, set up once for every
//  episode) and links on your own network: only your own sources, by one rule (own-sources.ts).
//  Details come from TVmaze, AniList, MyAnimeList (Jikan) and TMDB/Wikidata (episodes.ts). It doesn't look for streams.
// ─────────────────────────────────────────────────────────────────

import {
    addItem,
    at,
    change,
    cleanTitle,
    coverCache,
    entryOf,
    fieldsOf,
    findExisting,
    fmtDate,
    items,
    ITEMS_VER,
    markDirty,
    MEDIA,
    meta,
    norm,
    nowISO,
    numOf,
    ownOf,
    patch,
    plural,
    present,
    quietPatch,
    recordsOf,
    safeJSON,
    scheduleSave,
    statusWord,
    strsOf,
    textOf,
    titleOf,
    toast,
    ui,
    undo,
} from "../core/core";
import { pipToggle, playingVideo } from "./player/pip";
import type { Titled } from "../core/core";
import {
    AL,
    alEpisodes,
    pickShow,
    tmdbEpisodes,
    tmdbSearch,
    tvmazeByImdb,
    tvmazeEpisodes,
    tvmazeSearch,
} from "../sources/sources";
import { TMDB_ON } from "../sources/proxy";
import { alNumbered, jikanFill, malOf, tvFill, unnamed } from "./episodes";
import { partsOf } from "../core/parts";
import { renderMain } from "../core/shell";
import { closeModal } from "../core/modals";
import { isOwnSource, NOT_OWN_SOURCE } from "./own-sources";
import { savedLink, ssList, ssSources } from "./series";
import { subChoose, subRefresh } from "./stream";
import { cinFull, introSkip, panelsClose, pcSeekBy, srvPreferred } from "./player";
import { videoRelease } from "./player/video";
import { subToggle } from "./player/subtitles";
import { langCode, subFor } from "./player/lang";
import { firstPlayable } from "./playable";
import { routeLeave, routePlayer } from "./route";
import { frameOf } from "./player/view";
import { stageChanged } from "./stage-state.svelte";
import { stageOffNote, stageOn } from "../extensions/builtins";
import { libMatchShow, LIBS } from "./medialibs";
import { cinRefreshIfEmpty, watchSearch } from "./stage";
import { closeCtx } from "../core/keys";
import { extAddSources } from "../extensions/extensions";
import { render } from "../core/navigation";
import { finishItem, logProgress } from "../library/item-actions";
import { cleanCandidate } from "../core/actions";
import type { Candidate, Entry, Episode, WatchPlayer, WatchSeason, WatchShow, WatchSource } from "../core/model";

/** the Watch page's state */
export const W: {
    view: string;
    q: string;
    results: Candidate[] | null;
    busy: boolean;
    show: WatchShow | null;
    seasons: WatchSeason[];
    si: number;
    files: Map<string, Blob | { url: string }>; // by "season:episode": a file you opened, or a link not yet saved
    player: WatchPlayer | null;
    lib: Map<string, WatchSource[]>; // by "season:episode": what your media servers have
    libImg: Map<string, string>; // …and their pictures
    libNote: string;
    libMiss: boolean;
    lastKey?: string | null; // where the playing episode's position is saved
    pageStale?: boolean; // the page behind the player changed, so it's drawn again when the player closes
    tv?: { key: string; eps: Episode[] } | null; // TVmaze's episodes of the open anime, lined up with AniList's
    vol?: { muted: boolean; last: number }; // volume and mute, carried from one video to the next
    backY?: number; // how far down the search was when a show was opened from it (Back puts it there again)
} = {
    view: "home",
    q: "",
    results: null,
    busy: false,
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
/** the player's settings, as you chose them */
export type PlayerPrefs = {
    autoNext: boolean;
    speed: number;
    skip: number; // how far S jumps when nobody knows where the opening ends
    seek: number; // how far the ⟲ ⟳ buttons, a double tap and ← → jump
    fit: string; // the picture: "contain" (fit), "cover" (fill) or "fill" (stretch)
    subSize: number; // %
    subPos: number; // lines up from the bottom
    subBg: number; // how dark the box behind subtitles is, %
    resume: boolean;
    hideUI: boolean;
    volume: number;
    startMode: string;
    subLang: string;
    netBadge: boolean;
    layout?: string; // "docked" or "cinema"
    lights?: boolean;
    v?: number; // the version they were saved by (savedPlayer)
};
const PLAYER_DEF: PlayerPrefs = {
    autoNext: true,
    speed: 1,
    skip: 85,
    seek: 15,
    fit: "contain",
    subSize: 100,
    subPos: 0,
    subBg: 55,
    resume: true,
    hideUI: true,
    volume: 1,
    startMode: "now",
    subLang: "en",
    netBadge: true,
};
// Settings saved before version 2 held every default as it was then (the whole set was written back on each change),
// so a default that changed since (the picture's fit, how far a jump goes) was stuck: those two are let go once.
const PLAYER_V = 2;
const STALE_DEFAULTS = ["fit", "seek"];
// a saved choice of the kind its default is, or the default (settings come from storage and backups)
const boolOr = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
const strOr = (x: unknown, d: string) => (typeof x === "string" ? x : d);
const optBool = (x: unknown) => (typeof x === "boolean" ? x : undefined);
const optStr = (x: unknown) => (typeof x === "string" ? x : undefined);
export const PS = (): PlayerPrefs => {
    const s = savedPlayer(),
        d = PLAYER_DEF;
    return {
        autoNext: boolOr(s.autoNext, d.autoNext),
        speed: numOf(s.speed) ?? d.speed,
        skip: numOf(s.skip) ?? d.skip,
        seek: numOf(s.seek) ?? d.seek,
        fit: strOr(s.fit, d.fit),
        subSize: numOf(s.subSize) ?? d.subSize,
        subPos: numOf(s.subPos) ?? d.subPos,
        subBg: numOf(s.subBg) ?? d.subBg,
        resume: boolOr(s.resume, d.resume),
        hideUI: boolOr(s.hideUI, d.hideUI),
        volume: numOf(s.volume) ?? d.volume,
        startMode: strOr(s.startMode, d.startMode),
        // your subtitle language, as a two-letter code; "off" (which turning subtitles off used to save for good) is
        // your default language again: subtitles are on unless you turn them off for one video
        subLang: langCode(strOr(s.subLang, d.subLang)) || d.subLang,
        netBadge: boolOr(s.netBadge, d.netBadge),
        layout: optStr(s.layout),
        lights: optBool(s.lights),
        v: PLAYER_V,
    };
};
// what's saved, with the stale defaults of an older version left out
function savedPlayer(): Record<string, unknown> {
    const s = { ...fieldsOf(meta.settings.player) };
    if (s.v !== PLAYER_V) for (const k of STALE_DEFAULTS) delete s[k];
    return s;
}
/** some of the player's settings changed: only what you changed is kept, so a better default reaches you later */
export function playerSave(change: Partial<PlayerPrefs>) {
    meta.settings.player = { ...savedPlayer(), ...change, v: PLAYER_V };
    markDirty();
}
/** your media servers' link patterns that are on */
export const servers = () => (meta.settings.servers || []).filter(s => s.on !== false && s.pattern);
/** [season, episode] from a file's name (season 0: it doesn't say), or null */
export const parseEp = (name: string): [number, number] | null => {
    const n = String(name);
    let m = /s(\d{1,2})[ ._-]*e(\d{1,4})/i.exec(n) || /(\d{1,2})x(\d{1,3})/.exec(n);
    if (m) return [+m[1], +m[2]];
    m = /(?:ep?|episode|第)[ ._-]*(\d{1,4})/i.exec(n) || /[ ._\-[]\s*(\d{1,3})\s*[\]._ -]/.exec(" " + n + " ");
    return m ? [0, +m[1]] : null;
};
export const posKey = (si: number, e: number) =>
    (W.show ? W.show.groupId || W.show.id || W.show.title : "x") + ":" + si + ":" + e;
// where you stopped in each episode, kept in this browser
export const loadPos = (): Record<string, unknown> => {
    try {
        return fieldsOf(safeJSON(localStorage.getItem("ul-pos") || "{}"));
    } catch (_) {
        return {};
    }
};
export const savePos = (k: string, t: number) => {
    try {
        const P = loadPos();
        if (t) P[k] = Math.floor(t);
        else delete P[k];
        localStorage.setItem("ul-pos", JSON.stringify(P));
    } catch (_) {}
};
// a show you put together under one name (meta.watchGroups)
export const groupName = (gid: string | undefined) => (gid ? meta.watchGroups?.[gid]?.name : undefined);
const NOT_SEASONS = new Set(["Movie", "Special", "Music"]);
// anime split into separate AniList entries (Bungo Stray Dogs 1, 2, 3…) become one show with seasons: the sequel chain in your library
export function animeChain(id: string): Entry[] {
    const seen = new Set([id]),
        q = [id];
    while (q.length) {
        const x = items.get(q.shift() ?? "");
        for (const l of (x && x.links) || [])
            if ((l.type === "sequel" || l.type === "prequel") && !seen.has(l.id)) {
                const y = items.get(l.id);
                if (y && y.medium === "anime" && !NOT_SEASONS.has(y.kind ?? "")) {
                    seen.add(l.id);
                    q.push(l.id);
                }
            }
    }
    const L = [...seen]
        .map(entryOf)
        .filter(present)
        .filter(b => b.title)
        .sort(
            (a, b) =>
                (a.year || 0) - (b.year || 0) ||
                String(a.season || "").localeCompare(String(b.season || "")) ||
                titleOf(a).localeCompare(titleOf(b))
        );
    // follow the prequel → sequel links so seasons come out in watching order, even when two aired the same year
    const inSet = new Set(L.map(b => b.id)),
        link = (b: Entry, t: string) => (b.links || []).find(l => l.type === t && inSet.has(l.id))?.id;
    const out: Entry[] = [],
        used = new Set<string>();
    for (const root of L.filter(b => !link(b, "prequel"))) {
        let x: Entry | undefined = root;
        while (x && !used.has(x.id)) {
            used.add(x.id);
            out.push(x);
            const n = link(x, "sequel");
            x = n ? L.find(b => b.id === n) : undefined;
        }
    }
    return [...out, ...L.filter(b => !used.has(b.id))];
}
// the seasons of a show: your combined entries, AniList's sequel links, and releases named like seasons of it
export const seasonStem = (t: string): string => {
    let x = norm(cleanTitle(t)),
        y: string;
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
/** an anime that's a season of a show (not a film, a special or a music video) */
export const isSeasonish = (b: { medium?: string; kind?: string } | null | undefined): boolean =>
    !!b && b.medium === "anime" && !NOT_SEASONS.has(b.kind ?? "");
const SEASON_ORD: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
const seasonOrd = (s: unknown) => ownOf(SEASON_ORD, String(s || "").toUpperCase()) ?? 4;
/** a show's seasons in the order they aired */
export const seasonSort = (
    a: Titled & { year?: number | null; season?: unknown },
    b: Titled & { year?: number | null; season?: unknown }
) =>
    (a.year || 9999) - (b.year || 9999) ||
    seasonOrd(a.season) - seasonOrd(b.season) ||
    String(cleanTitle(titleOf(a))).localeCompare(String(cleanTitle(titleOf(b))), undefined, { numeric: true });
// every entry that could be a season of a show, by the name its seasons share (seasonStem), with its place in the
// library: worked out once per change to the library (ITEMS_VER), not once per show. Rank's Seasons panel asks for
// every show's seasons, and going through a 10,000-entry library for each one took seconds
let STEMS: { ver: number; size: number; by: Map<string, { id: string; at: number }[]> } | null = null;
function stemIndex() {
    if (STEMS && STEMS.ver === ITEMS_VER && STEMS.size === items.size) return STEMS.by;
    const by = new Map<string, { id: string; at: number }[]>();
    let at = 0;
    for (const [id, x] of items) {
        at++;
        if (!isSeasonish(x)) continue;
        const k = seasonStem(x.title),
            L = by.get(k);
        if (L) L.push({ id, at });
        else by.set(k, [{ id, at }]);
    }
    STEMS = { ver: ITEMS_VER, size: items.size, by };
    return by;
}
export function seasonChain(id: string): Entry[] {
    const b = items.get(id),
        root = b && b.partOf && items.has(b.partOf) ? b.partOf : id,
        ids = new Set<string>();
    const addChain = (x: string) => {
        for (const y of animeChain(x))
            if (!ids.has(y.id)) {
                ids.add(y.id);
                for (const p of partsOf(items.get(y.id))) ids.add(p);
            }
    };
    ids.add(root);
    for (const p of partsOf(items.get(root))) ids.add(p);
    addChain(root);
    // releases titled as later seasons that AniList's links in your library don't reach (Bungo Stray Dogs 4 and 5):
    // looked up by name in the index, and taken in the library's own order, as a pass over the whole library would
    const stems = new Set([...ids].map(i => seasonStem(items.get(i)?.title ?? ""))),
        idx = stemIndex(),
        found = [...stems].flatMap(t => idx.get(t) || []).sort((a, b) => a.at - b.at);
    for (const { id: i } of found)
        if (!ids.has(i)) {
            ids.add(i);
            addChain(i);
        }
    const L = [...ids].map(entryOf).filter(present).filter(isSeasonish);
    return L.length > 1 ? L.sort(seasonSort) : animeChain(root);
}
/** the name the entries have in common ("Bungo Stray Dogs" for its seasons) */
export function commonName(list: Titled[]): string {
    const T = list.map(b => cleanTitle(titleOf(b)));
    let p = T[0] || "";
    for (const t of T) while (p && !t.startsWith(p)) p = p.slice(0, -1);
    return (p.replace(/[\s:\-–—]+$/, "").trim().length > 2 ? p.replace(/[\s:\-–—]+$/, "").trim() : T[0]) || "";
}
/** your link patterns, for the servers panel (page/WatchServers.svelte) */
export const patternsView = () =>
    (meta.settings.servers || []).map((x, i) => ({
        i,
        on: x.on !== false,
        name: textOf(x.name),
        pattern: x.pattern || "",
    }));
/** a link pattern's box changed: false (and a note) when the address isn't one of your own sources, which isn't kept */
export function patternSet(i: number, f: "on" | "name" | "pattern", v: string | boolean): boolean {
    const S = meta.settings.servers || [];
    if (!S[i]) return false;
    // a link pattern must point at your own network or a server you've added (own-sources.ts)
    if (f === "pattern" && typeof v === "string" && v.trim() && !isOwnSource(v.trim())) {
        toast(NOT_OWN_SOURCE);
        return false;
    }
    S[i] = { ...S[i], [f]: typeof v === "string" ? v.trim() : v };
    markDirty();
    return true;
}
// ----- one show -----
/** the library entry for a season, with its id (entries are stored without one, so buttons that open or change it need it added) */
export const seasonItem = (si: number | undefined): Entry | null => {
    const S = si === undefined ? undefined : W.seasons[si];
    return S && S.member ? entryOf(S.member) : null;
};
/** the key a saved link for one episode is kept under, on its season's entry */
export function srcKey(si: number, e: number): string {
    const s = W.show;
    return s?.medium === "film" ? "film" : s?.groupId ? "E" + e : "S" + W.seasons[si]?.n + "E" + e;
}
export function epWatched(si: number, e: number): boolean {
    const b = seasonItem(si);
    if (!b) return false;
    if (W.show?.medium === "film") return b.status === "done";
    if (W.show?.medium === "anime") return (b.prog || 0) >= e;
    return (b.epsSeen || []).includes(W.seasons[si].n + "x" + e);
}
export function epHasSource(si: number, e: number): boolean {
    return !!(
        W.files.get(si + ":" + e) ||
        W.lib.has(si + ":" + e) ||
        savedLink(si, e) ||
        servers().length ||
        ssList().length
    );
}
/** how the player's page is laid out: the blocks (the seasons with their episodes, and the description), each under
 *  the player, beside it on the right or the left, or off; and the episodes as numbers or as detailed rows */
export interface WatchPage {
    v?: number;
    eps: string; // the episode list: "numbers" or "detailed"
    thumbs: boolean; // detailed rows: pictures
    desc: boolean; // …and the episodes' descriptions
    order: string[]; // the blocks, in order
    place: Record<string, string>; // each block: "main" (under), "side" (right), "left" or "off"
}
/** where a block can go */
export const WP_PLACES = ["main", "side", "left", "off"];
// under the player, the seasons with their episodes first and then the description, as a streaming site lays it out
const WP_DEF = {
    eps: "numbers",
    thumbs: true,
    desc: true,
    order: ["eps", "about"],
    place: { eps: "main", about: "main" },
};
export const WP_NAMES: Record<string, string> = { eps: "Seasons & episodes", about: "Description" };
// The page was laid out differently before version 2 (seasons and episodes were two blocks, the buttons could be
// moved anywhere): only the choice of numbers or detailed rows carries over, everything else starts from the defaults
const WP_V = 2;
export const WP = (): WatchPage => {
    const s = fieldsOf(meta.settings.watchPage),
        now = s.v === WP_V,
        saved = fieldsOf(s.place);
    const order = now
        ? [...new Set([...strsOf(s.order).filter(k => WP_DEF.order.includes(k)), ...WP_DEF.order])]
        : [...WP_DEF.order];
    const place: Record<string, string> = { ...WP_DEF.place };
    if (now)
        for (const k of WP_DEF.order) {
            const v = saved[k];
            if (typeof v === "string" && WP_PLACES.includes(v)) place[k] = v;
        }
    return {
        v: WP_V,
        eps: s.eps === "detailed" ? "detailed" : WP_DEF.eps,
        thumbs: boolOr(s.thumbs, WP_DEF.thumbs),
        desc: boolOr(s.desc, WP_DEF.desc),
        order,
        place,
    };
};
export const wpSave = (p: WatchPage) => {
    meta.settings.watchPage = { ...p, v: WP_V };
    markDirty();
};
/** the show open on the Watch page (page/ShowPage.svelte): its header, its seasons, and the season's episodes with
 *  what each can do; worked out when the page is asked to draw */
export function showView() {
    const s = W.show;
    if (!s) return null;
    const S: WatchSeason = W.seasons[W.si] || { n: 1, label: "", eps: [] },
        b = seasonItem(W.si),
        grouped = !!s.groupId,
        P = loadPos(),
        wp = WP(),
        film = s.medium === "film",
        nss = ssList().length,
        libs = LIBS().length;
    return {
        grouped,
        film,
        style: grouped ? "" : `--wb:url('${coverCache.src(s.banner || s.cover || "").replace(/'/g, "%27")}')`,
        poster: !grouped && s.cover ? coverCache.src(s.cover) : "",
        eyebrow: [ownOf(MEDIA, s.medium ?? "")?.one, grouped ? plural(W.seasons.length, "season") : s.year, s.creator]
            .filter(Boolean)
            .join(" · "),
        name: grouped ? groupName(s.groupId) || s.title : s.title,
        about: !grouped && s.about && wp.place.about !== "off" ? s.about.slice(0, 420) : "",
        entry: b ? { id: b.id, pill: "pill " + b.status, word: statusWord(b.status, s.medium) } : null,
        servers: "Servers" + (nss ? " · " + nss : ""),
        // what your servers said: "● On Living room (6 episodes) ", or what went wrong, and a way to pick by hand
        note: W.libNote ? (W.libMiss ? "" : "● ") + W.libNote + " " : "",
        miss: W.libMiss,
        pick: libs ? (W.libMiss ? "Pick it…" : "Not the right one?") : "",
        picking: !!ui.libPick,
        seasons:
            W.seasons.length > 1
                ? W.seasons.map((x, i) => ({
                      i,
                      label: x.label + " ",
                      on: i === W.si,
                      cn: `${x.eps ? x.eps.filter(e => epWatched(i, e.e)).length : seasonItem(i)?.prog || 0}/${(x.eps || []).length || seasonItem(i)?.total || "?"}`,
                  }))
                : [],
        loading: !!S.loading,
        si: W.si,
        eps: (S.eps || []).map(e => {
            const pos = numOf(P[posKey(W.si, e.e)]),
                seen = epWatched(W.si, e.e),
                img = e.image || W.libImg.get(W.si + ":" + e.e) || "",
                src = epHasSource(W.si, e.e);
            return {
                e: e.e,
                seen,
                img,
                title: film
                    ? s.title
                    : img
                      ? `${e.e}. ${e.title || "Episode " + e.e}`
                      : e.title && !/^Episode \d+$/i.test(e.title)
                        ? e.title
                        : "",
                meta: [
                    e.date ? fmtDate(e.date) : "",
                    e.runtime ? e.runtime + " min" : "",
                    pos && !seen ? "stopped at " + Math.floor(pos / 60) + " min" : "",
                ]
                    .filter(Boolean)
                    .join(" · "),
                about: e.about ? e.about.slice(0, 160) : "",
                play: src ? (pos && !seen ? " Resume" : " Play") : "",
                src,
            };
        }),
    };
}
/** the name for seasons watched together as one show (its box on the show's page) */
export function groupNameSet(v: string) {
    const sh = W.show;
    if (!sh || !sh.groupId) return;
    const groups = meta.watchGroups || (meta.watchGroups = {});
    groups[sh.groupId] = { ...(groups[sh.groupId] || {}), name: v.trim() || sh.title };
    markDirty();
}
// a catalogue id kept as a number or as text
const idOf = (x: unknown): number | string | undefined =>
    (typeof x === "number" || typeof x === "string") && x ? x : undefined;
export async function loadWatchSeason(si: number) {
    const S = W.seasons[si];
    if (!S || S.eps || S.loading) return;
    S.loading = true;
    if (ui.page === "watch") renderMain();
    const b = S.member ? items.get(S.member) : undefined,
        ext: Record<string, unknown> = (b && b.ext) || S.ext || {};
    let n = (b && b.total) || S.total || 0,
        listed: { title: string; thumbnail: string }[] = [],
        mal = malOf(S);
    const alId = Number(ext.anilist) || 0;
    if (alId) {
        try {
            const d = await alEpisodes(alId);
            n = d.total || n;
            listed = d.eps || [];
            mal = mal || d.mal || 0;
        } catch (_) {}
    }
    S.eps = alNumbered(listed, n);
    const anime = W.show?.medium === "anime";
    if (anime) await tvFill(si);
    S.loading = false;
    if (ui.page === "watch") renderMain();
    cinSideRedraw();
    // the names still missing, from MyAnimeList: in the background, as there can be several pages of them
    if (anime && mal && S.eps.some(e => unnamed(e.title)))
        jikanFill(S, mal).then(named => {
            if (!named || !W.seasons.includes(S)) return;
            if (ui.page === "watch") renderMain();
            cinSideRedraw();
        });
}
/** where to start, when it isn't where you left off: a season (of W.seasons) and an episode (null: a film) */
type StartAt = { si: number; e: number | null };
/** opens a show (an entry of yours, or what a search found) on the Watch page, and its player unless told not to; at
 *  a season and episode when it's given one (the player's address after a refresh) */
export async function watchOpen(show: WatchShow, opts: { play: boolean; at?: StartAt } = { play: true }) {
    const lib =
        show.id && items.has(show.id) ? show.id : findExisting(show.title, show.creator || "", show.medium, show.ext);
    const sh: WatchShow = { ...show, id: lib || null };
    W.show = sh;
    // another show opened while this one was still being looked up: what arrives for this one is left out
    const left = () => W.show !== sh;
    // where the search was, for Back (opening one show from another's player keeps the first place)
    if (!W.player) W.backY = window.scrollY;
    W.view = "show";
    W.seasons = [];
    W.si = 0;
    window.scrollTo({ top: 0, behavior: "instant" });
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
        if (opts.play && !left()) watchAutoPlay(opts.at);
        return;
    }
    if (show.medium === "anime") {
        const chain = lib && meta.settings.seasonsMode !== "separate" ? seasonChain(lib) : [];
        if (chain.length > 1) {
            const gid = "g-" + chain[0].id;
            const groups = (meta.watchGroups = meta.watchGroups || {});
            if (!groups[gid]) {
                groups[gid] = { name: commonName(chain) };
                markDirty();
            }
            sh.groupId = gid;
            sh.title = groups[gid].name || sh.title;
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
        await Promise.all([loadWatchSeason(W.si), alMoreSeasons(sh)]);
        if (left()) return;
        await libMatchShow();
        if (opts.play && !left()) watchAutoPlay(opts.at);
        return;
    }
    W.busy = true;
    renderMain();
    try {
        let id = idOf(show.ext?.tvmaze);
        const imdb = textOf(show.ext?.imdb);
        if (!id && imdb) {
            const t = await tvmazeByImdb(imdb);
            id = t ? t.ext.tvmaze : undefined;
        }
        if (!id) {
            const r = pickShow(await tvmazeSearch(cleanTitle(show.title)).catch(() => []), {
                title: show.title,
                year: show.year,
            });
            id = r ? r.ext.tvmaze : undefined;
        }
        // TVmaze doesn't know it: TMDB's seasons, when TMDB is set up (the site lends it)
        let tmdbId = !id && TMDB_ON() ? numOf(show.ext?.tmdb) : undefined;
        if (!id && TMDB_ON() && !tmdbId) {
            const r = pickShow(await tmdbSearch(cleanTitle(show.title), "tv").catch(() => []), {
                title: show.title,
                year: show.year,
            });
            tmdbId = numOf(r?.ext?.tmdb);
        }
        if (id || tmdbId) {
            const eps = id ? await tvmazeEpisodes(id) : tmdbId ? await tmdbEpisodes(tmdbId) : [];
            if (left()) return void (W.busy = false);
            const by = new Map<number, Episode[]>(),
                seenE = new Set<string>();
            for (const e of eps) {
                const k = e.s + "x" + e.e;
                if (e.e == null || seenE.has(k)) continue;
                seenE.add(k);
                by.set(e.s, [...(by.get(e.s) || []), e]);
            }
            W.seasons = [...by.keys()]
                .sort((a, b) => a - b)
                .map(s => ({ n: s, label: "Season " + s, member: lib, eps: by.get(s) }));
            if (lib)
                W.si = Math.max(
                    0,
                    W.seasons.findIndex((x, i) => (x.eps || []).some(e => !epWatched(i, e.e)))
                );
        }
    } catch (_) {}
    if (left()) return void (W.busy = false);
    if (!W.seasons.length) W.seasons = [{ n: 1, label: "Season 1", member: lib, eps: [] }];
    W.busy = false;
    if (ui.page === "watch") renderMain();
    await libMatchShow();
    if (opts.play && !left()) watchAutoPlay(opts.at);
}
/** a season AniList knows: what alMoreSeasons asks for */
interface AlSeason {
    id: number;
    format: string;
    episodes: number | null;
    seasonYear: number | null;
    season: string;
    title: { romaji: string; english: string };
}
const alSeasonOf = (x: unknown): AlSeason | null => {
    const m = fieldsOf(x),
        id = numOf(m.id);
    return id === undefined
        ? null
        : {
              id,
              format: textOf(m.format),
              episodes: numOf(m.episodes) ?? null,
              seasonYear: numOf(m.seasonYear) ?? null,
              season: textOf(m.season),
              title: { romaji: textOf(at(m, "title", "romaji")), english: textOf(at(m, "title", "english")) },
          };
};
// the seasons you haven't added yet: AniList's sequel and prequel chain (Bungo Stray Dogs 4 and 5 when your library stops at 3)
async function alMoreSeasons(sh: WatchShow) {
    if (meta.settings.seasonsMode === "separate") return;
    const alOf = (S: WatchSeason) => (S.member ? items.get(S.member)?.ext.anilist : S.ext?.anilist);
    const start = W.seasons.map(S => S.member && alOf(S)).find(Boolean) || sh.ext?.anilist;
    if (!start) return;
    const want = new Set(["TV", "TV_SHORT", "ONA"]),
        seen = new Map<number, AlSeason>(),
        q = [Number(start)];
    let calls = 0;
    try {
        while (q.length && calls < 10) {
            const id = q.shift() ?? 0;
            if (seen.has(id)) continue;
            calls++;
            const d = await AL.q(
                `query($id:Int){ Media(id:$id){ id format episodes seasonYear season title { romaji english } relations { edges { relationType node { id format type } } } } }`,
                { id },
                undefined,
                0,
                true
            );
            const media = at(d, "Media"),
                m = alSeasonOf(media);
            if (!m) continue;
            seen.set(id, m);
            for (const e of recordsOf(at(media, "relations", "edges"))) {
                const node = fieldsOf(e.node),
                    nid = numOf(node.id);
                if (
                    (e.relationType === "SEQUEL" || e.relationType === "PREQUEL") &&
                    node.type === "ANIME" &&
                    want.has(textOf(node.format)) &&
                    nid !== undefined &&
                    !seen.has(nid)
                )
                    q.push(nid);
            }
        }
    } catch (_) {
        return;
    }
    // you've moved on to another show meanwhile: these seasons aren't its
    if (W.show !== sh || seen.size < 2) return;
    const have = new Set(W.seasons.map(S => String(alOf(S))));
    const add = [...seen.values()].filter(
        m => want.has(m.format) && !have.has(String(m.id)) && (m.format !== "ONA" || !m.episodes || m.episodes >= 6)
    );
    if (!add.length) return;
    const lang = meta.settings.titleLang === "romaji" ? "romaji" : "english",
        cur = W.seasons[W.si];
    const all2: { S: WatchSeason; year: number | null | undefined; season: unknown; t: string }[] = [
        ...W.seasons.map(S => {
            const b = S.member ? items.get(S.member) : undefined;
            return { S, year: b ? b.year : S.year, season: b ? b.season : S.season, t: S.label };
        }),
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
            (ownOf(SEASON_ORD, String(a.season)) ?? 4) - (ownOf(SEASON_ORD, String(b.season)) ?? 4) ||
            String(a.t).localeCompare(String(b.t), undefined, { numeric: true })
    );
    // the seasons already there stay the same objects, so an episode list still loading lands in the one on the page,
    // and you stay on the season you were on
    W.seasons = all2.map((x, i) => Object.assign(x.S, { n: i + 1 }));
    if (!sh.groupId) {
        const gid = "g-" + (sh.id || "x" + start);
        const groups = (meta.watchGroups = meta.watchGroups || {});
        if (!groups[gid]) {
            groups[gid] = { name: cleanTitle(titleOf(sh)) };
            markDirty();
        }
        sh.groupId = gid;
    }
    W.si = Math.max(0, cur ? W.seasons.indexOf(cur) : 0);
    if (W.player) W.player.si = W.si;
    if (ui.page === "watch") renderMain();
    cinSideRedraw();
}
// opening something lands on its player page: the next episode cued, playing straight away if it's on your servers or in a file you added
async function watchAutoPlay(at?: StartAt) {
    if (ui.page !== "watch" || !W.show) return;
    // a place asked for (the address after a refresh): that season and episode, if the show has them
    if (at && W.seasons[at.si]) {
        W.si = at.si;
        await loadWatchSeason(at.si);
        if (W.show.medium === "film" || at.e == null) return watchStart(W.si, 1, { empty: true });
        if (!W.seasons[at.si].eps?.length || W.seasons[at.si].eps?.some(x => x.e === at.e))
            return watchStart(W.si, at.e, { empty: true });
    }
    // the first season you haven't finished
    const film = W.show.medium === "film",
        done = (i: number) => {
            const S = W.seasons[i],
                b = seasonItem(i);
            return !!S && (S.eps && S.eps.length ? S.eps.every(x => epWatched(i, x.e)) : !!b && b.status === "done");
        };
    if (!film && done(W.si)) {
        const i = W.seasons.findIndex((_, i) => i > W.si && !done(i));
        if (i > 0) {
            W.si = i;
            await loadWatchSeason(i);
        }
    }
    const eps = (W.seasons[W.si] || {}).eps || [];
    const e = film ? 1 : (eps.find(x => !epWatched(W.si, x.e)) || eps[0] || { e: 1 }).e;
    watchStart(W.si, e, { empty: true });
}
/** opens an entry on the Watch page */
export function watchFromItem(id: string | undefined) {
    const b = id ? items.get(id) : undefined;
    if (!id || !b) return;
    if (!stageOn()) {
        stageOffNote();
        return;
    }
    closeCtx();
    closeModal();
    ui.page = "watch";
    render();
    watchOpen({ ...b, id });
}
// ----- sources -----
/** a link pattern filled in for one episode ({title}, {season}, {e2}…) */
export function fillPattern(p: string, si: number, e: number): string {
    const S = W.seasons[si],
        sh = W.show,
        abs = W.seasons.slice(0, si).reduce((a, x) => a + ((x.eps || []).length || 0), 0) + e,
        pad = (n: number) => String(n).padStart(2, "0");
    const title = (sh && sh.groupId ? groupName(sh.groupId) : null) || cleanTitle(sh ? sh.title : ""),
        stitle = S && S.title ? cleanTitle(S.title) : title;
    return p
        .replace(/\{title\}/g, encodeURIComponent(title).replace(/%20/g, " "))
        .replace(/\{stitle\}/g, encodeURIComponent(stitle).replace(/%20/g, " "))
        .replace(/\{year\}/g, String((sh && sh.year) || ""))
        .replace(/\{season\}/g, String(S ? S.n : 1))
        .replace(/\{episode\}/g, String(e))
        .replace(/\{s2\}/g, pad(S ? S.n : 1))
        .replace(/\{e2\}/g, pad(e))
        .replace(/\{abs\}/g, String(abs))
        .replace(/ /g, "%20");
}
/** every source for one episode, yours only */
export function sourcesFor(si: number, e: number): WatchSource[] {
    const out: WatchSource[] = [],
        f = W.files.get(si + ":" + e),
        own = savedLink(si, e);
    if (f) out.push(f instanceof Blob ? { name: "Your file", file: f } : { name: "Your link", url: f.url });
    if (own) out.push({ name: "Saved link", url: own.url });
    for (const x of W.lib.get(si + ":" + e) || []) out.push(x);
    out.push(...ssSources(si, e)); // this series' own servers
    for (const s of servers()) out.push({ name: textOf(s.name) || "Server", url: fillPattern(s.pattern || "", si, e) });
    return out.filter(isOwnSource); // only your own (own-sources.ts)
}
/** a file or a link for one episode: a link is kept on its entry, a file only while the page is open */
export function watchSetSource(si: number, e: number, val: { file: Blob } | { url: string }) {
    if ("file" in val) {
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
    quietPatch(b.id, { sources: { ...fieldsOf(b.sources), [srcKey(si, e)]: { url: val.url, at: nowISO() } } });
    scheduleSave();
    renderMain();
    cinRefreshIfEmpty();
}
export function watchPickFiles() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "video/*,.mkv,.mp4,.webm,.m4v,.mov";
    inp.multiple = true;
    inp.onchange = () => {
        const F = [...(inp.files || [])];
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
function playFile(f: File) {
    W.player = { title: f.name, srcs: [{ name: "Your file", file: f }], k: 0, single: true };
    renderPlayer();
}
// ----- the cinema -----
export function watchStart(si: number, e: number, o: { empty?: boolean } = {}) {
    const L = sourcesFor(si, e);
    if (!L.length && !o.empty && !W.player) {
        toast("Add a file, a link or a server first");
        return;
    }
    const s = W.show;
    if (!s) return;
    const S = W.seasons[si],
        named = s.groupId ? groupName(s.groupId) || s.title : s.title,
        title = s.medium === "film" ? s.title : `${named} · ${W.seasons.length > 1 ? S.label + " · " : ""}Episode ${e}`;
    const show = s.medium === "film" ? s.title : named,
        ep = ((S && S.eps) || []).find(x => x.e === e);
    W.player = {
        title,
        show,
        epTitle: ep && ep.title && !/^Episode \d+$/i.test(ep.title) ? ep.title : "",
        film: s.medium === "film",
        si,
        e,
        srcs: L,
        k: firstPlayable(L),
        marked: epWatched(si, e),
        listSi: si,
    };
    {
        const pi = srvPreferred(W.player);
        if (pi > 0) W.player.k = pi;
    }
    renderPlayer();
    routePlayer();
    extAddSources(W.player);
}
// the player's component, as main.ts hands it over (watch-read/surfaces.ts): this module doesn't import it, as it imports this
let playerUI: { show: () => void; hide: () => void } | null = null;
export function useSveltePlayer(ui: { show: () => void; hide: () => void }) {
    playerUI = ui;
}
/** draws the player afresh around a new <video> for what's playing now (another episode or server, the other layout, a
 *  converted stream started from a new point), or closes it when nothing is playing (W.player null). Your place, the
 *  volume and mute carry over. Something that only changes what's around the video draws with playerRedraw() */
export function renderPlayer() {
    const p = W.player,
        old = playingVideo();
    if (!p) {
        if (old) {
            if (W.lastKey) savePos(W.lastKey, old.currentTime);
            videoRelease(old);
        }
        playerUI?.hide();
        // the player's step in the history goes with it (a refresh mustn't open it again)
        routeLeave();
        document.body.classList.remove("cinema-on");
        if (W.pageStale && ui.page === "watch") renderMain();
        return;
    }
    if (old) {
        W.vol = W.vol || { muted: false, last: 0.6 };
        W.vol.muted = old.muted;
        if (old.volume > 0.02) W.vol.last = old.volume;
        // the outgoing video stops here and lets go of its stream, so it can't go on playing (or start, when it was
        // still loading) under the next one
        videoRelease(old);
    } // what you set on the outgoing video carries to the next
    document.body.classList.add("cinema-on");
    const src: WatchSource = p.srcs[p.k] || {};
    // a converted stream can't seek, so it starts where you are: the time goes into its link and the player counts from there
    if (src.how === "converted" && !src.file) {
        const k0 = p.e != null ? posKey(p.si ?? 0, p.e) : null,
            at0 = p.keepAt || (k0 && PS().resume && numOf(loadPos()[k0])) || 0;
        p.offset = Math.max(0, Math.floor(at0));
    } else p.offset = 0;
    if ((src.info || src.url) !== p.subFor) {
        p.subFor = src.info || src.url;
        p.subList = [];
        p.subPick = undefined;
    }
    p.frame = frameOf(p);
    p.intro = null;
    // the news first, so a player drawn for the first time starts with this video, not one it replaces at once
    stageChanged("video", "player", "side", "srv", "subs", "mark", "look");
    playerUI?.show();
}
/** the player draws again around the same video (a panel opened, a button moved, the page rearranged): what's
 *  playing carries on where it is */
export function playerRedraw() {
    if (!W.player) return;
    stageChanged("player", "side", "srv", "subs", "mark", "look");
}
/** the blocks beside and under the player, and this page's settings, draw again */
export function cinSideRedraw() {
    if (W.player) stageChanged("side");
}
/** what a server is, in a few words: its name, how it plays, whose it is */
export const srvDesc = (x: WatchSource) =>
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
/** the player's server button and list draw again, if that player is still the one open (a server arriving late mustn't
 *  restart what's playing) */
export function srvRefresh(p: WatchPlayer) {
    if (W.player === p) stageChanged("srv");
}
export function watchStep(d: number) {
    const p = W.player;
    if (!p || p.e == null) return;
    let si = p.si ?? 0,
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
    const v = playingVideo();
    if (v && W.lastKey) savePos(W.lastKey, v.currentTime);
    watchStart(si, e);
}
export function watchMark(si: number, e: number, on = true, force = false) {
    const sh = W.show;
    if (!sh) return;
    let b = seasonItem(si);
    if (!b) {
        const d = cleanCandidate({ ...sh, status: "active", startedAt: nowISO(), source: sh.src || "watch" });
        delete d.groupId;
        const nid = addItem({ ...d, title: sh.title }, "Add " + sh.title);
        W.seasons.forEach(x => {
            if (!x.member) x.member = nid;
        });
        b = seasonItem(si);
    }
    if (!b) return;
    const id = b.id,
        film = sh.medium === "film";
    // a finished show stays finished: un-ticking one of its episodes doesn't quietly turn it back into "watching" (you can still, on purpose)
    if (!on && b.status === "done" && !force) {
        toast(`${cleanTitle(b.title)} stays finished`, {
            label: film ? "Mark not watched" : "Untick anyway",
            fn: () => {
                watchMark(si, e, false, true);
                if (W.player && W.player.si === si && W.player.e === e) {
                    W.player.marked = false;
                    stageChanged("mark");
                }
            },
        });
        if (W.player && W.player.si === si && W.player.e === e) {
            W.player.marked = true;
            stageChanged("mark");
        }
        return;
    }
    // watching a finished show again: reaching its last episode counts as another time through (like watching a film again)
    const lastSi = W.seasons.length - 1,
        lastE = Math.max(0, ...((W.seasons[lastSi] || {}).eps || []).map(x => x.e)),
        isLast = film || (si === lastSi && lastE && e === lastE);
    if (on && b.status === "done" && !isLast && !film) return; // part-way through watching it again: nothing to change
    if (on && b.status === "done" && isLast && !film) {
        change("Watched again", id, x =>
            x ? { ...x, repeat: (x.repeat || 0) + 1, finishedAt: nowISO(), lastAt: nowISO() } : x
        );
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
        if (on) S.add(k);
        else S.delete(k);
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
/** SubRip subtitles as WebVTT, which the browser plays */
export const srtToVtt = (s: string) =>
    "WEBVTT\n\n" + s.replace(/\r/g, "").replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2");

/** the season the list beside the player shows (its list or chips): its episodes are fetched if they haven't been */
export function cinSeasonPick(i: number) {
    if (!W.player) return;
    W.player.listSi = i;
    cinSideRedraw();
    loadWatchSeason(i);
}
/** player › Speed: kept, and the video plays at it now */
export function speedSet(x: number) {
    playerSave({ speed: x });
    const v = playingVideo();
    if (v) v.playbackRate = x;
    stageChanged("player");
}
/** player › Subtitles: the track picked (or off), remembered as your language */
export function subPicked(url: string) {
    const v = playingVideo();
    if (v && W.player) subChoose(W.player, v, url, true);
}
/** one of the player's settings changed (PlayerOpts.svelte, SubsPanel.svelte): kept; the picture and the subtitles'
 *  look show at once, the rest the next time a video starts */
export function playerSet(k: keyof PlayerPrefs, v: string | number | boolean) {
    playerSave({ [k]: v });
    stageChanged("look", "player");
}
/** player › ▭: cinema mode (the video as big as the window, the episodes below) or the page around it. Only the
 *  layout changes: the same video goes on playing, never loaded again */
export function cinLayout() {
    playerSave({ layout: (PS().layout || "docked") === "docked" ? "cinema" : "docked" });
    stageChanged("player", "side", "look");
}
/** the bulb under the player: everything but the video goes dark, or light again */
export function cinLights(on = !PS().lights) {
    playerSave({ lights: on });
    stageChanged("mark", "look");
}
/** closes the player, keeping your place */
export function cinClose() {
    const v = playingVideo();
    if (v && W.lastKey && W.player) savePos(W.lastKey, (W.player.offset || 0) + v.currentTime);
    W.player = null;
    renderPlayer();
    W.view = "home";
    ui.wpOpts = false;
}
/** Back from the player (its ←, Escape, or the browser's Back): straight to where you came from, the search as it was
 *  (what you typed, what it found, how far down you were) */
export function watchBack() {
    const y = W.backY || 0;
    cinClose();
    if (ui.page !== "watch") return;
    renderMain();
    // at once, not scrolling there smoothly: it's where you were, not somewhere to go
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
    // opened after a refresh: what was typed comes back, and is looked for again
    if (W.q && !W.results) watchSearch(W.q);
}
/** the player's keys (player/Cinema.svelte listens, and the picture-in-picture window): space or K, ← →, ↑ ↓, F, T, L,
 *  M, N, P, S, C, I, Escape. True when the key was one of these */
/** the player's keys, pressed in the picture-in-picture window */
export function pipKeys(e: KeyboardEvent) {
    if (playerKey(e)) e.preventDefault();
}
export function playerKey(e: KeyboardEvent): boolean {
    if (!W.player || ui.modal || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) return false;
    const p = W.player,
        v = playingVideo(),
        o = PS(),
        k = e.key.toLowerCase();
    if (e.key === "Escape") {
        // a panel that's open closes first; then Back, one level up
        if (p.opts || p.cc || p.srcOpen || ui.wpOpts) panelsClose();
        else watchBack();
        return true;
    }
    if (k === "t") cinLayout();
    else if (k === "l") cinLights();
    else if (k === "f") cinFull();
    else if (k === "n") watchStep(1);
    else if (k === "p") watchStep(-1);
    else if (!v) return false;
    else if (k === " " || k === "k") {
        if (v.paused) v.play().catch(() => {});
        else v.pause();
    } else if (e.key === "ArrowRight") pcSeekBy(o.seek);
    else if (e.key === "ArrowLeft") pcSeekBy(-o.seek);
    else if (e.key === "ArrowUp") {
        v.muted = false;
        v.volume = Math.min(1, v.volume + 0.1);
    } else if (e.key === "ArrowDown") v.volume = Math.max(0, v.volume - 0.1);
    else if (k === "m") v.muted = !v.muted;
    else if (k === "s") introSkip();
    else if (k === "i") pipToggle(v, pipKeys);
    else if (k === "c") {
        const L = p.subList || [];
        if (L.length) {
            const on = p.subPick,
                back = p.subLast || (subFor(L, PS().subLang) || L[0]).url;
            if (on) p.subLast = on;
            subChoose(p, v, on ? "" : back, false);
            subRefresh(p);
        } else subToggle(v);
    } else return false;
    return true;
}
