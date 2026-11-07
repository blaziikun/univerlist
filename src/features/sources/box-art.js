// src/features/sources/box-art.js
// ─────────────────────────────────────────────────────────────────
//  Artwork, part two: proper box art for games (as Backloggd shows) and more book covers
//
//  Without IGDB, game covers come from: Steam's portrait library art, then the box art on the game's Wikipedia page,
//  and only then RAWG's picture (which is a screenshot, not a cover). Books add Apple Books, whose covers are large and
//  current.
// ─────────────────────────────────────────────────────────────────

const isShot = u => /media\.rawg\.io\/media\/(games|screenshots)\//.test(u || "");
async function wikiBoxArt(b, signal) {
    let title = (b.ext || {}).wiki
        ? decodeURIComponent(String(b.ext.wiki).split("/wiki/").pop()).replace(/_/g, " ")
        : "";
    if (!title) {
        try {
            const P = (await wikiLeadImage([`${b.title} (video game)`, b.title], signal)).filter(
                p => p.src && (!p.w || p.h / p.w > 1.05)
            );
            if (P.length) return P[0].src;
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (!title) {
        const j = await getJSON(
            "https://en.wikipedia.org/w/api.php?" +
                new URLSearchParams({
                    action: "query",
                    list: "search",
                    srsearch: `${cleanTitle(b.title)} ${b.year || ""} video game`,
                    srlimit: "5",
                    format: "json",
                    origin: "*",
                }),
            signal
        );
        const hits = (j.query && j.query.search) || [],
            t = norm(cleanTitle(b.title));
        const hit =
            hits.find(h => norm(h.title.replace(/\s*\(.*\)$/, "")) === t && /game/i.test(h.snippet || "")) ||
            hits.find(h => norm(h.title.replace(/\s*\(.*\)$/, "")) === t) ||
            hits.find(h => norm(h.title).startsWith(t) && /video game/i.test(h.snippet || ""));
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
    const p = Object.values((j.query && j.query.pages) || {})[0] || {},
        src = (p.thumbnail && p.thumbnail.source) || (p.original && p.original.source) || "";
    // logos and screenshots are wide; box art is upright
    const w = (p.original || p.thumbnail || {}).width,
        h = (p.original || p.thumbnail || {}).height;
    return src && (!w || !h || h / w > 1.05) ? src : "";
}
async function gameBoxArt(b, signal) {
    const e = b.ext || {},
        mobile =
            /Mobile/.test(b.kind || "") ||
            ((b.platforms || []).length && (b.platforms || []).every(p => /iOS|Android|iPhone|iPad/i.test(p)));
    if (mobile) {
        try {
            const u = await appStoreIcon(b, signal);
            if (u) return { cover: u, from: "App Store" };
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (e.steam) {
        const u = `https://cdn.cloudflare.steamstatic.com/steam/apps/${e.steam}/library_600x900_2x.jpg`;
        if (await probeImg(u)) return { cover: u, from: "Steam" };
    }
    try {
        const u = await wikiBoxArt(b, signal);
        if (u) return { cover: u, from: "Wikipedia" };
    } catch (x) {
        if (x.name === "AbortError") throw x;
    }
    return null;
}
// a game whose cover is missing or is really a screenshot gets proper box art (never one you picked yourself)
async function upgradeGameCover(id, signal) {
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
setTimeout(() => {
    try {
        gameCoverSweep();
    } catch (_) {}
}, 9000);
// Apple Books: large, current covers for novels, manga and light novels
async function appleBookCovers(b, signal) {
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
    return (j.results || [])
        .filter(
            r =>
                r.artworkUrl100 &&
                norm(r.trackName || "").startsWith(norm(t).slice(0, 24)) &&
                (!sn || norm(r.artistName || "").includes(sn))
        )
        .map(r => ({
            cover: r.artworkUrl100.replace(/\/\d+x\d+bb\./, "/1000x1500bb."),
            label: "Apple Books" + (r.releaseDate ? ", " + r.releaseDate.slice(0, 4) : ""),
        }));
}

// old browser and flash games, arcade and DOS games: the Internet Archive's software collections (preserved and playable there)
async function archiveGames(q, signal) {
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
    return ((j.response || {}).docs || []).map(d => ({
        src: "archive",
        medium: "game",
        title: String(d.title || d.identifier),
        year: d.year ? +String(d.year).slice(0, 4) : null,
        creator: [].concat(d.creator || [])[0] || "",
        kind: [].concat(d.collection || []).some(c => /flash/.test(c)) ? "Browser" : "Console & PC",
        cover: `https://archive.org/services/img/${d.identifier}`,
        ext: { archive: d.identifier },
        platforms: [].concat(d.collection || []).some(c => /flash/.test(c)) ? ["Web browser (Flash)"] : [],
    }));
}

// Apple's search answers browsers inconsistently, so if a normal request is refused it's asked again the old way (JSONP)
async function itunesJSON(params, signal) {
    const url = "https://itunes.apple.com/search?" + new URLSearchParams(params);
    try {
        return await getJSON(url, signal, { timeout: 8000 });
    } catch (e) {
        if (e.name === "AbortError") throw e;
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
                delete window[cb];
            } catch (_) {}
            s.remove();
        }
        window[cb] = d => {
            done();
            res(d);
        };
        s.onerror = () => {
            done();
            rej(new Error("jsonp"));
        };
        s.src = url + "&callback=" + cb;
        document.head.append(s);
    });
}
// a page's lead image, any licence (box art and book covers are non-free images, so they need "any")
async function wikiLeadImage(titles, signal) {
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
    return Object.values((j.query && j.query.pages) || {})
        .filter(p => !p.missing && p.pageid)
        .map(p => ({
            title: p.title,
            src: (p.thumbnail || {}).source || (p.original || {}).source || "",
            w: (p.original || p.thumbnail || {}).width,
            h: (p.original || p.thumbnail || {}).height,
        }));
}
async function wikiSearch(q, signal, n = 5) {
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
    return (j.query && j.query.search) || [];
}
// a book's cover from its Wikipedia article ("Eight Detectives" → the first-edition cover)
async function wikiBookCover(b, signal) {
    const t = cleanTitle(b.title),
        sur = surname(b.creator || "");
    let P = (await wikiLeadImage([`${t} (novel)`, `${t} (book)`, t], signal)).filter(
        p => p.src && (!p.w || p.h / p.w > 1.1)
    );
    if (!P.length) {
        const hits = (await wikiSearch(`${t} ${b.creator || ""} novel`, signal)).filter(
            h => norm(h.title).startsWith(norm(t)) && (!sur || norm(h.snippet || "").includes(norm(sur)))
        );
        if (hits.length) P = (await wikiLeadImage([hits[0].title], signal)).filter(p => p.src);
    }
    return P[0] ? P[0].src : "";
}
// mobile games: the App Store icon is what Backloggd and the stores show
async function appStoreIcon(b, signal) {
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
        c = norm(cleanTitle(b.title));
    const r =
        (j.results || []).find(x => idTitle(x.trackName) === t) ||
        (j.results || []).find(x => norm(x.trackName).startsWith(c));
    return r ? (r.artworkUrl512 || r.artworkUrl100 || "").replace(/\/\d+x\d+bb\./, "/600x600bb.") : "";
}
// characters from live-action shows: the character's own article (it usually leads with a still of them in the role)
async function wikiCharImage(name, work, signal) {
    const hits = await wikiSearch(`"${name}" ${work} character`, signal, 4),
        first = norm(name).split(" ")[0];
    const h =
        hits.find(x => norm(x.title).includes(first) && /character|fictional/i.test(x.snippet || "")) ||
        hits.find(x => norm(x.title).startsWith(norm(name)));
    if (!h) return "";
    const P = await wikiLeadImage([h.title], signal);
    return (P[0] && P[0].src) || "";
}
