// src/features/sources/covers.js
// ─────────────────────────────────────────────────────────────────
//  Background work: artwork, offline cache, spine colours, crowd scores
// ─────────────────────────────────────────────────────────────────

const coverSrc = b => b.coverData || (b.cover ? coverCache.src(b.cover) : "");
const auto = { running: false, paused: false, done: 0, total: 0, found: 0, fails: 0, offline: false, phase: "" };
function updateItemTiles(id) {
    const b = items.get(id);
    if (!b) return;
    $$(`[data-id="${CSS.escape(id)}"]`).forEach(el => {
        if (el.classList.contains("spine")) {
            el.outerHTML = spineHTML({ ...b, id }, el.dataset.call || "");
            return;
        }
        const c = el.querySelector(".cover");
        if (c) c.outerHTML = coverHTML({ ...b, id });
    });
}
async function fetchBookCover(id, signal, overwrite) {
    const b = items.get(id);
    if (!b) return false;
    const c = bestMatch(b, await findCandidates(b.title, b.creator, signal));
    const cur = items.get(id);
    if (!cur) return false;
    const p = { coverChecked: true, genreChecked: true };
    if (c && !(cur.genres || []).length)
        p.genres = cur.kind === "Academic" && cur.subject ? [cur.subject] : c.genres || [];
    if ((!c || !c.cover) && !coverSrc(cur)) {
        try {
            const a = (await appleBookCovers(cur, signal))[0];
            if (a) {
                p.cover = a.cover;
                p.coverColor = null;
            }
        } catch (e) {
            if (e.name === "AbortError") throw e;
        }
        if (!p.cover)
            try {
                const w = await wikiBookCover(cur, signal);
                if (w) {
                    p.cover = w;
                    p.coverColor = null;
                }
            } catch (e) {
                if (e.name === "AbortError") throw e;
            }
    }
    if (c && c.cover && (overwrite || !coverSrc(cur))) {
        p.cover = c.cover;
        p.coverColor = null;
        if (!cur.year && c.year) p.year = c.year;
        if (!cur.total && c.total) p.total = c.total;
        if (c.olKey) p.ext = { ...(cur.ext || {}), olKey: c.olKey };
    }
    quietPatch(id, p);
    return !!p.cover;
}
async function fetchArt(id, signal, overwrite) {
    const b = items.get(id);
    if (!b) return false;
    if (b.medium === "book" || b.medium === "comic") return fetchBookCover(id, signal, overwrite);
    await refreshItem(id, signal);
    if (b.medium === "game")
        try {
            await upgradeGameCover(id, signal);
        } catch (e) {
            if (e.name === "AbortError") throw e;
        }
    quietPatch(id, { coverChecked: true });
    return !!items.get(id).cover;
}
async function cacheAndColour(id, signal) {
    const b = items.get(id);
    if (!b) return;
    const url = b.cover;
    let blob = null;
    if (b.coverData) {
        try {
            blob = await (await fetch(b.coverData)).blob();
        } catch (_) {}
    } else if (url && !coverCache.urls.has(url)) blob = await coverCache.fetch(url, signal);
    if (!blob && url && coverCache.urls.has(url) && !b.coverColor && !b.color) {
        try {
            blob = await (await fetch(coverCache.urls.get(url))).blob();
        } catch (_) {}
    }
    if (blob && !b.coverColor && !b.color) {
        const col = await dominantColor(blob);
        quietPatch(id, { coverColor: col || "none" });
    }
}
function renderAutoStatus() {
    updateBusy();
    const el = $("#covstat");
    if (!el) return;
    if (auto.offline) {
        el.hidden = false;
        el.innerHTML = `<span class="b-ic">◌</span> Couldn't reach the artwork sources, so some covers are missing. They'll load next time you're online. <button class="linkbtn" data-act="auto-resume">Try again</button>`;
        return;
    }
    const sq = scoreQ.running && !auto.running;
    if (!auto.running && !auto.paused && !sq) {
        el.hidden = true;
        return;
    }
    el.hidden = false;
    if (sq) {
        el.innerHTML = `<span class="b-ic">★</span> Fetching crowd scores: ${scoreQ.done} of ${scoreQ.total} <span class="progress" style="width:120px;display:inline-block"><span style="width:${scoreQ.total ? Math.round((scoreQ.done / scoreQ.total) * 100) : 0}%"></span></span> <button class="linkbtn" data-act="scores-stop">Pause</button>`;
        return;
    }
    const what = auto.phase === "cache" ? "Saving artwork for offline use" : "Finding artwork";
    el.innerHTML = auto.paused
        ? `<span class="b-ic">❚❚</span> ${what} paused at ${auto.done} of ${auto.total}. <button class="linkbtn" data-act="auto-resume">Resume</button>`
        : `<span class="b-ic">↻</span> ${what}: ${auto.done} of ${auto.total}${auto.phase === "find" ? ` · ${auto.found} found` : ""} <span class="progress" style="width:120px;display:inline-block"><span style="width:${auto.total ? Math.round((auto.done / auto.total) * 100) : 0}%"></span></span> <button class="linkbtn" data-act="auto-pause">Pause</button>`;
}
async function autoCovers(ids, { retry = false } = {}) {
    if (auto.running) return;
    if (!ids && meta.settings.autoFetch === false) return;
    if (!navigator.onLine) {
        auto.offline = true;
        renderAutoStatus();
        return;
    }
    Object.assign(auto, { running: true, paused: false, offline: false, ctl: new AbortController() });
    const queue =
        ids ||
        [...items.entries()]
            .filter(
                ([, b]) =>
                    (!coverSrc(b) && !b.coverChecked) ||
                    ((b.medium === "book" || b.medium === "comic") && !(b.genres || []).length && !b.genreChecked)
            )
            .map(([id]) => id);
    Object.assign(auto, { phase: "find", done: 0, total: queue.length, found: 0, fails: 0 });
    renderAutoStatus();
    for (const id of queue) {
        if (auto.paused || auto.ctl.signal.aborted) break;
        try {
            if (await fetchArt(id, auto.ctl.signal)) {
                auto.found++;
                updateItemTiles(id);
            }
            auto.fails = 0;
        } catch (e) {
            if (e.name === "AbortError") break;
            if (++auto.fails >= 5) {
                auto.offline = true;
                break;
            }
        }
        auto.done++;
        if (auto.done % 6 === 0) scheduleSave();
        renderAutoStatus();
        await sleep(220);
    }
    if (!auto.paused && !auto.offline && !coverCache.blocked) {
        // pictures are saved for offline once; one that won't come isn't asked for again until you press Refresh or "Save every picture"
        const toCache =
            meta.settings.offlineAuto === false
                ? []
                : [...items.entries()]
                      .filter(
                          ([id, b]) =>
                              (!ids || ids.includes(id)) &&
                              (retry || b.cacheTried !== b.cover) &&
                              ((b.cover && !coverCache.urls.has(b.cover)) ||
                                  ((b.cover || b.coverData) && !b.coverColor && !b.color))
                      )
                      .map(([id]) => id);
        Object.assign(auto, { phase: "cache", done: 0, total: toCache.length });
        for (const id of toCache) {
            if (auto.paused || auto.ctl.signal.aborted || coverCache.blocked) break;
            try {
                await cacheAndColour(id, auto.ctl.signal);
                const x = items.get(id);
                if (x) {
                    x.cacheTried = x.cover;
                    if (!x.coverColor && !x.color) x.coverColor = "none";
                    dirty.add(id);
                }
                updateItemTiles(id);
            } catch (e) {
                if (e.name === "AbortError") break;
            }
            auto.done++;
            if (auto.done % 8 === 0) {
                scheduleSave();
                renderAutoStatus();
            }
            await sleep(40);
        }
    }
    auto.running = false;
    scheduleSave();
    renderAutoStatus();
    scoreQ.start();
    fixFilmCreators();
    setTimeout(v9Repair, 4000);
}
// crowd scores in the background: MyAnimeList via Jikan, IMDb/RT/Metacritic via OMDb, TVmaze, TMDB, RAWG, Wikidata
const scoreQ = {
    running: false,
    done: 0,
    total: 0,
    ctl: null,
    stopped: false,
    pending() {
        return [...items.entries()]
            .filter(
                ([, b]) => !b.scoresAt && !b.scoresTried && b.medium !== "book" && b.medium !== "comic" && !b.favOnly
            )
            .map(([id]) => id);
    },
    async start() {
        if (
            this.running ||
            this.stopped ||
            auto.running ||
            alSync.running ||
            !navigator.onLine ||
            meta.settings.autoFetch === false
        )
            return;
        const ids = this.pending();
        if (!ids.length) return;
        Object.assign(this, { running: true, done: 0, total: ids.length, ctl: new AbortController() });
        renderAutoStatus();
        let fails = 0;
        for (const id of ids) {
            if (this.ctl.signal.aborted) break;
            try {
                await refreshItem(id, this.ctl.signal, { full: false });
                fails = 0;
            } catch (e) {
                if (e.name === "AbortError") break;
                quietPatch(id, { scoresTried: nowISO() });
                if (++fails > 6) break;
            }
            this.done++;
            if (this.done % 5 === 0) {
                scheduleSave();
                renderAutoStatus();
            }
            await sleep(250);
        }
        this.running = false;
        scheduleSave();
        renderAutoStatus();
        renderSide();
    },
    stop() {
        this.stopped = true;
        if (this.ctl) this.ctl.abort();
        this.running = false;
        renderAutoStatus();
    },
};
// airing and release dates for things you're watching or waiting on
async function refreshAiring(force) {
    if (!navigator.onLine || meta.settings.airing === false) return;
    const last = meta.settings.airingAt ? Date.parse(meta.settings.airingAt) : 0;
    if (!force && Date.now() - last < 6 * 3600e3) return;
    meta.settings.airingAt = nowISO();
    markDirty();
    const watch = [...items.entries()].filter(
        ([, b]) =>
            ["active", "want", "paused"].includes(b.status) &&
            (b.airStatus === "RELEASING" || b.airStatus === "NOT_YET_RELEASED" || b.airing)
    );
    const al = watch.filter(([, b]) => b.ext.anilist).map(([id, b]) => [id, b.ext.anilist]);
    try {
        for (let i = 0; i < al.length; i += 40) {
            const chunk = al.slice(i, i + 40);
            const d = await AL.q(
                `query($ids:[Int]){ Page(perPage: 50){ media(id_in:$ids){ id status episodes chapters nextAiringEpisode { episode airingAt } } } }`,
                { ids: chunk.map(x => x[1]) }
            );
            for (const m of d.Page.media || []) {
                const id = chunk.find(x => x[1] === m.id)[0];
                quietPatch(id, {
                    airStatus: m.status,
                    airing: m.nextAiringEpisode
                        ? { ep: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt * 1000 }
                        : null,
                    total: m.episodes || m.chapters || items.get(id).total,
                });
            }
        }
    } catch (e) {}
    scheduleSave();
    renderSide();
}

