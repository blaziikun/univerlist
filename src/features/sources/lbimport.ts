// src/features/sources/lbimport.ts
// ─────────────────────────────────────────────────────────────────
//  LaunchBox's games database: the real box for your platform, its back, 3D box and spine
//
//  LaunchBox publishes the whole database as one free download (Metadata.zip, updated daily). You choose the file here;
//  it's read in this browser as a stream (it's big), matched against your games by title and platform, and only the
//  picture addresses are kept. The file is read as hostile: anything in it that isn't what LaunchBox writes is skipped,
//  and the slim copy kept in this browser is checked again each time it's read back.
// ─────────────────────────────────────────────────────────────────

import {
    errMessage,
    idbGet,
    idTitle,
    isRecord,
    items,
    legacyIdTitle,
    listOf,
    meta,
    norm,
    nowISO,
    numOf,
    onItemAdded,
    openDB,
    ownOf,
    quietPatch,
    scheduleSave,
    sleep,
    textOf,
    toast,
    tx,
    ui,
} from "../core/core";
import { updateItemTiles } from "./covers";
import { renderMain } from "../core/shell";
import { workChanged } from "./work-state.svelte";

/** the slim copy: when it was made, how many games it lists, each title's releases and each release's pictures */
interface LbIndex {
    at: string;
    n: number;
    // by title key: [LaunchBox id, platform, year][]; by LaunchBox id: [front, back, 3D box, spine, front's region].
    // Older copies kept plain objects rather than Maps
    games: Map<unknown, unknown> | Record<string, unknown>;
    img: Map<unknown, unknown> | Record<string, unknown>;
}
const asLbIndex = (x: unknown): LbIndex | null =>
    isRecord(x) &&
    typeof x.at === "string" &&
    (x.games instanceof Map || isRecord(x.games)) &&
    (x.img instanceof Map || isRecord(x.img))
        ? { at: x.at, n: numOf(x.n) || 0, games: x.games, img: x.img }
        : null;
export const LB: {
    running: boolean;
    read: number;
    size: number;
    phase: string;
    matched: number;
    total: number;
    done: boolean;
    err: string;
    idx?: LbIndex | null;
    kept?: boolean;
    tried?: boolean;
} = { running: false, read: 0, size: 0, phase: "", matched: 0, total: 0, done: false, err: "" };
const LB_IMG = "https://images.launchbox-app.com/",
    lbURL = (f: string) => LB_IMG + encodeURI(f).replace(/#/g, "%23");
const LB_DROP = new Set(["sony", "nintendo", "microsoft", "sega", "the", "entertainment", "system", "console"]);
const lbPlat = (p: string) => {
    const n = norm(p)
        .replace(/\bpc\b|microsoft windows|\bwindows\b|\bsteam\b/g, "windows")
        .replace(/\bplaystation\b/g, "playstation")
        .split(" ")
        .filter(w => w && !LB_DROP.has(w))
        .join(" ");
    return n;
};
const lbUnx = (s: string) =>
    String(s || "")
        .replace(/&amp;/g, "&")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
const lbTag = (x: string, t: string) => {
    const m = new RegExp(`<${t}>([^<]*)</${t}>`).exec(x);
    return m ? lbUnx(m[1]) : "";
};
/** where Metadata.xml is in the zip, and how it's stored */
interface LbEntry {
    name: string;
    method: number;
    csize: number;
    off: number;
    start: number;
}
// find Metadata.xml inside the zip without loading the whole thing
async function lbEntry(file: File): Promise<LbEntry> {
    const tail = new DataView(await file.slice(Math.max(0, file.size - 66000)).arrayBuffer());
    let e = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--)
        if (tail.getUint32(i, true) === 0x06054b50) {
            e = i;
            break;
        }
    if (e < 0) throw new Error("That isn't a zip file.");
    let n = tail.getUint16(e + 10, true);
    const cdSize = tail.getUint32(e + 12, true),
        cdOff = tail.getUint32(e + 16, true);
    const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()),
        dec = new TextDecoder();
    let p = 0;
    const E: Omit<LbEntry, "start">[] = [];
    while (n-- > 0 && p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50) {
        const method = cd.getUint16(p + 10, true),
            csize = cd.getUint32(p + 20, true),
            nlen = cd.getUint16(p + 28, true),
            xlen = cd.getUint16(p + 30, true),
            clen = cd.getUint16(p + 32, true),
            off = cd.getUint32(p + 42, true);
        if (p + 46 + nlen > cd.byteLength) break;
        E.push({ name: dec.decode(new Uint8Array(cd.buffer, p + 46, nlen)), method, csize, off });
        p += 46 + nlen + xlen + clen;
    }
    const x =
        E.find(z => /(^|\/)Metadata\.xml$/i.test(z.name)) ||
        E.filter(z => /\.xml$/i.test(z.name)).sort((a, b) => b.csize - a.csize)[0];
    if (!x) throw new Error("No Metadata.xml in that zip. Is it LaunchBox's Metadata.zip?");
    const lh = new DataView(await file.slice(x.off, x.off + 30).arrayBuffer());
    if (lh.byteLength < 30) throw new Error("That zip is damaged.");
    const start = x.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    return { ...x, start };
}
/** the most text kept waiting for a block's end: a <Game> is a few kilobytes, so a file with an unclosed one is
 * skipped past rather than held in memory */
