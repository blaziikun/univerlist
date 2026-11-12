// src/features/core/types.ts
// ─────────────────────────────────────────────────────────────────
//  Types: what each kind is called and which kinds count as one (ONA and OVA sit with anime series by default)
// ─────────────────────────────────────────────────────────────────

import {
    BOOK_GENRES,
    change,
    clone,
    fmtScore,
    items,
    KINDS,
    listOf,
    markDirty,
    MEDIA,
    MEDIA_KEYS,
    meta,
    modeById,
    norm,
    scaleOf,
    statusWord,
    titleOf,
    toast,
    ui,
    undo,
} from "./core";
import { crowd, endedAt, modeItems, pct } from "./views";
import { renderMain } from "./shell";
import { kindToggles } from "../settings/settings";
import type { Entry, Filter, Item, Mode, Rule } from "./model";

// by medium: a kind shown as another, and a kind's own name
type KindMap = Record<string, Record<string, string>>;
const KIND_MERGE_DEFAULT: KindMap = { anime: { ONA: "TV", OVA: "TV" } };
const KIND_LABEL_DEFAULT: KindMap = { anime: { TV: "Anime" } };
const kindMerge = (): KindMap => meta.settings.kindMerge || KIND_MERGE_DEFAULT;
const kindLabels = (): KindMap => meta.settings.kindLabel || KIND_LABEL_DEFAULT;
// the kind an item is shown and grouped as (after merging); its stored kind never changes
export function kindOf(b: { medium: string; kind?: string }): string {
    const k = b.kind || "";
    return (kindMerge()[b.medium] || {})[k] || k;
}
function kindName(medium: string, k: string): string {
    return (kindLabels()[medium] || {})[k] || k || (MEDIA[medium] || {}).name || "";
}
export const kindShown = (b: { medium: string; kind?: string }) => kindName(b.medium, kindOf(b));
// the kinds of each medium: the usual ones, plus any your library has picked up (like genres, they grow with what you add)
export function libKinds(m: string): string[] {
    const seen = new Set(KINDS[m] || []);
    for (const b of items.values()) if (b.medium === m && b.kind && (!b.private || ui.private)) seen.add(b.kind);
    return [...seen];
}
/** each type's name and what it's shown as (settings/parts/KindTypes.svelte): for a mode, the media it shows; for
 *  Settings › Library, the media in your library (or all of them). Only media with more than one type. */
export function typesView(mode?: Mode) {
    const M = kindMerge(),
        L = kindLabels(),
        used = new Set([...items.values()].map(b => b.medium)),
        media = mode ? MEDIA_KEYS.filter(k => kindToggles(mode.match || ["*"], k).some(x => x[1])) : null;
    const show = MEDIA_KEYS.filter(
        m => libKinds(m).length > 1 && (media ? media.includes(m) : ui.typesAll || used.has(m))
    );
    return show.map(m => {
        const K = libKinds(m);
        return {
            m,
            name: MEDIA[m].name,
            kinds: K.map(k => {
                const into = (M[m] || {})[k] || "";
                return {
                    k,
                    into,
                    label: (L[m] || {})[k] || "",
                    // its own, or shown as one of the others that isn't itself folded into another
                    opts: [
                        ["", "its own"],
                        ...K.filter(x => x !== k && !(M[m] || {})[x]).map(x => [x, "→ " + ((L[m] || {})[x] || x)]),
                    ] as [string, string][],
                };
            }),
        };
    });
}
/** a type shown as another (into), or as its own again ("") */
export function kindMergeSet(m: string, k: string, into: string) {
    const M = clone(kindMerge());
    M[m] = { ...(M[m] || {}) };
    if (into) M[m][k] = into;
    else delete M[m][k];
    meta.settings.kindMerge = M;
    markDirty();
    renderMain();
}
/** what a type is called (its own name again when it's left empty or set to that) */
export function kindLabelSet(m: string, k: string, typed: string) {
    const L = clone(kindLabels());
    L[m] = { ...(L[m] || {}) };
    const v = typed.trim();
    if (v && v !== k) L[m][k] = v;
    else delete L[m][k];
    meta.settings.kindLabel = L;
    markDirty();
    renderMain();
}

