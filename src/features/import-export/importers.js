// src/features/import-export/importers.js
// ─────────────────────────────────────────────────────────────────
//  Importers: zip/gz files, Letterboxd export and RSS, MyAnimeList XML, any CSV, pasted lists
// ─────────────────────────────────────────────────────────────────

// A zip is outside data. A real export is a few thousand files and a few hundred MB; past these, it's a zip bomb (a
// small file that unpacks to gigabytes) and is refused before it fills the tab's memory. A comic or book is far smaller
const ZIP_LIMITS = { entries: 60000, entry: 512 * 1048576, total: 2048 * 1048576 };
const TOO_BIG = "too big";

/** Unpacks gzip or deflate, stopping as soon as the result passes `max` bytes. */
async function inflate(u8, fmt, max = ZIP_LIMITS.entry) {
    const reader = new Blob([u8]).stream().pipeThrough(new DecompressionStream(fmt)).getReader(),
        chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
            await reader.cancel();
            throw new Error(TOO_BIG);
        }
        chunks.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
        out.set(c, at);
        at += c.length;
    }
    return out;
}
// minimal ZIP reader (stored and deflated entries), enough for exports, Letterboxd's zip, comics and EPUBs
async function unzip(buf) {
    const dv = new DataView(buf),
        out = new Map();
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--)
        if (dv.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    if (eocd < 0) throw new Error("not a zip");
    const n = dv.getUint16(eocd + 10, true);
    if (n > ZIP_LIMITS.entries) throw new Error(TOO_BIG);
    let p = dv.getUint32(eocd + 16, true),
        total = 0;
    const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        const method = dv.getUint16(p + 10, true),
            csize = dv.getUint32(p + 20, true),
            nl = dv.getUint16(p + 28, true),
            xl = dv.getUint16(p + 30, true),
            cl = dv.getUint16(p + 32, true),
            lho = dv.getUint32(p + 42, true);
        const name = dec.decode(new Uint8Array(buf, p + 46, nl));
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true),
            data = new Uint8Array(buf, start, csize);
        // a zip made on a Mac carries hidden copies of every file (__MACOSX/, ._name, .DS_Store): they aren't part of what was zipped
        const hidden = /(^|\/)(__MACOSX\/|\._[^/]*$|\.DS_Store$)/.test(name);
        if (!name.endsWith("/") && !hidden) {
            const room = Math.min(ZIP_LIMITS.entry, ZIP_LIMITS.total - total),
                bytes = method === 8 ? await inflate(data, "deflate-raw", room) : data;
            if (bytes.length > room) throw new Error(TOO_BIG);
            total += bytes.length;
            out.set(name, bytes);
        }
        p += 46 + nl + xl + cl;
    }
    return out;
}
const txt = u8 => new TextDecoder().decode(u8);
// one importable bundle: { kind, name, items, lists?, columns?, rows? }
async function readImportFile(f) {
    const buf = await f.arrayBuffer(),
        u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
        // zip
        let files = await unzip(buf),
            names = [...files.keys()];
        const nested = names.find(n => /(^|\/)(defaults|profile)-export[^/]*\.zip$/.test(n));
        if (nested) {
            const d = files.get(nested);
            files = await unzip(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
            names = [...files.keys()];
        }
        if (
            names.some(
                n => /(^|\/)(manifest\.json|univerlist-backup\.json)$/.test(n) || /(^|\/)data\/[^/]+\.json$/.test(n)
            )
        )
            return { kind: "bundle", name: f.name, ...partsFromFiles(files) };
        if (names.some(n => /(^|\/)(watched|diary|ratings)\.csv$/.test(n))) return letterboxdZip(files, f.name);
        const csv = names.find(n => n.endsWith(".csv")),
            xml = names.find(n => n.endsWith(".xml")),
            json = names.find(n => n.endsWith(".json"));
        if (xml) return readText(txt(files.get(xml)), f.name);
        if (json) return readText(txt(files.get(json)), f.name);
        if (csv) return readText(txt(files.get(csv)), f.name);
        throw new Error("unrecognised");
    }
    if (u8[0] === 0x1f && u8[1] === 0x8b) return readText(txt(await inflate(u8, "gzip")), f.name);
    return readText(txt(u8), f.name);
}
function readText(text, name) {
    if (/^\s*[{[]/.test(text)) {
        const data = safeJSON(text);
        if (!data.items && !data.books && !data.meta) throw new Error("no items");
        return { kind: "bundle", name, parts: partsFromSnapshot(data), v: data.v || 3, savedAt: data.savedAt };
    }
    if (/<myanimelist>/i.test(text.slice(0, 2000))) return { ...malXML(text), name };
    if (/^Letterboxd list export/i.test(text)) {
        const l = letterboxdList(text);
        return {
            kind: "Letterboxd list",
            name,
            items: l.entries.map(e => ({ medium: "film", title: e.title, year: e.year, status: "want" })),
            lists: [l],
        };
    }
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("empty");
    const { kind, items: list } = fromCSV(rows);
    if (kind === "unknown" || !list.length) return { kind: "custom", name, rows, columns: Object.keys(rows[0]) };
    return { kind, name, items: list };
}
function letterboxdZip(files, name) {
    const get = n => {
        const k = [...files.keys()].find(x => x === n || x.endsWith("/" + n));
        return k ? parseCSV(txt(files.get(k))) : [];
    };
    const key = r => norm(r.Name) + "|" + (r.Year || ""); // diary rows have their own URIs, so match films by name and year
    const map = new Map(),
        film = r => {
            const k = key(r);
            if (!map.has(k))
                map.set(k, {
                    medium: "film",
                    title: r.Name,
                    year: parseInt(r.Year, 10) || null,
                    status: "want",
                    tags: [],
                    ext: {},
                    repeat: 0,
                    log: [],
                });
            const x = map.get(k);
            if (r["Letterboxd URI"] && !x.ext.letterboxd && !/diary|reviews/.test(r.__f || ""))
                x.ext.letterboxd = r["Letterboxd URI"];
            return x;
        };
    for (const r of get("watchlist.csv")) film(r);
    for (const r of get("watched.csv")) {
        const x = film(r);
        x.status = "done";
        x.finishedAt = x.finishedAt || (r.Date ? new Date(r.Date).toISOString() : null);
    }
    for (const r of get("ratings.csv")) {
        const x = film(r);
        x.status = "done";
        if (r.Rating) x.rating = Math.round(parseFloat(r.Rating) * 2 * 10) / 10;
    }
    for (const r of get("diary.csv")) {
        const x = film(r);
        x.status = "done";
        const d = r["Watched Date"] || r.Date;
        if (d) {
            const iso = new Date(d + "T12:00:00").toISOString();
            if (!x.finishedAt || iso > x.finishedAt) x.finishedAt = iso;
            x.log.push({ date: iso, from: 0, to: 0, min: 0 });
        }
        if (/yes/i.test(r.Rewatch || "")) x.repeat++;
        for (const t of (r.Tags || "")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean))
            if (!x.tags.includes(t)) x.tags.push(t);
        if (r.Rating && !x.rating) x.rating = Math.round(parseFloat(r.Rating) * 2 * 10) / 10;
    }
    for (const r of get("reviews.csv")) {
        const x = film(r);
        if (r.Review) x.notes = [x.notes, r.Review].filter(Boolean).join("\n\n");
    }
    for (const r of get("films.csv")) {
        const x = film(r);
        if (!x.tags.includes("Liked on Letterboxd")) x.tags.push("Liked on Letterboxd");
    }
    const lists = [...files.keys()]
        .filter(k => /(^|\/)lists\/.+\.csv$/.test(k))
        .map(k => {
            try {
                return letterboxdList(txt(files.get(k)));
            } catch (_) {
                return null;
            }
        })
        .filter(Boolean);
    for (const l of lists)
        for (const e of l.entries)
            if (![...map.values()].some(x => norm(x.title) === norm(e.title) && (!e.year || x.year === e.year)))
                map.set("l|" + e.title + e.year, {
                    medium: "film",
                    title: e.title,
                    year: e.year,
                    status: "want",
                    tags: [],
                    ext: {},
                });
    for (const x of map.values()) if (!x.log || !x.log.length) delete x.log;
    return { kind: "Letterboxd export", name, items: [...map.values()], lists };
}
function letterboxdList(text) {
    const blocks = text.replace(/\r/g, "").split(/\n\s*\n/),
        head = parseCSV(blocks.slice(0, 1).join("\n").split("\n").slice(1).join("\n"))[0] || {};
    const rows = parseCSV(blocks.slice(1).join("\n\n"));
    return {
        name: head.Name || "Letterboxd list",
        desc: head.Description || "",
        numbered: rows.some(r => r.Position),
        entries: rows
            .map(r => ({
                title: r.Name,
                year: parseInt(r.Year, 10) || null,
                note: r.Description || "",
                pos: parseInt(r.Position, 10) || 0,
            }))
            .filter(e => e.title)
            .sort((a, b) => a.pos - b.pos),
    };
}
function malXML(text) {
    const doc = new DOMParser().parseFromString(text, "text/xml"),
        q = (el, t) => {
            const x = el.getElementsByTagName(t)[0];
            return x ? x.textContent.trim() : "";
        };
    const st = s =>
        /complet/i.test(s)
            ? "done"
            : /watching|reading/i.test(s)
              ? "active"
              : /hold/i.test(s)
                ? "paused"
                : /drop/i.test(s)
                  ? "dnf"
                  : "want";
    const dt = s => (s && !/^0000/.test(s) ? new Date(s.replace(/-00/g, "-01") + "T12:00:00").toISOString() : null);
    const anime = [...doc.getElementsByTagName("anime")].map(a => ({
        medium: "anime",
        title: q(a, "series_title"),
        kind: { TV: "TV", Movie: "Movie", OVA: "OVA", ONA: "ONA", Special: "Special" }[q(a, "series_type")] || "TV",
        total: parseInt(q(a, "series_episodes"), 10) || null,
        prog: parseInt(q(a, "my_watched_episodes"), 10) || 0,
        rating: parseInt(q(a, "my_score"), 10) || 0,
        status: st(q(a, "my_status")),
        startedAt: dt(q(a, "my_start_date")),
        finishedAt: dt(q(a, "my_finish_date")),
        repeat: parseInt(q(a, "my_times_watched"), 10) || 0,
        notes: q(a, "my_comments"),
        tags: q(a, "my_tags")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean),
        ext: { mal: parseInt(q(a, "series_animedb_id"), 10) || undefined },
    }));
    const manga = [...doc.getElementsByTagName("manga")].map(a => ({
        medium: "manga",
        title: q(a, "manga_title"),
        kind: "Manga",
        total: parseInt(q(a, "manga_chapters"), 10) || null,
        vols: parseInt(q(a, "manga_volumes"), 10) || null,
        prog: parseInt(q(a, "my_read_chapters"), 10) || 0,
        vol: parseInt(q(a, "my_read_volumes"), 10) || 0,
        rating: parseInt(q(a, "my_score"), 10) || 0,
        status: st(q(a, "my_status")),
        startedAt: dt(q(a, "my_start_date")),
        finishedAt: dt(q(a, "my_finish_date")),
        notes: q(a, "my_comments"),
        tags: q(a, "my_tags")
            .split(",")
            .map(s => s.trim())
            .filter(Boolean),
        ext: { mal: parseInt(q(a, "manga_mangadb_id"), 10) || undefined },
    }));
    return { kind: "MyAnimeList", items: [...anime, ...manga].filter(x => x.title) };
}
async function letterboxdRSS(user) {
    const r = await fetch(`https://letterboxd.com/${encodeURIComponent(user)}/rss/`);
    if (!r.ok) throw new Error(String(r.status));
    const doc = new DOMParser().parseFromString(await r.text(), "text/xml");
    const g = (el, t) => {
        const x = el.getElementsByTagName(t)[0];
        return x ? x.textContent.trim() : "";
    };
    return [...doc.getElementsByTagName("item")]
        .map(it => {
            const title = g(it, "letterboxd:filmTitle");
            if (!title) return null;
            const img = (/<img src="([^"]+)"/.exec(g(it, "description")) || [])[1];
            const rating = parseFloat(g(it, "letterboxd:memberRating"));
            return {
                medium: "film",
                title,
                year: parseInt(g(it, "letterboxd:filmYear"), 10) || null,
                status: "done",
                rating: rating ? rating * 2 : 0,
                finishedAt: g(it, "letterboxd:watchedDate")
                    ? new Date(g(it, "letterboxd:watchedDate") + "T12:00:00").toISOString()
                    : null,
                repeat: g(it, "letterboxd:rewatch") === "Yes" ? 1 : 0,
                cover: img || "",
                ext: {
                    tmdb: parseInt(g(it, "tmdb:movieId"), 10) || undefined,
                    tmdbType: "movie",
                    letterboxd: g(it, "link"),
                },
            };
        })
        .filter(Boolean);
}
// any CSV: match its columns once
const MAP_FIELDS = [
    ["title", "Title", /^(title|name|show|series|film|movie|game|book)/i],
    ["year", "Year", /year|released|release date/i],
    ["creator", "Creator", /author|director|creator|developer|studio/i],
    ["rating", "Your score", /my rating|your rating|^rating|score|stars/i],
    ["status", "Status", /status|shelf|list/i],
    ["finishedAt", "Date finished", /finish|watched|logged|completed|date read|date$/i],
    ["kind", "Type", /type|format|kind|platform/i],
    ["medium", "What it is", /media|medium|category/i],
    ["notes", "Notes", /review|notes?|comment/i],
    ["tags", "Tags", /tags?|genres?/i],
    ["prog", "Progress", /progress|episodes? watched|chapters? read|watched episodes/i],
];
function guessMapping(cols) {
    const m = {};
    for (const [k, , re] of MAP_FIELDS) {
        const c = cols.find(c => re.test(c) && !Object.values(m).includes(c));
        if (c) m[k] = c;
    }
    return m;
}
const statusFrom = s =>
    /complet|watched|^read$|finished|done|played|beaten/i.test(s)
        ? "done"
        : /watching|reading|playing|current|in progress/i.test(s)
          ? "active"
          : /hold|pause/i.test(s)
            ? "paused"
            : /drop|abandon/i.test(s)
              ? "dnf"
              : /plan|want|watchlist|backlog|to.?read|wishlist/i.test(s)
                ? "want"
                : "";
