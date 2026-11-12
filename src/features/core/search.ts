// src/features/core/search.ts
// ─────────────────────────────────────────────────────────────────
//  Search: an icon that opens one box; results split by where they come from (Culture, Literature, Film & TV, Games)
// ─────────────────────────────────────────────────────────────────

import {
    $,
    addItem,
    closestTo,
    fmtScore,
    idTitle,
    isRecord,
    isStatus,
    items,
    KEYS,
    listOf,
    markDirty,
    MEDIA,
    meta,
    norm,
    nowISO,
    safeUrl,
    scaleOf,
    sleep,
    STATUS_WORDS,
    statusWord,
    titleOf,
    toast,
    ui,
    undo,
    vault,
} from "./core";
import {
    AL,
    AL_MEDIA,
    alToFields,
    candidateDetails,
    filmSearchKeyless,
    gbSearch,
    olSearch,
    rawgSearch,
    refreshItem,
    tmdbSearch,
    tvmazeSearch,
    wdSearch,
} from "../sources/sources";
import { IGDB_ON, igdbSearch } from "../sources/igdb";
import { TMDB_ON } from "../sources/proxy";
import { autoCovers, cacheAndColour, updateItemTiles } from "../sources/covers";
import { archiveGames, upgradeGameCover } from "../sources/box-art";
import { allWithParts, titleById, viewKey } from "./views";
import { renderMain } from "./shell";
import { searchChanged } from "./shell/shell-state.svelte";
import { charImg } from "../library/connect";
import { addDefaults, openModal, renderOverlay } from "./modals";
import { afterChange, goList } from "./navigation";
import { makePrivate, openItem } from "../library/item-actions";
import { searchAlbums } from "../music/musicbrainz";
import uFuzzy from "@leeoniya/ufuzzy";
import type { Candidate, Entry, ItemDraft } from "./model";

/** the search box's state: what's typed, the row that's picked, and what each catalogue found */
export const GS: {
    q: string;
    i: number;
    rows: ((q: string) => unknown)[];
    cands: Candidate[];
    web: Record<string, Candidate[]>;
    webQ: string;
    busy: Record<string, boolean>;
    slow: Record<string, boolean | "timeout">;
    more: Record<string, boolean>;
    added: Map<string, string>;
    adding: Set<string>;
    timer: ReturnType<typeof setTimeout> | undefined;
    open: boolean;
    ctl: AbortController | null;
} = {
    q: "",
    i: 0,
    rows: [],
    cands: [],
    web: {},
    webQ: "",
    busy: {},
    slow: {},
    more: {},
    added: new Map(),
    adding: new Set(),
    timer: undefined,
    open: false,
    ctl: null,
};
// each column: its key, its name, the media it holds, and where it searches
const GS_COLS: [key: string, name: string, media: string[], source: string][] = [
    ["culture", "Culture", ["anime", "manga", "manhwa", "novel"], "AniList"],
    ["lit", "Literature", ["book", "comic"], "Open Library"],
    ["screen", "Film & TV", ["film", "tv"], ""],
    ["games", "Games", ["game"], ""],
    ["music", "Music", ["album"], "MusicBrainz"],
];
const GS_SUBS = [
    ["anime", "Anime"],
    ["manga", "Manga"],
    ["manhwa", "Manhwa & manhua"],
    ["novel", "Light novels"],
    ["book", "Books"],
    ["comic", "Comics"],
    ["film", "Films"],
    ["tv", "Series"],
    ["game", "Games"],
    ["album", "Music"],
];
const subOf = (b: { medium?: string; kind?: string }) =>
    b.medium === "film" && b.kind === "Anime film" ? "anime" : b.medium;
const colOf = (b: { medium?: string; kind?: string }) =>
    b.medium === "film" && b.kind === "Anime film"
        ? "culture"
        : (GS_COLS.find(c => c[2].includes(b.medium || "")) || GS_COLS[0])[0];
