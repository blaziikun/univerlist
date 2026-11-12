// src/features/sources/igdb.ts
// ─────────────────────────────────────────────────────────────────
//  IGDB: the games database Backloggd uses (covers, characters, platforms, developers, time to beat)
//
//  IGDB only answers servers, so it goes through a tiny proxy of your own (a free Cloudflare Worker, script in
//  Settings). The address of that proxy is kept like a key: in this browser and your backups, never in the app file.
// ─────────────────────────────────────────────────────────────────

import {
    at,
    cleanTitle,
    coverCache,
    fieldsOf,
    items,
    KEYS,
    norm,
    numOf,
    plural,
    quietPatch,
    recordsOf,
    scheduleSave,
    sleep,
    textOf,
    titleOf,
    toast,
    ui,
} from "../core/core";
import { getJSON, rawgDetails, rawgPick, rawgSearch, wdDetails, wdFind } from "./sources";
import { siteShares, SPN } from "./proxy";
import { updateItemTiles } from "./covers";
import { renderMain } from "../core/shell";
import { castCache, fetchCast } from "../library/item-actions";
import type { Candidate, CastMember, Item } from "../core/model";

export const IGDB_ON = () => !!(KEYS.igdb || "").trim() || siteShares.igdb;
const igdbImg = (id: unknown, size = "t_cover_big") =>
    id ? `https://images.igdb.com/igdb/image/upload/${size}/${textOf(id)}.jpg` : "";
/** a query to IGDB (its own query language, as text), through your proxy or the site's: its JSON, as sent */
export async function igdbQ(endpoint: string, body: string, signal?: AbortSignal): Promise<unknown> {
    // your own proxy if you've added one, otherwise the site's
    const base = (String(KEYS.igdb || "").trim() || (siteShares.igdb ? location.origin + "/api/igdb" : "")).replace(
        /\/+$/,
        ""
    );
    if (!base) throw new Error("no-key");
    const u = new URL(base);
    const path = u.pathname.replace(/\/+$/, "") + "/" + endpoint,
        pass = u.searchParams.get("pass");
    // the proxy password travels in a header, never in the address
    return getJSON(u.origin + path, signal, {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain", ...(pass ? { "X-Pass": pass } : {}) },
    });
}
const IGDB_GAME =
    "name,slug,first_release_date,cover.image_id,artworks.image_id,screenshots.image_id,genres.name,themes.name,platforms.name,platforms.abbreviation,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,summary,storyline,total_rating,total_rating_count,aggregated_rating,collections.name,franchises.name,game_modes.name,category,url,external_games.category,external_games.uid";
const names = (x: unknown) =>
    recordsOf(x)
        .map(n => textOf(n.name))
        .filter(Boolean);
