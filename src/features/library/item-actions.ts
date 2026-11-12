// src/features/library/item-actions.ts
// ─────────────────────────────────────────────────────────────────
//  Actions on items
// ─────────────────────────────────────────────────────────────────

import {
    addItem,
    anonId,
    change,
    changeMeta,
    cleanTitle,
    errMessage,
    errName,
    future,
    history,
    isRecord,
    items,
    linkItems,
    listOf,
    markDirty,
    MEDIA,
    meta,
    modeById,
    newId,
    norm,
    nowISO,
    present,
    quietPatch,
    rekeyItem,
    scheduleSave,
    stateChanged,
    STATUS_WORDS,
    statusWord,
    titleOf,
    toast,
    toList,
    ui,
    undo,
    vault,
    vaultLock,
    vaultSeal,
} from "../core/core";
import {
    alCharacters,
    alDetails,
    castSplit,
    getJSON,
    pickShow,
    refreshItem,
    tmdbDetails,
    tvmazeByImdb,
    tvmazeSearch,
    tvmazeShow,
    WD_MEDIUM,
    wdCast,
    wdFind,
} from "../sources/sources";
import { IGDB_ON, igdbCharacters, igdbFind } from "../sources/igdb";
import { TMDB_ON } from "../sources/proxy";
import { autoLinkAniList, ensureTag } from "../sources/anilist";
import { cacheAndColour, updateItemTiles, wdByImdb } from "../sources/covers";
import { wikiCharImage } from "../sources/box-art";
import { favPos, modeItems, progText } from "../core/views";
import { renderMain } from "../core/shell";
import { listOrder } from "./library";
import { peopleIndex } from "./connect";
import { closeModal, openModal, renderOverlay } from "../core/modals";
import { closeCtx } from "../core/keys";
import { afterChange, render, resetSub } from "../core/navigation";
import type { CastMember, FavChar, FavPerson, Item, Modal, Status } from "../core/model";

