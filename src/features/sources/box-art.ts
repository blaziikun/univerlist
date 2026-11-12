// src/features/sources/box-art.ts
// ─────────────────────────────────────────────────────────────────
//  Artwork, part two: proper box art for games (as Backloggd shows) and more book covers
//
//  Without IGDB, game covers come from: Steam's portrait library art, then the box art on the game's Wikipedia page,
//  and only then RAWG's picture (which is a screenshot, not a cover). Books add Apple Books, whose covers are large and
//  current.
// ─────────────────────────────────────────────────────────────────

import {
    at,
    cleanTitle,
    errName,
    fieldsOf,
    idTitle,
    items,
    markDirty,
    meta,
    norm,
    numOf,
    plural,
    quietPatch,
    recordsOf,
    scheduleSave,
    sleep,
    surname,
    textOf,
    toList,
    toast,
} from "../core/core";
import { getJSON } from "./sources";
import { probeImg } from "./igdb";
import { updateItemTiles } from "./covers";
import { renderMain } from "../core/shell";
import type { Candidate, ItemExt } from "../core/model";

/** what box art is looked for by: an entry's title and the little else that helps find it */
type Asked = {
    title: string;
    year?: number | null;
    creator?: string;
    kind?: string;
    platforms?: string[];
    ext?: ItemExt;
};
const aborted = (e: unknown) => errName(e) === "AbortError";

