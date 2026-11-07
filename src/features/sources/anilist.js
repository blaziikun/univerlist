// src/features/sources/anilist.js
// ─────────────────────────────────────────────────────────────────
//  AniList import and sync (one way: AniList → UniverList)
// ─────────────────────────────────────────────────────────────────

const AL_LIST_Q = (
    per,
    fields
) => `query($name:String,$type:MediaType,$chunk:Int){ MediaListCollection(userName:$name, type:$type, chunk:$chunk, perChunk:${per}, forceSingleCompletedList:true){ hasNextChunk
  lists { name isCustomList entries { status score(format: POINT_100) progress progressVolumes repeat notes startedAt { year month day } completedAt { year month day } updatedAt createdAt media { ${fields} } } } } }`;
const AL_USER_LITE = `query($name:String){ User(name:$name){ id name siteUrl avatar { large } bannerImage } }`;
const AL_USER_Q = `query($name:String){ User(name:$name){ id name about(asHtml:false) siteUrl avatar { large } bannerImage
  statistics { anime { count meanScore minutesWatched episodesWatched genres(limit: 12, sort: COUNT_DESC){ genre count meanScore minutesWatched } }
    manga { count meanScore chaptersRead volumesRead genres(limit: 12, sort: COUNT_DESC){ genre count meanScore chaptersRead } } } } }`;
const AL_FAV = {
    anime: `nodes { ${AL_MEDIA} }`,
    manga: `nodes { ${AL_MEDIA} }`,
    animeLite: `nodes { ${AL_MEDIA_LITE} }`,
    mangaLite: `nodes { ${AL_MEDIA_LITE} }`,
    charactersLite: `nodes { id name { full native } image { large } }`,
    characters: `nodes { id name { full native } image { large } gender age description(asHtml:false) media(perPage: 3, sort:[POPULARITY_DESC]){ nodes { id type format countryOfOrigin title { english romaji } } } }`,
    staff: `nodes { id name { full native } image { large } primaryOccupations }`,
    studios: `nodes { id name }`,
};
const AL_STATUS = {
    CURRENT: "active",
    PLANNING: "want",
    COMPLETED: "done",
    DROPPED: "dnf",
    PAUSED: "paused",
    REPEATING: "redo",
};
const alSync = {
    running: false,
    ctl: null,
    phase: "",
    done: 0,
    total: 0,
    msg: "",
    error: "",
    last: null,
    warnings: [],
};
function renderAlStatus() {
    updateBusy();
    const el = $("#alstat");
    if (el) {
        if (!alSync.running && !alSync.error) {
            el.hidden = true;
        } else {
            el.hidden = false;
            el.innerHTML = alSync.error
                ? `<span class="b-ic">⟳</span> AniList: ${esc(alSync.error)} <button class="linkbtn" data-act="al-open">Details</button>`
                : `<span class="b-ic">⟳</span> AniList: ${esc(alSync.msg)}${alSync.total ? ` <span class="progress" style="width:120px;display:inline-block"><span style="width:${Math.round((alSync.done / alSync.total) * 100)}%"></span></span>` : ""} <button class="linkbtn" data-act="al-stop">Stop</button>`;
        }
    }
    if (ui.modal && ui.modal.kind === "anilist") renderOverlay();
}
function alSet(phase, msg, done = 0, total = 0) {
    Object.assign(alSync, { phase, msg, done, total });
    renderAlStatus();
}
AL.onWait = s => alSet(alSync.phase, `AniList asked us to slow down, waiting ${s} s…`, alSync.done, alSync.total);
AL.onRetry = n =>
    alSet(alSync.phase, `AniList's server had a hiccup, trying again (${n} of 2)…`, alSync.done, alSync.total);
const serverMsg = "AniList's servers returned an error (they've been unstable lately)";

