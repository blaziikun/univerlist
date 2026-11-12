// src/features/sources/sources.ts
// ─────────────────────────────────────────────────────────────────
//  Data sources
//
//  Keyless: AniList, Jikan (MyAnimeList), TVmaze, Wikidata + Wikipedia, Open Library, Google Books.
//  Optional free keys: TMDB (film and TV), OMDb (IMDb / Rotten Tomatoes / Metacritic scores), RAWG (games).
//  Every answer arrives as `unknown` and is read through the guards in core/core.ts (at, fieldsOf, recordsOf, textOf,
//  numOf, strsOf), so a catalogue that changes its shape or sends nonsense gives empty fields, never a crash.
// ─────────────────────────────────────────────────────────────────

import {
    at,
    cleanTitle,
    errMessage,
    errName,
    fieldsOf,
    firstAuthor,
    isRecord,
    items,
    KEYS,
    listOf,
    mapGenres,
    meta,
    norm,
    nowISO,
    numOf,
    ownOf,
    quietPatch,
    recordsOf,
    sleep,
    stripMd,
    strsOf,
    surname,
    textOf,
    toast,
    ui,
} from "../core/core";
import { IGDB_ON, igdbDetails, igdbFind, igdbImages, igdbQ, igdbSearch, probeImg } from "./igdb";
import { cvCovers, hcCovers, sgdbCovers, siteShares, ssMedia, tgdbBoxes, TMDB_ON } from "./proxy";
import { appleBookCovers, appStoreIcon, isShot, itunesJSON, wikiBookCover, wikiBoxArt } from "./box-art";
import { splitGenres } from "../core/types";
import { volumeCovers } from "../core/parts";
import { albumDetails, searchAlbums } from "../music/musicbrainz";
import type { Candidate, CastMember, Episode, Item, ItemExt, RelatedWork } from "../core/model";

/** why a catalogue didn't answer: told to slow down (rate, and for how many seconds), refused the key (auth), out of
 * reach (offline), its own servers failing (server), or the status it answered with */
export class SourceError extends Error {
    rate?: boolean;
    retryAfter?: number | null;
    auth?: boolean;
    offline?: boolean;
    server?: boolean;
    status?: number;
    final?: boolean; // its message is the one to show as it is (anilist.ts)
    constructor(
        message: string,
        flags: {
            rate?: boolean;
            retryAfter?: number | null;
            auth?: boolean;
            offline?: boolean;
            server?: boolean;
            status?: number;
            final?: boolean;
        } = {}
    ) {
        super(message);
        Object.assign(this, flags);
    }
}
/** whether what was thrown is a catalogue's answer with this flag */
export const sourceFlag = (e: unknown, k: "rate" | "auth" | "offline" | "server" | "final"): boolean =>
    e instanceof SourceError && !!e[k];
/** whoever asked gave up: pass the error on rather than taking it as "nothing found" */
const aborted = (e: unknown) => errName(e) === "AbortError";

export interface GetOpts {
    timeout?: number;
    headers?: Record<string, string>;
    method?: string;
    body?: BodyInit;
    cache?: RequestCache;
}
/** a JSON answer from a catalogue, as sent: checked by whatever reads it. Throws on 429 (rate), 401/403 (auth) and errors */
export async function getJSON(url: string, signal?: AbortSignal, opts: GetOpts = {}): Promise<unknown> {
    const ms = opts.timeout || (/query\.wikidata/.test(url) ? 30000 : 20000);
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
        const t = AbortSignal.timeout(ms);
        signal = signal && AbortSignal.any ? AbortSignal.any([signal, t]) : signal || t;
    }
    const r = await fetch(url, {
        signal,
        headers: { Accept: "application/json", ...(opts.headers || {}) },
        method: opts.method || "GET",
        body: opts.body,
        cache: opts.cache,
    });
    // seconds, when the service says how long
    if (r.status === 429) throw new SourceError("rate", { rate: true, retryAfter: retryAfter(r) });
    if (r.status === 401 || r.status === 403) throw new SourceError("auth", { auth: true });
    if (!r.ok) throw new SourceError(String(r.status), { status: r.status });
    const j: unknown = await r.json();
    return j;
}
/** a year from a date or a year in any form; null when it doesn't look like one */
export const yearOf = (d: unknown): number | null => {
    const y = parseInt(String(d || ""), 10);
    return y > 1000 && y < 3000 ? y : null;
};

// how long a "slow down" (429) asks for, in seconds, from its Retry-After (seconds or a date); null if it doesn't say
function retryAfter(r: Response): number | null {
    const h = r && r.headers && r.headers.get("Retry-After");
    if (!h) return null;
    const s = Number(h);
    if (Number.isFinite(s)) return Math.max(0, s);
    const t = Date.parse(h);
    return Number.isNaN(t) ? null : Math.max(0, Math.round((t - Date.now()) / 1000));
}
const stopped = (signal?: AbortSignal): unknown =>
    signal && signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
// a wait that ends at once, as an AbortError, when whoever asked gives up
function pause(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((res, rej) => {
        if (signal && signal.aborted) return rej(stopped(signal));
        const stop = () => {
            clearTimeout(t);
            rej(stopped(signal));
        };
        const t = setTimeout(() => {
            if (signal) signal.removeEventListener("abort", stop);
            res();
        }, ms);
        if (signal) signal.addEventListener("abort", stop, { once: true });
    });
}
// a promise, or an AbortError as soon as the signal says to give up
const unlessStopped = <T>(p: Promise<T>, signal?: AbortSignal): Promise<T> =>
    !signal
        ? p
        : new Promise<T>((res, rej) => {
              if (signal.aborted) return rej(stopped(signal));
              const stop = () => rej(stopped(signal));
              signal.addEventListener("abort", stop, { once: true });
              p.then(
                  v => {
                      signal.removeEventListener("abort", stop);
                      res(v);
                  },
                  e => {
                      signal.removeEventListener("abort", stop);
                      rej(e);
                  }
              );
          });

// ── AniList (GraphQL, no key; 30 requests a minute while AniList is in degraded mode) ──
/** AniList: one request at a time, in turn */
export interface AniListQueue {
    last: number; // when the last request went (or, after a "slow down", when the next may)
    gap: number;
    burst: number; // requests that went ahead of the queue in the last 20 s
    line: Promise<unknown>;
    onWait?: (secs: number) => void; // told to slow down: for how long (anilist.ts shows it)
    onRetry?: (n: number) => void; // AniList failed, trying again
    turn(signal?: AbortSignal): Promise<void>;
    /** a GraphQL query to AniList, in turn: its data, as AniList sent it */
    q(
        query: string,
        variables?: Record<string, unknown>,
        signal?: AbortSignal,
        tries?: number,
        now?: boolean
    ): Promise<unknown>;
}
export const AL: AniListQueue = {
    last: 0,
    gap: 2150,
    burst: 0,
    line: Promise.resolve(),
    // the background queue: one request every `gap`, in the order they were asked for, however many arrive at once.
    // Giving up (the signal) leaves the line straight away, and those behind move up without waiting for it
    turn(signal) {
        const ahead = this.line;
        let leave = () => {};
        const gone = new Promise<void>(r => (leave = r));
        this.line = ahead.then(() => gone);
        return (async () => {
            try {
                await unlessStopped(ahead, signal);
                // looked at again after each wait: a "slow down" meanwhile pushes everyone back
                for (let wait: number; (wait = this.last + this.gap - Date.now()) > 0; ) await pause(wait, signal);
                this.last = Date.now();
            } finally {
                leave();
            }
        })();
    },
    // now: something you're waiting on (a page you just opened) goes ahead of the background queue, a few at a time.
    // A try again (tries) already has its moment kept for it (below), so it goes then, ahead of the queue
    async q(query, variables = {}, signal, tries = 0, now = false) {
        if (tries) this.last = Math.max(this.last, Date.now());
        else if (now) {
            const wait = (this.burst = (this.burst || 0) + 1) > 6 ? 700 : 0;
            setTimeout(() => {
                this.burst = Math.max(0, (this.burst || 0) - 1);
            }, 20000);
            // ahead of the queue, but not of a "slow down" still running
            const held = this.last - Date.now();
            if (Math.max(wait, held) > 0) await pause(Math.max(wait, held), signal);
            this.last = Math.max(this.last, Date.now());
        } else await this.turn(signal);
        let r: Response;
        try {
            r = await fetch("https://graphql.anilist.co", {
                method: "POST",
                signal,
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ query, variables }),
            });
        } catch (e) {
            if (aborted(e)) throw e;
            throw new SourceError("offline", { offline: true });
        }
        // told to slow down: wait as long as AniList asks (a minute if it doesn't say), and so does the whole queue
        if (r.status === 429 && tries < 3) {
            const secs = Math.min(300, Math.max(1, retryAfter(r) ?? 61));
            this.last = Math.max(this.last, Date.now() + secs * 1000);
            AL.onWait && AL.onWait(secs);
            await pause(secs * 1000, signal);
            return this.q(query, variables, signal, tries + 1, now);
        }
        // AniList's servers sometimes answer 500 under load; try again after a pause before giving up
        if (r.status >= 500 && tries < 2) {
            AL.onRetry && AL.onRetry(tries + 1);
            this.last = Math.max(this.last, Date.now() + (tries ? 9000 : 3500));
            await pause(tries ? 9000 : 3500, signal);
            return this.q(query, variables, signal, tries + 1, now);
        }
        let j: unknown = null;
        try {
            j = await r.json();
        } catch (_) {}
        if (!j || (!at(j, "data") && at(j, "errors")) || !r.ok) {
            const msg = textOf(at(j, "errors", 0, "message")) || "AniList " + r.status;
            throw new SourceError(msg, {
                status: r.status,
                server: r.status >= 500 || /internal server error/i.test(msg),
            });
        }
        return at(j, "data");
    },
};
/** the fields asked of AniList for a title */
export const AL_MEDIA = `id idMal type format status episodes chapters volumes duration averageScore meanScore popularity genres countryOfOrigin isAdult season seasonYear synonyms
  title { romaji english native } coverImage { extraLarge large color } bannerImage startDate { year month day } nextAiringEpisode { episode airingAt } siteUrl
  tags { name rank isMediaSpoiler } studios(isMain: true) { nodes { name } }`;
export const AL_MEDIA_LITE = `id idMal type format status episodes chapters volumes duration averageScore genres countryOfOrigin isAdult
  title { romaji english native } coverImage { large color } bannerImage startDate { year month day } nextAiringEpisode { episode airingAt }`;
// what AniList's favourites import asks for, per kind (sources/anilist.ts)
export const AL_FAV: Record<string, string> = {
    anime: `nodes { ${AL_MEDIA} }`,
    manga: `nodes { ${AL_MEDIA} }`,
    animeLite: `nodes { ${AL_MEDIA_LITE} }`,
    mangaLite: `nodes { ${AL_MEDIA_LITE} }`,
    charactersLite: `nodes { id name { full native } image { large } }`,
    characters: `nodes { id name { full native } image { large } gender age description(asHtml:false) media(perPage: 3, sort:[POPULARITY_DESC]){ nodes { id type format countryOfOrigin title { english romaji } } } }`,
    staff: `nodes { id name { full native } image { large } primaryOccupations }`,
    studios: `nodes { id name }`,
};
const AL_DETAIL = `id description(asHtml: false) staff(perPage: 6, sort: [RELEVANCE]) { edges { role node { name { full } } } }
  relations { edges { relationType(version: 2) node { id idMal type format status episodes chapters countryOfOrigin title { romaji english native } coverImage { large color } startDate { year } } } }`;
