// src/features/sources/igdb.js
// ─────────────────────────────────────────────────────────────────
//  IGDB: the games database Backloggd uses (covers, characters, platforms, developers, time to beat)
//
//  IGDB only answers servers, so it goes through a tiny proxy of your own (a free Cloudflare Worker, script in
//  Settings). The address of that proxy is kept like a key: in this browser and your backups, never in the app file.
// ─────────────────────────────────────────────────────────────────

const IGDB_ON = () => !!(KEYS.igdb || "").trim() || siteShares.igdb;
const igdbImg = (id, size = "t_cover_big") => (id ? `https://images.igdb.com/igdb/image/upload/${size}/${id}.jpg` : "");
async function igdbQ(endpoint, body, signal) {
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
function igdbFields(g) {
    const plats = (g.platforms || []).map(p => p.name),
        dev = (g.involved_companies || [])
            .filter(c => c.developer)
            .map(c => c.company && c.company.name)
            .filter(Boolean);
    const art = (g.artworks || [])[0] || (g.screenshots || [])[0];
    return {
        src: "igdb",
        medium: "game",
        title: g.name,
        year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
        cover: igdbImg(g.cover && g.cover.image_id),
        banner: art ? igdbImg(art.image_id, "t_1080p") : "",
        genres: (g.genres || []).map(x => x.name.replace(/ \(.*\)$/, "")),
        themes: (g.themes || []).map(x => x.name),
        platforms: plats,
        creator: (dev.length
            ? dev
            : (g.involved_companies || []).filter(c => c.publisher).map(c => c.company && c.company.name)
        )
            .slice(0, 2)
            .join(" & "),
        about: (g.summary || g.storyline || "").slice(0, 900),
        series: ((g.collections || [])[0] || (g.franchises || [])[0] || {}).name || undefined,
        kind:
            plats.length && plats.every(x => /iOS|Android/.test(x))
                ? "Mobile"
                : plats.length === 1 && /Web/.test(plats[0])
                  ? "Browser"
                  : "Console & PC",
        ext: { igdb: g.id, igdbSlug: g.slug },
        scores: {
            igdb: g.total_rating ? Math.round(g.total_rating) : undefined,
            critics: g.aggregated_rating ? Math.round(g.aggregated_rating) : undefined,
        },
        popularity: g.total_rating_count || 0,
    };
}
async function igdbSearch(q, signal) {
    const r = await igdbQ("games", `search "${String(q).replace(/"/g, "")}"; fields ${IGDB_GAME}; limit 14;`, signal);
    return (r || []).map(igdbFields);
}
async function igdbDetails(id, signal) {
    const [g] = await igdbQ("games", `fields ${IGDB_GAME}; where id = ${Number(id)};`, signal);
    if (!g) return {};
    const f = igdbFields(g);
    // how long it takes, if IGDB knows (seconds → hours)
    try {
        const [t] = await igdbQ(
            "game_time_to_beats",
            `fields normally,hastily,completely; where game_id = ${Number(id)};`,
            signal
        );
        if (t && (t.normally || t.hastily)) f.total = Math.round((t.normally || t.hastily) / 3600);
    } catch (_) {}
    return f;
}
// the right game among similar names: same title first, then the year
function igdbPick(R, b) {
    const t = norm(cleanTitle(b.title)),
        y = b.year;
    const sc = r =>
        (norm(cleanTitle(r.title)) === t ? 3 : norm(cleanTitle(r.title)).startsWith(t) ? 1 : 0) +
        (y && r.year ? (r.year === y ? 2 : Math.abs(r.year - y) <= 1 ? 1 : -1) : 0) +
        Math.min(1, (r.popularity || 0) / 200);
    const best = R.map(r => [r, sc(r)]).sort((a, c) => c[1] - a[1])[0];
    return best && best[1] >= 2 ? best[0] : null;
}
async function igdbFind(b, signal) {
    if ((b.ext || {}).igdb) return b.ext.igdb;
    const r = igdbPick(await igdbSearch(cleanTitle(b.title), signal), b);
    return r ? r.ext.igdb : null;
}
async function igdbCharacters(id, signal) {
    const r = await igdbQ(
        "characters",
        `fields name,mug_shot.image_id,description,gender; where games = (${Number(id)}); limit 60;`,
        signal
    );
    return (r || []).map(c => ({
        src: "igdb",
        name: c.name,
        image: igdbImg(c.mug_shot && c.mug_shot.image_id, "t_cover_big"),
        role: "Character",
        about: (c.description || "").slice(0, 400),
        va: "",
    }));
}
async function igdbImages(id, signal) {
    const [g] = await igdbQ(
        "games",
        `fields cover.image_id,artworks.image_id,screenshots.image_id; where id = ${Number(id)};`,
        signal
    );
    if (!g) return [];
    return [
        ...(g.cover ? [{ cover: igdbImg(g.cover.image_id, "t_cover_big_2x"), label: "IGDB cover" }] : []),
        ...(g.artworks || []).map(a => ({ cover: igdbImg(a.image_id, "t_1080p"), label: "Artwork", wide: true })),
        ...(g.screenshots || [])
            .slice(0, 12)
            .map(a => ({ cover: igdbImg(a.image_id, "t_1080p"), label: "Screenshot", wide: true })),
    ];
}

// ── check and fix every game in one go, with whatever sources you have (IGDB, RAWG, Wikidata), and say what happened ──
const probeImg = url =>
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
const GU = { running: false, rows: [], done: 0, total: 0 };
async function gamesUpdate() {
    if (GU.running) return;
    const G = [...items.entries()].filter(([, b]) => b.medium === "game" && !b.private);
    Object.assign(GU, { running: true, rows: [], done: 0, total: G.length });
    if (ui.page === "settings") renderMain();
    for (const [id, b0] of G) {
        const row = { id, title: titleOf(b0), cover: "", from: "", chars: null, note: "" };
        try {
            let f = null,
                b = items.get(id);
            if (IGDB_ON()) {
                try {
                    const gid = await igdbFind(b);
                    if (gid) {
                        f = await igdbDetails(gid);
                        row.from = "IGDB";
                    }
                } catch (_) {}
            }
            if (!f && KEYS.rawg) {
                try {
                    const r = (b.ext || {}).rawg ? { ext: b.ext } : rawgPick(await rawgSearch(cleanTitle(b.title)), b);
                    if (r) {
                        f = await rawgDetails(r.ext.rawg);
                        row.from = "RAWG";
                    }
                } catch (_) {}
            }
            if (!f) {
                try {
                    const q = (b.ext || {}).wikidata || (await wdFind(b.title, "game", b.year));
                    if (q) {
                        f = (await wdDetails([q], undefined, "game")).get(q) || null;
                        if (f) row.from = "Wikidata";
                    }
                } catch (_) {}
            }
            b = items.get(id);
            const ok = !b.coverPicked && b.cover ? await probeImg(coverCache.src(b.cover)) : !!(b.cover || b.coverData);
            const fresh = f && (f.boxart || f.cover);
            if (fresh && !b.coverPicked && (!ok || (row.from === "IGDB" && !/igdb/.test(b.cover || "")))) {
                quietPatch(id, { cover: fresh, coverData: null, coverColor: null, color: null });
                row.cover = ok ? "replaced" : "added";
            } else row.cover = ok ? "fine" : "missing";
            if (f) {
                const cur = items.get(id),
                    p = { ext: { ...cur.ext, ...(f.ext || {}) } };
                for (const k of ["platforms", "genres", "total", "series"])
                    if (f[k] && !(Array.isArray(cur[k]) ? cur[k].length : cur[k])) p[k] = f[k];
                if (f.creator && (row.from === "IGDB" || !cur.creator) && !cur.creatorEdited) p.creator = f.creator;
                if (f.about && (!cur.about || /\bupcoming\b/i.test(cur.about))) p.about = f.about;
                quietPatch(id, p);
            }
            updateItemTiles(id);
            castCache.delete(id);
            try {
                row.chars = (await fetchCast(id)).filter(c => c.name).length;
            } catch (e) {
                row.chars = null;
                row.note = "characters timed out";
            }
        } catch (e) {
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
function gamesUpdateHTML() {
    const src = [IGDB_ON() ? "IGDB" : "", KEYS.rawg ? "RAWG" : "", "Wikidata"].filter(Boolean).join(", then ");
    return `<div class="panel"><h3>Your games</h3><p class="hint">Matches every game again (${esc(src)}), fixes covers that are missing or don't load, fills in platforms, developer and time to beat, and counts the characters it can find. Covers you picked yourself are left alone.</p>
    <div class="bar"><button class="btn" data-act="spines-update" ${SPN.running ? "disabled" : ""} title="ScreenScraper, through your proxy">${SPN.running ? `Spines: ${SPN.done} of ${SPN.total}…` : "Find real spines"}</button><button class="btn" data-act="games-update" ${GU.running ? "disabled" : ""}>${GU.running ? `Checking ${GU.done} of ${GU.total}…` : "Check and fix my games"}</button>${!IGDB_ON() ? `<span class="hint">Characters for most games need IGDB (see Your own keys below).</span>` : ""}</div>
    ${lbPanelHTML()}
    ${GU.rows.length ? `<div class="tablewrap"><table class="lib small"><thead><tr><th>Game</th><th>Matched on</th><th>Cover</th><th>Characters</th></tr></thead><tbody>${GU.rows.map(r => `<tr><td><button class="linkbtn" data-act="open" data-id="${esc(r.id)}">${esc(r.title)}</button></td><td>${esc(r.from || "nowhere")}</td><td class="${r.cover === "missing" ? "bad" : ""}">${esc(r.cover)}</td><td class="${r.chars ? "" : "bad"}">${r.chars == null ? esc(r.note || "–") : r.chars}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>`;
}
document.addEventListener("click", e => {
    if (e.target.closest('[data-act="games-update"]')) {
        e.preventDefault();
        gamesUpdate();
    }
    if (e.target.closest('[data-act="spines-update"]')) {
        e.preventDefault();
        spinesUpdate();
    }
});
