// src/features/sources/covers.ts
// ─────────────────────────────────────────────────────────────────
//  Background work: artwork, offline cache, spine colours, crowd scores
// ─────────────────────────────────────────────────────────────────

import {
    at,
    coverCache,
    dirty,
    dominantColor,
    errName,
    items,
    markDirty,
    meta,
    numOf,
    nowISO,
    quietPatch,
    recordsOf,
    scheduleSave,
    sleep,
    stateChanged,
    textOf,
} from "../core/core";
import { AL, bestMatch, findCandidates, getJSON, refreshItem, SourceError, sourceFlag, wdDetails } from "./sources";
import { alSync } from "./anilist";
import { appleBookCovers, upgradeGameCover, wikiBookCover } from "./box-art";
import { renderSide, updateBusy } from "../core/shell";
import { workChanged } from "./work-state.svelte";
import type { Item } from "../core/model";

const aborted = (e: unknown) => errName(e) === "AbortError";
/** the picture to show for an entry: your own, or its cover through the cache ("" when it has neither) */
export const coverSrc = (b: { coverData?: string | null; cover?: string | null }): string =>
    b.coverData || (b.cover ? coverCache.src(b.cover) : "");
// how long to wait when the catalogues say "slow down" (the site's shared lookups count per minute)
const RATE_WAIT_S = 60;
/** fetching covers for the whole library, a few at a time */
export const auto = {
    running: false,
    waiting: false,
    paused: false,
    done: 0,
    total: 0,
    found: 0,
    fails: 0,
    offline: false,
    phase: "",
    ctl: new AbortController(),
};
/** a picture arrived for an entry: everything showing it catches up (every cover is a Svelte component, which follows
 *  the store) */