export function removeFromQueue(id: string) {
    if (meta.queue.includes(id)) {
        meta.queue = meta.queue.filter(x => x !== id);
        markDirty();
    }
}
export function setStatus(id: string, s: Status) {
    const was = items.get(id);
    if (!was) return;
    change(statusWord(s, was.medium), id, b => {
        if (!b) return undefined;
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
export function finishItem(id: string) {
    const b = items.get(id);
    if (!b) return;
    if (b.medium === "film" && b.status === "done") {
        change("Watched again", id, x =>
            x
                ? {
                      ...x,
                      repeat: (x.repeat || 0) + 1,
                      finishedAt: nowISO(),
                      lastAt: nowISO(),
                      log: [...(x.log || []), { date: nowISO(), from: 0, to: x.runtime || 115, min: x.runtime || 115 }],
                  }
                : undefined
        );
        toast("Logged another watch", { label: "Undo", fn: undo });
        return;
    }
    setStatus(id, "done");
}
export function logProgress(id: string, to: number, extra: { lane?: string; vol?: number | null } = {}) {
    const b = items.get(id);
    if (!b) return;
    to = Math.max(0, Math.round(to * 10) / 10);
    if (b.total && b.medium !== "game") to = Math.min(to, b.total);
    const from = b.prog || 0,
        lane = extra.lane;
    if (to === from && (!lane || lane === b.lane) && extra.vol == null) return;
    change("Log progress", id, x => {
        if (!x) return undefined;
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
    if (!nb) return;
    toast(
        nb.status === "done" && b.status !== "done"
            ? `${STATUS_WORDS[MEDIA[nb.medium].group].done}: ${cleanTitle(titleOf(nb))}!`
            : `${progText(nb)} · ${cleanTitle(titleOf(nb))}`,
        { label: "Undo", fn: undo }
    );
}
export function addTagTo(ids: string | string[], name: string) {
    name = name.trim().slice(0, 40);
    if (!name) return;
    ensureTag(name);
    change("Tag " + name, ids, b =>
        !b || (b.tags || []).includes(name) ? undefined : { ...b, tags: [...(b.tags || []), name] }
    );
}
export function queueAdd(ids: string | string[]) {
    const add = toList(ids).filter(id => !meta.queue.includes(id) && items.has(id));
    if (!add.length) return;
    changeMeta("Add to Up next", "queue", q => [...q, ...add]);
    toast(
        add.length === 1
            ? `Added ${cleanTitle(titleOf(items.get(add[0]) || { title: "" }))} to Up next`
            : `Added ${add.length} to Up next`,
        { label: "Undo", fn: undo }
    );
}
export function openItem(id: string, seq?: string[] | null) {
    closeCtx();
    if (ui.modal && ui.modal.kind === "item") {
        Object.assign(ui.modal, {
            id,
            seq: seq && seq.includes(id) ? seq : ui.modal.seq && ui.modal.seq.includes(id) ? ui.modal.seq : null,
            tab: ["art", "cast", "chars"].includes(ui.modal.tab || "") ? "overview" : ui.modal.tab,
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
export function stepItem(d: number) {
    const m = ui.modal;
    if (!m || m.kind !== "item") return;
    const L = m.seq && m.seq.length ? m.seq : listOrder,
        i = L.indexOf(m.id || "");
    const n = L[i + d];
    if (n) openItem(n, L);
}
// favourites: one master order (meta.favOrder) that every mode shows its slice of
export function toggleFav(id: string) {
    const b = items.get(id);
    if (!b) return;
    if (b.fav) {
        change(
            "Unfavourite " + titleOf(b),
            id,
            x => {
                meta.favOrder = meta.favOrder.filter(f => f !== id);
                return x ? { ...x, fav: 0, favLocal: true } : undefined;
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
                return x ? { ...x, fav: 1, favLocal: true } : undefined;
            },
            { metaKeys: ["favOrder"] }
        );
        toast(`Favourite #${favPos(id) + 1}. Add a picture and why from Favourites.`, { label: "Undo", fn: undo });
    }
}
export function favMove(id: string, d: number) {
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
export function favDrop(from: string, to: string) {
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
/** a character dragged onto another: it goes before or after that one, and every character's place is saved */
export function charDrop(from: string, to: string) {
    if (to === from) return;
    changeMeta("Reorder characters", "chars", list => {
        const ids = list
                .slice()
                .sort((a, b) => (a.rank || 999) - (b.rank || 999))
                .map(c => c.id),
            a = ids.filter(x => x !== from),
            was = ids.indexOf(from),
            at = ids.indexOf(to);
        a.splice(a.indexOf(to) + (was < at ? 1 : 0), 0, from);
        return a
            .map(id => list.find(c => c.id === id))
            .filter(present)
            .map((c, i) => ({ ...c, rank: i + 1 }));
    });
}
// lists
export const newListId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
export function createList(p: { name: string; desc?: string; numbered?: boolean; mode?: string; ids?: string[] }) {
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
export function listIds(lid: string): string[] {
    return lid === "queue" ? meta.queue : meta.lists.find(l => l.id === lid)?.ids || [];
}
export function setListIds(lid: string, fn: (ids: string[]) => string[], label: string) {
    if (lid === "queue") return changeMeta(label, "queue", q => fn(q));
    changeMeta(label, "lists", L => L.map(l => (l.id === lid ? { ...l, ids: fn(l.ids.slice()) } : l)));
}
export function listAdd(lid: string, ids: string | string[]) {
    const add = toList(ids).filter(id => items.has(id));
    if (!add.length) return;
    setListIds(lid, a => [...a, ...add.filter(x => !a.includes(x))], "Add to list");
}
export function listMove(lid: string, id: string, d: number) {
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
export function listDrop(lid: string, from: string, to: string) {
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
export function savePerson(who: unknown, fn: (p: FavPerson) => FavPerson, label = "Edit person"): FavPerson | null {
    const name = String(who || "").trim();
    if (!name) return null;
    const rec = (meta.people || []).find(p => norm(p.name) === norm(name));
    const derived = peopleIndex(modeById("universal")).find(p => norm(p.name) === norm(name));
    const base: FavPerson = rec || {
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
export async function addFromAniList(alId: number, srcId?: string, statusOverride?: Status) {
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
        const src = srcId ? items.get(srcId) : undefined;
        if (srcId && src) {
            const r = (src.rel || []).find(x => x.id === alId);
            linkItems(srcId, nid, r?.type || "world");
        }
        autoLinkAniList();
        afterChange();
        toast("Added " + d.title, { label: "Open", fn: () => openItem(nid) });
        cacheAndColour(nid).then(() => updateItemTiles(nid));
        return nid;
    } catch (e) {
        toast(isRecord(e) && e.offline ? "Couldn't reach AniList." : "AniList: " + errMessage(e));
    }
}
/** a Wikidata item to add: what discovery or a card's adaptations found */
export interface WikidataFind {
    medium: string;
    title: string;
    year?: number | null;
    qid: string;
    reason?: string;
}
export async function addFromWikidata(r: WikidataFind, srcId?: string) {
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
export async function itemRefresh(id: string) {
    const m = ui.modal;
    if (!m) return;
    m.refreshing = true;
    m.refreshNote = "";
    stateChanged("ui");
    try {
        const r = await refreshItem(id),
            got = isRecord(r) ? listOf(r.got).map(String) : [];
        m.refreshNote = got.length
            ? "Updated from " + [...new Set(got)].join(", ") + "."
            : "No source had anything new.";
        await cacheAndColour(id);
        updateItemTiles(id);
    } catch (_) {
        m.refreshNote = "Couldn't reach the sources. Are you online?";
    }
    m.refreshing = false;
    stateChanged("ui");
    renderMain();
}
// characters and cast of one thing in your library, from whichever free source knows it (cached for this session)
/** where a cast list came from: the catalogue, and the title it matched there */
export interface CastFrom {
    src: string;
    title?: string;
    year?: number | null;
    q?: string;
}
export const castCache = new Map<string, CastMember[]>(),
    castFrom = new Map<string, CastFrom | null>();
export async function fetchCast(id: string): Promise<CastMember[]> {
    const cached = castCache.get(id);
    if (cached) return cached;
    const b = items.get(id);
    if (!b) return [];
    let cast: CastMember[] = [],
        from: CastFrom | null = null;
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
            if (r?.ext?.tvmaze) s = await tvmazeShow(r.ext.tvmaze);
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
                if ((b.ext || {}).igdb !== gid) quietPatch(id, { ext: { ...items.get(id)?.ext, igdb: gid } });
                cast = await igdbCharacters(gid);
                from = { src: "IGDB" };
            }
        } catch (_) {}
    }
    // films, games and books: Wikidata, no key. An IMDb id finds the exact film; otherwise the title, kind and year
    if (!cast.length && ["film", "tv", "game", "book", "comic"].includes(b.medium)) {
        let q: string | null = null;
        if (b.ext.imdb && !b.castPicked) {
            try {
                q = (await wdByImdb([b.ext.imdb])).get(b.ext.imdb) || null;
            } catch (_) {}
        }
        q = q || b.ext.wikidata || (await wdFind((b.alt && b.alt.en) || b.title, b.medium, b.year));
        if (q) {
            if (b.ext.wikidata !== q) quietPatch(id, { ext: { ...items.get(id)?.ext, wikidata: q } });
            cast = await wdCast(q, undefined, b.medium);
            from = { src: "Wikidata", q };
        }
    }
    castFrom.set(id, from);
    castCache.set(id, cast);
    return cast;
}
// when the list belongs to a different title of the same name: choose the right one
export async function castPickOpen(m: Modal, q?: string) {
    const b = items.get(m.id || "");
    if (!b) return;
    const pick: NonNullable<Modal["castPick"]> = { q: q || cleanTitle(b.title), busy: true, res: [] };
    m.castPick = pick;
    stateChanged("ui");
    try {
        if (b.medium === "tv")
            for (const r of (await tvmazeSearch(pick.q)).slice(0, 8))
                pick.res.push({
                    title: r.title,
                    sub: [r.year, r.creator].filter(Boolean).join(" · ") || "TVmaze",
                    tvmaze: r.ext?.tvmaze,
                });
        const j = await getJSON(
            "https://www.wikidata.org/w/api.php?" +
                new URLSearchParams({
                    action: "wbsearchentities",
                    search: pick.q,
                    language: "en",
                    type: "item",
                    limit: "12",
                    format: "json",
                    origin: "*",
                })
        );
        const re = WD_MEDIUM[b.medium] || null;
        // Wikidata's search answers: each hit's label, description and id, as sent
        const hits = listOf(isRecord(j) ? j.search : null).filter(isRecord);
        for (const h of hits.filter(h => !re || re.test(String(h.description || ""))).slice(0, 8))
            pick.res.push({
                title: String(h.label ?? ""),
                sub: String(h.description || "Wikidata"),
                wikidata: String(h.id ?? ""),
            });
    } catch (_) {}
    pick.busy = false;
    stateChanged("ui");
}
export async function loadCast(m: Modal) {
    m.busy = "cast";
    m.error = "";
    stateChanged("ui");
    try {
        m.cast = await fetchCast(m.id || "");
        charImagesLater(m);
    } catch (e) {
        m.error =
            errName(e) === "TimeoutError" || errName(e) === "AbortError"
                ? "The source took too long to answer. Try again in a moment."
                : "Couldn't load characters. Are you online?";
        m.cast = null;
    }
    m.busy = false;
    stateChanged("ui");
}
// TMDB and TVmaze picture the actor, not the character: look the characters up on Wikidata (and their Wikipedia pages) for their own pictures
async function charImagesLater(m: Modal) {
    const b = items.get(m.id || ""),
        from = castFrom.get(m.id || ""),
        cast = m.cast;
    if (
        !b ||
        !cast ||
        !["film", "tv"].includes(b.medium) ||
        !["TMDB", "TVmaze"].includes(from?.src || "") ||
        !cast.some(c => c.name && !c.image)
    )
        return;
    try {
        let q = b.ext.wikidata || null;
        if (!q && b.ext.imdb) q = (await wdByImdb([b.ext.imdb])).get(b.ext.imdb) || null;
        if (!q) q = await wdFind((b.alt && b.alt.en) || b.title, b.medium, b.year);
        if (!q) return;
        const W = await wdCast(q, undefined, b.medium),
            byName = new Map<string, string>();
        for (const c of W) if (c.name && c.image) byName.set(norm(c.name), c.image);
        let n = 0;
        for (const c of cast)
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
        const left = cast.filter(c => c.name && !c.image).slice(0, 12),
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
        if (n) stateChanged("ui");
    } catch (_) {}
}
export function charFromCast(c: CastMember, it: Item & { id?: string }): FavChar {
    return {
        id: "c" + (c.alId || Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
        src: c.src,
        alId: c.alId,
        name: c.name || c.va || "",
        native: c.native || "",
        alImage: c.src === "anilist" ? c.image : "",
        image: c.src === "anilist" ? "" : c.image,
        media: [{ id: it.id, alId: it.ext?.anilist, title: titleOf(it), medium: it.medium }],
        why: "",
        tags: [],
        about: "",
        va: c.va || "",
        addedAt: nowISO(),
        rank: meta.chars.length + 1,
    };
}
export function addChar(c: FavChar) {
    changeMeta("Add " + c.name, "chars", list =>
        list.some(x => c.alId && x.alId === c.alId) ? list : [...list, { ...c, rank: list.length + 1 }]
    );
    toast(`Added ${c.name} to your characters`, { label: "Open", fn: () => openModal("char", { id: c.id }) });
}
export function patchChar(id: string, p: Partial<FavChar>, label = "Edit character") {
    changeMeta(label, "chars", list => list.map(c => (c.id === id ? { ...c, ...p } : c)));
}
// private entries get an anonymous id so nothing public (ids, lists, links) reveals the title, and they're only ever stored encrypted
export function makePrivate(id: string) {
    const b = items.get(id);
    if (!vault.key || !b) return id;
    const nid = anonId();
    rekeyItem(id, nid);
    vault.ids.add(nid);
    items.set(nid, { ...b, private: true });
    markDirty(nid);
    vault.sealDue = true;
    history.length = 0;
    future.length = 0;
    scheduleSave();
    return nid;
}
export function makePublic(id: string) {
    const b = items.get(id);
    if (!b || !vault.ids.has(id)) return id;
    const nid = newId(b.title, b.medium);
    vault.ids.delete(id);
    rekeyItem(id, nid);
    const x = { ...b };
    delete x.private;
    items.set(nid, x);
    markDirty(nid);
    vault.sealDue = true;
    scheduleSave();
    return nid;
}
let lockTimer: ReturnType<typeof setTimeout> | undefined;
export async function lockVault() {
    if (!vault.key) return;
    try {
        await vaultSeal();
    } catch (_) {}
    vaultLock();
    ui.private = false;
    resetSub();
    if (ui.modal && ui.modal.kind === "item" && !items.has(ui.modal.id || "")) closeModal();
    render();
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initItemActions() {
    addEventListener("visibilitychange", () => {
        clearTimeout(lockTimer);
        const mins = Number(meta.settings.vaultAuto) || 0;
        if (document.visibilityState === "hidden" && vault.key && mins) lockTimer = setTimeout(lockVault, mins * 60000);
    });
}
