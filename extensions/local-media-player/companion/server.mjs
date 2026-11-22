// extensions/local-media-player/companion/server.mjs
// ─────────────────────────────────────────────────────────────────
//  UniverList companion: your video folders, served to the app on this computer only
//
//  Run:   node companion/server.mjs "/path/to/Videos" ["/another/folder" …]
//    or:  deno run --allow-net --allow-read --allow-run --allow-env companion/server.mjs "/path/to/Videos"
//  Options (environment variables):
//    LOG=1                 print each request (to check the extension reaches it)
//    PORT=7878          the port (the extension's "Companion address" must match)
//    TOKEN=yours,friend1,…  passwords the extension must send, one each so you can take one back
//    PUBLIC_URL=https://…   the address friends reach this at (your Tailscale name); worked out by itself if left out
//    FFMPEG=ffmpeg      path to ffmpeg; with it, .mkv and .avi files are converted on the fly so the browser can play
//    them
//
//  Endpoints
//    GET /health                                   is it running, which folders
//    GET /find?title=&alt=&season=&episode=&film=  the files for one episode or film → { sources: [{ name, url, how }]
//    }
//    GET /file/<id>                                the file itself, with seeking (Range requests)
//    GET /remux/<id>?t=<seconds>                   an .mkv/.avi rewrapped as MP4 while it plays (needs ffmpeg)
//
//  It listens on 127.0.0.1 only, so nothing outside this computer can reach it, and only ever serves files it found
//  inside the folders you gave it.
// ─────────────────────────────────────────────────────────────────

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

// ── Settings ──
const ROOTS = process.argv
    .slice(2)
    .map(p => path.resolve(p))
    .filter(p => fs.existsSync(p));
const PORT = Number(process.env.PORT || 7878),
    TOKENS = (process.env.TOKEN || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean),
    PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
    FFMPEG = process.env.FFMPEG || "ffmpeg";
// shared beyond this machine (PUBLIC_URL set) with no password: refuse to start, rather than serve anyone who finds the address
if (PUBLIC_URL && !TOKENS.length) {
    console.error("PUBLIC_URL is set, so this is shared: set TOKEN=yourpassword (and one per friend) first.");
    process.exit(1);
}
const VIDEO = /\.(mp4|m4v|webm|mov|mkv|avi)$/i,
    PLAYABLE = /\.(mp4|m4v|webm|mov)$/i;
const HAS_FFMPEG = (() => {
    try {
        return spawnSync(FFMPEG, ["-version"]).status === 0;
    } catch {
        return false;
    }
})();
if (!ROOTS.length) {
    console.error('Give it at least one folder: node companion/server.mjs "/path/to/Videos"');
    process.exit(1);
}

// ── The index: every video under the folders, re-read at most once a minute ──
let INDEX = [],
    indexedAt = 0;
function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (VIDEO.test(e.name)) out.push(p);
    }
    return out;
}
function index() {
    if (Date.now() - indexedAt > 60e3) {
        INDEX = ROOTS.flatMap(r => {
            try {
                return walk(r, []);
            } catch {
                return [];
            }
        });
        indexedAt = Date.now();
    }
    return INDEX;
}
const idOf = p => Buffer.from(p).toString("base64url"),
    pathOf = id => {
        const p = Buffer.from(id, "base64url").toString();
        return index().includes(p) ? p : null;
    };

// ── Matching: "Bungo Stray Dogs S02E03.mkv", "Bungo Stray Dogs 2/03.mkv", "Show - 12 [1080p].mkv", "Film (2019).mp4" ──
const norm = s =>
    String(s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
function epOf(name) {
    const n = name.replace(/\.[^.]+$/, "");
    let m = /s(\d{1,2})[ ._-]*e(\d{1,4})/i.exec(n) || /(\d{1,2})x(\d{2,3})/.exec(n);
    if (m) return { s: +m[1], e: +m[2] };
    const c = " " + n.replace(/\[[^\]]*\]|\([^)]*\)/g, " ") + " ";
    m = /\b(?:episode|ep)[ ._-]*(\d{1,4})/i.exec(c) || /\s-\s*(\d{1,4})(?:v\d)?\b/.exec(c) || /\bE(\d{1,4})\b/.exec(c);
    if (m) return { s: null, e: +m[1] };
    // otherwise the last standalone number that isn't a year
    const all = [...c.matchAll(/(?:^|[ ._-])(\d{1,4})(?:v\d)?(?=[ ._-]|$)/g)]
        .map(x => +x[1])
        .filter(x => x < 1900 || x > 2100);
    return all.length ? { s: null, e: all[all.length - 1] } : null;
}
const covers = (hay, title) => {
    const w = norm(title).split(" ").filter(Boolean);
    return w.length && w.every(x => (" " + hay + " ").includes(" " + x + " "));
};
function find(q, at) {
    const film = q.film === "1",
        season = Number(q.season || 1),
        ep = q.episode === "" ? null : Number(q.episode),
        hits = [];
    for (const p of index()) {
        const rel = ROOTS.reduce((r, root) => (p.startsWith(root) ? p.slice(root.length) : r), p),
            hay = norm(rel),
            file = path.basename(p);
        if (film) {
            if (covers(hay, q.title) && (!q.year || hay.includes(String(q.year)) || !/\b(19|20)\d\d\b/.test(hay)))
                hits.push({ p, score: 1 });
            continue;
        }
        const byAlt = q.alt && norm(q.alt) !== norm(q.title) && covers(hay, q.alt),
            byTitle = covers(hay, q.title);
        if (!byAlt && !byTitle) continue;
        const e = epOf(file);
        if (!e || e.e !== ep) continue;
        // "Show 2/…" is another season of "Show": only count it for that season
        const other = new RegExp("\\b" + norm(q.title) + " (\\d{1,2})\\b").exec(hay);
        if (other && !byAlt && e.s == null && +other[1] !== season) continue;
        const sOk =
            e.s == null
                ? byAlt || season === 1 || new RegExp(`(season|s) ?0?${season}\\b`).test(hay)
                : e.s === season || (byAlt && e.s === 1);
        if (sOk) hits.push({ p, score: (byAlt ? 2 : 1) + (e.s != null ? 1 : 0) });
    }
    return hits
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .flatMap(({ p }) => {
            const { base, tok } = at,
                name = path.basename(p);
            return PLAYABLE.test(p)
                ? [{ name: "On this computer · " + name, url: `${base}/file/${idOf(p)}${tok}`, how: "original" }]
                : HAS_FFMPEG
                  ? [
                        { name: "On this computer · " + name, url: `${base}/remux/${idOf(p)}${tok}`, how: "converted" },
                        { name: "Original file · " + name, url: `${base}/file/${idOf(p)}${tok}`, how: "original" },
                    ]
                  : [
                        {
                            name: "On this computer · " + name + " (may not play: install ffmpeg)",
                            url: `${base}/file/${idOf(p)}${tok}`,
                            how: "original",
                        },
                    ];
        });
}

