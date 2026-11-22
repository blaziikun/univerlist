// src/features/watch-read/stage.ts
// ─────────────────────────────────────────────────────────────────
//  Watch & Read: one quiet place to play and read your own things
//
//  A long search box that answers as you type (a plain list by default, covers if you like), a switch between Watch and
//  Read next to the app name, and only what you need: what you were in the middle of, your servers, and files from this
//  computer.
// ─────────────────────────────────────────────────────────────────

import {
    $,
    addItem,
    change,
    cleanTitle,
    coverCache,
    entryOf,
    findExisting,
    idTitle,
    isRecord,
    items,
    markDirty,
    MEDIA,
    meta,
    norm,
    ownOf,
    plural,
    statusWord,
    textOf,
    titleOf,
    toast,
    toList,
    ui,
    undo,
} from "../core/core";
import type { ActEl } from "../core/core";
import { applyTheme, resolveTheme, THEME_PRESETS } from "../core/theme";
import { alSearch, filmSearchKeyless, olSearch, tmdbSearch, tvmazeSearch } from "../sources/sources";
import { TMDB_ON } from "../sources/proxy";
import { all, pct, progText } from "../core/views";
import { gsLocal } from "../core/search";
import { combineGroups, partsOf, seasonGroups } from "../core/parts";
import { renderMain } from "../core/shell";
import { themeList } from "../settings/settings";
import {
    cinSideRedraw,
    isSeasonish,
    playerRedraw,
    seasonSort,
    seasonStem,
    servers,
    W,
    watchOpen,
    watchStart,
    WP,
    WP_PLACES,
    wpSave,
} from "./watch";
import { panelToggle } from "./player";
import { LIBS } from "./medialibs";
import { RD, readable, readFromItem } from "./read";
import { RLIBS } from "./readlibs";
import { stageChanged } from "./stage-state.svelte";
import { render } from "../core/navigation";
import type { Candidate, Entry, ResolvedTheme } from "../core/model";

/** Watch, or Read */
export type StageKind = "watch" | "read";
/** something a Read search found: an entry of yours, or what a catalogue has */
type ReadResult = Entry | Candidate;
const STAGE_CATS: Record<StageKind, [string, string][]> = {
    watch: [
        ["all", "All"],
        ["anime", "Anime"],
        ["tv", "TV"],
        ["film", "Film"],
    ],
    read: [
        ["all", "All"],
        ["manga", "Manga"],
        ["manhwa", "Manhwa & manhua"],
        ["novel", "Light novels"],
        ["book", "Books"],
        ["comic", "Comics"],
    ],
};
const SG: {
    cat: Record<StageKind, string>; // the type each side searches
    ri: number; // the result picked with the arrow keys
    rq: string; // Read's search
    rres: ReadResult[] | null; // …and what it found
    rbusy: boolean;
    t: number; // counts searches, so an older answer arriving late is dropped
    timer?: ReturnType<typeof setTimeout>;
    stop?: AbortController; // the catalogue lookups of the search before, cut short when you type on
} = { cat: { watch: "all", read: "all" }, ri: 0, rq: "", rres: null, rbusy: false, t: 0 };
const stageCovers = () => !!meta.settings.stageCovers;
/** what's typed in Watch's or Read's search now */
export const stageQ = (kind: StageKind) => (kind === "watch" ? W.q : SG.rq) || "";
const mediumOne = (m: string | undefined) => ownOf(MEDIA, m ?? "")?.one || "";
/** the search row at the top of Watch and Read (page/StageHead.svelte): what's typed, the type searched, the switches */
export type StageCont = NonNullable<ReturnType<typeof continueView>>;
export function stageHeadView(kind: StageKind) {
    const w = kind === "watch",
        n = w ? servers().length + LIBS().length : RLIBS().length;
    return {
        id: w ? "wq" : "rq",
        placeholder: w ? "Search anime, shows and films" : "Search manga, manhwa, novels and books",
        q: stageQ(kind),
        cats: STAGE_CATS[kind].map(([k, l]): [string, string] => [k, k === "all" ? "Any" : l]),
        cat: SG.cat[kind],
        covers: stageCovers(),
        srvAct: w ? "watch-servers" : "rl-servers",
        srvOn: !!(w ? ui.watchServers : ui.readServers),
        srvLabel: "Servers" + (n ? " · " + n : ""),
        filesAct: w ? "watch-files" : "read-files",
    };
}
/** what a search found (page/StageResults.svelte): a list you can arrow through, or covers. Watch searches the
 *  catalogues, not your library, so it doesn't mark what you have; Read still lists your own first */