export function updateItemTiles(id: string) {
    if (!items.has(id)) return;
    stateChanged("items");
}
async function fetchBookCover(id: string, signal?: AbortSignal, overwrite?: boolean): Promise<boolean> {
    const b = items.get(id);
    if (!b) return false;
    const c = bestMatch(b, await findCandidates(b.title, b.creator, signal));
    const cur = items.get(id);
    if (!cur) return false;
    const p: Partial<Item> = { coverChecked: true, genreChecked: true };
    if (c && !(cur.genres || []).length)
        p.genres = cur.kind === "Academic" && cur.subject ? [cur.subject] : c.genres || [];
    if ((!c || !c.cover) && !coverSrc(cur)) {
        try {
            const a = (await appleBookCovers(cur, signal))[0];
            if (a) {
                p.cover = a.cover;
                p.coverColor = null;
            }
        } catch (e) {
            if (aborted(e)) throw e;
        }
        if (!p.cover)
            try {
                const w = await wikiBookCover(cur, signal);
                if (w) {
                    p.cover = w;
                    p.coverColor = null;
                }
            } catch (e) {
                if (aborted(e)) throw e;
            }
    }
    if (c && c.cover && (overwrite || !coverSrc(cur))) {
        p.cover = c.cover;
        p.coverColor = null;
        if (!cur.year && c.year) p.year = c.year;
        if (!cur.total && c.total) p.total = c.total;
        if (c.olKey) p.ext = { ...(cur.ext || {}), olKey: c.olKey };
    }
    quietPatch(id, p);
    return !!p.cover;
}
/** looks for an entry's cover; true when it found one */
export async function fetchArt(id: string, signal?: AbortSignal, overwrite?: boolean): Promise<boolean> {
    const b = items.get(id);
    if (!b) return false;
    if (b.medium === "book" || b.medium === "comic") return fetchBookCover(id, signal, overwrite);
    const r = await refreshItem(id, signal);
    // told to slow down before a cover was found: not "checked", so it's asked again (autoCovers waits, then retries)
    if (r.limited && !items.get(id)?.cover) throw new SourceError("rate", { rate: true });
    if (b.medium === "game")
        try {
            await upgradeGameCover(id, signal);
        } catch (e) {
            if (aborted(e)) throw e;
        }
    quietPatch(id, { coverChecked: true });
    return !!items.get(id)?.cover;
}
/** keeps an entry's cover for offline use, and takes its colour */
export async function cacheAndColour(id: string, signal?: AbortSignal) {
    const b = items.get(id);
    if (!b) return;
    const url = b.cover;
    let blob: Blob | null = null;
    if (b.coverData) {
        try {
            blob = await (await fetch(b.coverData)).blob();
        } catch (_) {}
    } else if (url && !coverCache.urls.has(url)) blob = await coverCache.fetch(url, signal);
    const kept = url ? coverCache.urls.get(url) : undefined;
    if (!blob && kept && !b.coverColor && !b.color) {
        try {
            blob = await (await fetch(kept)).blob();
        } catch (_) {}
    }
    if (blob && !b.coverColor && !b.color) {
        const col = await dominantColor(blob);
        quietPatch(id, { coverColor: col || "none" });
    }
}
/** a line of news over Settings › Data: its symbol, what it says, how far along (a bar, as a percentage), and its button */
export interface WorkBanner {
    ic: string;
    text: string;
    pct: number | null;
    act: string;
    btn: string;
}
/** what the artwork and crowd-score work says right now (settings/sections/data/WorkStatus.svelte), or null when idle */
export function autoBanner(): WorkBanner | null {
    if (auto.offline)
        return {
            ic: "◌",
            text: "Couldn't reach the artwork sources, so some covers are missing. They'll load next time you're online.",
            pct: null,
            act: "auto-resume",
            btn: "Try again",
        };
    const sq = scoreQ.running && !auto.running;
    if (!auto.running && !auto.paused && !sq) return null;
    if (sq)
        return {
            ic: "★",
            text: `Fetching crowd scores: ${scoreQ.done} of ${scoreQ.total}`,
            pct: scoreQ.total ? Math.round((scoreQ.done / scoreQ.total) * 100) : 0,
            act: "scores-stop",
            btn: "Pause",
        };
    const what = auto.phase === "cache" ? "Saving artwork for offline use" : "Finding artwork";
    if (auto.waiting && !auto.paused)
        return {
            ic: "◷",
            text: `${what}: ${auto.done} of ${auto.total}. The catalogues asked us to slow down, so it carries on in a minute.`,
            pct: null,
            act: "auto-pause",
            btn: "Pause",
        };
    return auto.paused
        ? {
              ic: "❚❚",
              text: `${what} paused at ${auto.done} of ${auto.total}.`,
              pct: null,
              act: "auto-resume",
              btn: "Resume",
          }
        : {
              ic: "↻",
              text: `${what}: ${auto.done} of ${auto.total}${auto.phase === "find" ? ` · ${auto.found} found` : ""}`,
              pct: auto.total ? Math.round((auto.done / auto.total) * 100) : 0,
              act: "auto-pause",
              btn: "Pause",
          };
}
/** the artwork or crowd-score work moved on: the top bar's light, and its line in Settings › Data */
export function renderAutoStatus() {
    updateBusy();
    workChanged("auto");
}
/** finds covers for these entries (or every entry without one), then keeps them for offline use */
export async function autoCovers(ids?: string[] | null, { retry = false } = {}) {
    if (auto.running) return;
    if (!ids && meta.settings.autoFetch === false) return;
    if (!navigator.onLine) {
        auto.offline = true;
        renderAutoStatus();
        return;
    }
    const ctl = new AbortController();
    Object.assign(auto, { running: true, paused: false, offline: false, ctl });
    const queue =
        ids ||
        [...items.entries()]
            .filter(
                ([, b]) =>
                    (!coverSrc(b) && !b.coverChecked) ||
                    ((b.medium === "book" || b.medium === "comic") && !(b.genres || []).length && !b.genreChecked)
            )
            .map(([id]) => id);
    Object.assign(auto, { phase: "find", done: 0, total: queue.length, found: 0, fails: 0, waiting: false });
    renderAutoStatus();
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        if (auto.paused || ctl.signal.aborted) break;
        try {
            if (await fetchArt(id, ctl.signal)) {
                auto.found++;
                updateItemTiles(id);
            }
            auto.fails = 0;
        } catch (e) {
            if (aborted(e)) break;
            // the lookups are busy (a big import, or many people at once): wait a minute and try the same one again,
            // rather than counting it as a failure and giving up
            if (sourceFlag(e, "rate")) {
                auto.waiting = true;
                renderAutoStatus();
                for (let s = 0; s < RATE_WAIT_S && !auto.paused && !ctl.signal.aborted; s++) await sleep(1000);
                auto.waiting = false;
                renderAutoStatus();
                i--;
                continue;
            }
            if (++auto.fails >= 5) {
                auto.offline = true;
                break;
            }
        }
        auto.done++;
        if (auto.done % 6 === 0) scheduleSave();
        renderAutoStatus();
        await sleep(220);
    }
    if (!auto.paused && !auto.offline && !coverCache.blocked) {
        // pictures are saved for offline once; one that won't come isn't asked for again until you press Refresh or "Save every picture"
        const toCache =
            meta.settings.offlineAuto === false
                ? []
                : [...items.entries()]
                      .filter(
                          ([id, b]) =>
                              (!ids || ids.includes(id)) &&
                              (retry || b.cacheTried !== b.cover) &&
                              ((b.cover && !coverCache.urls.has(b.cover)) ||
                                  ((b.cover || b.coverData) && !b.coverColor && !b.color))
                      )
                      .map(([id]) => id);
        Object.assign(auto, { phase: "cache", done: 0, total: toCache.length });
        for (const id of toCache) {
            if (auto.paused || ctl.signal.aborted || coverCache.blocked) break;
            try {
                await cacheAndColour(id, ctl.signal);
                const x = items.get(id);
                if (x) {
                    x.cacheTried = x.cover;
                    if (!x.coverColor && !x.color) x.coverColor = "none";
                    dirty.add(id);
                }
                updateItemTiles(id);
            } catch (e) {
                if (aborted(e)) break;
            }
            auto.done++;
            if (auto.done % 8 === 0) {
                scheduleSave();
                renderAutoStatus();
            }
            await sleep(40);
        }
    }
    auto.running = false;
    scheduleSave();
    renderAutoStatus();
    scoreQ.start();
    fixFilmCreators();
    setTimeout(v9Repair, 4000);
}
/** filling in crowd scores for the whole library, in the background: MyAnimeList via Jikan, IMDb/RT/Metacritic via
 * OMDb, TVmaze, TMDB, RAWG, Wikidata */