async function alSearchAny(q: string, signal: AbortSignal): Promise<Candidate[]> {
    const fl = ui.private ? "" : ", isAdult: false";
    const d = await AL.q(
        `query($q:String){ Page(perPage: 16){ media(search:$q${fl}, sort:[SEARCH_MATCH, POPULARITY_DESC]){ ${AL_MEDIA} } } }`,
        { q },
        signal
    );
    const page = isRecord(d) && isRecord(d.Page) ? d.Page : {};
    return listOf(page.media).map(m => ({ src: "anilist", ...alToFields(m) }));
}
/** what a search that may have failed found: nothing, if it failed */
const found = <T>(r: PromiseSettledResult<T[]>): T[] => (r.status === "fulfilled" ? r.value || [] : []);
// each column searches on its own, so a slow source never holds up the others
const GS_WEB: Record<string, (q: string, s: AbortSignal) => Promise<Candidate[]>> = {
    culture: (q, s) => alSearchAny(q, s),
    music: (q, s) => searchAlbums(q, s), // src/features/music
    lit: async (q, s) => {
        const [b, c] = await Promise.allSettled([olSearch(q, 8, s), gbSearch(q + " graphic novel", 3, s)]);
        return [...found(b), ...found(c).map(x => ({ ...x, medium: "comic", kind: "Graphic novel" }))];
    },
    screen: async (q, s) => {
        const [t, f] = await Promise.allSettled([
            TMDB_ON() ? tmdbSearch(q, "tv", s) : tvmazeSearch(q, s),
            TMDB_ON() ? tmdbSearch(q, "film", s) : filmSearchKeyless(q, s),
        ]);
        const T = found(t).slice(0, 6),
            F = found(f).slice(0, 6),
            out: Candidate[] = [];
        for (let i = 0; i < 6; i++) {
            if (F[i]) out.push(F[i]);
            if (T[i]) out.push(T[i]);
        }
        return out;
    },
    games: async (q, s) => {
        const [m, a] = await Promise.allSettled([
            IGDB_ON()
                ? igdbSearch(q, s).catch(() => (KEYS.rawg ? rawgSearch(q, s) : wdSearch(q, "game", s)))
                : KEYS.rawg
                  ? rawgSearch(q, s)
                  : wdSearch(q, "game", s),
            sleep(0).then(() => archiveGames(q, s)),
        ]);
        const M = found(m),
            seen = new Set(M.map(x => idTitle(x.title)));
        return [
            ...M,
            ...found(a)
                .filter(x => !seen.has(idTitle(x.title)))
                .slice(0, M.length > 8 ? 2 : 4),
        ];
    },
};
// ── your library, searched as you type: forgiving of typos and any script (uFuzzy) ──
// Every title is folded (norm) once per change to the library, not on every key. Exact titles come first, then
// titles that start with what you typed, then ones that contain it, then near misses ("fullmetal alchmist")
const UF = new uFuzzy({
    unicode: true,
    interSplit: "[^\\p{L}\\p{M}\\p{N}']+",
    intraSplit: "\\p{Ll}\\p{Lu}",
    intraBound: "\\p{L}\\p{N}|\\p{N}\\p{L}|\\p{Ll}\\p{Lu}",
    interBound: "[^\\p{L}\\p{M}\\p{N}]",
    intraChars: "[\\p{L}\\p{M}\\p{N}']",
    intraContr: "'\\p{L}{1,2}\\b",
    intraMode: 1,
});
/** the library, folded for searching once per change: each entry's titles and creator, and its titles and ids looked up */
const GS_HAY: {
    key: string;
    list: Entry[];
    t: string[];
    t2: string[];
    c: string[];
    hay: string[];
    lib: Map<string, Entry>;
    byExt: Map<string, Entry>;
} = { key: "", list: [], t: [], t2: [], c: [], hay: [], lib: new Map(), byExt: new Map() };
function gsHay() {
    const k = viewKey();
    if (GS_HAY.key === k) return GS_HAY;
    const list = allWithParts(),
        lib = new Map<string, Entry>(),
        byExt = new Map<string, Entry>();
    const t = list.map(b => norm(titleOf(b))),
        t2 = list.map(b => norm([(b.alt || {}).romaji, (b.alt || {}).native, b.title].join(" ")));
    for (const b of list) {
        for (const x of [b.title, (b.alt || {}).en, (b.alt || {}).romaji].filter(Boolean))
            lib.set(b.medium + "|" + idTitle(x), b);
        for (const [e, v] of Object.entries(b.ext || {}))
            if (v && ["anilist", "tmdb", "rawg", "igdb", "tvmaze", "imdb", "olKey", "mal"].includes(e))
                byExt.set(e + ":" + v, b);
    }
    return Object.assign(GS_HAY, {
        key: k,
        list,
        t,
        t2,
        c: list.map(b => norm(b.creator)),
        hay: t.map((x, i) => (t2[i] === x ? x : x + " " + t2[i])),
        lib,
        byExt,
    });
}
export function gsLocal(q: string): Entry[] {
    const nq = norm(q);
    if (!nq) return [];
    const H = gsHay(),
        score = new Map<number, number>();
    H.list.forEach((b, i) => {
        const t = H.t[i],
            s =
                (t === nq ? 5 : 0) +
                (t.startsWith(nq) ? 3 : 0) +
                (t.includes(nq) || H.t2[i].includes(nq) ? 2 : 0) +
                (H.c[i].includes(nq) ? 1 : 0) +
                (b.fav ? 0.3 : 0);
        if (s > 1) score.set(i, s);
    });
    const close = [...score.keys()].sort((a, b) => (score.get(b) || 0) - (score.get(a) || 0) || a - b);
    // near misses, in uFuzzy's own order, after everything that matched as typed
    if (close.length < 40) {
        const [idxs, info, order] = UF.search(H.hay, nq, 0, 1000);
        for (const i of order && info ? order.map(o => info.idx[o]) : idxs || []) if (!score.has(i)) close.push(i);
    }
    return close.slice(0, 40).map(i => H.list[i]);
}
/** the search box draws again (shell/Search.svelte), with what searchView() works out */
const renderSearch = () => searchChanged();
/** one row of results: what it is, and what Enter or a click does with it (GS.rows holds the second, in order) */
export type SearchRow =
    | { i: number; on: boolean; t: "mine"; b: Entry; title: string; meta: string; score: string }
    | { i: number; on: boolean; t: "web"; r: Candidate; meta: string; adding: boolean; q: number; add: string }
    | { i: number; on: boolean; t: "char"; img: string; name: string }
    | { i: number; on: boolean; t: "list"; ic: string; name: string }
    | { i: number; on: boolean; t: "add"; q: string };