function alMedium(m: unknown): string {
    const f = fieldsOf(m),
        country = textOf(f.countryOfOrigin);
    if (f.type === "ANIME") return "anime";
    if (f.format === "NOVEL") return "novel";
    if (["KR"].includes(country)) return "manhwa";
    if (["CN", "TW"].includes(country)) return "manhwa";
    return "manga";
}
const AL_ANIME_KIND: Record<string, string> = {
    TV: "TV",
    TV_SHORT: "Short",
    MOVIE: "Movie",
    SPECIAL: "Special",
    OVA: "OVA",
    ONA: "ONA",
    MUSIC: "Special",
};
function alKind(m: unknown): string {
    const f = fieldsOf(m),
        country = textOf(f.countryOfOrigin);
    if (f.type === "ANIME") return ownOf(AL_ANIME_KIND, textOf(f.format)) || "TV";
    if (f.format === "NOVEL") return "Light novel";
    if (f.format === "ONE_SHOT") return "One-shot";
    if (["CN", "TW"].includes(country)) return "Manhua";
    if (country === "KR") return "Manhwa";
    return "Manga";
}
const AL_REL: Record<string, string> = {
    ADAPTATION: "adaptation",
    SOURCE: "adaptation",
    SEQUEL: "sequel",
    PREQUEL: "prequel",
    SIDE_STORY: "side",
    SPIN_OFF: "side",
    PARENT: "world",
    ALTERNATIVE: "world",
    SUMMARY: "world",
    COMPILATION: "world",
    CONTAINS: "world",
    CHARACTER: "world",
    OTHER: "world",
};
const AL_REL_LABEL: Record<string, string> = {
    ADAPTATION: "Adaptation",
    SOURCE: "Source",
    SEQUEL: "Sequel",
    PREQUEL: "Prequel",
    SIDE_STORY: "Side story",
    SPIN_OFF: "Spin-off",
    PARENT: "Parent story",
    ALTERNATIVE: "Alternative version",
    SUMMARY: "Summary",
    COMPILATION: "Compilation",
    CONTAINS: "Contains",
    CHARACTER: "Shares characters",
    OTHER: "Related",
};
/** an AniList title's English name, or its romaji one */
const alTitle = (m: unknown) => textOf(at(m, "title", "english")) || textOf(at(m, "title", "romaji"));
/** an AniList title, as an entry's fields */
export function alToFields(m: unknown): Candidate {
    const f = fieldsOf(m),
        medium = alMedium(f),
        studio = textOf(at(f, "studios", "nodes", 0, "name")),
        season = textOf(f.season),
        seasonYear = numOf(f.seasonYear),
        airAt = numOf(at(f, "nextAiringEpisode", "airingAt"));
    const out: Candidate = {
        medium,
        kind: alKind(f),
        title: alTitle(f),
        alt: {
            en: textOf(at(f, "title", "english")),
            romaji: textOf(at(f, "title", "romaji")),
            native: textOf(at(f, "title", "native")),
        },
        year: numOf(at(f, "startDate", "year")) || seasonYear || null,
        cover: textOf(at(f, "coverImage", "extraLarge")) || textOf(at(f, "coverImage", "large")),
        banner: textOf(f.bannerImage),
        color: textOf(at(f, "coverImage", "color")) || null,
        total: (medium === "anime" ? numOf(f.episodes) : numOf(f.chapters)) || null,
        vols: numOf(f.volumes) || null,
        runtime: numOf(f.duration) || null,
        genres: strsOf(f.genres),
        themes: recordsOf(f.tags)
            .filter(t => (numOf(t.rank) ?? 0) >= 60 && !t.isMediaSpoiler)
            .slice(0, 8)
            .map(t => textOf(t.name))
            .filter(Boolean),
        flag: !!f.isAdult,
        airStatus: textOf(f.status) || undefined,
        airing: airAt != null ? { ep: numOf(at(f, "nextAiringEpisode", "episode")), at: airAt * 1000 } : null,
        ext: { anilist: numOf(f.id), mal: numOf(f.idMal) || undefined },
        scores: { anilist: numOf(f.averageScore) || undefined },
        popularity: numOf(f.popularity) || 0,
    };
    if (studio) out.creator = studio;
    if (season && seasonYear) out.season = season.charAt(0) + season.slice(1).toLowerCase() + " " + seasonYear;
    return out;
}
function alDetailFields(d: Record<string, unknown>): Partial<Candidate> {
    const f: Partial<Candidate> = {};
    if (d.description) f.about = stripMd(d.description).slice(0, 900);
    const staff = recordsOf(at(d, "staff", "edges"))
        .filter(e => /story|original creator|author|art/i.test(textOf(e.role)))
        .map(e => textOf(at(e, "node", "name", "full")))
        .filter(Boolean);
    if (staff.length) f.creatorPeople = [...new Set(staff)].slice(0, 3);
    f.rel = recordsOf(at(d, "relations", "edges")).flatMap((e): RelatedWork[] => {
        const node = fieldsOf(e.node),
            id = numOf(node.id),
            type = textOf(e.relationType);
        if (id == null) return [];
        return [
            {
                src: "anilist",
                id,
                type: ownOf(AL_REL, type) || "world",
                label: ownOf(AL_REL_LABEL, type) || "Related",
                medium: alMedium(node),
                kind: alKind(node),
                title: alTitle(node),
                cover: textOf(at(node, "coverImage", "large")),
                year: numOf(at(node, "startDate", "year")),
                mal: numOf(node.idMal) || undefined,
            },
        ];
    });
    return f;
}
export async function alSearch(q: string, medium: string, signal?: AbortSignal): Promise<Candidate[]> {
    const type = medium === "anime" ? "ANIME" : "MANGA";
    const fl = ui.private ? "" : ", isAdult: false";
    const d = await AL.q(
        `query($q:String,$type:MediaType){ Page(perPage: 15){ media(search:$q, type:$type${fl}, sort:[SEARCH_MATCH, POPULARITY_DESC]){ ${AL_MEDIA} } } }`,
        { q, type },
        signal
    );
    const list = recordsOf(at(d, "Page", "media")).map(m => ({ src: "anilist", ...alToFields(m) }));
    return list.sort((a, b) => Number(b.medium === medium) - Number(a.medium === medium));
}
const AL_DETAIL_LITE = `id description(asHtml: false) relations { edges { relationType(version: 2) node { id idMal type format countryOfOrigin title { romaji english native } coverImage { large } startDate { year } } } }`;
/** details AniList keeps that a search doesn't bring, by AniList id */
export async function alDetails(ids: number[], signal?: AbortSignal, size = 10): Promise<Map<number, Candidate>> {
    const out = new Map<number, Candidate>();
    for (let i = 0; i < ids.length; i += size) {
        const chunk = ids.slice(i, i + size);
        let media: Record<string, unknown>[];
        try {
            const d = await AL.q(
                `query($ids:[Int]){ Page(perPage: ${size}){ media(id_in:$ids){ ${AL_MEDIA} ${AL_DETAIL} } } }`,
                { ids: chunk },
                signal
            );
            media = recordsOf(at(d, "Page", "media"));
        } catch (e) {
            if (!sourceFlag(e, "server")) throw e;
            // smaller, lighter request; skip the chunk if AniList still can't answer
            try {
                media = [];
                for (const id of chunk) {
                    const x = await AL.q(
                        `query($id:Int){ Media(id:$id){ ${AL_MEDIA_LITE} ${AL_DETAIL_LITE} } }`,
                        { id },
                        signal
                    );
                    const m = at(x, "Media");
                    if (isRecord(m)) media.push(m);
                }
            } catch (e2) {
                if (!sourceFlag(e2, "server")) throw e2;
                continue;
            }
        }
        for (const m of media) {
            const id = numOf(m.id);
            if (id != null) out.set(id, { ...alToFields(m), ...alDetailFields(m) });
        }
    }
    return out;
}
export async function alCharacters(alId: number, signal?: AbortSignal): Promise<CastMember[]> {
    const d = await AL.q(
        `query($id:Int){ Media(id:$id){ characters(sort:[ROLE, RELEVANCE, ID], perPage: 18){ edges { role node { id name { full native } image { large } favourites } voiceActors(language: JAPANESE, sort: [RELEVANCE]) { name { full } image { large } } } } } }`,
        { id: alId },
        signal
    );
    return recordsOf(at(d, "Media", "characters", "edges")).map(e => {
        const node = fieldsOf(e.node),
            va = fieldsOf(at(e, "voiceActors", 0));
        return {
            src: "anilist",
            alId: numOf(node.id),
            name: textOf(at(node, "name", "full")),
            native: textOf(at(node, "name", "native")),
            image: textOf(at(node, "image", "large")),
            role: e.role === "MAIN" ? "Main" : e.role === "SUPPORTING" ? "Supporting" : "Background",
            va: textOf(at(va, "name", "full")),
            vaImage: textOf(at(va, "image", "large")),
            fans: numOf(node.favourites) || 0,
        };
    });
}
/** a character as AniList's search found them */
export interface AlChar {
    src: string;
    alId: number;
    name: string;
    native: string;
    image: string;
    gender: string;
    age: string;
    about: string;
    media: { alId: number; title: string; medium: string }[];
}
export async function alCharSearch(q: string, signal?: AbortSignal): Promise<AlChar[]> {
    const d = await AL.q(
        `query($q:String){ Page(perPage: 12){ characters(search:$q, sort:[SEARCH_MATCH, FAVOURITES_DESC]){ id name { full native } image { large } gender age description(asHtml:false) media(perPage: 3, sort:[POPULARITY_DESC]){ nodes { id type format countryOfOrigin title { english romaji } } } } } }`,
        { q },
        signal
    );
    return recordsOf(at(d, "Page", "characters"))
        .map(c => charFromAL(c))
        .filter(c => c.alId);
}
/** a character from AniList, as the app keeps one (alId 0: AniList gave no id) */
export function charFromAL(c: unknown): AlChar {
    const f = fieldsOf(c);
    const media = recordsOf(at(f, "media", "nodes")).flatMap(m => {
        const alId = numOf(m.id);
        return alId == null ? [] : [{ alId, title: alTitle(m), medium: alMedium(m) }];
    });
    return {
        src: "anilist",
        alId: numOf(f.id) ?? 0,
        name: textOf(at(f, "name", "full")),
        native: textOf(at(f, "name", "native")),
        image: textOf(at(f, "image", "large")),
        gender: textOf(f.gender),
        age: textOf(f.age),
        about: stripMd(textOf(f.description)).slice(0, 700),
        media,
    };
}
export async function alRecommendations(
    alId: number,
    signal?: AbortSignal
): Promise<(Candidate & { votes: number })[]> {
    const d = await AL.q(
        `query($id:Int){ Media(id:$id){ recommendations(perPage: 12, sort:[RATING_DESC]){ nodes { rating mediaRecommendation { ${AL_MEDIA} } } } } }`,
        { id: alId },
        signal
    );
    return recordsOf(at(d, "Media", "recommendations", "nodes"))
        .filter(n => isRecord(n.mediaRecommendation))
        .map(n => ({ votes: numOf(n.rating) || 0, ...alToFields(n.mediaRecommendation) }));
}

// ── Jikan (MyAnimeList scores, no key) ──
const JK = { last: 0, gap: 1150 };
async function jikanScore(type: string, malId: number | string, signal?: AbortSignal) {
    const wait = JK.last + JK.gap - Date.now();
    if (wait > 0) await sleep(wait);
    JK.last = Date.now();
    const d = at(await getJSON(`https://api.jikan.moe/v4/${type}/${malId}`, signal), "data");
    return isRecord(d)
        ? {
              mal: numOf(d.score) || undefined,
              malRank: numOf(d.rank) || undefined,
              malMembers: numOf(d.members) || undefined,
          }
        : {};
}
// MyAnimeList by title, when AniList can't place something
async function jikanSearch(q: string, type: string, signal?: AbortSignal): Promise<Candidate[]> {
    const wait = JK.last + JK.gap - Date.now();
    if (wait > 0) await sleep(wait);
    JK.last = Date.now();
    const j = await getJSON(
        `https://api.jikan.moe/v4/${type}?${new URLSearchParams({ q, limit: "8", sfw: ui.private ? "false" : "true" })}`,
        signal
    );
    return recordsOf(at(j, "data")).map(d => {
        const dur = textOf(d.duration),
            mins = /(\d+) min/.exec(dur),
            kind = textOf(d.type),
            mal = numOf(d.mal_id);
        return {
            title: textOf(d.title_english) || textOf(d.title),
            alt: { romaji: textOf(d.title), en: textOf(d.title_english), native: textOf(d.title_japanese) },
            year: numOf(d.year) || numOf(at(d, "aired", "prop", "from", "year")) || null,
            kind: kind === "Movie" ? "Movie" : kind,
            cover: textOf(at(d, "images", "jpg", "large_image_url")) || textOf(at(d, "images", "jpg", "image_url")),
            about: textOf(d.synopsis).replace(/\s*\[Written by MAL Rewrite\]\s*$/, ""),
            genres: recordsOf(d.genres)
                .map(g => textOf(g.name))
                .filter(Boolean),
            runtime: mins ? +mins[1] : null,
            ext: mal != null ? { mal } : {},
        };
    });
}
async function jikanPictures(type: string, malId: number | string, signal?: AbortSignal): Promise<string[]> {
    const j = await getJSON(`https://api.jikan.moe/v4/${type}/${malId}/pictures`, signal);
    return recordsOf(at(j, "data"))
        .map(p => textOf(at(p, "jpg", "large_image_url")) || textOf(at(p, "jpg", "image_url")))
        .filter(Boolean);
}

