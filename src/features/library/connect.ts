// src/features/library/connect.ts
// ─────────────────────────────────────────────────────────────────
//  Favourites (with characters), people, lists, franchises, compare
// ─────────────────────────────────────────────────────────────────

import {
    catOf,
    cleanTitle,
    coverCache,
    curMode,
    entryOf,
    fmtHours,
    FRANCHISE_TYPES,
    inMode,
    items,
    matchPats,
    MEDIA,
    meta,
    minutesSpent,
    norm,
    plural,
    present,
    SERIES,
    shelvesOf,
    statusWord,
    titleOf,
    ui,
    unitOf,
} from "../core/core";
import { coverSrc } from "../sources/covers";
import { all, catIdx, crowd, favPos, lenOf, mediumRank, mine, modeItems, sVar, visible } from "../core/views";
import { listInMode } from "../core/shell";
import { isTier, listCount, TIER_WHAT, tierEnt, tierWhat } from "./tiers";
import type { Shelf } from "../core/core";
import type { Entry, FavChar, FavPerson, Item, Mode, RelatedWork } from "../core/model";

const favArt = (b: Item) => b.favArtData || (b.favArt ? coverCache.src(b.favArt) : "") || coverSrc(b);
// every picture a character has: the original, links you added, pictures you uploaded
export function charGallery(c: FavChar): { u: string; k: string }[] {
    const out: { u: string; k: string }[] = [],
        seen = new Set<string>(),
        add = (u: string | undefined, k: string) => {
            if (u && !seen.has(u)) {
                seen.add(u);
                out.push({ u, k });
            }
        };
    add(c.alImage, "original");
    add(c.image, c.alImage ? "link" : "original");
    for (const u of c.images || []) add(u, "link");
    for (const u of c.uploads || []) add(u, "upload");
    if (c.imageData) add(c.imageData, "upload");
    return out;
}
export const charImg = (c: FavChar) => c.imageData || coverCache.src(c.image || c.alImage || "");
// one tile everywhere: the picture, the name on hover; "large" adds name and details underneath
// (tiles/FavTile.svelte and tiles/CharTile.svelte draw them, from these)
export const favTileLook = (b: Entry) => ({ src: favArt(b), title: titleOf(b), rk: favPos(b.id) + 1 });
// a character card is just the picture with the name along the bottom; everything else is one click away
export function charTileLook(c: FavChar) {
    const from = (c.media || [])[0];
    return {
        src: charImg(c),
        note: [
            from?.title,
            c.va && (from && ["tv", "film"].includes(from.medium || "") ? "played by " : "voiced by ") + c.va,
        ]
            .filter(Boolean)
            .join(" · "),
    };
}
export const CHAR_GROUPS = ["Female", "Male", "Non-binary", "Animal", "Other"];
export const charGroup = (c: FavChar) =>
    c.group ||
    (c.gender === "Female"
        ? "Female"
        : c.gender === "Male"
          ? "Male"
          : /non-binary/i.test(c.gender || "")
            ? "Non-binary"
            : "Other");
/** a "Covers / Large"-style switch for a layout setting: its options, and the one that's on */
const layoutSeg = (key: string, opts: [string, string][]) => ({
    key,
    opts: opts.map(([k, l]) => ({ k, l, on: meta.layout[key] === k })),
});
export type LayoutSeg = ReturnType<typeof layoutSeg>;
/** the Favourites tab (favourites/FavouritesPage.svelte): your favourites in this mode, in your order, split by the
 *  mode's shelves or together, then the characters, together or by gender, filtered by what's typed (ui.charQ).
 *  Favourites follow the mode's shelves, so they split and merge exactly like the library does */
