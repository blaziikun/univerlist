// src/features/import-export/packs.ts
// ─────────────────────────────────────────────────────────────────
//  Packs: one place for each kind of thing, the same in a .zip, a library folder, or a hosted copy
//
//  profile-export_<name>_<date>.zip (the app, index.html, is separate):
//    manifest.json            what's inside, when it was saved
//    data/library/<medium>.json   everything you've added, one file per medium
//    data/favourites.json     favourites order, characters, people
//    data/lists.json          Up next and your lists
//    data/preferences.json    settings, layout, modes (views, sorts, zoom, shelves), saved views, tags, shelf
//    arrangements, rankings
//    data/themes.json         the theme library
//    data/profile.json        name, pictures, banners, bios
//    data/private.json        the private collection, still encrypted (only if you include it)
//    lists/*.csv              readable copies of your lists
//    taste/taste-profile.md   your taste, summarised
//    images/                  every picture + index.json mapping web address → file
//
//  Bringing parts in (applyParts) is where a file, a folder, a hosted copy or the cloud copy meets your library, so
//  every part is checked there before any of it is used: what isn't the shape the app keeps is left out, a setting of
//  the wrong kind is dropped, and nothing is changed until all of it has been read.
// ─────────────────────────────────────────────────────────────────

import {
    $,
    APP_V,
    asField,
    change,
    clone,
    curMode,
    DEFAULT_LAYOUT,
    DEFAULT_MODES,
    DEFAULT_SETTINGS,
    errMessage,
    errName,
    fieldsOf,
    history,
    idbDel,
    idbGet,
    idbPut,
    isRecord,
    items,
    KEYS,
    listOf,
    markDirty,
    MEDIA,
    meta,
    migrateItem,
    migratePaths,
    migrateV10,
    migrateV5,
    migrateV6,
    migrateV7,
    migrateV8,
    migrateV9,
    modeById,
    numOf,
    nowISO,
    recordsOf,
    safeJSON,
    saveKeys,
    snapshot,
    storage,
    strsOf,
    textOf,
    titleOf,
    toast,
    toList,
    today,
    ui,
    vault,
    vaultLock,
} from "../core/core";
import { applyTheme } from "../core/theme";
import { crowd, favPos, lenOf, modeItems } from "../core/views";
import { renderSideStatus } from "../core/shell";
import { splitNames } from "../library/connect";
import { bundleImages, restoreImages, txt, unzip } from "./importers";
import type { ZipFiles } from "./importers";
import { isV2, keysDecrypt, partsFromV2, v2Files } from "./export-zip";
import { ACS, lcConvertOld } from "../learning-centre/learning";
import { lcMergeCurricula } from "../learning-centre/learning-curricula";
import { lcStripPersonal } from "../learning-centre/learning-hub";
import { extFromParts, extRestore, extRestoreSecrets, extSecrets } from "../extensions/extensions";
import type { ExtRecord } from "../extensions/extensions";
import { render } from "../core/navigation";
import { sweepSealed } from "../core/actions";
import { myBackdrops } from "../backdrops/backdrop";
import type {
    Entry,
    FavChar,
    FavPerson,
    Item,
    Layout,
    List,
    Meta,
    Mode,
    OldTier,
    SavedView,
    Settings,
    Theme,
    VaultBox,
} from "../core/model";

/** the parts of an export: key, name, what it holds */
export const PARTS: [key: string, name: string, desc: string][] = [
    ["library", "Library", "Everything you've added, with scores, notes, dates and progress"],
    ["favourites", "Favourites & characters", "Favourites order, characters and people"],
    ["lists", "Lists", "Up next and every list, with notes"],
    ["academic", "Learning Centre", "Your subjects and paths: stages, modules and reading lists"],
    [
        "preferences",
        "Preferences",
        "Settings, layout, modes with their views, sorts, zoom and shelves, saved views, tags and shelf arrangements",
    ],
    ["themes", "Themes", "The theme library"],
    ["profile", "Profile", "Name, pictures, banners and bios"],
    ["private", "Private collection", "Still encrypted; needs your passphrase"],
    ["keys", "Keys and server addresses", "TMDB, OMDb, RAWG, IGDB, and the keys for your media and reading servers"],
    ["images", "Pictures", "Covers, banners and character pictures for offline use"],
    ["extensions", "Extensions", "Extensions you installed, with their settings"],
    ["privext", "Private extensions", "Encrypted with your backup passphrase"],
];
const PREF_KEYS = [
    "settings",
    "layout",
    "modes",
    "views",
    "tags",
    "orders",
    "myOrder",
    "dismissed",
    "interests",
    "tiers",
] as const;
/** the parts as read from a file, a folder, a hosted copy or the cloud: each one still to be checked */
export type Parts = Record<string, unknown>;
/** a bundle read back: its parts, when it was saved, and the app version and export format it was made with */
export interface Bundle {
    parts: Parts;
    savedAt?: string;
    v?: number;
    format?: number;
}
/** your library as parts, the way an export keeps them */
export type PackedParts = {
    library: Record<string, Record<string, Item>>;
    favourites: { favOrder: string[]; chars: FavChar[]; people: FavPerson[] };
    lists: { queue: string[]; lists: List[] };
    academic: unknown;
    preferences: Record<string, unknown>;
    themes: Meta["themes"];
    profile: Meta["profile"];
    private: { vault: VaultBox; lists: List[] } | null;
};
export function packParts(): PackedParts {
    const s = snapshot(),
        m = s.meta,
        library: Record<string, Record<string, Item>> = {};
    for (const [id, b] of Object.entries(s.items)) (library[b.medium] = library[b.medium] || {})[id] = b;
    const settings: Partial<Settings> = { ...m.settings };
    delete settings.fileName;
    return {
        library,
        favourites: { favOrder: m.favOrder, chars: m.chars, people: m.people },
        lists: { queue: m.queue, lists: (m.lists || []).filter(l => !l.private) },
        academic: m.courses ? lcStripPersonal(m.courses) : { programmes: [] },
        preferences: Object.fromEntries(PREF_KEYS.map(k => [k, k === "settings" ? settings : m[k]])),
        themes: m.themes,
        profile: m.profile,
        private: m.vault ? { vault: m.vault, lists: (m.lists || []).filter(l => l.private) } : null,
    };
}
/** your keys, and extensions' secrets, as they go into a backup. Keys go into backups as their own file, so a backup
 * restores everything, while the app file itself never holds one */