interface ScoreQueue {
    running: boolean;
    done: number;
    total: number;
    ctl: AbortController | null;
    stopped: boolean; // paused by you: waits until you start it again
    pending(): string[];
    start(): Promise<void>;
    stop(): void;
}
export const scoreQ: ScoreQueue = {
    running: false,
    done: 0,
    total: 0,
    ctl: null,
    stopped: false,
    pending() {
        return [...items.entries()]
            .filter(
                ([, b]) => !b.scoresAt && !b.scoresTried && b.medium !== "book" && b.medium !== "comic" && !b.favOnly
            )
            .map(([id]) => id);
    },
    async start() {
        if (
            this.running ||
            this.stopped ||
            auto.running ||
            alSync.running ||
            !navigator.onLine ||
            meta.settings.autoFetch === false
        )
            return;
        const ids = this.pending();
        if (!ids.length) return;
        const ctl = new AbortController();
        Object.assign(this, { running: true, done: 0, total: ids.length, ctl });
        renderAutoStatus();
        let fails = 0;
        for (const id of ids) {
            if (ctl.signal.aborted) break;
            try {
                await refreshItem(id, ctl.signal, { full: false });
                fails = 0;
            } catch (e) {
                if (aborted(e)) break;
                quietPatch(id, { scoresTried: nowISO() });
                if (++fails > 6) break;
            }
            this.done++;
            if (this.done % 5 === 0) {
                scheduleSave();
                renderAutoStatus();
            }
            await sleep(250);
        }
        this.running = false;
        scheduleSave();
        renderAutoStatus();
        renderSide();
    },
    stop() {
        this.stopped = true;
        if (this.ctl) this.ctl.abort();
        this.running = false;
        renderAutoStatus();
    },
};
/** checks airing and release dates for things you're watching or waiting on, at most every six hours unless forced */
export async function refreshAiring(force?: boolean) {
    if (!navigator.onLine || meta.settings.airing === false) return;
    const last = meta.settings.airingAt ? Date.parse(textOf(meta.settings.airingAt)) : 0;
    if (!force && Date.now() - last < 6 * 3600e3) return;
    meta.settings.airingAt = nowISO();
    markDirty();
    const watch = [...items.entries()].filter(
        ([, b]) =>
            ["active", "want", "paused"].includes(b.status) &&
            (b.airStatus === "RELEASING" || b.airStatus === "NOT_YET_RELEASED" || b.airing)
    );
    const al = watch.flatMap(([id, b]): [string, number][] => (b.ext.anilist ? [[id, b.ext.anilist]] : []));
    try {
        for (let i = 0; i < al.length; i += 40) {
            const chunk = al.slice(i, i + 40);
            const d = await AL.q(
                `query($ids:[Int]){ Page(perPage: 50){ media(id_in:$ids){ id status episodes chapters nextAiringEpisode { episode airingAt } } } }`,
                { ids: chunk.map(x => x[1]) }
            );
            for (const m of recordsOf(at(d, "Page", "media"))) {
                const id = chunk.find(x => x[1] === m.id)?.[0],
                    b = id && items.get(id);
                if (!id || !b) continue;
                const airAt = numOf(at(m, "nextAiringEpisode", "airingAt"));
                quietPatch(id, {
                    airStatus: textOf(m.status) || undefined,
                    airing:
                        airAt != null ? { ep: numOf(at(m, "nextAiringEpisode", "episode")), at: airAt * 1000 } : null,
                    total: numOf(m.episodes) || numOf(m.chapters) || b.total,
                });
            }
        }
    } catch (_) {}
    scheduleSave();
    renderSide();
}

