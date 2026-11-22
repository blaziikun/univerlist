// src/features/watch-read/series.ts
// ─────────────────────────────────────────────────────────────────
//  Servers for one series: the links and addresses that belong to just this show
//
//  Added from the player or the show page, as many as you like. They belong to the series, so every episode uses them,
//  and the anime and TV listings of the same show share them. Addresses (a link, or a pattern with {season} and
//  {episode}) are kept in your settings; links of the kinds an extension plays (it declares them in seriesServers) are
//  kept by that extension, so they are sealed with it in backups.
// ─────────────────────────────────────────────────────────────────

import {
    cleanTitle,
    fieldsOf,
    findSibling,
    idTitle,
    isRecord,
    items,
    listOf,
    markDirty,
    meta,
    nowISO,
    textOf,
    toast,
    toList,
    ui,
} from "../core/core";
import type { ActEl } from "../core/core";
import { renderMain } from "../core/shell";
import { openModal, renderOverlay } from "../core/modals";
import { isOwnSource, NOT_OWN_SOURCE } from "./own-sources";
import { fillPattern, renderPlayer, seasonItem, srcKey, W } from "./watch";
import { EXT, extAddSources, extGet, extSave } from "../extensions/extensions";
import type { ExtRecord } from "../extensions/extensions";
import type { Item, WatchSource } from "../core/model";

