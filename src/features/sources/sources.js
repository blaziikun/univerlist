// src/features/sources/sources.js
// ─────────────────────────────────────────────────────────────────
//  Data sources
//
//  Keyless: AniList, Jikan (MyAnimeList), TVmaze, Wikidata + Wikipedia, Open Library, Google Books.
//  Optional free keys: TMDB (film and TV), OMDb (IMDb / Rotten Tomatoes / Metacritic scores), RAWG (games).
// ─────────────────────────────────────────────────────────────────

async function getJSON(url, signal, opts = {}) {
    const ms = opts.timeout || (/query\.wikidata/.test(url) ? 30000 : 20000);
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
        const t = AbortSignal.timeout(ms);
        signal = signal && AbortSignal.any ? AbortSignal.any([signal, t]) : signal || t;
    }
    const r = await fetch(url, {
        signal,
        headers: { Accept: "application/json", ...(opts.headers || {}) },
        method: opts.method || "GET",
        body: opts.body,
        cache: opts.cache,
    });
    if (r.status === 429) {
        const e = new Error("rate");
        e.rate = true;
        throw e;
    }
    if (r.status === 401 || r.status === 403) {
        const e = new Error("auth");
        e.auth = true;
        throw e;
    }
    if (!r.ok) {
        const e = new Error(String(r.status));
        e.status = r.status;
        throw e;
    }
    return r.json();
}
const yearOf = d => {
    const y = parseInt(String(d || ""), 10);
    return y > 1000 && y < 3000 ? y : null;
};

// ── AniList (GraphQL, no key; 30 requests a minute while AniList is in degraded mode) ──
const AL = {
    last: 0,
    gap: 2150,
    // now: something you're waiting on (a page you just opened) goes ahead of the background queue, a few at a time
    async q(query, variables = {}, signal, tries = 0, now = false) {
        const wait = now ? ((this.burst = (this.burst || 0) + 1) > 6 ? 700 : 0) : this.last + this.gap - Date.now();
        if (wait > 0) await sleep(wait);
        if (now)
            setTimeout(() => {
                this.burst = Math.max(0, (this.burst || 0) - 1);
            }, 20000);
        this.last = Date.now();
        let r;
        try {
            r = await fetch("https://graphql.anilist.co", {
                method: "POST",
                signal,
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ query, variables }),
            });
        } catch (e) {
            if (e.name === "AbortError") throw e;
            const x = new Error("offline");
            x.offline = true;
            throw x;
        }
        if (r.status === 429 && tries < 3) {
            AL.onWait && AL.onWait(61);
            await sleep(61000);
            return this.q(query, variables, signal, tries + 1, now);
        }
        // AniList's servers sometimes answer 500 under load; try again after a pause before giving up
        if (r.status >= 500 && tries < 2) {
            AL.onRetry && AL.onRetry(tries + 1);
            await sleep(tries ? 9000 : 3500);
            return this.q(query, variables, signal, tries + 1, now);
        }
        let j = null;
        try {
            j = await r.json();
        } catch (_) {}
        if (!j || (!j.data && j.errors) || !r.ok) {
            const msg = j && j.errors && j.errors[0] ? j.errors[0].message : "AniList " + r.status;
            const e = new Error(msg);
            e.status = r.status;
            e.server = r.status >= 500 || /internal server error/i.test(msg);
            throw e;
        }
        return j.data;
    },
};
const AL_MEDIA = `id idMal type format status episodes chapters volumes duration averageScore meanScore popularity genres countryOfOrigin isAdult season seasonYear synonyms
  title { romaji english native } coverImage { extraLarge large color } bannerImage startDate { year month day } nextAiringEpisode { episode airingAt } siteUrl
  tags { name rank isMediaSpoiler } studios(isMain: true) { nodes { name } }`;
const AL_MEDIA_LITE = `id idMal type format status episodes chapters volumes duration averageScore genres countryOfOrigin isAdult
  title { romaji english native } coverImage { large color } bannerImage startDate { year month day } nextAiringEpisode { episode airingAt }`;
const AL_DETAIL = `id description(asHtml: false) staff(perPage: 6, sort: [RELEVANCE]) { edges { role node { name { full } } } }
  relations { edges { relationType(version: 2) node { id idMal type format status episodes chapters countryOfOrigin title { romaji english native } coverImage { large color } startDate { year } } } }`;
function alMedium(m) {
    if (m.type === "ANIME") return "anime";
    if (m.format === "NOVEL") return "novel";
    if (["KR"].includes(m.countryOfOrigin)) return "manhwa";
    if (["CN", "TW"].includes(m.countryOfOrigin)) return "manhwa";
    return "manga";
}
function alKind(m) {
    if (m.type === "ANIME")
        return (
            {
                TV: "TV",
                TV_SHORT: "Short",
                MOVIE: "Movie",
                SPECIAL: "Special",
                OVA: "OVA",
                ONA: "ONA",
                MUSIC: "Special",
            }[m.format] || "TV"
        );
    if (m.format === "NOVEL") return "Light novel";
    if (m.format === "ONE_SHOT") return "One-shot";
    if (["CN", "TW"].includes(m.countryOfOrigin)) return "Manhua";
    if (m.countryOfOrigin === "KR") return "Manhwa";
    return "Manga";
}
const AL_REL = {
    ADAPTATION: "adaptation",
    SOURCE: "adaptation",
    SEQUEL: "sequel",
    PREQUEL: "prequel",
    SIDE_STORY: "side",
    SPIN_OFF: "side",
    PARENT: "world",
    ALTERNATIVE: "world",
    SUMMARY: "world",
    COMPILATION: "world",
    CONTAINS: "world",
    CHARACTER: "world",
    OTHER: "world",
};
const AL_REL_LABEL = {
    ADAPTATION: "Adaptation",
    SOURCE: "Source",
    SEQUEL: "Sequel",
    PREQUEL: "Prequel",
    SIDE_STORY: "Side story",
    SPIN_OFF: "Spin-off",
    PARENT: "Parent story",
    ALTERNATIVE: "Alternative version",
    SUMMARY: "Summary",
    COMPILATION: "Compilation",
    CONTAINS: "Contains",
    CHARACTER: "Shares characters",
    OTHER: "Related",
};
function alToFields(m) {
    const medium = alMedium(m),
        studio = m.studios && m.studios.nodes && m.studios.nodes[0];
    const f = {
        medium,
        kind: alKind(m),
        title: m.title.english || m.title.romaji,
        alt: { en: m.title.english || "", romaji: m.title.romaji || "", native: m.title.native || "" },
        year: (m.startDate && m.startDate.year) || m.seasonYear || null,
        cover: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || "",
        banner: m.bannerImage || "",
        color: (m.coverImage && m.coverImage.color) || null,
        total: (medium === "anime" ? m.episodes : m.chapters) || null,
        vols: m.volumes || null,
        runtime: m.duration || null,
        genres: m.genres || [],
        themes: (m.tags || [])
            .filter(t => t.rank >= 60 && !t.isMediaSpoiler)
            .slice(0, 8)
            .map(t => t.name),
        flag: !!m.isAdult,
        airStatus: m.status || null,
        airing: m.nextAiringEpisode
            ? { ep: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt * 1000 }
            : null,
        ext: { anilist: m.id, mal: m.idMal || undefined },
        scores: { anilist: m.averageScore || undefined },
        popularity: m.popularity || 0,
    };
    if (studio) f.creator = studio.name;
    if (m.season && m.seasonYear) f.season = m.season.charAt(0) + m.season.slice(1).toLowerCase() + " " + m.seasonYear;
    return f;
}
function alDetailFields(d) {
    const f = {};
    if (d.description) f.about = stripMd(d.description).slice(0, 900);
    const staff = ((d.staff && d.staff.edges) || [])
        .filter(e => /story|original creator|author|art/i.test(e.role))
        .map(e => e.node.name.full);
    if (staff.length) f.creatorPeople = [...new Set(staff)].slice(0, 3);
    f.rel = ((d.relations && d.relations.edges) || []).map(e => ({
        src: "anilist",
        id: e.node.id,
        type: AL_REL[e.relationType] || "world",
        label: AL_REL_LABEL[e.relationType] || "Related",
        medium: alMedium(e.node),
        kind: alKind(e.node),
        title: e.node.title.english || e.node.title.romaji,
        cover: (e.node.coverImage && e.node.coverImage.large) || "",
        year: e.node.startDate && e.node.startDate.year,
        mal: e.node.idMal || undefined,
    }));
    return f;
}
async function alSearch(q, medium, signal) {
    const type = medium === "anime" ? "ANIME" : "MANGA";
    const fl = ui.private ? "" : ", isAdult: false";
    const d = await AL.q(
        `query($q:String,$type:MediaType){ Page(perPage: 15){ media(search:$q, type:$type${fl}, sort:[SEARCH_MATCH, POPULARITY_DESC]){ ${AL_MEDIA} } } }`,
        { q, type },
        signal
    );
    const list = (d.Page.media || []).map(m => ({ src: "anilist", ...alToFields(m) }));
    return list.sort((a, b) => (b.medium === medium) - (a.medium === medium));
}
const AL_DETAIL_LITE = `id description(asHtml: false) relations { edges { relationType(version: 2) node { id idMal type format countryOfOrigin title { romaji english native } coverImage { large } startDate { year } } } }`;
async function alDetails(ids, signal, size = 10) {
    const out = new Map();
    for (let i = 0; i < ids.length; i += size) {
        const chunk = ids.slice(i, i + size);
        let d;
        try {
            d = await AL.q(
                `query($ids:[Int]){ Page(perPage: ${size}){ media(id_in:$ids){ ${AL_MEDIA} ${AL_DETAIL} } } }`,
                { ids: chunk },
                signal
            );
        } catch (e) {
            if (!e.server) throw e;
            // smaller, lighter request; skip the chunk if AniList still can't answer
            try {
                d = { Page: { media: [] } };
                for (const id of chunk) {
                    const x = await AL.q(
                        `query($id:Int){ Media(id:$id){ ${AL_MEDIA_LITE} ${AL_DETAIL_LITE} } }`,
                        { id },
                        signal
                    );
                    if (x.Media) d.Page.media.push(x.Media);
                }
            } catch (e2) {
                if (!e2.server) throw e2;
                continue;
            }
        }
        for (const m of d.Page.media || []) out.set(m.id, { ...alToFields(m), ...alDetailFields(m) });
    }
    return out;
}
async function alCharacters(alId, signal) {
    const d = await AL.q(
        `query($id:Int){ Media(id:$id){ characters(sort:[ROLE, RELEVANCE, ID], perPage: 18){ edges { role node { id name { full native } image { large } favourites } voiceActors(language: JAPANESE, sort: [RELEVANCE]) { name { full } image { large } } } } } }`,
        { id: alId },
        signal
    );
    return (d.Media.characters.edges || []).map(e => ({
        src: "anilist",
        alId: e.node.id,
        name: e.node.name.full,
        native: e.node.name.native || "",
        image: (e.node.image && e.node.image.large) || "",
        role: e.role === "MAIN" ? "Main" : e.role === "SUPPORTING" ? "Supporting" : "Background",
        va: e.voiceActors && e.voiceActors[0] ? e.voiceActors[0].name.full : "",
        vaImage: e.voiceActors && e.voiceActors[0] && e.voiceActors[0].image ? e.voiceActors[0].image.large : "",
        fans: e.node.favourites || 0,
    }));
}
async function alCharSearch(q, signal) {
    const d = await AL.q(
        `query($q:String){ Page(perPage: 12){ characters(search:$q, sort:[SEARCH_MATCH, FAVOURITES_DESC]){ id name { full native } image { large } gender age description(asHtml:false) media(perPage: 3, sort:[POPULARITY_DESC]){ nodes { id type format countryOfOrigin title { english romaji } } } } } }`,
        { q },
        signal
    );
    return (d.Page.characters || []).map(c => charFromAL(c));
}
function charFromAL(c) {
    const media = ((c.media && c.media.nodes) || []).map(m => ({
        alId: m.id,
        title: m.title.english || m.title.romaji,
        medium: alMedium(m),
    }));
    return {
        src: "anilist",
        alId: c.id,
        name: c.name.full,
        native: c.name.native || "",
        image: (c.image && c.image.large) || "",
        gender: c.gender || "",
        age: c.age || "",
        about: stripMd(c.description || "").slice(0, 700),
        media,
    };
}
async function alRecommendations(alId, signal) {
    const d = await AL.q(
        `query($id:Int){ Media(id:$id){ recommendations(perPage: 12, sort:[RATING_DESC]){ nodes { rating mediaRecommendation { ${AL_MEDIA} } } } } }`,
        { id: alId },
        signal
    );
    return (d.Media.recommendations.nodes || [])
        .filter(n => n.mediaRecommendation)
        .map(n => ({ votes: n.rating, ...alToFields(n.mediaRecommendation) }));
}