export function keysForBackup(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(KEYS)) if (k === "libs" ? v && Object.keys(v).length : v) out[k] = v;
    // extensions' secret settings (an API key, a companion password) are sealed with yours (extensions.ts extSecrets)
    const ext = extSecrets();
    if (Object.keys(ext).length) out.__ext = ext;
    return out;
}
function restoreKeys(k: unknown, rep: boolean): number {
    if (!isRecord(k)) return 0;
    let n = 0;
    for (const [name, v] of Object.entries(k)) {
        if (name === "__ext") continue; // extensions' secrets: put back once the extensions are in (applyParts)
        if (name === "libs") {
            const libs = stringsOf(v);
            KEYS.libs = rep ? { ...(KEYS.libs || {}), ...libs } : { ...libs, ...(KEYS.libs || {}) };
            n += Object.keys(libs).length;
        } else if (typeof v === "string" && v && (rep || !KEYS[name])) {
            KEYS[name] = v;
            n++;
        }
    }
    saveKeys();
    return n;
}
/** read a bundle (zip, folder or hosted copy) given a map of path → bytes */
export function partsFromFiles(files: ZipFiles): Bundle {
    if (isV2(files)) return partsFromV2(files);
    const get = (n: string): unknown => {
        const k = [...files.keys()].find(x => x === n || x.endsWith("/" + n));
        return k ? safeJSON(txt(files.get(k))) : null;
    };
    const parts: Parts = {};
    const libKeys = [...files.keys()].filter(k => /(^|\/)data\/library\/[^/]+\.json$/.test(k));
    if (libKeys.length) {
        const library: Record<string, unknown> = {};
        for (const k of libKeys) Object.assign(library, fieldsOf(safeJSON(txt(files.get(k)))));
        parts.library = library;
    }
    for (const [k, f] of [
        ["favourites", "data/favourites.json"],
        ["lists", "data/lists.json"],
        ["academic", "data/academic.json"],
        ["preferences", "data/preferences.json"],
        ["themes", "data/themes.json"],
        ["profile", "data/profile.json"],
        ["private", "data/private.json"],
        ["keys", "data/keys.json"],
    ]) {
        const v = get(f);
        if (v) parts[k] = v;
    }
    // older backups: one snapshot file
    const legacy = [...files.keys()].find(n => /(^|\/)univerlist-backup\.json$/.test(n));
    if (legacy && !parts.library) Object.assign(parts, partsFromSnapshot(fieldsOf(safeJSON(txt(files.get(legacy))))));
    const imgs = bundleImages(files);
    if (imgs && imgs.length) parts.images = imgs;
    const manifest = get("manifest.json");
    return {
        parts,
        savedAt: textOf(fieldsOf(manifest).savedAt) || undefined,
        v: manifest ? numOf(fieldsOf(manifest).v) : legacy ? 4 : APP_V,
    };
}
/** a whole library snapshot (the oldest backups, or a .json) as parts */
export function partsFromSnapshot(data: Record<string, unknown>): Parts {
    const m = fieldsOf(data.meta),
        library = data.items || data.books || {};
    return {
        library,
        favourites: { favOrder: m.favOrder, chars: m.chars, people: m.people },
        lists: { queue: m.queue, lists: m.lists },
        academic: m.courses || null,
        preferences: Object.fromEntries(PREF_KEYS.filter(k => m[k] != null).map(k => [k, m[k]])),
        themes: m.themes,
        profile: m.profile,
        private: m.vault ? { vault: m.vault } : null,
        keys: data.keys || null,
        _v: data.v || 3,
    };
}
/** how many things a part holds, for the import dialog */
export const partCount = (k: string, x: unknown): number => {
    if (!x) return 0;
    const v = fieldsOf(x),
        n = (y: unknown) => listOf(y).length;
    return k === "library"
        ? Object.keys(v).length
        : k === "favourites"
          ? n(v.favOrder) + n(v.chars)
          : k === "lists"
            ? n(v.lists) + 1
            : k === "academic"
              ? v.v === 2
                  ? n(v.paths) + n(v.subjects)
                  : n(v.programmes) + n(v.paths) + Object.keys(fieldsOf(fieldsOf(v.learn).subjects)).length
              : k === "images" || k === "extensions"
                ? n(x)
                : k === "themes"
                  ? Object.keys(v).length
                  : k === "private"
                    ? numOf(fieldsOf(v.vault).n) || 0
                    : k === "privext"
                      ? 1
                      : k === "keys"
                        ? (v.__locked ? 1 : 0) || Object.keys(v).length
                        : 1;
};

