// src/features/insights/mode-pages.ts
// ─────────────────────────────────────────────────────────────────
//  What each mode is for: the season's anime, series and quotes, a watch diary, now playing, Insights
//
//  The pages are Svelte (insights/pages/, listed in core/pages.ts); what they show is worked out here, and the
//  overview's small versions of them (insights/pages/…Mini.svelte) draw
//  from the same functions. Year in review (Stats) is here too.
// ─────────────────────────────────────────────────────────────────

import {
    cleanTitle,
    curMode,
    dayKey,
    fmtDate,
    fmtHours,
    fmtScore,
    isCandidate,
    isRecord,
    items,
    listOf,
    MEDIA,
    minutesSpent,
    monthKey,
    norm,
    scaleOf,
    shelvesOf,
    STATUS_WORDS,
    titleOf,
    toList,
    ui,
} from "../core/core";
import { alSeason, seasonNow } from "../sources/sources";
import { allSessions, endedAt, favPos, groupWord, modeItems } from "../core/views";
import { kindShown } from "../core/types";
import { renderMain } from "../core/shell";
import { gameCase } from "../library/tiles/tiles";
import { activeOf, nextUp } from "../library/blocks";
import { mainTyping } from "../core/navigation";
import type { Candidate, Entry } from "../core/model";

// ── Culture: this season's anime (AniList), kept for six hours so it isn't fetched again and again ──
export const seasonState: { key: string; list: Candidate[] | null; busy: boolean; err: string } = {
    key: "",
    list: null,
    busy: false,
    err: "",
};
export const SEASON_NAME: Record<string, string> = {
    WINTER: "Winter",
    SPRING: "Spring",
    SUMMER: "Summer",
    FALL: "Autumn",
};
export function seasonKey() {
    const s = ui.season || seasonNow();
    return s.season + "-" + s.year;
}
export async function loadSeason(force?: boolean) {
    const s = ui.season || seasonNow(),
        key = s.season + "-" + s.year;
    if (!force && seasonState.key === key && seasonState.list) return;
    try {
        // kept by this tab a moment ago: still checked, as storage can hold anything
        const c: unknown = JSON.parse(sessionStorage.getItem("ul-season-" + key) || "null");
        if (!force && isRecord(c) && typeof c.at === "number" && Date.now() - c.at < 6 * 3600e3) {
            Object.assign(seasonState, { key, list: listOf(c.list).filter(isCandidate), err: "" });
            return;
        }
    } catch (_) {}
    if (!navigator.onLine) {
        seasonState.err = "You're offline.";
        return;
    }
    Object.assign(seasonState, { key, busy: true, err: "" });
    renderMainSoft();
    try {
        const list = await alSeason(s.season, s.year);
        Object.assign(seasonState, { list, busy: false });
        try {
            sessionStorage.setItem("ul-season-" + key, JSON.stringify({ at: Date.now(), list }));
        } catch (_) {}
    } catch (e) {
        Object.assign(seasonState, {
            busy: false,
            err: isRecord(e) && e.offline ? "Couldn't reach AniList." : "AniList didn't answer. Try again in a minute.",
        });
    }
    renderMainSoft();
}
function renderMainSoft() {
    if (ui.page === "profile" && !mainTyping()) renderMain();
}
/** the season's anime, filtered as chosen (everything, only what's new to you, only what you have), as TV, films and
 *  the rest */