/** an IGDB game, as an entry's fields */
function igdbFields(x: unknown): Candidate {
    const g = fieldsOf(x),
        plats = names(g.platforms),
        companies = recordsOf(g.involved_companies),
        dev = companies
            .filter(c => c.developer)
            .map(c => textOf(at(c, "company", "name")))
            .filter(Boolean);
    const art = at(g, "artworks", 0) || at(g, "screenshots", 0),
        released = numOf(g.first_release_date),
        rating = numOf(g.total_rating),
        critics = numOf(g.aggregated_rating),
        id = numOf(g.id);
    return {
        src: "igdb",
        medium: "game",
        title: textOf(g.name),
        year: released ? new Date(released * 1000).getUTCFullYear() : null,
        cover: igdbImg(at(g, "cover", "image_id")),
        banner: art ? igdbImg(at(art, "image_id"), "t_1080p") : "",
        genres: names(g.genres).map(n => n.replace(/ \(.*\)$/, "")),
        themes: names(g.themes),
        platforms: plats,
        creator: (dev.length ? dev : companies.filter(c => c.publisher).map(c => textOf(at(c, "company", "name"))))
            .slice(0, 2)
            .join(" & "),
        about: (textOf(g.summary) || textOf(g.storyline)).slice(0, 900),
        series: textOf(at(g, "collections", 0, "name")) || textOf(at(g, "franchises", 0, "name")) || undefined,
        kind:
            plats.length && plats.every(x => /iOS|Android/.test(x))
                ? "Mobile"
                : plats.length === 1 && /Web/.test(plats[0])
                  ? "Browser"
                  : "Console & PC",
        ext: { igdb: id, igdbSlug: textOf(g.slug) || undefined },
        scores: {
            igdb: rating ? Math.round(rating) : undefined,
            critics: critics ? Math.round(critics) : undefined,
        },
        popularity: numOf(g.total_rating_count) || 0,
    };
}
export async function igdbSearch(q: string, signal?: AbortSignal): Promise<Candidate[]> {
    const r = await igdbQ("games", `search "${String(q).replace(/"/g, "")}"; fields ${IGDB_GAME}; limit 14;`, signal);
    return recordsOf(r).map(igdbFields);
}
/** a game's details from IGDB, with how long it takes (null: IGDB has no game by that id) */
export async function igdbDetails(id: number | string, signal?: AbortSignal): Promise<Candidate | null> {
    const g = at(await igdbQ("games", `fields ${IGDB_GAME}; where id = ${Number(id)};`, signal), 0);
    if (!g) return null;
    const f = igdbFields(g);
    // how long it takes, if IGDB knows (seconds → hours)
    try {
        const t = fieldsOf(
            at(
                await igdbQ(
                    "game_time_to_beats",
                    `fields normally,hastily,completely; where game_id = ${Number(id)};`,
                    signal
                ),
                0
            )
        );
        const secs = numOf(t.normally) || numOf(t.hastily);
        if (secs) f.total = Math.round(secs / 3600);
    } catch (_) {}
    return f;
}
// the right game among similar names: same title first, then the year
function igdbPick(R: Candidate[], b: { title: string; year?: number | null }): Candidate | null {
    const t = norm(cleanTitle(b.title)),
        y = b.year;
    const sc = (r: Candidate) =>
        (norm(cleanTitle(r.title)) === t ? 3 : norm(cleanTitle(r.title)).startsWith(t) ? 1 : 0) +
        (y && r.year ? (r.year === y ? 2 : Math.abs(r.year - y) <= 1 ? 1 : -1) : 0) +
        Math.min(1, (r.popularity || 0) / 200);
    const best = R.map((r): [Candidate, number] => [r, sc(r)]).sort((a, c) => c[1] - a[1])[0];
    return best && best[1] >= 2 ? best[0] : null;
}
/** a game's IGDB id, found by title when it hasn't one */
export async function igdbFind(
    b: { title: string; year?: number | null; ext?: Record<string, unknown> },
    signal?: AbortSignal
): Promise<number | string | null> {
    const known = b.ext && b.ext.igdb;
    if (typeof known === "number" || (typeof known === "string" && known)) return known;
    const r = igdbPick(await igdbSearch(cleanTitle(b.title), signal), b);
    return (r && r.ext && r.ext.igdb) ?? null;
}
export async function igdbCharacters(id: number | string, signal?: AbortSignal): Promise<CastMember[]> {
    const r = await igdbQ(
        "characters",
        `fields name,mug_shot.image_id,description,gender; where games = (${Number(id)}); limit 60;`,
        signal
    );
    return recordsOf(r).map(c => ({
        src: "igdb",
        name: textOf(c.name),
        image: igdbImg(at(c, "mug_shot", "image_id"), "t_cover_big"),
        role: "Character",
        about: textOf(c.description).slice(0, 400),
        va: "",
    }));
}
export async function igdbImages(
    id: number | string,
    signal?: AbortSignal
): Promise<{ cover: string; label: string; wide?: boolean }[]> {
    const g = fieldsOf(
        at(
            await igdbQ(
                "games",
                `fields cover.image_id,artworks.image_id,screenshots.image_id; where id = ${Number(id)};`,
                signal
            ),
            0
        )
    );
    if (!Object.keys(g).length) return [];
    return [
        ...(g.cover ? [{ cover: igdbImg(at(g, "cover", "image_id"), "t_cover_big_2x"), label: "IGDB cover" }] : []),
        ...recordsOf(g.artworks).map(a => ({ cover: igdbImg(a.image_id, "t_1080p"), label: "Artwork", wide: true })),
        ...recordsOf(g.screenshots)
            .slice(0, 12)
            .map(a => ({ cover: igdbImg(a.image_id, "t_1080p"), label: "Screenshot", wide: true })),
    ];
}

// ── check and fix every game in one go, with whatever sources you have (IGDB, RAWG, Wikidata), and say what happened ──
/** whether a picture loads (and isn't a 1-pixel placeholder), within 9 s */
export const probeImg = (url: string): Promise<boolean> =>
    new Promise(ok => {
        if (!url) return ok(false);
        const im = new Image(),
            t = setTimeout(() => ok(false), 9000);
        im.onload = () => {
            clearTimeout(t);
            ok(im.naturalWidth > 1);
        };
        im.onerror = () => {
            clearTimeout(t);
            ok(false);
        };
        im.referrerPolicy = "no-referrer";
        im.src = url;
    });