export function favouritesView() {
    const favs = modeItems()
        .filter(b => b.fav)
        .sort((a, b) => favPos(a.id) - favPos(b.id));
    const large = meta.layout.favView === "large",
        split = meta.layout.favSplit !== "together",
        cs = meta.layout.charSplit === "group";
    const sh = shelvesOf();
    const groups: [string, Entry[]][] =
        split && sh.length > 1
            ? sh.map((s): [string, Entry[]] => [s.name, favs.filter(b => s.test(b))]).filter(g => g[1].length)
            : [["", favs]];
    const chars = charsInMode(),
        q = norm(ui.charQ || ""),
        cgroups: [string, FavChar[]][] = cs
            ? CHAR_GROUPS.map((g): [string, FavChar[]] => [g, chars.filter(c => charGroup(c) === g)]).filter(
                  x => x[1].length
              )
            : [["", chars]];
    return {
        large,
        nonum: meta.layout.favNums === false,
        segs: [
            ...(sh.length > 1
                ? [
                      layoutSeg("favSplit", [
                          ["shelf", "By shelf"],
                          ["together", "All together"],
                      ]),
                  ]
                : []),
            layoutSeg("favView", [
                ["grid", "Covers"],
                ["large", "Large"],
            ]),
        ],
        charSeg: layoutSeg("charSplit", [
            ["together", "Together"],
            ["group", "By gender"],
        ]),
        any: favs.length > 0,
        groups: groups.map(([name, list]) => ({
            name,
            tiles: list.map(b => ({
                b,
                ...favTileLook(b),
                hint:
                    [b.kind || MEDIA[b.medium].one, b.year].filter(Boolean).join(" · ") +
                    (b.rating ? " · " + b.rating : ""),
                why: b.favWhy ? b.favWhy.slice(0, 160) : "",
            })),
        })),
        chars: chars.length,
        cgroups: cgroups.map(([g, list]) => ({
            g,
            shown: list.filter(
                c =>
                    !q ||
                    norm(c.name + " " + (c.va || "") + " " + (c.media || []).map(m => m.title).join(" ")).includes(q)
            ),
        })),
    };
}

// ── characters: one master list; each mode shows the ones from its media ──
export function charInMode(c: FavChar, mode: Mode = curMode()) {
    if (mode.id === "universal" || (mode.match || []).includes("*")) return true;
    return (c.media || []).some(x => {
        const it = x.id && items.get(x.id);
        return it ? inMode(it, mode) : x.medium ? matchPats({ medium: x.medium, kind: "" }, mode.match || []) : false;
    });
}
export const charsInMode = () =>
    ui.private ? [] : meta.chars.filter(c => charInMode(c)).sort((a, b) => (a.rank || 999) - (b.rank || 999));

// ── people: one record per person, any number of roles across any media ──
export const ROLE_LIST = [
    "Author",
    "Mangaka",
    "Artist",
    "Illustrator",
    "Writer",
    "Screenwriter",
    "Director",
    "Producer",
    "Showrunner",
    "Creator",
    "Actor",
    "Actress",
    "Voice actor",
    "Composer",
    "Studio",
    "Developer",
    "Publisher",
    "Network",
    "Original creator",
];
const ROLE_BY_MEDIUM: Record<string, string> = {
    book: "Author",
    novel: "Author",
    manga: "Author",
    manhwa: "Author",
    comic: "Writer",
    anime: "Studio",
    tv: "Creator",
    film: "Director",
    game: "Developer",
    album: "Artist",
};
const roleFor = (b: Item) => ROLE_BY_MEDIUM[b.medium] || "Creator";
export const splitNames = (s: unknown) =>
    String(s || "")
        .split(/\s*(?:&|,|;|\/|\band\b)\s*/)
        .map(x => x.trim())
        .filter(x => x.length > 1 && x.length < 60);