// one-time fix: Wikidata used to give films their composer or writer as "director" (Good Will Hunting got its composer). Re-read the director only.
// an earlier lookup could match a film to the video game of the same name; unlink those and look the film up again by its IMDb id
const WRONG_MATCH = /\((video )?game\)|\bvideo game\b/i,
    GAME_GENRE =
        /\b(video game|action-adventure game|role-playing game|platform game|adventure game|shooter game|fighting game)\b/i;
function repairWrongMatches() {
    let n = 0;
    for (const [id, b] of items)
        if (
            (b.medium === "film" || b.medium === "tv") &&
            !b.matchRepaired &&
            (WRONG_MATCH.test(textOf((b.ext || {}).wiki)) ||
                (b.genres || []).some(g => GAME_GENRE.test(g)) ||
                / game$/i.test(b.kind || ""))
        ) {
            const ext = { ...(b.ext || {}) };
            delete ext.wikidata;
            delete ext.wiki;
            quietPatch(id, {
                ext,
                genres: (b.genres || []).filter(g => !GAME_GENRE.test(g)),
                creator: "",
                about: /video game|\bgame\b/i.test(b.about || "") ? "" : b.about,
                kind: / game$/i.test(b.kind || "") ? "" : b.kind,
                creatorFix: true,
                matchRepaired: true,
                scoresAt: null,
            });
            n++;
        }
    return n;
}
/** Wikidata ids by IMDb id */
export async function wdByImdb(ids: string[], signal?: AbortSignal): Promise<Map<string, string>> {
    const query = `SELECT ?item ?imdb WHERE { VALUES ?imdb { ${ids.map(x => JSON.stringify(x)).join(" ")} } ?item wdt:P345 ?imdb . }`;
    const j = await getJSON(
        "https://query.wikidata.org/sparql?" + new URLSearchParams({ format: "json", query }),
        signal
    );
    return new Map(
        recordsOf(at(j, "results", "bindings"))
            .map((r): [string, string] => [
                textOf(at(r, "imdb", "value")),
                textOf(at(r, "item", "value"))
                    .split("/")
                    .pop() || "",
            ])
            .filter(([imdb, q]) => imdb && q)
    );
}
let filmFixBusy = false;
/** what a film's repair takes from Wikidata: its director, and for a film that was matched to a game, its genres,
 * description and Wikipedia article again */