// ── checking parts as they come in ──
/** a record's string values (anything else in it is left out) */
const stringsOf = (x: unknown): Record<string, string> =>
    Object.fromEntries(Object.entries(fieldsOf(x)).filter((e): e is [string, string] => typeof e[1] === "string"));
/** a record's values that are records */
const recordsIn = (x: unknown): Record<string, Record<string, unknown>> =>
    Object.fromEntries(
        Object.entries(fieldsOf(x)).filter((e): e is [string, Record<string, unknown>] => isRecord(e[1]))
    );
/** a record's values that are lists of strings, as lists of strings */
const stringListsOf = (x: unknown): Record<string, string[]> =>
    Object.fromEntries(Object.entries(fieldsOf(x)).flatMap(([k, v]) => (Array.isArray(v) ? [[k, strsOf(v)]] : [])));
const isFavChar = (x: unknown): x is FavChar => isRecord(x) && typeof x.id === "string" && typeof x.name === "string";
const isFavPerson = (x: unknown): x is FavPerson => isRecord(x) && typeof x.name === "string";
/** a list from a file: one with an id and a name, its entries' ids as strings */
const asList = (x: unknown): List[] =>
    isRecord(x) && typeof x.id === "string" && x.id
        ? [{ ...x, id: x.id, name: textOf(x.name), ids: strsOf(x.ids) }]
        : [];
const isTier = (x: unknown): x is OldTier =>
    isRecord(x) && typeof x.id === "string" && typeof x.name === "string" && Array.isArray(x.rows);
const isView = (x: unknown): x is SavedView =>
    isRecord(x) && typeof x.id === "string" && typeof x.name === "string" && isRecord(x.state);
const isVault = (x: unknown): x is VaultBox =>
    isRecord(x) &&
    typeof x.salt === "string" &&
    typeof x.iv === "string" &&
    typeof x.ct === "string" &&
    typeof x.n === "number";
/** two values are the same kind of thing: both strings, numbers, booleans, lists or records */
const sameKind = (a: unknown, b: unknown) =>
    typeof a === typeof b && Array.isArray(a) === Array.isArray(b) && (a === null) === (b === null);
/** the fields of something from a file that are the same kind as the app's own (its defaults, or the kinds listed):
 * a field of another kind is left out, so a setting that should be words can't arrive as a number. Where the app keeps
 * a list or a record, null ("none") is kept too. A field the app has no default for is kept, for whatever reads it to
 * check */
function likeOurs(x: unknown, ours: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fieldsOf(x))) {
        const d = Object.hasOwn(ours, k) ? ours[k] : undefined;
        if (d == null || sameKind(d, v) || (v === null && typeof d === "object")) out[k] = v;
    }
    return out;
}
// what the settings without a default hold, so they can be checked too
const SETTINGS_KINDS: Record<string, unknown> = {
    dateFmt: "",
    ambience: "",
    backupKeys: false,
    showLinks: false,
    vaultAuto: 0,
    alSyncedAt: "",
    guideChecks: {},
    lastTabs: {},
    modeOpens: "",
    gameBoxes: false,
    quickStatus: "",
    seasonsMode: "",
    autoCombine: false,
    seasons: {},
    stageLast: "",
    watchOrder: "",
    welcomed3: false,
    unsealOnce: false,
    autoFetch: false,
    airing: false,
    player: {},
    servers: [],
    kindMerge: {},
    kindLabel: {},
    builtins: {},
    backdrops: [],
    worlds: [],
    srvPref: {},
    lastBackup: "",
    remindAfter: "",
    criteria: {},
};
// a mode's fields and their kinds
const MODE_KINDS: Record<string, unknown> = {
    name: "",
    g: "",
    match: [],
    space: "",
    theme: "",
    view: "",
    group: "",
    sort: "",
    gsort: {},
    vz: {},
    extra: [],
    offTabs: [],
    profile: {},
    tabs: [],
    homeTab: "",
    sealedOnly: false,
    hidden: false,
};
/** a mode from a file: its id, its name, and its other fields where they're the kinds a mode keeps */
const asMode = (x: unknown): Mode[] => {
    if (!isRecord(x) || typeof x.id !== "string" || !x.id) return [];
    const m = likeOurs(x, MODE_KINDS);
    for (const k of ["match", "extra", "offTabs", "tabs"]) if (Array.isArray(m[k])) m[k] = strsOf(m[k]);
    if (m.blocks != null && !Array.isArray(m.blocks)) delete m.blocks;
    if (m.statBlocks != null && !Array.isArray(m.statBlocks)) delete m.statBlocks;
    if (m.shelves != null && typeof m.shelves !== "string")
        m.shelves = recordsOf(m.shelves)
            .filter(s => typeof s.name === "string")
            .map(s => ({ ...s, name: textOf(s.name), match: strsOf(s.match) }));
    return [{ ...m, id: x.id, name: textOf(x.name) || x.id }];
};
/** the layout from a file, on top of the default one */
function asLayout(x: unknown): Layout {
    const L = likeOurs(x, DEFAULT_LAYOUT),
        side = likeOurs(fieldsOf(x).side, DEFAULT_LAYOUT.side),
        tabs = recordsOf(L.tabs).flatMap(t => (typeof t.k === "string" ? [{ k: t.k, on: !!t.on }] : []));
    return {
        ...clone(DEFAULT_LAYOUT),
        ...L,
        side: { ...DEFAULT_LAYOUT.side, ...side },
        ...(Array.isArray(L.tabs) ? { tabs } : {}),
        ...(Array.isArray(L.uniExclude) ? { uniExclude: strsOf(L.uniExclude) } : {}),
    };
}
/** the tags from a file: a name and its colour */
const tagsOf = (x: unknown): Meta["tags"] =>
    Object.fromEntries(
        Object.entries(recordsIn(x)).flatMap(([k, t]) => (typeof t.color === "string" ? [[k, { color: t.color }]] : []))
    );