/** what the search box shows for what's typed: a bar to pick what ＋ adds as, a column for each kind of thing (your
 *  library first, then what the web found, by type inside), characters and lists that match, and a way to add it
 *  yourself. null while it's closed or empty. Each row gets its place in GS.rows as it's worked out, as ↑ ↓ and Enter
 *  go by it */
export function searchView() {
    const q = GS.q.trim();
    if (!GS.open || !q) return null;
    const loc = gsLocal(q),
        { lib, byExt } = gsHay();
    const haveOf = (r: Candidate) => {
        for (const [k, v] of Object.entries(r.ext || {}))
            if (v && byExt.has(k + ":" + v)) return byExt.get(k + ":" + v);
        return lib.get(r.medium + "|" + idTitle(r.title));
    };
    GS.rows = [];
    GS.cands = [];
    const at = (fn: (q: string) => unknown) => {
        GS.rows.push(fn);
        return { i: GS.rows.length - 1, on: GS.rows.length - 1 === GS.i };
    };
    const libRow = (b: Entry): SearchRow => ({
        ...at(() => openItem(b.id)),
        t: "mine",
        b,
        title: titleOf(b),
        meta: [
            b.kind || MEDIA[b.medium].one,
            b.year,
            statusWord(b.status, b.medium),
            b.partOf && items.has(b.partOf) ? "in " + titleById(b.partOf) : "",
        ]
            .filter(Boolean)
            .join(" · "),
        score: b.rating ? fmtScore(b.rating, scaleOf(b)) : "",
    });
    const webRow = (r: Candidate): SearchRow => {
        const have = haveOf(r);
        if (have) return libRow(have);
        GS.cands.push(r);
        return {
            ...at(() => addFromCandidate(r)),
            t: "web",
            r,
            meta: [
                r.kind && r.kind !== (MEDIA[r.medium || ""] || {}).one
                    ? r.kind
                    : MEDIA[r.medium || ""]
                      ? MEDIA[r.medium || ""].one
                      : "",
                r.year,
                r.creator,
            ]
                .filter(Boolean)
                .join(" · "),
            adding: GS.adding.has(r.medium + "|" + idTitle(r.title)),
            q: GS.cands.length - 1,
            add: statusWord(meta.settings.quickStatus || "want", r.medium),
        };
    };
    const here = colOf({ medium: (addDefaults() || {}).medium || "anime", kind: "" });
    const cols = GS_COLS.map(([k, name]) => {
        // split by type inside the column (Anime / Manga / Manhwa / Light novels; Films / Series…), each with its own few
        const big = !!GS.more[k],
            mineAll = loc.filter(b => colOf(b) === k),
            seenAll = new Set(mineAll.map(b => b.id));
        const webAll = (GS.webQ === q ? GS.web[k] || [] : []).filter(r => {
            const h = haveOf(r);
            return !h || !seenAll.has(h.id);
        });
        const subs = GS_SUBS.filter(([sk]) => mineAll.some(b => subOf(b) === sk) || webAll.some(r => subOf(r) === sk));
        const parts = subs.map(([sk, sl]): [string, Entry[], Candidate[]] => [
            sl,
            mineAll.filter(b => subOf(b) === sk).slice(0, big ? 40 : 3),
            webAll.filter(r => subOf(r) === sk).slice(0, big ? 40 : subs.length > 1 ? 4 : 6),
        ]);
        const mine = parts.flatMap(p => p[1]),
            web = parts.flatMap(p => p[2]);
        const hiddenN = mineAll.length - mine.length + webAll.length - web.length;
        return {
            k,
            name,
            here: k === here,
            busy: GS.busy[k] ? (GS.slow[k] ? "still looking…" : "searching…") : "",
            retry: !GS.busy[k] && GS.slow[k] === "timeout",
            parts: parts.map(([sl, M, Wb]) => ({
                sl: subs.length > 1 ? sl : "",
                rows: [...M.map(libRow), ...Wb.map(webRow)],
            })),
            none:
                !mine.length && !web.length && !GS.busy[k]
                    ? GS.webQ === q || !navigator.onLine
                        ? "Nothing here"
                        : "…"
                    : "",
            more: hiddenN > 0 || big ? (big ? "Show fewer" : `Show all · ${hiddenN} more`) : "",
        };
    });
    const chars = meta.chars.filter(c => norm(c.name).includes(norm(q))).slice(0, 4),
        lists = meta.lists.filter(l => !l.private === !ui.private && norm(l.name).includes(norm(q))).slice(0, 3);
    const qs = meta.settings.quickStatus || "want";
    const extra: SearchRow[] = [
        ...chars.map(
            (c): SearchRow => ({
                ...at(() => openModal("char", { id: c.id })),
                t: "char",
                img: charImg(c),
                name: c.name,
            })
        ),
        ...lists.map(
            (l): SearchRow => ({ ...at(() => goList(l.id)), t: "list", ic: l.numbered ? "№" : "≡", name: l.name })
        ),
    ];
    const add: SearchRow = {
        ...at(() =>
            openModal("add", {
                step: "review",
                medium: addDefaults().medium,
                draft: {
                    title: q,
                    medium: addDefaults().medium,
                    kind: addDefaults().kind,
                    status: "want",
                    copy: "none",
                },
                coverData: "",
            })
        ),
        t: "add",
        q,
    };
    GS.i = Math.min(GS.i, Math.max(0, GS.rows.length - 1));
    return {
        qs: ["want", "active", "done"].map(k => ({ k, on: qs === k, word: STATUS_WORDS.any[k] || k })),
        cols,
        extra,
        add,
        links:
            ui.private && vault.prefs && (vault.prefs.links || []).length
                ? vault.prefs.links.map(l => ({
                      name: l.name,
                      url: safeUrl(l.url.replace("{q}", encodeURIComponent(q))),
                  }))
                : null,
    };
}
async function addFromCandidate(c: Candidate) {
    closeSearch();
    openModal("add", {
        step: "review",
        busy: true,
        medium: c.medium,
        draft: { ...c, status: "want", copy: "none" },
        coverData: "",
    });
    const d = await candidateDetails(c),
        m = ui.modal;
    if (!m || m.kind !== "add") return;
    const med = d.medium || c.medium,
        kind = d.kind || (med === "book" ? "Novel" : "");
    Object.assign(m, {
        busy: false,
        medium: med,
        draft: {
            ...d,
            medium: med,
            kind,
            status: "want",
            copy: "none",
            format: med === "book" ? (d.total ? (d.total < 350 ? "Short" : "Long") : "") : undefined,
        },
    });
    renderOverlay(true);
}
// quick add: straight into the library with your default status; the search stays open for the next one
async function quickAdd(r: Candidate) {
    const key = r.medium + "|" + idTitle(r.title);
    if (GS.adding.has(key)) return;
    GS.adding.add(key);
    renderSearch();
    let d: Candidate = r;
    try {
        d = (await Promise.race([candidateDetails(r), sleep(7000).then(() => null)])) || r;
    } catch (_) {
        d = r;
    }
    const st = meta.settings.quickStatus || "want",
        med = d.medium || r.medium;
    const data: ItemDraft = {
        ...r,
        ...d,
        medium: med,
        kind: d.kind || r.kind || (med === "book" ? "Novel" : ""),
        status: isStatus(st) ? st : "want", // anything else becomes "want" when it's added
        copy: "none",
        rating: 0,
        source: d.src || r.src || "you",
    };
    for (const k of [
        "src",
        "recs",
        "cast",
        "votes",
        "score",
        "seeds",
        "reason",
        "add",
        "popularity",
        "lang",
        "desc",
        "filmKind",
        "id",
    ])
        delete data[k];
    if (st === "done") data.finishedAt = nowISO();
    if (st === "active") data.startedAt = nowISO();
    let nid = addItem(data, "Add " + data.title);
    if (ui.private && vault.key) nid = makePrivate(nid);
    GS.adding.delete(key);
    renderSearch();
    renderMain();
    toast(`Added ${data.title} · ${statusWord(st, med)}`, { label: "Undo", fn: undo });
    if (!data.cover) setTimeout(() => autoCovers([nid]), 300);
    else cacheAndColour(nid).then(() => updateItemTiles(nid));
    setTimeout(
        () =>
            refreshItem(nid, undefined, { full: false })
                .then(() => upgradeGameCover(nid))
                .then(afterChange)
                .catch(() => {}),
        1200
    );
}
function gsRun(i: number) {
    const fn = GS.rows[i];
    if (!fn) return;
    const q = GS.q;
    closeSearch();
    fn(q);
}
export function closeSearch() {
    GS.open = false;
    document.body.classList.remove("gs-on");
    GS.more = {};
    const i = $<HTMLInputElement>("#gq");
    if (i) {
        i.value = "";
        if (document.activeElement === i) i.blur();
    }
    GS.q = "";
    const w = $("#gs");
    if (w) w.classList.remove("open");
    renderSearch();
}
export function focusSearch() {
    const w = $("#gs"),
        i = $<HTMLInputElement>("#gq");
    if (!i) return;
    w?.classList.add("open");
    document.body.classList.add("gs-on");
    GS.open = true;
    i.focus();
    i.select();
    requestAnimationFrame(() => {
        if (document.activeElement !== i) i.focus();
    });
    renderSearch();
}
// each column on its own clock: "still looking" after 4s, give up after 12s with a retry
function gsCol(k: string, q: string, sig: AbortSignal) {
    GS.busy[k] = true;
    GS.slow[k] = false;
    const slowT = setTimeout(() => {
        if (GS.webQ === q && GS.busy[k]) {
            GS.slow[k] = true;
            renderSearch();
        }
    }, 4000);
    Promise.race([
        GS_WEB[k](q, sig),
        sleep(12000).then(() => {
            throw new Error("timeout");
        }),
    ])
        .then(r => {
            if (GS.webQ === q) {
                GS.web[k] = (r || []).filter(x => x && x.title && (ui.private || !x.flag));
                GS.slow[k] = false;
            }
        })
        .catch(e => {
            if (GS.webQ === q && e && e.message === "timeout") GS.slow[k] = "timeout";
        })
        .finally(() => {
            clearTimeout(slowT);
            if (GS.webQ === q) {
                GS.busy[k] = false;
                renderSearch();
            }
        });
}

