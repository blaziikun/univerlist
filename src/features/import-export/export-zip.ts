// src/features/import-export/export-zip.ts
// ─────────────────────────────────────────────────────────────────
//  The export, format 3: one folder per kind of thing, one file per thing you can pick on import
//
//  profile-export_<name>_<date>.zip
//  ├── manifest.json · README.md         what's inside / how to read it
//  ├── library/<medium>.json             everything you've added, one file per medium
//  ├── collections/                      what you've made from the library
//  │   └── favourites.json · lists.json (tier and ranked lists too)
//  ├── personal/                         you, and how the app looks and behaves
//  │   └── profile.json · preferences.json · themes.json
//  ├── academic.json                     the Learning Centre: your subjects and paths
//  ├── extensions/<id>/                  installed public extensions + state.json
//  ├── private/                          sealed with your backup passphrase
//  │   └── keys.json · extensions.json · collection.json
//  ├── images/<kind>/<id>.<ext>          every picture, named after what it belongs to; index.json → where each came from
//  └── readable/                         optional copies for people, never read back (lists as CSV, stats)
//
//  Uploaded pictures leave the data files and are referenced as "@images/<path>". Pictures that came from links are
//  downloaded into images/ as well, and the link stays in the data as the way back. Reading one back, every file is
//  taken as the parts it says it is and checked as they're brought in (packs.ts applyParts).
// ─────────────────────────────────────────────────────────────────

import {
    APP_V,
    at,
    b64,
    clone,
    coverCache,
    fieldsOf,
    hash,
    idbGet,
    isRecord,
    meta,
    nowISO,
    numOf,
    recordsOf,
    safeJSON,
    textOf,
    unb64,
    vaultKey,
} from "../core/core";
import { extOf, listFiles, txt } from "./importers";
import type { ImportedPicture, ZipEntry, ZipFiles } from "./importers";
import { keysForBackup, packParts, tasteMarkdown } from "./packs";
import type { Bundle, PackedParts, Parts } from "./packs";
import { EXT, extExportFiles, extFromFiles } from "../extensions/extensions";

