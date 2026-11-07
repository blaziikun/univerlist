// src/features/sources/proxy.js
// ─────────────────────────────────────────────────────────────────
//  Your own proxy, for the databases that only answer servers
//
//  One free Cloudflare Worker of your own forwards to IGDB, SteamGridDB, TheGamesDB, ScreenScraper,
//  Comic Vine and Hardcover. Each needs its own free key, kept as a secret inside the Worker: never in this app, its
//  backups or your browser.
// ─────────────────────────────────────────────────────────────────

const UNIVERLIST_WORKER = /*@PROXY_SOURCE@*/ "";

// ── what the site itself shares ──
// A site that runs the Worker (univerlist.sayel.dev, or your own copy) lends TMDB and IGDB through its /api with its own
// keys, so nobody has to sign up for anything. Your own key or proxy, once added, is used instead.
const siteShares = { tmdb: false, igdb: false };
async function loadSiteShares() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
        const s = await getJSON(location.origin + "/api/status");
        const shared = Array.isArray(s.shared) ? s.shared : [];
        siteShares.tmdb = shared.includes("tmdb");
        siteShares.igdb = shared.includes("igdb");
        if ((siteShares.tmdb || siteShares.igdb) && !ui.modal) renderMain();
    } catch (_) {
        // no /api where this runs (the one-file version, a plain host): your own keys only
    }
}
const TMDB_ON = () => !!KEYS.tmdb || siteShares.tmdb;
// ── talking to it ──
const PXS = { status: null, checked: 0, off: {} };
const pxBase = () => {
    const s = String(KEYS.igdb || "").trim();
    if (!s) return null;
    try {
        const u = new URL(s);
        return { origin: u.origin, path: u.pathname.replace(/\/+$/, ""), pass: u.searchParams.get("pass") };
    } catch (_) {
        return null;
    }
};
function pxURL(route, path, params = {}) {
    const b = pxBase();
    if (!b) return null;
    return `${b.origin}${b.path}/${route}${path ? "/" + path : ""}?${new URLSearchParams(params)}`;
}
// the password goes in a header, so it never sits in an address (or in a server's logs)
const pxHeaders = () => {
    const b = pxBase();
    return b && b.pass ? { "X-Pass": b.pass } : {};
};
async function pxStatus(force) {
    if (!pxBase()) return {};
    if (PXS.status && !force && Date.now() - PXS.checked < 6e5) return PXS.status;
    try {
        // fresh, not the browser's hour-old copy, so a key you've just added shows up
        PXS.status = await getJSON(pxURL("status", ""), undefined, { cache: "no-cache" });
    } catch (_) {
        PXS.status = { igdb: true, old: true };
    }
    PXS.checked = Date.now();
    return PXS.status;
}
const pxHas = async k => !PXS.off[k] && !!(await pxStatus())[k];
async function pxGet(route, path, params, signal) {
    const u = pxURL(route, path, params);
    if (!u) throw new Error("no-proxy");
    try {
        return await getJSON(u, signal, { headers: pxHeaders() });
    } catch (e) {
        if (e.status === 501) PXS.off[route] = true;
        throw e;
    }
}
// ── games: every cover people have made (SteamGridDB), the real box for each platform (TheGamesDB, ScreenScraper), and spines (ScreenScraper) ──
async function sgdbCovers(b, signal) {
    if (!(await pxHas("sgdb"))) return [];
    const s = await pxGet("sgdb", "search/autocomplete/" + encodeURIComponent(cleanTitle(b.title)), {}, signal),
        hit = (s.data || []).find(g => norm(g.name) === norm(cleanTitle(b.title))) || (s.data || [])[0];
    if (!hit) return [];
    const g = await pxGet(
        "sgdb",
        "grids/game/" + hit.id,
        { dimensions: "600x900,342x482,660x930", types: "static", nsfw: "false" },
        signal
    );
    return (g.data || []).slice(0, 40).map(x => ({
        cover: x.url,
        label: "SteamGridDB" + (x.style && x.style !== "alternate" ? " · " + x.style : ""),
    }));
}
async function tgdbBoxes(b, signal) {
    if (!(await pxHas("tgdb"))) return [];
    const r = await pxGet(
        "tgdb",
        "v1.1/Games/ByGameName",
        { name: cleanTitle(b.title), fields: "platform", include: "boxart,platform" },
        signal
    );
    const games = ((r.data || {}).games || []).filter(
        g => idTitle(g.game_title) === idTitle(b.title) || norm(g.game_title).startsWith(norm(cleanTitle(b.title)))
    );
    const inc = r.include || {},
        base =
            ((inc.boxart || {}).base_url || {}).large ||
            ((inc.boxart || {}).base_url || {}).original ||
            "https://cdn.thegamesdb.net/images/large/",
        plats = (inc.platform || {}).data || {};
    const mine = b.platform || (b.platforms || [])[0] || "",
        out = [];
    for (const g of games) {
        const pn = (plats[g.platform] || {}).name || "";
        for (const a of ((inc.boxart || {}).data || {})[g.id] || [])
            if (a.side === "front" || a.side === "back")
                out.push({
                    cover: base + a.filename,
                    label: `${pn || "Box"} · ${a.side}`,
                    plat: pn,
                    back: a.side === "back",
                    score:
                        (mine && pn && norm(pn).includes(norm(mine).split(" ").pop()) ? 2 : 0) +
                        (a.side === "front" ? 1 : 0),
                });
    }
    return out.sort((x, y) => y.score - x.score);
}
// ScreenScraper: front, back, 3D box and the spine, per region and system
async function ssMedia(b, signal) {
    if (!(await pxHas("ss"))) return [];
    const r = await pxGet("ss", "jeuRecherche.php", { recherche: cleanTitle(b.title) }, signal),
        J = ((r.response || {}).jeux || []).filter(j => j && j.id);
    const mine = norm(b.platform || (b.platforms || [])[0] || ""),
        name = j =>
            ((j.noms || []).find(n => ["ss", "wor", "us", "eu"].includes(n.region)) || (j.noms || [])[0] || {}).text ||
            "";
    const pick = J.filter(
        j => idTitle(name(j)) === idTitle(b.title) || norm(name(j)).startsWith(norm(cleanTitle(b.title)))
    ).sort(
        (x, y) =>
            (mine && norm((y.systeme || {}).text || "").includes(mine.split(" ").pop()) ? 1 : 0) -
            (mine && norm((x.systeme || {}).text || "").includes(mine.split(" ").pop()) ? 1 : 0)
    );
    const REG = ["eu", "wor", "us", "uk", "ss", "jp"],
        out = [];
    for (const j of pick.slice(0, 3))
        for (const m of j.medias || [])
            if (["box-2D", "box-2D-side", "box-2D-back", "box-3D"].includes(m.type))
                out.push({
                    cover: m.url,
                    label: `${(j.systeme || {}).text || ""} · ${{ "box-2D": "front", "box-2D-side": "spine", "box-2D-back": "back", "box-3D": "3D box" }[m.type]} (${m.region || "?"})`,
                    kind: m.type,
                    reg: REG.indexOf(m.region) < 0 ? 9 : REG.indexOf(m.region),
                    plat: (j.systeme || {}).text || "",
                });
    return out.sort((x, y) => x.reg - y.reg);
}
// ── comics: every issue's cover (Comic Vine) ──
async function cvCovers(b, signal) {
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
    const v =
        (s.results || []).find(
            x =>
                idTitle(x.name) === idTitle(b.title) &&
                (!b.year || !x.start_year || Math.abs(x.start_year - b.year) <= 1)
        ) || (s.results || [])[0];
    if (!v) return [];
    const out = v.image ? [{ cover: v.image.original_url || v.image.super_url, label: "Comic Vine · volume" }] : [];
    const is = await pxGet(
        "cv",
        "issues",
        { filter: "volume:" + v.id, sort: "issue_number:asc", field_list: "issue_number,name,image", limit: "100" },
        signal
    ).catch(() => ({}));
    for (const x of is.results || [])
        if (x.image)
            out.push({
                cover: x.image.original_url || x.image.super_url,
                label: `#${x.issue_number}${x.name ? " " + x.name : ""}`,
            });
    return out;
}
// ── books: Hardcover's covers for each edition ──
async function hcCovers(b, signal) {
    if (!(await pxHas("hc"))) return [];
    const u = pxURL("hc", ""),
        post = body =>
            getJSON(u, signal, {
                method: "POST",
                body: JSON.stringify(body),
                headers: { "Content-Type": "text/plain", ...pxHeaders() },
            });
    const s = await post({
        query: 'query($q:String!){ search(query:$q, query_type:"Book", per_page:6, page:1){ results } }',
        variables: { q: `${cleanTitle(b.title)} ${b.creator || ""}`.trim() },
    });
    const hits = ((((s.data || {}).search || {}).results || {}).hits || []).map(h => h.document || {}),
        hit = hits.find(d => idTitle(d.title || "") === idTitle(b.title)) || hits[0];
    if (!hit) return [];
    const out = hit.image && hit.image.url ? [{ cover: hit.image.url, label: "Hardcover" }] : [];
    try {
        const e = await post({
            query: "query($id:Int!){ editions(where:{book_id:{_eq:$id}}, order_by:{users_count:desc}, limit:40){ edition_format release_date cached_image } }",
            variables: { id: Number(hit.id) },
        });
        for (const x of (e.data || {}).editions || []) {
            const url = x.cached_image && (x.cached_image.url || x.cached_image);
            if (typeof url === "string" && /^https?:/.test(url))
                out.push({
                    cover: url,
                    label: ["Hardcover", x.edition_format, (x.release_date || "").slice(0, 4)]
                        .filter(Boolean)
                        .join(" · "),
                });
        }
    } catch (_) {}
    return out;
}
// ── real spines on your shelves, from ScreenScraper ──
const SPN = { running: false, done: 0, total: 0, got: 0 };
async function spinesUpdate() {
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
function pxStatusHTML() {
    const S = PXS.status;
    if (!S) {
        pxStatus().then(() => {
            if (ui.page === "settings") renderMain();
        });
        return `<p class="hint">Checking your proxy…</p>`;
    }
    if (S.old)
        return `<p class="hint">Your proxy is the older IGDB-only script. Replace its code with the one below to add the other sources.</p>`;
    const N = {
        igdb: "IGDB",
        sgdb: "SteamGridDB",
        tgdb: "TheGamesDB",
        ss: "ScreenScraper",
        cv: "Comic Vine",
        hc: "Hardcover",
    };
    return `<div class="chips pxchips">${Object.entries(N)
        .map(
            ([k, l]) =>
                `<span class="chip${S[k] ? " on" : ""}" title="${S[k] ? "Set up" : "No key in the Worker yet"}">${S[k] ? "● " : "○ "}${l}</span>`
        )
        .join("")}</div>`;
}