// ── what the search box does (shell/Search.svelte hands it its events) ──
/** what's typed: the library's results at once, the web's after a pause */
export function searchTyped(value: string) {
    GS.q = value;
    GS.i = 0;
    GS.open = true;
    renderSearch();
    if (GS.timer) clearTimeout(GS.timer);
    const q = GS.q.trim();
    if (q.length >= 2 && navigator.onLine)
        GS.timer = setTimeout(() => {
            if (GS.ctl) GS.ctl.abort();
            GS.ctl = new AbortController();
            const sig = GS.ctl.signal;
            GS.webQ = q;
            GS.web = {};
            for (const [k] of GS_COLS) gsCol(k, q, sig);
            renderSearch();
        }, 420);
}
/** a key in the box: ↑ ↓ move, Enter opens, Escape closes. true when it was one of these */
export function searchKey(e: KeyboardEvent): boolean {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        GS.i = Math.max(0, Math.min(GS.rows.length - 1, GS.i + (e.key === "ArrowDown" ? 1 : -1)));
        renderSearch();
        $("#gsres .gsr.on")?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (GS.rows.length && GS.q.trim()) gsRun(GS.i);
    } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
    } else return false;
    return true;
}
/** a press anywhere (before anything else gets it, so the box keeps focus): a result, its ＋, what ＋ adds as, more
 *  or fewer, trying a slow column again, clearing the box, or anywhere outside it, which closes it */
