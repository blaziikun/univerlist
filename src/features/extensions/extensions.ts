// src/features/extensions/extensions.ts
// ─────────────────────────────────────────────────────────────────
//  Extensions: extra abilities you install, switch on and off, and keep private if you like
//
//  An extension is a folder (or a .zip of one) with extension.json and its code, or a single .json or .js file. Each
//  runs in its own sandboxed frame: it can't see your library, your keys or the page, only what it asks the app for
//  through a small messaging API, and the app only calls it for the jobs it registered (sources for an episode, say). A
//  companion is a small program on your own computer (or server) the extension talks to, for things a web page can't
//  do.
//
//  extension.json
//    id, name, version, description, author
//    main          the script to run (main.js)
//    permissions   what it may ask for: "storage", "companion", "watch.sources", "read.sources"
//    companion     { url: "http://127.0.0.1:7878", health: "/health", setup: "how to start it" }
//    settings      [{ key, label, type: "text" | "toggle" | "number", default }]  (shown in Settings › Extensions)
// ─────────────────────────────────────────────────────────────────

import {
    cleanTitle,
    closestTo,
    errMessage,
    fieldsOf,
    idbAll,
    isRecord,
    items,
    listOf,
    markDirty,
    meta,
    nowISO,
    openDB,
    textOf,
    ticked,
    toast,
    toList,
    tx,
    ui,
} from "../core/core";
import { renderMain } from "../core/shell";
import { txt, unzip } from "../import-export/importers";
import { isOwnNetwork, isOwnSource } from "../watch-read/own-sources";
import { renderPlayer, srvRefresh, W } from "../watch-read/watch";
import { ssHeldBy } from "../watch-read/series";
import { srvApplyPref } from "../watch-read/player";
import type { WatchPlayer, WatchSource } from "../core/model";

/** a setting an extension asks for (Settings › Extensions shows it) */
export interface ExtSetting {
    key: string;
    label: string;
    type?: string; // "text", "toggle", "number"
    default?: unknown;
    secret?: boolean; // kept out of the readable part of a backup
    was?: string[]; // older settings it replaced
    [field: string]: unknown;
}
/** an extension's manifest (extension.json), once extFromParts has checked it */
export interface ExtManifest {
    id: string;
    name: string;
    main: string;
    permissions: string[];
    settings: ExtSetting[];
    version?: unknown;
    description?: unknown;
    author?: unknown;
    companion?: unknown; // { url, health, setup }
    hosts?: unknown; // the web addresses it may reach (net)
    seriesServers?: unknown;
    private?: unknown;
    [field: string]: unknown;
}
/** an extension's companion, as its manifest describes it: where it runs, its health check, how to start it */
export interface ExtCompanion {
    url: string;
    health: string;
    setup: string;
}
export const companionOf = (m: ExtManifest): ExtCompanion | null => {
    const c = m.companion;
    return isRecord(c) ? { url: textOf(c.url), health: textOf(c.health), setup: textOf(c.setup) } : null;
};
/** what an extension keeps: your settings for it, its own storage, and per-series servers */
export interface ExtData {
    settings?: Record<string, unknown>;
    series?: Record<string, { value: string; [field: string]: unknown }[]>;
    [field: string]: unknown;
}
/** an installed extension, as it's stored */
export interface ExtRecord {
    manifest: ExtManifest;
    files: Record<string, string>;
    on: boolean;
    private?: boolean;
    data: ExtData;
    at?: string;
}
/** a running extension's frame, and the jobs it said it does */
interface ExtFrame {
    frame: HTMLIFrameElement;
    jobs: Set<string>;
}
/** a call to an extension waiting for its answer, and the extension it was sent to: only that one's frame may answer */
interface ExtWait {
    ext: string;
    ok: (res: unknown) => void;
    no: (err: Error) => void;
    t: ReturnType<typeof setTimeout>;
}
export const EXT: {
    list: ExtRecord[];
    frames: Map<string, ExtFrame>;
    wait: Map<string, ExtWait>;
    n: number;
    health: Record<string, string>;
    db: IDBDatabase | null;
    pinged?: boolean;
} = { list: [], frames: new Map(), wait: new Map(), n: 0, health: {}, db: null };
export const EXT_PERMS: Record<string, string> = {
    storage: "Keep its own settings",
    companion: "Talk to its companion program",
    "watch.sources": "Offer sources for episodes and films",
    "read.sources": "Offer sources for chapters",
    net: "Reach the web addresses it lists, and nothing else",
};
// official extensions that come with the app: nothing of them runs until you add one
export const EXT_OFFICIAL: [id: string, name: string, about: string][] = [
    [
        "local-media-player",
        "Your own video files",
        "Plays shows and films from folders on your computer, through a small companion program.",
    ],
];
// the only web an extension can reach: https, to the hosts its manifest names, through the app (so it can be seen and stopped)
// what the extension sent is checked here: it's from the extension's own code, so anything at all
export async function extNetFetch(x: ExtRecord, request: unknown) {
    const req = fieldsOf(request),
        u = new URL(String(req.url || "")),
        hosts = toList(x.manifest.hosts || []);
    if (u.protocol !== "https:" || !hosts.includes(u.hostname))
        throw new Error(`${u.hostname} isn't one of this extension's addresses`);
    const body = req.body == null ? undefined : String(req.body);
    if (body && body.length > 1e6) throw new Error("too much to send");
    const headers = Object.fromEntries(
        Object.entries(fieldsOf(req.headers))
            .filter(([k]) => /^[a-z0-9-]+$/i.test(k) && !/^(cookie|host|origin|referer)$/i.test(k))
            .map(([k, v]) => [k, String(v)])
    );
    const r = await fetch(u.href, {
        method: req.method === "POST" ? "POST" : "GET",
        headers,
        body,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(90000),
    });
    const text = (await r.text()).slice(0, 2e6);
    return { status: r.status, text };
}
export async function extDB() {
    if (!EXT.db) EXT.db = await openDB("univerlist-extensions", 1, ["x"]);
    return EXT.db;
}
/** a stored extension, read back: written by extSave, but storage can hold anything, so its shape is checked */
function isExtRecord(v: unknown): v is ExtRecord {
    if (!isRecord(v) || !isRecord(v.manifest) || !isRecord(v.files)) return false;
    const m = v.manifest;
    return (
        typeof m.id === "string" &&
        typeof m.name === "string" &&
        typeof m.main === "string" &&
        Array.isArray(m.permissions) &&
        m.permissions.every(p => typeof p === "string") &&
        (m.settings === undefined || (Array.isArray(m.settings) && m.settings.every(isSetting))) &&
        Object.values(v.files).every(f => typeof f === "string") &&
        (v.data === undefined || isRecord(v.data))
    );
}
const isSetting = (s: unknown): s is ExtSetting =>
    isRecord(s) && typeof s.key === "string" && /^[\w.-]{1,40}$/.test(s.key);
