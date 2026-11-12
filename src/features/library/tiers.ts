// src/features/library/tiers.ts
// ─────────────────────────────────────────────────────────────────
//  Ranking, inside Lists: tier lists and ranked lists of things, characters, or cast & people
//
//  Entries come straight from your library, your characters and people, or the characters and cast of any title you
//  pull in. This is what a tier list keeps and works out, and its buttons (tl-…, tq-…); tiers/TierListPage.svelte
//  draws it, with its dragging, the box you drag around several, and its keys.
// ─────────────────────────────────────────────────────────────────

import {
    $,
    changeMeta,
    clone,
    coverCache,
    curMode,
    download,
    fmtScore,
    hash,
    inMode,
    items,
    legacyNorm,
    MEDIA,
    meta,
    modeById,
    norm,
    nowISO,
    plural,
    scaleOf,
    TIER_DEFAULT,
    titleOf,
    toast,
    today,
    ui,
} from "../core/core";
import { coverSrc } from "../sources/covers";
import { all } from "../core/views";
import { renderMain } from "../core/shell";
import { charImg, charInMode } from "./connect";
import { safeName } from "../import-export/importers";
import { fetchCast, newListId } from "./item-actions";
import type { ActEl } from "../core/core";
import type { List, TierPulled, TierRow } from "../core/model";

/** a tier list: a list with its rows of tiers (a ranked list has one row) */
export type TierList = List & { rows: TierRow[] };
export const isTier = (l: List | null | undefined): l is TierList => !!l && l.kind === "tier" && Array.isArray(l.rows);
/** one entry on a tier list, whatever it is */
export interface TierEnt {
    name: string;
    image: string;
    sub: string;
    rating?: number;
    scale?: string; // the entry's own score scale, when it has one
    item?: string; // an entry in your library
    char?: string; // one of your characters
}

const TIER_COLORS = ["#e5675a", "#ef9850", "#d3c257", "#6cc56f", "#5ea8f2", "#8e9bb3", "#b18ae8", "#e888b8"];
export const TIER_WHAT: Record<string, string> = {
    items: "Things in my library",
    chars: "Characters",
    people: "Cast & people",
};
export const tierWhat = (L: List) => L.what || (L.chars ? "chars" : "items");
// the key a character or person pulled into a list is filed under: their name (with the title it's from, for a
// character). Names in any script make their own key now; a list made before that filed accented and non-Latin names
// under the older, a–z only form, so when the list already holds this one under that key, that key is kept
export function entKey(ents: Record<string, TierPulled> | undefined, name: string, from = "") {
    const key = (n: string) => "x" + hash(n + (from ? "|" + from : "")).toString(36),
        was = key(legacyNorm(name)),
        old = (ents || {})[was];
    return old && norm(old.name) === norm(name) ? was : key(norm(name));
}
export const listCount = (l: List) =>
    l.kind === "tier"
        ? (l.rows || []).reduce((a, r) => a + r.ids.length, 0)
        : (l.ids || []).filter(id => items.has(id)).length;
