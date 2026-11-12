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
    wpSave,
} from "./watch";
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
        if (w) return null;
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
// searching: as you type, without redrawing the page (so the box keeps your cursor)
export async function watchSearch(q: string) {
    W.q = q;
    W.view = "home";
    SG.ri = 0;
    if (!q.trim()) {
        W.results = null;
        W.busy = false;
        stageRefresh();
        return;
    }
    W.busy = true;
    stageRefresh();
    const cat = SG.cat.watch,
        my = ++SG.t;
    const none: Candidate[] = [];
    const [tv, an, fl] = await Promise.all([
        cat === "all" || cat === "tv" ? tvmazeSearch(q).catch(() => none) : none,
        cat === "all" || cat === "anime" ? alSearch(q, "anime").catch(() => none) : none,
        cat === "all" || cat === "film"
            ? (TMDB_ON() ? tmdbSearch(q, "film") : filmSearchKeyless(q)).catch(() => none)
            : none,
    ]);
    if (my !== SG.t) return;
    W.results = mergeWatchResults(q, an, tv, fl); // the catalogues only: your library has no say in what a search finds
    W.busy = false;
    stageRefresh();
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
        ui.wpOpts = !ui.wpOpts;
        cinSideRedraw();
        return true;
    }
    if (act === "wp-place") {
        const p = WP(),
            v = t.dataset.v || "";
        if (key === "about") p.about = v !== "off";
        p.place = { ...p.place, [key]: v === "off" && key === "about" ? p.place.about : v };
        if (v === "off" && key !== "about") p.place[key] = "off";
        wpSave(p);
        cinSideRedraw();
        return true;
    }
    if (act === "wp-tool") {
        const p = WP(),
            i = p.tools.indexOf(key),
            j = i + Number(t.dataset.d);
        if (i < 0 || j < 0 || j >= p.tools.length) return true;
        [p.tools[i], p.tools[j]] = [p.tools[j], p.tools[i]];
        wpSave(p);
        playerRedraw();
        return true;
    }
    if (act === "wp-reset") {
        meta.settings.watchPage = {};
        markDirty();
        playerRedraw();
        return true;
    }
    if (act === "wp-spot") {
        const p = WP(),
            spot = (p.spot = { ...(p.spot || {}) });
        p.off = p.off.filter(x => x !== key);
        if (t.dataset.v === "off") p.off.push(key);
        else spot[key] = t.dataset.v || "";
        wpSave(p);
        playerRedraw();
        cinSideRedraw();
        return true;
    }
    if (act === "wp-edit") {
        ui.wpEdit = !ui.wpEdit;
        ui.wpOpts = false;
        if (W.player) W.player.opts = false;
        playerRedraw();
        return true;
    }
    if (act === "wp-look-reset") {
        const p = WP();
        delete p.look;
        wpSave(p);
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
/** something typed into Watch's or Read's search: a search a moment later (at once for a letter or two). Typing on a
 *  show's page goes back to the results */
export function stageTyped(kind: StageKind, q: string) {
    clearTimeout(SG.timer);
    if (kind === "watch") {
        W.q = q;
        if (W.view === "show") {
            W.view = "home";
            W.show = null;
            renderMain();
        }
    } else SG.rq = q;
    SG.timer = setTimeout(() => (kind === "watch" ? watchSearch(q) : readSearch(q)), q.length < 2 ? 0 : 320);
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
