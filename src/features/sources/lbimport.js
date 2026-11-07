// src/features/sources/lbimport.js
// ─────────────────────────────────────────────────────────────────
//  LaunchBox's games database: the real box for your platform, its back, 3D box and spine
//
//  LaunchBox publishes the whole database as one free download (Metadata.zip, updated daily). You choose the file here;
//  it's read in this browser as a stream (it's big), matched against your games by title and platform, and only the
//  picture addresses are kept.
// ─────────────────────────────────────────────────────────────────

const LB = { running: false, read: 0, size: 0, phase: "", matched: 0, total: 0, done: false, err: "" };
const LB_IMG = "https://images.launchbox-app.com/",
    lbURL = f => LB_IMG + encodeURI(f).replace(/#/g, "%23");
const LB_DROP = new Set(["sony", "nintendo", "microsoft", "sega", "the", "entertainment", "system", "console"]);
const lbPlat = p => {
    const n = norm(p)
        .replace(/\bpc\b|microsoft windows|\bwindows\b|\bsteam\b/g, "windows")
        .replace(/\bplaystation\b/g, "playstation")
        .split(" ")
        .filter(w => w && !LB_DROP.has(w))
        .join(" ");
    return n;
};
const lbUnx = s =>
    String(s || "")
        .replace(/&amp;/g, "&")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
const lbTag = (x, t) => {
    const m = new RegExp(`<${t}>([^<]*)</${t}>`).exec(x);
    return m ? lbUnx(m[1]) : "";
};
// find Metadata.xml inside the zip without loading the whole thing
async function lbEntry(file) {
    const tail = new DataView(await file.slice(Math.max(0, file.size - 66000)).arrayBuffer());
    let e = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--)
        if (tail.getUint32(i, true) === 0x06054b50) {
            e = i;
            break;
        }
    if (e < 0) throw new Error("That isn't a zip file.");
    let n = tail.getUint16(e + 10, true),
        cdSize = tail.getUint32(e + 12, true),
        cdOff = tail.getUint32(e + 16, true);
    const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()),
        dec = new TextDecoder();
    let p = 0;
    const E = [];
    while (n-- > 0 && p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50) {
        const method = cd.getUint16(p + 10, true),
            csize = cd.getUint32(p + 20, true),
            nlen = cd.getUint16(p + 28, true),
            xlen = cd.getUint16(p + 30, true),
            clen = cd.getUint16(p + 32, true),
            off = cd.getUint32(p + 42, true);
        E.push({ name: dec.decode(new Uint8Array(cd.buffer, p + 46, nlen)), method, csize, off });
        p += 46 + nlen + xlen + clen;
    }
    const x =
        E.find(z => /(^|\/)Metadata\.xml$/i.test(z.name)) ||
        E.filter(z => /\.xml$/i.test(z.name)).sort((a, b) => b.csize - a.csize)[0];
    if (!x) throw new Error("No Metadata.xml in that zip. Is it LaunchBox's Metadata.zip?");
    const lh = new DataView(await file.slice(x.off, x.off + 30).arrayBuffer()),
        start = x.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    return { ...x, start };
}
// read the XML as text, a piece at a time, handing over each <Game> and <GameImage>
async function lbScan(file, ent, onBlock) {
    let raw = file.slice(ent.start, ent.start + ent.csize).stream();
    LB.size = ent.csize;
    LB.read = 0;
    const counter = new TransformStream({
        transform(c, ctl) {
            LB.read += c.byteLength;
            ctl.enqueue(c);
        },
    });
    raw = raw.pipeThrough(counter);
    if (ent.method === 8) raw = raw.pipeThrough(new DecompressionStream("deflate-raw"));
    const rd = raw.pipeThrough(new TextDecoderStream()).getReader(),
        re = /<(Game|GameImage)>([\s\S]*?)<\/\1>/g;
    let buf = "",
        last = 0;
    for (;;) {
        const { value, done } = await rd.read();
        if (value) buf += value;
        re.lastIndex = 0;
        let m,
            cut = 0;
        while ((m = re.exec(buf))) {
            onBlock(m[1], m[2]);
            cut = re.lastIndex;
        }
        buf = buf.slice(cut);
        const o = buf.lastIndexOf("<Game");
        buf = o >= 0 ? buf.slice(o) : buf.slice(-12);
        if (Date.now() - last > 400) {
            last = Date.now();
            lbRedraw();
            await sleep(0);
        }
        if (done) break;
    }
}
// the whole database, slimmed to what pictures need (name, platform, year and the best front, back, 3D box and spine of each
// release), kept in this browser so games you add later get theirs straight away, without the zip
const LB_REG = () => [
    meta.settings.region === "US" ? "North America" : "Europe",
    "United Kingdom",
    "World",
    "North America",
    "Europe",
    "",
    "Japan",
];
const LB_TYPES = {
    "Box - Front": 0,
    "Box - Front - Reconstructed": 0,
    "Box - Back": 1,
    "Box - 3D": 2,
    "Box - Spine": 3,
};
let lbDB = null;
// names like "Constructor" are real games: look things up safely whether the copy holds Maps or plain objects
const lbGet = (o, k) => {
    if (!o) return null;
    if (o instanceof Map) return o.get(k) || null;
    const v = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null;
    return Array.isArray(v) ? v : null;
};
async function lbStore() {
    if (!lbDB) lbDB = await openDB("univerlist-launchbox", 1, ["x"]);
    return lbDB;
}
async function lbLoad() {
    if (LB.idx) return LB.idx;
    try {
        LB.idx = (await idbGet("x", "idx", await lbStore())) || null;
    } catch (_) {
        LB.idx = null;
    }
    return LB.idx;
}
async function lbImport(file) {
    if (LB.running) return;
    Object.assign(LB, { running: true, done: false, err: "", matched: 0, phase: "Reading LaunchBox's database…" });
    lbRedraw();
    try {
        const ent = await lbEntry(file),
            games = new Map(),
            img = new Map(),
            rank = new Map(),
            REG = LB_REG(),
            rk = r => {
                const i = REG.indexOf(r);
                return i < 0 ? 9 : i;
            };
        let n = 0;
        await lbScan(file, ent, (tag, x) => {
            if (tag === "Game") {
                const name = lbTag(x, "Name"),
                    db = lbTag(x, "DatabaseID");
                if (!name || !db) return;
                const k = idTitle(name);
                let g = games.get(k);
                if (!g) games.set(k, (g = []));
                g.push([
                    db,
                    lbTag(x, "Platform"),
                    +lbTag(x, "ReleaseYear") || +lbTag(x, "ReleaseDate").slice(0, 4) || 0,
                ]);
                n++;
            } else {
                const t = LB_TYPES[lbTag(x, "Type")];
                if (t == null) return;
                const db = lbTag(x, "DatabaseID"),
                    r = lbTag(x, "Region"),
                    f = lbTag(x, "FileName");
                if (!db || !f) return;
                let a = img.get(db),
                    q = rank.get(db);
                if (!a) {
                    img.set(db, (a = [null, null, null, null, ""]));
                    rank.set(db, (q = [99, 99, 99, 99]));
                }
                const s = rk(r) * 2 + (lbTag(x, "Type") === "Box - Front - Reconstructed" ? 1 : 0);
                if (s < q[t]) {
                    q[t] = s;
                    a[t] = f;
                    if (t === 0) a[4] = r;
                }
            }
        });
        LB.phase = "Saving a slim copy in this browser…";
        lbRedraw();
        const idx = { at: nowISO(), n, games, img };
        LB.idx = idx;
        try {
            await tx(
                "x",
                "readwrite",
                st => {
                    st.put(idx, "idx");
                },
                await lbStore()
            );
            LB.kept = true;
        } catch (_) {
            LB.kept = false;
        }
        LB.phase = "Matching your games…";
        lbRedraw();
        const G = [...items.entries()].filter(([, b]) => b.medium === "game");
        LB.total = G.length;
        LB.matched = lbApply(
            G.map(([id]) => id),
            idx,
            true
        );
        scheduleSave();
        LB.phase = "";
        LB.done = true;
        toast(`LaunchBox: matched ${LB.matched} of ${LB.total} games`);
    } catch (e) {
        LB.err = e.message || "Couldn't read that file.";
    }
    LB.running = false;
    lbRedraw();
}
// match games against the slim copy: the release for your platform, its real box as the cover, its spine on the shelf, every box in Art
function lbApply(ids, idx, force) {
    let got = 0;
    for (const id of ids) {
        const b = items.get(id);
        if (!b || b.medium !== "game" || (!force && b.lbChecked === idx.at)) continue;
        const cands = lbGet(idx.games, idTitle(b.title)) || [];
        const mark = { lbChecked: idx.at };
        if (!cands.length) {
            quietPatch(id, mark);
            continue;
        }
        const mine = [b.platform, ...(b.platforms || [])].filter(Boolean).map(lbPlat);
        const pick = cands
            .map(([db, plat, year]) => {
                const lp = lbPlat(plat),
                    pi = mine.findIndex(m => m && (m === lp || lp.includes(m) || m.includes(lp))),
                    I = lbGet(idx.img, db);
                return {
                    db,
                    plat,
                    s:
                        (pi < 0 ? 0 : 10 - pi) +
                        (b.year && year ? (year === b.year ? 2 : Math.abs(year - b.year) <= 1 ? 1 : 0) : 0) +
                        (I && (I[0] || I[3]) ? 1 : 0),
                };
            })
            .sort((x, y) => y.s - x.s)[0];
        const I = lbGet(idx.img, pick.db) || [];
        if (!I[0] && !I[3]) {
            quietPatch(id, mark);
            continue;
        }
        const NAMES = ["front", "back", "3D box", "spine"],
            art = [];
        for (const [db, plat] of [[pick.db, pick.plat], ...cands.filter(c => c[0] !== pick.db)]) {
            const J = lbGet(idx.img, db);
            if (!J) continue;
            J.slice(0, 4).forEach((f, t) => {
                if (f)
                    art.push({
                        cover: lbURL(f),
                        label: `LaunchBox · ${plat} · ${NAMES[t]}${t === 0 && J[4] ? " (" + J[4] + ")" : ""}`,
                        ...(t === 1 || t === 3 ? { wide: true } : {}),
                    });
            });
        }
        quietPatch(id, {
            ...mark,
            lbArt: art.slice(0, 60),
            ...(I[3] && !b.spinePicked ? { spineArt: lbURL(I[3]) } : {}),
            ...(I[0] && !b.coverPicked ? { cover: lbURL(I[0]), coverData: null, coverColor: null, color: null } : {}),
            ...(!b.platform && pick.plat ? { platform: pick.plat } : {}),
        });
        updateItemTiles(id);
        got++;
    }
    return got;
}
// new games (added by hand, searched, imported or synced) get theirs from the slim copy, quietly
async function lbAuto(ids) {
    const idx = await lbLoad();
    if (!idx) return;
    const n = lbApply(ids || [...items.keys()], idx, false);
    if (n) {
        scheduleSave();
        if (ui.page === "profile") renderMain();
    }
}
onItemAdded((id, data) => {
    if (data && data.medium === "game") setTimeout(() => lbAuto([id]), 1500);
});
setTimeout(() => lbAuto(), 8000);
function lbRedraw() {
    const el = $("#lbstat");
    if (el) el.innerHTML = lbStatHTML();
}
function lbStatHTML() {
    if (LB.err) return `<p class="err">${esc(LB.err)}</p>`;
    if (LB.running)
        return `<p class="hint">${esc(LB.phase)} ${LB.size ? Math.min(100, Math.round((LB.read / LB.size) * 100)) + "%" : ""}</p><div class="prog"><span style="width:${LB.size ? Math.min(100, (LB.read / LB.size) * 100) : 0}%"></span></div>`;
    if (LB.done)
        return `<p class="hint">Matched ${LB.matched} of ${LB.total} games. Their real box is now the cover (unless you'd picked one), spines are on the shelf, and the back and 3D box are in each card's Art.${LB.kept ? " A slim copy is kept in this browser, so games you add from now on get theirs by themselves." : ""}</p>`;
    if (LB.idx)
        return `<p class="hint">Kept in this browser: LaunchBox's database from ${esc(new Date(LB.idx.at).toLocaleDateString())} (${LB.idx.n.toLocaleString()} games). New games get their boxes and spines by themselves; choose a newer Metadata.zip any time to refresh it. <button class="linkbtn" data-act="lb-forget">Forget it</button></p>`;
    return "";
}
function lbPanelHTML() {
    if (!LB.idx && !LB.tried) {
        LB.tried = true;
        lbLoad().then(() => lbRedraw());
    }
    return `<div class="lbpanel"><p class="label">LaunchBox boxes and spines</p><p class="hint">No key needed. 1. Download <a class="link" href="https://gamesdb.launchbox-app.com/Metadata.zip" target="_blank" rel="noopener">Metadata.zip ↗</a> (LaunchBox's whole database; it's large). 2. Choose it here. It's read in this browser and nothing is uploaded; only a slim list of picture addresses is kept.</p>
    <div class="bar"><button class="btn" data-act="lb-pick" ${LB.running ? "disabled" : ""}>Choose Metadata.zip…</button></div><div id="lbstat">${lbStatHTML()}</div></div>`;
}
document.addEventListener("click", e => {
    if (!e.target.closest('[data-act="lb-pick"]')) return;
    e.preventDefault();
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".zip,application/zip";
    inp.onchange = () => inp.files[0] && lbImport(inp.files[0]);
    inp.click();
});
document.addEventListener("click", async e => {
    if (!e.target.closest('[data-act="lb-forget"]')) return;
    e.preventDefault();
    try {
        await tx(
            "x",
            "readwrite",
            st => {
                st.delete("idx");
            },
            await lbStore()
        );
    } catch (_) {}
    LB.idx = null;
    LB.done = false;
    lbRedraw();
    toast("Forgot the LaunchBox copy. Your games keep their pictures.");
});