/** a person as peopleIndex gathers them, before their roles become a list */
interface PersonDraft {
    key: string;
    name: string;
    roles: Set<string>;
    credits: { id: string; role: string }[];
    saved: FavPerson | null;
}
/** a person across your library: their roles, and what they're credited on */
export interface PersonEntry extends Omit<PersonDraft, "roles"> {
    roles: string[];
    n: number;
}
export function peopleIndex(mode: Mode = curMode()): PersonEntry[] {
    const map = new Map<string, PersonDraft>(),
        key = (n: string) => norm(n);
    const get = (name: string) => {
        const k = key(name);
        let p = map.get(k);
        if (!p) {
            p = { key: k, name, roles: new Set(), credits: [], saved: null };
            map.set(k, p);
        }
        return p;
    };
    for (const b of modeItems(mode)) {
        for (const n of splitNames(b.creator)) {
            const p = get(n);
            const r = roleFor(b);
            p.roles.add(r);
            p.credits.push({ id: b.id, role: r });
        }
        for (const n of b.staff || []) {
            const p = get(n);
            p.roles.add("Original creator");
            p.credits.push({ id: b.id, role: "Original creator" });
        }
    }
    for (const s of meta.people || []) {
        const credits = (s.credits || []).filter(c => {
            const b = items.get(c.id);
            return !!b && inMode(b, mode);
        });
        const derived = map.get(key(s.name));
        if (!derived && !credits.length && !(mode.id === "universal" || (mode.match || []).includes("*"))) continue;
        const p = get(s.name);
        p.saved = s;
        for (const r of s.roles || (s.role ? [s.role] : [])) p.roles.add(r);
        for (const c of credits) if (!p.credits.some(x => x.id === c.id && x.role === c.role)) p.credits.push(c);
    }
    return [...map.values()]
        .map(p => ({ ...p, roles: [...p.roles], n: new Set(p.credits.map(c => c.id)).size }))
        .sort((a, b) => Number(!!b.saved?.fav) - Number(!!a.saved?.fav) || b.n - a.n || a.name.localeCompare(b.name));
}
/** the People view in Stats (connections/People.svelte): everyone, by role, filtered by what's typed (ui.peopleQ),
 *  with only the people with more than one credit unless you ask for everyone (ui.peopleAll); the first 300 */
export function peopleView() {
    const P = peopleIndex(),
        role = ui.peopleRole || "",
        q = norm(ui.peopleQ || "");
    const roles: Record<string, number> = {};
    for (const p of P) for (const r of p.roles) roles[r] = (roles[r] || 0) + 1;
    const shown = P.filter(
        p =>
            (!role || p.roles.includes(role)) &&
            (!q || norm(p.name).includes(q)) &&
            (ui.peopleAll || p.n > 1 || (p.saved && p.saved.fav))
    );
    return {
        seg: layoutSeg("peopleView", [
            ["grid", "Grid"],
            ["list", "List"],
        ]),
        view: meta.layout.peopleView || "grid",
        role,
        all: !!ui.peopleAll,
        roles: Object.entries(roles).sort((a, b) => b[1] - a[1]),
        people: shown.slice(0, 300).map(p => {
            const ids = [...new Set(p.credits.map(c => c.id))];
            return {
                name: p.name,
                img: p.saved?.imageData || p.saved?.image || "",
                title: (p.saved && p.saved.fav ? "♥ " : "") + p.name,
                roles: p.roles.join(" · "),
                covers: ids
                    .slice(0, 6)
                    .map(id => entryOf(id))
                    .filter(present),
                more: p.n > 6 ? p.n - 6 : 0,
            };
        }),
    };
}

// ── lists: Up next, custom and ordered lists (reading orders), and the private vault ──
/** a list's card: a ranking shows its first five pictures, a tier list its tiers, any other list its first covers.
 *  ListCard.svelte draws the same card for the pages Svelte draws */
export function listCardLook(id: string, name: string, desc: string | undefined, ids: string[], icon: string) {
    const l = meta.lists.find(x => x.id === id);
    if (l && l.kind === "tier" && l.layout === "rank")
        return {
            kind: "rank" as const,
            id,
            pics: (l.rows?.[0]?.ids || [])
                .slice(0, 5)
                .map(k => tierEnt(l, k))
                .filter(present)
                .map(e => e.image || ""),
            title: `№ ${name}`,
            note: `Ranked ${TIER_WHAT[tierWhat(l)].toLowerCase()} · ${listCount(l)}`,
        };
    if (l && l.kind === "tier")
        return {
            kind: "tier" as const,
            id,
            tiers: (l.rows || []).map(r => ({
                label: r.label,
                style: `background:${r.color};flex:${Math.max(1, r.ids.length)}`,
            })),
            title: `▤ ${name}`,
            note: `Tier list · ${TIER_WHAT[tierWhat(l)].toLowerCase()} · ${listCount(l)} placed`,
        };
    return {
        kind: "list" as const,
        id,
        covers: ids
            .slice(0, 4)
            .map(x => items.get(x))
            .filter(present),
        title: `${icon} ${name}`,
        note: `${ids.filter(x => items.has(x)).length} entries${desc ? " · " + desc.slice(0, 60) : ""}`,
    };
}
/** the Lists tab's index (lists/ListsPage.svelte): Up next (outside the private collection), then your lists in
 *  this mode */