export function stageResView(kind: StageKind) {
    const w = kind === "watch",
        R: ReadResult[] | null = w ? W.results : SG.rres,
        busy = w ? W.busy : SG.rbusy,
        q = stageQ(kind);
    const have = (r: ReadResult) => {
        // Watch: only what came from your library (it's listed first, and the catalogues' copies of it are left out)
        if (w) return typeof r.id === "string" ? items.get(r.id) || null : null;
        const id =
            typeof r.id === "string" && items.has(r.id)
                ? r.id
                : findExisting(r.title, r.creator || "", r.medium, r.ext);
        return id ? items.get(id) || null : null;
    };
    const shown = !q ? "" : busy && !(R || []).length ? "busy" : !R ? "" : !R.length ? "none" : "list";
    return {
        q,
        shown,
        // still asking the catalogues, under what's already listed
        more: shown === "list" && busy,
        covers: stageCovers(),
        rows: (shown === "list" && R ? R : []).map((r, i) => {
            const h = have(r);
            return {
                i,
                on: i === SG.ri,
                title: r.title,
                img: r.cover ? coverCache.src(r.cover) : "",
                // under a cover: the year, the kind of thing, and how you're getting on with it
                sub: [r.year, mediumOne(r.medium), h ? statusWord(h.status, h.medium) : ""].filter(Boolean).join(" · "),
                // in the list: the year and the kind
                meta: [r.year, r.kind && r.kind !== mediumOne(r.medium) ? r.kind : mediumOne(r.medium)]
                    .filter(Boolean)
                    .join(" · "),
                pill: h ? { cls: "pill " + h.status, word: statusWord(h.status, h.medium) } : null,
            };
        }),
    };
}
const isWatchable = (b: Entry) => b.medium === "tv" || b.medium === "anime" || b.medium === "film";
const isGoing = (b: Entry) => b.status === "active" || b.status === "redo";
/** what you were in the middle of (page/StageContinue.svelte), newest first; null when there's nothing */
function continueView(kind: StageKind) {
    const w = kind === "watch",
        L = all()
            .filter(b => (w ? isWatchable(b) : readable(b)) && isGoing(b))
            .sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")))
            .slice(0, 24);
    if (!L.length) return null;
    return {
        word: w ? "watching" : "reading",
        open: meta.settings.stageCont !== false,
        covers: stageCovers(),
        act: w ? "watch-item" : "read-open",
        rows: L.map(b => ({
            b,
            title: cleanTitle(titleOf(b)),
            sub: b.medium === "film" ? String(b.year || "Film") : progText(b),
            pct: pct(b),
        })),
    };
}
// whether the page would list what you're in the middle of, with nothing typed
const contShown = () => !!continueView(ui.page === "read" ? "read" : "watch");
/** what the Watch page shows (page/WatchPage.svelte), worked out when the older code asks it to draw (renderMain) */
export function watchPageView() {
    const show = W.view === "show" && !!W.show;
    return {
        servers: !!ui.watchServers,
        show,
        cont: show || W.q ? null : continueView("watch"),
        browse: !show && !W.q && LIBS().length > 0,
        empty: !show && !W.q && !all().some(b => isWatchable(b) && isGoing(b)),
    };
}
/** what the Read page shows (page/ReadPage.svelte): a book or series open, or the search and what you're reading */
export function readPageView() {
    const book = !!RD.item && items.has(RD.item);
    return {
        book,
        servers: !!ui.readServers,
        cont: book || SG.rq ? null : continueView("read"),
        browse: !book && !SG.rq && RLIBS().length > 0,
        empty: !book && !SG.rq && !all().some(b => readable(b) && isGoing(b)),
    };
}
// One list of the shows that match, from AniList, TVmaze and the film source, never from your library:
//  - the same show listed as anime and as TV (same name, first aired within a year of each other) is one entry
//  - seasons AniList lists separately (Bungo Stray Dogs, 2nd Season, 3rd Season…) are one entry; Watch gathers its seasons when you open it
//  - its OVAs, specials and trailers are extras, not shows: hidden while the series is in the list (search for one by name and it shows)
//  - an animated TVmaze listing of the same series (Bleach, Bleach: Thousand-Year Blood War) joins that series, whatever its year
//  - an anime film that is also listed as a film is one entry (the film); its franchise films come before unrelated films that only share the name, which are kept to two
//  - different shows that only share a name stay apart, and the year tells them apart
//  - best name matches first; loose, fuzzy matches only fill the list when there are few real ones
export function mergeWatchResults(q: string, an: Candidate[], tv: Candidate[], fl: Candidate[]): Candidate[] {
    const names = (r: Candidate) => {
        const alt: unknown = r.alt,
            A = isRecord(alt) ? Object.values(alt) : toList<unknown>(alt || []);
        return [r.title, r.en, r.romaji, r.native, ...A].filter(
            (t): t is string => typeof t === "string" && !!t.trim()
        );
    };
    const keys = (r: Candidate) => names(r).map(idTitle).filter(Boolean);
    const same = (a: Candidate, b: Candidate) => {
        const ka = keys(a),
            kb = new Set(keys(b));
        if (!ka.some(k => kb.has(k))) return false;
        const ya = Number(a.year),
            yb = Number(b.year);
        return !ya || !yb || Math.abs(ya - yb) <= 1;
    };
    const merge = (into: Candidate, r: Candidate) => {
        into.ext = { ...(r.ext || {}), ...(into.ext || {}) };
        if (!into.cover && r.cover) into.cover = r.cover;
        if (!into.year && r.year) into.year = r.year;
    };
    const okFlag = (r: Candidate) => ui.private || !r.flag;
    const nq = idTitle(q),
        words = nq.split(" ").filter(Boolean);
    // 1. anime: one entry per series. Its OVAs, specials and trailers are extras of it, not shows of their own
    const anime: Candidate[] = [],
        extras: Candidate[] = [],
        bySeries = new Map<string, Candidate>();
    for (const r of an.filter(r => r.medium === "anime" && okFlag(r))) {
        if (r.kind === "OVA" || r.kind === "Special") {
            extras.push(r);
            continue;
        }
        if (!isSeasonish(r)) {
            anime.push(r);
            continue;
        }
        const s = seasonStem(r.title),
            first = bySeries.get(s);
        if (!first) {
            bySeries.set(s, r);
            anime.push(r);
        } else {
            const earlier = seasonSort(r, first) < 0,
                keep = earlier ? r : first,
                drop = earlier ? first : r;
            merge(keep, drop);
            if (earlier) {
                anime[anime.indexOf(first)] = r;
                bySeries.set(s, r);
            }
        }
    }
    // an extra is hidden when its series is in the list, unless you searched for the extra itself
    for (const x of extras) {
        const k = keys(x),
            stem = [...bySeries.keys()].find(s => s && k.some(t => t.startsWith(s + " ")));
        if (stem && !(nq.length > stem.length && k.some(t => t.includes(nq)))) continue;
        anime.push(x);
    }
    const out = [...anime];
    // 2. films, then the anime films that are the same film
    const films: Candidate[] = [];
    for (const r of fl.filter(okFlag)) {
        const o = films.find(x => same(x, r));
        if (o) merge(o, r);
        else films.push(r);
    }
    for (const f of films) {
        const i = out.findIndex(a => a.kind === "Movie" && same(a, f));
        if (i >= 0) {
            merge(f, out[i]);
            out.splice(i, 1);
        }
    }
    // 3. TV: the same show as an anime entry adds what TVmaze knows to it (an animated listing of the same series counts, whatever its year: Bleach and Bleach: Thousand-Year Blood War); otherwise it is its own entry
    const animeish = (r: Candidate) => /anim/i.test(r.kind || "") || (r.genres || []).some(g => /anime/i.test(g));
    for (const r of tv.filter(okFlag)) {
        const o = out.find(
            x =>
                x.medium === "anime" &&
                (same(x, r) ||
                    (isSeasonish(x) &&
                        seasonStem(x.title) === seasonStem(r.title) &&
                        (animeish(r) || !x.year || !r.year || Math.abs(x.year - r.year) <= 1)))
        );
        if (o) {
            merge(o, r);
            continue;
        }
        const t = out.find(x => x.medium === "tv" && same(x, r));
        if (t) {
            merge(t, r);
            continue;
        }
        out.push(r);
    }
    // films: when a series matched, its own movies come first, and unrelated films that merely share its name are kept to a few
    const penalty = new Map<Candidate, number>(),
        series = out.filter(r => r.medium !== "film");
    if (series.length) {
        const sk = new Set(series.flatMap(keys)),
            stems = [...new Set(series.map(r => seasonStem(r.title)).filter(Boolean))];
        const cls = (f: Candidate) =>
            keys(f).some(k => sk.has(k))
                ? "same"
                : f.kind === "Anime film" ||
                    (/\b(movie|film)\b/.test(keys(f).join(" ")) &&
                        stems.some(s => keys(f).some(k => k.startsWith(s + " "))))
                  ? "franchise"
                  : "other";
        const left = { same: 2, other: 3, franchise: 6 };
        for (const f of [...films].sort((a, b) => Number(!!b.cover) - Number(!!a.cover))) {
            const c = cls(f);
            if (left[c]-- <= 0) films.splice(films.indexOf(f), 1);
            else if (c !== "franchise") penalty.set(f, c === "same" ? 1.5 : 0.25);
        }
    }
    out.push(...films);
    // 4. best matches first
    const score = (r: Candidate) =>
        Math.max(
            0,
            ...keys(r).map(k =>
                k === nq
                    ? 4
                    : k.startsWith(nq)
                      ? 3
                      : k.includes(nq)
                        ? 2
                        : words.length > 1 && words.every(w => (" " + k + " ").includes(" " + w + " "))
                          ? 1.5
                          : 0
            )
        ) - (penalty.get(r) || 0);
    const ranked = out.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => b.s - a.s || a.i - b.i);
    const strong = ranked.filter(x => x.s > 0);
    return (strong.length >= 3 ? strong : ranked).slice(0, 24).map(x => x.r);
}
// ── Watch's search: names as you type, at once ──
// Your own shows that match are listed the moment a key is pressed (your library, searched the way the search box
// searches it), then what the catalogues find joins them as each one answers, never holding up the typing: the
// lookups wait until you pause (a quarter of a second), the ones for what you typed before are cut short, and what
// each catalogue said is kept for a few minutes, so typing back to an earlier word shows it again at once. Until a
// word's own answers arrive, the answers for the start of it are narrowed to the names that still match.
type WebAnswers = { an: Candidate[] | null; tv: Candidate[] | null; fl: Candidate[] | null; at: number };
const WEB = new Map<string, WebAnswers>();
const WEB_KEEP = 5 * 60e3;
const webKey = (q: string) => SG.cat.watch + "|" + idTitle(q);
const isShowish = (b: Entry) => isWatchable(b) && !(b.medium === "anime" && b.kind === "Music");
/** your shows, films and anime whose names match, best first */
export function watchLocal(q: string): Entry[] {
    const cat = SG.cat.watch;
    return gsLocal(q)
        .filter(b => isShowish(b) && (cat === "all" || b.medium === cat))
        .slice(0, 8);
}
// an entry of yours as a result: its id says it's yours (stagePick opens the entry itself)
const asResult = (b: Entry): Candidate => ({
    id: b.id,
    title: b.title,
    medium: b.medium,
    kind: b.kind,
    year: b.year,
    cover: b.cover || undefined,
    alt: b.alt,
    ext: b.ext,
});
/** what the catalogues said for this search, or for the start of it while its own answers are on their way */
function webFor(q: string): { list: Candidate[]; exact: boolean } {
    const k = webKey(q),
        now = Date.now();
    for (const [key, a] of WEB) if (now - a.at > WEB_KEEP) WEB.delete(key);
    const own = WEB.get(k);
    if (own) return { list: mergeWatchResults(q, own.an || [], own.tv || [], own.fl || []), exact: true };
    // the longest earlier search this one starts with, narrowed to the names that still match
    let best: WebAnswers | null = null,
        bestLen = 0;
    for (const [key, a] of WEB) {
        const bare = key.slice(key.indexOf("|") + 1);
        if (key.startsWith(SG.cat.watch + "|") && k.startsWith(key) && bare.length > bestLen) {
            best = a;
            bestLen = bare.length;
        }
    }
    if (!best) return { list: [], exact: false };
    const words = idTitle(q).split(" ").filter(Boolean),
        fits = (r: Candidate) => {
            const hay = [r.title, r.alt?.en, r.alt?.romaji, r.alt?.native].map(x => idTitle(x || "")).join(" ");
            return words.every(w => hay.includes(w));
        };
    return { list: mergeWatchResults(q, best.an || [], best.tv || [], best.fl || []).filter(fits), exact: false };
}
/** the list for what's typed now: your own first, then the catalogues' (without the ones you already have) */
function watchList(q: string) {
    const local = watchLocal(q),
        web = webFor(q),
        names = (x: { title: string; alt?: Candidate["alt"] }) =>
            [x.title, x.alt?.en, x.alt?.romaji].filter((t): t is string => !!t).map(idTitle),
        localNames = local.map(b => ({ keys: new Set(names(b)), year: Number(b.year) || 0 })),
        // one of yours: the same catalogue id, or another catalogue's listing of it (the same name, within a year). Only
        // the few listed above are compared, so this stays quick on every key however big the library is
        sameId = (b: Entry, r: Candidate) =>
            (["anilist", "mal", "tvmaze", "tmdb", "imdb"] as const).some(k => !!b.ext?.[k] && b.ext[k] === r.ext?.[k]),
        yours = (r: Candidate) => {
            if (!local.length) return false;
            if (local.some(b => sameId(b, r))) return true;
            const ks = names(r),
                y = Number(r.year) || 0;
            return localNames.some(l => ks.some(k => l.keys.has(k)) && (!y || !l.year || Math.abs(y - l.year) <= 1));
        };
    W.results = [...local.map(asResult), ...web.list.filter(r => !yours(r))].slice(0, 24);
    return web.exact;
}
/** something typed into Watch's search: the names that match, now, and the catalogues asked a moment later */
export function watchLive(q: string) {
    W.q = q;
    W.view = "home";
    SG.ri = 0;
    if (!q.trim()) {
        SG.stop?.abort();
        W.results = null;
        W.busy = false;
        stageRefresh();
        return;
    }
    const exact = watchList(q);
    W.busy = !exact;
    stageRefresh();
}
// searching the catalogues, without redrawing the page (so the box keeps your cursor): each answer joins the list
// as it arrives
export async function watchSearch(q: string) {
    watchLive(q);
    if (!q.trim()) return;
    const k = webKey(q),
        had = WEB.get(k);
    if (had && Date.now() - had.at < WEB_KEEP && had.an && had.tv && had.fl) return;
    SG.stop?.abort();
    const stop = (SG.stop = new AbortController()),
        signal = stop.signal,
        cat = SG.cat.watch,
        my = ++SG.t,
        none: Candidate[] = [];
    const got: WebAnswers = { an: null, tv: null, fl: null, at: Date.now() };
    W.busy = true;
    stageRefresh();
    const arrive = (part: "an" | "tv" | "fl") => (list: Candidate[]) => {
        if (signal.aborted) return;
        got[part] = list;
        WEB.set(k, got);
        if (my !== SG.t || W.q !== q) return;
        watchList(q);
        W.busy = !(got.an && got.tv && got.fl);
        stageRefresh();
    };
    await Promise.all([
        (cat === "all" || cat === "tv" ? tvmazeSearch(q, signal).catch(() => none) : Promise.resolve(none)).then(
            arrive("tv")
        ),
        (cat === "all" || cat === "anime"
            ? alSearch(q, "anime", signal).catch(() => none)
            : Promise.resolve(none)
        ).then(arrive("an")),
        (cat === "all" || cat === "film"
            ? (TMDB_ON() ? tmdbSearch(q, "film", signal) : filmSearchKeyless(q, signal)).catch(() => none)
            : Promise.resolve(none)
        ).then(arrive("fl")),
    ]);
}
async function readSearch(q: string) {
    SG.rq = q;
    SG.ri = 0;
    RD.item = null;
    if (!q.trim()) {
        SG.rres = null;
        SG.rbusy = false;
        stageRefresh();
        return;
    }
    SG.rbusy = true;
    stageRefresh();
    const cat = SG.cat.read,
        my = ++SG.t;
    const local: Entry[] = all()
        .filter(
            b =>
                readable(b) &&
                (cat === "all" || b.medium === cat) &&
                norm(titleOf(b) + " " + b.title + " " + (b.creator || "")).includes(norm(q))
        )
        .slice(0, 12)
        .map(b => ({ ...b }));
    const web =
        cat === "book" || cat === "comic"
            ? await olSearch(q, 8).catch((): Candidate[] => [])
            : await alSearch(q, "manga").catch((): Candidate[] => []);
    if (my !== SG.t) return;
    const seen = new Set(local.map(b => idTitle(b.title)));
    SG.rres = [
        ...local,
        ...web.filter(
            r =>
                (cat === "all" || r.medium === cat || (cat === "manga" && r.medium === "manga")) &&
                (ui.private || !r.flag) &&
                !seen.has(idTitle(r.title))
        ),
    ];
    SG.rbusy = false;
    stageRefresh();
}
// what a search found arrives, or the mark moves: the results draw again, not the page (the box keeps your cursor), unless
// the page shows something else where they go (a show, a book), when it's all drawn again
function stageRefresh() {
    const q = ui.page === "read" ? SG.rq : W.q;
    // the search emptied on a page drawn while there was one: it's drawn again, with what you're in the middle of
    if (!$("#sres") || (ui.page !== "read" && W.view === "show") || (!q && !$(".stcont") && contShown())) renderMain();
    else stageChanged("res");
}
function stagePick(kind: StageKind, i: number) {
    if (kind === "watch") {
        const r = (W.results || [])[i];
        if (r) watchOpen((typeof r.id === "string" ? entryOf(r.id) : null) || r, { play: true });
        return;
    }
    const r = (SG.rres || [])[i];
    if (!r) return;
    let id =
        typeof r.id === "string" && items.has(r.id) ? r.id : findExisting(r.title, r.creator || "", r.medium, r.ext);
    if (!id) {
        id = addItem(
            {
                ...r,
                status: "want",
                copy: "none",
                rating: 0,
                source: textOf(r.src) || "you",
                src: undefined,
                recs: undefined,
            },
            "Add " + r.title
        );
        toast(`Added ${r.title} to your library`, { label: "Undo", fn: undo });
    }
    SG.rq = "";
    SG.rres = null;
    readFromItem(id);
}
export function stageClick(act: string, t: ActEl, k: string | undefined): boolean {
    const kind = ui.page === "read" ? "read" : "watch",
        key = k || "";
    if (act === "stage-pick") {
        stagePick(kind, Number(k));
        return true;
    }
    if (act === "stage-clear") {
        if (kind === "watch") {
            W.q = "";
            W.results = null;
        } else {
            SG.rq = "";
            SG.rres = null;
        }
        renderMain();
        $(kind === "watch" ? "#wq" : "#rq")?.focus();
        return true;
    }
    if (act === "wp-seasons") {
        seasonsAcrossLibrary(k === "together");
        return true;
    }
    if (act === "wp-opts") {
        panelToggle("page");
        return true;
    }
    if (act === "wp-place") {
        const p = WP(),
            v = t.dataset.v || "";
        if (WP_PLACES.includes(v)) p.place = { ...p.place, [key]: v };
        wpSave(p);
        cinSideRedraw();
        return true;
    }
    if (act === "wp-reset") {
        meta.settings.watchPage = {};
        markDirty();
        playerRedraw();
        return true;
    }
    if (act === "wp-eps") {
        wpSave({ ...WP(), eps: key });
        cinSideRedraw();
        return true;
    }
    if (act === "wp-move") {
        const p = WP(),
            i = p.order.indexOf(key),
            j = i + Number(t.dataset.d);
        if (i < 0 || j < 0 || j >= p.order.length) return true;
        [p.order[i], p.order[j]] = [p.order[j], p.order[i]];
        wpSave(p);
        cinSideRedraw();
        return true;
    }
    if (act === "stage-switch") {
        if (k === "read") {
            ui.page = "read";
            RD.item = null;
        } else ui.page = "watch";
        meta.settings.stageLast = k;
        render();
        scrollTo(0, 0);
        return true;
    }
    return false;
}
// Watch & Read can wear their own theme (Settings › Appearance, or ⋯ on a player page)
let stageThemeOn: string | null = null;
export const stageLook = (): string => {
    const t = meta.settings.stageTheme;
    return typeof t === "string" && t ? t : "black";
};
export const STAGE_BLACK = (): ResolvedTheme => ({
    ...resolveTheme("galaxy"),
    name: "Black",
    backdrop: "none",
    bg: "#000000",
    panel: "#0d0d0f",
    text: "#ededef",
    muted: "#8a8a90",
    accent: "#f2f2f4",
    hi: "#ffffff",
    bgStyle: "plain",
    bgAmt: 0,
});
export const STAGE_LOOKS = (): [string, string][] => [
    ["black", "Black, no theme"],
    ["mode", "Same as the mode I came from"],
    ...themeList().map(([k]): [string, string] => [k, resolveTheme(k).name ?? ""]),
];
export function stageThemeApply(force?: boolean) {
    // Settings opened from Watch or Read keeps their look too (it is still that space, just its settings)
    const on =
            ui.page === "watch" ||
            ui.page === "read" ||
            (ui.page === "settings" && /^(watch|read)$/.test(ui.settingsFrom?.page || "")),
        L = stageLook(),
        want =
            !on || L === "mode"
                ? null
                : L === "black"
                  ? "black"
                  : (meta.themes && ownOf(meta.themes, L)) || ownOf(THEME_PRESETS, L)
                    ? L
                    : "black";
    if (!force && want === stageThemeOn) return;
    stageThemeOn = want;
    applyTheme(want === "black" ? STAGE_BLACK() : want ? resolveTheme(want) : undefined);
}
// a file, link or server match arriving while the player page waits for one: start it
export function cinRefreshIfEmpty() {
    const p = W.player;
    if (p && !p.loading && !p.srcs.length && ui.page === "watch") watchStart(p.si ?? 0, p.e ?? 1, { empty: true });
}
/** every anime with sequels in your library, combined into one entry each (or all split apart again) */
export function seasonsAcrossLibrary(together?: boolean) {
    if (!together) {
        const P = all().filter(b => partsOf(b).length && b.medium === "anime");
        if (!P.length) {
            toast("Nothing combined to split.");
            return;
        }
        const ids = P.flatMap(b => [b.id, ...partsOf(b)]);
        change(`Split ${plural(P.length, "show")} into seasons`, ids, x =>
            x ? { ...x, parts: undefined, partOf: undefined } : x
        );
        toast(`Split ${plural(P.length, "show")} back into seasons`, { label: "Undo", fn: undo });
        renderMain();
        return;
    }
    const groups = seasonGroups(all().map(b => b.id));
    if (!groups.length) {
        toast("No sequels to combine: the links come from AniList, so refresh details first if some are missing.");
        return;
    }
    combineGroups(groups, `Combine ${plural(groups.length, "show")}`);
    toast(`Combined the seasons of ${plural(groups.length, "show")}. Each keeps its own score.`, {
        label: "Undo",
        fn: undo,
    });
    renderMain();
}