/** a RAWG picture, which is a screenshot rather than a cover */
export const isShot = (u: string | null | undefined) => /media\.rawg\.io\/media\/(games|screenshots)\//.test(u || "");
/** a Wikipedia article's title, from its address ("" when it can't be read) */
const articleTitle = (u: string): string => {
    try {
        return decodeURIComponent(u.split("/wiki/").pop() || "").replace(/_/g, " ");
    } catch (_) {
        return "";
    }
};
export async function wikiBoxArt(b: Asked, signal?: AbortSignal): Promise<string> {
    const wiki = textOf(b.ext && b.ext.wiki);
    let title = wiki ? articleTitle(wiki) : "";
    if (!title) {
        try {
            const P = (await wikiLeadImage([`${b.title} (video game)`, b.title], signal)).filter(
                p => p.src && (!p.w || (p.h || 0) / p.w > 1.05)
            );
            if (P.length) return P[0].src;
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    if (!title) {
        const hits = await wikiSearch(`${cleanTitle(b.title)} ${b.year || ""} video game`, signal),
            t = norm(cleanTitle(b.title));
        const hit =
            hits.find(h => norm(h.title.replace(/\s*\(.*\)$/, "")) === t && /game/i.test(h.snippet)) ||
            hits.find(h => norm(h.title.replace(/\s*\(.*\)$/, "")) === t) ||
            hits.find(h => norm(h.title).startsWith(t) && /video game/i.test(h.snippet));
        if (!hit) return "";
        title = hit.title;
    }
    const j = await getJSON(
        "https://en.wikipedia.org/w/api.php?" +
            new URLSearchParams({
                action: "query",
                prop: "pageimages",
                titles: title,
                piprop: "original|thumbnail",
                pithumbsize: "800",
                pilicense: "any",
                redirects: "1",
                format: "json",
                origin: "*",
            }),
        signal
    );
    const p = fieldsOf(Object.values(fieldsOf(at(j, "query", "pages")))[0]),
        src = textOf(at(p, "thumbnail", "source")) || textOf(at(p, "original", "source"));
    // logos and screenshots are wide; box art is upright
    const size = fieldsOf(p.original || p.thumbnail),
        w = numOf(size.width),
        h = numOf(size.height);
    return src && (!w || !h || h / w > 1.05) ? src : "";
}
async function gameBoxArt(b: Asked, signal?: AbortSignal): Promise<{ cover: string; from: string } | null> {
    const e = b.ext || {},
        plats = b.platforms || [],
        mobile = /Mobile/.test(b.kind || "") || (plats.length && plats.every(p => /iOS|Android|iPhone|iPad/i.test(p)));
    if (mobile) {
        try {
            const u = await appStoreIcon(b, signal);
            if (u) return { cover: u, from: "App Store" };
        } catch (x) {
            if (aborted(x)) throw x;
        }
    }
    const steam = textOf(e.steam);
    if (steam) {
        const u = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steam}/library_600x900_2x.jpg`;
        if (await probeImg(u)) return { cover: u, from: "Steam" };
    }
    try {
        const u = await wikiBoxArt(b, signal);
        if (u) return { cover: u, from: "Wikipedia" };
    } catch (x) {
        if (aborted(x)) throw x;
    }
    return null;
}
/** a game whose cover is missing or is really a screenshot gets proper box art (never one you picked yourself): true
 * when it did */
export async function upgradeGameCover(id: string, signal?: AbortSignal): Promise<boolean> {
    const b = items.get(id);
    if (!b || b.medium !== "game" || b.coverPicked || b.coverData) return false;
    if (b.cover && !isShot(b.cover) && !/steamstatic.*header/.test(b.cover)) return false;
    const r = await gameBoxArt(b, signal);
    if (!r) return false;
    quietPatch(id, {
        cover: r.cover,
        coverColor: null,
        color: null,
        ...(b.cover && isShot(b.cover) && !b.banner ? { banner: b.cover } : {}),
    });
    updateItemTiles(id);
    return true;
}
// once: every game still showing a screenshot or nothing gets another try
async function gameCoverSweep() {
    if (meta.settings.gameart1 || !navigator.onLine) return;
    const G = [...items.entries()]
        .filter(([, b]) => b.medium === "game" && !b.coverPicked && !b.coverData && (!b.cover || isShot(b.cover)))
        .map(([id]) => id);
    meta.settings.gameart1 = true;
    markDirty();
    let n = 0;
    for (const id of G) {
        try {
            if (await upgradeGameCover(id)) n++;
        } catch (_) {}
        await sleep(350);
    }
    if (n) {
        scheduleSave();
        toast(`Found proper box art for ${plural(n, "game")}`);
        renderMain();
    }
}
/** Apple Books: large, current covers for novels, manga and light novels */
export async function appleBookCovers(b: Asked, signal?: AbortSignal): Promise<{ cover: string; label: string }[]> {
    const fa = String(b.creator || "")
            .split(/&|,| and /)[0]
            .trim(),
        t = cleanTitle(b.title);
    const j = await itunesJSON(
        {
            term: `${t} ${fa}`.trim(),
            media: "ebook",
            limit: "25",
            country: (meta.settings.region || "GB").toLowerCase(),
        },
        signal
    );
    const sn = norm(fa).split(" ").pop();
    return recordsOf(at(j, "results"))
        .filter(
            r =>
                textOf(r.artworkUrl100) &&
                norm(r.trackName).startsWith(norm(t).slice(0, 24)) &&
                (!sn || norm(r.artistName).includes(sn))
        )
        .map(r => {
            const released = textOf(r.releaseDate);
            return {
                cover: textOf(r.artworkUrl100).replace(/\/\d+x\d+bb\./, "/1000x1500bb."),
                label: "Apple Books" + (released ? ", " + released.slice(0, 4) : ""),
            };
        });
}

/** old browser and flash games, arcade and DOS games: the Internet Archive's software collections (preserved and
 * playable there) */
export async function archiveGames(q: string, signal?: AbortSignal): Promise<Candidate[]> {
    const cols =
        "collection:(softwarelibrary_flash OR internetarcade OR softwarelibrary_msdos_games OR softwarelibrary OR flashpoint)";
    const j = await getJSON(
        "https://archive.org/advancedsearch.php?" +
            new URLSearchParams({
                q: `title:(${q.replace(/[()":]/g, " ")}) AND mediatype:software AND ${cols}`,
                "fl[]": "identifier",
                rows: "6",
                output: "json",
            }) +
            "&fl[]=title&fl[]=year&fl[]=creator&fl[]=collection",
        signal
    );
    return recordsOf(at(j, "response", "docs"))
        .filter(d => textOf(d.identifier))
        .map(d => {
            const id = textOf(d.identifier),
                flash = toList(d.collection ?? []).some(c => /flash/.test(textOf(c))),
                year = textOf(d.year);
            return {
                src: "archive",
                medium: "game",
                title: textOf(d.title) || id,
                year: year ? +year.slice(0, 4) || null : null,
                creator: textOf(toList(d.creator ?? [])[0]),
                kind: flash ? "Browser" : "Console & PC",
                cover: `https://archive.org/services/img/${encodeURIComponent(id)}`,
                ext: { archive: id },
                platforms: flash ? ["Web browser (Flash)"] : [],
            };
        });
}

/** an iTunes search, as Apple answered it. Apple's search answers browsers inconsistently, so if a normal request is
 * refused it's asked again the old way (JSONP) */
export async function itunesJSON(params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    const url = "https://itunes.apple.com/search?" + new URLSearchParams(params);
    try {
        return await getJSON(url, signal, { timeout: 8000 });
    } catch (e) {
        if (aborted(e)) throw e;
    }
    return new Promise((res, rej) => {
        const cb = "itcb" + Math.random().toString(36).slice(2),
            s = document.createElement("script"),
            t = setTimeout(() => {
                done();
                rej(new Error("timeout"));
            }, 9000);
        function done() {
            clearTimeout(t);
            try {
                Reflect.deleteProperty(window, cb);
            } catch (_) {}
            s.remove();
        }
        // the answer calls this, by the name in the address
        Reflect.set(window, cb, (d: unknown) => {
            done();
            res(d);
        });
        s.onerror = () => {
            done();
            rej(new Error("jsonp"));
        };
        s.src = url + "&callback=" + cb;
        document.head.append(s);
    });
}
/** a page's lead image, any licence (box art and book covers are non-free images, so they need "any") */
async function wikiLeadImage(
    titles: string[],
    signal?: AbortSignal
): Promise<{ title: string; src: string; w?: number; h?: number }[]> {
    const j = await getJSON(
        "https://en.wikipedia.org/w/api.php?" +
            new URLSearchParams({
                action: "query",
                prop: "pageimages",
                titles: titles.join("|"),
                piprop: "original|thumbnail",
                pithumbsize: "800",
                pilicense: "any",
                redirects: "1",
                format: "json",
                origin: "*",
            }),
        signal
    );
    return Object.values(fieldsOf(at(j, "query", "pages")))
        .map(fieldsOf)
        .filter(p => !p.missing && p.pageid)
        .map(p => {
            const size = fieldsOf(p.original || p.thumbnail);
            return {
                title: textOf(p.title),
                src: textOf(at(p, "thumbnail", "source")) || textOf(at(p, "original", "source")),
                w: numOf(size.width),
                h: numOf(size.height),
            };
        });
}
async function wikiSearch(q: string, signal?: AbortSignal, n = 5): Promise<{ title: string; snippet: string }[]> {
    const j = await getJSON(
        "https://en.wikipedia.org/w/api.php?" +
            new URLSearchParams({
                action: "query",
                list: "search",
                srsearch: q,
                srlimit: String(n),
                format: "json",
                origin: "*",
            }),
        signal
    );
    return recordsOf(at(j, "query", "search"))
        .map(h => ({ title: textOf(h.title), snippet: textOf(h.snippet) }))
        .filter(h => h.title);
}
/** a book's cover from its Wikipedia article ("Eight Detectives" → the first-edition cover) */
export async function wikiBookCover(b: Asked, signal?: AbortSignal): Promise<string> {
    const t = cleanTitle(b.title),
        sur = surname(b.creator || "");
    let P = (await wikiLeadImage([`${t} (novel)`, `${t} (book)`, t], signal)).filter(
        p => p.src && (!p.w || (p.h || 0) / p.w > 1.1)
    );
    if (!P.length) {
        const hits = (await wikiSearch(`${t} ${b.creator || ""} novel`, signal)).filter(
            h => norm(h.title).startsWith(norm(t)) && (!sur || norm(h.snippet).includes(norm(sur)))
        );
        if (hits.length) P = (await wikiLeadImage([hits[0].title], signal)).filter(p => p.src);
    }
    return P[0] ? P[0].src : "";
}
/** mobile games: the App Store icon is what Backloggd and the stores show */
export async function appStoreIcon(b: Asked, signal?: AbortSignal): Promise<string> {
    const j = await itunesJSON(
            {
                term: cleanTitle(b.title),
                entity: "software",
                limit: "8",
                country: (meta.settings.region || "GB").toLowerCase(),
            },
            signal
        ),
        t = idTitle(b.title),
        c = norm(cleanTitle(b.title)),
        results = recordsOf(at(j, "results"));
    const r = results.find(x => idTitle(x.trackName) === t) || results.find(x => norm(x.trackName).startsWith(c));
    return r ? (textOf(r.artworkUrl512) || textOf(r.artworkUrl100)).replace(/\/\d+x\d+bb\./, "/600x600bb.") : "";
}
/** a character's picture from Wikipedia ("" when there isn't one). For characters from live-action shows: the
 * character's own article (it usually leads with a still of them in the role) */
export async function wikiCharImage(name: string, work: string, signal?: AbortSignal): Promise<string> {
    const hits = await wikiSearch(`"${name}" ${work} character`, signal, 4),
        first = norm(name).split(" ")[0];
    const h =
        hits.find(x => norm(x.title).includes(first) && /character|fictional/i.test(x.snippet)) ||
        hits.find(x => norm(x.title).startsWith(norm(name)));
    if (!h) return "";
    const P = await wikiLeadImage([h.title], signal);
    return (P[0] && P[0].src) || "";
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initBoxArt() {
    setTimeout(() => {
        try {
            gameCoverSweep();
        } catch (_) {}
    }, 9000);
}
