// src/features/library/library.ts
// ─────────────────────────────────────────────────────────────────
//  Library: four views (Cover, Grid, Spine, List), one detailed filter, size and spacing always to hand
//
//  What the library page shows, worked out here; the page itself is Svelte (page/LibraryPage.svelte and the parts
//  beside it), and the tiles it's made of are in tiles/. This file also keeps listOrder: the entries in the order the
//  page shows them, which select all, Shift-click ranges and the item card's ← and → follow.
// ─────────────────────────────────────────────────────────────────

import {
    curMode,
    inMode,
    meta,
    modeById,
    norm,
    parseScore,
    shelvesOf,
    SORT_OLD,
    STATUS,
    STATUS_WORDS,
    scoreMax,
    type Shelf,
    toList,
    ui,
} from "../core/core";
import {
    all,
    buildCallNumbers,
    curGroup,
    curSort,
    curView,
    groupKey,
    groupWord,
    isUniversal,
    modeItems,
    sortBy,
    viewOpts,
} from "../core/views";
import { kindShown, rulesOk } from "../core/types";
import type { Entry, Filter, Item, Mode, Status } from "../core/model";

/** the ways the library page can show your entries */
export type ViewKey = "cover" | "grid" | "spine" | "list";
export const VIEW_LIST: [key: ViewKey, name: string, about: string][] = [
    ["cover", "Cover", "Covers only, edge to edge"],
    ["grid", "Grid", "Covers with title and details underneath"],
    ["spine", "Spine", "Spines on a shelf, sized like the real thing"],
    ["list", "List", "A sortable table"],
];

// ── the filter: every condition in one panel; status stays as chips above the shelf ──
// the season something first aired in (anime), as one word
const SEASON_WORDS: Record<string, string> = {
    WINTER: "Winter",
    SPRING: "Spring",
    SUMMER: "Summer",
    FALL: "Autumn",
    AUTUMN: "Autumn",
};
export const seasonWord = (b: Item) => SEASON_WORDS[String(b.season || "").toUpperCase()] || "";
export const FILT_EMPTY = (): Filter => ({
    kinds: [],
    genres: [],
    themes: [],
    tags: [],
    modes: [],
    seasons: [],
    own: "",
    smin: "",
    smax: "",
    ymin: "",
    ymax: "",
    fav: false,
    unscored: false,
    started: "",
    rules: [],
    any: false,
});
// the filter's chip lists, and its typed-in values
const FILT_LISTS = ["kinds", "genres", "themes", "tags", "modes", "seasons"] as const;
export type FiltList = (typeof FILT_LISTS)[number];
/** a filter's chip list (a button's data-f says which) */
export const isFiltList = (k: unknown): k is FiltList => FILT_LISTS.some(x => x === k);
const FILT_VALUES = ["own", "smin", "smax", "ymin", "ymax", "started"] as const;
/** how many conditions the filter sets */
export function filterCount(f: Partial<Filter> = ui.filt || {}) {
    return (
        (f.rules || []).filter(r => r.v !== "" && r.v != null).length +
        FILT_LISTS.reduce((a, k) => a + ((f[k] || []).length ? 1 : 0), 0) +
        FILT_VALUES.filter(k => f[k] !== "" && f[k] != null).length +
        (f.fav ? 1 : 0) +
        (f.unscored ? 1 : 0)
    );
}
function filterOk(b: Entry, f: Partial<Filter> | null | undefined) {
    if (!f) return true;
    if (f.kinds?.length && !f.kinds.includes(kindShown(b))) return false;
    if (f.themes?.length && !f.themes.some(g => (b.themes || []).includes(g))) return false;
    if (f.seasons?.length && !f.seasons.includes(seasonWord(b))) return false;
    if (f.rules?.length && !rulesOk(b, f)) return false;
    if (f.genres?.length && !f.genres.some(g => (b.genres || []).includes(g))) return false;
    if (f.tags?.length && !f.tags.some(t => (b.tags || []).includes(t))) return false;
    if (f.modes?.length && !f.modes.some(mid => inMode(b, modeById(mid)))) return false;
    if (f.own) {
        const c = b.copy || "none";
        if (
            f.own === "owned"
                ? c === "none"
                : f.own === "buy"
                  ? !b.toBuy
                  : f.own === "physical"
                    ? !["physical", "both"].includes(c)
                    : f.own === "digital"
                      ? !["digital", "both"].includes(c)
                      : c !== f.own
        )
            return false;
    }
    const n = (v: string | undefined) => (v === "" || v == null ? null : Number(v));
    const ymin = n(f.ymin),
        ymax = n(f.ymax);
    if (n(f.smin) != null && (b.rating || 0) < parseScore(f.smin)) return false;
    if (n(f.smax) != null && (!b.rating || b.rating > parseScore(f.smax))) return false;
    if (ymin != null && (!b.year || b.year < ymin)) return false;
    if (ymax != null && (!b.year || b.year > ymax)) return false;
    if (f.fav && !b.fav) return false;
    if (f.unscored && b.rating) return false;
    if (f.started === "yes" && !(b.prog > 0)) return false;
    if (f.started === "no" && b.prog > 0) return false;
    return true;
}
export function libraryList(): Entry[] {
    const q = norm(ui.q),
        shelf = ui.shelfKey ? shelvesOf().find(s => s.key === ui.shelfKey) : null,
        f = ui.filt;
    return (ui.q && ui.searchAll ? all() : modeItems()).filter(
        b =>
            (!shelf || shelf.test(b)) &&
            (ui.status === "all" || b.status === ui.status) &&
            filterOk(b, f) &&
            (!q ||
                [
                    b.title,
                    b.alt && b.alt.en,
                    b.alt && b.alt.romaji,
                    b.alt && b.alt.native,
                    b.creator,
                    b.subject,
                    b.kind,
                    b.series,
                    b.notes,
                    (b.genres || []).join(" "),
                    (b.tags || []).join(" "),
                ].some(v => norm(v).includes(q)))
    );
}
/** the filter panel's chips: each value in what's on the shelf, most common first, with how many have it */
export function filterChoices(base: Entry[]) {
    const cnt = (key: (b: Entry) => string | string[] | undefined) => {
        const c: Record<string, number> = {};
        for (const b of base) for (const x of toList(key(b) || [])) if (x) c[x] = (c[x] || 0) + 1;
        return Object.entries(c).sort((a, b) => b[1] - a[1]);
    };
    const ORDER = ["Winter", "Spring", "Summer", "Autumn"];
    const stc: Record<string, number> = {};
    for (const b of base) stc[b.status] = (stc[b.status] || 0) + 1;
    return {
        status: statusChips(stc, base.length),
        seasons: cnt(b => seasonWord(b)).sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])),
        kinds: cnt(b => kindShown(b)),
        genres: cnt(b => b.genres),
        themes: cnt(b => b.themes),
        tags: cnt(b => b.tags),
        /** the top of the score range, and the step a score is typed in */
        scoreTop: scoreMax(),
        step: meta.settings.ratingScale === "10d" ? ".1" : meta.settings.ratingScale === "5" ? ".5" : "1",
    };
}
// the status chips: everything, then each status there's something in (or the one shown)
function statusChips(counts: Record<string, number>, total: number): [key: string, name: string, n: number][] {
    const words: Record<Status, string> = STATUS_WORDS[groupWord()];
    return [
        ["all", "Everything", total],
        ...STATUS.filter(s => counts[s] || ui.status === s).map((s): [string, string, number] => [
            s,
            words[s],
            counts[s] || 0,
        ]),
    ];
}