/** a row of the "Check and fix my games" table */
interface GameRow {
    id: string;
    title: string;
    cover: string;
    from: string;
    chars: number | null;
    note: string;
}
const GU: { running: boolean; rows: GameRow[]; done: number; total: number } = {
    running: false,
    rows: [],
    done: 0,
    total: 0,
};
export async function gamesUpdate() {
    if (GU.running) return;
    const G = [...items.entries()].filter(([, b]) => b.medium === "game" && !b.private);
    Object.assign(GU, { running: true, rows: [], done: 0, total: G.length });
    if (ui.page === "settings") renderMain();
    for (const [id, b0] of G) {
        const row: GameRow = { id, title: titleOf(b0), cover: "", from: "", chars: null, note: "" };
        try {
            let f: Partial<Candidate> | null = null,
                b: Item = items.get(id) || b0;
            if (IGDB_ON()) {
                try {
                    const gid = await igdbFind(b);
                    if (gid) {
                        f = (await igdbDetails(gid)) || {};
                        row.from = "IGDB";
                    }
                } catch (_) {}
            }
            if (!f && KEYS.rawg) {
                try {
                    const rid = b.ext.rawg || rawgPick(await rawgSearch(cleanTitle(b.title)), b)?.ext.rawg;
                    if (rid) {
                        f = await rawgDetails(rid);
                        row.from = "RAWG";
                    }
                } catch (_) {}
            }
            if (!f) {
                try {
                    const q = b.ext.wikidata || (await wdFind(b.title, "game", b.year));
                    if (q) {
                        f = (await wdDetails([q], undefined, "game")).get(q) || null;
                        if (f) row.from = "Wikidata";
                    }
                } catch (_) {}
            }
            b = items.get(id) || b;
            const ok = !b.coverPicked && b.cover ? await probeImg(coverCache.src(b.cover)) : !!(b.cover || b.coverData);
            const fresh = f && (f.boxart || f.cover);
            if (fresh && !b.coverPicked && (!ok || (row.from === "IGDB" && !/igdb/.test(b.cover || "")))) {
                quietPatch(id, { cover: fresh, coverData: null, coverColor: null, color: null });
                row.cover = ok ? "replaced" : "added";
            } else row.cover = ok ? "fine" : "missing";
            const cur = items.get(id);
            if (f && cur) {
                const p: Partial<Item> = { ext: { ...cur.ext, ...(f.ext || {}) } };
                const empty = (have: unknown) => !(Array.isArray(have) ? have.length : have);
                if (f.platforms && empty(cur.platforms)) p.platforms = f.platforms;
                if (f.genres && empty(cur.genres)) p.genres = f.genres;
                if (f.total && empty(cur.total)) p.total = f.total;
                if (f.series && empty(cur.series)) p.series = f.series;
                if (f.creator && (row.from === "IGDB" || !cur.creator) && !cur.creatorEdited) p.creator = f.creator;
                if (f.about && (!cur.about || /\bupcoming\b/i.test(cur.about))) p.about = f.about;
                quietPatch(id, p);
            }
            updateItemTiles(id);
            castCache.delete(id);
            try {
                row.chars = (await fetchCast(id)).filter(c => c.name).length;
            } catch (_) {
                row.chars = null;
                row.note = "characters timed out";
            }
        } catch (_) {
            row.note = "couldn't check";
        }
        GU.rows.push(row);
        GU.done++;
        if (ui.page === "settings") renderMain();
        await sleep(250);
    }
    GU.running = false;
    scheduleSave();
    if (ui.page === "settings") renderMain();
    toast(`Checked ${plural(G.length, "game")}`);
}
/** Settings › Data › Your games (settings/sections/data/GamesPanel.svelte): where games are matched from, the two
 *  jobs and how far each has got, and the table of what "Check and fix my games" found */
export function gamesView() {
    return {
        src: [IGDB_ON() ? "IGDB" : "", KEYS.rawg ? "RAWG" : "", "Wikidata"].filter(Boolean).join(", then "),
        igdb: IGDB_ON(),
        spines: { running: SPN.running, done: SPN.done, total: SPN.total },
        games: { running: GU.running, done: GU.done, total: GU.total },
        rows: GU.rows.map(r => ({ ...r })),
    };
}
