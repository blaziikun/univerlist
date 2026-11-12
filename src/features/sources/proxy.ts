// src/features/sources/proxy.ts
// ─────────────────────────────────────────────────────────────────
//  Your own proxy, for the databases that only answer servers
//
//  One free Cloudflare Worker of your own forwards to IGDB, SteamGridDB, TheGamesDB, ScreenScraper,
//  Comic Vine and Hardcover. Each needs its own free key, kept as a secret inside the Worker: never in this app, its
//  backups or your browser.
// ─────────────────────────────────────────────────────────────────

import {
    at,
    cleanTitle,
    fieldsOf,
    idTitle,
    items,
    KEYS,
    norm,
    numOf,
    ownOf,
    quietPatch,
    recordsOf,
    scheduleSave,
    sleep,
    strsOf,
    textOf,
    toast,
    ui,
} from "../core/core";
import { getJSON, SourceError } from "./sources";
import { renderMain } from "../core/shell";
import proxySource from "virtual:proxy-script";

// the stand-alone proxy the app offers to copy: worker/proxy.ts as plain JavaScript (made by the build, vite.config.ts)
export const UNIVERLIST_WORKER: string = proxySource;

// ── what the site itself shares ──
// A site that runs the Worker (univerlist.sayel.dev, or your own copy) lends TMDB and IGDB through its /api with its own
// keys, so nobody has to sign up for anything. Your own key or proxy, once added, is used instead.
export const siteShares = { tmdb: false, igdb: false };
export async function loadSiteShares() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
        const shared = strsOf(at(await getJSON(location.origin + "/api/status"), "shared"));
        siteShares.tmdb = shared.includes("tmdb");
        siteShares.igdb = shared.includes("igdb");
        if ((siteShares.tmdb || siteShares.igdb) && !ui.modal) renderMain();
    } catch (_) {
        // no /api where this runs (the one-file version, a plain host): your own keys only
    }
}
export const TMDB_ON = () => !!KEYS.tmdb || siteShares.tmdb;
// ── talking to it ──
/** what your proxy says it has keys for (old: the older IGDB-only script), when that was asked, and the routes that
 * turned out not to be there */