// Big lists come in chunks; if AniList's server chokes, retry with smaller chunks and fewer fields.
async function fetchList(name, type, signal) {
    const label = type === "ANIME" ? "anime" : "manga";
    const levels = [
        [500, AL_MEDIA],
        [100, AL_MEDIA],
        [50, AL_MEDIA_LITE],
        [20, AL_MEDIA_LITE],
    ];
    let lastErr;
    for (const [per, fields] of levels) {
        const entries = new Map();
        try {
            for (let chunk = 1; chunk < 80; chunk++) {
                alSet(label, `Reading your ${label} list${chunk > 1 ? " (part " + chunk + ")" : ""}…`);
                const d = await AL.q(AL_LIST_Q(per, fields), { name, type, chunk }, signal);
                const c = d.MediaListCollection;
                for (const l of c.lists || [])
                    for (const e of l.entries || []) {
                        const prev = entries.get(e.media.id);
                        if (prev) {
                            if (l.isCustomList) prev.custom.push(l.name);
                            continue;
                        }
                        entries.set(e.media.id, { ...e, custom: l.isCustomList ? [l.name] : [] });
                    }
                if (!c.hasNextChunk) break;
            }
            return [...entries.values()];
        } catch (e) {
            if (!e.server) throw e;
            lastErr = e;
            alSet(label, `AniList struggled with your ${label} list, asking for smaller pieces…`);
        }
    }
    throw Object.assign(new Error(`${serverMsg} while reading your ${label} list. Try again in a few minutes.`), {
        server: true,
        final: true,
        cause: lastErr,
    });
}
async function fetchFavs(name, kind, signal) {
    for (const k of [kind, kind + "Lite"]) {
        if (!AL_FAV[k]) continue;
        const out = [];
        try {
            for (let page = 1; page < 12; page++) {
                const d = await AL.q(
                    `query($name:String,$page:Int){ User(name:$name){ favourites { ${kind}(page:$page, perPage:25){ pageInfo { hasNextPage } ${AL_FAV[k]} } } } }`,
                    { name, page },
                    signal
                );
                const c = d.User.favourites[kind];
                out.push(...(c.nodes || []));
                if (!c.pageInfo.hasNextPage) break;
            }
            return out;
        } catch (e) {
            if (!e.server) throw e;
        }
    }
    alSync.warnings.push("favourite " + kind);
    return [];
}
function entryFields(e) {
    const s = AL_STATUS[e.status] || "want";
    return {
        status: s,
        rating: e.score ? Math.round(e.score) / 10 : 0,
        prog: e.progress || 0,
        vol: e.progressVolumes || 0,
        repeat: e.repeat || 0,
        rewatching: e.status === "REPEATING",
        startedAt: fuzzy(e.startedAt),
        finishedAt: fuzzy(e.completedAt),
        alUpdated: e.updatedAt || 0,
        alNotes: e.notes || "",
    };
}
async function runAniListSync({ name = meta.settings.anilistUser, details = true, quiet = false } = {}) {
    if (alSync.running) return;
    name = String(name || "").trim();
    if (!name) {
        alSync.error = "Add your AniList username in Settings.";
        renderAlStatus();
        return;
    }
    Object.assign(alSync, { running: true, error: "", ctl: new AbortController(), counts: null });
    const signal = alSync.ctl.signal;
    try {
        alSync.warnings = [];
        alSet("user", "Reading your profile…");
        let u;
        try {
            u = (await AL.q(AL_USER_Q, { name }, signal)).User;
        } catch (e) {
            if (!e.server) throw e;
            try {
                u = (await AL.q(AL_USER_LITE, { name }, signal)).User;
            } catch (e2) {
                if (!e2.server) throw e2;
                u = { name };
            }
            alSync.warnings.push("watch-time stats");
        }
        if (!u || !u.name) u = { name };
        // one list failing shouldn't lose the other
        let anime = [],
            manga = [],
            listErr = null;
        try {
            anime = await fetchList(name, "ANIME", signal);
        } catch (e) {
            if (!e.server) throw e;
            listErr = e;
            alSync.warnings.push("your anime list");
        }
        try {
            manga = await fetchList(name, "MANGA", signal);
        } catch (e) {
            if (!e.server) throw e;
            if (listErr)
                throw Object.assign(
                    new Error(`${serverMsg} on both your anime and manga lists. Try again in a few minutes.`),
                    {
                        server: true,
                        final: true,
                    }
                );
            alSync.warnings.push("your manga list");
        }
        alSet("favs", "Reading your favourites…");
        const fav = {};
        for (const k of ["anime", "manga", "characters", "staff", "studios"]) fav[k] = await fetchFavs(name, k, signal);
        const counts = applyAniList(u, anime, manga, fav);
        alSync.counts = counts;
        meta.settings.anilistUser = u.name;
        meta.settings.alSyncedAt = nowISO();
        markDirty();
        autoLinkAniList();
        afterChange();
        if (!quiet)
            toast(
                `AniList: ${counts.added} added, ${counts.updated} updated, ${counts.chars} characters${alSync.warnings.length ? " (some parts skipped, see AniList sync)" : ""}`,
                counts.added ? { label: "Undo", fn: undo } : null
            );
        if (details) {
            try {
                await fetchAniListDetails(signal);
            } catch (e) {
                if (!e.server) throw e;
                alSync.warnings.push("some descriptions and related works");
            }
        }
        alSync.running = false;
        alSet("done", "");
        scoreQ.start();
    } catch (e) {
        alSync.running = false;
        if (e.name !== "AbortError") console.warn("AniList sync", e);
        if (e.name === "AbortError") {
            alSet("", "");
        } else {
            alSync.error = e.offline
                ? "couldn't reach AniList. Check you're online."
                : /private/i.test(e.message)
                  ? `${name}'s lists are private. Make them public in AniList's settings, or sync later.`
                  : /not found/i.test(e.message)
                    ? `there's no AniList user called ${name}.`
                    : e.final
                      ? e.message
                      : e.server
                        ? serverMsg + ". Try again in a few minutes."
                        : e.message;
            renderAlStatus();
        }
    }
    afterChange();
}
function applyAniList(u, anime, manga, fav) {
    const counts = { added: 0, updated: 0, chars: 0 };
    const byAl = new Map();
    for (const [id, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, id);
    const plan = [];
    for (const e of [...anime, ...manga]) {
        const f = alToFields(e.media),
            ef = entryFields(e);
        let id = byAl.get(e.media.id) || findExisting(f.title, "", f.medium);
        if (!id) {
            id = newId(f.title, f.medium);
            while (plan.some(p => p.id === id)) id += "-x";
        }
        plan.push({ id, f, ef, custom: e.custom, created: e.createdAt });
        byAl.set(e.media.id, id);
    }
    // favourites that aren't on the list still come in, as finished
    const favRank = new Map();
    fav.anime.forEach((m, i) => favRank.set(m.id, i + 1));
    fav.manga.forEach((m, i) => favRank.set(m.id, 100 + i + 1));
    for (const m of [...fav.anime, ...fav.manga])
        if (!byAl.has(m.id)) {
            const f = alToFields(m);
            const id = newId(f.title, f.medium) + (plan.some(p => p.id === newId(f.title, f.medium)) ? "-f" : "");
            plan.push({ id, f, ef: { status: "done" }, custom: [], favOnly: true });
            byAl.set(m.id, id);
        }
    for (const p of plan) p.fav = favRank.get(p.f.ext.anilist) || 0;
    // characters, creators, studios, profile
    const chars = clone(meta.chars || []);
    fav.characters.forEach((c, i) => {
        const nc = charFromAL(c),
            ex = chars.find(x => x.alId === c.id);
        nc.media = nc.media.map(mm => ({ ...mm, id: byAl.get(mm.alId) || null }));
        if (ex) {
            Object.assign(ex, {
                name: nc.name,
                native: nc.native,
                alImage: nc.image,
                media: nc.media,
                about: ex.about || nc.about,
                alRank: i + 1,
            });
        } else {
            chars.push({
                id: "c" + c.id,
                ...nc,
                alImage: nc.image,
                image: "",
                why: "",
                tags: [],
                rank: chars.length + 1,
                alRank: i + 1,
                addedAt: nowISO(),
            });
            counts.chars++;
        }
    });
    const people = clone(meta.people || []);
    for (const s of fav.staff)
        if (!people.some(p => p.alId === s.id))
            people.push({
                id: "p" + s.id,
                alId: s.id,
                name: s.name.full,
                native: s.name.native || "",
                image: (s.image && s.image.large) || "",
                roles: (s.primaryOccupations || []).length ? s.primaryOccupations.slice(0, 4) : ["Creator"],
                fav: true,
                why: "",
            });
    for (const s of fav.studios)
        if (!people.some(p => p.alStudio === s.id))
            people.push({
                id: "s" + s.id,
                alStudio: s.id,
                name: s.name,
                image: "",
                roles: ["Studio"],
                fav: true,
                why: "",
            });
    const metaBefore = {
        chars: clone(meta.chars),
        people: clone(meta.people),
        profile: clone(meta.profile),
        favOrder: clone(meta.favOrder),
    };
    // AniList favourites join the master order, in AniList's order, after the ones you already have
    const favIdsAL = plan
        .filter(p => p.fav)
        .sort((a, b) => a.fav - b.fav)
        .map(p => p.id);
    meta.favOrder = [...meta.favOrder, ...favIdsAL.filter(id => !meta.favOrder.includes(id))];
    const prof = clone(meta.profile);
    const oldAl = prof.anilist || {};
    prof.anilist = {
        id: u.id || oldAl.id,
        name: u.name,
        about: stripMd(u.about || oldAl.about || ""),
        url: u.siteUrl || `https://anilist.co/user/${u.name}`,
        avatar: (u.avatar && u.avatar.large) || oldAl.avatar || "",
        banner: u.bannerImage || oldAl.banner || "",
        stats: u.statistics || oldAl.stats,
        syncedAt: nowISO(),
    };
    if (!prof.name) prof.name = u.name;
    meta.chars = chars;
    meta.people = people;
    meta.profile = prof;
    change(
        `Sync AniList (${u.name})`,
        plan.map(p => p.id),
        (b, id) => {
            const p = plan.find(x => x.id === id);
            const mediaFields = { ...p.f };
            delete mediaFields.title;
            if (!b) {
                counts.added++;
                return migrateItem({
                    ...p.f,
                    ...p.ef,
                    tags: p.custom,
                    notes: p.ef.alNotes || "",
                    addedAt: p.created ? new Date(p.created * 1000).toISOString() : nowISO(),
                    source: "anilist",
                    fav: p.fav,
                    favOnly: p.favOnly || undefined,
                });
            }
            const keep = (k, v) => {
                if (v == null || v === "") return false;
                if (k === "cover") return !b.coverData && !b.coverPicked;
                if (k === "kind") return !b.kind;
                if (k === "about" || k === "ext" || k === "scores" || k === "alt") return false;
                return true;
            };
            const u2 = { ...b, ...Object.fromEntries(Object.entries(mediaFields).filter(([k, v]) => keep(k, v))) };
            u2.ext = { ...(b.ext || {}), ...p.f.ext };
            u2.scores = { ...(b.scores || {}), ...p.f.scores };
            u2.alt = { ...(b.alt || {}), ...p.f.alt };
            if (!p.favOnly && (p.ef.alUpdated || 0) > (b.alUpdated || 0)) {
                Object.assign(u2, p.ef);
                delete u2.alNotes;
                if (p.ef.alNotes && !String(b.notes || "").includes(p.ef.alNotes))
                    u2.notes = [b.notes, p.ef.alNotes].filter(Boolean).join("\n\n");
                counts.updated++;
            }
            if (p.fav) u2.fav = p.fav;
            else if (b.fav && b.source === "anilist" && !b.favLocal) u2.fav = 0;
            u2.tags = [...new Set([...(b.tags || []), ...p.custom])];
            return u2;
        },
        { metaBefore }
    );
    for (const t of new Set(plan.flatMap(p => p.custom))) ensureTag(t);
    return counts;
}
// descriptions, creators and related works for AniList items that don't have them yet
async function fetchAniListDetails(signal) {
    const ids = [...items.entries()]
        .filter(([, b]) => b.ext && b.ext.anilist && !b.relAt)
        .map(([id, b]) => [id, b.ext.anilist]);
    if (!ids.length) return;
    for (let i = 0; i < ids.length; i += 10) {
        alSet(
            "details",
            `Reading details and related works: ${Math.min(i + 10, ids.length)} of ${ids.length}`,
            i,
            ids.length
        );
        const chunk = ids.slice(i, i + 10);
        const d = await alDetails(
            chunk.map(x => x[1]),
            signal
        );
        for (const [id, al] of chunk) {
            const x = d.get(al),
                b = items.get(id);
            if (!x || !b) continue;
            const p = { rel: x.rel || [], relAt: nowISO() };
            if (!b.about && x.about) p.about = x.about;
            if (x.creatorPeople && b.medium !== "anime" && !b.creator) p.creator = x.creatorPeople.join(" & ");
            if (x.creatorPeople && b.medium === "anime") p.staff = x.creatorPeople;
            quietPatch(id, p);
        }
        if (i % 30 === 0) scheduleSave();
    }
    autoLinkAniList();
    scheduleSave();
    afterChange();
}
// related works that are both in the library become cross-links (both directions)
function autoLinkAniList() {
    const byAl = new Map();
    for (const [id, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, id);
    for (const [id, b] of items) {
        for (const r of b.rel || []) {
            const other = byAl.get(r.id);
            if (!other || other === id) continue;
            const add = (from, to, type) => {
                const x = items.get(from);
                if ((x.links || []).some(l => l.id === to)) return;
                quietPatch(from, { links: [...(x.links || []), { id: to, type, auto: "anilist" }] });
            };
            add(id, other, r.type === "prequel" ? "prequel" : r.type === "sequel" ? "sequel" : r.type);
            add(other, id, r.type === "prequel" ? "sequel" : r.type === "sequel" ? "prequel" : r.type);
        }
    }
}
function ensureTag(name) {
    if (!meta.tags[name]) {
        const used = Object.values(meta.tags).map(t => t.color);
        meta.tags[name] = {
            color:
                TAG_COLORS.find(c => !used.includes(c)) ||
                TAG_COLORS[Object.keys(meta.tags).length % TAG_COLORS.length],
        };
        markDirty();
    }
}