// ── what the page's own boxes do (page/StageHead.svelte, StageContinue.svelte) ──
/** something typed into Watch's or Read's search. Watch lists your own that match at once and asks the catalogues a
 *  moment later; Read searches a moment later (at once for a letter or two). Typing on a show's page goes back to the
 *  results */
export function stageTyped(kind: StageKind, q: string) {
    clearTimeout(SG.timer);
    if (kind === "watch") {
        if (W.view === "show") {
            W.view = "home";
            W.show = null;
            W.q = q;
            renderMain();
        }
        // your own that match, at once; the catalogues when you pause
        watchLive(q);
        SG.timer = setTimeout(() => watchSearch(q), 250);
        return;
    }
    SG.rq = q;
    SG.timer = setTimeout(() => readSearch(q), q.length < 2 ? 0 : 320);
}
/** a key in the search box: ↑ ↓ move through the results, Enter opens the one marked (or searches), Escape empties the
 *  box and puts the page back as it was (a second Escape leaves the box). True when the key was one of these */
export function stageKey(kind: StageKind, e: KeyboardEvent, box: HTMLInputElement): boolean {
    const R: ReadResult[] = (kind === "watch" ? W.results : SG.rres) || [];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!R.length) return true;
        SG.ri = Math.max(0, Math.min(R.length - 1, SG.ri + (e.key === "ArrowDown" ? 1 : -1)));
        stageRefresh();
        $("#sres .on")?.scrollIntoView({ block: "nearest" });
        return true;
    }
    if (e.key === "Enter") {
        clearTimeout(SG.timer);
        if (R.length) stagePick(kind, SG.ri);
        else if (kind === "watch") watchSearch(box.value);
        else readSearch(box.value);
        return true;
    }
    if (e.key === "Escape") {
        if (box.value) {
            SG.ri = 0;
            if (kind === "watch") watchSearch("");
            else readSearch("");
        } else box.blur();
        return true;
    }
    return false;
}
/** the type a side searches: the page draws again, and what's typed is looked for again */
export function stageCat(kind: StageKind, v: string) {
    const q = kind === "watch" ? W.q : SG.rq;
    SG.cat[kind] = v;
    renderMain();
    if (q) {
        if (kind === "watch") watchSearch(q);
        else readSearch(q);
    }
}
/** results and what you were in the middle of as covers, or as a list */
export function stageCoversSet(on: boolean) {
    meta.settings.stageCovers = on;
    markDirty();
    renderMain();
}
/** "Continue watching" folded or open, kept */
export function stageContSet(open: boolean) {
    meta.settings.stageCont = open;
    markDirty();
}
/** Watch & read's own look (Settings › Appearance) */
export function stageThemeSet(v: string) {
    meta.settings.stageTheme = v;
    markDirty();
    stageThemeApply(true);
    cinSideRedraw();
    if (ui.page === "settings") renderMain();
}
/** sequels together as one show's seasons, or each on its own: the show open is opened again to match */
export function seasonsModeSet(v: string) {
    meta.settings.seasonsMode = v;
    meta.watchSplit = [];
    markDirty();
    if (W.show && ui.page === "watch") {
        const m = W.seasons[W.si]?.member || W.show.id,
            b = m ? entryOf(m) : null;
        if (b) watchOpen(b);
        else renderMain();
    } else renderMain();
}