// ── TVmaze (TV, no key) ──
function tvmazeKind(s: Record<string, unknown>): string {
    const lang = textOf(s.language);
    if (lang === "Korean") return "K-drama";
    if (lang === "Chinese") return "C-drama";
    if (lang === "Japanese" && s.type === "Scripted") return "J-drama";
    if (s.type === "Documentary") return "Documentary";
    if (s.type === "Animation")
        return /stop.?motion|claymation/i.test(textOf(s.summary)) ? "Stop-motion" : "Western animation";
    if (s.type === "Reality") return "Reality";
    return "Live action";
}
/** a show from TVmaze, with its cast */
export type TvmazeShow = Candidate & { ext: { tvmaze?: number; imdb?: string }; cast?: CastMember[] };
function tvmazeFields(show: unknown): TvmazeShow {
    const s = fieldsOf(show),
        ep = fieldsOf(s._embedded),
        status = textOf(s.status);
    const f: TvmazeShow = {
        src: "tvmaze",
        medium: "tv",
        kind: tvmazeKind(s),
        title: textOf(s.name),
        year: yearOf(s.premiered),
        cover: textOf(at(s, "image", "original")) || textOf(at(s, "image", "medium")),
        runtime: numOf(s.averageRuntime) || numOf(s.runtime) || null,
        genres: strsOf(s.genres),
        about: stripMd(textOf(s.summary)).slice(0, 900),
        creator: textOf(at(s, "network", "name")) || textOf(at(s, "webChannel", "name")),
        airStatus: status === "Running" ? "RELEASING" : status === "Ended" ? "FINISHED" : status || undefined,
        ext: { tvmaze: numOf(s.id), imdb: textOf(at(s, "externals", "imdb")) || undefined },
        scores: { tvmaze: numOf(at(s, "rating", "average")) || undefined },
        country: textOf(at(s, "network", "country", "code")),
    };
    if (Array.isArray(ep.episodes)) f.total = ep.episodes.length;
    const next = fieldsOf(ep.nextepisode),
        airstamp = textOf(next.airstamp);
    if (airstamp) f.airing = { ep: numOf(next.number), season: numOf(next.season), at: Date.parse(airstamp) };
    if (Array.isArray(ep.cast))
        f.cast = recordsOf(ep.cast)
            .slice(0, 18)
            .map(c => ({
                src: "tvmaze",
                name: textOf(at(c, "character", "name")),
                image: textOf(at(c, "character", "image", "original")) || textOf(at(c, "character", "image", "medium")),
                va: textOf(at(c, "person", "name")),
                vaImage: textOf(at(c, "person", "image", "medium")) || textOf(at(c, "person", "image", "original")),
                role: "Cast",
            }));
    return f;
}
export async function tvmazeSearch(q: string, signal?: AbortSignal): Promise<TvmazeShow[]> {
    return recordsOf(await getJSON("https://api.tvmaze.com/search/shows?" + new URLSearchParams({ q }), signal))
        .slice(0, 12)
        .map(r => tvmazeFields(r.show));
}
/** the closest of several catalogue results to an entry, by title and year (null: none close enough) */
export function pickShow<T extends { title: string; year?: number | null }>(
    R: T[],
    b: { title: string; year?: number | null }
): T | null {
    const t = norm(cleanTitle(b.title)),
        y = b.year;
    const sc = (r: T) =>
        (norm(cleanTitle(r.title)) === t ? 2 : norm(cleanTitle(r.title)).includes(t) ? 1 : 0) +
        (y && r.year ? (r.year === y ? 2 : Math.abs(r.year - y) <= 1 ? 1 : -2) : 0);
    const best = R.map((r): [T, number] => [r, sc(r)]).sort((a, c) => c[1] - a[1])[0];
    return best && best[1] >= 1 ? best[0] : null;
}
export async function tvmazeShow(id: number | string, signal?: AbortSignal): Promise<TvmazeShow> {
    return tvmazeFields(
        await getJSON(`https://api.tvmaze.com/shows/${id}?embed[]=nextepisode&embed[]=episodes&embed[]=cast`, signal)
    );
}
export async function tvmazeByImdb(imdb: string, signal?: AbortSignal): Promise<TvmazeShow | null> {
    const s = await getJSON("https://api.tvmaze.com/lookup/shows?" + new URLSearchParams({ imdb }), signal);
    const id = numOf(at(s, "id"));
    return id ? tvmazeShow(id, signal) : null;
}
async function tvmazeImages(id: number | string, signal?: AbortSignal): Promise<Art[]> {
    return recordsOf(await getJSON(`https://api.tvmaze.com/shows/${id}/images`, signal))
        .map(i => ({ type: textOf(i.type), res: fieldsOf(i.resolutions) }))
        .filter(i => ["poster", "background", "banner"].includes(i.type))
        .map(i => ({
            cover: textOf(at(i.res, "original", "url")) || textOf(at(i.res, "medium", "url")),
            label: i.type.charAt(0).toUpperCase() + i.type.slice(1),
            wide: i.type !== "poster",
        }));
}