export function seasonGroups(list: Candidate[], only: string, byAl: Map<number, string>) {
    const L = list.filter(r =>
        only === "mine" ? byAl.has(r.ext?.anilist || 0) : only === "new" ? !byAl.has(r.ext?.anilist || 0) : true
    );
    return (
        [
            ["TV", L.filter(r => r.kind === "TV")],
            ["Films", L.filter(r => r.kind === "Movie")],
            ["Shorts, OVAs and ONAs", L.filter(r => !["TV", "Movie"].includes(r.kind || ""))],
        ] satisfies [string, Candidate[]][]
    ).filter(g => g[1].length);
}
// your entries by AniList id
export function alIndex() {
    const byAl = new Map<number, string>();
    for (const [id, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, id);
    return byAl;
}

// ── Literature: series, kept as separate books but shown together ──
const SERIES_RE = /\(([^()#]+?),?\s*#\s*(\d+(?:\.\d+)?)\)\s*$/;
function seriesOf(b: Entry): [name: string, n: number | string | null] | null {
    if (b.series) return [b.series, b.seriesNo || null];
    const m = SERIES_RE.exec(b.title || "");
    return m ? [m[1].trim(), parseFloat(m[2])] : null;
}
/** books shown together as a series, in order: how many you've finished, and the next one */
export interface SeriesGroup {
    name: string;
    items: { b: Entry; n: number | string | null }[];
    done?: number;
    next?: { b: Entry; n: number | string | null };
}
export function seriesGroups(M: Entry[]) {
    const G = new Map<string, SeriesGroup>();
    for (const b of M) {
        const s = seriesOf(b);
        if (!s) continue;
        const k = norm(s[0]);
        let g = G.get(k);
        if (!g) {
            g = { name: s[0], items: [] };
            G.set(k, g);
        }
        g.items.push({ b, n: s[1] });
    }
    // sequels and prequels you linked count too, for things without a series name
    const parent = new Map<string, string>(),
        find = (x: string) => {
            let up = parent.get(x);
            while (up !== undefined && up !== x) {
                x = up;
                up = parent.get(x);
            }
            return x;
        };
    const loose = M.filter(b => !seriesOf(b) && ["book", "novel", "comic"].includes(b.medium));
    for (const b of loose) parent.set(b.id, b.id);
    for (const b of loose)
        for (const l of b.links || [])
            if (["sequel", "prequel"].includes(l.type) && parent.has(l.id)) parent.set(find(b.id), find(l.id));
    const LG = new Map<string, Entry[]>();
    for (const b of loose) {
        const r = find(b.id),
            g = LG.get(r);
        if (g) g.push(b);
        else LG.set(r, [b]);
    }
    for (const [, arr] of LG)
        if (arr.length > 1) {
            arr.sort((a, b) => (a.year || 9999) - (b.year || 9999));
            G.set("l:" + arr[0].id, { name: cleanTitle(titleOf(arr[0])), items: arr.map((b, i) => ({ b, n: i + 1 })) });
        }
    return [...G.values()]
        .filter(g => g.items.length > 1 || g.items.some(x => x.b.series))
        .map(g => {
            g.items.sort((x, y) => Number(x.n ?? 999) - Number(y.n ?? 999) || (x.b.year || 0) - (y.b.year || 0));
            g.done = g.items.filter(x => x.b.status === "done").length;
            g.next = g.items.find(x => x.b.status !== "done");
            return g;
        })
        .sort(
            (a, b) =>
                (b.done && b.next ? 1 : 0) - (a.done && a.next ? 1 : 0) ||
                b.items.length - a.items.length ||
                a.name.localeCompare(b.name)
        );
}
/** every quote you saved in this mode, newest first, matching what's searched for */
export function quotesOf(M: Entry[], q: string) {
    const nq = norm(q);
    return M.flatMap(b => (b.quotes || []).map(x => ({ x, b })))
        .filter(({ x, b }) => !nq || norm(x.text + " " + titleOf(b)).includes(nq))
        .sort((a, b) => String(b.x.date).localeCompare(String(a.x.date)));
}

// ── Film & TV: a diary of every watch, like a ticket stub drawer ──
/** one watch in the diary: a film seen, or a show finished */
export interface DiaryEvent {
    date: string;
    b: Entry;
    re: boolean;
    show?: boolean;
}
export function diaryEvents(M: Entry[]) {
    const ev: DiaryEvent[] = [];
    for (const b of M) {
        if (MEDIA[b.medium].group !== "watch") continue;
        if (b.medium === "film") {
            const L = (b.log || []).filter(s => s.from === 0);
            L.forEach((s, i) => {
                ev.push({ date: s.date, b, re: i > 0 });
            });
            if (!L.length && b.finishedAt) ev.push({ date: b.finishedAt, b, re: false });
        } else {
            for (const r of b.reads || []) if (r.finishedAt) ev.push({ date: r.finishedAt, b, re: false, show: true });
            if (b.status === "done" && b.finishedAt)
                ev.push({ date: b.finishedAt, b, re: (b.reads || []).length > 0, show: true });
        }
    }
    return ev.filter(e => e.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
/** the diary by month, newest first: each month's key ("2024-03") and its watches */
export function diaryMonths(E: DiaryEvent[]) {
    const byM = new Map<string, DiaryEvent[]>();
    for (const e of E) {
        const k = monthKey(e.date),
            g = byM.get(k);
        if (g) g.push(e);
        else byM.set(k, [e]);
    }
    return [...byM.entries()];
}

// ── Games: now playing, the backlog in hours, platforms ──
export const COMP: Record<string, string> = {
    story: "Main story",
    extras: "Story + extras",
    full: "100%",
    endless: "Endless",
};
/** what a game's card says: where you play it and how far you mean to go, and how far you've got */
export function gameLook(b: Entry) {
    const c = gameCase(b);
    return {
        sub: [b.platform || c[3], b.completion ? COMP[b.completion] : ""].filter(Boolean).join(" · "),
        pct: b.total ? Math.min(100, Math.round(((b.prog || 0) / b.total) * 100)) : null,
    };
}
/** the Playing page: what's in progress, the backlog in hours, the short ones and the platforms you play on */
export function playingView(M: Entry[]) {
    const back = M.filter(b => b.status === "want"),
        plat: Record<string, number> = {};
    for (const b of M) {
        const p = b.platform || (b.platforms || [])[0];
        if (p) plat[p] = (plat[p] || 0) + 1;
    }
    return {
        now: activeOf(M),
        back: back.length,
        hrs: back.reduce((a, b) => a + (b.total || 0), 0),
        quick: back
            .filter(b => b.total && b.total <= 12)
            .sort((a, b) => (a.total || 0) - (b.total || 0))
            .slice(0, 10),
        plat: Object.entries(plat)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10),
    };
}

// ── Insights (the "discover" tab): a reading of your own library, plus the bigger searches for new things ──
// ── Insights: what your own library says about you, then where to look further ──
// how often you finish what you start, by genre, theme and type: started = finished + dropped + on hold + in progress
/** how often you finish what you start, for one genre, theme or type */
export interface FinishRate {
    k: string;
    n: number;
    done: number;
    drop: number;
    sum: number;
    sc: number;
    pct: number;
    avg: number;
}
export function finishRates(L: Entry[], key: (b: Entry) => string | string[] | undefined, min = 3): FinishRate[] {
    const t = new Map<string, Omit<FinishRate, "pct" | "avg">>();
    for (const b of L) {
        if (!["done", "dnf", "paused", "active", "redo"].includes(b.status)) continue;
        for (const k of toList(key(b) || [])) {
            if (!k) continue;
            const r = t.get(k) || { k, n: 0, done: 0, drop: 0, sum: 0, sc: 0 };
            r.n++;
            if (b.status === "done" || b.status === "redo") r.done++;
            if (b.status === "dnf") r.drop++;
            if (b.rating) {
                r.sum += b.rating;
                r.sc++;
            }
            t.set(k, r);
        }
    }
    return [...t.values()]
        .filter(r => r.n >= min)
        .map(r => ({ ...r, pct: Math.round((r.done / r.n) * 100), avg: r.sc ? r.sum / r.sc : 0 }));
}
/** the Insights page: how often you finish what you start (by genre, theme and type), where you drop off, how long
 *  things take you, what's waited longest, what to read next from your own backlog, and where to look further */
export function insightsView() {
    const L = modeItems(),
        mode = curMode();
    const started = L.filter(b => ["done", "dnf", "paused", "active", "redo"].includes(b.status)),
        done = started.filter(b => ["done", "redo"].includes(b.status));
    const mean = started.length ? Math.round((done.length / started.length) * 100) : 0;
    // how long things take you, start to finish
    const days = (b: Entry) =>
        b.startedAt && b.finishedAt ? Math.max(0, (Date.parse(b.finishedAt) - Date.parse(b.startedAt)) / 864e5) : null;
    const tk = new Map<string, number[]>();
    for (const b of done) {
        const d = days(b);
        if (d == null) continue;
        const k = kindShown(b),
            a = tk.get(k);
        if (a) a.push(d);
        else tk.set(k, [d]);
    }
    const med = (a: number[]) => {
        const s = a.slice().sort((x, y) => x - y);
        return s[Math.floor(s.length / 2)];
    };
    const has = (p: string) => (mode.match || []).some(x => x === "*" || x.replace("!", "").startsWith(p));
    const engines = (
        [
            [
                "versions",
                "Other versions",
                "Sequels, adaptations and spin-offs of what you loved (AniList, Wikidata)",
                true,
            ],
            [
                "fans",
                "Fans also liked",
                "What AniList users recommend after your favourite anime and manga",
                has("anime") || has("manga"),
            ],
            [
                "screen",
                "Film & TV",
                "TMDB recommendations from your best films and shows (free key)",
                has("film") || has("tv"),
            ],
            ["games", "Games", "Games tagged with what you score highest (free RAWG key)", has("game")],
            [
                "books",
                "Books from forums",
                "Books Reddit, Hacker News and Stack Exchange recommend alongside yours",
                has("book"),
            ],
        ] satisfies [string, string, string, boolean][]
    ).filter(e => e[3]);
    const genres = finishRates(L, b => b.genres);
    return {
        started: started.length,
        engines,
        mean,
        done: done.length,
        dropped: started.filter(b => b.status === "dnf").length,
        waiting: L.filter(b => b.status === "want").length,
        byG: genres
            .slice()
            .sort((a, b) => b.n - a.n)
            .slice(0, 14)
            .sort((a, b) => b.pct - a.pct),
        byT: finishRates(L, b => b.themes, 4)
            .sort((a, b) => b.n - a.n)
            .slice(0, 14)
            .sort((a, b) => b.pct - a.pct),
        byK: finishRates(L, b => kindShown(b), 2).sort((a, b) => b.pct - a.pct),
        drops: genres
            .filter(r => r.drop)
            .sort((a, b) => b.drop / b.n - a.drop / a.n)
            .slice(0, 5),
        take: [...tk.entries()]
            .filter(([, a]) => a.length >= 2)
            .map(([k, a]): [string, number] => [k, Math.round(med(a))])
            .sort((a, b) => b[1] - a[1]),
        // the oldest of what you said you'd get to
        old: L.filter(b => b.status === "want" && b.addedAt)
            .sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)))
            .slice(0, 6),
        next: nextUp(L, 8),
    };
}

// ── Stats: Year in review ──
/** Year in review: a year's finishes (and drops), time spent, your top five, month by month, genres and shelves,
 *  the first of the year and the favourites (stats/Wrapped.svelte draws it) */
export function wrappedLook() {
    const A = modeItems(),
        yrs = [
            ...new Set(
                A.map(b => {
                    const at = endedAt(b);
                    return at ? new Date(at).getFullYear() : 0;
                }).filter(Boolean)
            ),
        ].sort((a, b) => b - a),
        yr = ui.wrapYear || yrs[0] || new Date().getFullYear();
    const Y = A.filter(b => b.status === "done" && b.finishedAt && new Date(b.finishedAt).getFullYear() === yr),
        D = A.filter(b => b.status === "dnf" && b.droppedAt && new Date(b.droppedAt).getFullYear() === yr);
    const mins = Y.reduce((a, b) => a + minutesSpent(b), 0),
        top = Y.filter(b => b.rating)
            .sort((a, b) => (b.rating || 0) - (a.rating || 0) || favPos(a.id) - favPos(b.id))
            .slice(0, 5);
    const g: Record<string, number> = {};
    for (const b of Y) for (const x of b.genres || []) g[x] = (g[x] || 0) + 1;
    const months = Array.from(
            { length: 12 },
            (_, i) => Y.filter(b => new Date(b.finishedAt || "").getMonth() === i).length
        ),
        mx = Math.max(1, ...months),
        best = months.indexOf(Math.max(...months));
    const ss = allSessions().filter(s => new Date(s.date).getFullYear() === yr),
        days = new Set(ss.map(s => dayKey(s.date)).concat(Y.map(b => dayKey(b.finishedAt)))).size;
    const first = Y.slice().sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)))[0],
        sh = shelvesOf();
    return {
        yr,
        yrs: (yrs.length ? yrs : [yr]).slice(0, 8),
        n: Y.length,
        head: `${curMode().name} · ${yr}`,
        title: `${Y.length} ${STATUS_WORDS[groupWord()].done.toLowerCase()}`,
        line: `${fmtHours(mins)} across ${days} day${days === 1 ? "" : "s"}${D.length ? `, and ${D.length} dropped` : ""}.${months[best] ? ` Your biggest month was ${new Date(yr, best, 1).toLocaleDateString("en-GB", { month: "long" })}.` : ""}`,
        top: top.map(b => ({ b, title: cleanTitle(titleOf(b)), score: fmtScore(b.rating, scaleOf(b)) })),
        months: months.map((n, i) => ({ n, h: Math.round((n / mx) * 100), l: "JFMAMJJASOND"[i] })),
        genres: Object.entries(g)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([l, v]) => ({ l, v })),
        shelves:
            sh.length > 1 ? sh.map(s => ({ l: s.name, v: Y.filter(b => s.test(b)).length })).filter(r => r.v) : null,
        first: first ? { id: first.id, title: cleanTitle(titleOf(first)), date: fmtDate(first.finishedAt) } : null,
        favs: Y.filter(b => b.fav)
            .slice(0, 5)
            .map(b => ({ id: b.id, title: cleanTitle(titleOf(b)) })),
    };
}