async function extLoadAll() {
    try {
        const all = await idbAll("x", await extDB());
        EXT.list = all
            .map(([, v]) => v)
            .filter(isExtRecord)
            .map(x => ({ ...x, data: x.data || {}, manifest: { ...x.manifest, settings: x.manifest.settings || [] } }))
            .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
        await extMigrateIds();
    } catch (_) {
        EXT.list = [];
    }
    for (const x of EXT.list) if (x.on) extStart(x);
}
// Extensions that were renamed. An old install, an old backup or an old .zip of one comes in under the new name, and its
// settings and per-series servers come with it (when both are there, what the new one already has wins).
const EXT_RENAMED: Record<string, string> = { "local-media": "local-media-player" };
const extNewId = (id: string) => EXT_RENAMED[id] || id;
// Official extensions that no longer exist. A copy added before is removed (with its settings, a saved API key
// included), and one in an old backup isn't brought back. Only UniverList's own: someone's extension that happens to
// share the id is left alone. The id is kept only to recognise those old copies.
const EXT_RETIRED = new Set(["ai-assistant"]);
const extRetired = (x: ExtRecord) => EXT_RETIRED.has(x.manifest.id) && x.manifest.author === "UniverList";
function extMergeData(older: ExtData | undefined, newer: ExtData | undefined): ExtData {
    const a = older || {},
        b = newer || {};
    return {
        ...a,
        ...b,
        settings: { ...(a.settings || {}), ...(b.settings || {}) },
        series: { ...(a.series || {}), ...(b.series || {}) },
    };
}
async function extMigrateIds() {
    for (const x of EXT.list.filter(extRetired)) {
        EXT.list = EXT.list.filter(y => y !== x);
        await tx(
            "x",
            "readwrite",
            s => {
                s.delete(x.manifest.id);
            },
            await extDB()
        );
    }
    for (const x of EXT.list.filter(y => EXT_RENAMED[y.manifest.id])) {
        const oldId = x.manifest.id,
            nid = EXT_RENAMED[oldId],
            cur = EXT.list.find(y => y.manifest.id === nid);
        if (cur) {
            cur.data = extMergeData(x.data, cur.data);
            await extSave(cur);
            EXT.list = EXT.list.filter(y => y !== x);
        } else {
            x.manifest = { ...x.manifest, id: nid };
            await extSave(x);
        }
        await tx(
            "x",
            "readwrite",
            s => {
                s.delete(oldId);
            },
            await extDB()
        );
    }
}
export async function extSave(x: ExtRecord) {
    await tx(
        "x",
        "readwrite",
        s => {
            s.put(x, x.manifest.id);
        },
        await extDB()
    );
}
export const extGet = (id: string) => EXT.list.find(x => x.manifest.id === id);
// ── installing: a zip, a folder's files, a manifest with its code, or one .js file with its manifest in a header comment ──
// The manifest and the files come from whoever made the extension: everything in them is checked here.
export function extFromParts(raw: unknown, files: Record<string, string>): Pick<ExtRecord, "manifest" | "files"> {
    const manifest = fieldsOf(raw);
    if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,60}$/i.test(manifest.id))
        throw new Error("extension.json needs an id (letters, numbers, dots or dashes).");
    const id = extNewId(manifest.id); // an old one, under its new name
    const name = manifest.name ? String(manifest.name) : id;
    const main = manifest.main ? String(manifest.main) : "main.js";
    if (!files[main]) throw new Error(`The extension's main script (${main}) is missing.`);
    // only permissions the app knows, each once; only settings that are well formed, each key once
    const permissions = [
        ...new Set(listOf(manifest.permissions).filter((p): p is string => typeof p === "string" && !!EXT_PERMS[p])),
    ];
    const seen = new Set<string>();
    const settings = listOf(manifest.settings)
        .filter(isSetting)
        .filter(x => x.key !== "companionUrl" && !seen.has(x.key) && !!seen.add(x.key))
        .map(x => ({ ...x, label: String(x.label || x.key).slice(0, 120) }));
    return { manifest: { ...manifest, id, name, permissions, settings, main }, files };
}
async function extParse(file: File) {
    const name = file.name || "",
        buf = await file.arrayBuffer(),
        u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
        const Z = await unzip(buf),
            keys = [...Z.keys()],
            mk = keys
                .filter(k => /(^|\/)extension\.json$/.test(k))
                .sort((a, b) => a.split("/").length - b.split("/").length)[0];
        if (!mk) throw new Error("No extension.json in that zip.");
        const root = mk.replace(/extension\.json$/, ""),
            files: Record<string, string> = {};
        for (const k of keys)
            if (
                k.startsWith(root) &&
                !k.endsWith("/") &&
                /\.(js|mjs|json|css|html|md|txt|svg)$/i.test(k) &&
                !/(^|\/)companion\//.test(k.slice(root.length))
            )
                files[k.slice(root.length)] = txt(Z.get(k) || new Uint8Array());
        return extFromParts(JSON.parse(files["extension.json"]), files);
    }
    const text = new TextDecoder().decode(u8);
    if (/\.json$/i.test(name) || text.trim().startsWith("{")) {
        const j = fieldsOf(JSON.parse(text));
        if (j.manifest && j.files) return extFromParts(j.manifest, textFiles(j.files));
        if (j.code) {
            const { code, ...m } = j;
            return extFromParts({ ...m, main: "main.js" }, { "main.js": String(code) });
        }
        throw new Error("That .json isn't an extension: it needs a manifest and its code.");
    }
    const head = /\/\*\s*univerlist-extension\s*([\s\S]*?)\*\//.exec(text);
    if (!head) throw new Error("A single-file extension starts with /* univerlist-extension { …manifest… } */.");
    return extFromParts({ ...fieldsOf(JSON.parse(head[1])), main: "main.js" }, { "main.js": text });
}
/** an extension's files from a .json: only the ones that are text */
const textFiles = (x: unknown): Record<string, string> =>
    Object.fromEntries(Object.entries(fieldsOf(x)).filter((e): e is [string, string] => typeof e[1] === "string"));