/** what your books' subjects say you're into, from a file (null when it isn't that) */
function interestsOf(x: unknown): Meta["interests"] | null {
    if (!isRecord(x) || !isRecord(x.subjects)) return null;
    const subjects: Meta["interests"]["subjects"] = {};
    for (const [k, L] of Object.entries(x.subjects))
        subjects[k] = recordsOf(L).flatMap(s =>
            typeof s.name === "string" ? [{ name: s.name, w: numOf(s.w) || 0 }] : []
        );
    return { syncedAt: textOf(x.syncedAt) || null, subjects, seeds: strsOf(x.seeds) };
}

/** bring parts in: merge keeps what you have and adds; replace swaps that part wholesale. One undo step either way
 * (pictures excepted). Each part is checked first, and only a part that's there and ticked comes in */
export async function applyParts(
    parts: Parts,
    sel: Record<string, boolean>,
    how: "merge" | "replace",
    v: number | undefined = APP_V
): Promise<{ items: number; pics: number }> {
    const on = (k: string) => !!parts[k] && sel[k] !== false,
        rep = how === "replace";
    const PASS = asField($("#imp-keypass"))?.value || (ui.modal && textOf(ui.modal.keypass)) || ""; // read once: the dialog may redraw while this runs
    const KS = [
            "favOrder",
            "chars",
            "people",
            "queue",
            "lists",
            "themes",
            "profile",
            "vault",
            "courses",
            ...PREF_KEYS,
        ] as const,
        mb: Partial<Meta> = {};
    const keep = <K extends keyof Meta>(k: K) => {
        mb[k] = clone(meta[k]);
    };
    for (const k of KS) keep(k);
    // the library: entries with a title (migrateItem() checks and fills in the rest of each)
    const library = on("library") ? recordsIn(parts.library) : {};
    for (const [id, b] of Object.entries(library)) if (!b.title) delete library[id];
    let ids: string[] = [];
    if (on("library"))
        ids = [...new Set([...(rep ? [...items.keys()].filter(x => !vault.ids.has(x)) : []), ...Object.keys(library)])];
    const union = (a: string[], b: string[]) => [...new Set([...a, ...b])],
        byId = <T extends { id?: string }>(a: T[], b: T[]) => [...a, ...b.filter(x => !a.some(y => y.id === x.id))];
    if (on("favourites")) {
        const f = fieldsOf(parts.favourites),
            favOrder = strsOf(f.favOrder),
            chars = listOf(f.chars).filter(isFavChar),
            people = listOf(f.people).filter(isFavPerson);
        if (rep) {
            meta.favOrder = favOrder;
            meta.chars = chars;
            meta.people = people;
        } else {
            meta.favOrder = union(meta.favOrder, favOrder);
            meta.chars = byId(meta.chars, chars);
            meta.people = byId(meta.people, people);
        }
    }
    if (on("lists")) {
        const l = fieldsOf(parts.lists),
            queue = strsOf(l.queue),
            lists = listOf(l.lists).flatMap(asList);
        if (rep) {
            meta.queue = queue;
            meta.lists = [...lists, ...meta.lists.filter(x => x.private)];
        } else {
            meta.queue = union(meta.queue, queue);
            meta.lists = byId(meta.lists, lists);
        }
    }
    // the Learning Centre's subjects and paths (an older export's programmes and pathways are turned into today's first)
    if (on("academic")) {
        const a = lcConvertOld(parts.academic),
            cur = ACS(),
            add = <T extends { id: string }>(x: T[], y: T[]) => [...x, ...y.filter(p => !x.some(q => q.id === p.id))];
        meta.courses = rep
            ? { v: 2, subjects: a.subjects, paths: a.paths, curricula: a.curricula || {} }
            : {
                  v: 2,
                  subjects: add(cur.subjects, a.subjects),
                  paths: add(cur.paths, a.paths),
                  curricula: lcMergeCurricula(cur.curricula || {}, a.curricula || {}),
              };
    }
    if (on("themes")) {
        const themes: Record<string, Theme> = recordsIn(parts.themes);
        meta.themes = { ...meta.themes, ...themes };
    }
    if (on("profile")) {
        const incoming = likeOurs(parts.profile, meta.profile);
        if (incoming.anilist != null && !isRecord(incoming.anilist)) delete incoming.anilist;
        meta.profile = rep
            ? { ...meta.profile, ...incoming }
            : {
                  ...meta.profile,
                  ...incoming,
                  ...Object.fromEntries(Object.entries(meta.profile).filter(([, x]) => x)),
              };
    }
    if (on("preferences")) {
        const p = fieldsOf(parts.preferences);
        if (isRecord(p.settings)) {
            const incoming = likeOurs(p.settings, { ...SETTINGS_KINDS, ...DEFAULT_SETTINGS });
            meta.settings = { ...meta.settings, ...incoming, fileName: meta.settings.fileName };
            // backdrops from a file or another device: only shapes, colours and a picture get in (backdrops/backdrop.ts)
            // (an older backup calls them "worlds")
            for (const k of ["backdrops", "worlds"])
                if (meta.settings[k]) meta.settings[k] = myBackdrops(meta.settings[k]);
            if (!p.settings.v6) meta.settings.v6 = false;
            if (!p.settings.v7) meta.settings.v7 = false;
            if (!p.settings.v9) meta.settings.v9 = false;
            if (!p.settings.v8) meta.settings.v8 = false;
        }
        if (p.tags) meta.tags = { ...meta.tags, ...tagsOf(p.tags) };
        const also = (k: string) =>
            p[k] != null && (rep || k === "layout" || k === "modes" || k === "orders" || k === "myOrder");
        if (also("layout")) meta.layout = asLayout(p.layout);
        if (also("modes") && Array.isArray(p.modes)) meta.modes = p.modes.flatMap(asMode);
        if (also("views") && Array.isArray(p.views)) meta.views = p.views.filter(isView);
        if (also("orders")) meta.orders = stringListsOf(p.orders);
        if (also("myOrder")) meta.myOrder = stringListsOf(p.myOrder);
        if (also("dismissed") && Array.isArray(p.dismissed)) meta.dismissed = strsOf(p.dismissed);
        const interests = also("interests") ? interestsOf(p.interests) : null;
        if (interests) meta.interests = interests;
        if (also("tiers") && Array.isArray(p.tiers)) meta.tiers = p.tiers.filter(isTier);
        if (!meta.modes.some(x => x.id === "universal")) meta.modes.unshift(clone(DEFAULT_MODES[0]));
        const seenMode = new Set<string>();
        meta.modes = meta.modes.filter(x => x && x.id && !seenMode.has(x.id) && seenMode.add(x.id));
        if ((v || 0) < 5) {
            meta.settings.v5 = false;
            migrateV5();
        }
        migrateV6();
        migrateV7();
        migrateV8();
        migrateV9();
        migrateV10();
        migratePaths();
        if (!meta.modes.some(x => x.id === ui.mode)) ui.mode = "universal";
    }
    let sealedKeys: unknown = null; // what private/keys.json held, once opened: extensions' secrets go back after the extensions
    if (on("keys")) {
        let K: unknown = parts.keys;
        const locked = isRecord(K) ? K.__locked : null;
        if (locked) {
            const pass = PASS;
            try {
                K = await keysDecrypt(locked, pass);
            } catch (_) {
                K = null;
                toast(
                    pass
                        ? "That passphrase didn't open your keys, so they weren't imported."
                        : "Your keys are encrypted: type their passphrase to import them."
                );
            }
        }
        if (K) restoreKeys(K, rep);
        sealedKeys = K;
    }
    const priv = fieldsOf(parts.private);
    if (on("private") && isVault(priv.vault) && (!meta.vault || rep)) {
        if (vault.key) vaultLock();
        meta.vault = priv.vault;
        meta.lists = [...meta.lists.filter(l => !l.private), ...listOf(priv.lists).flatMap(asList)];
    }
    change(
        rep ? "Replace from import" : "Merge import",
        ids,
        (b, id) => {
            const inc = library[id];
            if (rep) return inc ? migrateItem(inc) : null;
            return inc ? migrateItem({ ...(b || {}), ...inc, private: undefined }) : (b ?? undefined);
        },
        { metaBefore: mb }
    );
    meta.queue = meta.queue.filter(x => items.has(x) || String(x).startsWith("x-"));
    markDirty();
    if (on("library") && !(on("preferences") && at2(parts.preferences, "settings", "v7"))) {
        meta.settings.v7 = false;
        migrateV7();
        migrateV8();
        migrateV9();
        migrateV10();
    }
    sweepSealed();
    let pics = 0;
    if (on("images")) pics = await restoreImages(parts.images);
    const extHow = (ui.modal && textOf(ui.modal.extHow)) || "all";
    if (on("extensions")) await extRestore(listOf(parts.extensions).filter(isExtRecord), extHow);
    if (on("privext")) {
        const pass = PASS;
        try {
            const L = recordsOf(await keysDecrypt(fieldsOf(parts.privext).__locked, pass));
            await extRestore(
                L.map(r => ({
                    ...extFromParts(r.manifest, stringsOf(r.files)),
                    on: r.on !== false,
                    data: fieldsOf(r.data),
                    private: true,
                    at: nowISO(),
                })),
                extHow
            );
        } catch (_) {
            toast("That passphrase didn't open your private extensions, so they weren't imported.");
        }
    }
    if (isRecord(sealedKeys) && sealedKeys.__ext) await extRestoreSecrets(sealedKeys.__ext, rep);
    applyTheme();
    render();
    return { items: ids.length, pics };
}
/** a value two keys deep in a part */
const at2 = (x: unknown, a: string, b: string): unknown => fieldsOf(fieldsOf(x)[a])[b];
/** an extension read from an export's extensions/ folder (extFromFiles has checked its manifest) */
const isExtRecord = (x: unknown): x is ExtRecord => isRecord(x) && isRecord(x.manifest) && isRecord(x.files);
// ── a library folder you own (Chrome and Edge): the same layout, kept up to date ──
export const folderSync: {
    handle: FileSystemDirectoryHandle | null;
    state: string;
    timer: ReturnType<typeof setTimeout> | undefined;
    lastSaved: string | null;
    written: Set<string>;
    supported: boolean;
    init(): Promise<void>;
    connect(): Promise<boolean>;
    reconnect(): Promise<void>;
    disconnect(): Promise<void>;
    dir(path: string[], create: boolean): Promise<FileSystemDirectoryHandle>;
    write(name: string, data: FileSystemWriteChunkType): Promise<void>;
    readFiles(onlyData?: boolean): Promise<ZipFiles | null>;
    pull(force?: boolean): Promise<void>;
    push(all?: boolean): Promise<void>;
    schedule(): void;
} = {
    handle: null,
    state: "off",
    timer: undefined,
    lastSaved: null,
    written: new Set(),
    supported: "showDirectoryPicker" in window,
    async init() {
        if (!this.supported || storage !== "idb") return;
        try {
            const h = await idbGet("meta", "folderHandle");
            this.handle = h instanceof FileSystemDirectoryHandle ? h : null;
        } catch (_) {}
        if (!this.handle) return;
        const p = await this.handle.queryPermission({ mode: "readwrite" }).catch(() => "denied");
        if (p === "granted") await this.pull();
        else this.state = "reconnect";
    },
    async connect() {
        try {
            const h = await window.showDirectoryPicker({ id: "univerlist", mode: "readwrite" });
            this.handle = h;
            await idbPut("meta", "folderHandle", h);
            const has = await this.readFiles(true);
            this.state = "on";
            if (has && has.size) {
                await this.pull(true);
            } else await this.push(true);
            return true;
        } catch (e) {
            if (errName(e) !== "AbortError") toast("Couldn't use that folder: " + errMessage(e));
            return false;
        }
    },
    async reconnect() {
        if (!this.handle) return;
        const p = await this.handle.requestPermission({ mode: "readwrite" }).catch(() => "denied");
        if (p === "granted") {
            this.state = "on";
            await this.pull();
            render();
        } else toast("Permission wasn't given, so the folder isn't being updated.");
    },
    async disconnect() {
        this.handle = null;
        this.state = "off";
        try {
            await idbDel("meta", "folderHandle");
        } catch (_) {}
        render();
    },
    async dir(path, create) {
        let d = this.handle;
        if (!d) throw new Error("no folder");
        for (const p of path) d = await d.getDirectoryHandle(p, { create });
        return d;
    },
    async write(name, data) {
        const parts = name.split("/"),
            file = parts.pop() || name,
            d = await this.dir(parts, true);
        const fh = await d.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(data);
        await w.close();
    },
    async readFiles(onlyData) {
        const out: ZipFiles = new Map(),
            walk = async (d: FileSystemDirectoryHandle, pre: string) => {
                for await (const [n, h] of d.entries()) {
                    if (h instanceof FileSystemDirectoryHandle) {
                        if (onlyData && n === "images") continue;
                        await walk(h, pre + n + "/");
                    } else if (h instanceof FileSystemFileHandle && /\.(json|jpg|jpeg|png|webp|gif|avif|svg)$/i.test(n))
                        out.set(pre + n, new Uint8Array(await (await h.getFile()).arrayBuffer()));
                }
            };
        if (!this.handle) return null;
        try {
            await walk(this.handle, "");
        } catch (_) {
            return null;
        }
        return out;
    },
    async pull(force) {
        try {
            const files = await this.readFiles();
            if (!files || !files.size) return this.push(true);
            const { parts, savedAt, v } = partsFromFiles(files);
            if (!parts.library) {
                return this.push(true);
            }
            if (force || (savedAt && (!meta.savedAt || savedAt > meta.savedAt))) {
                await applyParts(parts, { private: false }, "replace", v);
                history.length = 0;
                toast(`Loaded your library folder ${this.handle ? this.handle.name : ""}`);
            } else this.schedule();
            this.state = "on";
        } catch (e) {
            this.state = "error";
            toast("Couldn't read the library folder: " + errMessage(e));
        }
    },
    async push(all) {
        if (!this.handle || this.state === "reconnect") return;
        try {
            const first = all || !this.written.size,
                r = await v2Files({ private: true, images: first });
            for (const f of r.files)
                if (!f.name.startsWith("images/") || first || !this.written.has(f.name)) {
                    await this.write(f.name, f.data);
                    if (f.name.startsWith("images/")) this.written.add(f.name);
                }
            this.lastSaved = nowISO();
            this.state = "on";
            renderSideStatus();
        } catch (e) {
            this.state = errName(e) === "NotAllowedError" ? "reconnect" : "error";
            renderSideStatus();
        }
    },
    schedule() {
        if (!this.handle || this.state !== "on") return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.push(), 3000);
    },
};
/** a hosted copy (any static site): the first visit loads data/ and images/ from beside the app, then the service
 * worker keeps it offline */