export function listsView() {
    return {
        queue: ui.private
            ? null
            : listCardLook(
                  "queue",
                  "Up next",
                  "Your queue across everything",
                  meta.queue.filter(id => {
                      const b = items.get(id);
                      return !!b && visible(b) && inMode(b);
                  }),
                  "⧗"
              ),
        lists: meta.lists
            .filter(l => listInMode(l) && !l.private === !ui.private)
            .map(l => listCardLook(l.id, l.name, l.desc, l.ids, l.numbered ? "№" : "≡")),
    };
}
/** one list open in the Lists tab (lists/ListView.svelte), or Up next (queue): its name and what it's for, whether
 *  it's numbered, its notes, and its entries you can see, in order, each with what it is */
export interface ListLook {
    queue: boolean;
    id: string;
    name: string;
    desc: string;
    numbered: boolean;
    notes: Record<string, string>;
    rows: { b: Entry; title: string; line: string }[];
}
/** the list open in the Lists tab, or Up next. null when there's no such list (or a tier list, which
 *  tiers/TierListPage.svelte draws) */
export function listView(id: string): ListLook | null {
    const row = (it: Item, id: string) => {
        const b = { ...it, id };
        return {
            b,
            title: titleOf(b),
            line:
                [b.kind || MEDIA[b.medium].one, b.year, b.creator].filter(Boolean).join(" · ") +
                " · " +
                statusWord(b.status, b.medium),
        };
    };
    if (id === "queue")
        return {
            queue: true,
            id,
            name: "Up next",
            desc: "",
            numbered: true,
            notes: {},
            rows: meta.queue.flatMap(x => {
                const b = items.get(x);
                return b && visible(b) && inMode(b) ? [row(b, x)] : [];
            }),
        };
    const l = meta.lists.find(x => x.id === id);
    if (!l || isTier(l)) return null;
    return {
        queue: false,
        id: l.id,
        name: l.name,
        desc: l.desc || "",
        numbered: !!l.numbered,
        notes: { ...(l.notes || {}) },
        rows: l.ids.flatMap(x => {
            const b = items.get(x);
            return b && visible(b) ? [row(b, x)] : [];
        }),
    };
}

// ── franchises ──
/** a franchise: everything linked to everything else, or sharing a franchise name */
export interface Franchise {
    key: string;
    name: string;
    members: Entry[];
    media: string[];
    done: number;
}
export function franchises(): Franchise[] {
    const parent = new Map<string, string>(),
        find = (x: string) => {
            let up = parent.get(x);
            while (up !== undefined && up !== x) {
                const top = parent.get(up) ?? up;
                parent.set(x, top);
                x = top;
                up = parent.get(x);
            }
            return x;
        },
        uni = (a: string, b: string) => {
            parent.set(find(a), find(b));
        };
    for (const id of items.keys()) parent.set(id, id);
    const byName = new Map<string, string>();
    for (const [id, b] of items) {
        if (!visible(b)) continue;
        for (const l of b.links || []) if (FRANCHISE_TYPES.has(l.type) && items.has(l.id)) uni(id, l.id);
        if (b.franchise) {
            const k = norm(b.franchise),
                was = byName.get(k);
            if (was !== undefined) uni(id, was);
            else byName.set(k, id);
        }
    }
    const groups = new Map<string, string[]>();
    for (const [id, b] of items) {
        if (!visible(b)) continue;
        const r = find(id),
            g = groups.get(r);
        if (g) g.push(id);
        else groups.set(r, [id]);
    }
    return [...groups.values()]
        .filter(g => g.length > 1)
        .map(ids => {
            const members = ids
                .map(id => entryOf(id))
                .filter(present)
                .sort((a, b) => (a.year || 9999) - (b.year || 9999) || mediumRank(a.medium) - mediumRank(b.medium));
            const named = members.find(b => b.franchise);
            return {
                key: ids.slice().sort()[0],
                name: named?.franchise || cleanTitle(titleOf(members[0])),
                members,
                media: [...new Set(members.map(b => b.medium))],
                done: members.filter(b => b.status === "done").length,
            };
        })
        .filter(f => f.members.some(b => inMode(b)))
        .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
}
/** a franchise's card (connections/Franchises.svelte) */
const franchiseCard = (f: Franchise) => ({
    key: f.key,
    name: f.name,
    covers: f.members.slice(0, 4),
    media: f.media.map(m => MEDIA[m].name).join(" · "),
    count: `${f.members.length} entries · ${f.done} finished`,
    pct: Math.round((f.done / f.members.length) * 100),
});
/** Stats › Franchises: the franchises in this mode across media and within one, or the one that's open (ui.franchise,
 *  its key or any of its entries) */