// ═══════════════════════════════════════════
//  GENRES: ONLY THE OFFICIAL LIST FOR EACH KIND OF THING; EVERYTHING ELSE A SOURCE CALLS A GENRE IS A THEME
// ═══════════════════════════════════════════
const GENRES_OFFICIAL: Record<string, string[]> = {
    // AniList's genre list (its tags are themes)
    culture: [
        "Action",
        "Adventure",
        "Comedy",
        "Drama",
        "Ecchi",
        "Fantasy",
        "Hentai",
        "Horror",
        "Mahou Shoujo",
        "Mecha",
        "Music",
        "Mystery",
        "Psychological",
        "Romance",
        "Sci-Fi",
        "Slice of Life",
        "Sports",
        "Supernatural",
        "Thriller",
    ],
    // TMDB's film and TV genres
    screen: [
        "Action",
        "Adventure",
        "Animation",
        "Comedy",
        "Crime",
        "Documentary",
        "Drama",
        "Family",
        "Fantasy",
        "History",
        "Horror",
        "Music",
        "Mystery",
        "Romance",
        "Science Fiction",
        "Thriller",
        "War",
        "Western",
        "Action & Adventure",
        "Kids",
        "News",
        "Reality",
        "Sci-Fi & Fantasy",
        "Soap",
        "Talk",
        "War & Politics",
        "TV Movie",
    ],
    // IGDB's game genres
    games: [
        "Adventure",
        "Arcade",
        "Card & Board Game",
        "Fighting",
        "Hack and slash/Beat 'em up",
        "Indie",
        "MOBA",
        "Music",
        "Pinball",
        "Platform",
        "Point-and-click",
        "Puzzle",
        "Quiz/Trivia",
        "Racing",
        "Real Time Strategy (RTS)",
        "Role-playing (RPG)",
        "Shooter",
        "Simulator",
        "Sport",
        "Strategy",
        "Tactical",
        "Turn-based strategy (TBS)",
        "Visual Novel",
        "Action",
        "Casual",
        "Family",
        "Massively Multiplayer",
        "Sports",
        "Educational",
        "Board Games",
        "Card",
    ],
};
const genreFamily = (b: Item) =>
    ["anime", "manga", "manhwa", "novel"].includes(b.medium)
        ? "culture"
        : ["film", "tv"].includes(b.medium)
          ? "screen"
          : b.medium === "game"
            ? "games"
            : "books";
const gnorm = (g: string) => norm(String(g).replace(/\s*\(.*\)$/, ""));
// official name by its normalised form, so "drama", "Drama" and "Science-Fiction" all land on one spelling
let genMaps: Record<string, Map<string, string>> | null = null; // worked out the first time it's needed
function genreMaps(): Record<string, Map<string, string>> {
    if (genMaps) return genMaps;
    const lists: [string, string[]][] = [
        ...Object.entries(GENRES_OFFICIAL),
        ["books", [...BOOK_GENRES.map(([n]) => n), "Fiction", "Non-fiction", "Textbook", "Reference"]],
    ];
    const maps: Record<string, Map<string, string>> = Object.fromEntries(
        lists.map(([k, L]) => [k, new Map(L.map(g => [gnorm(g), g]))])
    );
    maps.screen.set("science fiction", "Science Fiction");
    maps.screen.set("sci fi", "Science Fiction");
    maps.culture.set("science fiction", "Sci-Fi");
    genMaps = maps;
    return maps;
}
const officialName = (b: Item, g: string) => genreMaps()[genreFamily(b)].get(gnorm(g)) || null;
function officialGenre(b: Item, g: string) {
    return !!officialName(b, g);
}
// split an item's genres into official genres and themes; run once over the library, and on everything new
export function splitGenres(b: Item): { genres: string[]; themes: string[] } | null {
    const G = b.genres || [];
    if (!G.length) return null;
    const keep = [...new Set(G.map(g => officialName(b, g)).filter((g): g is string => !!g))],
        move = G.filter(g => !officialGenre(b, g));
    if (!move.length && keep.length === G.length && keep.every((g, i) => g === G[i])) return null;
    return { genres: keep, themes: [...new Set([...(b.themes || []), ...move])] };
}

// ═══════════════════════════════════════════
//  WHICH MODE A THING LIVES IN: THE MODE'S RULES, UNLESS YOU MOVED IT
// ═══════════════════════════════════════════
// b.modeHome = a mode id: it shows in that mode (and Hub) instead of wherever its type would put it
export function moveToMode(ids: string | string[], mid: string) {
    const L = (Array.isArray(ids) ? ids : [ids]).filter(id => items.has(id));
    const first = items.get(L[0]);
    if (!first) return;
    change(
        L.length === 1
            ? `Move ${titleOf(first)} to ${modeById(mid).name}`
            : `Move ${L.length} to ${modeById(mid).name}`,
        L,
        x => (x ? { ...x, modeHome: mid === "auto" ? undefined : mid } : undefined)
    );
    toast(mid === "auto" ? "Back where its type puts it" : `Now in ${modeById(mid).name}`, { label: "Undo", fn: undo });
}