const PXS: { status: Record<string, unknown> | null; checked: number; off: Record<string, boolean> } = {
    status: null,
    checked: 0,
    off: {},
};
export const pxBase = (): { origin: string; path: string; pass: string | null } | null => {
    const s = String(KEYS.igdb || "").trim();
    if (!s) return null;
    try {
        const u = new URL(s);
        return { origin: u.origin, path: u.pathname.replace(/\/+$/, ""), pass: u.searchParams.get("pass") };
    } catch (_) {
        return null;
    }
};
export function pxURL(route: string, path: string, params: Record<string, string> = {}): string | null {
    const b = pxBase();
    if (!b) return null;
    return `${b.origin}${b.path}/${route}${path ? "/" + path : ""}?${new URLSearchParams(params)}`;
}
// the password goes in a header, so it never sits in an address (or in a server's logs)
const pxHeaders = (): Record<string, string> => {
    const b = pxBase();
    return b && b.pass ? { "X-Pass": b.pass } : {};
};
async function pxStatus(force?: boolean): Promise<Record<string, unknown>> {
    const u = pxURL("status", "");
    if (!u) return {};
    if (PXS.status && !force && Date.now() - PXS.checked < 6e5) return PXS.status;
    try {
        // fresh, not the browser's hour-old copy, so a key you've just added shows up
        PXS.status = fieldsOf(await getJSON(u, undefined, { cache: "no-cache" }));
    } catch (_) {
        PXS.status = { igdb: true, old: true };
    }
    PXS.checked = Date.now();
    return PXS.status;
}
const pxHas = async (k: string) => !PXS.off[k] && !!(await pxStatus())[k];
async function pxGet(route: string, path: string, params: Record<string, string>, signal?: AbortSignal) {
    const u = pxURL(route, path, params);
    if (!u) throw new Error("no-proxy");
    try {
        return await getJSON(u, signal, { headers: pxHeaders() });
    } catch (e) {
        if (e instanceof SourceError && e.status === 501) PXS.off[route] = true;
        throw e;
    }
}
/** a picture your proxy found: a cover, a box's side, a spine, with what it's for and how well it fits */
export interface BoxArt {
    cover: string;
    label: string;
    kind?: string; // ScreenScraper's kind: box-2D, box-2D-side, box-2D-back, box-3D
    plat?: string; // the platform it's the box for
    back?: boolean;
    score?: number;
    reg?: number; // the region, in order of preference
}
/** what the proxies are asked about: a title, and for games the platform it's on */
type Asked = { title: string; year?: number | null; creator?: string; platform?: string; platforms?: string[] };
// ── games: every cover people have made (SteamGridDB), the real box for each platform (TheGamesDB, ScreenScraper), and spines (ScreenScraper) ──
export async function sgdbCovers(b: Asked, signal?: AbortSignal): Promise<BoxArt[]> {
    if (!(await pxHas("sgdb"))) return [];
    const s = await pxGet("sgdb", "search/autocomplete/" + encodeURIComponent(cleanTitle(b.title)), {}, signal),
        found = recordsOf(at(s, "data")),
        hit = found.find(g => norm(g.name) === norm(cleanTitle(b.title))) || found[0];
    if (!hit || hit.id == null) return [];
    const g = await pxGet(
        "sgdb",
        "grids/game/" + textOf(hit.id),
        { dimensions: "600x900,342x482,660x930", types: "static", nsfw: "false" },
        signal
    );
    return recordsOf(at(g, "data"))
        .slice(0, 40)
        .map(x => ({
            cover: textOf(x.url),
            label: "SteamGridDB" + (x.style && x.style !== "alternate" ? " · " + textOf(x.style) : ""),
        }))
        .filter(x => x.cover);
}
export async function tgdbBoxes(b: Asked, signal?: AbortSignal): Promise<BoxArt[]> {
    if (!(await pxHas("tgdb"))) return [];
    const r = await pxGet(
        "tgdb",
        "v1.1/Games/ByGameName",
        { name: cleanTitle(b.title), fields: "platform", include: "boxart,platform" },
        signal
    );
    const games = recordsOf(at(r, "data", "games")).filter(
        g => idTitle(g.game_title) === idTitle(b.title) || norm(g.game_title).startsWith(norm(cleanTitle(b.title)))
    );
    const inc = fieldsOf(at(r, "include")),
        base =
            textOf(at(inc, "boxart", "base_url", "large")) ||
            textOf(at(inc, "boxart", "base_url", "original")) ||
            "https://cdn.thegamesdb.net/images/large/",
        plats = fieldsOf(at(inc, "platform", "data")),
        boxes = fieldsOf(at(inc, "boxart", "data"));
    const mine = b.platform || (b.platforms || [])[0] || "",
        out: (BoxArt & { score: number })[] = [];
    for (const g of games) {
        const pn = textOf(at(plats, textOf(g.platform), "name"));
        for (const a of recordsOf(boxes[textOf(g.id)]))
            if (a.side === "front" || a.side === "back")
                out.push({
                    cover: base + textOf(a.filename),
                    label: `${pn || "Box"} · ${textOf(a.side)}`,
                    plat: pn,
                    back: a.side === "back",
                    score:
                        (mine && pn && norm(pn).includes(norm(mine).split(" ").pop() || "") ? 2 : 0) +
                        (a.side === "front" ? 1 : 0),
                });
    }
    return out.sort((x, y) => y.score - x.score);
}
const SS_SIDE: Record<string, string> = {
    "box-2D": "front",
    "box-2D-side": "spine",
    "box-2D-back": "back",
    "box-3D": "3D box",
};
// ScreenScraper: front, back, 3D box and the spine, per region and system
export async function ssMedia(b: Asked, signal?: AbortSignal): Promise<BoxArt[]> {
    if (!(await pxHas("ss"))) return [];
    const r = await pxGet("ss", "jeuRecherche.php", { recherche: cleanTitle(b.title) }, signal),
        J = recordsOf(at(r, "response", "jeux")).filter(j => j.id);
    const mine = norm(b.platform || (b.platforms || [])[0] || ""),
        last = mine.split(" ").pop() || "",
        sys = (j: Record<string, unknown>) => textOf(at(j, "systeme", "text")),
        name = (j: Record<string, unknown>) => {
            const noms = recordsOf(j.noms);
            return textOf((noms.find(n => ["ss", "wor", "us", "eu"].includes(textOf(n.region))) || noms[0] || {}).text);
        };
    const pick = J.filter(
        j => idTitle(name(j)) === idTitle(b.title) || norm(name(j)).startsWith(norm(cleanTitle(b.title)))
    ).sort((x, y) => (mine && norm(sys(y)).includes(last) ? 1 : 0) - (mine && norm(sys(x)).includes(last) ? 1 : 0));
    const REG = ["eu", "wor", "us", "uk", "ss", "jp"],
        out: (BoxArt & { reg: number })[] = [];
    for (const j of pick.slice(0, 3))
        for (const m of recordsOf(j.medias)) {
            const type = textOf(m.type),
                side = ownOf(SS_SIDE, type),
                region = textOf(m.region);
            if (side && m.url)
                out.push({
                    cover: textOf(m.url),
                    label: `${sys(j)} · ${side} (${region || "?"})`,
                    kind: type,
                    reg: REG.indexOf(region) < 0 ? 9 : REG.indexOf(region),
                    plat: sys(j),
                });
        }
    return out.sort((x, y) => x.reg - y.reg);
}
// ── comics: every issue's cover (Comic Vine) ──
export async function cvCovers(b: Asked, signal?: AbortSignal): Promise<BoxArt[]> {
    if (!(await pxHas("cv"))) return [];
    const s = await pxGet(
        "cv",
        "search",
        {
            resources: "volume",
            query: cleanTitle(b.title),
            field_list: "id,name,start_year,image,count_of_issues",
            limit: "8",
        },
        signal
    );
    const results = recordsOf(at(s, "results")),
        v =
            results.find(x => {
                const start = numOf(x.start_year) || parseInt(textOf(x.start_year), 10);
                return idTitle(x.name) === idTitle(b.title) && (!b.year || !start || Math.abs(start - b.year) <= 1);
            }) || results[0];
    if (!v) return [];
    const image = (x: Record<string, unknown>) =>
        textOf(at(x, "image", "original_url")) || textOf(at(x, "image", "super_url"));
    const out: BoxArt[] = image(v) ? [{ cover: image(v), label: "Comic Vine · volume" }] : [];
    const is = await pxGet(
        "cv",
        "issues",
        {
            filter: "volume:" + textOf(v.id),
            sort: "issue_number:asc",
            field_list: "issue_number,name,image",
            limit: "100",
        },
        signal
    ).catch(() => ({}));
    for (const x of recordsOf(at(is, "results")))
        if (image(x))
            out.push({
                cover: image(x),
                label: `#${textOf(x.issue_number)}${x.name ? " " + textOf(x.name) : ""}`,
            });
    return out;
}
// ── books: Hardcover's covers for each edition ──
export async function hcCovers(b: Asked, signal?: AbortSignal): Promise<BoxArt[]> {
    if (!(await pxHas("hc"))) return [];
    const u = pxURL("hc", "");
    if (!u) return [];
    const post = (body: unknown) =>
        getJSON(u, signal, {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "text/plain", ...pxHeaders() },
        });
    const s = await post({
        query: 'query($q:String!){ search(query:$q, query_type:"Book", per_page:6, page:1){ results } }',
        variables: { q: `${cleanTitle(b.title)} ${b.creator || ""}`.trim() },
    });
    const hits = recordsOf(at(s, "data", "search", "results", "hits")).map(h => fieldsOf(h.document)),
        hit = hits.find(d => idTitle(textOf(d.title)) === idTitle(b.title)) || hits[0];
    if (!hit) return [];
    const first = textOf(at(hit, "image", "url"));
    const out: BoxArt[] = first ? [{ cover: first, label: "Hardcover" }] : [];
    try {
        const e = await post({
            query: "query($id:Int!){ editions(where:{book_id:{_eq:$id}}, order_by:{users_count:desc}, limit:40){ edition_format release_date cached_image } }",
            variables: { id: Number(hit.id) },
        });
        for (const x of recordsOf(at(e, "data", "editions"))) {
            const img = x.cached_image,
                url = typeof img === "string" ? img : textOf(at(img, "url"));
            if (/^https?:/.test(url))
                out.push({
                    cover: url,
                    label: ["Hardcover", textOf(x.edition_format), textOf(x.release_date).slice(0, 4)]
                        .filter(Boolean)
                        .join(" · "),
                });
        }
    } catch (_) {}
    return out;
}
// ── real spines on your shelves, from ScreenScraper ──
export const SPN = { running: false, done: 0, total: 0, got: 0 };
export async function spinesUpdate() {
    if (SPN.running) return;
    if (!(await pxHas("ss"))) {
        toast("Add ScreenScraper to your proxy first (Settings › Data, sources & keys › Your own keys).");
        return;
    }
    const G = [...items.entries()].filter(([, b]) => b.medium === "game" && !b.spineArt);
    Object.assign(SPN, { running: true, done: 0, total: G.length, got: 0 });
    renderMain();
    for (const [id, b] of G) {
        try {
            const M = await ssMedia(b),
                s = M.find(m => m.kind === "box-2D-side");
            if (s) {
                quietPatch(id, { spineArt: s.cover });
                SPN.got++;
            }
        } catch (_) {}
        SPN.done++;
        if (SPN.done % 5 === 0) renderMain();
        await sleep(1300);
    }
    SPN.running = false;
    scheduleSave();
    renderMain();
    toast(`Found real spines for ${SPN.got} of ${SPN.total} games`);
}
/** which sources your proxy has keys for (Settings › Data, under the proxy script: settings/sections/data/ProxyStatus.svelte):
 *  not known yet, the older IGDB-only script, or each source and whether it's set up */
export function pxStatusView(): { k: "checking" } | { k: "old" } | { k: "chips"; chips: { l: string; on: boolean }[] } {
    const S = PXS.status;
    if (!S) return { k: "checking" };
    if (S.old) return { k: "old" };
    const N = {
        igdb: "IGDB",
        sgdb: "SteamGridDB",
        tgdb: "TheGamesDB",
        ss: "ScreenScraper",
        cv: "Comic Vine",
        hc: "Hardcover",
    };
    return { k: "chips", chips: Object.entries(N).map(([k, l]) => ({ l, on: !!S[k] })) };
}
/** asks the proxy what it has keys for, and shows the answer if Settings is still open. A key that isn't a web address
 *  has nothing to ask: asking anyway answered at once with nothing, which drew Settings again, which asked again, for
 *  as long as Settings › Data stayed open */
export function pxStatusAsk() {
    if (!pxBase()) return;
    pxStatus().then(() => {
        if (ui.page === "settings") renderMain();
    });
}