export function franchisesView() {
    const F = franchises();
    if (ui.franchise) {
        const f = F.find(x => x.key === ui.franchise || x.members.some(m => m.id === ui.franchise));
        if (f) return { open: franchiseView(f), any: true, cross: [], within: [] };
        ui.franchise = null;
    }
    return {
        open: null,
        any: F.length > 0,
        cross: F.filter(f => f.media.length > 1).map(franchiseCard),
        within: F.filter(f => f.media.length === 1).map(franchiseCard),
    };
}
/** one franchise, in release order, with the parts AniList knows of that aren't in your library */
function franchiseView(f: Franchise) {
    const inLib = new Set(f.members.map(b => b.ext && b.ext.anilist).filter(Boolean)),
        missing = new Map<number, RelatedWork>();
    for (const b of f.members)
        for (const r of b.rel || [])
            if (FRANCHISE_TYPES.has(r.type || "") && !inLib.has(r.id) && !missing.has(r.id)) missing.set(r.id, r);
    return {
        key: f.key,
        name: f.name,
        about: `${f.members.length} entries across ${f.media.map(m => MEDIA[m].name.toLowerCase()).join(", ")} · ${f.done} finished · in release order`,
        members: f.members.map(b => ({
            b,
            year: String(b.year || "—"),
            node: `background:${sVar(b.medium)}`,
            kind: b.kind || MEDIA[b.medium].one,
            title: titleOf(b),
        })),
        src: f.members[0].id,
        missing: [...missing.values()]
            .sort((a, b) => (a.year || 9999) - (b.year || 9999))
            .map(r => ({
                id: r.id,
                cover: r.cover || "",
                code: (MEDIA[r.medium] || MEDIA.book).code,
                title: r.title,
                hint: `${r.label} · ${r.kind}${r.year ? " · " + r.year : ""}`,
            })),
    };
}
// ── compare ──
/** Stats › Compare (connections/Compare.svelte): your scores against the crowd's (a scatter, and the biggest gaps
 *  either way), the mode's shelves side by side, its genres across its shelves, and any two things side by side */