const LB_MAX_PENDING = 4e6;
// read the XML as text, a piece at a time, handing over each <Game> and <GameImage>
async function lbScan(file: File, ent: LbEntry, onBlock: (tag: string, x: string) => void) {
    let raw: ReadableStream<Uint8Array<ArrayBuffer>> = file.slice(ent.start, ent.start + ent.csize).stream();
    LB.size = ent.csize;
    LB.read = 0;
    const counter = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
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
        let m: RegExpExecArray | null,
            cut = 0;
        while ((m = re.exec(buf))) {
            onBlock(m[1], m[2]);
            cut = re.lastIndex;
        }
        buf = buf.slice(cut);
        const o = buf.lastIndexOf("<Game");
        buf = o >= 0 && buf.length - o < LB_MAX_PENDING ? buf.slice(o) : buf.slice(-12);
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
const LB_TYPES: Record<string, number> = {
    "Box - Front": 0,
    "Box - Front - Reconstructed": 0,
    "Box - Back": 1,
    "Box - 3D": 2,
    "Box - Spine": 3,
};
let lbDB: IDBDatabase | null = null;
// names like "Constructor" are real games: look things up safely whether the copy holds Maps or plain objects
const lbGet = (o: LbIndex["games"] | undefined, k: string): unknown[] | null => {
    if (!o) return null;
    const v = o instanceof Map ? o.get(k) : Object.hasOwn(o, k) ? o[k] : null;
    return Array.isArray(v) ? v : null;
};
/** a title's releases in the slim copy: LaunchBox's id, the platform and the year */
const lbReleases = (idx: LbIndex, k: string): [db: string, plat: string, year: number][] =>
    listOf(lbGet(idx.games, k)).flatMap((r): [string, string, number][] =>
        Array.isArray(r) && textOf(r[0]) ? [[textOf(r[0]), textOf(r[1]), numOf(r[2]) || 0]] : []
    );
/** a release's pictures in the slim copy: front, back, 3D box, spine ("" where it has none), and the front's region */
const lbImages = (idx: LbIndex, db: string): string[] | null => {
    const J = lbGet(idx.img, db);
    return J ? [0, 1, 2, 3, 4].map(i => textOf(J[i])) : null;
};
export async function lbStore(): Promise<IDBDatabase> {
    if (!lbDB) lbDB = await openDB("univerlist-launchbox", 1, ["x"]);
    return lbDB;
}
async function lbLoad(): Promise<LbIndex | null> {
    if (LB.idx) return LB.idx;
    try {
        LB.idx = asLbIndex(await idbGet("x", "idx", await lbStore()));
    } catch (_) {
        LB.idx = null;
    }
    return LB.idx;
}
async function lbImport(file: File) {
    if (LB.running) return;
    Object.assign(LB, { running: true, done: false, err: "", matched: 0, phase: "Reading LaunchBox's database…" });
    lbRedraw();
    try {
        const ent = await lbEntry(file),
            games = new Map<string, [string, string, number][]>(),
            img = new Map<string, (string | null)[]>(),
            rank = new Map<string, number[]>(),
            REG = LB_REG(),
            rk = (r: string) => {
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
                const t = ownOf(LB_TYPES, lbTag(x, "Type"));
                if (t == null) return;
                const db = lbTag(x, "DatabaseID"),
                    r = lbTag(x, "Region"),
                    f = lbTag(x, "FileName");
                if (!db || !f) return;
                let a = img.get(db),
                    q = rank.get(db);
                if (!a || !q) {
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
        const idx: LbIndex = { at: nowISO(), n, games, img };
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
        LB.err = errMessage(e) || "Couldn't read that file.";
    }
    LB.running = false;
    lbRedraw();
}
// match games against the slim copy: the release for your platform, its real box as the cover, its spine on the shelf, every box in Art
function lbApply(ids: string[], idx: LbIndex, force: boolean): number {
    let got = 0;
    for (const id of ids) {
        const b = items.get(id);
        if (!b || b.medium !== "game" || (!force && b.lbChecked === idx.at)) continue;
        // a copy of the index made before titles in any script had keys of their own files them under the older,
        // a–z only key, so that one is tried too
        const now = lbReleases(idx, idTitle(b.title)),
            was = legacyIdTitle(b.title),
            cands = now.length ? now : was ? lbReleases(idx, was) : [];
        const mark = { lbChecked: idx.at };
        if (!cands.length) {
            quietPatch(id, mark);
            continue;
        }
        const mine = [b.platform, ...(b.platforms || [])].filter((p): p is string => !!p).map(lbPlat);
        const pick = cands
            .map(([db, plat, year]) => {
                const lp = lbPlat(plat),
                    pi = mine.findIndex(m => m && (m === lp || lp.includes(m) || m.includes(lp))),
                    I = lbImages(idx, db);
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
        const I = lbImages(idx, pick.db) || [];
        if (!I[0] && !I[3]) {
            quietPatch(id, mark);
            continue;
        }
        const NAMES = ["front", "back", "3D box", "spine"],
            art: { cover: string; label: string; wide?: boolean }[] = [];
        for (const [db, plat] of [[pick.db, pick.plat], ...cands.filter(c => c[0] !== pick.db)]) {
            const J = lbImages(idx, db);
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
async function lbAuto(ids?: string[]) {
    const idx = await lbLoad();
    if (!idx) return;
    const n = lbApply(ids || [...items.keys()], idx, false);
    if (n) {
        scheduleSave();
        if (ui.page === "profile") renderMain();
    }
}
// what's said under the button moved on (settings/sections/data/LaunchBox.svelte)
function lbRedraw() {
    workChanged("lb");
}
/** what's said under LaunchBox's button: an error, how far reading has got, what was matched, or the copy kept here */
export type LbStat =
    | { k: "err"; err: string }
    | { k: "running"; phase: string; pct: number | null; bar: number }
    | { k: "done"; matched: number; total: number; kept: boolean }
    | { k: "kept"; at: string; n: number }
    | { k: "none" };
export function lbView(): LbStat {
    if (LB.err) return { k: "err", err: LB.err };
    if (LB.running)
        return {
            k: "running",
            phase: LB.phase,
            pct: LB.size ? Math.min(100, Math.round((LB.read / LB.size) * 100)) : null,
            bar: LB.size ? Math.min(100, (LB.read / LB.size) * 100) : 0,
        };
    if (LB.done) return { k: "done", matched: LB.matched, total: LB.total, kept: !!LB.kept };
    if (LB.idx) return { k: "kept", at: new Date(LB.idx.at).toLocaleDateString(), n: LB.idx.n };
    return { k: "none" };
}
/** the copy kept in this browser is looked for once, the first time the panel shows */
export function lbLookOnce() {
    if (LB.idx || LB.tried) return;
    LB.tried = true;
    lbLoad().then(() => lbRedraw());
}
/** Choose Metadata.zip… */
export function lbPick() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".zip,application/zip";
    inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (f) lbImport(f);
    };
    inp.click();
}
/** Forget it: the copy kept in this browser goes; the pictures your games already have stay */
export async function lbForget() {
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
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initLbimport() {
    onItemAdded((id, data) => {
        if (data && data.medium === "game") setTimeout(() => lbAuto([id]), 1500);
    });
    setTimeout(() => lbAuto(), 8000);
}