// ── Wikidata + Wikipedia (film, TV, games, comics; no key) ──
/** the descriptions Wikidata gives each medium */
export const WD_MEDIUM: Record<string, RegExp> = {
    film: /\b(film|movie)\b(?! series| franchise| director| producer| actor| studio| festival| score| character)/i,
    tv: /(television|tv|web|drama|anime) (series|drama|programme|program|show)|miniseries|sitcom|soap opera|k-drama/i,
    game: /video game|computer game|mobile game|game for/i,
    comic: /comic|graphic novel|webcomic|comic book/i,
    book: /\b(novel|book|novella|memoir|short story collection|poem)\b/i,
    manga: /manga|manhwa|light novel/i,
    anime: /anime/i,
};
export function wdMediumOf(desc: string | undefined): string | null {
    for (const k of ["game", "anime", "manga", "tv", "film", "comic", "book"])
        if (WD_MEDIUM[k].test(desc || "")) return k;
    return null;
}
export async function wdSearch(q: string, medium: string, signal?: AbortSignal): Promise<Candidate[]> {
    const j = await getJSON(
        "https://www.wikidata.org/w/api.php?" +
            new URLSearchParams({
                action: "wbsearchentities",
                search: q,
                language: "en",
                uselang: "en",
                type: "item",
                limit: "20",
                format: "json",
                origin: "*",
            }),
        signal
    );
    const re = medium ? WD_MEDIUM[medium] : null;
    const hits = recordsOf(at(j, "search"))
        .map(h => ({ id: textOf(h.id), label: textOf(h.label), description: textOf(h.description) }))
        .filter(h => h.id && (!re || re.test(h.description)))
        .slice(0, 10);
    if (!hits.length) return [];
    const det = await wdDetails(
        hits.map(h => h.id),
        signal,
        medium
    );
    return hits.map(h => {
        const d = det.get(h.id);
        return {
            ...(d || {}),
            kind: medium === "film" ? (d && d.filmKind) || "" : undefined,
            src: "wikidata",
            medium,
            title: (d && d.title) || h.label,
            about: (d && d.about) || h.description,
            desc: h.description,
        };
    });
}
function parseScores(rows: [by: string, value: string][]): Record<string, number | undefined> {
    const s: Record<string, number | undefined> = {};
    for (const [by, v] of rows) {
        const val = String(v);
        let m: RegExpExecArray | null;
        if (/rotten/i.test(by) && !s.rt && (m = /(\d+)\s*%/.exec(val))) s.rt = parseInt(m[1], 10);
        else if (/metacritic/i.test(by) && !s.meta && (m = /(\d+)\s*\/\s*100/.exec(val))) s.meta = parseInt(m[1], 10);
        else if (/imdb/i.test(by) && !s.imdb && (m = /(\d+(?:\.\d)?)\s*\/\s*10/.exec(val))) s.imdb = parseFloat(m[1]);
    }
    return s;
}
// who made it depends on the medium: a film's director (P57), a show's creator (P170), a game's developer (P178), a book's author (P50).
// (Composers, P86, used to slip in here, which is how Good Will Hunting got the wrong "director".)
const WD_ROLE: Record<string, string[]> = {
    film: ["dir", "creator"],
    tv: ["creator", "dir"],
    game: ["dev"],
    book: ["author", "creator"],
    comic: ["author", "creator"],
    manga: ["author", "creator"],
};
/** a SPARQL answer's rows */
const sparqlRows = (j: unknown) => recordsOf(at(j, "results", "bindings"));
/** one value of a SPARQL row ("" when it has none) */
const sv = (r: Record<string, unknown>, k: string) => textOf(at(r, k, "value"));
/** a Wikidata label that's a name, not a bare id ("Q1234" means it has no English label) */
const svName = (r: Record<string, unknown>, k: string) => {
    const x = sv(r, k);
    return x && !/^Q\d+$/.test(x) ? x : "";
};
/** the id at the end of a Wikidata address */
const qidOf = (u: string) => u.split("/").pop() || "";
interface WdFacts {
    title: string;
    years: number[];
    dur: number | null;
    imdb: string | null;
    creators: Record<string, Set<string>>;
    genres: Set<string>;
    article: string | null;
    scoreRows: [string, string][];
    eps: number | null;
    country: string;
    plats: Set<string>;
    steam: string | null;
    wimg: string;
}
/** titles' details from Wikidata (and the first lines of their Wikipedia articles), by Wikidata id */
export async function wdDetails(
    qids: string[],
    signal?: AbortSignal,
    medium?: string
): Promise<Map<string, Candidate>> {
    const query = `SELECT ?item ?itemLabel ?date ?dur ?imdb ?creatorLabel ?crole ?genreLabel ?countryLabel ?article ?score ?byLabel ?eps ?platLabel ?steam ?wimg WHERE {
    VALUES ?item { ${qids.map(q => "wd:" + q).join(" ")} }
    OPTIONAL { ?item wdt:P577 ?date } OPTIONAL { ?item wdt:P2047 ?dur } OPTIONAL { ?item wdt:P345 ?imdb } OPTIONAL { ?item wdt:P1113 ?eps }
    OPTIONAL { { ?item wdt:P57 ?creator . BIND("dir" AS ?crole) } UNION { ?item wdt:P170 ?creator . BIND("creator" AS ?crole) } UNION { ?item wdt:P178 ?creator . BIND("dev" AS ?crole) } UNION { ?item wdt:P50 ?creator . BIND("author" AS ?crole) } }
    OPTIONAL { ?item wdt:P136 ?genre } OPTIONAL { ?item wdt:P495 ?country }${medium === "game" ? " OPTIONAL { ?item wdt:P400 ?plat } OPTIONAL { ?item wdt:P1733 ?steam } OPTIONAL { ?item wdt:P18|wdt:P154 ?wimg }" : ""}
    OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
    OPTIONAL { ?item p:P444 ?st . ?st ps:P444 ?score ; pq:P447 ?by }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 3000`;
    const j = await getJSON(
        "https://query.wikidata.org/sparql?" + new URLSearchParams({ format: "json", query }),
        signal
    );
    const map = new Map<string, WdFacts>();
    for (const r of sparqlRows(j)) {
        const q = qidOf(sv(r, "item"));
        if (!q) continue;
        const e: WdFacts = map.get(q) || {
            title: sv(r, "itemLabel"),
            years: [],
            dur: null,
            imdb: null,
            creators: {},
            genres: new Set(),
            article: null,
            scoreRows: [],
            eps: null,
            country: "",
            plats: new Set(),
            steam: null,
            wimg: "",
        };
        const country = sv(r, "countryLabel"),
            plat = sv(r, "platLabel"),
            creator = sv(r, "creatorLabel"),
            genre = sv(r, "genreLabel"),
            article = sv(r, "article"),
            score = sv(r, "score"),
            by = sv(r, "byLabel");
        if (country && !e.country) e.country = country;
        if (plat && !/^Q\d+$/.test(plat)) e.plats.add(plat);
        if (sv(r, "steam") && !e.steam) e.steam = sv(r, "steam");
        if (sv(r, "wimg") && !e.wimg) e.wimg = sv(r, "wimg");
        const y = yearOf(sv(r, "date"));
        if (y) e.years.push(y);
        if (sv(r, "dur") && !e.dur) e.dur = Math.round(parseFloat(sv(r, "dur"))) || null;
        if (sv(r, "imdb") && !e.imdb) e.imdb = sv(r, "imdb");
        if (sv(r, "eps") && !e.eps) e.eps = parseInt(sv(r, "eps"), 10) || null;
        if (creator && !/^Q\d+$/.test(creator)) {
            const k = sv(r, "crole") || "creator";
            (e.creators[k] = e.creators[k] || new Set()).add(creator);
        }
        if (genre && !/^Q\d+$/.test(genre)) e.genres.add(genre.replace(/ (film|video game|television series)$/i, ""));
        if (article)
            try {
                e.article = decodeURIComponent(article.split("/wiki/").pop() || "").replace(/_/g, " ");
            } catch (_) {}
        if (score && by) e.scoreRows.push([by, score]);
        map.set(q, e);
    }
    const wiki = await wikiPages(
        [...map.values()].map(e => e.article).filter((a): a is string => !!a),
        signal
    ).catch(() => new Map<string, WikiPage>());
    const out = new Map<string, Candidate>();
    for (const [q, e] of map) {
        const w = (e.article && wiki.get(e.article)) || { image: "", extract: "" };
        const roles = (medium && WD_ROLE[medium]) || ["dir", "creator", "dev", "author"],
            who = roles.map(k => e.creators[k]).find(x => x && x.size);
        out.set(q, {
            title: e.title,
            year: e.years.sort()[0] || null,
            runtime: e.dur,
            total: e.eps,
            platforms: e.plats.size ? [...e.plats].slice(0, 8) : undefined,
            creator: who ? [...who].slice(0, 2).join(" & ") : "",
            genres: [...e.genres].slice(0, 6),
            cover:
                w.image ||
                (e.wimg ? commonsImg(e.wimg) : "") ||
                (e.steam ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${e.steam}/library_600x900_2x.jpg` : ""),
            about: w.extract || "",
            ext: { wikidata: q, imdb: e.imdb || undefined, wiki: e.article || undefined, steam: e.steam || undefined },
            scores: parseScores(e.scoreRows),
            filmKind: [...e.genres].some(g => /animat/i.test(g))
                ? "Animated"
                : [...e.genres].some(g => /documentary/i.test(g))
                  ? "Documentary"
                  : /United States|United Kingdom/.test(e.country)
                    ? "Hollywood"
                    : /India/.test(e.country)
                      ? "Bollywood"
                      : e.country
                        ? "World cinema"
                        : "",
        });
    }
    return out;
}
interface WikiPage {
    image: string;
    extract: string;
}
async function wikiPages(titles: string[], signal?: AbortSignal): Promise<Map<string, WikiPage>> {
    const out = new Map<string, WikiPage>();
    for (let i = 0; i < titles.length; i += 20) {
        const chunk = titles.slice(i, i + 20);
        const j = await getJSON(
            "https://en.wikipedia.org/w/api.php?" +
                new URLSearchParams({
                    action: "query",
                    prop: "pageimages|extracts",
                    titles: chunk.join("|"),
                    pithumbsize: "600",
                    pilicense: "any",
                    exintro: "1",
                    explaintext: "1",
                    exsentences: "4",
                    redirects: "1",
                    format: "json",
                    origin: "*",
                }),
            signal
        );
        const back = new Map<string, string>();
        for (const r of recordsOf(at(j, "query", "redirects"))) back.set(textOf(r.to), textOf(r.from));
        for (const r of recordsOf(at(j, "query", "normalized"))) back.set(textOf(r.to), textOf(r.from));
        for (const p of Object.values(fieldsOf(at(j, "query", "pages")))) {
            const title = textOf(at(p, "title"));
            if (!title) continue;
            const once = back.get(title),
                key = (once && back.get(once)) || once || title;
            const page = {
                image: textOf(at(p, "thumbnail", "source")),
                extract: textOf(at(p, "extract")).slice(0, 900),
            };
            out.set(key, page);
            out.set(title, page);
        }
    }
    return out;
}
/** what's adapted from these Wikidata items, or what they're adapted from */
export async function wdAdaptations(
    qids: string[],
    signal?: AbortSignal
): Promise<{ src: string; qid: string; title: string; desc: string; dir: string }[]> {
    const query = `SELECT ?src ?x ?xLabel ?xDesc ?dir WHERE {
    VALUES ?src { ${qids.map(q => "wd:" + q).join(" ")} }
    { ?x wdt:P144 ?src . BIND("from" AS ?dir) } UNION { ?src wdt:P144 ?x . BIND("to" AS ?dir) } UNION { ?x wdt:P8371 ?src . BIND("from" AS ?dir) }
    OPTIONAL { ?x schema:description ?xDesc FILTER(lang(?xDesc) = "en") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 400`;
    const j = await getJSON(
        "https://query.wikidata.org/sparql?" + new URLSearchParams({ format: "json", query }),
        signal
    );
    return sparqlRows(j)
        .map(r => ({
            src: qidOf(sv(r, "src")),
            qid: qidOf(sv(r, "x")),
            title: sv(r, "xLabel"),
            desc: sv(r, "xDesc"),
            dir: sv(r, "dir"),
        }))
        .filter(r => r.qid && r.title && !/^Q\d+$/.test(r.title));
}
/** a title's Wikidata id (Q…), or null */
export async function wdFind(
    title: string,
    medium: string | null,
    year: number | null | undefined,
    signal?: AbortSignal
): Promise<string | null> {
    const j = await getJSON(
        "https://www.wikidata.org/w/api.php?" +
            new URLSearchParams({
                action: "wbsearchentities",
                search: cleanTitle(title),
                language: "en",
                type: "item",
                limit: "12",
                format: "json",
                origin: "*",
            }),
        signal
    );
    const re = medium ? WD_MEDIUM[medium === "novel" || medium === "manhwa" ? "manga" : medium] : null;
    const hits = recordsOf(at(j, "search")).filter(h => textOf(h.id) && (!re || re.test(textOf(h.description))));
    const y = year && hits.find(h => textOf(h.description).includes(String(year)));
    return textOf((y || hits[0] || {}).id) || null;
}

// ── iTunes catalogue (no key): film posters, directors, years, synopses ──
async function itunesFilms(q: string, signal?: AbortSignal): Promise<Candidate[]> {
    const j = await itunesJSON(
        {
            term: q,
            media: "movie",
            entity: "movie",
            limit: "15",
            country: (meta.settings.region || "GB").toLowerCase(),
        },
        signal
    );
    return recordsOf(at(j, "results"))
        .filter(r => r.kind === "feature-movie" || r.wrapperType === "track")
        .map(r => {
            const genre = textOf(r.primaryGenreName),
                ms = numOf(r.trackTimeMillis),
                id = numOf(r.trackId);
            return {
                src: "itunes",
                medium: "film",
                title: textOf(r.trackName),
                year: yearOf(r.releaseDate),
                creator: textOf(r.artistName),
                cover: textOf(r.artworkUrl100).replace(/\/\d+x\d+bb\./, "/600x900bb."),
                about: (textOf(r.longDescription) || textOf(r.shortDescription)).slice(0, 900),
                genres: genre ? [genre] : [],
                runtime: ms ? Math.round(ms / 60000) : null,
                ext: id != null ? { itunes: id } : {},
            };
        });
}
export async function filmSearchKeyless(q: string, signal?: AbortSignal): Promise<Candidate[]> {
    const [a, b] = await Promise.all([
        itunesFilms(q, signal).catch((e): Candidate[] => {
            if (aborted(e)) throw e;
            return [];
        }),
        wdSearch(q, "film", signal).catch((e): Candidate[] => {
            if (aborted(e)) throw e;
            return [];
        }),
    ]);
    // one entry per film: Wikidata's facts with iTunes' poster where they agree on title and year
    const out = [...b];
    for (const x of a) {
        const m = out.find(
            y =>
                norm(cleanTitle(y.title)) === norm(cleanTitle(x.title)) &&
                (!y.year || !x.year || Math.abs(y.year - x.year) <= 1)
        );
        if (m) {
            if (!m.cover) m.cover = x.cover;
            if (!m.about) m.about = x.about;
            if (!m.creator) m.creator = x.creator;
            if (!m.runtime) m.runtime = x.runtime;
            m.ext = { ...x.ext, ...m.ext };
        } else out.push(x);
    }
    return out.filter(x => ui.private || !x.flag).slice(0, 16);
}

// ── TMDB (optional free key) ──
const TMDB_IMG = (p: unknown, size = "w500") => (p ? `https://image.tmdb.org/t/p/${size}${textOf(p)}` : "");
export async function tmdb(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
    const key = KEYS.tmdb;
    if (!key) {
        if (!siteShares.tmdb) throw new Error("no-key");
        return getJSON(`${location.origin}/api/tmdb${path}?${new URLSearchParams(params)}`, signal);
    }
    const bearer = key.startsWith("eyJ");
    const u =
        "https://api.themoviedb.org/3" +
        path +
        "?" +
        new URLSearchParams({ ...params, ...(bearer ? {} : { api_key: key }) });
    return getJSON(u, signal, bearer ? { headers: { Authorization: "Bearer " + key } } : {});
}
/** a TMDB result's genre ids, from a search (genre_ids) or a title's details (genres) */
const tmdbGenreIds = (r: Record<string, unknown>): unknown[] =>
    Array.isArray(r.genre_ids) ? r.genre_ids : recordsOf(r.genres).map(x => x.id);
function tmdbKind(r: Record<string, unknown>, type: string): string {
    const lang = textOf(r.original_language),
        g = tmdbGenreIds(r);
    if (type === "movie")
        return g.includes(16)
            ? lang === "ja"
                ? "Anime film"
                : "Animated"
            : g.includes(99)
              ? "Documentary"
              : lang === "hi"
                ? "Bollywood"
                : ["ta", "te", "ml", "kn", "bn", "mr", "pa"].includes(lang)
                  ? "Indian cinema"
                  : lang === "en"
                    ? "Hollywood"
                    : "World cinema";
    if (lang === "ko") return "K-drama";
    if (lang === "zh") return "C-drama";
    if (lang === "ja" && !g.includes(16)) return "J-drama";
    if (g.includes(99)) return "Documentary";
    if (g.includes(16)) return "Western animation";
    if (g.includes(10764)) return "Reality";
    return "Live action";
}
type TmdbFound = Candidate & { ext: ItemExt };
function tmdbFields(x: unknown, type: string): TmdbFound {
    const r = fieldsOf(x),
        g = tmdbGenreIds(r),
        isAnime = type === "tv" && r.original_language === "ja" && g.includes(16),
        vote = numOf(r.vote_average);
    return {
        src: "tmdb",
        medium: type === "movie" ? "film" : isAnime ? "anime" : "tv",
        kind: isAnime ? "TV" : tmdbKind(r, type),
        title: textOf(r.title) || textOf(r.name),
        alt: { original: textOf(r.original_title) || textOf(r.original_name) },
        year: yearOf(r.release_date || r.first_air_date),
        cover: TMDB_IMG(r.poster_path),
        banner: TMDB_IMG(r.backdrop_path, "w1280"),
        about: textOf(r.overview),
        ext: { tmdb: numOf(r.id), tmdbType: type },
        scores: { tmdb: vote ? Math.round(vote * 10) / 10 : undefined },
        popularity: numOf(r.popularity) || 0,
        lang: textOf(r.original_language),
    };
}
export async function tmdbSearch(q: string, medium: string, signal?: AbortSignal): Promise<Candidate[]> {
    const type = medium === "film" ? "movie" : "tv";
    const j = await tmdb("/search/" + type, { query: q, include_adult: ui.private ? "true" : "false" }, signal);
    return recordsOf(at(j, "results"))
        .slice(0, 14)
        .map(r => tmdbFields(r, type));
}
/** a title's details from TMDB: its fields, with its cast and what TMDB recommends */
export async function tmdbDetails(
    id: number | string,
    type: string,
    signal?: AbortSignal
): Promise<Candidate & { cast?: CastMember[]; recs?: Candidate[] }> {
    const d = fieldsOf(
        await tmdb(
            `/${type}/${id}`,
            {
                append_to_response:
                    type === "movie"
                        ? "external_ids,credits,recommendations"
                        : "external_ids,aggregate_credits,recommendations",
            },
            signal
        )
    );
    const f: TmdbFound & { recs?: Candidate[] } = tmdbFields(d, type);
    f.genres = recordsOf(d.genres)
        .map(g => textOf(g.name))
        .filter(Boolean);
    f.ext.imdb = textOf(at(d, "external_ids", "imdb_id")) || textOf(d.imdb_id) || undefined;
    const tvdb = at(d, "external_ids", "tvdb_id");
    if (tvdb) f.ext.tvdb = numOf(tvdb) ?? textOf(tvdb);
    if (type === "movie") {
        f.runtime = numOf(d.runtime) || null;
        f.creator = recordsOf(at(d, "credits", "crew"))
            .filter(c => c.job === "Director")
            .map(c => textOf(c.name))
            .slice(0, 2)
            .join(" & ");
        f.cast = castSplit(
            recordsOf(at(d, "credits", "cast"))
                .slice(0, 18)
                .map(c => ({
                    src: "tmdb",
                    name: textOf(c.character),
                    va: textOf(c.name),
                    image: "",
                    vaImage: TMDB_IMG(c.profile_path, "w300"),
                    role: "Cast",
                }))
        );
    } else {
        f.total = numOf(d.number_of_episodes) || null;
        f.runtime = numOf(at(d, "episode_run_time", 0)) || numOf(at(d, "last_episode_to_air", "runtime")) || null;
        f.creator =
            recordsOf(d.created_by)
                .map(c => textOf(c.name))
                .slice(0, 2)
                .join(" & ") ||
            textOf(at(d, "networks", 0, "name")) ||
            "";
        f.airStatus = d.status === "Returning Series" || d.in_production ? "RELEASING" : "FINISHED";
        const next = fieldsOf(d.next_episode_to_air),
            airDate = textOf(next.air_date);
        if (airDate)
            f.airing = {
                ep: numOf(next.episode_number),
                season: numOf(next.season_number),
                at: Date.parse(airDate + "T12:00:00Z"),
            };
        f.cast = castSplit(
            recordsOf(at(d, "aggregate_credits", "cast"))
                .slice(0, 18)
                .flatMap(c => {
                    const roles = recordsOf(c.roles);
                    return (
                        roles.length
                            ? [...roles]
                                  .sort((a, b) => (numOf(b.episode_count) || 0) - (numOf(a.episode_count) || 0))
                                  .slice(0, 4)
                            : [{ character: "" }]
                    ).map(r => ({
                        src: "tmdb",
                        name: textOf(r.character),
                        va: textOf(c.name),
                        image: "",
                        vaImage: TMDB_IMG(c.profile_path, "w300"),
                        role: "Cast",
                        eps: numOf(r.episode_count) || 0,
                    }));
                })
        );
    }
    f.recs = recordsOf(at(d, "recommendations", "results"))
        .slice(0, 12)
        .map(r => tmdbFields(r, type));
    return f;
}
async function tmdbImages(id: number | string, type: string, signal?: AbortSignal): Promise<Art[]> {
    const j = fieldsOf(await tmdb(`/${type}/${id}/images`, { include_image_language: "en,null" }, signal));
    return [
        ...recordsOf(j.posters)
            .slice(0, 40)
            .map(p => ({
                cover: TMDB_IMG(p.file_path),
                label: "Poster" + (p.iso_639_1 ? " · " + textOf(p.iso_639_1) : ""),
            })),
        ...recordsOf(j.backdrops)
            .slice(0, 12)
            .map(p => ({ cover: TMDB_IMG(p.file_path, "w1280"), label: "Backdrop", wide: true })),
    ];
}

// ── OMDb (optional free key): IMDb, Rotten Tomatoes, Metacritic ──
async function omdbScores(imdb: string, signal?: AbortSignal): Promise<Record<string, number | undefined>> {
    if (!KEYS.omdb || !imdb) return {};
    const j = fieldsOf(
        await getJSON("https://www.omdbapi.com/?" + new URLSearchParams({ i: imdb, apikey: KEYS.omdb }), signal)
    );
    if (j.Response === "False") {
        if (/invalid api key/i.test(textOf(j.Error))) throw new SourceError("auth", { auth: true });
        return {};
    }
    const s = parseScores(recordsOf(j.Ratings).map((r): [string, string] => [textOf(r.Source), textOf(r.Value)]));
    const rating = textOf(j.imdbRating),
        metascore = textOf(j.Metascore);
    if (rating && rating !== "N/A") s.imdb = parseFloat(rating);
    if (metascore && metascore !== "N/A") s.meta = parseInt(metascore, 10);
    if (j.imdbVotes) s.imdbVotes = parseInt(textOf(j.imdbVotes).replace(/,/g, ""), 10) || undefined;
    return s;
}

// ── RAWG (optional free key) ──
/** a request to RAWG with your key: its JSON, as sent */
export async function rawg(path: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
    if (!KEYS.rawg) throw new Error("no-key");
    return getJSON("https://api.rawg.io/api" + path + "?" + new URLSearchParams({ ...params, key: KEYS.rawg }), signal);
}
/** a RAWG game, as an entry's fields */
export function rawgFields(x: unknown): Candidate & { ext: ItemExt } {
    const g = fieldsOf(x),
        p = recordsOf(g.platforms)
            .map(pl => textOf(at(pl, "platform", "name")))
            .filter(Boolean);
    return {
        src: "rawg",
        medium: "game",
        title: textOf(g.name),
        year: yearOf(g.released),
        cover: textOf(g.background_image),
        banner: textOf(g.background_image_additional) || textOf(g.background_image),
        genres: recordsOf(g.genres)
            .map(x => textOf(x.name))
            .filter(Boolean),
        platforms: p,
        total: numOf(g.playtime) || null,
        kind:
            p.length && p.every(x => /iOS|Android/.test(x))
                ? "Mobile"
                : p.some(x => /Web/.test(x)) && p.length === 1
                  ? "Browser"
                  : "Console & PC",
        ext: { rawg: numOf(g.id), rawgSlug: textOf(g.slug) || undefined },
        scores: { meta: numOf(g.metacritic) || undefined, rawg: numOf(g.rating) || undefined },
        popularity: numOf(g.added) || 0,
    };
}
export function rawgPick<T extends Candidate>(R: T[], b: { title: string; year?: number | null }): T | null {
    const t = norm(cleanTitle(b.title)),
        y = b.year;
    const sc = (r: T) =>
        (norm(cleanTitle(r.title)) === t ? 3 : norm(cleanTitle(r.title)).startsWith(t) ? 1 : 0) +
        (y && r.year ? (r.year === y ? 2 : Math.abs(r.year - y) <= 1 ? 1 : -1) : 0) +
        Math.min(1, (r.popularity || 0) / 2000);
    const best = R.map((r): [T, number] => [r, sc(r)]).sort((a, c) => c[1] - a[1])[0];
    return best && best[1] >= 2 ? best[0] : null;
}
export async function rawgSearch(q: string, signal?: AbortSignal): Promise<(Candidate & { ext: ItemExt })[]> {
    return recordsOf(at(await rawg("/games", { search: q, page_size: "14" }, signal), "results")).map(rawgFields);
}
export async function rawgDetails(id: number | string, signal?: AbortSignal): Promise<Candidate> {
    const g = fieldsOf(await rawg("/games/" + id, {}, signal)),
        f = rawgFields(g);
    f.about = textOf(g.description_raw).slice(0, 900);
    f.creator = recordsOf(g.developers)
        .map(d => textOf(d.name))
        .slice(0, 2)
        .join(" & ");
    f.themes = recordsOf(g.tags)
        .filter(t => t.language === "eng")
        .slice(0, 8)
        .map(t => textOf(t.name));
    try {
        const st = await rawg(`/games/${id}/stores`, {}, signal);
        const steam = recordsOf(at(st, "results"))
            .map(x => /store\.steampowered\.com\/app\/(\d+)/.exec(textOf(x.url)))
            .find(m => m != null);
        if (steam) {
            f.ext = { ...f.ext, steam: steam[1] };
            const box = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steam[1]}/library_600x900_2x.jpg`;
            if (await probeImg(box)) f.boxart = box;
        }
    } catch (_) {}
    return f;
}
async function rawgImages(id: number | string, signal?: AbortSignal): Promise<Art[]> {
    const j = await rawg(`/games/${id}/screenshots`, {}, signal);
    return recordsOf(at(j, "results")).map(s => ({ cover: textOf(s.image), label: "Screenshot", wide: true }));
}

// ── Open Library / Google Books ──
export const olCover = (id: number | string, size = "M") =>
    `https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`;
export async function olSearch(q: string, limit = 8, signal?: AbortSignal): Promise<Candidate[]> {
    const isbn = q.replace(/[-\s]/g, "");
    const params: Record<string, string> = /^\d{9}[\dXx]$|^\d{13}$/.test(isbn) ? { isbn } : { q };
    const u =
        "https://openlibrary.org/search.json?" +
        new URLSearchParams({
            ...params,
            limit: String(limit),
            fields: "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,edition_count,ratings_average",
        });
    const r = await fetch(u, { signal });
    if (!r.ok) throw new Error("Open Library " + r.status);
    const j: unknown = await r.json();
    return recordsOf(at(j, "docs")).map(d => {
        const authors = strsOf(d.author_name).slice(0, 2).join(" & "),
            pages = numOf(d.number_of_pages_median) || null,
            cover = numOf(d.cover_i),
            rating = numOf(d.ratings_average),
            subjects = strsOf(d.subject),
            key = textOf(d.key);
        return {
            src: "ol",
            medium: "book",
            olKey: key,
            title: textOf(d.title),
            author: authors,
            creator: authors,
            year: numOf(d.first_publish_year) || null,
            pages,
            total: pages,
            cover: cover ? olCover(cover) : "",
            subjects: subjects.slice(0, 30),
            genres: mapGenres(subjects),
            editions: numOf(d.edition_count) || 0,
            ext: { olKey: key },
            scores: { ol: rating ? Math.round(rating * 100) / 100 : undefined },
        };
    });
}
export async function gbSearch(q: string, limit = 6, signal?: AbortSignal): Promise<Candidate[]> {
    const r = await fetch(
        "https://www.googleapis.com/books/v1/volumes?" +
            new URLSearchParams({ q, maxResults: String(limit), printType: "books" }),
        { signal }
    );
    if (!r.ok) throw new Error("Google Books " + r.status);
    const j: unknown = await r.json();
    return recordsOf(at(j, "items")).map(it => {
        const v = fieldsOf(it.volumeInfo);
        const img = textOf(at(v, "imageLinks", "thumbnail")) || textOf(at(v, "imageLinks", "smallThumbnail"));
        const authors = strsOf(v.authors).slice(0, 2).join(" & "),
            pages = numOf(v.pageCount) || null,
            subtitle = textOf(v.subtitle);
        return {
            src: "gb",
            medium: "book",
            title: textOf(v.title) + (subtitle ? ": " + subtitle : ""),
            author: authors,
            creator: authors,
            year: parseInt(textOf(v.publishedDate), 10) || null,
            pages,
            total: pages,
            cover: img ? img.replace(/^http:/, "https:").replace("&edge=curl", "") : "",
            about: textOf(v.description)
                .replace(/<[^>]+>/g, "")
                .slice(0, 600),
            genres: mapGenres(strsOf(v.categories)),
            ext: {},
            scores: { gb: numOf(v.averageRating) || undefined },
        };
    });
}
export async function olDescription(key: string, signal?: AbortSignal): Promise<string> {
    try {
        const r = await fetch("https://openlibrary.org" + key + ".json", { signal });
        if (!r.ok) return "";
        const j: unknown = await r.json();
        const desc = at(j, "description");
        const d = typeof desc === "string" ? desc : textOf(at(desc, "value"));
        return d
            .replace(/\r/g, "")
            .split(/\n\n|----------/)[0]
            .replace(/\[[^\]]*\]\([^)]*\)/g, "")
            .trim()
            .slice(0, 600);
    } catch (_) {
        return "";
    }
}
async function olDims(key: string, signal?: AbortSignal): Promise<Item["dims"] | null> {
    try {
        const j = await getJSON("https://openlibrary.org" + key + "/editions.json?limit=12", signal);
        for (const ed of recordsOf(at(j, "entries"))) {
            const d = textOf(ed.physical_dimensions);
            const m = /([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*(centimeters|cm|inches|in)/i.exec(d);
            if (m) {
                const k = /in/i.test(m[4]) ? 2.54 : 1,
                    n = [m[1], m[2], m[3]].map(v => parseFloat(v) * k).sort((a, b) => b - a);
                if (n[0] > 8 && n[0] < 45)
                    return {
                        h: Math.round(n[0] * 10) / 10,
                        w: Math.round(n[1] * 10) / 10,
                        d: Math.round(n[2] * 10) / 10,
                    };
            }
        }
    } catch (e) {
        if (aborted(e)) throw e;
    }
    return null;
}
async function olRatings(key: string, signal?: AbortSignal): Promise<Record<string, number | undefined>> {
    try {
        const j = await getJSON("https://openlibrary.org" + key + "/ratings.json", signal);
        const avg = numOf(at(j, "summary", "average"));
        return avg ? { ol: Math.round(avg * 100) / 100, olCount: numOf(at(j, "summary", "count")) } : {};
    } catch (e) {
        if (aborted(e)) throw e;
        return {};
    }
}
export async function findCandidates(title: string, author: unknown, signal?: AbortSignal): Promise<Candidate[]> {
    const q = cleanTitle(title) + (author ? " " + String(author).split(/&|,| and /)[0] : "");
    let list: Candidate[] = [],
        olErr: unknown = null,
        gbErr: unknown = null;
    try {
        list = await olSearch(q, 8, signal);
    } catch (e) {
        if (aborted(e)) throw e;
        olErr = e;
    }
    if (!list.some(c => c.cover)) {
        try {
            list = list.concat(await gbSearch(q, 6, signal));
        } catch (e) {
            if (aborted(e)) throw e;
            gbErr = e;
        }
    }
    if (olErr && gbErr) throw olErr;
    return list;
}
/** a search result is this book: its title, and its author's surname when there is one */
export function titleMatch(
    b: { title: string; creator?: string; author?: string },
    c: { title: string; creator?: string; author?: string }
): boolean {
    const t = norm(cleanTitle(b.title)),
        first = t.split(" ").filter(w => w.length > 2)[0] || t;
    const sur = norm(String(b.creator || b.author || "").split(/&|,| and /)[0])
        .split(" ")
        .pop();
    return norm(c.title).includes(first) && (!sur || norm(c.author || c.creator).includes(sur));
}
export function bestMatch(
    b: { title: string; creator?: string; author?: string },
    list: Candidate[]
): Candidate | null {
    const exact = norm(cleanTitle(b.title));
    const ok = list.filter(c => c.cover && (titleMatch(b, c) || norm(cleanTitle(c.title)) === exact));
    ok.sort((x, y) => Number(y.src === "ol") - Number(x.src === "ol") || (y.editions || 0) - (x.editions || 0));
    return ok[0] || null;
}
/** a picture found for an entry, before it's offered */
interface Art {
    cover: string;
    label: string;
    wide?: boolean;
}
async function allBookCovers(
    b: Item,
    signal?: AbortSignal,
    progress?: (label: string) => void
): Promise<{ covers: Art[]; meta: Candidate | null }> {
    const fa = String(b.creator || "").split(/&|,| and /)[0];
    const q = cleanTitle(b.title) + " " + fa;
    let olErr: unknown = null;
    const found = await olSearch(q, 10, signal).catch((e): Candidate[] => {
        if (aborted(e)) throw e;
        olErr = e;
        return [];
    });
    const works = found
        .filter(c => titleMatch(b, c) || norm(cleanTitle(c.title)) === norm(cleanTitle(b.title)))
        .sort((x, y) => (y.editions || 0) - (x.editions || 0));
    const keys = [
        ...new Set(
            [textOf(b.ext && b.ext.olKey), textOf(b.olKey), ...works.map(w => w.olKey || "")].filter(k =>
                k.startsWith("/works/")
            )
        ),
    ].slice(0, 3);
    const seen = new Set<number | string>(),
        out: Art[] = [];
    const add = (x: unknown, label: string) => {
        const id = numOf(x);
        if (!id || id < 0 || seen.has(id)) return;
        seen.add(id);
        out.push({ cover: olCover(id), label });
    };
    const json = (u: string) => fetch(u, { signal }).then((r): Promise<unknown> | object => (r.ok ? r.json() : {}));
    for (const key of keys) {
        progress && progress(`Reading ${out.length} covers so far…`);
        try {
            const w = await json("https://openlibrary.org" + key + ".json");
            for (const id of listOf(at(w, "covers"))) add(id, "Main cover");
        } catch (e) {
            if (aborted(e)) throw e;
        }
        let url: string | null = "https://openlibrary.org" + key + "/editions.json?limit=200",
            pages = 0;
        while (url && pages++ < 3) {
            try {
                const j = await json(url);
                for (const ed of recordsOf(at(j, "entries"))) {
                    const label =
                        [textOf(at(ed, "publishers", 0)), textOf(ed.publish_date)].filter(Boolean).join(", ") ||
                        textOf(ed.title) ||
                        "Edition";
                    for (const id of listOf(ed.covers)) add(id, label);
                }
                const next = textOf(at(j, "links", "next"));
                url = next ? "https://openlibrary.org" + next : null;
                progress && progress(`Found ${out.length} covers…`);
            } catch (e) {
                if (aborted(e)) throw e;
                url = null;
            }
        }
    }
    try {
        (await appleBookCovers(b, signal)).forEach(c => {
            if (!seen.has(c.cover)) {
                seen.add(c.cover);
                out.unshift(c);
            }
        });
    } catch (e) {
        if (aborted(e)) throw e;
    }
    try {
        const w = await wikiBookCover(b, signal);
        if (w && !seen.has(w)) {
            seen.add(w);
            out.push({ cover: w, label: "Wikipedia (first edition)" });
        }
    } catch (e) {
        if (aborted(e)) throw e;
    }
    try {
        (await (b.medium === "comic" ? cvCovers : hcCovers)(b, signal)).forEach(c => {
            if (!seen.has(c.cover)) {
                seen.add(c.cover);
                out.push(c);
            }
        });
    } catch (e) {
        if (aborted(e)) throw e;
    }
    try {
        (await gbSearch(`intitle:"${cleanTitle(b.title)}"${fa ? ` inauthor:${surname(fa) || fa}` : ""}`, 20, signal))
            .filter(c => c.cover && titleMatch(b, c))
            .forEach(c => {
                if (c.cover && !seen.has(c.cover)) {
                    seen.add(c.cover);
                    out.push({ cover: c.cover, label: "Google Books" + (c.year ? ", " + c.year : "") });
                }
            });
    } catch (e) {
        if (aborted(e)) throw e;
        if (olErr && !out.length) throw olErr;
    }
    return { covers: out, meta: works[0] || null };
}

// ── one search box per medium ──
/** the catalogue a medium is looked up in, by name */
export function sourceFor(medium: string): string {
    if (medium === "book") return "Open Library";
    if (["anime", "manga", "manhwa", "novel"].includes(medium)) return "AniList";
    if (medium === "tv") return TMDB_ON() ? "TMDB" : "TVmaze";
    if (medium === "film") return TMDB_ON() ? "TMDB" : "Wikidata and iTunes";
    if (medium === "game") return IGDB_ON() ? "IGDB" : KEYS.rawg ? "RAWG" : "Wikidata";
    if (medium === "comic") return "Open Library";
    if (medium === "album") return "MusicBrainz";
    return "";
}
export async function searchMedium(medium: string, q: string, signal?: AbortSignal): Promise<Candidate[]> {
    switch (medium) {
        case "book": {
            let r = await olSearch(q, 12, signal);
            if (!r.length) r = await gbSearch(q, 8, signal);
            return r;
        }
        case "comic": {
            let r = await olSearch(q + " comic", 12, signal).catch((): Candidate[] => []);
            if (r.length < 3) r = r.concat(await gbSearch(q + " comic", 8, signal).catch((): Candidate[] => []));
            return r.map(c => ({ ...c, medium: "comic", kind: "Graphic novel" }));
        }
        case "anime":
        case "manga":
        case "manhwa":
        case "novel":
            return alSearch(q, medium, signal);
        case "tv":
            return TMDB_ON() ? tmdbSearch(q, "tv", signal) : tvmazeSearch(q, signal);
        case "film":
            return TMDB_ON() ? tmdbSearch(q, "film", signal) : filmSearchKeyless(q, signal);
        case "game":
            return IGDB_ON()
                ? igdbSearch(q, signal).catch(() => (KEYS.rawg ? rawgSearch(q, signal) : wdSearch(q, "game", signal)))
                : KEYS.rawg
                  ? rawgSearch(q, signal)
                  : wdSearch(q, "game", signal);
        case "album": // MusicBrainz (src/features/music)
            return searchAlbums(q, signal);
    }
    return [];
}
// fuller details for a picked search result
export async function candidateDetails(c: Candidate, signal?: AbortSignal): Promise<Candidate> {
    const e: ItemExt = c.ext || {};
    try {
        if (c.src === "anilist" && e.anilist != null) {
            const d = (await alDetails([e.anilist], signal)).get(e.anilist);
            return { ...c, ...(d || {}) };
        }
        if (c.src === "tmdb" && e.tmdb != null) {
            const d = await tmdbDetails(e.tmdb, textOf(e.tmdbType), signal);
            return { ...c, ...d, scores: { ...c.scores, ...d.scores } };
        }
        if (c.src === "tvmaze" && e.tvmaze != null) return { ...c, ...(await tvmazeShow(e.tvmaze, signal)) };
        if (c.src === "rawg" && e.rawg != null) return { ...c, ...(await rawgDetails(e.rawg, signal)) };
        if (c.src === "igdb" && e.igdb != null) return { ...c, ...(await igdbDetails(e.igdb, signal)) };
        if (c.src === "mb" && textOf(e.mbid)) return { ...c, ...(await albumDetails(textOf(e.mbid), signal)) };
        if (c.src === "ol") {
            const about = c.olKey ? await olDescription(c.olKey, signal) : "";
            return { ...c, about: c.about || about };
        }
    } catch (x) {
        if (aborted(x)) throw x;
    }
    return c;
}

// ── refresh an item's details and scores from every source it can reach ──
/** what a refresh learned: which catalogues answered, and whether one said to slow down */
export interface Refreshed {
    got?: string[];
    limited?: boolean;
}
/** what a catalogue found for an entry, as far as a refresh takes it */
type Found = Partial<Candidate> | null | undefined;
/** the fields a refresh fills in when the entry has none (or, for some, always takes the newer) */
const REFRESHED = [
    "year",
    "runtime",
    "total",
    "vols",
    "about",
    "genres",
    "themes",
    "creator",
    "kind",
    "airing",
    "airStatus",
    "rel",
    "watch",
    "platforms",
    "color",
    "season",
];
const blank = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);
export async function refreshItem(id: string, signal?: AbortSignal, { full = true } = {}): Promise<Refreshed> {
    const it = items.get(id);
    if (!it) return {};
    const ext: ItemExt = { ...(it.ext || {}) },
        p: Partial<Item> = {},
        scores = { ...(it.scores || {}) },
        got: string[] = [];
    // a catalogue that said "slow down" (the site's shared lookups, or a catalogue's own limit): the caller can wait and
    // ask again, instead of taking "nothing found" as the answer
    let limited = false;
    const setIf = (k: string, v: unknown) => {
        const was = it[k];
        if (
            !blank(v) &&
            (blank(was) ||
                k === "airing" ||
                k === "airStatus" ||
                k === "rel" ||
                (k === "total" && typeof v === "number" && v > (it.total || 0)) ||
                (k === "about" && /\bupcoming\b/i.test(it.about || "") && !/\bupcoming\b/i.test(String(v))))
        )
            p[k] = v;
    };
    const take = (f: Found, label: string) => {
        if (!f) return;
        got.push(label);
        for (const k of REFRESHED) setIf(k, f[k]);
        if ((f.boxart || f.cover) && !it.cover && !it.coverData) p.cover = f.boxart || f.cover;
        if (f.banner && !it.banner) p.banner = f.banner;
        if (f.alt) p.alt = { ...(it.alt || {}), ...Object.fromEntries(Object.entries(f.alt).filter(([, v]) => v)) };
        Object.assign(ext, Object.fromEntries(Object.entries(f.ext || {}).filter(([, v]) => v != null)));
        Object.assign(scores, Object.fromEntries(Object.entries(f.scores || {}).filter(([, v]) => v != null)));
    };
    const soft = async (fn: () => Promise<Found>, label: string) => {
        try {
            take(await fn(), label);
        } catch (e) {
            if (aborted(e)) throw e;
            if (sourceFlag(e, "rate")) limited = true;
            if (sourceFlag(e, "auth")) toast(label + " rejected the key. Check it in Settings.");
        }
    };
    const m = it.medium;
    if (["anime", "manga", "manhwa", "novel"].includes(m)) {
        if (!ext.anilist) {
            await soft(async () => {
                const R = await alSearch(cleanTitle(it.title), m, signal),
                    first = norm(cleanTitle(it.title)).split(" ")[0];
                const sc = (c: Candidate) =>
                    (norm(cleanTitle(c.title)).includes(first) ||
                    Object.values(c.alt || {}).some(t => norm(t || "").includes(first))
                        ? 1
                        : 0) +
                    (it.kind && c.kind === it.kind ? 0.5 : 0) +
                    (it.year && c.year && Math.abs(c.year - it.year) <= 1 ? 0.7 : 0) +
                    (norm(cleanTitle(c.title)) === norm(cleanTitle(it.title)) ? 0.5 : 0);
                const best = R.map((c): [Candidate, number] => [c, sc(c)])
                    .filter(x => x[1] >= 1)
                    .sort((a, b) => b[1] - a[1])[0];
                return best ? best[0] : null;
            }, "AniList");
            if (!ext.anilist && !ext.mal)
                await soft(async () => {
                    const first = norm(cleanTitle(it.title)).split(" ")[0],
                        R = await jikanSearch(cleanTitle(it.title), m === "anime" ? "anime" : "manga", signal);
                    const sc = (c: Candidate) =>
                        (Object.values({ t: c.title, ...c.alt }).some(t => norm(t || "").includes(first)) ? 1 : 0) +
                        (it.kind && c.kind === it.kind ? 0.5 : 0) +
                        (it.year && c.year && Math.abs(c.year - it.year) <= 1 ? 0.7 : 0);
                    const best = R.map((c): [Candidate, number] => [c, sc(c)])
                        .filter(x => x[1] >= 1)
                        .sort((a, b) => b[1] - a[1])[0];
                    return best ? best[0] : null;
                }, "MyAnimeList");
        }
        const alId = ext.anilist;
        if (alId && full) await soft(async () => (await alDetails([alId], signal)).get(alId), "AniList");
        const malId = ext.mal;
        if (malId)
            await soft(
                async () => ({ scores: await jikanScore(m === "anime" ? "anime" : "manga", malId, signal) }),
                "MyAnimeList"
            );
    } else if (m === "tv" || m === "film") {
        const type = m === "film" ? "movie" : "tv";
        if (TMDB_ON()) {
            if (!ext.tmdb) {
                await soft(async () => {
                    const r = (await tmdbSearch(cleanTitle(it.title), m, signal)).find(
                        c => !it.year || !c.year || Math.abs(c.year - it.year) <= 1
                    );
                    return r ? { ext: r.ext } : null;
                }, "TMDB");
            }
            const tmdbId = ext.tmdb;
            if (tmdbId) await soft(() => tmdbDetails(tmdbId, ext.tmdbType || type, signal), "TMDB");
        }
        if (m === "tv") {
            await soft(async () => {
                if (ext.tvmaze) return tvmazeShow(ext.tvmaze, signal);
                if (ext.imdb) {
                    const s = await tvmazeByImdb(ext.imdb, signal).catch(() => null);
                    if (s) return s;
                }
                const r = pickShow(await tvmazeSearch(cleanTitle(it.title), signal), it),
                    tid = r && r.ext.tvmaze;
                return tid ? tvmazeShow(tid, signal) : null;
            }, "TVmaze");
        }
        if (m === "film" || !ext.imdb) {
            await soft(async () => {
                const q = ext.wikidata || (await wdFind(it.title, m, it.year, signal));
                if (!q) return null;
                const d = (await wdDetails([q], signal, m)).get(q);
                if (d && m === "film" && it.creatorFix) p.creator = d.creator;
                return d;
            }, "Wikidata");
        }
        const imdb = ext.imdb;
        if (imdb && KEYS.omdb) await soft(async () => ({ scores: await omdbScores(imdb, signal) }), "OMDb");
    } else if (m === "game") {
        if (IGDB_ON()) {
            await soft(async () => {
                const gid = await igdbFind(it, signal);
                return gid ? (await igdbDetails(gid, signal)) || {} : null;
            }, "IGDB");
        }
        if (KEYS.rawg) {
            if (!ext.rawg)
                await soft(async () => {
                    const r = rawgPick(await rawgSearch(cleanTitle(it.title), signal), it);
                    return r ? { ext: r.ext } : null;
                }, "RAWG");
            const rawgId = ext.rawg;
            if (rawgId) await soft(() => rawgDetails(rawgId, signal), "RAWG");
        }
        await soft(async () => {
            const q = ext.wikidata || (await wdFind(it.title, "game", it.year, signal));
            return q ? (await wdDetails([q], signal, "game")).get(q) : null;
        }, "Wikidata");
    } else if (m === "album") {
        await soft(async () => {
            let mbid = textOf(ext.mbid);
            if (!mbid) {
                const hit = (await searchAlbums(`${cleanTitle(it.title)} ${it.creator || ""}`, signal))[0];
                mbid = (hit && hit.ext.mbid) || "";
            }
            return mbid ? { ...(await albumDetails(mbid, signal)), ext: { mbid } } : null;
        }, "MusicBrainz");
    } else if (m === "book" || m === "comic") {
        const key = ext.olKey || textOf(it.olKey);
        if (key)
            await soft(async () => ({ scores: await olRatings(key, signal), ext: { olKey: key } }), "Open Library");
        if (key && !it.dims && full)
            await soft(async () => {
                const d = await olDims(key, signal);
                if (d) p.dims = d;
                return null;
            }, "Open Library");
        if (!key || !(it.genres || []).length)
            await soft(async () => {
                const r = bestMatch(it, await findCandidates(it.title, it.creator, signal));
                return r
                    ? {
                          ext: r.ext || {},
                          scores: r.scores,
                          year: r.year,
                          total: r.total,
                          genres: it.kind === "Academic" && it.subject ? [it.subject] : r.genres,
                      }
                    : null;
            }, "Open Library");
    }
    p.ext = ext;
    p.scores = scores;
    p.scoresAt = nowISO();
    {
        const sp = splitGenres({ ...it, ...items.get(id), ...p });
        if (sp) Object.assign(p, sp);
    }
    quietPatch(id, p);
    return { got, limited };
}
/** a picture a catalogue has for an entry */
export interface ArtChoice {
    cover: string;
    label: string;
    wide: boolean;
}
// every picture we can find for an item (covers, posters, banners, screenshots)
export async function allArt(
    it: Item,
    signal?: AbortSignal,
    progress?: (label: string) => void
): Promise<{ covers: ArtChoice[]; meta?: Candidate | null }> {
    // meta: the book's best match, for its details
    const out: ArtChoice[] = [],
        seen = new Set<string>(),
        add = (cover: string | undefined, label: string, wide?: boolean) => {
            if (cover && !seen.has(cover)) {
                seen.add(cover);
                out.push({ cover, label, wide: !!wide });
            }
        };
    const e: ItemExt = it.ext || {};
    if (it.medium === "book" || it.medium === "comic") {
        const r = await allBookCovers(it, signal, progress);
        for (const c of r.covers) add(c.cover, c.label);
        return { covers: out, meta: r.meta };
    }
    if (it.cover) add(it.cover, "Current");
    if (it.banner) add(it.banner, "Banner", true);
    const alId = e.anilist;
    if (alId) {
        try {
            const d = (await alDetails([alId], signal)).get(alId);
            if (d) {
                add(d.cover, "AniList cover");
                add(d.banner, "AniList banner", true);
            }
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    if (e.mal) {
        try {
            for (const u of await jikanPictures(it.medium === "anime" ? "anime" : "manga", e.mal, signal))
                add(u, "MyAnimeList");
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    if (e.tvmaze) {
        try {
            for (const c of await tvmazeImages(e.tvmaze, signal)) add(c.cover, c.label, c.wide);
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    if (e.tmdb && TMDB_ON()) {
        try {
            for (const c of await tmdbImages(e.tmdb, e.tmdbType || (it.medium === "film" ? "movie" : "tv"), signal))
                add(c.cover, c.label, c.wide);
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    if (e.igdb && IGDB_ON()) {
        try {
            for (const c of await igdbImages(e.igdb, signal)) add(c.cover, c.label, c.wide);
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    const steam = textOf(e.steam);
    if (steam) {
        add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steam}/library_600x900_2x.jpg`, "Steam cover");
        add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steam}/library_hero.jpg`, "Steam banner", true);
    }
    if (e.rawg && KEYS.rawg) {
        try {
            for (const c of await rawgImages(e.rawg, signal)) add(c.cover, c.label, c.wide);
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    const wiki = textOf(e.wiki);
    if (wiki) {
        try {
            const w = (await wikiPages([wiki], signal)).get(wiki);
            if (w && w.image) add(w.image, "Wikipedia");
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    if (it.medium === "game") {
        for (const c of recordsOf(it.lbArt)) add(textOf(c.cover), textOf(c.label), !!c.wide);
        progress && progress("Asking your proxy for boxes and covers…");
        for (const f of [tgdbBoxes, ssMedia, sgdbCovers])
            try {
                for (const c of await f(it, signal))
                    add(c.cover, c.label, c.kind === "box-2D-side" || c.kind === "box-3D");
            } catch (x) {
                if (aborted(x)) throw x;
            }
        try {
            const u = await wikiBoxArt(it, signal);
            if (u) add(u, "Box art (Wikipedia)");
        } catch (x) {
            if (aborted(x)) throw x;
        }
        try {
            const u = await appStoreIcon(it, signal);
            if (u) add(u, "App Store icon");
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    if (["manga", "manhwa", "novel"].includes(it.medium)) {
        try {
            const V = await volumeCovers(it, signal);
            for (const [v, u] of Object.entries(V).slice(0, 40)) add(u, "Volume " + v);
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    // the current picture goes last when it's only a screenshot
    if (it.medium === "game" && isShot(it.cover)) {
        const i = out.findIndex(c => c.cover === it.cover);
        if (i >= 0) {
            const [c] = out.splice(i, 1);
            out.push({ ...c, label: "Screenshot (current)", wide: true });
        }
    }
    return { covers: out };
}
/** whether a key works: "ok", "bad" (refused) or "offline" (couldn't ask) */
export async function testKey(which: string): Promise<string> {
    try {
        if (which === "tmdb") await tmdb("/configuration", {}, undefined);
        if (which === "omdb") {
            const j = await getJSON(
                "https://www.omdbapi.com/?" + new URLSearchParams({ i: "tt0111161", apikey: KEYS.omdb })
            );
            if (at(j, "Response") === "False") throw new Error(textOf(at(j, "Error")) || "rejected");
        }
        if (which === "rawg") await rawg("/games", { page_size: "1" });
        if (which === "igdb") {
            const r = await igdbQ("games", "fields name; limit 1;");
            if (!Array.isArray(r)) throw new Error("rejected");
        }
        return "ok";
    } catch (e) {
        return sourceFlag(e, "auth") || /invalid|rejected|401/i.test(errMessage(e)) ? "bad" : "offline";
    }
}
/** where else an entry is: [site, address]. Links out to sites that have no API (scores you can check or type in
 * yourself) */
export function linksOut(it: Partial<Item> & { title: string }): [site: string, url: string][] {
    const t = cleanTitle(it.title),
        e: ItemExt = it.ext || {},
        enc = encodeURIComponent,
        olKey = textOf(e.olKey) || textOf(it.olKey),
        wiki = textOf(e.wiki),
        archive = textOf(e.archive);
    const L: [string, string][] = [];
    if (e.anilist) L.push(["AniList", `https://anilist.co/${it.medium === "anime" ? "anime" : "manga"}/${e.anilist}`]);
    if (e.mal) L.push(["MyAnimeList", `https://myanimelist.net/${it.medium === "anime" ? "anime" : "manga"}/${e.mal}`]);
    if (e.imdb) L.push(["IMDb", `https://www.imdb.com/title/${e.imdb}/`]);
    if (e.tmdb)
        L.push([
            "TMDB",
            `https://www.themoviedb.org/${e.tmdbType || (it.medium === "film" ? "movie" : "tv")}/${e.tmdb}`,
        ]);
    if (e.tvmaze) L.push(["TVmaze", `https://www.tvmaze.com/shows/${e.tvmaze}`]);
    if (e.rawg) L.push(["RAWG", `https://rawg.io/games/${textOf(e.rawgSlug) || e.rawg}`]);
    if (olKey) L.push(["Open Library", `https://openlibrary.org${olKey}`]);
    if (wiki) L.push(["Wikipedia", `https://en.wikipedia.org/wiki/${enc(wiki.replace(/ /g, "_"))}`]);
    if (it.medium === "film" || it.medium === "tv") {
        if (it.medium === "film")
            L.push([
                "Letterboxd",
                e.imdb ? `https://letterboxd.com/imdb/${e.imdb}/` : `https://letterboxd.com/search/${enc(t)}/`,
            ]);
        L.push(
            ["Rotten Tomatoes", `https://www.rottentomatoes.com/search?search=${enc(t)}`],
            ["Metacritic", `https://www.metacritic.com/search/${enc(t)}/`]
        );
        if (/drama/i.test(it.kind || "") || it.lang === "ko")
            L.push(["MyDramaList", `https://mydramalist.com/search?q=${enc(t)}`]);
    }
    if (it.medium === "book" || it.medium === "comic")
        L.push(
            ["Goodreads", `https://www.goodreads.com/search?q=${enc(t + " " + firstAuthor(it.creator))}`],
            ["StoryGraph", `https://app.thestorygraph.com/browse?search_term=${enc(t)}`]
        );
    const medium = it.medium || "";
    if (["manga", "manhwa", "novel"].includes(medium))
        L.push(["MangaUpdates", `https://www.mangaupdates.com/series?search=${enc(t)}`]);
    if (it.medium === "novel") L.push(["NovelUpdates", `https://www.novelupdates.com/?s=${enc(t)}`]);
    if (it.medium === "game" && /Browser|Mobile/.test(it.kind || ""))
        L.push(
            ["Y8", `https://www.y8.com/search?q=${enc(t)}`],
            [
                "Internet Archive",
                archive
                    ? `https://archive.org/details/${enc(archive)}`
                    : `https://archive.org/search?query=${enc(t)}&and%5B%5D=mediatype%3A%22software%22`,
            ]
        );
    if (it.medium === "game")
        L.push(
            ["Backloggd", `https://backloggd.com/search/games/${enc(t)}`],
            ["HowLongToBeat", `https://howlongtobeat.com/?q=${enc(t)}`],
            ["Metacritic", `https://www.metacritic.com/search/${enc(t)}/`]
        );
    if (["anime", "manga", "manhwa", "novel"].includes(medium))
        L.push([
            "Anime-Planet",
            `https://www.anime-planet.com/${it.medium === "anime" ? "anime" : "manga"}/all?name=${enc(t)}`,
        ]);
    if (it.medium === "tv" || (it.medium === "anime" && it.kind !== "Movie"))
        L.push(["Serializd", `https://duckduckgo.com/?q=${enc("site:serializd.com " + t)}`]);
    if (["tv", "film"].includes(medium) && !L.some(x => x[0] === "MyDramaList"))
        L.push(["MyDramaList", `https://mydramalist.com/search?q=${enc(t)}`]);
    L.push(["Fandom wiki", `https://community.fandom.com/wiki/Special:Search?query=${enc(t)}&scope=cross-wiki`]);
    if (it.medium === "anime" || it.medium === "tv") L.push(["Reddit", `https://www.reddit.com/search/?q=${enc(t)}`]);
    return L;
}

// ── AniList: the seasonal chart (Culture only) ──
export const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
export function seasonNow(d = new Date()): { season: string; year: number } {
    const m = d.getMonth();
    return { season: SEASONS[Math.floor(((m + 1) % 12) / 3)], year: m === 11 ? d.getFullYear() + 1 : d.getFullYear() };
}
export async function alSeason(season: string, year: number, signal?: AbortSignal): Promise<Candidate[]> {
    const out: Candidate[] = [];
    for (let page = 1; page <= 4; page++) {
        const d = await AL.q(
            `query($s:MediaSeason,$y:Int,$p:Int){ Page(page:$p, perPage: 50){ pageInfo { hasNextPage } media(season:$s, seasonYear:$y, type: ANIME, isAdult: false, sort:[POPULARITY_DESC]){ ${AL_MEDIA} } } }`,
            { s: season, y: year, p: page },
            signal
        );
        out.push(...recordsOf(at(d, "Page", "media")).map(m => ({ src: "anilist", ...alToFields(m) })));
        if (!at(d, "Page", "pageInfo", "hasNextPage")) break;
    }
    return out;
}
/** an anime's episodes and where AniList says they stream */
export async function alEpisodes(
    alId: number,
    signal?: AbortSignal
): Promise<{
    total: number | null;
    runtime: number | null;
    eps: { title: string; thumbnail: string; url: string; site: string }[];
    links: { site: string; url: string }[];
}> {
    const d = await AL.q(
        `query($id:Int){ Media(id:$id){ episodes duration nextAiringEpisode { episode } streamingEpisodes { title thumbnail url site } externalLinks { site url type } } }`,
        { id: alId },
        signal,
        0,
        true
    );
    const media = at(d, "Media");
    if (!isRecord(media)) throw new Error("none");
    const next = numOf(at(media, "nextAiringEpisode", "episode"));
    // a show still airing has no final count: everything up to the next episode is out
    return {
        total: numOf(media.episodes) || (next ? next - 1 : null),
        runtime: numOf(media.duration) ?? null,
        eps: recordsOf(media.streamingEpisodes).map(e => ({
            title: textOf(e.title),
            thumbnail: textOf(e.thumbnail),
            url: textOf(e.url),
            site: textOf(e.site),
        })),
        links: recordsOf(media.externalLinks)
            .filter(l => l.type === "STREAMING")
            .map(l => ({ site: textOf(l.site), url: textOf(l.url) })),
    };
}
/** one voice actor playing several characters ("Homer Simpson / Grampa / Krusty (voice)"): each becomes its own
 * character, with the same actor */
export function castSplit<T extends CastMember>(L: T[]): T[] {
    const out: T[] = [],
        seen = new Set<string>();
    for (const c of L) {
        const names = String(c.name || "")
            .replace(/\s*\((?:[^)]*voice[^)]*|uncredited|archive footage|singing)\)/gi, "")
            .split(/\s+\/\s+|\s*;\s*|\s+and\s+(?=[A-Z])/)
            .map(x => x.trim())
            .filter(x => x && !/^(himself|herself|themselves|self|additional voices?|various)$/i.test(x));
        (names.length ? names : [""]).forEach((n, i) => {
            const k = norm(n) + "|" + c.va;
            if (seen.has(k)) return;
            seen.add(k);
            out.push({ ...c, name: n, image: i && names.length > 1 ? "" : c.image });
        });
    }
    return out.slice(0, 30);
}
// ── TVmaze: seasons and episodes, no key ──
/** a show's episodes on TVmaze */
export async function tvmazeEpisodes(id: number | string, signal?: AbortSignal): Promise<Episode[]> {
    const eps = await getJSON(`https://api.tvmaze.com/shows/${id}/episodes`, signal);
    return recordsOf(eps).map(e => ({
        s: numOf(e.season) ?? 0,
        e: numOf(e.number) ?? 0,
        title: textOf(e.name),
        date: textOf(e.airdate),
        runtime: numOf(e.runtime) ?? null,
        image: textOf(at(e, "image", "medium")) || textOf(at(e, "image", "original")),
        about: stripMd(textOf(e.summary)).slice(0, 300),
    }));
}

// ── Wikidata: cast (actor → character), characters and voice actors, for films, shows, games and books ──
const commonsImg = (u: string) =>
    u ? u.replace(/^http:/, "https:") + (u.includes("?") ? "&" : "?") + "width=300" : "";
/** someone on a Wikidata cast list, with what it's sorted by: billing (ord), fame (sl: how many Wikipedias have them),
 * and whether they're linked to the title itself (direct) or only to its series */
type WdCastMember = CastMember & {
    cid: string;
    pid?: string;
    sl: number;
    csl?: number;
    ord?: number;
    art?: string;
    direct?: boolean;
};
/** a Wikipedia article's title, from its address */
const articleTitle = (u: string): string => {
    try {
        return decodeURIComponent(u.split("/wiki/").pop() || "").replace(/_/g, " ");
    } catch (_) {
        return "";
    }
};
// cast and characters from Wikidata, in small quick questions rather than one slow one:
// 1) the billed and voice cast, 2) the characters linked to it (both ways), 3) for games with few, the characters of its series,
// then 4) pictures and voice actors for the characters that made the list (Wikipedia pictures where Wikidata has none).
// Biggest names first, the way a cast list is billed.
export async function wdCast(qid: string, signal?: AbortSignal, medium?: string): Promise<CastMember[]> {
    const ask = (body: string, ms = 15000): Promise<Record<string, unknown>[] | null> =>
        getJSON(
            "https://query.wikidata.org/sparql?" +
                new URLSearchParams({
                    format: "json",
                    query: body + ` SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`,
                }),
            signal,
            { timeout: ms }
        )
            .then(sparqlRows)
            .catch(e => {
                if (signal && signal.aborted) throw e;
                return null;
            });
    const id = (r: Record<string, unknown>, k: string) => qidOf(sv(r, k));
    const [castRows, charRows] = await Promise.all([
        ask(
            `SELECT ?kind ?c ?cLabel ?p ?pLabel ?ord WHERE { { wd:${qid} p:P161 ?st . ?st ps:P161 ?p . OPTIONAL { ?st pq:P453 ?c } OPTIONAL { ?st pq:P1545 ?ord } BIND("cast" AS ?kind) } UNION { wd:${qid} p:P725 ?st . ?st ps:P725 ?p . OPTIONAL { ?st pq:P453 ?c } BIND("voice" AS ?kind) }`
        ),
        ask(
            `SELECT DISTINCT ?c ?cLabel WHERE { { wd:${qid} wdt:P674 ?c } UNION { ?c wdt:P1441 wd:${qid} } UNION { ?c wdt:P8345 wd:${qid} }`
        ),
    ]);
    if (castRows === null && charRows === null) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const chars = (charRows || [])
        .map(r => ({ cid: id(r, "c"), name: svName(r, "cLabel"), direct: true }))
        .filter(c => c.name);
    if (medium === "game" && chars.length < 6) {
        const more = await ask(
            `SELECT DISTINCT ?c ?cLabel WHERE { wd:${qid} wdt:P179|wdt:P8345 ?ser . { ?c wdt:P1441 ?ser } UNION { ?ser wdt:P674 ?c } UNION { ?c wdt:P8345 ?ser } } LIMIT 150`,
            12000
        );
        for (const r of more || []) {
            const c = { cid: id(r, "c"), name: svName(r, "cLabel"), direct: false };
            if (c.name && !chars.some(x => x.cid === c.cid)) chars.push(c);
        }
    }
    const cast = new Map<string, WdCastMember>();
    for (const r of castRows || []) {
        const pid = id(r, "p"),
            person = svName(r, "pLabel");
        if (!person) continue;
        const cid = id(r, "c"),
            k = pid + "|" + cid;
        if (cast.has(k)) continue;
        cast.set(k, {
            src: "wikidata",
            pid,
            cid,
            name: svName(r, "cLabel"),
            va: person,
            role: sv(r, "kind") === "voice" ? "Voice" : "Cast",
            ord: +(sv(r, "ord") || 999) || 999,
            sl: 0,
        });
    }
    // pictures, fame and voice actors for everyone on the list, in one go
    const ids = [
        ...new Set(
            [...[...cast.values()].flatMap(c => [c.pid || "", c.cid]), ...chars.map(c => c.cid)].filter(Boolean)
        ),
    ].slice(0, 220);
    const info = new Map<string, { img?: string; sl?: number; art?: string; va?: string }>();
    if (ids.length) {
        const rows = await ask(
            `SELECT ?x ?img ?sl ?art ?va ?vaLabel WHERE { VALUES ?x { ${ids.map(i => "wd:" + i).join(" ")} } OPTIONAL { ?x wdt:P18 ?img } OPTIONAL { ?x wikibase:sitelinks ?sl } OPTIONAL { ?art schema:about ?x ; schema:isPartOf <https://en.wikipedia.org/> } OPTIONAL { ?x wdt:P725 ?va }`,
            15000
        );
        for (const r of rows || []) {
            const x = id(r, "x"),
                e = info.get(x) || {};
            if (!e.img && sv(r, "img")) e.img = commonsImg(sv(r, "img"));
            if (e.sl == null) e.sl = +(sv(r, "sl") || 0) || 0;
            if (!e.art && sv(r, "art")) e.art = sv(r, "art");
            if (!e.va && svName(r, "vaLabel")) e.va = svName(r, "vaLabel");
            info.set(x, e);
        }
    }
    const I = (x: string | undefined) => (x && info.get(x)) || {};
    for (const c of cast.values()) {
        c.vaImage = I(c.pid).img || "";
        c.image = I(c.cid).img || "";
        c.sl = I(c.pid).sl || 0;
        c.art = I(c.cid).art;
    }
    const inCast = new Set([...cast.values()].map(c => c.cid).filter(Boolean));
    const named: WdCastMember[] = chars
        .filter(c => !inCast.has(c.cid))
        .map(c => ({
            src: "wikidata",
            cid: c.cid,
            name: c.name,
            image: I(c.cid).img || "",
            va: I(c.cid).va || "",
            role: "Character",
            sl: I(c.cid).sl || 0,
            direct: c.direct,
            art: I(c.cid).art,
        }))
        .sort((a, b) => (b.direct ? 1 : 0) - (a.direct ? 1 : 0) || b.sl - a.sl);
    const billed: WdCastMember[] = [...cast.values()]
        .map(c => ({ ...c, csl: I(c.cid).sl }))
        .sort((a, b) => (a.ord ?? 999) - (b.ord ?? 999) || b.sl - a.sl);
    const out =
            medium === "game"
                ? [...billed, ...named].sort(
                      (a, b) =>
                          (b.direct === false ? 0 : 1) - (a.direct === false ? 0 : 1) ||
                          (b.csl ?? b.sl) - (a.csl ?? a.sl)
                  )
                : [...billed, ...named],
        seen = new Set<string>();
    const list = out
        .filter(c => {
            const k = norm(c.name + "|" + c.va);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .slice(0, 48);
    // characters rarely have a free picture on Wikidata; their Wikipedia article usually has one
    const need = list.filter(c => c.name && !c.image && c.art).map(c => articleTitle(c.art || ""));
    if (need.length) {
        try {
            const W = await wikiPages([...new Set(need)].filter(Boolean).slice(0, 40), signal);
            for (const c of list)
                if (!c.image && c.art) {
                    const w = W.get(articleTitle(c.art));
                    if (w && w.image) c.image = w.image;
                }
        } catch (_) {}
    }
    return list;
}