export async function loadHosted(): Promise<boolean> {
    if (!/^https?:/.test(location.protocol)) return false;
    try {
        let files: ZipFiles | null = null;
        // the new layout: profile-export.zip (or the older defaults-export.zip) next to index.html
        for (const n of ["profile-export.zip", "defaults-export.zip"]) {
            if (files) break;
            try {
                const r = await fetch(n, { cache: "no-store" });
                if (r.ok) {
                    const buf = await r.arrayBuffer(),
                        u8 = new Uint8Array(buf);
                    if (u8[0] === 0x50 && u8[1] === 0x4b) files = await unzip(buf);
                }
            } catch (_) {}
        }
        if (!files) {
            // older layout: loose files beside the app
            const man = fieldsOf(safeJSON(await (await fetch("manifest.json", { cache: "no-store" })).text()));
            if (man.app !== "univerlist") return false;
            const loose: ZipFiles = new Map();
            files = loose;
            const enc = new TextEncoder();
            for (const p of strsOf(man.parts))
                if (p !== "manifest.json") {
                    const r = await fetch(p);
                    if (r.ok) loose.set(p, enc.encode(await r.text()));
                }
            try {
                const idx = fieldsOf(safeJSON(await (await fetch("images/index.json")).text()));
                loose.set("images/index.json", enc.encode(JSON.stringify(idx)));
                await Promise.all(
                    Object.values(idx).map(async f => {
                        if (typeof f !== "string") return;
                        try {
                            const r = await fetch(f);
                            if (r.ok) loose.set(f, new Uint8Array(await r.arrayBuffer()));
                        } catch (_) {}
                    })
                );
            } catch (_) {}
        }
        const { parts, v } = partsFromFiles(files);
        if (!Object.keys(parts).length) return false;
        await applyParts(parts, {}, "replace", v);
        history.length = 0;
        toast("Loaded your library from this site");
        return true;
    } catch (_) {
        return false;
    }
}
// older hosted copies shipped a service worker; leave it alone if it's there, never ask for a missing one
// (offline install is registered by src/main.ts in the hosted build)

