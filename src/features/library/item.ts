// src/features/library/item.ts
// ─────────────────────────────────────────────────────────────────
//  The item card's workings: which tabs it has, the facts down its side, the words that follow the medium
//
//  The card itself is Svelte (library/card/, drawn by core/dialogs.ts). This file keeps what it works out, so the
//  components only show it. Tab names follow the medium: a book has a Journal, a film a Diary, a game a Log.
// ─────────────────────────────────────────────────────────────────

import {
    copyWords,
    DEFAULT_CRITERIA,
    firstAuthor,
    fmtDate,
    items,
    MEDIA,
    meta,
    norm,
    present,
    surname,
    unitOf,
} from "../core/core";
import { all, callOf } from "../core/views";
import type { Entry, Item } from "../core/model";

const JOURNAL_NAMES = { read: "Journal", watch: "Diary", play: "Log", listen: "Notes" };
export const journalName = (b: Item) => JOURNAL_NAMES[MEDIA[b.medium].group];
/** the card's tabs, as [key, name]: characters and cast only where the medium has them */
export function itemTabs(b: Item): [key: string, name: string][] {
    const castable = ["anime", "tv", "film", "game"].includes(b.medium),
        chars = b.medium !== "album"; // an album has songs, not characters
    const nLinks = (b.links || []).filter(l => items.has(l.id)).length,
        nJ = (b.quotes || []).length + (b.journal || []).length;
    const tabs: ([key: string, name: string] | null)[] = [
        ["synopsis", "Synopsis"],
        chars ? ["chars", "Characters"] : null,
        castable ? ["cast", ["anime", "game"].includes(b.medium) ? "Voice cast" : "Cast"] : null,
        ["connect", `Connections${nLinks ? " · " + nLinks : ""}`],
        ["art", "Art"],
        ["journal", journalName(b) + (nJ ? " · " + nJ : "")],
    ];
    return tabs.filter(present);
}
export const ownWord = (b: { medium?: string }, k: string) => {
    const [ph, dg] = copyWords(b.medium || "");
    const words: Record<string, string> = {
        none: "Don't own",
        physical: ph,
        digital: dg,
        both: ph + " + " + dg.toLowerCase(),
    };
    return words[k] || k;
};
/** what an entry is scored on in detail: yours for its medium (Settings › General), or the usual ones */
export const criteriaFor = (b: Item) =>
    (meta.settings.criteria || {})[b.medium] || DEFAULT_CRITERIA[b.medium] || ["Story", "Enjoyment"];
const AIR_WORDS: Record<string, string> = {
    RELEASING: "Releasing",
    FINISHED: "Finished",
    NOT_YET_RELEASED: "Not out yet",
    HIATUS: "On hiatus",
    CANCELLED: "Cancelled",
};
const airWord = (b: Item) => AIR_WORDS[b.airStatus || ""] || "";
const MAKER_WORDS: Record<string, string> = {
    book: "Author",
    manga: "Author",
    manhwa: "Author",
    novel: "Author",
    comic: "Writer",
    anime: "Studio",
    tv: "Created by",
    film: "Director",
    game: "Developer",
    album: "Artist",
};
/** the facts down the card's side, as [label, value], only those it has */
export function itemFacts(b: Entry): [label: string, value: string][] {
    const M = MEDIA[b.medium],
        air = airWord(b);
    const len =
        b.medium === "film"
            ? b.runtime
                ? b.runtime + " min"
                : ""
            : b.medium === "game"
              ? b.total
                  ? "~" + b.total + " h to beat"
                  : ""
              : b.total
                ? b.total + " " + unitOf(b)[1] + (b.runtime ? " · " + b.runtime + " min each" : "")
                : "";
    const facts: ([string | undefined, unknown] | null)[] = [
        [MAKER_WORDS[b.medium], b.creator],
        ["Released", b.season || b.year],
        ["Length", len],
        b.vols ? ["Volumes", b.vols] : null,
        ["Type", b.kind || M.one],
        air ? ["Status", air] : null,
        b.series ? ["Series", b.series + (b.seriesNo ? " #" + b.seriesNo : "")] : null,
        b.subject ? ["Subject", b.subject] : null,
        b.franchise ? ["Franchise", b.franchise] : null,
        callOf(b.id) ? ["Call no.", callOf(b.id)] : null,
    ];
    return facts.filter(present).flatMap(([l, v]): [string, string][] => (v ? [[l || "", String(v)]] : []));
}
// reading pace from your own sessions
export function paceText(b: Item) {
    if (!["book", "novel", "manga", "manhwa", "comic"].includes(b.medium) || !(b.log || []).length || !b.total)
        return "";
    const L = b.log.filter(s => (s.to || 0) > (s.from || 0)),
        first = L.length ? Date.parse(L[0].date) : 0,
        days = Math.max(1, (Date.now() - first) / 864e5),
        per = (b.prog || 0) / days;
    if (per <= 0 || b.status === "done") return "";
    const left = Math.max(0, b.total - (b.prog || 0)),
        eta = new Date(Date.now() + (left / per) * 864e5);
    return ` · ${per >= 1 ? Math.round(per) : per.toFixed(1)} ${unitOf(b)[1]} a day · on pace for ${fmtDate(eta.toISOString())}`;
}
// ── Characters (who's in the story) and Cast (who plays or voices them) ──
export const canFetchCast = (b: Item) =>
    !!(b.ext.anilist || ["tv", "film", "game", "book", "comic"].includes(b.medium));
// ── Connections ──
/** what in your library shares the most genres and themes with it (two at least), best first */
export function similarTo(b: Entry, n = 8) {
    const g = new Set([...(b.genres || []), ...(b.themes || [])].map(norm));
    if (!g.size) return [];
    const linked = new Set((b.links || []).map(l => l.id));
    return all()
        .filter(x => x.id !== b.id && !linked.has(x.id))
        .map(x => {
            const xs = [...(x.genres || []), ...(x.themes || [])].map(norm);
            const shared = xs.filter(v => g.has(v)).length;
            return {
                x,
                s:
                    shared / Math.sqrt(g.size * Math.max(1, xs.length)) +
                    (x.medium !== b.medium ? 0.15 : 0) +
                    ((x.rating || 0) >= 8 ? 0.1 : 0),
                shared,
            };
        })
        .filter(r => r.shared >= 2)
        .sort((a, c) => c.s - a.s)
        .slice(0, n);
}
/** up to ten more by the same creator */
export const sameCreator = (b: Entry) =>
    b.creator
        ? all()
              .filter(
                  x =>
                      x.id !== b.id &&
                      x.creator &&
                      surname(x.creator) === surname(b.creator) &&
                      norm(firstAuthor(x.creator)) === norm(firstAuthor(b.creator))
              )
              .slice(0, 10)
        : [];
