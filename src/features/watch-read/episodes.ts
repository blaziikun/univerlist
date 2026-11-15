// src/features/watch-read/episodes.ts
// ─────────────────────────────────────────────────────────────────
//  Episode names, pictures and descriptions, from the catalogues the app already asks
//
//  Never from the files: a season's episodes come from AniList (how many there are, with the names and pictures of
//  the ones it lists on streaming sites), then TVmaze (names, pictures and descriptions for most shows, lined up
//  across the whole series), then MyAnimeList through Jikan (names for nearly every anime, long-running and older
//  ones included, which the other two often lack). Each fills only what the ones before left empty.
// ─────────────────────────────────────────────────────────────────

import { cleanTitle, items, numOf } from "../core/core";
import type { Item, WatchEpisode, WatchSeason, WatchShow } from "../core/model";
import { jikanEpisodes, pickShow, tvmazeEpisodes, tvmazeSearch } from "../sources/sources";
import { groupName, W } from "./watch";

/** an episode's number in a name a streaming site gave it ("Episode 12 - …", "S2E3 - …", "Season 2 Episode 3 - …",
 *  "12. …"), or null */
export function epNumberIn(t: string): number | null {
    const m =
        /\b(?:episode|ep\.?)\s*(\d{1,4})\b/i.exec(t) ||
        /\bS\d{1,2}\s*E(\d{1,4})\b/i.exec(t) ||
        /^\s*(\d{1,4})\s*[.:\-–]/.exec(t) ||
        /(\d{1,4})/.exec(t);
    return m ? Number(m[1]) : null;
}
/** the name without the number in front ("Episode 3 - The Fatal Gunman" → "The Fatal Gunman") */
const bare = (t: string) =>
    t
        .replace(/^\s*(?:S\d{1,2}\s*)?(?:E|Ep\.?|Episode)\s*\d{1,4}\s*[-:–.]\s*/i, "")
        .replace(/^\s*Season\s+\d+\s+Episode\s+\d+\s*[-:–.]\s*/i, "")
        .trim();
/** a placeholder name ("Episode 4"), which a real one replaces */
export const unnamed = (t: string | undefined) => !t || /^Episode \d+$/i.test(t.trim());

/** a season's episodes from what AniList lists: n of them (or as many as it names), numbered by their names. A
 *  season that starts its numbering where the last one ended (episodes 13 to 24) is counted from 1 */
export function alNumbered(listed: { title: string; thumbnail: string }[], n: number): WatchEpisode[] {
    const nums = listed.map(t => epNumberIn(t.title) ?? 0).filter(x => x > 0),
        off =
            nums.length && Math.min(...nums) > 1 && Math.max(...nums) - Math.min(...nums) < (n || 999)
                ? Math.min(...nums) - 1
                : 0;
    const byNum = new Map<number, { title: string; thumbnail: string }>();
    for (const t of listed) {
        const k = (epNumberIn(t.title) ?? 0) - off;
        if (k > 0 && !byNum.has(k)) byNum.set(k, t);
    }
    return Array.from({ length: Math.min(3000, n || listed.length || 12) }, (_, i) => {
        const t = byNum.get(i + 1);
        return { e: i + 1, title: t ? bare(t.title) : "", image: t ? t.thumbnail : "" };
    });
}

// a catalogue id kept as a number or as text
const idOf = (x: unknown): number | string | undefined =>
    (typeof x === "number" || typeof x === "string") && x ? x : undefined;
/** anime: TVmaze has names, pictures and descriptions for most shows. Lined up by position across the whole series
 *  (season 2 of an anime is TVmaze's episodes 13 onwards when season 1 had 12) */
export async function tvFill(si: number) {
    const S = W.seasons[si],
        sh = W.show;
    if (!S || !S.eps || !sh) return;
    try {
        if (!W.tv || W.tv.key !== (sh.groupId || sh.id || sh.title)) {
            const key = sh.groupId || sh.id || sh.title,
                m0 = W.seasons[0] && W.seasons[0].member,
                first = m0 ? items.get(m0) : undefined,
                base: Item | WatchShow = first || sh;
            let id = idOf(base.ext?.tvmaze) || idOf(sh.ext?.tvmaze);
            if (!id) {
                const names = [
                    ...new Set(
                        [
                            sh.groupId ? groupName(sh.groupId) : "",
                            base.alt && base.alt.en,
                            cleanTitle(base.title),
                            cleanTitle(sh.title),
                            base.alt && base.alt.romaji,
                        ].filter((t): t is string => !!t)
                    ),
                ];
                for (const q of names) {
                    const all = await tvmazeSearch(q).catch(() => []),
                        R = all.filter(r => /anime|animation/i.test((r.genres || []).join(" ") + " " + (r.kind || "")));
                    const r =
                        pickShow(R, { title: q, year: base.year }) || pickShow(all, { title: q, year: base.year });
                    if (r) {
                        id = r.ext.tvmaze;
                        break;
                    }
                }
            }
            W.tv = {
                key,
                eps: id
                    ? (await tvmazeEpisodes(id))
                          .filter(e => e.e != null && e.s > 0)
                          .sort((a, b) => a.s - b.s || a.e - b.e)
                    : [],
            };
        }
        const T = W.tv.eps;
        if (!T.length) return;
        // where this season starts in TVmaze's list
        let off = 0;
        for (let i = 0; i < si; i++) {
            const P = W.seasons[i];
            off += (P.eps && P.eps.length) || P.total || (P.member && items.get(P.member)?.total) || 0;
        }
        if (W.seasons.length === 1) off = 0;
        S.eps.forEach((e, i) => {
            const t = T[off + i];
            if (!t) return;
            if (unnamed(e.title)) e.title = t.title || e.title;
            if (!e.image) e.image = t.image;
            if (!e.about) e.about = t.about;
            if (!e.date) e.date = t.date;
            if (!e.runtime) e.runtime = t.runtime;
        });
    } catch (_) {}
}
/** anime: MyAnimeList's names (through Jikan) for the episodes still without one, a page of a hundred at a time, and
 *  only the pages that have any of them. True when it named any */
export async function jikanFill(S: WatchSeason, mal: number): Promise<boolean> {
    const eps = S.eps || [],
        pages = [...new Set(eps.filter(e => unnamed(e.title)).map(e => Math.ceil(e.e / 100)))].slice(0, 12);
    let named = false;
    for (const page of pages) {
        let got: Awaited<ReturnType<typeof jikanEpisodes>>;
        try {
            got = await jikanEpisodes(mal, page);
        } catch (_) {
            break;
        }
        for (const x of got.eps) {
            const e = eps.find(y => y.e === x.e);
            if (!e || !unnamed(e.title)) continue;
            e.title = x.title;
            if (!e.date && x.date) e.date = x.date;
            named = true;
        }
        if (!got.more) break;
    }
    return named;
}
/** an episode's name, as it's known now (it can arrive after the episode started) */
export function epName(si: number, e: number | null | undefined): string {
    if (e == null) return "";
    const t = (W.seasons[si]?.eps || []).find(x => x.e === e)?.title;
    return t && !unnamed(t) ? t : "";
}
/** …and its description */
export function epAbout(si: number, e: number | null | undefined): string {
    if (e == null) return "";
    return ((W.seasons[si]?.eps || []).find(x => x.e === e)?.about || "").replace(/<[^>]+>/g, "");
}
/** the MyAnimeList id of a season, from its entry or what the catalogues said */
export const malOf = (S: WatchSeason): number => {
    const b = S.member ? items.get(S.member) : undefined;
    return numOf(b?.ext?.mal) || numOf(S.ext?.mal) || 0;
};