const EXPORT_FORMAT = 3;
const IMG_DIR: Record<string, string> = {
    cover: "covers",
    coverData: "covers",
    banner: "banners",
    bannerData: "banners",
    favArt: "favourites",
    favArtData: "favourites",
    spineArt: "spines",
};
const imgDir = (k: string) => (Object.hasOwn(IMG_DIR, k) ? IMG_DIR[k] : "");
const fileId = (s: unknown) =>
    String(s)
        .replace(/[^a-z0-9._-]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "x";
const dataExt = (s: string) => {
    const m = /^data:image\/([a-z0-9+.-]+)/i.exec(s || "");
    return m ? (m[1] === "jpeg" ? "jpg" : m[1].replace("svg+xml", "svg")) : "jpg";
};
const isData = (s: unknown): s is string => typeof s === "string" && /^data:image\//.test(s);
const isWeb = (s: unknown): s is string => typeof s === "string" && /^https?:\/\//.test(s);
function dataToBytes(s: string): Uint8Array<ArrayBuffer> {
    const b = atob(s.slice(s.indexOf(",") + 1));
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
}
/** what a picture really is, from its first bytes: a file's name in a zip can say anything */
export function pictureType(u8: Uint8Array): string | null {
    const has = (i: number, ...b: number[]) => b.every((x, k) => u8[i + k] === x);
    if (has(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
    if (has(0, 0xff, 0xd8, 0xff)) return "jpeg";
    if (has(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
    if (has(0, 0x52, 0x49, 0x46, 0x46) && has(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
    if (has(4, 0x66, 0x74, 0x79, 0x70) && /^avi[fs]$/.test(String.fromCharCode(...u8.subarray(8, 12)))) return "avif";
    // no SVG: it can carry a script, and a picture here can end up as a blob address in this app's origin
    return null;
}
export const MAX_IMPORTED_PICTURE = 8 * 1048576;
/** A picture from an import as a data: address, or "" if it isn't a picture (or is far too big to be a cover). */
export function bytesToData(u8: Uint8Array | undefined): string {
    const type = u8 && u8.length <= MAX_IMPORTED_PICTURE ? pictureType(u8) : null;
    if (!u8 || !type) return "";
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return `data:image/${type};base64,${btoa(s)}`;
}
// 1. uploaded pictures out of the data, into files
function v2ExtractImages(P: PackedParts): { files: ZipEntry[]; taken: Set<string> } {
    const files: ZipEntry[] = [],
        taken = new Set<string>(),
        put = (path: string, data: string) => {
            let p = path,
                n = 2;
            while (taken.has(p)) p = path.replace(/(\.[a-z0-9]+)$/i, `-${n++}$1`);
            taken.add(p);
            files.push({ name: "images/" + p, data: dataToBytes(data) });
            return "@images/" + p;
        };
    const each = (o: Record<string, unknown>, dir: string, id: unknown) => {
        for (const [k, v] of Object.entries(o)) {
            const kd = imgDir(k);
            if (isData(v))
                o[k] = put(
                    `${kd || dir}/${fileId(id)}${kd || k === "imageData" || k === "avatarData" ? "" : "-" + fileId(k)}.${dataExt(v)}`,
                    v
                );
            else if (Array.isArray(v) && v.some(isData))
                o[k] = v.map((x, i) =>
                    isData(x) ? put(`${dir}/${fileId(id)}-${fileId(k)}-${i + 1}.${dataExt(x)}`, x) : x
                );
        }
    };
    for (const its of Object.values(P.library || {})) for (const [id, b] of Object.entries(its)) each(b, "items", id);
    for (const c of P.favourites.chars || []) each(c, "characters", c.id);
    for (const p of P.favourites.people || []) each(p, "people", p.id);
    if (P.profile)
        for (const [k, v] of Object.entries(P.profile))
            if (isData(v)) P.profile[k] = put(`profile/${k.replace(/Data$/, "")}.${dataExt(v)}`, v);
    for (const m of recordsOf(P.preferences.modes)) {
        const mp = m.profile;
        if (isRecord(mp))
            for (const [k, v] of Object.entries(mp))
                if (isData(v)) mp[k] = put(`profile/${fileId(m.id)}-${k.replace(/Data$/, "")}.${dataExt(v)}`, v);
    }
    // anything else (a theme's background, say)
    const walk = (o: unknown, path: string) => {
        if (!o || typeof o !== "object") return;
        for (const [k, v] of Object.entries(o)) {
            if (isData(v)) {
                const name = put(`other/${(hash(path + "/" + k) >>> 0).toString(36)}.${dataExt(v)}`, v);
                if (Array.isArray(o)) o[Number(k)] = name;
                else if (isRecord(o)) o[k] = name;
            } else if (typeof v === "object") walk(v, path + "/" + k);
        }
    };
    walk(P, "");
    return { files, taken };
}
/** a picture from a link, to download into the export: where from, where to, and whose it is */
interface ImageTarget {
    url: string;
    path: string;
    owner: string;
}
// 2. pictures from links, downloaded and named after their owner
function v2ImageTargets(P: PackedParts, taken: Set<string>): ImageTarget[] {
    const out: ImageTarget[] = [],
        seen = new Set<string>(),
        add = (url: unknown, path: string, owner: string) => {
            if (!isWeb(url) || seen.has(url)) return;
            let p = path,
                n = 2;
            while (taken.has(p)) p = path.replace(/(\.\w+)?$/, `-${n++}`);
            taken.add(p);
            seen.add(url);
            out.push({ url, path: p, owner });
        };
    for (const its of Object.values(P.library || {}))
        for (const [id, b] of Object.entries(its)) {
            if (!b.coverData || !String(b.coverData).startsWith("@"))
                add(b.cover, `covers/${fileId(id)}`, `item:${id}:cover`);
            if (!b.bannerData) add(b.banner, `banners/${fileId(id)}`, `item:${id}:banner`);
            if (!b.favArtData) add(b.favArt, `favourites/${fileId(id)}`, `item:${id}:favourite`);
            add(b.spineArt, `spines/${fileId(id)}`, `item:${id}:spine`);
        }
    for (const c of P.favourites.chars || [])
        add(c.image || c.alImage, `characters/${fileId(c.id)}`, `character:${c.id}`);
    for (const p of P.favourites.people || []) add(p.image, `people/${fileId(p.id)}`, `person:${p.id}`);
    const pr = P.profile || {};
    add(pr.avatar, "profile/avatar", "profile:avatar");
    add(pr.banner, "profile/banner", "profile:banner");
    if (isRecord(pr.anilist)) {
        add(pr.anilist.avatar, "profile/anilist-avatar", "profile:anilist-avatar");
        add(pr.anilist.banner, "profile/anilist-banner", "profile:anilist-banner");
    }
    for (const m of recordsOf(P.preferences.modes)) {
        const mp = fieldsOf(m.profile),
            id = textOf(m.id);
        add(mp.avatar, `profile/${fileId(id)}-avatar`, `mode:${id}:avatar`);
        add(mp.banner, `profile/${fileId(id)}-banner`, `mode:${id}:banner`);
    }
    return out;
}
async function v2DownloadImages(
    targets: ImageTarget[],
    progress?: (done: number, total: number) => void
): Promise<{ files: ZipEntry[]; index: Record<string, string> }> {
    const files: ZipEntry[] = [],
        index: Record<string, string> = {};
    let i = 0;
    for (const t of targets) {
        let blob: Blob | null = null;
        try {
            const kept = await idbGet("covers", t.url);
            if (kept instanceof Blob) blob = kept;
        } catch (_) {}
        if (!blob && navigator.onLine) {
            try {
                blob = await coverCache.fetch(t.url);
            } catch (_) {}
        }
        if (blob) {
            const name = `${t.path}.${extOf(blob.type)}`;
            files.push({ name: "images/" + name, data: new Uint8Array(await blob.arrayBuffer()) });
            index[name] = t.url;
        }
        progress && progress(++i, targets.length);
    }
    return { files, index };
}
/** a passphrase-sealed box, as it's written into an export */
interface KeysBox {
    format: string;
    cipher: string;
    kdf: string;
    iterations: number;
    salt: string;
    iv: string;
    data: string;
}
// keys travel encrypted with a passphrase you choose; without it they're unreadable
async function keysEncrypt(obj: unknown, pass: string): Promise<KeysBox> {
    const salt = crypto.getRandomValues(new Uint8Array(16)),
        iv = crypto.getRandomValues(new Uint8Array(12)),
        key = await vaultKey(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return {
        format: "univerlist-keys-1",
        cipher: "AES-256-GCM",
        kdf: "PBKDF2-SHA256",
        iterations: 310000,
        salt: b64(salt),
        iv: b64(iv),
        data: b64(ct),
    };
}
/** what a sealed box from an export holds, opened with its passphrase (it throws when the passphrase is wrong or the
 * box isn't one): JSON, as it was sealed, still to be checked by whatever reads it */
export async function keysDecrypt(box: unknown, pass: string): Promise<unknown> {
    const b = fieldsOf(box);
    const key = await vaultKey(pass, unb64(textOf(b.salt)));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(textOf(b.iv)) }, key, unb64(textOf(b.data)));
    return safeJSON(new TextDecoder().decode(pt));
}
/** what goes into an export: which parts (all unless one is false), and the private things, sealed with keysPass */
export interface ExportOpts {
    app?: boolean;
    parts?: Record<string, boolean>;
    private?: boolean;
    keysPass?: string | null;
    keysOff?: boolean;
    privExt?: boolean;
    images?: boolean;
    readable?: boolean;
}
/** the whole bundle as files, and what it says about the pictures */
export async function v2Files(
    opts: ExportOpts = {},
    progress?: (done: number, total: number) => void
): Promise<{ files: ZipEntry[]; note: string }> {
    const P = clone(packParts()),
        J = (x: unknown) => JSON.stringify(x, null, 1),
        want = (k: string) => !opts.parts || opts.parts[k] !== false,
        out: ZipEntry[] = [],
        counts: Record<string, number> = {};
    // a backup is yours, so the Learning Centre goes in whole, opportunities included (packParts leaves them out)
    if (meta.courses) P.academic = clone(meta.courses);
    const ex = v2ExtractImages(P);
    if (want("library"))
        for (const [med, its] of Object.entries(P.library)) {
            out.push({ name: `library/${med}.json`, data: J(its) });
            counts[med] = Object.keys(its).length;
        }
    const pr = { ...(P.preferences || {}) };
    if (!listLength(pr.tiers)) delete pr.tiers; // old tier lists; they live in lists now
    if (want("favourites")) out.push({ name: "collections/favourites.json", data: J(P.favourites) });
    if (want("lists")) out.push({ name: "collections/lists.json", data: J(P.lists) });
    if (want("profile")) out.push({ name: "personal/profile.json", data: J(P.profile) });
    if (want("preferences")) out.push({ name: "personal/preferences.json", data: J(pr) });
    if (want("themes")) out.push({ name: "personal/themes.json", data: J(P.themes) });
    if (want("academic") && P.academic) out.push({ name: "academic.json", data: J(P.academic) });
    if (opts.private && P.private) out.push({ name: "private/collection.json", data: J(P.private) });
    if (opts.keysPass && !opts.keysOff) {
        const k = keysForBackup();
        if (Object.keys(k).length)
            out.push({ name: "private/keys.json", data: J(await keysEncrypt(k, opts.keysPass)) });
    }
    if (want("extensions")) {
        out.push(...(await extExportFiles()));
        const priv = EXT.list.filter(x => x.private);
        if (priv.length && opts.keysPass && opts.privExt !== false)
            out.push({
                name: "private/extensions.json",
                data: J(
                    await keysEncrypt(
                        priv.map(x => ({ manifest: x.manifest, files: x.files, on: x.on, data: x.data || {} })),
                        opts.keysPass
                    )
                ),
            });
    }
    let imgNote = "";
    if (opts.images !== false) {
        const T = v2ImageTargets(P, ex.taken),
            dl = await v2DownloadImages(T, progress);
        out.push(...ex.files, ...dl.files);
        const index = dl.index;
        for (const f of ex.files) index[f.name.replace(/^images\//, "")] = "uploaded";
        out.push({ name: "images/index.json", data: J(index) });
        imgNote = `${dl.files.length + ex.files.length} pictures packed${dl.files.length < T.length ? ` (${T.length - dl.files.length} links couldn't be downloaded; they stay as links)` : ""}.`;
    } else out.push(...ex.files);
    if (opts.readable) {
        out.push(...listFiles("sep").map(f => ({ ...f, name: "readable/" + f.name })));
        out.push({ name: "readable/stats.md", data: tasteMarkdown() });
    }
    out.push({ name: "README.md", data: V2_README });
    out.unshift({
        name: "manifest.json",
        data: J({
            app: "univerlist",
            format: EXPORT_FORMAT,
            v: APP_V,
            savedAt: nowISO(),
            counts,
            images: out.filter(f => /^images\/(?!index\.json)/.test(f.name)).length,
        }),
    });
    return { files: out, note: imgNote };
}
const listLength = (x: unknown) => (Array.isArray(x) ? x.length : 0);
// reading it back: the same parts the app works with
// format 1 keeps everything under data/ (data/library/…, data/preferences.json); formats 2 and 3 don't. Check for format 1 first,
// or its data/library/ looks like the new library/ and the old export is read by the wrong reader.
const isV1 = (files: ZipFiles) =>
    [...files.keys()].some(k => /(^|\/)data\/(library\/[^/]+|favourites|lists|preferences)\.json$/.test(k));
export function isV2(files: ZipFiles): boolean {
    return (
        !isV1(files) &&
        [...files.keys()].some(k =>
            /(^|\/)(library\/[^/]+\.json|personal\/(settings|preferences)\.json|academic\.json)$/.test(k)
        )
    );
}
/** an export of format 2 or 3, as the parts the app works with (each still to be checked as it's brought in) */
export function partsFromV2(files: ZipFiles): Bundle {
    const key = (n: string) => [...files.keys()].find(x => x === n || x.endsWith("/" + n)),
        get = (n: string): unknown => {
            const k = key(n);
            return k ? safeJSON(txt(files.get(k))) : null;
        },
        parts: Parts = {};
    const libKeys = [...files.keys()].filter(k => /(^|\/)library\/[^/]+\.json$/.test(k));
    if (libKeys.length) {
        const library: Record<string, unknown> = {};
        for (const k of libKeys) Object.assign(library, fieldsOf(safeJSON(txt(files.get(k)))));
        parts.library = library;
    }
    // format 3 names first; format 2 names are still read, so older exports come in too
    const fav = get("collections/favourites.json"),
        lists = get("collections/lists.json"),
        rank = get("collections/ranking.json");
    if (fav) parts.favourites = fav;
    if (lists) parts.lists = lists;
    const pref = get("personal/preferences.json"),
        set = get("personal/settings.json"),
        modes = get("personal/modes.json"),
        tiers = listLength(at(rank, "tiers")) ? at(rank, "tiers") : null;
    if (pref || set || modes || rank)
        parts.preferences = {
            ...fieldsOf(pref),
            ...fieldsOf(set),
            ...fieldsOf(modes),
            ...(tiers ? { tiers } : {}),
        };
    const th = get("personal/themes.json"),
        pf = get("personal/profile.json");
    if (th) parts.themes = th;
    if (pf) parts.profile = pf;
    const A = get("academic.json");
    if (A) parts.academic = A;
    else {
        const L = get("apps/academic/learning.json"),
            Pw = get("apps/academic/pathways.json"),
            C = get("apps/academic/curricula.json"),
            Pr = get("apps/academic/programmes.json");
        if (L || Pw || C || Pr) {
            const { programmes, ...rest } = fieldsOf(Pr);
            parts.academic = {
                ...rest,
                programmes: programmes || [],
                ...(L ? { learn: L } : {}),
                ...(Pw ? { paths: Pw } : {}),
                ...(C ? { cur: C } : {}),
            };
        }
    }
    const pc = get("private/collection.json");
    if (pc) parts.private = pc;
    const pk = get("private/keys.json");
    if (pk) parts.keys = isRecord(pk) && pk.format ? { __locked: pk } : pk;
    const px = get("private/extensions.json");
    if (px) parts.privext = { __locked: px };
    // uploaded pictures back into the data
    const resolve = (o: unknown) => {
        if (!o || typeof o !== "object") return;
        for (const [k, v] of Object.entries(o)) {
            if (typeof v === "string" && v.startsWith("@images/")) {
                const f = key(v.slice(1)),
                    data = f ? bytesToData(files.get(f)) : "";
                if (Array.isArray(o)) o[Number(k)] = data;
                else if (isRecord(o)) o[k] = data;
            } else if (typeof v === "object") resolve(v);
        }
    };
    resolve(parts);
    // pictures from links: the cache gets them under their original address
    const idx = get("images/index.json"),
        IX = idx && (at(idx, "files") || idx);
    if (isRecord(IX)) {
        const L2: ImportedPicture[] = [];
        for (const [p, e0] of Object.entries(IX)) {
            const src = typeof e0 === "string" ? e0 : at(e0, "src");
            if (isWeb(src)) {
                const f = key("images/" + p),
                    data = f && files.get(f);
                if (data) L2.push([src, data, p]);
            }
        }
        if (L2.length) parts.images = L2;
    }
    const ext = extFromFiles(files);
    if (ext && ext.length) parts.extensions = ext;
    const manifest = get("manifest.json"),
        man = fieldsOf(manifest);
    return {
        parts,
        savedAt: textOf(man.savedAt) || undefined,
        v: manifest ? numOf(man.v) : APP_V,
        format: numOf(man.format) || 2,
    };
}
const V2_README = `# UniverList export

*Everything personal from UniverList. The app itself is index.html; this is only your data.*

## What's where

| Folder | Holds |
| --- | --- |
| library/ | Everything you've added, one file per medium (anime.json, book.json, game.json…) |
| collections/ | favourites.json (order, characters, people), lists.json (Up next, every list, tier and ranked lists) |
| personal/ | profile.json, preferences.json (settings, and each mode's tabs, views and shelves), themes.json |
| academic.json | The learning centre: the Learning Centre: your subjects and paths |
| extensions/ | Public extensions you installed, each with a state.json (on/off, its settings) |
| private/ | Sealed with the backup passphrase you chose: keys.json, extensions.json (private extensions), collection.json (the private collection) |
| images/ | Every picture, named after what it belongs to: covers/, banners/, spines/, favourites/, characters/, people/, profile/. index.json maps each one to where it came from |
| readable/ | Optional copies for people (lists as spreadsheets, stats). Never read back in |

Each file is one thing you can tick on or off when importing.

## Notes

- Pictures you uploaded live only in images/: the data files point to them as "@images/…".
- Pictures from links are in images/ too, and the data keeps the link as the way back.
- To restore: open index.html → Settings → Import & export → drop this .zip in. Pick which parts to bring in.
- To host it: put index.html and this zip side by side on any static host; the first visit loads it.
`;
