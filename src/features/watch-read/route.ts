// src/features/watch-read/route.ts
// ─────────────────────────────────────────────────────────────────
//  The player as a place: #watch/<show>/<season>/<episode> in the address
//
//  Opening the player adds one step to the browser's history (the next episode only changes the address), so the
//  browser's Back, the player's ← and Escape all go straight back to where you came from, and a refresh opens the same
//  show, season and episode again. The app keeps no other address of its own (a refresh puts the rest back from this
//  tab's own memory, core/tabs.ts), so this is a hash, like the one a link to sign in another device uses.
//
//  <show> is your entry ("i.<id>"), or what a catalogue calls it ("al.<AniList id>", "tm.<TVmaze id>",
//  "tmdb.<TMDB id>"); what a search found is kept in this tab's session storage so it opens again as it was.
// ─────────────────────────────────────────────────────────────────

import { entryOf, fieldsOf, isRecord, items, numOf, safeJSON, textOf, ui } from "../core/core";
import type { WatchShow } from "../core/model";
import { alDetails, tvmazeShow } from "../sources/sources";
import { render } from "../core/navigation";
import { stageOn } from "../extensions/builtins";
import { W, watchBack, watchOpen } from "./watch";

const PREFIX = "#watch/";
/** where the player is: the show, and (not for a film) its season, counted from 1, and episode */
export interface Place {
    key: string;
    season: number;
    e: number | null;
}
/** what a show is called in the address, or "" when it has no name that would find it again */
export function showKey(sh: WatchShow): string {
    if (sh.id && items.has(sh.id)) return "i." + sh.id;
    const x = fieldsOf(sh.ext),
        al = numOf(x.anilist),
        tm = numOf(x.tvmaze),
        tmdb = numOf(x.tmdb);
    return al ? "al." + al : tm ? "tm." + tm : tmdb ? "tmdb." + tmdb : "";
}
export const placeHash = (p: Place): string =>
    PREFIX + encodeURIComponent(p.key) + (p.e == null ? "" : `/${p.season}/${p.e}`);
/** the place an address names, or null */
export function placeOf(hash: string): Place | null {
    if (!hash.startsWith(PREFIX)) return null;
    const [k, s, e] = hash.slice(PREFIX.length).split("/");
    let key = "";
    try {
        key = decodeURIComponent(k || "");
    } catch (_) {
        return null;
    }
    if (!/^(i|al|tm|tmdb)\.[\w-]{1,64}$/.test(key)) return null;
    if (s === undefined && e === undefined) return { key, season: 1, e: null };
    const season = Number(s),
        ep = Number(e);
    return Number.isInteger(season) && Number.isInteger(ep) && season >= 1 && ep >= 0 && /^\d+$/.test(s + (e ?? ""))
        ? { key, season, e: ep }
        : null;
}
/** the player's place now, or null (nothing playing, or a file opened on its own) */
function placeNow(): Place | null {
    const p = W.player,
        sh = W.show;
    if (!p || p.single || !sh) return null;
    const key = showKey(sh);
    return key ? { key, season: (p.si ?? 0) + 1, e: p.film ? null : (p.e ?? null) } : null;
}
// whether this tab added the step the player is on (so Back can take it away again)
let added = false;
function go(hash: string, push: boolean) {
    try {
        if (push) history.pushState(null, "", hash);
        else history.replaceState(null, "", hash || location.pathname + location.search);
    } catch (_) {
        // a page opened from a file can't always rewrite its history: the plain way, which hashchange then reports
        if (push) location.hash = hash;
        else location.replace(hash || "#");
    }
}
// what a search found, kept for this tab, so the same show opens after a refresh
const SHOWS = "ul-watch-show";
function keep(key: string, sh: WatchShow) {
    if (key.startsWith("i.")) return;
    try {
        sessionStorage.setItem(
            SHOWS,
            JSON.stringify({
                key,
                q: W.q,
                show: {
                    title: sh.title,
                    medium: sh.medium,
                    year: sh.year,
                    kind: sh.kind,
                    cover: sh.cover,
                    banner: sh.banner,
                    about: sh.about,
                    total: sh.total,
                    runtime: sh.runtime,
                    creator: sh.creator,
                    alt: sh.alt,
                    ext: sh.ext,
                },
            })
        );
    } catch (_) {}
}
/** the address follows what's playing: a step of its own when the player opens, the same step for the next episode */
export function routePlayer() {
    const at = placeNow();
    if (!at) return;
    const h = placeHash(at);
    if (W.show) keep(at.key, W.show);
    if (location.hash === h) return;
    const on = !!placeOf(location.hash);
    if (!on) added = true;
    go(h, !on);
}
/** the player closed by its own ← or Escape: the step it added goes too */
export function routeLeave() {
    if (!placeOf(location.hash)) return;
    if (added) {
        added = false;
        history.back();
    } else go("", false);
}
/** a show's place, as the address names it: your entry, the one kept from a search, or the catalogue's */
async function showAt(key: string): Promise<WatchShow | null> {
    const [k, id] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
    if (k === "i") {
        const b = entryOf(id);
        return b ? { ...b, id } : null;
    }
    try {
        const saved = fieldsOf(safeJSON(sessionStorage.getItem(SHOWS) || "null"));
        const sh = fieldsOf(saved.show);
        if (saved.key === key && textOf(sh.title)) {
            if (typeof saved.q === "string" && !W.q) W.q = saved.q;
            return { ...sh, title: textOf(sh.title), medium: textOf(sh.medium), ext: fieldsOf(sh.ext) };
        }
    } catch (_) {}
    try {
        if (k === "al") {
            const c = (await alDetails([Number(id)])).get(Number(id));
            return c ? { ...c, src: "anilist" } : null;
        }
        if (k === "tm") return { ...(await tvmazeShow(id)) };
    } catch (_) {}
    return null;
}
async function openAt(at: Place) {
    if (!stageOn()) return;
    const sh = await showAt(at.key);
    if (!sh) return;
    if (isRecord(sh.ext) && !sh.ext.anilist && at.key.startsWith("al.")) sh.ext.anilist = Number(at.key.slice(3));
    if (ui.page !== "watch") {
        ui.page = "watch";
        render();
    }
    watchOpen(sh, { play: true, at: { si: at.season - 1, e: at.e } });
}
/** the address changed by itself (Back, Forward, or one typed): the player follows it */
function moved() {
    const at = placeOf(location.hash),
        now = placeNow();
    if (!at) {
        added = false;
        if (W.player && ui.page === "watch") watchBack();
        return;
    }
    if (now && placeHash(now) === placeHash(at)) return;
    openAt(at);
}
/** after a refresh: the place in the address opens again. True when there was one */
export function routeRestore(): boolean {
    const at = placeOf(location.hash);
    if (!at) return false;
    openAt(at);
    return true;
}
export function initRoute() {
    addEventListener("hashchange", moved);
    addEventListener("popstate", moved);
    // the app puts the page back where it was itself (Back from the player: watchBack): the browser's own restoring
    // would land wherever the page happened to be when the player's step was added
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
}