function filmFix(b: Item, x: { creator?: string; genres?: string[]; about?: string; ext?: Item["ext"] } | undefined) {
    const wiki = x && x.ext && x.ext.wiki;
    return {
        creator: x && x.creator ? x.creator : b.creator,
        ...(b.matchRepaired && x
            ? {
                  genres: (b.genres || []).length ? b.genres : (x.genres || []).slice(0, 6),
                  about: b.about || x.about || "",
                  ext: { ...b.ext, ...(wiki ? { wiki } : {}) },
              }
            : {}),
        creatorFix: undefined,
        creatorFixed: true,
    };
}
async function fixFilmCreators() {
    if (filmFixBusy || !navigator.onLine) return;
    repairWrongMatches();
    const needQ = [...items.entries()].filter(
        ([, b]) => b.creatorFix && b.medium === "film" && !(b.ext && b.ext.wikidata) && b.ext && b.ext.imdb
    );
    if (needQ.length) {
        try {
            const m = await wdByImdb(needQ.map(([, b]) => b.ext.imdb || ""));
            for (const [id, b] of needQ) {
                const q = m.get(b.ext.imdb || "");
                if (q) quietPatch(id, { ext: { ...b.ext, wikidata: q } });
            }
        } catch (_) {}
    }
    const todo = [...items.entries()].filter(([, b]) => b.creatorFix && b.medium === "film");
    if (!todo.length) return;
    filmFixBusy = true;
    try {
        const withQ = todo.flatMap(([id, b]): [string, Item, string][] =>
            b.ext && b.ext.wikidata ? [[id, b, b.ext.wikidata]] : []
        );
        for (let i = 0; i < withQ.length; i += 40) {
            const chunk = withQ.slice(i, i + 40),
                d = await wdDetails(
                    chunk.map(([, , q]) => q),
                    undefined,
                    "film"
                );
            for (const [id, b, q] of chunk) quietPatch(id, filmFix(b, d.get(q)));
            await sleep(400);
        }
        for (const [id, b] of todo.filter(([, b]) => !(b.ext && b.ext.wikidata)))
            quietPatch(id, { creatorFix: undefined, creatorFixed: true, scoresAt: b.scoresAt });
        scheduleSave();
    } catch (_) {}
    filmFixBusy = false;
}

// once: retry things that never found a picture or a match (a busy moment during a big import), and refresh games that were "upcoming" when added
let v9Busy = false;
async function v9Repair() {
    if (meta.settings.v9repair || !navigator.onLine || v9Busy) return;
    v9Busy = true;
    const yr = new Date().getFullYear();
    const todo = [...items.entries()]
        .filter(
            ([, b]) =>
                !b.private &&
                ((!coverSrc(b) &&
                    !["book", "comic"].includes(b.medium) &&
                    !Object.keys(b.ext || {}).some(k =>
                        ["anilist", "mal", "tmdb", "tvmaze", "rawg", "wikidata"].includes(k)
                    )) ||
                    (/\bupcoming\b/i.test(b.about || "") && b.year && b.year <= yr) ||
                    (b.medium === "game" && !(b.platforms || []).length && (b.ext || {}).wikidata))
        )
        .slice(0, 150);
    for (const [id] of todo) {
        try {
            await refreshItem(id);
            updateItemTiles(id);
        } catch (_) {}
        await sleep(350);
    }
    v9Busy = false;
    meta.settings.v9repair = true;
    markDirty();
}