export async function extInstall(file: File) {
    try {
        const x = await extParse(file),
            old = extGet(x.manifest.id),
            rec: ExtRecord = {
                ...x,
                on: old ? old.on : true,
                private: old ? old.private : !!x.manifest.private,
                data: old ? old.data : {},
                at: nowISO(),
            };
        if (old) extStop(old);
        await extSave(rec);
        EXT.list = [...EXT.list.filter(y => y.manifest.id !== rec.manifest.id), rec];
        if (rec.on) extStart(rec);
        toast(
            `${old ? "Updated" : "Installed"} ${rec.manifest.name}${rec.manifest.version ? " " + rec.manifest.version : ""}`
        );
        if (ui.page === "settings") renderMain();
        return rec;
    } catch (e) {
        toast("Couldn't install that: " + errMessage(e));
        return null;
    }
}
// ── running: one sandboxed frame each, talking by messages ──
const EXT_SDK = `const univerlist = (() => {
  let n = 0; const wait = new Map(), jobs = {};
  addEventListener("message", e => { const m = e.data; if (!m || m.__ul !== 1) return;
    if (m.re){ const w = wait.get(m.re); if (w){ wait.delete(m.re); m.err ? w[1](new Error(m.err)) : w[0](m.res); } return; }
    if (m.job){ const f = jobs[m.job]; Promise.resolve(f ? f(...(m.args || [])) : null).then(res => parent.postMessage({ __ul: 1, re: m.id, res }, "*"), err => parent.postMessage({ __ul: 1, re: m.id, err: String((err && err.message) || err) }, "*")); } });
  const ask = (fn, ...args) => new Promise((ok, no) => { const id = ++n; wait.set(id, [ok, no]); parent.postMessage({ __ul: 1, id, fn, args }, "*"); });
  return {
    provide(job, f){ jobs[job] = f; return ask("provide", job); },
    storage: { get: k => ask("storage.get", k), set: (k, v) => ask("storage.set", k, v) },
    settings: () => ask("settings"),
    toast: t => ask("toast", String(t)),
    file: p => ask("file", p),
    net: { fetch: req => ask("net.fetch", req) },
    companion: { url: () => ask("companion.url"), async get(path){ const base = await ask("companion.url"); const r = await fetch(base + path); if (!r.ok) throw new Error("companion " + r.status); return r.json(); } },
  };
})();`;
// a setting can say which older settings it replaced ("was": [keys]); their values fold into it once, so nothing typed before is lost
function extFoldSettings(x: ExtRecord) {
    const S = (x.data && x.data.settings) || {};
    let changed = false;
    for (const def of x.manifest.settings || [])
        for (const old of listOf(def.was).map(String))
            if (old in S) {
                const v = String(S[old] || "").trim();
                if (v) S[def.key] = [String(S[def.key] || "").trim(), v].filter(Boolean).join("\n");
                delete S[old];
                changed = true;
            }
    if (changed) {
        x.data = { ...(x.data || {}), settings: S };
        extSave(x);
    }
}
// What an extension's own code may reach by itself: only its companion, if it has that permission. Everything else
// (the web at its listed hosts) goes through the app, which checks it (the message handler below). Without
// this, the frame's code could call fetch() anywhere, and "nowhere else" in its permissions would be a promise only
function extPolicy(x: ExtRecord) {
    let companion = "'none'";
    if (x.manifest.permissions.includes("companion"))
        try {
            const u = new URL(extCompanionURL(x));
            if (/^https?:$/.test(u.protocol)) companion = u.origin;
        } catch {
            /* no companion address yet: nothing to reach */
        }
    return `default-src 'none'; script-src 'unsafe-inline'; connect-src ${companion}`;
}
function extStart(x: ExtRecord) {
    extFoldSettings(x);
    extStop(x);
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");
    f.hidden = true;
    f.title = "extension " + x.manifest.id;
    const raw = String(x.files[x.manifest.main] || ""),
        code = raw.replace(/<\/script/gi, "<\\/script"),
        policy = extPolicy(x);
    // served from the site: the extension runs in ext-host.html, the one page whose security policy allows its inline code;
    // opened as a file (the one-file build): there are no headers, so it runs from srcdoc
    if (/^https?:$/.test(location.protocol)) {
        const ready = (e: MessageEvent) => {
            if (e.source !== f.contentWindow || !isRecord(e.data) || e.data.__ulready !== 1) return;
            removeEventListener("message", ready);
            f.contentWindow?.postMessage({ __ulboot: 1, sdk: EXT_SDK, code: raw, policy }, "*");
        };
        addEventListener("message", ready);
        f.src = "ext-host.html";
    } else {
        // biome-ignore lint/suspicious/noUselessEscapeInString: <\/script> keeps the app's own <script> whole when it's inlined (the one-file build)
        f.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><script>${EXT_SDK}<\/script><script>${code}<\/script>`;
    }
    document.body.append(f);
    EXT.frames.set(x.manifest.id, { frame: f, jobs: new Set() });
}
export function extStop(x: ExtRecord) {
    const F = EXT.frames.get(x.manifest.id);
    if (F) {
        F.frame.remove();
        EXT.frames.delete(x.manifest.id);
    }
}
// the app asks an extension to do one of its jobs; a slow or silent one is given up on, never waited for forever
// what comes back is whatever the extension sent: unknown until it's checked
export let extCall = (id: string, job: string, args: unknown[], ms = 8000): Promise<unknown> => {
    const F = EXT.frames.get(id);
    if (!F || !F.jobs.has(job)) return Promise.resolve(null);
    return new Promise((ok, no) => {
        const n = "h" + ++EXT.n,
            t = setTimeout(() => {
                EXT.wait.delete(n);
                no(new Error("timed out"));
            }, ms);
        EXT.wait.set(n, { ext: id, ok, no, t });
        F.frame.contentWindow?.postMessage({ __ul: 1, id: n, job, args }, "*");
    });
};
// the browser tests put a stand-in in its place, through the test hook (core/test-hook.ts)
export function replaceExtCall(f: typeof extCall) {
    extCall = f;
}
async function extEach(job: string, args: unknown[], ms: number) {
    const out: { id: string; r: unknown }[] = [];
    await Promise.all(
        [...EXT.frames.entries()]
            .filter(([, F]) => F.jobs.has(job))
            .map(async ([id]) => {
                try {
                    const r = await extCall(id, job, args, ms);
                    if (r) out.push({ id, r });
                } catch (_) {}
            })
    );
    return out;
}
const extSettingsOf = (x: ExtRecord) =>
    Object.fromEntries(
        (x.manifest.settings || []).map(s => [s.key, (x.data.settings || {})[s.key] ?? s.default ?? ""])
    );
// The companion address an extension may use: one you typed in its settings, or the one it came with only if that's on
// your own network (this computer, your home network, Tailscale). An address it brings from anywhere else counts for
// nothing, so an extension (or a backup carrying one) can't make a website count as yours (own-sources.ts). Without the
// companion permission it has no companion at all, whatever its settings hold
export function extCompanionURL(x: ExtRecord) {
    if (!x.manifest.permissions.includes("companion")) return "";
    const typed = String((x.data.settings || {}).companionUrl || "").trim();
    if (typed) return typed.replace(/\/+$/, "");
    const given = (companionOf(x.manifest)?.url || "").replace(/\/+$/, "");
    try {
        return given && isOwnNetwork(new URL(given).hostname.toLowerCase()) ? given : "";
    } catch {
        return "";
    }
}
export async function extPing(x: ExtRecord) {
    const u = extCompanionURL(x);
    if (!u) {
        EXT.health[x.manifest.id] = "none";
        return;
    }
    EXT.health[x.manifest.id] = "…";
    try {
        const r = await fetch(u + (companionOf(x.manifest)?.health || "/health"), {
            signal: AbortSignal.timeout(2500),
        });
        EXT.health[x.manifest.id] = r.ok ? "on" : "off";
    } catch (_) {
        EXT.health[x.manifest.id] = "off";
    }
}
// ── where extensions plug in: sources for an episode or film on the player page ──
// a source an extension offered: an object with a web address
const web = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//.test(u);
const offered = (r: unknown) =>
    toList<unknown>(r || []).filter((s): s is Record<string, unknown> & { url: string } => isRecord(s) && web(s.url));
export async function extWatchSources(ctx: unknown) {
    const R = await extEach("watch.sources", [ctx], 8000),
        out: WatchSource[] = [];
    for (const { id, r } of R) {
        const name = extGet(id)?.manifest.name || id;
        for (const s of offered(r))
            if (isOwnSource(s.url))
                out.push({
                    name: String(s.name || name).slice(0, 60),
                    url: s.url,
                    how: textOf(s.how),
                    owner: name,
                    ext: id,
                });
    }
    return out;
}
// asked each time an episode or film opens; what comes back joins the other sources (first one plays if nothing else could)
// Each extension is asked on its own and its sources are added as they arrive, so a quick one isn't held up by a slow one (one still
// fetching can take a minute). While any is still looking, an empty player says so.
export async function extAddSources(p: WatchPlayer | null) {
    const ids = [...EXT.frames.entries()].filter(([, F]) => F.jobs.has("watch.sources")).map(([id]) => id);
    if (!p || !ids.length) return;
    const sh = W.show,
        S = W.seasons[p.si || 0];
    const base = {
        title: cleanTitle(
            (sh?.groupId ? (meta.watchGroups || {})[sh.groupId]?.name || sh.title : sh?.title || p.show) || ""
        ),
        seasonTitle: S?.title ? cleanTitle(S.title) : "",
        medium: sh?.medium || "",
        year: sh?.year || null,
        ids: { ...(sh?.ext || {}) },
        season: S?.n || 1,
        seasons: W.seasons.length,
        episode: p.e ?? null,
        film: !!p.film,
        // every name the show goes by (English, romaji, the original, the season's own), so a library entry filed under one name
        // still finds uploads named another way
        titles: [
            ...new Set(
                [
                    sh?.title,
                    sh?.alt?.en,
                    sh?.alt?.romaji,
                    S?.member ? items.get(S.member)?.title : undefined,
                    ...(sh?.alt?.syn || []),
                ]
                    .filter((t): t is string => !!t)
                    .map(t => cleanTitle(t))
            ),
        ].slice(0, 6),
    };
    p.looking = (p.looking || 0) + ids.length;
    if (!p.srcs.length) renderPlayer();
    await Promise.all(
        ids.map(async id => {
            const x = extGet(id);
            if (!x) return;
            let L: WatchSource[] = [];
            // only an extension that says it keeps servers per series is given this series' own (the links it plays)
            const held = toList(x.manifest.seriesServers || []).length,
                all = held
                    ? [
                          ...new Set(
                              Object.values((x.data || {}).series || {})
                                  .flat()
                                  .map(s => s && s.value)
                                  .filter(Boolean)
                          ),
                      ]
                    : [];
            // items: this series' own; all: every one it holds (so it can keep them all ready, not just this show's)
            const ctx = { ...base, servers: { items: held ? ssHeldBy(x).map(s => s.value) : [], all } };
            try {
                const r = await extCall(id, "watch.sources", [ctx], 95000);
                L = offered(r)
                    .filter(s => isOwnSource(s.url)) // only your own (watch-read/own-sources.ts)
                    .map(s => ({
                        name: String(s.name || x.manifest.name).slice(0, 80),
                        url: s.url,
                        how: textOf(s.how),
                        owner: x.manifest.name,
                        ext: id,
                        info: web(s.info) ? s.info : undefined,
                        subs: Array.isArray(s.subs) ? offered(s.subs).slice(0, 40).map(subtitle) : undefined,
                    }));
            } catch (_) {}
            if (W.player !== p) return;
            p.looking = (p.looking || 0) - 1;
            const was = p.srcs.length;
            for (const s of L) if (!p.srcs.some(y => y.url === s.url)) p.srcs.push(s);
            if (!was && p.srcs.length) {
                p.k = 0;
                renderPlayer();
            } else if (!p.srcs.length && (p.looking || 0) <= 0) renderPlayer();
            else {
                srvRefresh(p);
                srvApplyPref(p);
            } // more servers, or done looking: the bar updates without restarting what's playing; your usual server for this show takes over if you haven't really started
        })
    );
}
// a subtitle track an extension offered
const subtitle = (t: Record<string, unknown> & { url: string }) => ({
    url: t.url,
    label: String(t.label || "Subtitles").slice(0, 60),
    lang: String(t.lang || "").slice(0, 12),
    forced: !!t.forced,
});
// ── in backups: every extension that isn't private, with its settings and saved data ──
// A setting an extension marks secret (an API key, a companion password) never goes into the readable part of a backup:
// with a backup passphrase it's sealed in private/keys.json beside your own keys (extSecrets), and comes back on import
// (extRestoreSecrets); without one it stays out, like your keys do.
const extSecretKeys = (x: ExtRecord) => (x.manifest.settings || []).filter(s => s.secret).map(s => s.key);
function extWithoutSecrets(x: ExtRecord) {
    const S = { ...((x.data || {}).settings || {}) };
    for (const k of extSecretKeys(x)) delete S[k];
    return { ...(x.data || {}), settings: S };
}
export function extSecrets() {
    const out: Record<string, Record<string, unknown>> = {};
    for (const x of EXT.list)
        if (!x.private) {
            const S = (x.data || {}).settings || {},
                got = Object.fromEntries(
                    extSecretKeys(x)
                        .filter(k => S[k])
                        .map(k => [k, S[k]])
                );
            if (Object.keys(got).length) out[x.manifest.id] = got;
        }
    return out;
}
// map: what a backup's private part sealed, read back on import
export async function extRestoreSecrets(map: unknown, rep?: boolean) {
    for (const [id, S] of Object.entries(fieldsOf(map))) {
        const x = extGet(id);
        if (!x || !isRecord(S)) continue;
        const cur = (x.data || {}).settings || {},
            next = { ...cur };
        for (const k of extSecretKeys(x)) if (typeof S[k] === "string" && S[k] && (rep || !cur[k])) next[k] = S[k];
        x.data = { ...(x.data || {}), settings: next };
        await extSave(x);
    }
}
export async function extExportFiles() {
    const out: { name: string; data: string }[] = [];
    for (const x of EXT.list)
        if (!x.private) {
            const d = `extensions/${x.manifest.id}/`;
            for (const [p, t] of Object.entries(x.files))
                if (p !== "extension.json") out.push({ name: d + p, data: t });
            out.push({ name: d + "extension.json", data: JSON.stringify(x.manifest, null, 1) }); // always, so one installed from a single .json or .js file comes back too
            out.push({
                name: d + "state.json",
                data: JSON.stringify({ on: x.on, data: extWithoutSecrets(x) }, null, 1),
            });
        }
    return out;
}
// a backup's extensions: the files under extensions/<id>/, checked as they would be when installed
export function extFromFiles(files: Map<string, Uint8Array>): ExtRecord[] {
    const by: Record<string, Record<string, string>> = {};
    for (const [k, bytes] of files) {
        const m = /(?:^|\/)extensions\/([^/]+)\/(.+)$/.exec(k);
        if (m) (by[m[1]] = by[m[1]] || {})[m[2]] = txt(bytes);
    }
    return Object.values(by)
        .filter(f => f["extension.json"])
        .map((f): ExtRecord | null => {
            try {
                const st = fieldsOf(f["state.json"] ? JSON.parse(f["state.json"]) : {});
                const { "state.json": _, ...rest } = f;
                return {
                    ...extFromParts(JSON.parse(f["extension.json"]), rest),
                    on: st.on !== false,
                    data: isRecord(st.data) ? st.data : {},
                    private: false,
                    at: nowISO(),
                };
            } catch (_) {
                return null;
            }
        })
        .filter((x): x is ExtRecord => x !== null);
}
// how: "all" brings in the extension from the backup with its settings; "settings" keeps the version you have and only brings
// its settings and servers across (when it isn't installed, there's nothing to keep, so the backup's version comes in).
// An extension runs code, so one that arrives in a backup (or from another device) comes in switched off, unless the
// very same code is already here: you see what it asks for in Settings › Extensions before it runs. A backup someone
// sends you can't start anything by itself
export async function extRestore(list: ExtRecord[] | null | undefined, how = "all") {
    let kept = 0,
        arrivedOff = 0;
    for (const rec of list || []) {
        if (extRetired(rec)) continue;
        const old = extGet(rec.manifest.id);
        if (old && old.private && !rec.private) continue;
        if (how === "settings" && old) {
            old.data = extMergeData(old.data, rec.data);
            await extSave(old);
            kept++;
            continue;
        }
        const sameCode = old && JSON.stringify(old.files) === JSON.stringify(rec.files);
        if (!sameCode && rec.on) {
            rec.on = false;
            arrivedOff++;
        } else if (sameCode && old) rec.on = old.on;
        if (old) extStop(old);
        await extSave(rec);
        EXT.list = [...EXT.list.filter(y => y.manifest.id !== rec.manifest.id), rec];
        if (rec.on) extStart(rec);
    }
    if (arrivedOff)
        toast(
            `${arrivedOff === 1 ? "An extension" : `${arrivedOff} extensions`} came in switched off: check what ${arrivedOff === 1 ? "it asks" : "they ask"} for in Settings › Extensions, then turn ${arrivedOff === 1 ? "it" : "them"} on.`
        );
    return kept;
}
// removing an extension leaves nothing behind: its record (settings, per-series servers) goes with it above; here, what the app
// remembered about it (your usual server pointing at it, its health, its sources in the open player)
function extForget(x: ExtRecord) {
    const id = x.manifest.id,
        name = x.manifest.name;
    const P = meta.settings.srvPref || {};
    for (const [k, v] of Object.entries(P)) if (v && (v.who === name || v.who === id || v.ext === id)) delete P[k];
    delete EXT.health[id];
    if (ui.extOpen) delete ui.extOpen[id];
    if (W.player && W.player.srcs) {
        const was = W.player.srcs.length;
        W.player.srcs = W.player.srcs.filter(s => s.ext !== id);
        if (W.player.srcs.length !== was) {
            W.player.k = 0;
            renderPlayer();
        }
    }
    markDirty();
}
export function extClick(act: string, _t: HTMLElement | SVGElement, key: string | undefined) {
    const k = key ?? "";
    if (act === "ext-pick") {
        const i = document.createElement("input");
        i.type = "file";
        i.accept = ".zip,.json,.js,.mjs";
        i.onchange = () => {
            const f = i.files?.[0];
            if (f) extInstall(f);
        };
        i.click();
        return true;
    }
    if (act === "ext-remove") {
        const x = extGet(k);
        if (!x) return true;
        extStop(x);
        EXT.list = EXT.list.filter(y => y !== x);
        extDB().then(d =>
            tx(
                "x",
                "readwrite",
                s => {
                    s.delete(k);
                },
                d
            )
        );
        extForget(x);
        toast(`Removed ${x.manifest.name}`);
        renderMain();
        return true;
    }
    if (act === "ext-official") {
        fetch(`extensions/${encodeURIComponent(k)}.zip`)
            .then(r => {
                if (!r.ok) throw 0;
                return r.blob();
            })
            .then(b => extInstall(new File([b], k + ".zip", { type: "application/zip" })))
            .catch(() => toast("Couldn't load it here: download it from the app's extensions folder and drop it in."));
        return true;
    }
    if (act === "ext-ping") {
        const x = extGet(k);
        if (x) extPing(x).then(() => renderMain());
        return true;
    }
    return false;
}

// Keys the app keeps in an extension's data beside its own storage: your settings for it (its companion's address among
// them) and its per-series servers. Its code may neither read nor write them through storage.get/set, so it can't
// name a companion of its own choosing or change which servers you gave a series
const EXT_RESERVED = new Set(["settings", "series"]);
// An extension's messages: its answers to the app's calls, and its own requests. They come from the extension's code,
// so each is checked here before anything is done with it.
export async function extOnMessage(e: MessageEvent) {
    const m = e.data;
    if (!isRecord(m) || m.__ul !== 1) return;
    const id = [...EXT.frames.entries()].find(([, F]) => F.frame.contentWindow === e.source)?.[0];
    if (!id) return;
    const x = extGet(id),
        F = EXT.frames.get(id),
        win = F?.frame.contentWindow;
    if (!x || !F || !win) return;
    const reply = (res: unknown, err?: string) => win.postMessage({ __ul: 1, re: m.id, res, err }, "*");
    if (m.re) {
        const w = typeof m.re === "string" ? EXT.wait.get(m.re) : undefined;
        // an answer counts only from the extension the call went to: one can't answer (or cut short) another's
        if (w && w.ext === id && typeof m.re === "string") {
            EXT.wait.delete(m.re);
            clearTimeout(w.t);
            if (m.err) w.no(new Error(String(m.err)));
            else w.ok(m.res);
        }
        return;
    }
    const can = (p: string) => x.manifest.permissions.includes(p);
    const args = listOf(m.args),
        key = String(args[0]);
    try {
        switch (m.fn) {
            case "provide": {
                const job = key;
                if (!can(job)) return reply(null, `"${job}" isn't in this extension's permissions`);
                F.jobs.add(job);
                return reply(true);
            }
            case "storage.get":
                if (!can("storage")) return reply(null, "no storage permission");
                if (EXT_RESERVED.has(key)) return reply(null, `"${key}" is kept by the app`);
                return reply(Object.hasOwn(x.data || {}, key) ? (x.data[key] ?? null) : null);
            case "storage.set":
                if (!can("storage")) return reply(null, "no storage permission");
                if (EXT_RESERVED.has(key)) return reply(null, `"${key}" is kept by the app`);
                x.data = { ...(x.data || {}), [key]: args[1] };
                await extSave(x);
                return reply(true);
            case "settings":
                return reply(extSettingsOf(x));
            case "toast":
                toast(`${x.manifest.name}: ${String(args[0]).slice(0, 200)}`);
                return reply(true);
            case "file":
                // only its own files (not anything an object has by inheritance)
                return reply(Object.hasOwn(x.files, key) ? x.files[key] : null);
            case "companion.url":
                if (!can("companion")) return reply(null, "no companion permission");
                return reply(extCompanionURL(x));
            case "net.fetch":
                if (!can("net")) return reply(null, "no net permission");
                return reply(await extNetFetch(x, args[0] || {}));
            default:
                return reply(null, "unknown request " + String(m.fn));
        }
    } catch (err) {
        reply(null, errMessage(err));
    }
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initExtensions() {
    addEventListener("message", extOnMessage);
    // ── Settings › Extensions (sections/Extensions.svelte draws it): what its switches and fields do ──
    document.addEventListener("change", async e => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement))
            return;
        if (t.dataset.exton) {
            const x = extGet(t.dataset.exton);
            if (!x) return;
            x.on = ticked(t);
            await extSave(x);
            if (x.on) extStart(x);
            else extStop(x);
            renderMain();
        }
        if (t.dataset.extpriv) {
            const x = extGet(t.dataset.extpriv);
            if (!x) return;
            x.private = ticked(t);
            await extSave(x);
            renderMain();
        }
        if (t.dataset.extset) {
            const x = extGet(t.dataset.extset);
            if (!x) return;
            x.data = {
                ...(x.data || {}),
                settings: {
                    ...((x.data || {}).settings || {}),
                    [t.dataset.k || ""]: t.type === "checkbox" ? ticked(t) : t.value,
                },
            };
            await extSave(x);
            if (t.dataset.k === "companionUrl") {
                if (x.on) extStart(x); // started again, so what it may reach follows the new address
                await extPing(x);
                renderMain();
            }
        }
    });
    // remember which rows are unfolded, so a re-render doesn't fold them back
    document.addEventListener(
        "toggle",
        e => {
            const d = e.target;
            if (d instanceof HTMLDetailsElement && (d.dataset.extopen || d.dataset.bopen)) {
                ui.extOpen = { ...(ui.extOpen || {}), [d.dataset.extopen || d.dataset.bopen || ""]: d.open };
            }
        },
        true
    );
    // dropping a file on the Extensions panel installs it
    document.addEventListener("dragover", e => {
        const d = closestTo(e, ".extdrop");
        if (d) {
            e.preventDefault();
            d.classList.add("over");
        }
    });
    document.addEventListener("dragleave", e => {
        const d = closestTo(e, ".extdrop");
        if (d) d.classList.remove("over");
    });
    document.addEventListener(
        "drop",
        e => {
            const d = closestTo(e, ".extdrop");
            if (!d) return;
            e.preventDefault();
            e.stopPropagation();
            d.classList.remove("over");
            const f = e.dataTransfer?.files[0];
            if (f) extInstall(f);
        },
        true
    );
    setTimeout(() => extLoadAll(), 400);
}
