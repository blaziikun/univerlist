// src/features/library/item-actions.js
// ─────────────────────────────────────────────────────────────────
//  Actions on items
// ─────────────────────────────────────────────────────────────────

function removeFromQueue(id) {
    if (meta.queue.includes(id)) {
        meta.queue = meta.queue.filter(x => x !== id);
        markDirty();
    }
}
function setStatus(id, s) {
    const was = items.get(id);
    if (!was) return;
    change(statusWord(s, was.medium), id, b => {
        const prev = b.status;
        b.status = s;
        if (s === "active" && !b.startedAt) b.startedAt = nowISO();
        if (s === "dnf") b.droppedAt = nowISO();
        else if (prev === "dnf") delete b.droppedAt;
        if (s === "done") {
            if (prev !== "done" || !b.finishedAt) b.finishedAt = nowISO();
            if (b.total && b.medium !== "game") b.prog = b.total;
            if (!b.startedAt) b.startedAt = b.finishedAt;
            if (b.medium === "film" && prev !== "done")
                b.log = [...(b.log || []), { date: nowISO(), from: 0, to: b.runtime || 115, min: b.runtime || 115 }];
        }
        b.lastAt = nowISO();
        return b;
    });
    if (s !== "want") removeFromQueue(id);
    if (s === "done")
        toast(
            `${STATUS_WORDS[MEDIA[was.medium].group].done}: ${cleanTitle(titleOf(was))}. Right-click its cover to score it.`,
            { label: "Undo", fn: undo }
        );
}
function finishItem(id) {
    const b = items.get(id);
    if (!b) return;
    if (b.medium === "film" && b.status === "done") {
        change("Watched again", id, x => ({
            ...x,
            repeat: (x.repeat || 0) + 1,
            finishedAt: nowISO(),
            lastAt: nowISO(),
            log: [...(x.log || []), { date: nowISO(), from: 0, to: x.runtime || 115, min: x.runtime || 115 }],
        }));
        toast("Logged another watch", { label: "Undo", fn: undo });
        return;
    }
    setStatus(id, "done");
}
function logProgress(id, to, extra = {}) {
    const b = items.get(id);
    if (!b) return;
    to = Math.max(0, Math.round(to * 10) / 10);
    if (b.total && b.medium !== "game") to = Math.min(to, b.total);
    const from = b.prog || 0,
        lane = extra.lane;
    if (to === from && (!lane || lane === b.lane) && extra.vol == null) return;
    change("Log progress", id, x => {
        if (to !== from)
            x.log = [
                ...(x.log || []),
                { date: nowISO(), from, to, lane: lane || (x.medium === "book" ? x.lane || "" : "") },
            ];
        x.prog = to;
        x.lastAt = nowISO();
        if (lane) x.lane = lane;
        if (extra.vol != null) x.vol = extra.vol;
        if (!["active", "done"].includes(x.status) && to > 0) {
            x.status = "active";
            if (!x.startedAt) x.startedAt = nowISO();
        }
        if (x.total && to >= x.total && x.status !== "done" && x.medium !== "game") {
            x.status = "done";
            x.finishedAt = nowISO();
        }
        return x;
    });
    removeFromQueue(id);
    const nb = items.get(id);
    toast(
        nb.status === "done" && b.status !== "done"
            ? `${STATUS_WORDS[MEDIA[nb.medium].group].done}: ${cleanTitle(titleOf(nb))}!`
            : `${progText(nb)} · ${cleanTitle(titleOf(nb))}`,
        { label: "Undo", fn: undo }
    );
}
function addTagTo(ids, name) {
    name = name.trim().slice(0, 40);
    if (!name) return;
    ensureTag(name);
    change("Tag " + name, ids, b =>
        (b.tags || []).includes(name) ? undefined : { ...b, tags: [...(b.tags || []), name] }
    );
}
function queueAdd(ids) {
    const add = [].concat(ids).filter(id => !meta.queue.includes(id) && items.has(id));
    if (!add.length) return;
    changeMeta("Add to Up next", "queue", q => [...q, ...add]);
    toast(
        add.length === 1
            ? `Added ${cleanTitle(titleOf(items.get(add[0])))} to Up next`
            : `Added ${add.length} to Up next`,
        { label: "Undo", fn: undo }
    );
}
function openItem(id, seq) {
    closeCtx();
    if (ui.modal && ui.modal.kind === "item") {
        Object.assign(ui.modal, {
            id,
            seq: seq && seq.includes(id) ? seq : ui.modal.seq && ui.modal.seq.includes(id) ? ui.modal.seq : null,
            tab: ["art", "cast", "chars"].includes(ui.modal.tab) ? "overview" : ui.modal.tab,
            art: null,
            cast: null,
            eps: null,
            season: null,
            adapt: null,
            confirmDelete: false,
            editing: false,
            error: "",
            refreshNote: "",
        });
        renderOverlay();
    } else openModal("item", { id, tab: "overview", seq: seq && seq.includes(id) ? seq : null });
}
function stepItem(d) {
    const m = ui.modal;
    if (!m || m.kind !== "item") return;
    const L = m.seq && m.seq.length ? m.seq : listOrder,
        i = L.indexOf(m.id);
    const n = L[i + d];
    if (n) openItem(n, L);
}
// favourites: one master order (meta.favOrder) that every mode shows its slice of
function toggleFav(id) {
    const b = items.get(id);
    if (!b) return;
    if (b.fav) {
        change(
            "Unfavourite " + titleOf(b),
            id,
            x => {
                meta.favOrder = meta.favOrder.filter(f => f !== id);
                return { ...x, fav: 0, favLocal: true };
            },
            { metaKeys: ["favOrder"] }
        );
        toast("Removed from favourites", { label: "Undo", fn: undo });
    } else {
        change(
            "Favourite " + titleOf(b),
            id,
            x => {
                meta.favOrder = [...meta.favOrder.filter(f => f !== id), id];
                return { ...x, fav: 1, favLocal: true };
            },
            { metaKeys: ["favOrder"] }
        );
        toast(`Favourite #${favPos(id) + 1}. Add a picture and why from Favourites.`, { label: "Undo", fn: undo });
    }
}
function favMove(id, d) {
    const vis = modeItems()
            .filter(b => b.fav)
            .sort((a, b) => favPos(a.id) - favPos(b.id))
            .map(b => b.id),
        i = vis.indexOf(id),
        j = i + d;
    if (i < 0 || j < 0 || j >= vis.length) return;
    changeMeta("Reorder favourites", "favOrder", F => {
        const a = F.indexOf(id),
            c = F.indexOf(vis[j]);
        if (a < 0 || c < 0) return F;
        [F[a], F[c]] = [F[c], F[a]];
        return F;
    });
}
function favDrop(from, to) {
    if (from === to) return;
    changeMeta("Reorder favourites", "favOrder", F => {
        const was = F.indexOf(from),
            at = F.indexOf(to);
        if (was < 0 || at < 0) return F;
        const a = F.filter(x => x !== from);
        a.splice(a.indexOf(to) + (was < at ? 1 : 0), 0, from);
        return a;
    });
}
// lists
const newListId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function createList(p) {
    const id = newListId();
    changeMeta("New list " + p.name, "lists", L => [
        ...L,
        {
            id,
            name: p.name || "Untitled list",
            desc: p.desc || "",
            numbered: p.numbered !== false,
            mode: p.mode || "",
            private: ui.private || undefined,
            ids: [...new Set(p.ids || [])],
            notes: {},
            created: nowISO(),
        },
    ]);
    return id;
}
function listIds(lid) {
    return lid === "queue" ? meta.queue : (meta.lists.find(l => l.id === lid) || { ids: [] }).ids;
}
function setListIds(lid, fn, label) {
    if (lid === "queue") return changeMeta(label, "queue", q => fn(q));
    changeMeta(label, "lists", L => L.map(l => (l.id === lid ? { ...l, ids: fn(l.ids.slice()) } : l)));
}
function listAdd(lid, ids) {
    ids = [].concat(ids).filter(id => items.has(id));
    if (!ids.length) return;
    setListIds(lid, a => [...a, ...ids.filter(x => !a.includes(x))], "Add to list");
}
function listMove(lid, id, d) {
    setListIds(
        lid,
        a => {
            const i = a.indexOf(id),
                j = i + d;
            if (i < 0 || j < 0 || j >= a.length) return a;
            [a[i], a[j]] = [a[j], a[i]];
            return a;
        },
        "Reorder list"
    );
}
function listDrop(lid, from, to) {
    setListIds(
        lid,
        a => {
            const was = a.indexOf(from),
                at = a.indexOf(to);
            if (was < 0 || at < 0 || from === to) return a;
            const b = a.filter(x => x !== from);
            b.splice(b.indexOf(to) + (was < at ? 1 : 0), 0, from);
            return b;
        },
        "Reorder list"
    );
}
// people: a saved record per person, with any number of roles and credits
function savePerson(name, fn, label = "Edit person") {
    name = String(name || "").trim();
    if (!name) return null;
    let rec = (meta.people || []).find(p => norm(p.name) === norm(name));
    const derived = peopleIndex(modeById("universal")).find(p => norm(p.name) === norm(name));
    const base = rec || {
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        name,
        roles: derived ? derived.roles : [],
        credits: [],
        why: "",
        image: "",
        fav: false,
        addedAt: nowISO(),
    };
    if (!base.roles) base.roles = base.role ? [base.role] : [];
    const next = fn({ ...base, roles: [...base.roles], credits: [...(base.credits || [])] });
    changeMeta(label, "people", L => (rec ? L.map(p => (p.id === rec.id ? next : p)) : [...(L || []), next]));
    return next;
}
async function addFromAniList(alId, srcId, statusOverride) {
    toast("Adding from AniList…");
    try {
        const d = (await alDetails([alId])).get(alId);
        if (!d) {
            toast("AniList didn't return that one.");
            return;
        }
        const nid = addItem(
            { ...d, status: statusOverride || "want", source: "anilist", relAt: nowISO() },
            "Add " + d.title
        );
        if (srcId && items.has(srcId)) {
            const r = (items.get(srcId).rel || []).find(x => x.id === alId);
            linkItems(srcId, nid, r ? r.type : "world");
        }
        autoLinkAniList();
        afterChange();
        toast("Added " + d.title, { label: "Open", fn: () => openItem(nid) });
        cacheAndColour(nid).then(() => updateItemTiles(nid));
        return nid;
    } catch (e) {
        toast(e.offline ? "Couldn't reach AniList." : "AniList: " + e.message);
    }
}
async function addFromWikidata(r, srcId) {
    const nid = addItem(
        {
            medium: r.medium,
            title: r.title,
            year: r.year || null,
            ext: { wikidata: r.qid },
            why: r.reason || "",
            source: "wikidata",
        },
        "Add " + r.title
    );
    if (srcId) linkItems(srcId, nid, "adaptation");
    toast("Added " + r.title + ". Filling in details…", { label: "Undo", fn: undo });
    try {
        await refreshItem(nid);
        await cacheAndColour(nid);
        afterChange();
    } catch (_) {}
    return nid;
}
async function itemRefresh(id) {
    const m = ui.modal;
    m.refreshing = true;
    m.refreshNote = "";
    renderOverlay();
    try {
        const r = await refreshItem(id);
        m.refreshNote =
            r.got && r.got.length
                ? "Updated from " + [...new Set(r.got)].join(", ") + "."
                : "No source had anything new.";
        await cacheAndColour(id);
        updateItemTiles(id);
    } catch (e) {
        m.refreshNote = "Couldn't reach the sources. Are you online?";
    }
    m.refreshing = false;
    if (ui.modal === m) renderOverlay();
    renderMain();
}
// characters and cast of one thing in your library, from whichever free source knows it (cached for this session)
const castCache = new Map(),
    castFrom = new Map();