// ═══════════════════════════════════════════
//  ADVANCED FILTER: RULES YOU BUILD (FIELD, TEST, VALUE), ALL OR ANY
// ═══════════════════════════════════════════
// each field a rule can test: its key, its name, what kind of value it is, and how to read it from an entry
export const RULE_FIELDS: [key: string, label: string, type: string, get: (b: Entry) => unknown][] = [
    ["title", "Title", "text", b => [titleOf(b), b.title, (b.alt || {}).romaji, (b.alt || {}).native].join(" ")],
    ["creator", "Creator", "text", b => b.creator],
    ["genre", "Genre", "list", b => b.genres],
    ["theme", "Theme", "list", b => b.themes],
    ["tag", "Your tag", "list", b => b.tags],
    ["kind", "Type", "set", b => kindShown(b)],
    ["medium", "Medium", "set", b => MEDIA[b.medium].name],
    ["status", "Status", "set", b => statusWord(b.status, b.medium)],
    ["score", "Your score", "num", b => (b.rating ? fmtScore(b.rating, scaleOf(b)) : null)],
    ["crowd", "Crowd score", "num", b => crowd(b).avg],
    ["year", "Release year", "num", b => b.year],
    ["length", "Length (episodes, chapters, pages, hours)", "num", b => b.total],
    ["progress", "Progress %", "num", b => (b.total ? pct(b) : null)],
    ["added", "Added", "date", b => b.addedAt],
    ["ended", "Finished", "date", b => endedAt(b)],
    ["fav", "Favourite", "bool", b => !!b.fav],
    ["notes", "Notes", "text", b => b.notes],
];
export const RULE_OPS: Record<string, [string, string][]> = {
    text: [
        ["has", "contains"],
        ["not", "doesn't contain"],
    ],
    list: [
        ["has", "has"],
        ["not", "doesn't have"],
    ],
    set: [
        ["is", "is"],
        ["isnt", "isn't"],
    ],
    num: [
        ["ge", "at least"],
        ["le", "at most"],
        ["eq", "exactly"],
    ],
    date: [
        ["after", "after"],
        ["before", "before"],
    ],
    bool: [
        ["yes", "yes"],
        ["no", "no"],
    ],
};
function ruleOk(b: Entry, r: Rule) {
    const F = RULE_FIELDS.find(x => x[0] === r.f);
    if (!F) return true;
    const [, , type, get] = F,
        v = get(b);
    if (type === "bool") return r.op === "no" ? !v : !!v;
    if (r.v === "" || r.v == null) return true;
    if (type === "text") {
        const hit = norm(v).includes(norm(r.v));
        return r.op === "not" ? !hit : hit;
    }
    if (type === "list") {
        const hit = listOf(v).some(x => norm(x) === norm(r.v));
        return r.op === "not" ? !hit : hit;
    }
    if (type === "set") {
        const hit = norm(v) === norm(r.v);
        return r.op === "isnt" ? !hit : hit;
    }
    if (type === "num") {
        const n = parseFloat(String(v)),
            w = parseFloat(r.v);
        if (!Number.isFinite(n)) return false;
        return r.op === "le" ? n <= w : r.op === "eq" ? Math.abs(n - w) < 1e-9 : n >= w;
    }
    if (type === "date") {
        if (!v) return false;
        return r.op === "before" ? String(v) < r.v : String(v) >= r.v;
    }
    return true;
}
export const rulesOk = (b: Entry, f: Partial<Filter>) => {
    const R = (f.rules || []).filter(r => r.f);
    return !R.length || (f.any ? R.some(r => ruleOk(b, r)) : R.every(r => ruleOk(b, r)));
};
/** the values a rule on this field is offered as you type (the library's commonest first) */
export function ruleValues(fid: string): unknown[] {
    const F = RULE_FIELDS.find(x => x[0] === fid);
    if (!F || !["list", "set"].includes(F[2])) return [];
    const c = new Map<unknown, number>();
    for (const b of modeItems()) {
        const got = F[3](b) || [];
        for (const v of Array.isArray(got) ? got : [got]) if (v) c.set(v, (c.get(v) || 0) + 1);
    }
    return [...c.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 200)
        .map(x => x[0]);
}