// ═══════════════════════════════════════════
//  TASTE PROFILE: WHAT YOUR SCORES SAY ABOUT YOU, IN PLAIN WORDS AND DATA
// ═══════════════════════════════════════════
/** one genre, theme, creator, type or decade, and how it lifts your scores */
interface TasteRow {
    k: string;
    n: number;
    mean: number;
    lift: number;
    vsCrowd: number | null;
    drop: number;
}
/** what your scores say about you */
export interface Taste {
    mode: string;
    n: number;
    rated: number;
    mean: number;
    sd: number;
    gap: number | null;
    fin: number;
    drop: number;
    genres: TasteRow[];
    themes: TasteRow[];
    creators: TasteRow[];
    types: TasteRow[];
    decades: TasteRow[];
    lenPref: { short: number | null; long: number | null };
    loveMore: { b: Entry; d: number }[];
    loveLess: { b: Entry; d: number }[];
    top: Entry[];
}
export function tasteData(mode: Mode = curMode()): Taste {
    const A = modeItems(mode),
        score = (b: Item) => b.rating || 0,
        rated = A.filter(b => b.rating),
        mean = rated.length ? rated.reduce((a, b) => a + score(b), 0) / rated.length : 0;
    const crowdOf = (b: Item) => crowd(b).avg;
    const agg = (f: (b: Entry) => string | string[] | null | undefined) => {
        const m: Record<
            string,
            { n: number; r: number; s: number; done: number; dnf: number; crowd: number; c: number }
        > = {};
        for (const b of A) {
            for (const k of toList(f(b) || [])) {
                const e = m[k] || (m[k] = { n: 0, r: 0, s: 0, done: 0, dnf: 0, crowd: 0, c: 0 });
                e.n++;
                if (b.rating) {
                    e.r++;
                    e.s += b.rating;
                }
                if (b.status === "done") e.done++;
                if (b.status === "dnf") e.dnf++;
                const c = crowdOf(b);
                if (c != null && b.rating) {
                    e.crowd += b.rating * 10 - c;
                    e.c++;
                }
            }
        }
        return m;
    };
    const rank = (m: ReturnType<typeof agg>, min = 3): TasteRow[] =>
        Object.entries(m)
            .filter(([, e]) => e.r >= min)
            .map(([k, e]) => ({
                k,
                n: e.n,
                mean: e.s / e.r,
                lift: e.s / e.r - mean,
                vsCrowd: e.c ? e.crowd / e.c : null,
                drop: e.dnf / Math.max(1, e.done + e.dnf),
            }))
            .sort((a, b) => b.lift - a.lift);
    const genres = rank(agg(b => b.genres)),
        themes = rank(
            agg(b => (b.themes || []).slice(0, 8)),
            3
        ),
        creators = rank(
            agg(b => splitNames(b.creator).slice(0, 2)),
            2
        ),
        types = rank(
            agg(b => b.kind || MEDIA[b.medium].name),
            2
        );
    const decades = rank(
        agg(b => (b.year ? Math.floor(b.year / 10) * 10 + "s" : null)),
        2
    );
    const withCrowd = rated.flatMap(b => {
            const c = crowdOf(b);
            return c != null ? [{ b, c }] : [];
        }),
        gap = withCrowd.length ? withCrowd.reduce((a, x) => a + score(x.b) * 10 - x.c, 0) / withCrowd.length : null;
    const sd = rated.length ? Math.sqrt(rated.reduce((a, b) => a + (score(b) - mean) ** 2, 0) / rated.length) : 0;
    const fin = A.filter(b => b.status === "done").length,
        drop = A.filter(b => b.status === "dnf").length;
    const lenPref = (() => {
        const s = rated.filter(b => lenOf(b) < 600),
            l = rated.filter(b => lenOf(b) >= 1500),
            m2 = (x: Entry[]) => (x.length ? x.reduce((a, b) => a + score(b), 0) / x.length : null);
        return { short: m2(s), long: m2(l) };
    })();
    const outliers = withCrowd.map(x => ({ b: x.b, d: score(x.b) * 10 - x.c })).sort((x, y) => y.d - x.d);
    return {
        mode: mode.name,
        n: A.length,
        rated: rated.length,
        mean,
        sd,
        gap,
        fin,
        drop,
        genres,
        themes,
        creators,
        types,
        decades,
        lenPref,
        loveMore: outliers.slice(0, 8),
        loveLess: outliers.slice(-8).reverse(),
        top: rated
            .slice()
            .sort((a, b) => score(b) - score(a) || favPos(a.id) - favPos(b.id))
            .slice(0, 15),
    };
}
export function tasteSentences(t: Taste): string[] {
    const s: string[] = [],
        f = (x: number) => x.toFixed(1);
    if (!t.rated) return ["Score a few things and this fills in."];
    s.push(
        `Across ${t.rated} scored entries your average is ${f(t.mean)}/10, with ${t.sd < 1.2 ? "a narrow spread: you score consistently" : t.sd > 1.9 ? "a wide spread: you use the whole scale" : "a moderate spread"}.`
    );
    if (t.gap != null)
        s.push(
            Math.abs(t.gap) < 3
                ? "You mostly agree with the crowd."
                : t.gap > 0
                  ? `You're ${Math.round(t.gap)} points kinder than the crowd on average (out of 100).`
                  : `You're ${Math.round(-t.gap)} points tougher than the crowd on average (out of 100).`
        );
    const up = t.genres.filter(g => g.lift > 0.25).slice(0, 4),
        down = t.genres.filter(g => g.lift < -0.25).slice(-3);
    if (up.length)
        s.push(
            `You score ${up.map(g => g.k).join(", ")} above your average${down.length ? `, and ${down.map(g => g.k).join(", ")} below it` : ""}.`
        );
    const th = t.themes.filter(g => g.lift > 0.3).slice(0, 5);
    if (th.length) s.push(`Themes that lift your scores: ${th.map(g => g.k).join(", ")}.`);
    const cr = t.creators.filter(c => c.lift > 0.4).slice(0, 4);
    if (cr.length) s.push(`Creators you rate highest: ${cr.map(c => c.k).join(", ")}.`);
    if (t.lenPref.short != null && t.lenPref.long != null && Math.abs(t.lenPref.short - t.lenPref.long) > 0.4)
        s.push(
            t.lenPref.long > t.lenPref.short
                ? "Longer things land better with you than short ones."
                : "Short things land better with you than long ones."
        );
    if (t.fin + t.drop > 10)
        s.push(
            `You finish ${Math.round((t.fin / (t.fin + t.drop)) * 100)}% of what you don't drop${
                t.genres.filter(g => g.drop > 0.25 && g.n > 4).length
                    ? `; you drop ${t.genres
                          .filter(g => g.drop > 0.25 && g.n > 4)
                          .slice(0, 3)
                          .map(g => g.k)
                          .join(", ")} most`
                    : ""
            }.`
        );
    return s;
}
export function tasteMarkdown(): string {
    const t = tasteData(modeById("universal")),
        row = (x: TasteRow, k?: boolean) =>
            `| ${x.k} | ${x.n} | ${x.mean.toFixed(1)} | ${x.lift >= 0 ? "+" : ""}${x.lift.toFixed(1)} |${k ? ` ${x.vsCrowd != null ? Math.round(x.vsCrowd) : "–"} |` : ""}`;
    return `# Taste profile · ${meta.profile.name || "Me"} · ${today()}\n\n${tasteSentences(t).join(" ")}\n\n## Genres (by how much they lift your score)\n| Genre | Entries | Your mean | vs your average | vs crowd |\n|---|---|---|---|---|\n${t.genres
        .slice(0, 25)
        .map(x => row(x, true))
        .join("\n")}\n\n## Themes\n| Theme | Entries | Your mean | vs your average |\n|---|---|---|---|\n${t.themes
        .slice(0, 25)
        .map(x => row(x))
        .join(
            "\n"
        )}\n\n## Creators\n| Creator | Entries | Your mean | vs your average |\n|---|---|---|---|\n${t.creators
        .slice(0, 20)
        .map(x => row(x))
        .join(
            "\n"
        )}\n\n## Your top 15\n${t.top.map((b, i) => `${i + 1}. ${titleOf(b)} (${b.kind || MEDIA[b.medium].one}${b.year ? ", " + b.year : ""}) – ${b.rating}/10`).join("\n")}\n\n## You love more than most\n${t.loveMore.map(x => `- ${titleOf(x.b)}: you ${x.b.rating}/10, crowd ${crowd(x.b).avg}/100`).join("\n")}\n\n## The crowd loves more than you\n${t.loveLess.map(x => `- ${titleOf(x.b)}: you ${x.b.rating}/10, crowd ${crowd(x.b).avg}/100`).join("\n")}\n`;
}