export function compareView() {
    const A = modeItems(),
        rated = A.filter(b => b.rating && crowd(b).avg != null);
    const W = 640,
        H = 360,
        P = 36,
        lo = 30,
        sx = (v: number) => P + ((Math.max(lo, v) - lo) / (100 - lo)) * (W - P - 10),
        sy = (v: number) => H - P - ((Math.max(lo, v) - lo) / (100 - lo)) * (H - P - 10);
    const scatter = {
        W,
        H,
        P,
        ticks: [40, 60, 80, 100].map(t => ({ t, x: sx(t), y: sy(t) })),
        diag: { x1: sx(lo), y1: sy(lo), x2: sx(100), y2: sy(100) },
        dots: rated.map(b => {
            // every one of these has your score and a crowd score (rated, above)
            const c = crowd(b).avg ?? 0,
                m = mine(b) ?? 0;
            return {
                id: b.id,
                x: sx(c),
                y: sy(m),
                fill: `var(--s${catIdx(b) + 1})`,
                title: `${titleOf(b)}: you ${b.rating}/10, crowd ${c}/100`,
            };
        }),
    };
    const delta = rated
        .map(b => {
            const c = crowd(b).avg ?? 0,
                d = (mine(b) ?? 0) - c;
            return {
                b,
                title: titleOf(b),
                you: `you ${b.rating}`,
                crowd: `crowd ${c}`,
                d,
                gap: `${d >= 0 ? "+" : "−"}${Math.abs(Math.round(d))}`,
            };
        })
        .sort((a, b) => b.d - a.d);
    const sh = shelvesOf();
    const mrows = sh
        .map(s => {
            const L = A.filter(b => s.test(b)),
                r = L.filter(b => b.rating),
                c = L.map(b => crowd(b).avg).filter(present),
                mean = r.length ? r.reduce((a, b) => a + (b.rating || 0), 0) / r.length : null,
                cr = c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
            return {
                name: s.name,
                n: L.length,
                fin: L.filter(b => b.status === "done").length,
                mean: mean ? mean.toFixed(1) + " / 10" : "–",
                crowd: cr ? Math.round(cr) + " / 100" : "–",
                time: fmtHours(L.reduce((a, b) => a + minutesSpent(b), 0)),
            };
        })
        .filter(r => r.n);
    const gcount: Record<string, number> = {};
    for (const b of A) for (const g of b.genres || []) gcount[g] = (gcount[g] || 0) + 1;
    const topG = Object.entries(gcount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(x => x[0]);
    const cell = (g: string, s: Shelf) => {
        const L = A.filter(b => s.test(b) && (b.genres || []).includes(g));
        const r = L.filter(b => b.rating);
        const mean = r.length ? r.reduce((a, b) => a + (b.rating || 0), 0) / r.length : null;
        return {
            style: mean
                ? `background:color-mix(in srgb,var(--accent) ${Math.round((Math.max(0, mean - 4) / 6) * 70)}%,transparent)`
                : "",
            title: `${g} · ${s.name}: ${L.length} items${mean ? ", your mean " + mean.toFixed(1) : ""}`,
            n: L.length,
            mean: mean ? mean.toFixed(1) : "",
        };
    };
    const pa = ui.cmpA ? entryOf(ui.cmpA) : null,
        pb = ui.cmpB ? entryOf(ui.cmpB) : null,
        shown = SERIES.map(s => rated.some(b => catOf(b) === s[0])),
        pick = (x: Entry | null) => (x ? titleOf(x) + " · " + MEDIA[x.medium].one : "");
    return {
        rated: rated.length,
        legend: shown.filter(Boolean).length > 1 ? shown : null,
        scatter,
        more: delta.filter(x => x.d > 0).slice(0, 8),
        less: delta
            .filter(x => x.d < 0)
            .slice(-8)
            .reverse(),
        shelves: mrows.length > 1 ? mrows : [],
        heat:
            topG.length && sh.length > 1
                ? { shelves: sh.map(s => s.name), rows: topG.map(g => ({ g, cells: sh.map(s => cell(g, s)) })) }
                : null,
        opts: all()
            .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
            .map(b => `${titleOf(b)} · ${MEDIA[b.medium].one}`),
        a: pick(pa),
        b: pick(pb),
        sbs: pa && pb ? sideBySide(pa, pb) : null,
    };
}
/** two things side by side: what each is, its scores, its length and your time, its status and genres */
function sideBySide(a: Entry, b: Entry) {
    const rows: [string, (x: Entry) => string | number][] = [
        ["Type", x => x.kind || MEDIA[x.medium].one],
        ["Year", x => x.year || "–"],
        ["Creator", x => x.creator || "–"],
        ["Your score", x => (x.rating ? x.rating + " / 10" : "–")],
        [
            "Crowd",
            x =>
                crowd(x).avg != null
                    ? crowd(x).avg +
                      " / 100 (" +
                      crowd(x)
                          .parts.map(p => p.label + " " + p.show)
                          .join(", ") +
                      ")"
                    : "–",
        ],
        [
            "Length",
            x => (x.medium === "film" ? (x.runtime || "?") + " min" : x.total ? x.total + " " + unitOf(x)[1] : "–"),
        ],
        ["Time it takes", x => fmtHours(lenOf(x))],
        ["Your time so far", x => fmtHours(minutesSpent(x))],
        ["Status", x => statusWord(x.status, x.medium)],
        ["Genres", x => (x.genres || []).join(", ") || "–"],
        ["Ranking", x => (x.elo ? x.elo + " (" + plural(x.h2h || 0, "pick") + ")" : "–")],
        ["Your notes", x => x.why || x.notes || x.favWhy || "–"],
    ];
    const shared = (a.genres || []).filter(g => (b.genres || []).includes(g));
    return {
        pair: [a, b].map(x => ({ b: x, title: titleOf(x) })),
        rows: rows.map(([l, f]) => ({ l, a: String(f(a)), b: String(f(b)) })),
        shared: shared.join(", "),
    };
}