async function fetchCast(id) {
    if (castCache.has(id)) return castCache.get(id);
    const b = items.get(id);
    if (!b) return [];
    let cast = [],
        from = null;
    if (b.ext.anilist) {
        cast = await alCharacters(b.ext.anilist);
        from = { src: "AniList" };
    } else if (TMDB_ON() && b.ext.tmdb) {
        cast = (await tmdbDetails(b.ext.tmdb, b.ext.tmdbType || (b.medium === "film" ? "movie" : "tv"))).cast || [];
        from = { src: "TMDB" };
    } else if (b.medium === "tv") {
        // TVmaze needs no key. The IMDb id is exact; a title search has to agree on the year too
        let s = b.ext.imdb && !b.castPicked ? await tvmazeByImdb(b.ext.imdb).catch(() => null) : null;
        if (!s && b.ext.tvmaze) s = await tvmazeShow(b.ext.tvmaze);
        if (!s) {
            const r = pickShow(await tvmazeSearch(cleanTitle(b.title)), b);
            if (r) s = await tvmazeShow(r.ext.tvmaze);
        }
        if (s) {
            cast = castSplit(s.cast || []);
            from = { src: "TVmaze", title: s.title, year: s.year };
            if ((b.ext || {}).tvmaze !== s.ext.tvmaze) quietPatch(id, { ext: { ...b.ext, ...s.ext } });
        }
    }
    if (!cast.length && b.medium === "game" && IGDB_ON()) {
        try {
            const gid = await igdbFind(b);
            if (gid) {
                if ((b.ext || {}).igdb !== gid) quietPatch(id, { ext: { ...items.get(id).ext, igdb: gid } });
                cast = await igdbCharacters(gid);
                from = { src: "IGDB" };
            }
        } catch (_) {}
    }
    // films, games and books: Wikidata, no key. An IMDb id finds the exact film; otherwise the title, kind and year
    if (!cast.length && ["film", "tv", "game", "book", "comic"].includes(b.medium)) {
        let q = null;
        if (b.ext.imdb && !b.castPicked) {
            try {
                q = (await wdByImdb([b.ext.imdb])).get(b.ext.imdb) || null;
            } catch (_) {}
        }
        q = q || b.ext.wikidata || (await wdFind((b.alt && b.alt.en) || b.title, b.medium, b.year));
        if (q) {
            if (b.ext.wikidata !== q) quietPatch(id, { ext: { ...items.get(id).ext, wikidata: q } });
            cast = await wdCast(q, undefined, b.medium);
            from = { src: "Wikidata", q };
        }
    }
    castFrom.set(id, from);
    castCache.set(id, cast);
    return cast;
}
// when the list belongs to a different title of the same name: choose the right one
async function castPickOpen(m, q) {
    const b = items.get(m.id);
    m.castPick = { q: q || cleanTitle(b.title), busy: true, res: [] };
    renderOverlay();
    try {
        if (b.medium === "tv")
            for (const r of (await tvmazeSearch(m.castPick.q)).slice(0, 8))
                m.castPick.res.push({
                    title: r.title,
                    sub: [r.year, r.creator].filter(Boolean).join(" · ") || "TVmaze",
                    tvmaze: r.ext.tvmaze,
                });
        const j = await getJSON(
            "https://www.wikidata.org/w/api.php?" +
                new URLSearchParams({
                    action: "wbsearchentities",
                    search: m.castPick.q,
                    language: "en",
                    type: "item",
                    limit: "12",
                    format: "json",
                    origin: "*",
                })
        );
        const re = WD_MEDIUM[b.medium] || null;
        for (const h of (j.search || []).filter(h => !re || re.test(h.description || "")).slice(0, 8))
            m.castPick.res.push({ title: h.label, sub: h.description || "Wikidata", wikidata: h.id });
    } catch (_) {}
    m.castPick.busy = false;
    if (ui.modal === m) renderOverlay();
}
async function loadCast(m) {
    m.busy = "cast";
    m.error = "";
    renderOverlay();
    try {
        m.cast = await fetchCast(m.id);
        charImagesLater(m);
    } catch (e) {
        m.error =
            e.name === "TimeoutError" || e.name === "AbortError"
                ? "The source took too long to answer. Try again in a moment."
                : "Couldn't load characters. Are you online?";
        m.cast = null;
    }
    m.busy = null;
    if (ui.modal === m) renderOverlay();
}
// TMDB and TVmaze picture the actor, not the character: look the characters up on Wikidata (and their Wikipedia pages) for their own pictures
async function charImagesLater(m) {
    const b = items.get(m.id),
        from = castFrom.get(m.id) || {};
    if (
        !b ||
        !["film", "tv"].includes(b.medium) ||
        !["TMDB", "TVmaze"].includes(from.src) ||
        !(m.cast || []).some(c => c.name && !c.image)
    )
        return;
    try {
        let q = b.ext.wikidata || null;
        if (!q && b.ext.imdb) q = (await wdByImdb([b.ext.imdb])).get(b.ext.imdb) || null;
        if (!q) q = await wdFind((b.alt && b.alt.en) || b.title, b.medium, b.year);
        if (!q) return;
        const W = await wdCast(q, undefined, b.medium),
            byName = new Map();
        for (const c of W) if (c.name && c.image) byName.set(norm(c.name), c.image);
        let n = 0;
        for (const c of m.cast)
            if (c.name && !c.image) {
                const img =
                    byName.get(norm(c.name)) ||
                    [...byName.entries()].find(
                        ([k]) => k.split(" ")[0] === norm(c.name).split(" ")[0] && k.length > 3
                    )?.[1];
                if (img) {
                    c.image = img;
                    n++;
                }
            }
        // still missing: each character's own Wikipedia article (a still of them in the role)
        const left = m.cast.filter(c => c.name && !c.image).slice(0, 12),
            work = cleanTitle(b.title);
        for (let i = 0; i < left.length; i += 3)
            await Promise.all(
                left.slice(i, i + 3).map(async c => {
                    try {
                        const u = await wikiCharImage(c.name, work);
                        if (u) {
                            c.image = u;
                            n++;
                        }
                    } catch (_) {}
                })
            );
        if (n && ui.modal === m) renderOverlay();
    } catch (_) {}
}
function charFromCast(c, it) {
    return {
        id: "c" + (c.alId || Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
        src: c.src,
        alId: c.alId,
        name: c.name || c.va,
        native: c.native || "",
        alImage: c.src === "anilist" ? c.image : "",
        image: c.src === "anilist" ? "" : c.image,
        media: [{ id: it.id, alId: it.ext && it.ext.anilist, title: titleOf(it), medium: it.medium }],
        why: "",
        tags: [],
        about: "",
        va: c.va || "",
        addedAt: nowISO(),
        rank: meta.chars.length + 1,
    };
}
function addChar(c) {
    changeMeta("Add " + c.name, "chars", list =>
        list.some(x => c.alId && x.alId === c.alId) ? list : [...list, { ...c, rank: list.length + 1 }]
    );
    toast(`Added ${c.name} to your characters`, { label: "Open", fn: () => openModal("char", { id: c.id }) });
}
function patchChar(id, p, label = "Edit character") {
    changeMeta(label, "chars", list => list.map(c => (c.id === id ? { ...c, ...p } : c)));
}
function placeTier(t, key, row) {
    changeMeta("Move in tier list", "tiers", T =>
        T.map(x => {
            if (x.id !== t.id) return x;
            const rows = x.rows.map(r => ({ ...r, ids: r.ids.filter(k => k !== key) }));
            if (row !== "pool" && rows[row]) rows[row].ids.push(key);
            return { ...x, rows };
        })
    );
}
// private entries get an anonymous id so nothing public (ids, lists, links) reveals the title, and they're only ever stored encrypted
function makePrivate(id) {
    if (!vault.key || !items.has(id)) return id;
    const nid = anonId();
    rekeyItem(id, nid);
    vault.ids.add(nid);
    items.set(nid, { ...items.get(nid), private: true });
    markDirty(nid);
    vault.sealDue = true;
    history.length = 0;
    future.length = 0;
    scheduleSave();
    return nid;
}
function makePublic(id) {
    const b = items.get(id);
    if (!b || !vault.ids.has(id)) return id;
    const nid = newId(b.title, b.medium);
    vault.ids.delete(id);
    rekeyItem(id, nid);
    const x = { ...items.get(nid) };
    delete x.private;
    items.set(nid, x);
    markDirty(nid);
    vault.sealDue = true;
    scheduleSave();
    return nid;
}
let lockTimer = null;
async function lockVault() {
    if (!vault.key) return;
    try {
        await vaultSeal();
    } catch (_) {}
    vaultLock();
    ui.private = false;
    resetSub();
    if (ui.modal && ui.modal.kind === "item" && !items.has(ui.modal.id)) closeModal();
    render();
}
addEventListener("visibilitychange", () => {
    clearTimeout(lockTimer);
    const mins = +meta.settings.vaultAuto || 0;
    if (document.visibilityState === "hidden" && vault.key && mins) lockTimer = setTimeout(lockVault, mins * 60000);
});