// ── Serving ──
const TYPES = {
    mp4: "video/mp4",
    m4v: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
};
const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};
const json = (res, code, obj) => {
    res.writeHead(code, { ...CORS, "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
};
function sendFile(req, res, p) {
    const size = fs.statSync(p).size,
        type = TYPES[p.split(".").pop().toLowerCase()] || "application/octet-stream",
        r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (r) {
        const start = r[1] ? +r[1] : size - +r[2],
            end = r[1] && r[2] ? Math.min(+r[2], size - 1) : size - 1;
        res.writeHead(206, {
            ...CORS,
            "Content-Type": type,
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": end - start + 1,
        });
        fs.createReadStream(p, { start, end }).pipe(res);
    } else {
        res.writeHead(200, { ...CORS, "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": size });
        fs.createReadStream(p).pipe(res);
    }
}
function remux(res, p, t) {
    const ff = spawn(FFMPEG, [
        "-v",
        "error",
        ...(t ? ["-ss", String(t)] : []),
        "-i",
        p,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof",
        "-f",
        "mp4",
        "pipe:1",
    ]);
    res.writeHead(200, { ...CORS, "Content-Type": "video/mp4" });
    ff.stdout.pipe(res);
    res.on("close", () => ff.kill("SIGKILL"));
}
// Where links should point: this computer for you, your Tailscale (or tunnel) address for friends
const LOOP = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;
function linkBase(req, q) {
    const host = req.headers["x-forwarded-host"] || req.headers.host || `127.0.0.1:${PORT}`;
    const proto = req.headers["x-forwarded-proto"] || (LOOP.test(host) ? "http" : "https"); // a non-local name only reaches us through an HTTPS proxy
    return {
        base: PUBLIC_URL && !LOOP.test(host) ? PUBLIC_URL : `${proto}://${host}`,
        tok: q.token ? `?token=${encodeURIComponent(q.token)}` : "",
    };
}
http.createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1"),
        q = Object.fromEntries(u.searchParams);
    if (process.env.LOG)
        console.log(
            new Date().toISOString().slice(11, 19),
            req.method,
            u.pathname,
            q.title ? `"${q.title}" s${q.season} e${q.episode}` : ""
        );
    if (req.method === "OPTIONS") {
        res.writeHead(204, CORS);
        return res.end();
    }
    if (u.pathname === "/health")
        return json(res, 200, {
            ok: true,
            name: "univerlist-companion",
            version: "1.0.0",
            folders: ROOTS.length,
            files: index().length,
            ffmpeg: HAS_FFMPEG,
        });
    if (TOKENS.length && !TOKENS.includes(q.token)) return json(res, 401, { error: "wrong password" });
    if (u.pathname === "/find") return json(res, 200, { sources: find(q, linkBase(req, q)) });
    const m = /^\/(file|remux)\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
    const p = m && pathOf(m[2]);
    if (!p) return json(res, 404, { error: "not found" });
    return m[1] === "remux" && HAS_FFMPEG ? remux(res, p, Number(q.t) || 0) : sendFile(req, res, p);
}).listen(PORT, "127.0.0.1", () =>
    console.log(
        `UniverList companion: ${index().length} videos in ${ROOTS.length} folder(s), on http://127.0.0.1:${PORT}${HAS_FFMPEG ? " (ffmpeg found: .mkv plays too)" : ""}`
    )
);