// ── Jikan (MyAnimeList scores, no key) ──
const JK = { last: 0, gap: 1150 };
async function jikanScore(type, malId, signal) {
    const wait = JK.last + JK.gap - Date.now();
    if (wait > 0) await sleep(wait);
    JK.last = Date.now();
    const j = await getJSON(`https://api.jikan.moe/v4/${type}/${malId}`, signal);
    return j.data
        ? { mal: j.data.score || undefined, malRank: j.data.rank || undefined, malMembers: j.data.members || undefined }
        : {};
}
// MyAnimeList by title, when AniList can't place something
async function jikanSearch(q, type, signal) {
    const wait = JK.last + JK.gap - Date.now();
    if (wait > 0) await sleep(wait);
    JK.last = Date.now();
    const j = await getJSON(
        `https://api.jikan.moe/v4/${type}?${new URLSearchParams({ q, limit: "8", sfw: ui.private ? "false" : "true" })}`,
        signal
    );
    return (j.data || []).map(d => ({
        title: d.title_english || d.title,
        alt: { romaji: d.title, en: d.title_english || "", native: d.title_japanese || "" },
        year: d.year || (d.aired && d.aired.prop && d.aired.prop.from && d.aired.prop.from.year) || null,
        kind: d.type === "Movie" ? "Movie" : d.type || "",
        cover: (d.images && d.images.jpg && (d.images.jpg.large_image_url || d.images.jpg.image_url)) || "",
        about: (d.synopsis || "").replace(/\s*\[Written by MAL Rewrite\]\s*$/, ""),
        genres: (d.genres || []).map(g => g.name),
        runtime:
            d.duration && /(\d+) min/.test(d.duration)
                ? +/(\d+) min/.exec(d.duration)[1] * (/hr/.test(d.duration) ? 1 : 1)
                : null,
        ext: { mal: d.mal_id },
    }));
}
async function jikanPictures(type, malId, signal) {
    const j = await getJSON(`https://api.jikan.moe/v4/${type}/${malId}/pictures`, signal);
    return (j.data || []).map(p => (p.jpg && (p.jpg.large_image_url || p.jpg.image_url)) || "").filter(Boolean);
}