// one-time fix: Wikidata used to give films their composer or writer as "director" (Good Will Hunting got its composer). Re-read the director only.
// an earlier lookup could match a film to the video game of the same name; unlink those and look the film up again by its IMDb id
const WRONG_MATCH = /\((video )?game\)|\bvideo game\b/i,
    GAME_GENRE =
        /\b(video game|action-adventure game|role-playing game|platform game|adventure game|shooter game|fighting game)\b/i;
function repairWrongMatches() {
    let n = 0;
    for (const [id, b] of items)
        if (
            (b.medium === "film" || b.medium === "tv") &&
            !b.matchRepaired &&
            (WRONG_MATCH.test((b.ext || {}).wiki || "") ||
                (b.genres || []).some(g => GAME_GENRE.test(g)) ||
                / game$/i.test(b.kind || ""))
        ) {
            const ext = { ...(b.ext || {}) };
            delete ext.wikidata;
            delete ext.wiki;
            quietPatch(id, {
                ext,
                genres: (b.genres || []).filter(g => !GAME_GENRE.test(g)),
                creator: "",
                about: /video game|\bgame\b/i.test(b.about || "") ? "" : b.about,
                kind: / game$/i.test(b.kind || "") ? "" : b.kind,
                creatorFix: true,
                matchRepaired: true,
                scoresAt: null,
            });
            n++;
        }
    return n;
}
async function wdByImdb(ids, signal) {
    const query = `SELECT ?item ?imdb WHERE { VALUES ?imdb { ${ids.map(x => JSON.stringify(x)).join(" ")} } ?item wdt:P345 ?imdb . }`;
    const j = await getJSON(
        "https://query.wikidata.org/sparql?" + new URLSearchParams({ format: "json", query }),
        signal
    );
    return new Map(j.results.bindings.map(r => [r.imdb.value, r.item.value.split("/").pop()]));
}
async function fixFilmCreators() {
    if (fixFilmCreators.busy || !navigator.onLine) return;
    repairWrongMatches();
    const needQ = [...items.entries()].filter(
        ([, b]) => b.creatorFix && b.medium === "film" && !(b.ext && b.ext.wikidata) && b.ext && b.ext.imdb
    );
    if (needQ.length) {
        try {
            const m = await wdByImdb(needQ.map(([, b]) => b.ext.imdb));
            for (const [id, b] of needQ) {
                const q = m.get(b.ext.imdb);
                if (q) quietPatch(id, { ext: { ...b.ext, wikidata: q } });
            }
        } catch (_) {}
    }
    const todo = [...items.entries()].filter(([, b]) => b.creatorFix && b.medium === "film");
    if (!todo.length) return;
    fixFilmCreators.busy = true;
    try {
        const withQ = todo.filter(([, b]) => b.ext && b.ext.wikidata);
        for (let i = 0; i < withQ.length; i += 40) {
            const chunk = withQ.slice(i, i + 40),
                d = await wdDetails(
                    chunk.map(([, b]) => b.ext.wikidata),
                    undefined,
                    "film"
                );
            for (const [id, b] of chunk) {
                const x = d.get(b.ext.wikidata);
                quietPatch(id, {
                    creator: x && x.creator ? x.creator : b.creator,
                    ...(b.matchRepaired && x
                        ? {
                              genres: (b.genres || []).length ? b.genres : (x.genres || []).slice(0, 6),
                              about: b.about || x.about || "",
                              ext: { ...b.ext, ...(x.article ? { wiki: x.article } : {}) },
                          }
                        : {}),
                    creatorFix: undefined,
                    creatorFixed: true,
                });
            }
            await sleep(400);
        }
        for (const [id, b] of todo.filter(([, b]) => !(b.ext && b.ext.wikidata)))
            quietPatch(id, { creatorFix: undefined, creatorFixed: true, scoresAt: b.scoresAt });
        scheduleSave();
    } catch (_) {}
    fixFilmCreators.busy = false;
}

// once: retry things that never found a picture or a match (a busy moment during a big import), and refresh games that were "upcoming" when added
async function v9Repair() {
    if (meta.settings.v9repair || !navigator.onLine || v9Repair.busy) return;
    v9Repair.busy = true;
    const yr = new Date().getFullYear();
    const todo = [...items.entries()]
        .filter(
            ([, b]) =>
                !b.private &&
                ((!coverSrc(b) &&
                    !["book", "comic"].includes(b.medium) &&
                    !Object.keys(b.ext || {}).some(k =>
                        ["anilist", "mal", "tmdb", "tvmaze", "rawg", "wikidata"].includes(k)
                    )) ||
                    (/\bupcoming\b/i.test(b.about || "") && b.year && b.year <= yr) ||
                    (b.medium === "game" && !(b.platforms || []).length && (b.ext || {}).wikidata))
        )
        .slice(0, 150);
    for (const [id] of todo) {
        try {
            await refreshItem(id);
            updateItemTiles(id);
        } catch (_) {}
        await sleep(350);
    }
    v9Repair.busy = false;
    meta.settings.v9repair = true;
    markDirty();
}
