// src/features/core/parts.ts
// ─────────────────────────────────────────────────────────────────
//  Parts: several entries kept as one (seasons of a show, a trilogy, the volumes of a manga), each keeping its own
//  score
//
//  The entry you keep holds parts: [ids]. Each part keeps all its own data and points back with partOf, and stays out
//  of lists and stats until you split it out again. Nothing is deleted either way.
// ─────────────────────────────────────────────────────────────────

import {
    type ActEl,
    addItem,
    change,
    cleanTitle,
    entryOf,
    fmtScore,
    isRecord,
    items,
    listOf,
    markDirty,
    meta,
    norm,
    plural,
    present,
    titleOf,
    toast,
    ui,
    undo,
} from "./core";
import { itunesJSON } from "../sources/box-art";
import { all, modeItems, titleById } from "./views";
import { renderMain } from "./shell";
import { renderOverlay } from "./modals";
import { animeChain, commonName, isSeasonish, seasonChain } from "../watch-read/watch";
import { seasonsAcrossLibrary } from "../watch-read/stage";
import type { Entry, Item } from "./model";

export const partsOf = (b: Item | undefined): string[] => (b?.parts || []).filter(id => items.has(id));
const isPart = (b: Item): b is Item & { partOf: string } => !!(b.partOf && items.has(b.partOf));
const partOrder = (a: Item, b: Item) =>
    (a.year || 9999) - (b.year || 9999) ||
    Number(a.seriesNo || 0) - Number(b.seriesNo || 0) ||
    String(titleOf(a)).localeCompare(String(titleOf(b)), undefined, { numeric: true });
// the shared start of two titles ("Little Busters!" and "Little Busters! Refrain") or a shared series
export function sameSeries(a: Item, b: Item) {
    if (a.series && a.series === b.series) return true;
    if (a.franchise && a.franchise === b.franchise) return true;
    const x = norm(cleanTitle(titleOf(a))),
        y = norm(cleanTitle(titleOf(b))),
        n = Math.min(x.length, y.length);
    let i = 0;
    while (i < n && x[i] === y[i]) i++;
    const stem = x.slice(0, i).trim();
    return (
        stem.length >= 5 &&
        stem.split(" ").length >= 1 &&
        (x.startsWith(stem + " ") || x === stem || y.startsWith(stem + " ") || y === stem)
    );
}
export function combineItems(given: string[], keepId?: string | null): string | null {
    const ids = [...new Set(given)].filter(id => items.has(id));
    if (ids.length < 2) return null;
    // folding in an entry that already has parts brings its parts along
    const flat = [...new Set(ids.flatMap(id => [id, ...partsOf(items.get(id))]))];
    const L = flat.map(entryOf).filter(present).sort(partOrder),
        keep = keepId && flat.includes(keepId) ? keepId : L[0].id;
    const others = L.filter(x => x.id !== keep).map(x => x.id);
    change(`Combine ${L.length} into ${titleById(keep)}`, flat, (x, id) =>
        x
            ? id === keep
                ? { ...x, parts: others, partOf: undefined }
                : { ...x, partOf: keep, parts: undefined }
            : undefined
    );
    ui.sel.clear();
    toast(`${titleById(keep)} now holds ${plural(others.length, "part")}. Each keeps its own score.`, {
        label: "Undo",
        fn: undo,
    });
    return keep;
}
export function splitPart(parentId: string, childId: string | null) {
    const p = items.get(parentId);
    if (!p) return;
    const ids = childId ? [childId] : partsOf(p);
    change(childId ? `Split out ${titleById(childId)}` : `Split ${titleOf(p)} apart`, [parentId, ...ids], (x, id) =>
        x
            ? id === parentId
                ? { ...x, parts: childId ? partsOf(p).filter(c => c !== childId) : undefined }
                : { ...x, partOf: undefined }
            : undefined
    );
    toast(childId ? "Split out: it's its own entry again" : "Split apart", { label: "Undo", fn: undo });
}
// the score a combined entry shows when you haven't scored the whole: the average of its parts
export function partsScore(b: Item): number {
    const R = partsOf(b)
        .map(id => items.get(id)?.rating)
        .filter((r): r is number => !!r);
    return R.length ? Math.round((R.reduce((a, x) => a + x, 0) / R.length) * 10) / 10 : 0;
}
/** what an entry's Parts section on its card shows (library/card/ItemParts.svelte): its parts in order, what they're
 *  called, the average of their scores, others that look like the same series, and what else could be combined in */