export function searchPress(e: PointerEvent) {
    const qa = closestTo(e, "[data-gsq]");
    if (qa) {
        e.preventDefault();
        e.stopPropagation();
        const r = GS.cands[Number(qa.dataset.gsq)];
        if (r) quickAdd(r);
        return;
    }
    const qs = closestTo(e, "[data-gsqs]");
    if (qs) {
        e.preventDefault();
        meta.settings.quickStatus = qs.dataset.gsqs;
        markDirty();
        renderSearch();
        return;
    }
    const mo = closestTo(e, "[data-gsmore]");
    if (mo) {
        e.preventDefault();
        const k = mo.dataset.gsmore || "";
        GS.more[k] = !GS.more[k];
        renderSearch();
        return;
    }
    const rt = closestTo(e, "[data-gsretry]");
    if (rt) {
        e.preventDefault();
        if (!GS.ctl || GS.ctl.signal.aborted) GS.ctl = new AbortController();
        gsCol(rt.dataset.gsretry || "", GS.webQ, GS.ctl.signal);
        renderSearch();
        return;
    }
    const r = closestTo(e, "[data-gs]");
    if (r) {
        e.preventDefault();
        gsRun(Number(r.dataset.gs));
        return;
    }
    if (closestTo(e, '[data-act="search-close"]')) {
        e.preventDefault();
        const i = $<HTMLInputElement>("#gq");
        if (i && i.value) {
            i.value = "";
            GS.q = "";
            GS.webQ = "";
            GS.more = {};
            renderSearch();
            i.focus();
        } else closeSearch();
        return;
    }
    if (GS.open && !closestTo(e, "#gs") && !closestTo(e, '[data-act="focus-search"]')) closeSearch();
}
