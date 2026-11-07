// src/features/import-export/packs.js
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
// ─────────────────────────────────────────────────────────────────

const PARTS = [
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
];
function packParts() {
    const s = snapshot(),
        m = s.meta,
        library = {};
    for (const [id, b] of Object.entries(s.items)) (library[b.medium] = library[b.medium] || {})[id] = b;
    const settings = { ...m.settings };
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
// keys go into backups as their own file, so a backup restores everything, while the app file itself never holds one
function keysForBackup() {
    const out = {};
    for (const [k, v] of Object.entries(KEYS)) if (k === "libs" ? v && Object.keys(v).length : v) out[k] = v;
    // extensions' secret settings (an API key, a companion password) are sealed with yours (extensions.js extSecrets)
    const ext = typeof extSecrets === "function" ? extSecrets() : {};
    if (Object.keys(ext).length) out.__ext = ext;
    return out;
}
function restoreKeys(k, rep) {
    if (!k || typeof k !== "object") return 0;
    let n = 0;
    for (const [name, v] of Object.entries(k)) {
        if (name === "__ext") continue; // extensions' secrets: put back once the extensions are in (applyParts)
        if (name === "libs") {
            KEYS.libs = rep ? { ...(KEYS.libs || {}), ...v } : { ...v, ...(KEYS.libs || {}) };
            n += Object.keys(v || {}).length;
        } else if (typeof v === "string" && v && (rep || !KEYS[name])) {
            KEYS[name] = v;
            n++;
        }
    }
    saveKeys();
    return n;
}
const README = `UniverList

This is your profile export: everything personal, from UniverList. Open index.html (the app) to use it.

  data/library/*.json      everything you've added, one file per medium (anime, manga, book, tv, film, game…)
  data/favourites.json     your favourites order, characters and people
  data/lists.json          Up next and your lists
  data/preferences.json    settings, layout, each mode's views, sorts, zoom and shelves, saved views, tags, shelf arrangements, rankings
  data/themes.json         your theme library
  data/profile.json        name, pictures, banners, bios
  data/private.json        the private collection, still encrypted (only if you chose to include it)
  data/keys.json           your keys and server addresses (unless you chose to leave them out). Keep this file private.
  lists/*.csv              your lists, readable in any spreadsheet
  taste/                   your taste profile (Markdown and JSON)
  images/                  pictures, so everything shows offline; images/index.json maps each web address to its file

To restore or move to another computer: open index.html → Settings → Import & export → drop this .zip in the box.
You can bring in just one part (only lists, only preferences) and leave the rest.

To host it yourself (any static web host, or a folder served on your own computer): put index.html and this file, renamed profile-export.zip,
side by side and open index.html from that address. The first time, it loads profile-export.zip by itself.
`;
// read a bundle (zip, folder or hosted copy) given a map of path → bytes
function partsFromFiles(files) {
    if (isV2(files)) return partsFromV2(files);
    const get = n => {
        const k = [...files.keys()].find(x => x === n || x.endsWith("/" + n));
        return k ? safeJSON(txt(files.get(k))) : null;
    };
    const parts = {};
    const libKeys = [...files.keys()].filter(k => /(^|\/)data\/library\/[^/]+\.json$/.test(k));
    if (libKeys.length) {
        parts.library = {};
        for (const k of libKeys) Object.assign(parts.library, safeJSON(txt(files.get(k))));
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
    if (legacy && !parts.library) Object.assign(parts, partsFromSnapshot(safeJSON(txt(files.get(legacy)))));
    const imgs = bundleImages(files);
    if (imgs && imgs.length) parts.images = imgs;
    const man = get("manifest.json");
    return { parts, savedAt: man && man.savedAt, v: man ? man.v : legacy ? 4 : APP_V };
}
function partsFromSnapshot(data) {
    const m = data.meta || {},
        items = data.items || data.books || {};
    return {
        library: items,
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
const partCount = (k, v) =>
    !v
        ? 0
        : k === "library"
          ? Object.keys(v).length
          : k === "favourites"
            ? (v.favOrder || []).length + (v.chars || []).length
            : k === "lists"
              ? (v.lists || []).length + 1
              : k === "academic"
                ? v.v === 2
                    ? (v.paths || []).length + (v.subjects || []).length
                    : (v.programmes || []).length +
                      (v.paths || []).length +
                      Object.keys((v.learn || {}).subjects || {}).length
                : k === "images" || k === "extensions"
                  ? v.length
                  : k === "themes"
                    ? Object.keys(v).length
                    : k === "private"
                      ? v.vault
                          ? v.vault.n || 0
                          : 0
                      : k === "privext"
                        ? 1
                        : k === "keys"
                          ? (v.__locked ? 1 : 0) || Object.keys(v).length
                          : 1;
// bring parts in: merge keeps what you have and adds; replace swaps that part wholesale. One undo step either way (pictures excepted).
async function applyParts(parts, sel, how, v = APP_V) {
    const on = k => parts[k] && sel[k] !== false,
        rep = how === "replace";
    const PASS = ($("#imp-keypass") || {}).value || (ui.modal && ui.modal.keypass) || ""; // read once: the dialog may redraw while this runs
    const KS = ["favOrder", "chars", "people", "queue", "lists", "themes", "profile", "vault", "courses", ...PREF_KEYS],
        mb = {};
    for (const k of KS) mb[k] = clone(meta[k]);
    let ids = [];
    if (on("library")) {
        ids = [
            ...new Set([
                ...(rep ? [...items.keys()].filter(x => !vault.ids.has(x)) : []),
                ...Object.keys(parts.library),
            ]),
        ];
    }
    const union = (a, b) => [...new Set([...(a || []), ...(b || [])])],
        byId = (a, b) => [...(a || []), ...(b || []).filter(x => !(a || []).some(y => y.id === x.id))];
    if (on("favourites")) {
        const f = parts.favourites;
        if (rep) {
            meta.favOrder = f.favOrder || [];
            meta.chars = f.chars || [];
            meta.people = f.people || [];
        } else {
            meta.favOrder = union(meta.favOrder, f.favOrder);
            meta.chars = byId(meta.chars, f.chars);
            meta.people = byId(meta.people, f.people);
        }
    }
    if (on("lists")) {
        const l = parts.lists;
        if (rep) {
            meta.queue = l.queue || [];
            meta.lists = [...(l.lists || []), ...meta.lists.filter(x => x.private)];
        } else {
            meta.queue = union(meta.queue, l.queue);
            meta.lists = byId(meta.lists, l.lists);
        }
    }
    // the Learning Centre's subjects and paths (an older export's programmes and pathways are turned into today's first)
    if (on("academic") && parts.academic) {
        const a = parts.academic.v === 2 ? parts.academic : lcConvertOld(parts.academic),
            cur = ACS(),
            add = (x, y) => [...x, ...(y || []).filter(p => !x.some(q => q.id === p.id))];
        meta.courses = rep
            ? { v: 2, subjects: a.subjects || [], paths: a.paths || [], curricula: a.curricula || {} }
            : {
                  v: 2,
                  subjects: add(cur.subjects, a.subjects),
                  paths: add(cur.paths, a.paths),
                  curricula: lcMergeCurricula(cur.curricula || {}, a.curricula),
              };
    }
    if (on("themes")) meta.themes = { ...meta.themes, ...parts.themes };
    if (on("profile"))
        meta.profile = rep
            ? { ...meta.profile, ...parts.profile }
            : { ...parts.profile, ...Object.fromEntries(Object.entries(meta.profile).filter(([, x]) => x)) };
    if (on("preferences")) {
        const p = parts.preferences;
        if (p.settings) {
            meta.settings = { ...meta.settings, ...p.settings, fileName: meta.settings.fileName };
            // backdrops from a file or another device: only shapes, colours and a picture get in (backdrops/backdrop.ts)
            // (an older backup calls them "worlds")
            for (const k of ["backdrops", "worlds"])
                if (meta.settings[k] && window.ulBackdrops) meta.settings[k] = ulBackdrops.clean(meta.settings[k]);
            if (!p.settings.v6) meta.settings.v6 = false;
            if (!p.settings.v7) meta.settings.v7 = false;
            if (!p.settings.v9) meta.settings.v9 = false;
            if (!p.settings.v8) meta.settings.v8 = false;
        }
        if (p.tags) meta.tags = { ...meta.tags, ...p.tags };
        for (const k of ["layout", "modes", "views", "orders", "myOrder", "dismissed", "interests", "tiers"])
            if (p[k] != null && (rep || k === "layout" || k === "modes" || k === "orders" || k === "myOrder"))
                meta[k] =
                    k === "layout"
                        ? {
                              ...clone(DEFAULT_LAYOUT),
                              ...p.layout,
                              side: { ...DEFAULT_LAYOUT.side, ...(p.layout.side || {}) },
                          }
                        : p[k];
        if (!meta.modes.some(x => x.id === "universal")) meta.modes.unshift(clone(DEFAULT_MODES[0]));
        const seenMode = new Set();
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
    let sealedKeys = null; // what private/keys.json held, once opened: extensions' secrets go back after the extensions
    if (on("keys")) {
        let K = parts.keys;
        if (K.__locked) {
            const pass = PASS;
            try {
                K = await keysDecrypt(K.__locked, pass);
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
    if (on("private") && parts.private && parts.private.vault && (!meta.vault || rep)) {
        if (vault.key) vaultLock();
        meta.vault = parts.private.vault;
        meta.lists = [...meta.lists.filter(l => !l.private), ...(parts.private.lists || [])];
    }
    change(
        rep ? "Replace from import" : "Merge import",
        ids,
        (b, id) => {
            const inc = parts.library[id];
            if (rep) return inc ? migrateItem(inc) : null;
            return inc ? migrateItem({ ...(b || {}), ...inc, private: undefined }) : (b ?? undefined);
        },
        { metaBefore: mb }
    );
    meta.queue = meta.queue.filter(x => items.has(x) || String(x).startsWith("x-"));
    markDirty();
    if (on("library") && !(on("preferences") && parts.preferences.settings && parts.preferences.settings.v7)) {
        meta.settings.v7 = false;
        migrateV7();
        migrateV8();
        migrateV9();
        migrateV10();
    }
    sweepSealed();
    let pics = 0;
    if (on("images")) pics = await restoreImages(parts.images);
    const extHow = (ui.modal && ui.modal.extHow) || "all";
    if (on("extensions") && typeof extRestore === "function") await extRestore(parts.extensions, extHow);
    if (on("privext") && typeof extRestore === "function") {
        const pass = PASS;
        try {
            const L = await keysDecrypt(parts.privext.__locked, pass);
            await extRestore(
                L.map(r => ({
                    ...extFromParts(r.manifest, r.files),
                    on: r.on !== false,
                    data: r.data || {},
                    private: true,
                    at: nowISO(),
                })),
                extHow
            );
        } catch (_) {
            toast("That passphrase didn't open your private extensions, so they weren't imported.");
        }
    }
    if (sealedKeys && sealedKeys.__ext && typeof extRestoreSecrets === "function")
        await extRestoreSecrets(sealedKeys.__ext, rep);
    applyTheme();
    render();
    return { items: ids.length, pics };
}
// ── a library folder you own (Chrome and Edge): the same layout, kept up to date ──
const folderSync = {
    handle: null,
    state: "off",
    timer: null,
    lastSaved: null,
    written: new Set(),
    supported: "showDirectoryPicker" in window,
    async init() {
        if (!this.supported || storage !== "idb") return;
        try {
            this.handle = await idbGet("meta", "folderHandle");
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
            if (e.name !== "AbortError") toast("Couldn't use that folder: " + e.message);
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
        for (const p of path) d = await d.getDirectoryHandle(p, { create });
        return d;
    },
    async write(name, data) {
        const parts = name.split("/"),
            file = parts.pop(),
            d = await this.dir(parts, true);
        const fh = await d.getFileHandle(file, { create: true });
        const w = await fh.createWritable();
        await w.write(data);
        await w.close();
    },
    async readFiles(onlyData) {
        const out = new Map(),
            walk = async (d, pre) => {
                for await (const [n, h] of d.entries()) {
                    if (h.kind === "directory") {
                        if (onlyData && n === "images") continue;
                        await walk(h, pre + n + "/");
                    } else if (/\.(json|jpg|jpeg|png|webp|gif|avif|svg)$/i.test(n))
                        out.set(pre + n, new Uint8Array(await (await h.getFile()).arrayBuffer()));
                }
            };
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
                toast(`Loaded your library folder ${this.handle.name}`);
            } else this.schedule();
            this.state = "on";
        } catch (e) {
            this.state = "error";
            toast("Couldn't read the library folder: " + e.message);
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
            this.state = e.name === "NotAllowedError" ? "reconnect" : "error";
            renderSideStatus();
        }
    },
    async pushImages() {
        let index = {};
        try {
            const d = await this.dir(["images"], true);
            const fh = await d.getFileHandle("index.json");
            index = JSON.parse(await (await fh.getFile()).text());
        } catch (_) {}
        for (const u of offlineTargets()) {
            if (index[u]) continue;
            let blob = null;
            try {
                blob = await idbGet("covers", u);
            } catch (_) {}
            if (!blob) continue;
            const name = `images/${(hash(u) >>> 0).toString(36)}.${extOf(blob.type)}`;
            await this.write(name, blob);
            index[u] = name;
        }
        await this.write("images/index.json", JSON.stringify(index, null, 1));
        this.written = new Set(Object.keys(index));
    },
    schedule() {
        if (!this.handle || this.state !== "on") return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.push(), 3000);
    },
};
// a hosted copy (any static site): the first visit loads data/ and images/ from beside the app, then the service worker keeps it offline
async function loadHosted() {
    if (!/^https?:/.test(location.protocol)) return false;
    try {
        let files = null;
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
            const man = await (await fetch("manifest.json", { cache: "no-store" })).json();
            if (!man || man.app !== "univerlist") return false;
            files = new Map();
            const enc = new TextEncoder();
            for (const p of man.parts || [])
                if (p !== "manifest.json") {
                    const r = await fetch(p);
                    if (r.ok) files.set(p, enc.encode(await r.text()));
                }
            try {
                const idx = await (await fetch("images/index.json")).json();
                files.set("images/index.json", enc.encode(JSON.stringify(idx)));
                await Promise.all(
                    Object.values(idx).map(async f => {
                        try {
                            const r = await fetch(f);
                            if (r.ok) files.set(f, new Uint8Array(await r.arrayBuffer()));
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
function tasteData(mode = curMode()) {
    const A = modeItems(mode),
        rated = A.filter(b => b.rating),
        mean = rated.length ? rated.reduce((a, b) => a + b.rating, 0) / rated.length : 0;
    const agg = f => {
        const m = {};
        for (const b of A) {
            for (const k of [].concat(f(b) || [])) {
                const e = m[k] || (m[k] = { n: 0, r: 0, s: 0, done: 0, dnf: 0, crowd: 0, c: 0 });
                e.n++;
                if (b.rating) {
                    e.r++;
                    e.s += b.rating;
                }
                if (b.status === "done") e.done++;
                if (b.status === "dnf") e.dnf++;
                const c = crowd(b).avg;
                if (c != null && b.rating) {
                    e.crowd += b.rating * 10 - c;
                    e.c++;
                }
            }
        }
        return m;
    };
    const rank = (m, min = 3) =>
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
    const withCrowd = rated.filter(b => crowd(b).avg != null),
        gap = withCrowd.length
            ? withCrowd.reduce((a, b) => a + b.rating * 10 - crowd(b).avg, 0) / withCrowd.length
            : null;
    const sd = rated.length ? Math.sqrt(rated.reduce((a, b) => a + (b.rating - mean) ** 2, 0) / rated.length) : 0;
    const fin = A.filter(b => b.status === "done").length,
        drop = A.filter(b => b.status === "dnf").length;
    const lenPref = (() => {
        const s = rated.filter(b => lenOf(b) < 600),
            l = rated.filter(b => lenOf(b) >= 1500),
            m2 = x => (x.length ? x.reduce((a, b) => a + b.rating, 0) / x.length : null);
        return { short: m2(s), long: m2(l) };
    })();
    const outliers = withCrowd.map(b => ({ b, d: b.rating * 10 - crowd(b).avg })).sort((x, y) => y.d - x.d);
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
            .sort((a, b) => b.rating - a.rating || favPos(a.id) - favPos(b.id))
            .slice(0, 15),
    };
}
function tasteSentences(t) {
    const s = [],
        f = x => x.toFixed(1);
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
function tasteMarkdown() {
    const t = tasteData(modeById("universal")),
        row = (x, k) =>
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
function tasteHTML() {
    const t = tasteData(),
        bar = (x, max) =>
            `<span class="b"><span style="width:${Math.min(100, (Math.abs(x) / max) * 100)}%;background:${x >= 0 ? "var(--good)" : "var(--warn)"}"></span></span>`;
    const table = (rows, label) =>
        rows.length
            ? `<table class="lib small"><thead><tr><th>${label}</th><th>Entries</th><th>Your mean</th><th>vs your average</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.k)}</td><td class="num">${x.n}</td><td class="num">${x.mean.toFixed(1)}</td><td class="num lift ${x.lift >= 0 ? "up" : "down"}">${x.lift >= 0 ? "+" : "−"}${Math.abs(x.lift).toFixed(1)}</td></tr>`).join("")}</tbody></table>`
            : `<p class="hint">Not enough scored yet.</p>`;
    return `<div class="dash">
    <section class="panel span12"><h3>In plain words · ${esc(t.mode)}</h3><p class="taste">${esc(tasteSentences(t).join(" "))}</p>
      <div class="bar"><button class="btn sm" data-act="taste-export" data-k="md">Download as Markdown</button><button class="btn sm ghost" data-act="taste-export" data-k="json">As JSON</button><span class="hint">Paste the Markdown into any assistant to get recommendations that actually fit you.</span></div></section>
    <section class="panel span6"><h3>Genres that lift your scores</h3>${table(t.genres.slice(0, 12), "Genre")}</section>
    <section class="panel span6"><h3>Genres you score lower</h3>${table(t.genres.slice(-8).reverse(), "Genre")}</section>
    ${t.themes.length ? `<section class="panel span6"><h3>Themes</h3>${table(t.themes.slice(0, 12), "Theme")}</section>` : ""}
    <section class="panel span6"><h3>Creators and studios</h3>${table(t.creators.slice(0, 12), "Creator")}</section>
    <section class="panel span6"><h3>Types</h3>${table(t.types.slice(0, 10), "Type")}</section>
    ${t.decades.length ? `<section class="panel span6"><h3>Decades</h3>${table(t.decades, "Decade")}</section>` : ""}
  </div>`;
}