// ── the page ──
// the ids on the library page, in the order shown (select all, shift-click ranges, next and previous)
export let listOrder: string[] = [];
/** a group of entries on the library page, under its plaque */
export interface LibGroup {
    k: string;
    label: string;
    rank: number;
    items: Entry[];
    /** how this group is sorted: its own sort, or the page's */
    sort: string;
}
/** everything the library page shows, worked out from where you are (ui) and the mode */
export interface LibraryView {
    mode: Mode;
    /** everything in the mode, and the shelves it has */
    all: Entry[];
    shelves: { s: Shelf; n: number }[];
    view: string;
    group: string;
    sort: string;
    vo: ReturnType<typeof viewOpts>;
    /** what the filter starts from: the mode, or the shelf you're on */
    base: Entry[];
    /** what passes the filters, and the same in groups */
    list: Entry[];
    groups: LibGroup[];
    filters: number;
}
export function libraryView(): LibraryView {
    buildCallNumbers(); // the Shelf sort needs them for what's just been added (the page can redraw without renderMain)
    const mode = curMode(),
        M = modeItems(),
        sh = shelvesOf(mode),
        shelf = sh.find(s => s.key === ui.shelfKey);
    const view = curView(),
        g = curGroup(),
        so = curSort(),
        vo = viewOpts();
    // arranging only works on the orders you control
    if (
        ui.arrange &&
        !["shelf", "rank"].includes(so) &&
        !Object.values(mode.gsort || {}).some(x => ["shelf", "rank"].includes(SORT_OLD[x] || x))
    )
        ui.arrange = false;
    const list = libraryList();
    const base = shelf ? M.filter(b => shelf.test(b)) : M;
    const groups: LibGroup[] = [],
        idx = new Map<string, LibGroup>();
    for (const b of list) {
        const [k, label, rank] = groupKey(b, g);
        let gr = idx.get(k);
        if (!gr) {
            gr = { k, label, rank, items: [], sort: so };
            idx.set(k, gr);
            groups.push(gr);
        }
        gr.items.push(b);
    }
    if (g === "status" || g === "type" || (g === "kind" && Array.isArray(mode.shelves)))
        groups.sort((a, b) => a.rank - b.rank);
    else if (g !== "none") groups.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
    const gs = mode.gsort || {};
    for (const gr of groups) {
        const own = gs[g + ":" + gr.k] || "";
        gr.sort = SORT_OLD[own] || own || so;
        gr.items.sort(sortBy(gr.sort));
    }
    listOrder = groups.flatMap(gr => gr.items.map(b => b.id));
    return {
        mode,
        all: M,
        shelves:
            !isUniversal() && sh.length > 1
                ? sh
                      .map(s => ({ s, n: M.filter(b => s.test(b)).length }))
                      .filter(({ s, n }) => n || ui.shelfKey === s.key)
                : [],
        view,
        group: g,
        sort: so,
        vo,
        base,
        list,
        groups,
        filters: filterCount(),
    };
}