function mapRows(rows, map, { medium, scale, status, all }) {
    const dt = v => {
        if (!v) return null;
        const d = new Date(String(v).replace(/\//g, "-"));
        return isNaN(d) ? null : d.toISOString();
    };
    // the score column's scale: as you set it, or worked out from its header and values ("Rating (out of 5)", all under 5…)
    const colSc =
        scale && scale !== "auto"
            ? scale
            : columnScale(
                  map.rating,
                  (all || rows).map(r => (map.rating ? r[map.rating] : ""))
              );
    const mine = (meta.settings.ratingScale || "10d").replace("10d", "10");
    return rows
        .map(r => {
            const v = k => (map[k] ? String(r[map[k]] || "").trim() : "");
            const [rating, sc] = parseAnyScore(v("rating"), colSc),
                md =
                    mediumFromText(v("medium")) ||
                    ((KINDS[medium] || []).includes(v("kind")) ? "" : mediumFromText(v("kind"))) ||
                    medium;
            const st = statusFrom(v("status")) || (v("finishedAt") || rating ? "done" : status);
            return {
                medium: md,
                title: v("title"),
                year: parseInt(v("year"), 10) || null,
                creator: v("creator"),
                rating,
                ...(rating && sc && sc !== mine && sc !== "10" ? { scale: sc } : {}),
                status: st,
                finishedAt: dt(v("finishedAt")),
                kind: (KINDS[md] || []).includes(v("kind")) ? v("kind") : "",
                notes: v("notes"),
                tags: v("tags")
                    ? v("tags")
                          .split(/[,;|]/)
                          .map(s => s.trim())
                          .filter(Boolean)
                          .slice(0, 8)
                    : [],
                prog: parseInt(v("prog"), 10) || 0,
            };
        })
        .filter(x => x.title);
}
// pasted lists: one title per line, optional (year) and a score at the end
function parsePasted(text, medium, status) {
    return text
        .split(/\r?\n/)
        .map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
        .filter(Boolean)
        .map(l => {
            let title = l,
                year = null,
                rating = 0;
            let scale = "";
            const sc =
                /\s[-–—:|]\s*((?:\d+(?:[.,]\d+)?\s*(?:\/\s*\d+|%)?)|[★⭐🌟☆½]+|👍|👎)\s*$/u.exec(title) ||
                /\s((?:[★⭐🌟]\s*)+½?)\s*$/u.exec(title);
            if (sc) {
                const [out, s2] = parseAnyScore(sc[1], "10");
                if (out && out <= 10) {
                    rating = out;
                    scale = s2;
                    title = title.slice(0, sc.index).trim();
                }
            }
            const y = /\((\d{4})\)\s*$/.exec(title) || /\s(\d{4})$/.exec(title);
            if (y && +y[1] > 1870 && +y[1] < 2100) {
                year = +y[1];
                title = title.slice(0, y.index).trim();
            }
            return {
                medium,
                title,
                year,
                rating,
                ...(scale === "5" || scale === "100" ? { scale } : {}),
                status: rating && status === "want" ? "done" : status,
            };
        })
        .filter(x => x.title.length > 1);
}

// ═══════════════════════════════════════════
//  THE .ZIP BUNDLE: APP + BACKUP + PICTURES + LISTS
// ═══════════════════════════════════════════
const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
// a plain (stored) zip: pictures are already compressed, and it opens everywhere. Plain zips stop at 65,535 files and
// 4 GB; past that the export says so rather than writing a broken file
function zipFiles(files) {
    const bytes = files.reduce(
        (sum, f) => sum + (typeof f.data === "string" ? f.data.length * 3 : f.data.length) + 100,
        0
    );
    if (files.length > 65535 || bytes > 0xfffffff0) throw new Error(TOO_BIG);
    const enc = new TextEncoder(),
        parts = [],
        cd = [];
    let off = 0;
    const d = new Date(),
        dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
        tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const f of files) {
        const name = enc.encode(f.name),
            data = typeof f.data === "string" ? enc.encode(f.data) : f.data,
            crc = crc32(data);
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true);
        h.setUint16(4, 20, true);
        h.setUint16(6, 0x0800, true);
        h.setUint16(10, tm, true);
        h.setUint16(12, dt, true);
        h.setUint32(14, crc, true);
        h.setUint32(18, data.length, true);
        h.setUint32(22, data.length, true);
        h.setUint16(26, name.length, true);
        parts.push(new Uint8Array(h.buffer), name, data);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(12, tm, true);
        c.setUint16(14, dt, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, data.length, true);
        c.setUint32(24, data.length, true);
        c.setUint16(28, name.length, true);
        c.setUint32(42, off, true);
        cd.push(new Uint8Array(c.buffer), name);
        off += 30 + name.length + data.length;
    }
    const cdSize = cd.reduce((a, x) => a + x.length, 0),
        e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true);
    e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true);
    e.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], { type: "application/zip" });
}
const safeName = s =>
    String(s || "list")
        .replace(/[\\/:*?"<>|]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60) || "list";
function listFiles(mode) {
    const L = meta.lists.filter(l => !l.private),
        rowOf = (id, i, l) => {
            const b = items.get(id) || {};
            return [
                i + 1,
                b.title || "",
                b.medium ? MEDIA[b.medium].name : "",
                b.kind || "",
                b.year || "",
                b.status ? statusWord(b.status, b.medium) : "",
                b.rating || "",
                (l.notes || {})[id] || "",
            ];
        };
    const head = ["Position", "Title", "Medium", "Type", "Year", "Status", "Your score", "Note"].join(",");
    const lists = [{ id: "queue", name: "Up next", numbered: true, ids: meta.queue, notes: {} }, ...L].map(l => ({
        ...l,
        ids: l.ids.filter(id => items.has(id) && !vault.ids.has(id)),
    }));
    const out = [];
    if (mode !== "sep")
        out.push({
            name: "lists/all-lists.json",
            data: JSON.stringify(
                lists.map(l => ({
                    name: l.name,
                    description: l.desc || "",
                    numbered: !!l.numbered,
                    entries: l.ids.map((id, i) => {
                        const r = rowOf(id, i, l);
                        return {
                            position: r[0],
                            title: r[1],
                            medium: r[2],
                            type: r[3],
                            year: r[4],
                            status: r[5],
                            score: r[6],
                            note: r[7],
                        };
                    }),
                })),
                null,
                1
            ),
        });
    if (mode !== "one")
        lists.forEach((l, k) =>
            out.push({
                name: `lists/${String(k + 1).padStart(2, "0")} ${safeName(l.name)}.csv`,
                data: [head, ...l.ids.map((id, i) => rowOf(id, i, l).map(csvCell).join(","))].join("\n"),
            })
        );
    return out;
}
const extOf = t => ({ "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" })[t] || "jpg";
// profile-export_<name>_<date>.zip: your name as it shows everywhere, else the Universal hub's, else any mode's, else just the date
function exportName() {
    const modes = meta.modes || [],
        uni = modes.find(m => m.id === "universal"),
        pick = [
            meta.profile && meta.profile.name,
            uni && uni.profile && uni.profile.name,
            ...modes.map(m => m.profile && m.profile.name),
        ].find(x => x && String(x).trim());
    const who = pick
        ? String(pick)
              .trim()
              .normalize("NFKD")
              .replace(/[^\w\s-]/g, "")
              .trim()
              .replace(/\s+/g, "-")
              .slice(0, 40)
        : "";
    return `profile-export${who ? "_" + who : ""}_${today()}.zip`;
}
// opts: { app, images, private, keysPass, keysOff, privExt, readable, parts: { library: false, … } (what's left out) }
async function exportBundle(opts, progress, name) {
    const r = await v2Files(
        {
            parts: opts.parts,
            private: !!opts.private,
            keysPass: opts.keysPass || null,
            keysOff: !!opts.keysOff,
            privExt: opts.privExt !== false,
            images: opts.images !== false,
            readable: !!opts.readable,
        },
        progress
    );
    // just your data: you already have the app (index.html), so it isn't packed again
    download(name || exportName(), zipFiles(r.files), "application/zip");
    // a backup with everything in counts as your last full backup (the reminder goes quiet)
    if (!opts.parts && opts.images !== false) {
        meta.settings.lastBackup = nowISO();
        markDirty();
    }
    return r.note;
}
function bundleImages(files) {
    const k = [...files.keys()].find(n => /(^|\/)images\/index\.json$/.test(n));
    if (!k) return null;
    const index = safeJSON(txt(files.get(k))),
        dir = k.replace(/index\.json$/, ""),
        out = [];
    for (const [url, name] of Object.entries(index)) {
        const data = files.get(dir + name.replace(/^images\//, "")) || files.get(name);
        if (data) out.push([url, data, name]);
    }
    return out;
}
async function restoreImages(list) {
    let n = 0;
    for (const [url, data] of list || []) {
        // the type comes from the bytes, never the file's name: a blob address opened in a tab shows as its type, and an
        // "image" that's really a web page would run as one of the app's own pages
        const type = data && data.length <= MAX_IMPORTED_PICTURE ? pictureType(data) : null;
        if (!type) continue;
        const blob = new Blob([data], { type: "image/" + type });
        try {
            await idbPut("covers", url, blob);
            coverCache.urls.set(url, URL.createObjectURL(blob));
            n++;
        } catch (_) {}
    }
    return n;
}