// ── TVmaze (TV, no key) ──
function tvmazeKind(s) {
    const lang = s.language || "";
    if (lang === "Korean") return "K-drama";
    if (lang === "Chinese") return "C-drama";
    if (lang === "Japanese" && s.type === "Scripted") return "J-drama";
    if (s.type === "Documentary") return "Documentary";
    if (s.type === "Animation")
        return /stop.?motion|claymation/i.test(s.summary || "") ? "Stop-motion" : "Western animation";
    if (s.type === "Reality") return "Reality";
    return "Live action";
}
function tvmazeFields(s) {
    const ep = s._embedded || {};
    const f = {
        src: "tvmaze",
        medium: "tv",
        kind: tvmazeKind(s),
        title: s.name,
        year: yearOf(s.premiered),
        cover: s.image ? s.image.original || s.image.medium : "",
        runtime: s.averageRuntime || s.runtime || null,
        genres: s.genres || [],
        about: stripMd(s.summary || "").slice(0, 900),
        creator: (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || "",
        airStatus: s.status === "Running" ? "RELEASING" : s.status === "Ended" ? "FINISHED" : s.status,
        ext: { tvmaze: s.id, imdb: (s.externals && s.externals.imdb) || undefined },
        scores: { tvmaze: (s.rating && s.rating.average) || undefined },
        country: (s.network && s.network.country && s.network.country.code) || "",
    };
    if (ep.episodes) f.total = ep.episodes.length;
    if (ep.nextepisode && ep.nextepisode.airstamp)
        f.airing = {
            ep: ep.nextepisode.number,
            season: ep.nextepisode.season,
            at: Date.parse(ep.nextepisode.airstamp),
        };
    if (ep.cast)
        f.cast = ep.cast.slice(0, 18).map(c => ({
            src: "tvmaze",
            name: (c.character && c.character.name) || "",
            image: (c.character && c.character.image && (c.character.image.original || c.character.image.medium)) || "",
            va: c.person.name,
            vaImage: c.person.image ? c.person.image.medium || c.person.image.original : "",
            role: "Cast",
        }));
    return f;
}
async function tvmazeSearch(q, signal) {
    return (await getJSON("https://api.tvmaze.com/search/shows?" + new URLSearchParams({ q }), signal))
        .slice(0, 12)
        .map(r => tvmazeFields(r.show));
}
// the right show among same-named ones: same title and year beats a loose match
function pickShow(R, b) {
    const t = norm(cleanTitle(b.title)),
        y = b.year;
    const sc = r =>
        (norm(cleanTitle(r.title)) === t ? 2 : norm(cleanTitle(r.title)).includes(t) ? 1 : 0) +
        (y && r.year ? (r.year === y ? 2 : Math.abs(r.year - y) <= 1 ? 1 : -2) : 0);
    const best = R.map(r => [r, sc(r)]).sort((a, c) => c[1] - a[1])[0];
    return best && best[1] >= 1 ? best[0] : null;
}
async function tvmazeShow(id, signal) {
    return tvmazeFields(
        await getJSON(`https://api.tvmaze.com/shows/${id}?embed[]=nextepisode&embed[]=episodes&embed[]=cast`, signal)
    );
}
async function tvmazeByImdb(imdb, signal) {
    const s = await getJSON("https://api.tvmaze.com/lookup/shows?" + new URLSearchParams({ imdb }), signal);
    return s && s.id ? tvmazeShow(s.id, signal) : null;
}
async function tvmazeImages(id, signal) {
    return (await getJSON(`https://api.tvmaze.com/shows/${id}/images`, signal))
        .filter(i => ["poster", "background", "banner"].includes(i.type))
        .map(i => ({
            cover: i.resolutions.original ? i.resolutions.original.url : i.resolutions.medium.url,
            label: i.type.charAt(0).toUpperCase() + i.type.slice(1),
            wide: i.type !== "poster",
        }));
}

// ── Wikidata + Wikipedia (film, TV, games, comics; no key) ──
const WD_MEDIUM = {
    film: /\b(film|movie)\b(?! series| franchise| director| producer| actor| studio| festival| score| character)/i,
    tv: /(television|tv|web|drama|anime) (series|drama|programme|program|show)|miniseries|sitcom|soap opera|k-drama/i,
    game: /video game|computer game|mobile game|game for/i,
    comic: /comic|graphic novel|webcomic|comic book/i,
    book: /\b(novel|book|novella|memoir|short story collection|poem)\b/i,
    manga: /manga|manhwa|light novel/i,
    anime: /anime/i,
};
function wdMediumOf(desc) {
    for (const k of ["game", "anime", "manga", "tv", "film", "comic", "book"])
        if (WD_MEDIUM[k].test(desc || "")) return k;
    return null;
}
async function wdSearch(q, medium, signal) {
    const j = await getJSON(
        "https://www.wikidata.org/w/api.php?" +
            new URLSearchParams({
                action: "wbsearchentities",
                search: q,
                language: "en",
                uselang: "en",
                type: "item",
                limit: "20",
                format: "json",
                origin: "*",
            }),
        signal
    );
    const hits = (j.search || []).filter(h => !medium || WD_MEDIUM[medium].test(h.description || "")).slice(0, 10);
    if (!hits.length) return [];
    const det = await wdDetails(
        hits.map(h => h.id),
        signal,
        medium
    );
    return hits.map(h => ({
        ...(det.get(h.id) || {}),
        kind: medium === "film" ? (det.get(h.id) || {}).filmKind || "" : undefined,
        src: "wikidata",
        medium,
        title: (det.get(h.id) || {}).title || h.label,
        about: (det.get(h.id) || {}).about || h.description || "",
        desc: h.description || "",
    }));
}
function parseScores(rows) {
    const s = {};
    for (const [by, v] of rows) {
        const val = String(v);
        let m;
        if (/rotten/i.test(by) && !s.rt && (m = /(\d+)\s*%/.exec(val))) s.rt = parseInt(m[1], 10);
        else if (/metacritic/i.test(by) && !s.meta && (m = /(\d+)\s*\/\s*100/.exec(val))) s.meta = parseInt(m[1], 10);
        else if (/imdb/i.test(by) && !s.imdb && (m = /(\d+(?:\.\d)?)\s*\/\s*10/.exec(val))) s.imdb = parseFloat(m[1]);
    }
    return s;
}
// who made it depends on the medium: a film's director (P57), a show's creator (P170), a game's developer (P178), a book's author (P50).
// (Composers, P86, used to slip in here, which is how Good Will Hunting got the wrong "director".)
const WD_ROLE = {
    film: ["dir", "creator"],
    tv: ["creator", "dir"],
    game: ["dev"],
    book: ["author", "creator"],
    comic: ["author", "creator"],
    manga: ["author", "creator"],
};
async function wdDetails(qids, signal, medium) {
    const query = `SELECT ?item ?itemLabel ?date ?dur ?imdb ?creatorLabel ?crole ?genreLabel ?countryLabel ?article ?score ?byLabel ?eps ?platLabel ?steam ?wimg WHERE {
    VALUES ?item { ${qids.map(q => "wd:" + q).join(" ")} }
    OPTIONAL { ?item wdt:P577 ?date } OPTIONAL { ?item wdt:P2047 ?dur } OPTIONAL { ?item wdt:P345 ?imdb } OPTIONAL { ?item wdt:P1113 ?eps }
    OPTIONAL { { ?item wdt:P57 ?creator . BIND("dir" AS ?crole) } UNION { ?item wdt:P170 ?creator . BIND("creator" AS ?crole) } UNION { ?item wdt:P178 ?creator . BIND("dev" AS ?crole) } UNION { ?item wdt:P50 ?creator . BIND("author" AS ?crole) } }
    OPTIONAL { ?item wdt:P136 ?genre } OPTIONAL { ?item wdt:P495 ?country }${medium === "game" ? " OPTIONAL { ?item wdt:P400 ?plat } OPTIONAL { ?item wdt:P1733 ?steam } OPTIONAL { ?item wdt:P18|wdt:P154 ?wimg }" : ""}
    OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
    OPTIONAL { ?item p:P444 ?st . ?st ps:P444 ?score ; pq:P447 ?by }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 3000`;
    const j = await getJSON(
        "https://query.wikidata.org/sparql?" + new URLSearchParams({ format: "json", query }),
        signal
    );
    const map = new Map();
    for (const r of j.results.bindings) {
        const q = r.item.value.split("/").pop();
        const e = map.get(q) || {
            title: r.itemLabel && r.itemLabel.value,
            years: [],
            dur: null,
            imdb: null,
            creators: {},
            genres: new Set(),
            article: null,
            scoreRows: [],
            eps: null,
            country: "",
            plats: new Set(),
            steam: null,
            wimg: "",
        };
        if (r.countryLabel && !e.country) e.country = r.countryLabel.value;
        if (r.platLabel && !/^Q\d+$/.test(r.platLabel.value)) e.plats.add(r.platLabel.value);
        if (r.steam && !e.steam) e.steam = r.steam.value;
        if (r.wimg && !e.wimg) e.wimg = r.wimg.value;
        if (r.date) e.years.push(yearOf(r.date.value));
        if (r.dur && !e.dur) e.dur = Math.round(parseFloat(r.dur.value));
        if (r.imdb && !e.imdb) e.imdb = r.imdb.value;
        if (r.eps && !e.eps) e.eps = parseInt(r.eps.value, 10);
        if (r.creatorLabel && !/^Q\d+$/.test(r.creatorLabel.value)) {
            const k = r.crole ? r.crole.value : "creator";
            (e.creators[k] = e.creators[k] || new Set()).add(r.creatorLabel.value);
        }
        if (r.genreLabel && !/^Q\d+$/.test(r.genreLabel.value))
            e.genres.add(r.genreLabel.value.replace(/ (film|video game|television series)$/i, ""));
        if (r.article) e.article = decodeURIComponent(r.article.value.split("/wiki/").pop()).replace(/_/g, " ");
        if (r.score && r.byLabel) e.scoreRows.push([r.byLabel.value, r.score.value]);
        map.set(q, e);
    }
    const wiki = await wikiPages([...map.values()].map(e => e.article).filter(Boolean), signal).catch(() => new Map());
    const out = new Map();
    for (const [q, e] of map) {
        const w = e.article ? wiki.get(e.article) || {} : {};
        const roles = WD_ROLE[medium] || ["dir", "creator", "dev", "author"],
            who = roles.map(k => e.creators[k]).find(x => x && x.size);
        out.set(q, {
            title: e.title,
            year: e.years.filter(Boolean).sort()[0] || null,
            runtime: e.dur,
            total: e.eps,
            platforms: e.plats.size ? [...e.plats].slice(0, 8) : undefined,
            creator: who ? [...who].slice(0, 2).join(" & ") : "",
            genres: [...e.genres].slice(0, 6),
            cover:
                w.image ||
                (e.wimg ? commonsImg(e.wimg) : "") ||
                (e.steam ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${e.steam}/library_600x900_2x.jpg` : ""),
            about: w.extract || "",
            ext: { wikidata: q, imdb: e.imdb || undefined, wiki: e.article || undefined, steam: e.steam || undefined },
            scores: parseScores(e.scoreRows),
            filmKind: [...e.genres].some(g => /animat/i.test(g))
                ? "Animated"
                : [...e.genres].some(g => /documentary/i.test(g))
                  ? "Documentary"
                  : /United States|United Kingdom/.test(e.country)
                    ? "Hollywood"
                    : /India/.test(e.country)
                      ? "Bollywood"
                      : e.country
                        ? "World cinema"
                        : "",
        });
    }
    return out;
}
async function wikiPages(titles, signal) {
    const out = new Map();
    for (let i = 0; i < titles.length; i += 20) {
        const chunk = titles.slice(i, i + 20);
        const j = await getJSON(
            "https://en.wikipedia.org/w/api.php?" +
                new URLSearchParams({
                    action: "query",
                    prop: "pageimages|extracts",
                    titles: chunk.join("|"),
                    pithumbsize: "600",
                    pilicense: "any",
                    exintro: "1",
                    explaintext: "1",
                    exsentences: "4",
                    redirects: "1",
                    format: "json",
                    origin: "*",
                }),
            signal
        );
        const back = {};
        for (const r of (j.query && j.query.redirects) || []) back[r.to] = r.from;
        for (const r of (j.query && j.query.normalized) || []) back[r.to] = r.from;
        for (const p of Object.values((j.query && j.query.pages) || {})) {
            const key = back[back[p.title]] || back[p.title] || p.title;
            out.set(key, { image: p.thumbnail ? p.thumbnail.source : "", extract: (p.extract || "").slice(0, 900) });
            out.set(p.title, out.get(key));
        }
    }
    return out;
}
// works based on (or that are the basis of) a given Wikidata item
async function wdAdaptations(qids, signal) {
    const query = `SELECT ?src ?x ?xLabel ?xDesc ?dir WHERE {
    VALUES ?src { ${qids.map(q => "wd:" + q).join(" ")} }
    { ?x wdt:P144 ?src . BIND("from" AS ?dir) } UNION { ?src wdt:P144 ?x . BIND("to" AS ?dir) } UNION { ?x wdt:P8371 ?src . BIND("from" AS ?dir) }
    OPTIONAL { ?x schema:description ?xDesc FILTER(lang(?xDesc) = "en") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 400`;
    const j = await getJSON(
        "https://query.wikidata.org/sparql?" + new URLSearchParams({ format: "json", query }),
        signal
    );
    return j.results.bindings
        .map(r => ({
            src: r.src.value.split("/").pop(),
            qid: r.x.value.split("/").pop(),
            title: r.xLabel.value,
            desc: r.xDesc ? r.xDesc.value : "",
            dir: r.dir.value,
        }))
        .filter(r => !/^Q\d+$/.test(r.title));
}
async function wdFind(title, medium, year, signal) {
    const j = await getJSON(
        "https://www.wikidata.org/w/api.php?" +
            new URLSearchParams({
                action: "wbsearchentities",
                search: cleanTitle(title),
                language: "en",
                type: "item",
                limit: "12",
                format: "json",
                origin: "*",
            }),
        signal
    );
    const re = medium ? WD_MEDIUM[medium === "novel" || medium === "manhwa" ? "manga" : medium] : null;
    const hits = (j.search || []).filter(h => !re || re.test(h.description || ""));
    const y = year && hits.find(h => String(h.description || "").includes(String(year)));
    return (y || hits[0] || {}).id || null;
}

// ── iTunes catalogue (no key): film posters, directors, years, synopses ──
async function itunesFilms(q, signal) {
    const j = await itunesJSON(
        {
            term: q,
            media: "movie",
            entity: "movie",
            limit: "15",
            country: (meta.settings.region || "GB").toLowerCase(),
        },
        signal
    );
    return (j.results || [])
        .filter(r => r.kind === "feature-movie" || r.wrapperType === "track")
        .map(r => ({
            src: "itunes",
            medium: "film",
            title: r.trackName,
            year: yearOf(r.releaseDate),
            creator: r.artistName || "",
            cover: (r.artworkUrl100 || "").replace(/\/\d+x\d+bb\./, "/600x900bb."),
            about: (r.longDescription || r.shortDescription || "").slice(0, 900),
            genres: r.primaryGenreName ? [r.primaryGenreName] : [],
            runtime: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : null,
            ext: { itunes: r.trackId },
        }));
}
async function filmSearchKeyless(q, signal) {
    const [a, b] = await Promise.all([
        itunesFilms(q, signal).catch(e => {
            if (e.name === "AbortError") throw e;
            return [];
        }),
        wdSearch(q, "film", signal).catch(e => {
            if (e.name === "AbortError") throw e;
            return [];
        }),
    ]);
    // one entry per film: Wikidata's facts with iTunes' poster where they agree on title and year
    const out = [...b];
    for (const x of a) {
        const m = out.find(
            y =>
                norm(cleanTitle(y.title)) === norm(cleanTitle(x.title)) &&
                (!y.year || !x.year || Math.abs(y.year - x.year) <= 1)
        );
        if (m) {
            if (!m.cover) m.cover = x.cover;
            if (!m.about) m.about = x.about;
            if (!m.creator) m.creator = x.creator;
            if (!m.runtime) m.runtime = x.runtime;
            m.ext = { ...x.ext, ...m.ext };
        } else out.push(x);
    }
    return out.filter(x => ui.private || !x.flag).slice(0, 16);
}

// ── TMDB (optional free key) ──
const TMDB_IMG = (p, size = "w500") => (p ? `https://image.tmdb.org/t/p/${size}${p}` : "");
async function tmdb(path, params = {}, signal) {
    const key = KEYS.tmdb;
    if (!key) {
        if (!siteShares.tmdb) throw new Error("no-key");
        return getJSON(`${location.origin}/api/tmdb${path}?${new URLSearchParams(params)}`, signal);
    }
    const bearer = key.startsWith("eyJ");
    const u =
        "https://api.themoviedb.org/3" +
        path +
        "?" +
        new URLSearchParams({ ...params, ...(bearer ? {} : { api_key: key }) });
    return getJSON(u, signal, bearer ? { headers: { Authorization: "Bearer " + key } } : {});
}
function tmdbKind(r, type) {
    const lang = r.original_language,
        g = r.genre_ids || (r.genres || []).map(x => x.id);
    if (type === "movie")
        return g.includes(16)
            ? lang === "ja"
                ? "Anime film"
                : "Animated"
            : g.includes(99)
              ? "Documentary"
              : lang === "hi"
                ? "Bollywood"
                : ["ta", "te", "ml", "kn", "bn", "mr", "pa"].includes(lang)
                  ? "Indian cinema"
                  : lang === "en"
                    ? "Hollywood"
                    : "World cinema";
    if (lang === "ko") return "K-drama";
    if (lang === "zh") return "C-drama";
    if (lang === "ja" && !g.includes(16)) return "J-drama";
    if (g.includes(99)) return "Documentary";
    if (g.includes(16)) return "Western animation";
    if (g.includes(10764)) return "Reality";
    return "Live action";
}
function tmdbFields(r, type) {
    const g = r.genre_ids || (r.genres || []).map(x => x.id),
        isAnime = type === "tv" && r.original_language === "ja" && g.includes(16);
    return {
        src: "tmdb",
        medium: type === "movie" ? "film" : isAnime ? "anime" : "tv",
        kind: isAnime ? "TV" : tmdbKind(r, type),
        title: r.title || r.name,
        alt: { original: r.original_title || r.original_name || "" },
        year: yearOf(r.release_date || r.first_air_date),
        cover: TMDB_IMG(r.poster_path),
        banner: TMDB_IMG(r.backdrop_path, "w1280"),
        about: r.overview || "",
        ext: { tmdb: r.id, tmdbType: type },
        scores: { tmdb: r.vote_average ? Math.round(r.vote_average * 10) / 10 : undefined },
        popularity: r.popularity || 0,
        lang: r.original_language,
    };
}
async function tmdbSearch(q, medium, signal) {
    const type = medium === "film" ? "movie" : "tv";
    const j = await tmdb("/search/" + type, { query: q, include_adult: ui.private ? "true" : "false" }, signal);
    return (j.results || []).slice(0, 14).map(r => tmdbFields(r, type));
}
async function tmdbDetails(id, type, signal) {
    const d = await tmdb(
        `/${type}/${id}`,
        {
            append_to_response:
                type === "movie"
                    ? "external_ids,credits,recommendations"
                    : "external_ids,aggregate_credits,recommendations",
        },
        signal
    );
    const f = tmdbFields(d, type);
    f.genres = (d.genres || []).map(g => g.name);
    f.ext.imdb = (d.external_ids && d.external_ids.imdb_id) || d.imdb_id || undefined;
    if (d.external_ids && d.external_ids.tvdb_id) f.ext.tvdb = d.external_ids.tvdb_id;
    if (type === "movie") {
        f.runtime = d.runtime || null;
        f.creator = ((d.credits && d.credits.crew) || [])
            .filter(c => c.job === "Director")
            .map(c => c.name)
            .slice(0, 2)
            .join(" & ");
        f.cast = castSplit(
            ((d.credits && d.credits.cast) || []).slice(0, 18).map(c => ({
                src: "tmdb",
                name: c.character,
                va: c.name,
                image: "",
                vaImage: TMDB_IMG(c.profile_path, "w300"),
                role: "Cast",
            }))
        );
    } else {
        f.total = d.number_of_episodes || null;
        f.runtime =
            (d.episode_run_time && d.episode_run_time[0]) ||
            (d.last_episode_to_air && d.last_episode_to_air.runtime) ||
            null;
        f.creator =
            (d.created_by || [])
                .map(c => c.name)
                .slice(0, 2)
                .join(" & ") ||
            (d.networks && d.networks[0] && d.networks[0].name) ||
            "";
        f.airStatus = d.status === "Returning Series" || d.in_production ? "RELEASING" : "FINISHED";
        if (d.next_episode_to_air && d.next_episode_to_air.air_date)
            f.airing = {
                ep: d.next_episode_to_air.episode_number,
                season: d.next_episode_to_air.season_number,
                at: Date.parse(d.next_episode_to_air.air_date + "T12:00:00Z"),
            };
        f.cast = castSplit(
            ((d.aggregate_credits && d.aggregate_credits.cast) || []).slice(0, 18).flatMap(c =>
                (c.roles && c.roles.length
                    ? [...c.roles].sort((a, b) => (b.episode_count || 0) - (a.episode_count || 0)).slice(0, 4)
                    : [{ character: "" }]
                ).map(r => ({
                    src: "tmdb",
                    name: r.character || "",
                    va: c.name,
                    image: "",
                    vaImage: TMDB_IMG(c.profile_path, "w300"),
                    role: "Cast",
                    eps: r.episode_count || 0,
                }))
            )
        );
    }
    f.recs = ((d.recommendations && d.recommendations.results) || []).slice(0, 12).map(r => tmdbFields(r, type));
    return f;
}
async function tmdbImages(id, type, signal) {
    const j = await tmdb(`/${type}/${id}/images`, { include_image_language: "en,null" }, signal);
    return [
        ...(j.posters || [])
            .slice(0, 40)
            .map(p => ({ cover: TMDB_IMG(p.file_path), label: "Poster" + (p.iso_639_1 ? " · " + p.iso_639_1 : "") })),
        ...(j.backdrops || [])
            .slice(0, 12)
            .map(p => ({ cover: TMDB_IMG(p.file_path, "w1280"), label: "Backdrop", wide: true })),
    ];
}

// ── OMDb (optional free key): IMDb, Rotten Tomatoes, Metacritic ──
async function omdbScores(imdb, signal) {
    if (!KEYS.omdb || !imdb) return {};
    const j = await getJSON("https://www.omdbapi.com/?" + new URLSearchParams({ i: imdb, apikey: KEYS.omdb }), signal);
    if (j.Response === "False") {
        if (/invalid api key/i.test(j.Error || "")) {
            const e = new Error("auth");
            e.auth = true;
            throw e;
        }
        return {};
    }
    const s = parseScores((j.Ratings || []).map(r => [r.Source, r.Value]));
    if (j.imdbRating && j.imdbRating !== "N/A") s.imdb = parseFloat(j.imdbRating);
    if (j.Metascore && j.Metascore !== "N/A") s.meta = parseInt(j.Metascore, 10);
    if (j.imdbVotes) s.imdbVotes = parseInt(String(j.imdbVotes).replace(/,/g, ""), 10) || undefined;
    return s;
}

// ── RAWG (optional free key) ──
async function rawg(path, params = {}, signal) {
    if (!KEYS.rawg) throw new Error("no-key");
    return getJSON("https://api.rawg.io/api" + path + "?" + new URLSearchParams({ ...params, key: KEYS.rawg }), signal);
}
function rawgFields(g) {
    return {
        src: "rawg",
        medium: "game",
        title: g.name,
        year: yearOf(g.released),
        cover: g.background_image || "",
        banner: g.background_image_additional || g.background_image || "",
        genres: (g.genres || []).map(x => x.name),
        platforms: (g.platforms || []).map(p => p.platform.name),
        total: g.playtime || null,
        kind: (() => {
            const p = (g.platforms || []).map(x => x.platform.name);
            return p.length && p.every(x => /iOS|Android/.test(x))
                ? "Mobile"
                : p.some(x => /Web/.test(x)) && p.length === 1
                  ? "Browser"
                  : "Console & PC";
        })(),
        ext: { rawg: g.id, rawgSlug: g.slug },
        scores: { meta: g.metacritic || undefined, rawg: g.rating || undefined },
        popularity: g.added || 0,
    };
}
function rawgPick(R, b) {
    const t = norm(cleanTitle(b.title)),
        y = b.year;
    const sc = r =>
        (norm(cleanTitle(r.title)) === t ? 3 : norm(cleanTitle(r.title)).startsWith(t) ? 1 : 0) +
        (y && r.year ? (r.year === y ? 2 : Math.abs(r.year - y) <= 1 ? 1 : -1) : 0) +
        Math.min(1, (r.popularity || 0) / 2000);
    const best = R.map(r => [r, sc(r)]).sort((a, c) => c[1] - a[1])[0];
    return best && best[1] >= 2 ? best[0] : null;
}
async function rawgSearch(q, signal) {
    return ((await rawg("/games", { search: q, page_size: "14" }, signal)).results || []).map(rawgFields);
}
async function rawgDetails(id, signal) {
    const g = await rawg("/games/" + id, {}, signal),
        f = rawgFields(g);
    f.about = (g.description_raw || "").slice(0, 900);
    f.creator = (g.developers || [])
        .map(d => d.name)
        .slice(0, 2)
        .join(" & ");
    f.themes = (g.tags || [])
        .filter(t => t.language === "eng")
        .slice(0, 8)
        .map(t => t.name);
    try {
        const st = await rawg(`/games/${id}/stores`, {}, signal);
        const steam = (st.results || [])
            .map(x => /store\.steampowered\.com\/app\/(\d+)/.exec(x.url || ""))
            .find(Boolean);
        if (steam) {
            f.ext = { ...f.ext, steam: steam[1] };
            const box = `https://cdn.cloudflare.steamstatic.com/steam/apps/${steam[1]}/library_600x900_2x.jpg`;
            if (await probeImg(box)) f.boxart = box;
        }
    } catch (_) {}
    return f;
}
async function rawgImages(id, signal) {
    const j = await rawg(`/games/${id}/screenshots`, {}, signal);
    return (j.results || []).map(s => ({ cover: s.image, label: "Screenshot", wide: true }));
}

// ── Open Library / Google Books ──
const olCover = (id, size = "M") => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`;
async function olSearch(q, limit = 8, signal) {
    const isbn = q.replace(/[-\s]/g, "");
    const params = /^\d{9}[\dXx]$|^\d{13}$/.test(isbn) ? { isbn } : { q };
    const u =
        "https://openlibrary.org/search.json?" +
        new URLSearchParams({
            ...params,
            limit,
            fields: "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,edition_count,ratings_average",
        });
    const r = await fetch(u, { signal });
    if (!r.ok) throw new Error("Open Library " + r.status);
    const j = await r.json();
    return (j.docs || []).map(d => ({
        src: "ol",
        medium: "book",
        olKey: d.key,
        title: d.title,
        author: (d.author_name || []).slice(0, 2).join(" & "),
        creator: (d.author_name || []).slice(0, 2).join(" & "),
        year: d.first_publish_year || null,
        pages: d.number_of_pages_median || null,
        total: d.number_of_pages_median || null,
        cover: d.cover_i ? olCover(d.cover_i) : "",
        subjects: (d.subject || []).slice(0, 30),
        genres: mapGenres(d.subject || []),
        editions: d.edition_count || 0,
        ext: { olKey: d.key },
        scores: { ol: d.ratings_average ? Math.round(d.ratings_average * 100) / 100 : undefined },
    }));
}
async function gbSearch(q, limit = 6, signal) {
    const r = await fetch(
        "https://www.googleapis.com/books/v1/volumes?" +
            new URLSearchParams({ q, maxResults: limit, printType: "books" }),
        { signal }
    );
    if (!r.ok) throw new Error("Google Books " + r.status);
    const j = await r.json();
    return (j.items || []).map(it => {
        const v = it.volumeInfo || {};
        const img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
        return {
            src: "gb",
            medium: "book",
            title: v.title + (v.subtitle ? ": " + v.subtitle : ""),
            author: (v.authors || []).slice(0, 2).join(" & "),
            creator: (v.authors || []).slice(0, 2).join(" & "),
            year: parseInt(v.publishedDate, 10) || null,
            pages: v.pageCount || null,
            total: v.pageCount || null,
            cover: img ? img.replace(/^http:/, "https:").replace("&edge=curl", "") : "",
            about: (v.description || "").replace(/<[^>]+>/g, "").slice(0, 600),
            genres: mapGenres(v.categories || []),
            ext: {},
            scores: { gb: v.averageRating || undefined },
        };
    });
}
async function olDescription(key, signal) {
    try {
        const r = await fetch("https://openlibrary.org" + key + ".json", { signal });
        if (!r.ok) return "";
        const j = await r.json();
        const d = typeof j.description === "string" ? j.description : (j.description && j.description.value) || "";
        return d
            .replace(/\r/g, "")
            .split(/\n\n|----------/)[0]
            .replace(/\[[^\]]*\]\([^)]*\)/g, "")
            .trim()
            .slice(0, 600);
    } catch (e) {
        return "";
    }
}
async function olDims(key, signal) {
    try {
        const j = await getJSON("https://openlibrary.org" + key + "/editions.json?limit=12", signal);
        for (const ed of j.entries || []) {
            const d = String(ed.physical_dimensions || "");
            const m = /([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*(centimeters|cm|inches|in)/i.exec(d);
            if (m) {
                const k = /in/i.test(m[4]) ? 2.54 : 1,
                    n = [m[1], m[2], m[3]].map(v => parseFloat(v) * k).sort((a, b) => b - a);
                if (n[0] > 8 && n[0] < 45)
                    return {
                        h: Math.round(n[0] * 10) / 10,
                        w: Math.round(n[1] * 10) / 10,
                        d: Math.round(n[2] * 10) / 10,
                    };
            }
        }
    } catch (e) {
        if (e.name === "AbortError") throw e;
    }
    return null;
}
async function olRatings(key, signal) {
    try {
        const j = await getJSON("https://openlibrary.org" + key + "/ratings.json", signal);
        return j.summary && j.summary.average
            ? { ol: Math.round(j.summary.average * 100) / 100, olCount: j.summary.count }
            : {};
    } catch (e) {
        if (e.name === "AbortError") throw e;
        return {};
    }
}
async function findCandidates(title, author, signal) {
    const q = cleanTitle(title) + (author ? " " + String(author).split(/&|,| and /)[0] : "");
    let list = [],
        olErr = null,
        gbErr = null;
    try {
        list = await olSearch(q, 8, signal);
    } catch (e) {
        if (e.name === "AbortError") throw e;
        olErr = e;
    }
    if (!list.some(c => c.cover)) {
        try {
            list = list.concat(await gbSearch(q, 6, signal));
        } catch (e) {
            if (e.name === "AbortError") throw e;
            gbErr = e;
        }
    }
    if (olErr && gbErr) throw olErr;
    return list;
}
function titleMatch(b, c) {
    const t = norm(cleanTitle(b.title)),
        first = t.split(" ").filter(w => w.length > 2)[0] || t;
    const sur = norm(String(b.creator || b.author || "").split(/&|,| and /)[0])
        .split(" ")
        .pop();
    return norm(c.title).includes(first) && (!sur || norm(c.author || c.creator).includes(sur));
}
function bestMatch(b, list) {
    const exact = norm(cleanTitle(b.title));
    const ok = list.filter(c => c.cover && (titleMatch(b, c) || norm(cleanTitle(c.title)) === exact));
    ok.sort((x, y) => (y.src === "ol") - (x.src === "ol") || (y.editions || 0) - (x.editions || 0));
    return ok[0] || null;
}
async function allBookCovers(b, signal, progress) {
    const fa = String(b.creator || "").split(/&|,| and /)[0];
    const q = cleanTitle(b.title) + " " + fa;
    let olErr = null;
    const found = await olSearch(q, 10, signal).catch(e => {
        if (e.name === "AbortError") throw e;
        olErr = e;
        return [];
    });
    const works = found
        .filter(c => titleMatch(b, c) || norm(cleanTitle(c.title)) === norm(cleanTitle(b.title)))
        .sort((x, y) => (y.editions || 0) - (x.editions || 0));
    const keys = [
        ...new Set(
            [b.ext && b.ext.olKey, b.olKey, ...works.map(w => w.olKey)].filter(k => k && k.startsWith("/works/"))
        ),
    ].slice(0, 3);
    const seen = new Set(),
        out = [];
    const add = (id, label) => {
        if (!id || id < 0 || seen.has(id)) return;
        seen.add(id);
        out.push({ cover: olCover(id), label });
    };
    for (const key of keys) {
        progress && progress(`Reading ${out.length} covers so far…`);
        try {
            const w = await fetch("https://openlibrary.org" + key + ".json", { signal }).then(r =>
                r.ok ? r.json() : {}
            );
            (w.covers || []).forEach(id => add(id, "Main cover"));
        } catch (e) {
            if (e.name === "AbortError") throw e;
        }
        let url = "https://openlibrary.org" + key + "/editions.json?limit=200",
            pages = 0;
        while (url && pages++ < 3) {
            try {
                const j = await fetch(url, { signal }).then(r => (r.ok ? r.json() : {}));
                for (const ed of j.entries || [])
                    (ed.covers || []).forEach(id =>
                        add(
                            id,
                            [ed.publishers && ed.publishers[0], ed.publish_date].filter(Boolean).join(", ") ||
                                ed.title ||
                                "Edition"
                        )
                    );
                url = j.links && j.links.next ? "https://openlibrary.org" + j.links.next : null;
                progress && progress(`Found ${out.length} covers…`);
            } catch (e) {
                if (e.name === "AbortError") throw e;
                url = null;
            }
        }
    }
    try {
        (await appleBookCovers(b, signal)).forEach(c => {
            if (!seen.has(c.cover)) {
                seen.add(c.cover);
                out.unshift(c);
            }
        });
    } catch (e) {
        if (e.name === "AbortError") throw e;
    }
    try {
        const w = await wikiBookCover(b, signal);
        if (w && !seen.has(w)) {
            seen.add(w);
            out.push({ cover: w, label: "Wikipedia (first edition)" });
        }
    } catch (e) {
        if (e.name === "AbortError") throw e;
    }
    try {
        (await (b.medium === "comic" ? cvCovers : hcCovers)(b, signal)).forEach(c => {
            if (!seen.has(c.cover)) {
                seen.add(c.cover);
                out.push(c);
            }
        });
    } catch (e) {
        if (e.name === "AbortError") throw e;
    }
    try {
        (await gbSearch(`intitle:"${cleanTitle(b.title)}"${fa ? ` inauthor:${surname(fa) || fa}` : ""}`, 20, signal))
            .filter(c => c.cover && titleMatch(b, c))
            .forEach(c => {
                if (!seen.has(c.cover)) {
                    seen.add(c.cover);
                    out.push({ cover: c.cover, label: "Google Books" + (c.year ? ", " + c.year : "") });
                }
            });
    } catch (e) {
        if (e.name === "AbortError") throw e;
        if (olErr && !out.length) throw olErr;
    }
    return { covers: out, meta: works[0] || null };
}

// ── one search box per medium ──
function sourceFor(medium) {
    if (medium === "book") return "Open Library";
    if (["anime", "manga", "manhwa", "novel"].includes(medium)) return "AniList";
    if (medium === "tv") return TMDB_ON() ? "TMDB" : "TVmaze";
    if (medium === "film") return TMDB_ON() ? "TMDB" : "Wikidata and iTunes";
    if (medium === "game") return IGDB_ON() ? "IGDB" : KEYS.rawg ? "RAWG" : "Wikidata";
    if (medium === "comic") return "Open Library";
    if (medium === "album") return "MusicBrainz";
    return "";
}
async function searchMedium(medium, q, signal) {
    switch (medium) {
        case "book": {
            let r = await olSearch(q, 12, signal);
            if (!r.length) r = await gbSearch(q, 8, signal);
            return r;
        }
        case "comic": {
            let r = await olSearch(q + " comic", 12, signal).catch(() => []);
            if (r.length < 3) r = r.concat(await gbSearch(q + " comic", 8, signal).catch(() => []));
            return r.map(c => ({ ...c, medium: "comic", kind: "Graphic novel" }));
        }
        case "anime":
        case "manga":
        case "manhwa":
        case "novel":
            return alSearch(q, medium, signal);
        case "tv":
            return TMDB_ON() ? tmdbSearch(q, "tv", signal) : tvmazeSearch(q, signal);
        case "film":
            return TMDB_ON() ? tmdbSearch(q, "film", signal) : filmSearchKeyless(q, signal);
        case "game":
            return IGDB_ON()
                ? igdbSearch(q, signal).catch(() => (KEYS.rawg ? rawgSearch(q, signal) : wdSearch(q, "game", signal)))
                : KEYS.rawg
                  ? rawgSearch(q, signal)
                  : wdSearch(q, "game", signal);
        case "album": // MusicBrainz, from src/features/music (a module: it's on window once the page has started)
            return window.ulMusic ? ulMusic.searchAlbums(q, signal) : [];
    }
    return [];
}
// fuller details for a picked search result
async function candidateDetails(c, signal) {
    try {
        if (c.src === "anilist") {
            const d = (await alDetails([c.ext.anilist], signal)).get(c.ext.anilist);
            return { ...c, ...(d || {}) };
        }
        if (c.src === "tmdb") {
            const d = await tmdbDetails(c.ext.tmdb, c.ext.tmdbType, signal);
            return { ...c, ...d, scores: { ...c.scores, ...d.scores } };
        }
        if (c.src === "tvmaze") return { ...c, ...(await tvmazeShow(c.ext.tvmaze, signal)) };
        if (c.src === "rawg") return { ...c, ...(await rawgDetails(c.ext.rawg, signal)) };
        if (c.src === "igdb") return { ...c, ...(await igdbDetails(c.ext.igdb, signal)) };
        if (c.src === "mb" && window.ulMusic) return { ...c, ...(await ulMusic.albumDetails(c.ext.mbid, signal)) };
        if (c.src === "ol") {
            const about = c.olKey ? await olDescription(c.olKey, signal) : "";
            return { ...c, about: c.about || about };
        }
    } catch (e) {
        if (e.name === "AbortError") throw e;
    }
    return c;
}

// ── refresh an item's details and scores from every source it can reach ──
async function refreshItem(id, signal, { full = true } = {}) {
    const it = items.get(id);
    if (!it) return {};
    const ext = { ...(it.ext || {}) },
        p = {},
        scores = { ...(it.scores || {}) },
        got = [];
    const setIf = (k, v) => {
        if (
            v != null &&
            v !== "" &&
            !(Array.isArray(v) && !v.length) &&
            (it[k] == null ||
                it[k] === "" ||
                (Array.isArray(it[k]) && !it[k].length) ||
                k === "airing" ||
                k === "airStatus" ||
                k === "rel" ||
                (k === "total" && v > (it.total || 0)) ||
                (k === "about" && /\bupcoming\b/i.test(it.about || "") && !/\bupcoming\b/i.test(v)))
        )
            p[k] = v;
    };
    const take = (f, label) => {
        if (!f) return;
        got.push(label);
        for (const k of [
            "year",
            "runtime",
            "total",
            "vols",
            "about",
            "genres",
            "themes",
            "creator",
            "kind",
            "airing",
            "airStatus",
            "rel",
            "watch",
            "platforms",
            "color",
            "season",
        ])
            setIf(k, f[k]);
        if ((f.boxart || f.cover) && !it.cover && !it.coverData) p.cover = f.boxart || f.cover;
        if (f.banner && !it.banner) p.banner = f.banner;
        if (f.alt) p.alt = { ...(it.alt || {}), ...Object.fromEntries(Object.entries(f.alt).filter(([, v]) => v)) };
        Object.assign(ext, Object.fromEntries(Object.entries(f.ext || {}).filter(([, v]) => v != null)));
        Object.assign(scores, Object.fromEntries(Object.entries(f.scores || {}).filter(([, v]) => v != null)));
    };
    const soft = async (fn, label) => {
        try {
            take(await fn(), label);
        } catch (e) {
            if (e.name === "AbortError") throw e;
            if (e.auth) toast(label + " rejected the key. Check it in Settings.");
        }
    };
    const m = it.medium;
    if (["anime", "manga", "manhwa", "novel"].includes(m)) {
        if (!ext.anilist) {
            await soft(async () => {
                const R = await alSearch(cleanTitle(it.title), m, signal),
                    first = norm(cleanTitle(it.title)).split(" ")[0];
                const sc = c =>
                    (norm(cleanTitle(c.title)).includes(first) ||
                    Object.values(c.alt || {}).some(t => norm(t || "").includes(first))
                        ? 1
                        : 0) +
                    (it.kind && c.kind === it.kind ? 0.5 : 0) +
                    (it.year && c.year && Math.abs(c.year - it.year) <= 1 ? 0.7 : 0) +
                    (norm(cleanTitle(c.title)) === norm(cleanTitle(it.title)) ? 0.5 : 0);
                const best = R.map(c => [c, sc(c)])
                    .filter(x => x[1] >= 1)
                    .sort((a, b) => b[1] - a[1])[0];
                return best ? best[0] : null;
            }, "AniList");
            if (!ext.anilist && !ext.mal)
                await soft(async () => {
                    const first = norm(cleanTitle(it.title)).split(" ")[0],
                        R = await jikanSearch(cleanTitle(it.title), m === "anime" ? "anime" : "manga", signal);
                    const sc = c =>
                        (Object.values({ t: c.title, ...c.alt }).some(t => norm(t || "").includes(first)) ? 1 : 0) +
                        (it.kind && c.kind === it.kind ? 0.5 : 0) +
                        (it.year && c.year && Math.abs(c.year - it.year) <= 1 ? 0.7 : 0);
                    const best = R.map(c => [c, sc(c)])
                        .filter(x => x[1] >= 1)
                        .sort((a, b) => b[1] - a[1])[0];
                    return best ? best[0] : null;
                }, "MyAnimeList");
        }
        if (ext.anilist && full)
            await soft(async () => (await alDetails([ext.anilist], signal)).get(ext.anilist), "AniList");
        if (ext.mal)
            await soft(
                async () => ({ scores: await jikanScore(m === "anime" ? "anime" : "manga", ext.mal, signal) }),
                "MyAnimeList"
            );
    } else if (m === "tv" || m === "film") {
        const type = m === "film" ? "movie" : "tv";
        if (TMDB_ON()) {
            if (!ext.tmdb) {
                await soft(async () => {
                    const r = (await tmdbSearch(cleanTitle(it.title), m, signal)).find(
                        c => !it.year || !c.year || Math.abs(c.year - it.year) <= 1
                    );
                    return r ? { ext: r.ext } : null;
                }, "TMDB");
            }
            if (ext.tmdb) await soft(() => tmdbDetails(ext.tmdb, ext.tmdbType || type, signal), "TMDB");
        }
        if (m === "tv") {
            await soft(async () => {
                if (ext.tvmaze) return tvmazeShow(ext.tvmaze, signal);
                if (ext.imdb) {
                    const s = await tvmazeByImdb(ext.imdb, signal).catch(() => null);
                    if (s) return s;
                }
                const r = pickShow(await tvmazeSearch(cleanTitle(it.title), signal), it);
                return r ? tvmazeShow(r.ext.tvmaze, signal) : null;
            }, "TVmaze");
        }
        if (m === "film" || !ext.imdb) {
            await soft(async () => {
                const q = ext.wikidata || (await wdFind(it.title, m, it.year, signal));
                if (!q) return null;
                const d = (await wdDetails([q], signal, m)).get(q);
                if (d && m === "film" && it.creatorFix) p.creator = d.creator;
                return d;
            }, "Wikidata");
        }
        if (ext.imdb && KEYS.omdb) await soft(async () => ({ scores: await omdbScores(ext.imdb, signal) }), "OMDb");
    } else if (m === "game") {
        if (IGDB_ON()) {
            await soft(async () => {
                const id = await igdbFind(it, signal);
                return id ? igdbDetails(id, signal) : null;
            }, "IGDB");
        }
        if (KEYS.rawg) {
            if (!ext.rawg)
                await soft(async () => {
                    const r = rawgPick(await rawgSearch(cleanTitle(it.title), signal), it);
                    return r ? { ext: r.ext } : null;
                }, "RAWG");
            if (ext.rawg) await soft(() => rawgDetails(ext.rawg, signal), "RAWG");
        }
        await soft(async () => {
            const q = ext.wikidata || (await wdFind(it.title, "game", it.year, signal));
            return q ? (await wdDetails([q], signal, "game")).get(q) : null;
        }, "Wikidata");
    } else if (m === "album" && window.ulMusic) {
        await soft(async () => {
            let id = ext.mbid;
            if (!id) {
                const hit = (await ulMusic.searchAlbums(`${cleanTitle(it.title)} ${it.creator || ""}`, signal))[0];
                id = hit && hit.ext.mbid;
            }
            return id ? { ...(await ulMusic.albumDetails(id, signal)), ext: { mbid: id } } : null;
        }, "MusicBrainz");
    } else if (m === "book" || m === "comic") {
        const key = ext.olKey || it.olKey;
        if (key)
            await soft(async () => ({ scores: await olRatings(key, signal), ext: { olKey: key } }), "Open Library");
        if (key && !it.dims && full)
            await soft(async () => {
                const d = await olDims(key, signal);
                if (d) p.dims = d;
                return null;
            }, "Open Library");
        if (!key || !(it.genres || []).length)
            await soft(async () => {
                const r = bestMatch(it, await findCandidates(it.title, it.creator, signal));
                return r
                    ? {
                          ext: r.ext || {},
                          scores: r.scores,
                          year: r.year,
                          total: r.total,
                          genres: it.kind === "Academic" && it.subject ? [it.subject] : r.genres,
                      }
                    : null;
            }, "Open Library");
    }
    p.ext = ext;
    p.scores = scores;
    p.scoresAt = nowISO();
    {
        const sp = splitGenres({ ...items.get(id), ...p });
        if (sp) Object.assign(p, sp);
    }
    quietPatch(id, p);
    return { got };
}
// every picture we can find for an item (covers, posters, banners, screenshots)
async function allArt(it, signal, progress) {
    const out = [],
        seen = new Set(),
        add = (cover, label, wide) => {
            if (cover && !seen.has(cover)) {
                seen.add(cover);
                out.push({ cover, label, wide: !!wide });
            }
        };
    const e = it.ext || {};
    if (it.medium === "book" || it.medium === "comic") {
        const r = await allBookCovers(it, signal, progress);
        r.covers.forEach(c => add(c.cover, c.label));
        return { covers: out, meta: r.meta };
    }
    if (it.cover) add(it.cover, "Current");
    if (it.banner) add(it.banner, "Banner", true);
    if (e.anilist) {
        try {
            const d = (await alDetails([e.anilist], signal)).get(e.anilist);
            if (d) {
                add(d.cover, "AniList cover");
                add(d.banner, "AniList banner", true);
            }
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (e.mal) {
        try {
            (await jikanPictures(it.medium === "anime" ? "anime" : "manga", e.mal, signal)).forEach(u =>
                add(u, "MyAnimeList")
            );
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (e.tvmaze) {
        try {
            (await tvmazeImages(e.tvmaze, signal)).forEach(c => add(c.cover, c.label, c.wide));
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (e.tmdb && TMDB_ON()) {
        try {
            (await tmdbImages(e.tmdb, e.tmdbType || (it.medium === "film" ? "movie" : "tv"), signal)).forEach(c =>
                add(c.cover, c.label, c.wide)
            );
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (e.igdb && IGDB_ON()) {
        try {
            (await igdbImages(e.igdb, signal)).forEach(c => add(c.cover, c.label, c.wide));
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (e.steam) {
        add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${e.steam}/library_600x900_2x.jpg`, "Steam cover");
        add(`https://cdn.cloudflare.steamstatic.com/steam/apps/${e.steam}/library_hero.jpg`, "Steam banner", true);
    }
    if (e.rawg && KEYS.rawg) {
        try {
            (await rawgImages(e.rawg, signal)).forEach(c => add(c.cover, c.label, c.wide));
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (e.wiki) {
        try {
            const w = (await wikiPages([e.wiki], signal)).get(e.wiki);
            if (w && w.image) add(w.image, "Wikipedia");
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (it.medium === "game") {
        for (const c of it.lbArt || []) add(c.cover, c.label, c.wide);
        progress && progress("Asking your proxy for boxes and covers…");
        for (const f of [tgdbBoxes, ssMedia, sgdbCovers])
            try {
                (await f(it, signal)).forEach(c =>
                    add(c.cover, c.label, c.kind === "box-2D-side" || c.kind === "box-3D")
                );
            } catch (x) {
                if (x.name === "AbortError") throw x;
            }
        try {
            const u = await wikiBoxArt(it, signal);
            if (u) add(u, "Box art (Wikipedia)");
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
        try {
            const u = await appStoreIcon(it, signal);
            if (u) add(u, "App Store icon");
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    if (["manga", "manhwa", "novel"].includes(it.medium)) {
        try {
            const V = await volumeCovers(it, signal);
            for (const [v, u] of Object.entries(V).slice(0, 40)) add(u, "Volume " + v);
        } catch (x) {
            if (x.name === "AbortError") throw x;
        }
    }
    // the current picture goes last when it's only a screenshot
    if (it.medium === "game" && isShot(it.cover)) {
        const i = out.findIndex(c => c.cover === it.cover);
        if (i >= 0) {
            const [c] = out.splice(i, 1);
            out.push({ ...c, label: "Screenshot (current)", wide: true });
        }
    }
    return { covers: out };
}
async function testKey(which) {
    try {
        if (which === "tmdb") await tmdb("/configuration", {}, undefined);
        if (which === "omdb") {
            const j = await getJSON(
                "https://www.omdbapi.com/?" + new URLSearchParams({ i: "tt0111161", apikey: KEYS.omdb })
            );
            if (j.Response === "False") throw new Error(j.Error || "rejected");
        }
        if (which === "rawg") await rawg("/games", { page_size: "1" });
        if (which === "igdb") {
            const r = await igdbQ("games", "fields name; limit 1;");
            if (!Array.isArray(r)) throw new Error("rejected");
        }
        return "ok";
    } catch (e) {
        return e.auth || /invalid|rejected|401/i.test(e.message) ? "bad" : "offline";
    }
}
// links out to sites that have no API (scores you can check or type in yourself)
function linksOut(it) {
    const t = cleanTitle(it.title),
        e = it.ext || {},
        enc = encodeURIComponent;
    const L = [];
    if (e.anilist) L.push(["AniList", `https://anilist.co/${it.medium === "anime" ? "anime" : "manga"}/${e.anilist}`]);
    if (e.mal) L.push(["MyAnimeList", `https://myanimelist.net/${it.medium === "anime" ? "anime" : "manga"}/${e.mal}`]);
    if (e.imdb) L.push(["IMDb", `https://www.imdb.com/title/${e.imdb}/`]);
    if (e.tmdb)
        L.push([
            "TMDB",
            `https://www.themoviedb.org/${e.tmdbType || (it.medium === "film" ? "movie" : "tv")}/${e.tmdb}`,
        ]);
    if (e.tvmaze) L.push(["TVmaze", `https://www.tvmaze.com/shows/${e.tvmaze}`]);
    if (e.rawg) L.push(["RAWG", `https://rawg.io/games/${e.rawgSlug || e.rawg}`]);
    if (e.olKey || it.olKey) L.push(["Open Library", `https://openlibrary.org${e.olKey || it.olKey}`]);
    if (e.wiki) L.push(["Wikipedia", `https://en.wikipedia.org/wiki/${enc(e.wiki.replace(/ /g, "_"))}`]);
    if (it.medium === "film" || it.medium === "tv") {
        if (it.medium === "film")
            L.push([
                "Letterboxd",
                e.imdb ? `https://letterboxd.com/imdb/${e.imdb}/` : `https://letterboxd.com/search/${enc(t)}/`,
            ]);
        L.push(
            ["Rotten Tomatoes", `https://www.rottentomatoes.com/search?search=${enc(t)}`],
            ["Metacritic", `https://www.metacritic.com/search/${enc(t)}/`]
        );
        if (/drama/i.test(it.kind || "") || it.lang === "ko")
            L.push(["MyDramaList", `https://mydramalist.com/search?q=${enc(t)}`]);
    }
    if (it.medium === "book" || it.medium === "comic")
        L.push(
            ["Goodreads", `https://www.goodreads.com/search?q=${enc(t + " " + firstAuthor(it.creator))}`],
            ["StoryGraph", `https://app.thestorygraph.com/browse?search_term=${enc(t)}`]
        );
    if (["manga", "manhwa", "novel"].includes(it.medium))
        L.push(["MangaUpdates", `https://www.mangaupdates.com/series?search=${enc(t)}`]);
    if (it.medium === "novel") L.push(["NovelUpdates", `https://www.novelupdates.com/?s=${enc(t)}`]);
    if (it.medium === "game" && /Browser|Mobile/.test(it.kind || ""))
        L.push(
            ["Y8", `https://www.y8.com/search?q=${enc(t)}`],
            [
                "Internet Archive",
                e.archive
                    ? `https://archive.org/details/${enc(e.archive)}`
                    : `https://archive.org/search?query=${enc(t)}&and%5B%5D=mediatype%3A%22software%22`,
            ]
        );
    if (it.medium === "game")
        L.push(
            ["Backloggd", `https://backloggd.com/search/games/${enc(t)}`],
            ["HowLongToBeat", `https://howlongtobeat.com/?q=${enc(t)}`],
            ["Metacritic", `https://www.metacritic.com/search/${enc(t)}/`]
        );
    if (["anime", "manga", "manhwa", "novel"].includes(it.medium))
        L.push([
            "Anime-Planet",
            `https://www.anime-planet.com/${it.medium === "anime" ? "anime" : "manga"}/all?name=${enc(t)}`,
        ]);
    if (it.medium === "tv" || (it.medium === "anime" && it.kind !== "Movie"))
        L.push(["Serializd", `https://duckduckgo.com/?q=${enc("site:serializd.com " + t)}`]);
    if (["tv", "film"].includes(it.medium) && !L.some(x => x[0] === "MyDramaList"))
        L.push(["MyDramaList", `https://mydramalist.com/search?q=${enc(t)}`]);
    L.push(["Fandom wiki", `https://community.fandom.com/wiki/Special:Search?query=${enc(t)}&scope=cross-wiki`]);
    if (it.medium === "anime" || it.medium === "tv") L.push(["Reddit", `https://www.reddit.com/search/?q=${enc(t)}`]);
    return L;
}

// ── AniList: the seasonal chart (Culture only) ──
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];
function seasonNow(d = new Date()) {
    const m = d.getMonth();
    return { season: SEASONS[Math.floor(((m + 1) % 12) / 3)], year: m === 11 ? d.getFullYear() + 1 : d.getFullYear() };
}
async function alSeason(season, year, signal) {
    const out = [];
    for (let page = 1; page <= 4; page++) {
        const d = await AL.q(
            `query($s:MediaSeason,$y:Int,$p:Int){ Page(page:$p, perPage: 50){ pageInfo { hasNextPage } media(season:$s, seasonYear:$y, type: ANIME, isAdult: false, sort:[POPULARITY_DESC]){ ${AL_MEDIA} } } }`,
            { s: season, y: year, p: page },
            signal
        );
        out.push(...(d.Page.media || []).map(m => ({ src: "anilist", ...alToFields(m) })));
        if (!d.Page.pageInfo.hasNextPage) break;
    }
    return out;
}
async function alEpisodes(alId, signal) {
    const d = await AL.q(
        `query($id:Int){ Media(id:$id){ episodes duration nextAiringEpisode { episode } streamingEpisodes { title thumbnail url site } externalLinks { site url type } } }`,
        { id: alId },
        signal,
        0,
        true
    );
    if (!d || !d.Media) throw new Error("none");
    // a show still airing has no final count: everything up to the next episode is out
    return {
        total: d.Media.episodes || (d.Media.nextAiringEpisode ? d.Media.nextAiringEpisode.episode - 1 : null),
        runtime: d.Media.duration,
        eps: d.Media.streamingEpisodes || [],
        links: (d.Media.externalLinks || [])
            .filter(l => l.type === "STREAMING")
            .map(l => ({ site: l.site, url: l.url })),
    };
}
// one voice actor often plays several characters ("Homer Simpson / Grampa / Krusty (voice)"): each becomes its own character, with the same actor
function castSplit(L) {
    const out = [],
        seen = new Set();
    for (const c of L) {
        const names = String(c.name || "")
            .replace(/\s*\((?:[^)]*voice[^)]*|uncredited|archive footage|singing)\)/gi, "")
            .split(/\s+\/\s+|\s*;\s*|\s+and\s+(?=[A-Z])/)
            .map(x => x.trim())
            .filter(x => x && !/^(himself|herself|themselves|self|additional voices?|various)$/i.test(x));
        (names.length ? names : [""]).forEach((n, i) => {
            const k = norm(n) + "|" + c.va;
            if (seen.has(k)) return;
            seen.add(k);
            out.push({ ...c, name: n, image: i && names.length > 1 ? "" : c.image });
        });
    }
    return out.slice(0, 30);
}
// ── TVmaze: seasons and episodes, no key ──
async function tvmazeEpisodes(id, signal) {
    const eps = await getJSON(`https://api.tvmaze.com/shows/${id}/episodes`, signal);
    return eps.map(e => ({
        s: e.season,
        e: e.number,
        title: e.name,
        date: e.airdate,
        runtime: e.runtime,
        image: e.image ? e.image.medium || e.image.original : "",
        about: stripMd(e.summary || "").slice(0, 300),
    }));
}

// ── Wikidata: cast (actor → character), characters and voice actors, for films, shows, games and books ──
const commonsImg = u => (u ? u.replace(/^http:/, "https:") + (u.includes("?") ? "&" : "?") + "width=300" : "");
// cast and characters from Wikidata: billed cast (with the part they play), voice cast, and the characters that appear in it
// (games: also the characters of the series it belongs to). Biggest names first, the way a cast list is billed.
// cast and characters from Wikidata, in small quick questions rather than one slow one:
// 1) the billed and voice cast, 2) the characters linked to it (both ways), 3) for games with few, the characters of its series,
// then 4) pictures and voice actors for the characters that made the list (Wikipedia pictures where Wikidata has none).
async function wdCast(qid, signal, medium) {
    const ask = (body, ms = 15000) =>
        getJSON(
            "https://query.wikidata.org/sparql?" +
                new URLSearchParams({
                    format: "json",
                    query: body + ` SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`,
                }),
            signal,
            { timeout: ms }
        )
            .then(j => j.results.bindings)
            .catch(e => {
                if (signal && signal.aborted) throw e;
                return null;
            });
    const v = (r, k) => r[k] && r[k].value,
        lbl = (r, k) => {
            const x = v(r, k);
            return x && !/^Q\d+$/.test(x) ? x : "";
        },
        id = (r, k) => (v(r, k) || "").split("/").pop();
    const [castRows, charRows] = await Promise.all([
        ask(
            `SELECT ?kind ?c ?cLabel ?p ?pLabel ?ord WHERE { { wd:${qid} p:P161 ?st . ?st ps:P161 ?p . OPTIONAL { ?st pq:P453 ?c } OPTIONAL { ?st pq:P1545 ?ord } BIND("cast" AS ?kind) } UNION { wd:${qid} p:P725 ?st . ?st ps:P725 ?p . OPTIONAL { ?st pq:P453 ?c } BIND("voice" AS ?kind) }`
        ),
        ask(
            `SELECT DISTINCT ?c ?cLabel WHERE { { wd:${qid} wdt:P674 ?c } UNION { ?c wdt:P1441 wd:${qid} } UNION { ?c wdt:P8345 wd:${qid} }`
        ),
    ]);
    if (castRows === null && charRows === null) throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    let chars = (charRows || [])
        .map(r => ({ cid: id(r, "c"), name: lbl(r, "cLabel"), direct: true }))
        .filter(c => c.name);
    if (medium === "game" && chars.length < 6) {
        const more = await ask(
            `SELECT DISTINCT ?c ?cLabel WHERE { wd:${qid} wdt:P179|wdt:P8345 ?ser . { ?c wdt:P1441 ?ser } UNION { ?ser wdt:P674 ?c } UNION { ?c wdt:P8345 ?ser } } LIMIT 150`,
            12000
        );
        for (const r of more || []) {
            const c = { cid: id(r, "c"), name: lbl(r, "cLabel"), direct: false };
            if (c.name && !chars.some(x => x.cid === c.cid)) chars.push(c);
        }
    }
    const cast = new Map();
    for (const r of castRows || []) {
        const pid = id(r, "p"),
            person = lbl(r, "pLabel");
        if (!person) continue;
        const cid = id(r, "c"),
            k = pid + "|" + cid;
        if (cast.has(k)) continue;
        cast.set(k, {
            src: "wikidata",
            pid,
            cid,
            name: lbl(r, "cLabel"),
            va: person,
            role: v(r, "kind") === "voice" ? "Voice" : "Cast",
            ord: +(v(r, "ord") || 999),
        });
    }
    // pictures, fame and voice actors for everyone on the list, in one go
    const ids = [
        ...new Set([...[...cast.values()].flatMap(c => [c.pid, c.cid]), ...chars.map(c => c.cid)].filter(Boolean)),
    ].slice(0, 220);
    const info = new Map();
    if (ids.length) {
        const rows = await ask(
            `SELECT ?x ?img ?sl ?art ?va ?vaLabel WHERE { VALUES ?x { ${ids.map(i => "wd:" + i).join(" ")} } OPTIONAL { ?x wdt:P18 ?img } OPTIONAL { ?x wikibase:sitelinks ?sl } OPTIONAL { ?art schema:about ?x ; schema:isPartOf <https://en.wikipedia.org/> } OPTIONAL { ?x wdt:P725 ?va }`,
            15000
        );
        for (const r of rows || []) {
            const x = id(r, "x"),
                e = info.get(x) || {};
            if (!e.img && v(r, "img")) e.img = commonsImg(v(r, "img"));
            if (e.sl == null) e.sl = +(v(r, "sl") || 0);
            if (!e.art && v(r, "art")) e.art = v(r, "art");
            if (!e.va && lbl(r, "vaLabel")) e.va = lbl(r, "vaLabel");
            info.set(x, e);
        }
    }
    const I = x => info.get(x) || {};
    for (const c of cast.values()) {
        c.vaImage = I(c.pid).img || "";
        c.image = I(c.cid).img || "";
        c.sl = I(c.pid).sl || 0;
        c.art = I(c.cid).art;
    }
    const inCast = new Set([...cast.values()].map(c => c.cid).filter(Boolean));
    const named = chars
        .filter(c => !inCast.has(c.cid))
        .map(c => ({
            src: "wikidata",
            cid: c.cid,
            name: c.name,
            image: I(c.cid).img || "",
            va: I(c.cid).va || "",
            role: "Character",
            sl: I(c.cid).sl || 0,
            direct: c.direct,
            art: I(c.cid).art,
        }))
        .sort((a, b) => (b.direct ? 1 : 0) - (a.direct ? 1 : 0) || b.sl - a.sl);
    const billed = [...cast.values()]
        .map(c => ({ ...c, csl: I(c.cid).sl }))
        .sort((a, b) => a.ord - b.ord || b.sl - a.sl);
    const out =
            medium === "game"
                ? [...billed, ...named].sort(
                      (a, b) =>
                          (b.direct === false ? 0 : 1) - (a.direct === false ? 0 : 1) ||
                          (b.csl ?? b.sl) - (a.csl ?? a.sl)
                  )
                : [...billed, ...named],
        seen = new Set();
    const list = out
        .filter(c => {
            const k = norm(c.name + "|" + c.va);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .slice(0, 48);
    // characters rarely have a free picture on Wikidata; their Wikipedia article usually has one
    const need = list
        .filter(c => c.name && !c.image && c.art)
        .map(c => decodeURIComponent(c.art.split("/wiki/").pop()).replace(/_/g, " "));
    if (need.length) {
        try {
            const W = await wikiPages([...new Set(need)].slice(0, 40), signal);
            for (const c of list)
                if (!c.image && c.art) {
                    const w = W.get(decodeURIComponent(c.art.split("/wiki/").pop()).replace(/_/g, " "));
                    if (w && w.image) c.image = w.image;
                }
        } catch (_) {}
    }
    return list;
}