// one entry, whatever it is: { name, image, sub, rating, open }
export function tierEnt(L: List, key: string): TierEnt | null {
    const w = tierWhat(L);
    if (w === "items") {
        const b = items.get(key);
        return b
            ? {
                  name: titleOf(b),
                  image: coverSrc({ id: key, ...b }),
                  sub: [b.kind || MEDIA[b.medium].one, b.year].filter(Boolean).join(" · "),
                  rating: b.rating,
                  scale: b.scale,
                  item: key,
              }
            : null;
    }
    if (w === "chars") {
        const c = meta.chars.find(x => x.id === key);
        if (c) return { name: c.name, image: charImg(c), sub: c.media?.[0]?.title || "", char: key };
    }
    if (w === "people") {
        const p = (meta.people || []).find(x => x.id === key);
        if (p)
            return {
                name: p.name,
                image: coverCache.src(p.imageData || p.image || ""),
                sub: (p.roles || []).slice(0, 2).join(", "),
            };
    }
    const x = (L.ents || {})[key];
    return x ? { name: x.name, image: x.image ? coverCache.src(x.image) : "", sub: x.sub || "" } : null;
}
function syncTierIds(L: TierList) {
    L.ids = tierWhat(L) === "items" ? L.rows.flatMap(r => r.ids) : [];
    return L;
}
/** what a new tier list starts with */
interface NewTier {
    layout?: string;
    ids?: string[];
    name?: string;
    what?: string;
    chars?: boolean;
    mode?: string;
    onlyDone?: boolean;
}
export function newTierList(p: NewTier = {}) {
    const id = newListId(),
        rank = p.layout === "rank",
        rows: TierRow[] = rank
            ? [{ label: "Ranked", color: "#8e9bb3", ids: [] }]
            : TIER_DEFAULT.map(([label, color]) => ({ label, color, ids: [] }));
    if (p.ids && p.ids.length) rows[0].ids = p.ids.slice();
    changeMeta(rank ? "New ranked list" : "New tier list", "lists", L => [
        ...L,
        syncTierIds({
            id,
            name: p.name || (rank ? "Untitled ranking" : "Untitled tier list"),
            kind: "tier",
            ids: [],
            layout: rank ? "rank" : "tiers",
            what: p.what || (p.chars ? "chars" : "items"),
            mode: p.mode || "",
            onlyDone: p.onlyDone !== false,
            scores: true,
            size: "m",
            rows,
            ents: {},
            notes: {},
            created: nowISO(),
        }),
    ]);
    return id;
}
export function setTier(lid: string, fn: (L: TierList) => TierList, label = "Edit tier list") {
    changeMeta(label, "lists", A => A.map(l => (l.id === lid && isTier(l) ? syncTierIds(fn(clone(l))) : l)));
}
// move one or several entries into a tier (before a given entry if dropped on one), or back to the pool
export function tierPlace(lid: string, keys: Iterable<string>, row: number | "pool", before?: string | null) {
    const list = [...keys];
    tierSel.clear();
    setTier(
        lid,
        L => {
            for (const r of L.rows) r.ids = r.ids.filter(k => !list.includes(k));
            if (row !== "pool" && L.rows[row]) {
                const ids = L.rows[row].ids,
                    i = before ? ids.indexOf(before) : -1;
                i >= 0 ? ids.splice(i, 0, ...list) : ids.push(...list);
            }
            return L;
        },
        list.length > 1 ? `Move ${list.length}` : "Move"
    );
}
export const tierSel = new Set<string>();
let tierLast: string | null = null;
// what's still unplaced; anything skipped in quick rank waits at the end
export function tierPool(L: TierList) {
    const P = tierPoolAll(L),
        S = new Set(L.skip || []);
    return S.size ? [...P.filter(k => !S.has(k)), ...P.filter(k => S.has(k))] : P;
}
function tierPoolAll(L: TierList) {
    const placed = new Set(L.rows.flatMap(r => r.ids)),
        q = norm(ui.tierQ || ""),
        mode = L.mode ? modeById(L.mode) : curMode(),
        w = tierWhat(L);
    const pulled = Object.keys(L.ents || {}).filter(k => {
        const e = L.ents?.[k];
        return !placed.has(k) && (!q || (!!e && norm(e.name + " " + (e.sub || "")).includes(q)));
    });
    if (w === "chars")
        return [
            ...meta.chars
                .filter(c => !placed.has(c.id) && charInMode(c, mode) && (!q || norm(c.name).includes(q)))
                .map(c => c.id),
            ...pulled,
        ];
    if (w === "people")
        return [
            ...(meta.people || [])
                .filter(
                    p =>
                        !p.alStudio &&
                        !(p.roles || []).includes("Studio") &&
                        !placed.has(p.id || "") &&
                        (!q || norm(p.name).includes(q))
                )
                .map(p => p.id || ""),
            ...pulled,
        ];
    return all()
        .filter(
            b =>
                !placed.has(b.id) &&
                inMode(b, mode) &&
                (!L.onlyDone || b.status === "done" || b.rating) &&
                (!q || norm(titleOf(b) + " " + (b.creator || "")).includes(q))
        )
        .sort(
            (a, b) =>
                (b.rating || 0) - (a.rating || 0) ||
                (b.fav ? 1 : 0) - (a.fav ? 1 : 0) ||
                titleOf(a).localeCompare(titleOf(b))
        )
        .map(b => b.id);
}
/** an entry's chip (or ranked row) on the board: what it shows, and its tooltip */
export function chipLook(L: TierList, key: string) {
    const e = tierEnt(L, key);
    if (!e) return null;
    const score = e.rating ? fmtScore(e.rating, scaleOf(e)) : "";
    return {
        key,
        name: e.name,
        sub: e.sub,
        image: e.image,
        title: `${e.name}${e.sub ? " · " + e.sub : ""}${score ? " · " + score : ""}`,
        score: L.scores !== false ? score : "",
    };
}
export type ChipLook = NonNullable<ReturnType<typeof chipLook>>;
/** a tier's mean score, for a list of things in your library */
export const tierAvg = (r: TierRow) => {
    const R = r.ids.map(k => items.get(k)?.rating).filter((x): x is number => !!x);
    return R.length ? fmtScore(R.reduce((a, b) => a + b, 0) / R.length) : "";
};
/** how many of the unplaced the pool shows at once */
export const POOL_MAX = 200;
// ── quick rank: one at a time, a key per tier ──
export function quickPlace(L: TierList, row: number) {
    const pool = tierPool(L),
        k = pool[0];
    if (!k) return;
    tierPlace(L.id, [k], row);
}
export function quickSkip(L: TierList) {
    const pool = tierPool(L),
        k = pool[0];
    if (!k) return;
    setTier(
        L.id,
        X => {
            X.skip = [...(X.skip || []).filter(x => x !== k), k];
            return X;
        },
        "Skip"
    );
}
// ── pulling characters or cast from a title ──
export async function tierPull(L: TierList, typed: string) {
    const q = typed.trim();
    if (!q) {
        toast("Type a title from your library");
        return;
    }
    const hit = all().find(b => norm(titleOf(b)) === norm(q)) || all().find(b => norm(titleOf(b)).includes(norm(q)));
    if (!hit) {
        toast("That isn't in your library yet");
        return;
    }
    ui.tlPulling = true;
    renderMain();
    try {
        const cast = await fetchCast(hit.id),
            w = tierWhat(L),
            add: Record<string, TierPulled> = {};
        for (const c of cast) {
            if (w === "chars" && c.name) {
                add[entKey(L.ents, c.name, hit.id)] = {
                    name: c.name,
                    image: c.src === "tmdb" ? "" : c.image || "",
                    sub: titleOf(hit),
                };
            }
            if (w === "people" && c.va) {
                add[entKey(L.ents, c.va)] = {
                    name: c.va,
                    image: c.vaImage || (c.src === "tmdb" ? c.image : "") || "",
                    sub: c.name ? `${c.name} · ${titleOf(hit)}` : titleOf(hit),
                };
            }
        }
        const n = Object.keys(add).filter(k => !(L.ents || {})[k]).length;
        setTier(
            L.id,
            X => {
                X.ents = { ...(X.ents || {}), ...add };
                return X;
            },
            "Pull in"
        );
        toast(
            n
                ? `Pulled in ${plural(n, "entry", "entries")} from ${titleOf(hit)}`
                : cast.length
                  ? "They're already here"
                  : "Nothing found for that title"
        );
    } catch (_) {
        toast("Couldn't load them. Are you online?");
    }
    ui.tlPulling = false;
    renderMain();
}
// ── the picture ──
async function tierPNG(L: TierList) {
    const rank = L.layout === "rank",
        w = tierWhat(L),
        TW = 84,
        TH = w === "items" ? 126 : 112,
        LBL = 120,
        PAD = 10,
        COLS = 12,
        W_ = LBL + PAD + COLS * (TW + 6) + PAD;
    // fetched as a blob first, so the picture stays saveable (a plain cross-site <img> would lock the canvas)
    const load = async (u: string) => {
        if (!u) return null;
        try {
            const r = await fetch(u, { mode: "cors" });
            if (!r.ok) return null;
            const url = URL.createObjectURL(await r.blob()),
                im = new Image();
            im.src = url;
            await im.decode();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            return im;
        } catch (_) {
            return null;
        }
    };
    const rows = rank
        ? [{ label: "", color: "#8e9bb3", ids: L.rows[0].ids }]
        : L.rows.filter(r => r.ids.length || true);
    const lines = rows.map(r => Math.max(1, Math.ceil(r.ids.length / COLS))),
        H = 64 + lines.reduce((a, n) => a + n * (TH + 6) + 8, 0) + 30;
    const cv = document.createElement("canvas");
    cv.width = W_ * 2;
    cv.height = H * 2;
    const g = cv.getContext("2d");
    if (!g) return;
    g.scale(2, 2);
    const css = getComputedStyle(document.body);
    g.fillStyle = css.getPropertyValue("--bg") || "#0b0d12";
    g.fillRect(0, 0, W_, H);
    g.fillStyle = css.getPropertyValue("--text") || "#eee";
    g.font = "600 22px system-ui, sans-serif";
    g.fillText(L.name, PAD, 38);
    toast("Drawing the picture…");
    let y = 60,
        rank1 = 0;
    for (const [ri, r] of rows.entries()) {
        const h = lines[ri] * (TH + 6);
        if (!rank) {
            if (r.color) g.fillStyle = r.color;
            g.fillRect(PAD, y, LBL - PAD, h);
            g.fillStyle = "#111";
            g.font = "700 22px system-ui, sans-serif";
            g.textAlign = "center";
            g.fillText(r.label || "", PAD + (LBL - PAD) / 2, y + h / 2 + 8, LBL - PAD * 2);
            g.textAlign = "left";
        }
        const imgs = await Promise.all(
            r.ids.map(k => {
                const e = tierEnt(L, k);
                return e ? load(e.image) : null;
            })
        );
        r.ids.forEach((k, i) => {
            const e = tierEnt(L, k) || { name: "?" },
                x = LBL + PAD + (i % COLS) * (TW + 6),
                yy = y + Math.floor(i / COLS) * (TH + 6),
                im = imgs[i];
            g.fillStyle = "#222";
            g.fillRect(x, yy, TW, TH);
            if (im) {
                const s = Math.max(TW / im.width, TH / im.height),
                    dw = im.width * s,
                    dh = im.height * s;
                g.save();
                g.beginPath();
                g.rect(x, yy, TW, TH);
                g.clip();
                g.drawImage(im, x + (TW - dw) / 2, yy + (TH - dh) / 2, dw, dh);
                g.restore();
            }
            if (!im || w !== "items") {
                g.fillStyle = "rgba(0,0,0,.66)";
                g.fillRect(x, yy + TH - 30, TW, 30);
                g.fillStyle = "#fff";
                g.font = "11px system-ui, sans-serif";
                g.fillText(e.name.slice(0, 16), x + 4, yy + TH - 17, TW - 8);
                if (e.name.length > 16) g.fillText(e.name.slice(16, 32), x + 4, yy + TH - 5, TW - 8);
            }
            if (rank) {
                rank1++;
                g.fillStyle = "rgba(0,0,0,.75)";
                g.fillRect(x, yy, 26, 20);
                g.fillStyle = "#fff";
                g.font = "700 12px system-ui, sans-serif";
                g.fillText(String(rank1), x + 5, yy + 14);
            }
        });
        y += h + 8;
    }
    g.fillStyle = "rgba(128,128,128,.8)";
    g.font = "11px system-ui, sans-serif";
    g.fillText("UniverList · " + today(), PAD, H - 10);
    cv.toBlob(b => {
        if (b) download(safeName(L.name) + ".png", b, "image/png");
        else toast("Couldn't make the picture");
    }, "image/png");
}
// ── clicks ──
export async function tierClick(act: string, t: ActEl | null, key: string | undefined, ev?: Event) {
    const L = meta.lists.find(x => x.id === ui.listId);
    if (!isTier(L)) return false;
    const k = key ?? "";
    switch (act) {
        case "tl-sel": {
            const zone = t?.closest("[data-tz]"),
                keys = zone
                    ? [...zone.querySelectorAll<HTMLElement>("[data-tkey]")].map(x => x.dataset.tkey || "")
                    : [];
            if (ev instanceof MouseEvent && ev.shiftKey && tierLast && keys.includes(tierLast)) {
                const [a, b] = [keys.indexOf(tierLast), keys.indexOf(k)].sort((x, y) => x - y);
                for (const x of keys.slice(a, b + 1)) tierSel.add(x);
            } else if (tierSel.has(k)) tierSel.delete(k);
            else tierSel.add(k);
            tierLast = k;
            renderMain();
            return true;
        }
        case "tl-place":
            if (!tierSel.size) return true;
            tierPlace(L.id, [...tierSel], k === "pool" ? "pool" : Number(k));
            return true;
        case "tl-none":
            tierSel.clear();
            renderMain();
            return true;
        case "tl-selall":
            for (const x of tierPool(L).slice(0, 200)) tierSel.add(x);
            renderMain();
            return true;
        case "tl-addrow":
            setTier(
                L.id,
                X => {
                    X.rows.splice(Number(k), 0, {
                        label: "New",
                        color: TIER_COLORS[X.rows.length % TIER_COLORS.length],
                        ids: [],
                    });
                    return X;
                },
                "Add tier"
            );
            setTimeout(() => {
                const i = $<HTMLInputElement>(`[data-tllabel="${Number(k)}"]`);
                if (i) {
                    i.focus();
                    i.select();
                }
            }, 30);
            return true;
        case "tl-rowdel":
            setTier(
                L.id,
                X => {
                    X.rows.splice(Number(k), 1);
                    return X;
                },
                "Delete tier"
            );
            return true;
        case "tl-rowmove":
            setTier(
                L.id,
                X => {
                    const i = Number(k),
                        j = i + Number(t?.dataset.d);
                    if (j >= 0 && j < X.rows.length) [X.rows[i], X.rows[j]] = [X.rows[j], X.rows[i]];
                    return X;
                },
                "Move tier"
            );
            return true;
        case "tl-clear":
            setTier(
                L.id,
                X => {
                    for (const r of X.rows) r.ids = [];
                    return X;
                },
                "Clear"
            );
            return true;
        case "tl-layout":
            setTier(
                L.id,
                X => {
                    if (k === "rank" && X.layout !== "rank") {
                        X.tiersWas = X.rows;
                        X.rows = [{ label: "Ranked", color: "#8e9bb3", ids: X.rows.flatMap(r => r.ids) }];
                    } else if (k === "tiers" && X.layout === "rank") {
                        const ids = X.rows[0].ids,
                            was = X.tiersWas;
                        X.rows =
                            was && was.length
                                ? was.map(r => ({ ...r, ids: r.ids.filter(i => ids.includes(i)) }))
                                : TIER_DEFAULT.map(([label, color]) => ({ label, color, ids: [] }));
                        const left = ids.filter(i => !X.rows.some(r => r.ids.includes(i)));
                        X.rows[0].ids.push(...left);
                    }
                    X.layout = k;
                    return X;
                },
                "Change layout"
            );
            return true;
        case "tl-size":
            setTier(
                L.id,
                X => {
                    X.size = k;
                    return X;
                },
                "Size"
            );
            return true;
        case "tl-more":
            ui.tlMore = !ui.tlMore;
            renderMain();
            return true;
        case "tl-quick":
            ui.tquick = true;
            setTier(
                L.id,
                X => {
                    X.skip = [];
                    return X;
                },
                "Quick rank"
            );
            return true;
        case "tq-place":
            quickPlace(L, Number(k));
            return true;
        case "tq-skip":
            quickSkip(L);
            return true;
        case "tq-stop":
            ui.tquick = null;
            renderMain();
            return true;
        case "tl-png":
            tierPNG(L);
            return true;
    }
    return false;
}