export const ssName = () => {
    const sh = W.show;
    return (sh && sh.groupId && meta.watchGroups?.[sh.groupId]?.name) || (sh && sh.title) || "";
};
/** the key this series' servers are kept under: its name (a film's with its year), the same for its anime and TV listings */
export const ssKey = () => {
    const sh = W.show;
    return (
        (sh?.medium === "film" ? "f:" : "s:") +
        idTitle(cleanTitle(ssName())) +
        (sh?.medium === "film" && sh.year ? ":" + sh.year : "")
    );
};
// what an extension says it keeps, as its manifest lists it
const ssKinds = (x: ExtRecord) => toList<unknown>(x.manifest.seriesServers || []);
export const ssOwners = () => EXT.list.filter(x => x.on && ssKinds(x).length);
// an extension says which links it keeps: by how they start ("smb:") or, with a *, how they end ("*.strm")
const ssIsHeld = (v: string, x: ExtRecord) => {
    const lv = v.toLowerCase(),
        bare = lv.split(/[?#]/)[0];
    return ssKinds(x).some(kind => {
        const sc = String(kind).toLowerCase();
        return sc.startsWith("*") ? bare.endsWith(sc.slice(1)) : lv.startsWith(sc);
    });
};
const ssOwnerFor = (v: string) => ssOwners().find(x => ssIsHeld(v, x));
/** the servers an extension keeps for this series (or the one keyed by key) */
export const ssHeldBy = (x: ExtRecord, key = ssKey()) => ((x.data || {}).series || {})[key] || [];
/** an address kept for a series in your settings */
interface SeriesLink {
    value: string;
    name?: unknown;
    on?: unknown;
    [field: string]: unknown;
}
const isSeriesLink = (s: unknown): s is SeriesLink => isRecord(s) && typeof s.value === "string";
const ssLinks = (key = ssKey()): SeriesLink[] =>
    listOf(fieldsOf(meta.settings.seriesServers)[key]).filter(isSeriesLink);
// a short name for a server: its host, or (for a link an extension keeps) the start of it
const ssShort = (v: string) => {
    if (!/^https?:/i.test(v)) return v.length > 40 ? v.slice(0, 39) + "…" : v;
    try {
        return new URL(v.replace(/\{[^}]*\}/g, "x")).host;
    } catch (_) {
        return v.slice(0, 50);
    }
};
/** one of this series' servers: kept by an extension ("held"), or an address in your settings ("link") */
interface SeriesServer {
    kind: "held" | "link";
    name: string;
    value: string;
    owner?: string;
}
// every server this series has
export function ssList(): SeriesServer[] {
    const out: SeriesServer[] = [];
    for (const x of ssOwners())
        for (const s of ssHeldBy(x))
            out.push({
                kind: "held",
                name: textOf(s.name) || ssShort(s.value),
                value: s.value,
                owner: x.manifest.id,
            });
    for (const s of ssLinks()) out.push({ kind: "link", name: textOf(s.name) || ssShort(s.value), value: s.value });
    return out;
}
// the library entries this show is saved on: its own and the same show filed as anime or TV
const SIB = new Map<string, string | null>(); // the sibling lookup scans the whole library, and the episode list asks for it once per row: remember it
function ssSibling(t: string, m: string, y: number | null | undefined) {
    const k = m + "|" + t + "|" + y + "|" + items.size;
    if (!SIB.has(k)) {
        if (SIB.size > 200) SIB.clear();
        let id: string | null = null;
        try {
            id = findSibling(t, m, y);
        } catch (_) {}
        SIB.set(k, id);
    }
    return SIB.get(k) ?? null;
}
function ssRelated(si: number): Item[] {
    const b = seasonItem(si),
        sh = W.show,
        out: Item[] = b ? [b] : [],
        t = b ? b.title : sh?.title,
        m = (b ? b.medium : sh?.medium) || "",
        y = b ? b.year : sh?.year;
    const sib = t ? ssSibling(t, m, y) : null,
        other = sib ? items.get(sib) : undefined;
    if (other && !out.includes(other)) out.push(other);
    return out;
}
/** a link saved for one episode, wherever the same show was filed (anime and TV use different keys) */
export function savedLink(si: number, e: number): { url: string } | null {
    let rel: Item[];
    try {
        rel = ssRelated(si);
    } catch (_) {
        const b = seasonItem(si);
        rel = b ? [b] : [];
    } // never let this break the episode list
    const n = (W.seasons[si] || { n: 1 }).n;
    for (const [i, b] of rel.entries()) {
        const S = fieldsOf(b.sources),
            keys = i ? [...new Set(["S" + n + "E" + e, "E" + e, srcKey(si, e)])] : [srcKey(si, e)];
        for (const k of keys) {
            const s = S[k];
            if (isRecord(s) && typeof s.url === "string" && s.url) return { url: s.url };
        }
    }
    return null;
}
/** the sources this series' own servers give for one episode (addresses only; the other kinds go to the extension that plays them) */
export const ssSources = (si: number, e: number): WatchSource[] =>
    ssLinks()
        .filter(s => s.on !== false)
        .map(s => ({ name: textOf(s.name) || "This series' server", url: fillPattern(s.value, si, e) }));
/** adds this series' servers: links an extension keeps go to it, addresses to your settings; false when nothing
 *  could be added (and a note says why). SeriesServers.svelte's Add */
export async function ssAdd(raw: string, typedName: string): Promise<boolean> {
    const name = typedName.trim(),
        key = ssKey(),
        held: string[] = [],
        links: string[] = [],
        bad: string[] = [];
    for (const ln of raw
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean))
        if (ssOwnerFor(ln)) held.push(ln);
        else if (/^https?:\/\//i.test(ln) && isOwnSource(ln)) links.push(ln);
        else bad.push(ln);
    if (!held.length && !links.length) {
        toast(
            raw.trim() && /^https?:/im.test(raw) ? NOT_OWN_SOURCE : "Paste a link, or an address that starts with http"
        );
        return false;
    }
    if (held.length) {
        const o = ssOwnerFor(held[0]);
        if (!o) {
            toast("Switch on the extension that plays these links");
            return false;
        }
        const have = new Set(ssHeldBy(o).map(s => s.value)),
            add = held
                .filter(v => !have.has(v))
                .map(v => ({ value: v, name: held.length === 1 ? name : "", at: nowISO() }));
        o.data = {
            ...(o.data || {}),
            series: { ...((o.data || {}).series || {}), [key]: [...ssHeldBy(o), ...add] },
        };
        await extSave(o);
    }
    if (links.length) {
        const have = new Set(ssLinks().map(s => s.value)),
            add = links
                .filter(v => !have.has(v))
                .map(v => ({ value: v, name: links.length === 1 ? name : "", on: true }));
        meta.settings.seriesServers = { ...fieldsOf(meta.settings.seriesServers), [key]: [...ssLinks(), ...add] };
        markDirty();
    }
    toast(
        `Added ${held.length + links.length} server${held.length + links.length === 1 ? "" : "s"}${bad.length ? `; ${bad.length} line${bad.length === 1 ? "" : "s"} skipped` : ""}`
    );
    ssRefreshPlayer();
    renderOverlay(true);
    if (ui.page === "watch" && W.view === "show") renderMain();
    return true;
}
export async function ssClick(act: string, _t: ActEl, k: string | undefined): Promise<boolean> {
    if (act === "ss-open") {
        if (W.show) openModal("seriesservers", {});
        return true;
    }
    if (act === "ss-del") {
        const s = ssList()[Number(k)],
            key = ssKey();
        if (!s) return true;
        if (s.kind === "held") {
            const o = extGet(s.owner || "");
            if (o) {
                o.data = {
                    ...(o.data || {}),
                    series: { ...((o.data || {}).series || {}), [key]: ssHeldBy(o).filter(x => x.value !== s.value) },
                };
                await extSave(o);
            }
        } else {
            meta.settings.seriesServers = {
                ...fieldsOf(meta.settings.seriesServers),
                [key]: ssLinks().filter(x => x.value !== s.value),
            };
            markDirty();
        }
        const p = W.player;
        if (p && s.kind === "link") {
            const u = fillPattern(s.value, p.si ?? 0, p.e ?? 0),
                n = p.srcs.length;
            p.srcs = p.srcs.filter(x => x.url !== u);
            if (p.srcs.length !== n) {
                p.k = 0;
                renderPlayer();
            }
        }
        renderOverlay(true);
        if (ui.page === "watch" && W.view === "show") renderMain();
        return true;
    }
    return false;
}
// after servers change while something is open: add the new ones to what the player is offering
function ssRefreshPlayer() {
    const p = W.player;
    if (!p) return;
    const had = p.srcs.length;
    for (const x of ssSources(p.si ?? 0, p.e ?? 0))
        if (isOwnSource(x) && !p.srcs.some(y => y.url === x.url)) p.srcs.push(x);
    if (!had && p.srcs.length) {
        p.k = 0;
        renderPlayer();
    } else if (p.srcs.length !== had) renderPlayer();
    extAddSources(p);
}