export function partsView(b: Entry) {
    return {
        parts: partsOf(b).map(entryOf).filter(present).sort(partOrder),
        unit: ["manga", "manhwa", "novel", "book", "comic"].includes(b.medium)
            ? b.medium === "book"
                ? "books"
                : "volumes"
            : "seasons",
        same: all()
            .filter(x => x.id !== b.id && x.medium === b.medium && !isPart(x) && sameSeries(x, b))
            .slice(0, 8),
        avg: partsScore(b),
        others: all()
            .filter(x => x.id !== b.id && x.medium === b.medium && !isPart(x))
            .slice(0, 400),
    };
}
// one entry per volume, held as parts, each with its own cover when Apple Books has it
export async function splitIntoVolumes(id: string) {
    const b = items.get(id);
    if (!b || !b.vols || !(b.vols > 1)) return;
    const n = Math.min(120, b.vols),
        art = await volumeCovers(b).catch((): Record<number, string> => ({})),
        made: string[] = [];
    for (let v = 2; v <= n; v++)
        made.push(
            addItem(
                {
                    medium: b.medium,
                    kind: b.kind,
                    title: `${cleanTitle(titleOf(b))}, Vol. ${v}`,
                    creator: b.creator,
                    year: b.year,
                    seriesNo: v,
                    cover: art[v] || "",
                    status: (b.volsOwned || []).includes(v) && b.status === "done" ? "done" : "want",
                    copy: (b.volsOwned || []).includes(v) ? b.copy : "none",
                    partOf: id,
                    genres: b.genres,
                },
                "Volume " + v
            )
        );
    change(`Split ${titleOf(b)} into volumes`, [id], x =>
        x
            ? {
                  ...x,
                  parts: [...(x.parts || []), ...made],
                  seriesNo: 1,
                  ...(art[1] && !x.coverPicked ? { volCover: art[1] } : {}),
              }
            : undefined
    );
    toast(`Made ${n} volumes${Object.keys(art).length ? `, ${Object.keys(art).length} with their own cover` : ""}`);
}
// volume covers: Apple Books lists most manga and light novels volume by volume
export async function volumeCovers(b: Item, signal?: AbortSignal): Promise<Record<number, string>> {
    const t = cleanTitle(titleOf(b)),
        out: Record<number, string> = {};
    const j = await itunesJSON(
        { term: t, media: "ebook", limit: "200", country: (meta.settings.region || "GB").toLowerCase() },
        signal
    );
    for (const r of listOf(isRecord(j) ? j.results : null)) {
        if (!isRecord(r)) continue;
        const name = String(r.trackName || ""),
            m = name.match(/(?:vol(?:ume)?\.?|#)\s*(\d{1,3})\b/i) || name.match(/\b(\d{1,3})\s*$/);
        if (!m || !norm(name).includes(norm(t).slice(0, 18))) continue;
        const v = +m[1];
        if (!out[v] && typeof r.artworkUrl100 === "string")
            out[v] = r.artworkUrl100.replace(/\/\d+x\d+bb\./, "/600x900bb.");
    }
    return out;
}
export function partsClick(act: string, _t: ActEl, k: string | undefined): boolean {
    const m = ui.modal && ui.modal.kind === "item" ? ui.modal : null;
    if (!m || !m.id) return false;
    const id = m.id;
    if (act === "parts-split") {
        splitPart(id, k || null);
        renderOverlay();
        renderMain();
        return true;
    }
    if (act === "parts-add") {
        combineItems([id, k || ""], id);
        renderOverlay();
        renderMain();
        return true;
    }
    if (act === "parts-vols") {
        splitIntoVolumes(id).then(() => {
            renderOverlay();
            renderMain();
        });
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════
//  SEASONS: FOUND, COMBINED, RE-FRONTED AND SPLIT, A WHOLE LIBRARY AT A TIME
// ═══════════════════════════════════════════
// the seasons of each show among these entries that aren't all in one entry yet: [[front, ...others]], the front being the
// entry that already holds the others when there is one (so a season you put on the front stays there)
export function seasonGroups(ids: string[]): string[][] {
    const done = new Set<string>(),
        out: string[][] = [];
    for (const id of ids) {
        const b = items.get(id);
        if (!b || done.has(id) || !isSeasonish(b)) continue;
        const C = seasonChain(isPart(b) ? b.partOf : id).filter(x => !!x.private === !!b.private);
        for (const x of C) done.add(x.id);
        if (C.length < 2) continue;
        const head = (
            C.find(x => {
                const y = items.get(x.id);
                return partsOf(y).length && y && !isPart(y);
            }) || C[0]
        ).id;
        if (C.every(x => x.id === head || items.get(x.id)?.partOf === head)) continue;
        out.push([head, ...C.map(x => x.id).filter(x => x !== head)]);
    }
    return out;
}
export function combineGroups(groups: string[][], label: string) {
    const ids = [...new Set(groups.flat())];
    change(label, ids, (x, id) => {
        const g = groups.find(G => G.includes(id));
        if (!x || !g) return undefined;
        return id === g[0] ? { ...x, parts: g.slice(1), partOf: undefined } : { ...x, partOf: g[0], parts: undefined };
    });
}
// new anime join their other seasons by themselves, unless sequels are set to "each on its own"
let seasonQ = new Set<string>(),
    seasonT: ReturnType<typeof setTimeout> | undefined;
export function queueSeasonCombine(id: string) {
    if (meta.settings.seasonsMode === "separate" || meta.settings.autoCombine === false) return;
    seasonQ.add(id);
    clearTimeout(seasonT);
    seasonT = setTimeout(runSeasonCombine, 600);
}
function runSeasonCombine() {
    const ids = [...seasonQ].filter(id => items.has(id));
    seasonQ = new Set();
    // on its own, it only goes by what's certain: AniList's sequel links, or a title that says it's a season or part
    const sure = (g: string[]) => {
        const chain = new Set(animeChain(g[0]).map(x => x.id));
        return [
            g[0],
            ...g
                .slice(1)
                .filter(
                    id =>
                        chain.has(id) ||
                        /\b(season|part|cour|final|\d+(?:st|nd|rd|th))\b|\s(?:ii|iii|iv|v|vi)\s*$/i.test(
                            items.get(id)?.title || ""
                        )
                ),
        ];
    };
    const groups = seasonGroups(ids)
        .map(sure)
        .filter(g => g.length > 1);
    if (!groups.length) return;
    combineGroups(
        groups,
        `Put ${plural(groups.length, "show")} with ${groups.length > 1 ? "their" : "its"} other seasons`
    );
    toast(
        groups.length > 1
            ? `Put ${groups.length} shows with their other seasons`
            : `${titleById(groups[0][0])} now holds ${plural(groups[0].length - 1, "season")}`,
        { label: "Undo", fn: undo }
    );
    if (ui.page === "profile") renderMain();
}
// put another season on the front: it becomes the entry that holds the rest, and the show's ranking and favourite come with it
const FRONT_CARRY = ["elo", "h2h", "welo", "wh2h", "fav", "favWhy", "favArt"];
export function seasonFront(headId: string, newId: string) {
    const h = items.get(headId);
    if (!h || headId === newId || !partsOf(h).includes(newId)) return;
    const rest = [headId, ...partsOf(h)]
        .filter(x => x !== newId)
        .map(entryOf)
        .filter(present)
        .sort(partOrder)
        .map(x => x.id);
    const carry = Object.fromEntries(FRONT_CARRY.filter(k => h[k] != null).map(k => [k, h[k]]));
    change(`Put ${titleById(newId)} on the front`, [headId, ...partsOf(h)], (x, id) =>
        !x
            ? undefined
            : id === newId
              ? { ...x, ...carry, parts: rest, partOf: undefined }
              : {
                    ...x,
                    partOf: newId,
                    parts: undefined,
                    ...(id === headId ? Object.fromEntries(FRONT_CARRY.map(k => [k, undefined])) : {}),
                }
    );
    if (meta.favOrder) meta.favOrder = meta.favOrder.map(x => (x === headId ? newId : x));
    toast(`${titleById(newId)} is on the front now`, { label: "Undo", fn: undo });
}
/** the Seasons panel on the Rank page (library/rank/SeasonsPanel.svelte): together or apart, which season is on the
 *  front, combine or split any of them; nothing in a mode without anime or TV */
export function seasonsView() {
    const S = meta.settings,
        apart = S.seasonsMode === "separate",
        L = modeItems();
    if (!L.some(b => ["anime", "tv"].includes(b.medium))) return null;
    const heads = L.filter(b => partsOf(b).length && ["anime", "tv"].includes(b.medium)).sort((a, b) =>
        titleOf(a).localeCompare(titleOf(b))
    );
    const loose = seasonGroups(L.map(b => b.id)),
        q = norm(ui.seasonQ || "");
    const show = heads.filter(
        b =>
            !q ||
            [
                b,
                ...partsOf(b)
                    .map(id => items.get(id))
                    .filter(present),
            ].some(x => norm(titleOf(x)).includes(q))
    );
    return {
        apart,
        tv: !!(S.seasons || {}).tv,
        auto: S.autoCombine !== false && !apart,
        summary: `${plural(heads.length, "show")} combined${loose.length ? ` · ${loose.length} more could be` : ""}`,
        loose: loose.length,
        looseRows: loose.slice(0, 30).map(g => ({
            key: g.join(","),
            name: commonName(g.map(id => items.get(id)).filter(present)),
            n: plural(g.length, "entry", "entries"),
        })),
        heads: heads.length,
        shows: show.slice(0, 200).map(b => {
            const P = [b.id, ...partsOf(b)].map(entryOf).filter(present).sort(partOrder),
                avg = partsScore(b);
            return {
                b,
                title: titleOf(b),
                hint: `${P.length} seasons${avg ? " · avg " + fmtScore(avg) : ""}`,
                parts: P.map(x => ({ id: x.id, title: titleOf(x) })),
            };
        }),
    };
}
export function seasonsClick(act: string, _t: ActEl, k: string | undefined): boolean {
    if (act === "seasons-mode") {
        meta.settings.seasonsMode = k;
        meta.watchSplit = [];
        markDirty();
        seasonsAcrossLibrary(k === "together");
        renderMain();
        return true;
    }
    if (act === "seasons-combine") {
        const groups = k ? [k.split(",")] : seasonGroups(modeItems().map(b => b.id));
        if (!groups.length) return true;
        combineGroups(groups, `Combine ${plural(groups.length, "show")}`);
        toast(`Combined ${plural(groups.length, "show")}`, { label: "Undo", fn: undo });
        renderMain();
        return true;
    }
    if (act === "seasons-split") {
        splitPart(k || "", null);
        renderMain();
        return true;
    }
    return false;
}
