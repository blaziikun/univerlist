// src/features/sources/anilist.ts
// ─────────────────────────────────────────────────────────────────
//  AniList import and sync (one way: AniList → UniverList)
//
//  Everything AniList sends is read through the guards in core/core.ts: a list, a favourite or a profile it sends
//  in another shape is skipped or left empty, never half-read into your library.
// ─────────────────────────────────────────────────────────────────

import {
    at,
    change,
    clone,
    errMessage,
    errName,
    fieldsOf,
    findExisting,
    fuzzy,
    isRecord,
    items,
    markDirty,
    meta,
    migrateItem,
    newId,
    nowISO,
    numOf,
    ownOf,
    quietPatch,
    recordsOf,
    scheduleSave,
    stripMd,
    strsOf,
    TAG_COLORS,
    textOf,
    toast,
    ui,
    undo,
} from "../core/core";
import {
    AL,
    AL_FAV,
    AL_MEDIA,
    AL_MEDIA_LITE,
    alDetails,
    alToFields,
    charFromAL,
    SourceError,
    sourceFlag,
} from "./sources";
import { scoreQ, type WorkBanner } from "./covers";
import { updateBusy } from "../core/shell";
import { workChanged } from "./work-state.svelte";
import { renderOverlay } from "../core/modals";
import { afterChange } from "../core/navigation";
import type { Candidate, FavChar, FavPerson, Item, Meta, Status } from "../core/model";

const AL_LIST_Q = (
    per: number,
    fields: string
) => `query($name:String,$type:MediaType,$chunk:Int){ MediaListCollection(userName:$name, type:$type, chunk:$chunk, perChunk:${per}, forceSingleCompletedList:true){ hasNextChunk
  lists { name isCustomList entries { status score(format: POINT_100) progress progressVolumes repeat notes startedAt { year month day } completedAt { year month day } updatedAt createdAt media { ${fields} } } } } }`;
const AL_USER_LITE = `query($name:String){ User(name:$name){ id name siteUrl avatar { large } bannerImage } }`;
const AL_USER_Q = `query($name:String){ User(name:$name){ id name about(asHtml:false) siteUrl avatar { large } bannerImage
  statistics { anime { count meanScore minutesWatched episodesWatched genres(limit: 12, sort: COUNT_DESC){ genre count meanScore minutesWatched } }
    manga { count meanScore chaptersRead volumesRead genres(limit: 12, sort: COUNT_DESC){ genre count meanScore chaptersRead } } } } }`;
const AL_STATUS: Record<string, Status> = {
    CURRENT: "active",
    PLANNING: "want",
    COMPLETED: "done",
    DROPPED: "dnf",
    PAUSED: "paused",
    REPEATING: "redo",
};
/** an AniList sync: whether it's running, how far it's got, and how the last one went */
export const alSync: {
    running: boolean;
    ctl: AbortController | null;
    phase: string;
    done: number;
    total: number;
    msg: string;
    error: string;
    last: unknown;
    warnings: string[];
    counts?: { added: number; updated: number; chars: number } | null;
} = {
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
/** what an AniList sync says right now (settings/sections/data/WorkStatus.svelte), or null when there's none */
export function alBanner(): WorkBanner | null {
    if (!alSync.running && !alSync.error) return null;
    return alSync.error
        ? { ic: "⟳", text: `AniList: ${alSync.error}`, pct: null, act: "al-open", btn: "Details" }
        : {
              ic: "⟳",
              text: `AniList: ${alSync.msg}`,
              pct: alSync.total ? Math.round((alSync.done / alSync.total) * 100) : null,
              act: "al-stop",
              btn: "Stop",
          };
}
/** the sync moved on: the top bar's light, its line in Settings › Data, and the AniList dialog if it's open */
export function renderAlStatus() {
    updateBusy();
    workChanged("al");
    if (ui.modal && ui.modal.kind === "anilist") renderOverlay();
}
function alSet(phase: string, msg: string, done = 0, total = 0) {
    Object.assign(alSync, { phase, msg, done, total });
    renderAlStatus();
}
const serverMsg = "AniList's servers returned an error (they've been unstable lately)";

/** an entry on your AniList list: the title, how you're getting on with it, and your custom lists it's on */
interface ListEntry {
    mediaId: number;
    media: Record<string, unknown>;
    fields: Record<string, unknown>;
    custom: string[];
}
// Big lists come in chunks; if AniList's server chokes, retry with smaller chunks and fewer fields.
async function fetchList(name: string, type: string, signal: AbortSignal): Promise<ListEntry[]> {
    const label = type === "ANIME" ? "anime" : "manga";
    const levels: [number, string][] = [
        [500, AL_MEDIA],
        [100, AL_MEDIA],
        [50, AL_MEDIA_LITE],
        [20, AL_MEDIA_LITE],
    ];
    let lastErr: unknown;
    for (const [per, fields] of levels) {
        const entries = new Map<number, ListEntry>();
        try {
            for (let chunk = 1; chunk < 80; chunk++) {
                alSet(label, `Reading your ${label} list${chunk > 1 ? " (part " + chunk + ")" : ""}…`);
                const d = await AL.q(AL_LIST_Q(per, fields), { name, type, chunk }, signal);
                const c = fieldsOf(at(d, "MediaListCollection"));
                for (const l of recordsOf(c.lists)) {
                    const listName = textOf(l.name);
                    for (const e of recordsOf(l.entries)) {
                        const media = fieldsOf(e.media),
                            mediaId = numOf(media.id);
                        if (mediaId == null) continue;
                        const prev = entries.get(mediaId);
                        if (prev) {
                            if (l.isCustomList && listName) prev.custom.push(listName);
                            continue;
                        }
                        entries.set(mediaId, {
                            mediaId,
                            media,
                            fields: e,
                            custom: l.isCustomList && listName ? [listName] : [],
                        });
                    }
                }
                if (!c.hasNextChunk) break;
            }
            return [...entries.values()];
        } catch (e) {
            if (!sourceFlag(e, "server")) throw e;
            lastErr = e;
            alSet(label, `AniList struggled with your ${label} list, asking for smaller pieces…`);
        }
    }
    // a sync that has to stop: its message is the one to show as it is
    const stop = new SourceError(`${serverMsg} while reading your ${label} list. Try again in a few minutes.`, {
        server: true,
        final: true,
    });
    stop.cause = lastErr;
    throw stop;
}
async function fetchFavs(name: string, kind: string, signal: AbortSignal): Promise<Record<string, unknown>[]> {
    for (const k of [kind, kind + "Lite"]) {
        const fields = ownOf(AL_FAV, k);
        if (!fields) continue;
        const out: Record<string, unknown>[] = [];
        try {
            for (let page = 1; page < 12; page++) {
                const d = await AL.q(
                    `query($name:String,$page:Int){ User(name:$name){ favourites { ${kind}(page:$page, perPage:25){ pageInfo { hasNextPage } ${fields} } } } }`,
                    { name, page },
                    signal
                );
                const c = at(d, "User", "favourites", kind);
                out.push(...recordsOf(at(c, "nodes")));
                if (!at(c, "pageInfo", "hasNextPage")) break;
            }
            return out;
        } catch (e) {
            if (!sourceFlag(e, "server")) throw e;
        }
    }
    alSync.warnings.push("favourite " + kind);
    return [];
}
/** a date AniList gives as year, month and day, as an ISO date (null when it has no year) */
const alDate = (x: unknown) => {
    const d = fieldsOf(x);
    return fuzzy({ year: numOf(d.year), month: numOf(d.month), day: numOf(d.day) });
};
/** how you're getting on with a title, as AniList has it */
function entryFields(e: Record<string, unknown>) {
    const score = numOf(e.score),
        status = textOf(e.status);
    return {
        status: ownOf(AL_STATUS, status) || "want",
        rating: score ? Math.round(score) / 10 : 0,
        prog: numOf(e.progress) || 0,
        vol: numOf(e.progressVolumes) || 0,
        repeat: numOf(e.repeat) || 0,
        rewatching: status === "REPEATING",
        startedAt: alDate(e.startedAt),
        finishedAt: alDate(e.completedAt),
        alUpdated: numOf(e.updatedAt) || 0,
        alNotes: textOf(e.notes),
    };
}
type EntryFields = Partial<ReturnType<typeof entryFields>>;
/** a user as AniList sends them: what the sync keeps of them */
interface AlUser {
    id?: number;
    name: string;
    about?: string;
    siteUrl?: string;
    avatar?: string;
    banner?: string;
    stats?: unknown;
}
const alUser = (x: unknown, name: string): AlUser => {
    const u = fieldsOf(x);
    return {
        id: numOf(u.id),
        name: textOf(u.name) || name,
        about: textOf(u.about),
        siteUrl: textOf(u.siteUrl),
        avatar: textOf(at(u, "avatar", "large")),
        banner: textOf(u.bannerImage),
        stats: isRecord(u.statistics) ? u.statistics : undefined,
    };
};
export async function runAniListSync({
    name = meta.settings.anilistUser,
    details = true,
    quiet = false,
}: {
    name?: string;
    details?: boolean;
    quiet?: boolean;
} = {}) {
    if (alSync.running) return;
    name = String(name || "").trim();
    if (!name) {
        alSync.error = "Add your AniList username in Settings.";
        renderAlStatus();
        return;
    }
    const ctl = new AbortController();
    Object.assign(alSync, { running: true, error: "", ctl, counts: null });
    const signal = ctl.signal;
    try {
        alSync.warnings = [];
        alSet("user", "Reading your profile…");
        let u: AlUser;
        try {
            u = alUser(at(await AL.q(AL_USER_Q, { name }, signal), "User"), name);
        } catch (e) {
            if (!sourceFlag(e, "server")) throw e;
            try {
                u = alUser(at(await AL.q(AL_USER_LITE, { name }, signal), "User"), name);
            } catch (e2) {
                if (!sourceFlag(e2, "server")) throw e2;
                u = { name };
            }
            alSync.warnings.push("watch-time stats");
        }
        // one list failing shouldn't lose the other
        let anime: ListEntry[] = [],
            manga: ListEntry[] = [],
            listErr: unknown = null;
        try {
            anime = await fetchList(name, "ANIME", signal);
        } catch (e) {
            if (!sourceFlag(e, "server")) throw e;
            listErr = e;
            alSync.warnings.push("your anime list");
        }
        try {
            manga = await fetchList(name, "MANGA", signal);
        } catch (e) {
            if (!sourceFlag(e, "server")) throw e;
            if (listErr)
                throw new SourceError(`${serverMsg} on both your anime and manga lists. Try again in a few minutes.`, {
                    server: true,
                    final: true,
                });
            alSync.warnings.push("your manga list");
        }
        alSet("favs", "Reading your favourites…");
        const fav: Favs = { anime: [], manga: [], characters: [], staff: [], studios: [] };
        for (const k of FAV_KINDS) fav[k] = await fetchFavs(name, k, signal);
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
                counts.added ? { label: "Undo", fn: undo } : undefined
            );
        if (details) {
            try {
                await fetchAniListDetails(signal);
            } catch (e) {
                if (!sourceFlag(e, "server")) throw e;
                alSync.warnings.push("some descriptions and related works");
            }
        }
        alSync.running = false;
        alSet("done", "");
        scoreQ.start();
    } catch (e) {
        alSync.running = false;
        const msg = errMessage(e);
        if (errName(e) !== "AbortError") console.warn("AniList sync", e);
        if (errName(e) === "AbortError") {
            alSet("", "");
        } else {
            alSync.error = sourceFlag(e, "offline")
                ? "couldn't reach AniList. Check you're online."
                : /private/i.test(msg)
                  ? `${name}'s lists are private. Make them public in AniList's settings, or sync later.`
                  : /not found/i.test(msg)
                    ? `there's no AniList user called ${name}.`
                    : sourceFlag(e, "final")
                      ? msg
                      : sourceFlag(e, "server")
                        ? serverMsg + ". Try again in a few minutes."
                        : msg;
            renderAlStatus();
        }
    }
    afterChange();
}
const FAV_KINDS = ["anime", "manga", "characters", "staff", "studios"] as const;
/** your AniList favourites, by kind */
type Favs = Record<(typeof FAV_KINDS)[number], Record<string, unknown>[]>;
/** an entry the sync will add or update */
interface Planned {
    id: string;
    f: Candidate;
    ef: EntryFields;
    custom: string[];
    created?: number;
    favOnly?: boolean;
    fav?: number;
}
function applyAniList(u: AlUser, anime: ListEntry[], manga: ListEntry[], fav: Favs) {
    const counts = { added: 0, updated: 0, chars: 0 };
    const byAl = new Map<number, string>();
    for (const [id, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, id);
    const plan: Planned[] = [];
    for (const e of [...anime, ...manga]) {
        const f = alToFields(e.media),
            ef = entryFields(e.fields);
        if (!f.title) continue;
        let id = byAl.get(e.mediaId) || findExisting(f.title, "", f.medium);
        if (!id) {
            id = newId(f.title, f.medium);
            while (plan.some(p => p.id === id)) id += "-x";
        }
        plan.push({ id, f, ef, custom: e.custom, created: numOf(e.fields.createdAt) });
        byAl.set(e.mediaId, id);
    }
    // favourites that aren't on the list still come in, as finished
    const favRank = new Map<number, number>();
    fav.anime.forEach((m, i) => {
        const id = numOf(m.id);
        if (id != null) favRank.set(id, i + 1);
    });
    fav.manga.forEach((m, i) => {
        const id = numOf(m.id);
        if (id != null) favRank.set(id, 100 + i + 1);
    });
    for (const m of [...fav.anime, ...fav.manga]) {
        const alId = numOf(m.id);
        if (alId == null || byAl.has(alId)) continue;
        const f = alToFields(m);
        if (!f.title) continue;
        const id = newId(f.title, f.medium) + (plan.some(p => p.id === newId(f.title, f.medium)) ? "-f" : "");
        plan.push({ id, f, ef: { status: "done" }, custom: [], favOnly: true });
        byAl.set(alId, id);
    }
    for (const p of plan) p.fav = (p.f.ext && p.f.ext.anilist != null && favRank.get(p.f.ext.anilist)) || 0;
    // characters, creators, studios, profile
    const chars: FavChar[] = clone(meta.chars || []);
    fav.characters.forEach((c, i) => {
        const nc = charFromAL(c);
        if (!nc.alId) return;
        const ex = chars.find(x => x.alId === nc.alId),
            media = nc.media.map(mm => ({ ...mm, id: byAl.get(mm.alId) || null }));
        if (ex) {
            Object.assign(ex, {
                name: nc.name,
                native: nc.native,
                alImage: nc.image,
                media,
                about: ex.about || nc.about,
                alRank: i + 1,
            });
        } else {
            chars.push({
                id: "c" + nc.alId,
                ...nc,
                media,
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
    const people: FavPerson[] = clone(meta.people || []);
    for (const s of fav.staff) {
        const alId = numOf(s.id),
            occupations = strsOf(s.primaryOccupations);
        if (alId != null && !people.some(p => p.alId === alId))
            people.push({
                id: "p" + alId,
                alId,
                name: textOf(at(s, "name", "full")),
                native: textOf(at(s, "name", "native")),
                image: textOf(at(s, "image", "large")),
                roles: occupations.length ? occupations.slice(0, 4) : ["Creator"],
                fav: true,
                why: "",
            });
    }
    for (const s of fav.studios) {
        const alId = numOf(s.id);
        if (alId != null && !people.some(p => p.alStudio === alId))
            people.push({
                id: "s" + alId,
                alStudio: alId,
                name: textOf(s.name),
                image: "",
                roles: ["Studio"],
                fav: true,
                why: "",
            });
    }
    const metaBefore: Partial<Meta> = {
        chars: clone(meta.chars),
        people: clone(meta.people),
        profile: clone(meta.profile),
        favOrder: clone(meta.favOrder),
    };
    // AniList favourites join the master order, in AniList's order, after the ones you already have
    const favIdsAL = plan
        .filter(p => p.fav)
        .sort((a, b) => (a.fav || 0) - (b.fav || 0))
        .map(p => p.id);
    meta.favOrder = [...meta.favOrder, ...favIdsAL.filter(id => !meta.favOrder.includes(id))];
    const prof = clone(meta.profile);
    const oldAl = fieldsOf(prof.anilist);
    prof.anilist = {
        id: u.id || oldAl.id,
        name: u.name,
        about: stripMd(u.about || oldAl.about || ""),
        url: u.siteUrl || `https://anilist.co/user/${u.name}`,
        avatar: u.avatar || textOf(oldAl.avatar),
        banner: u.banner || textOf(oldAl.banner),
        stats: u.stats || oldAl.stats,
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
            if (!p) return undefined;
            const { title: _title, ...mediaFields } = p.f;
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
            const keep = (k: string, v: unknown) => {
                if (v == null || v === "") return false;
                if (k === "cover") return !b.coverData && !b.coverPicked;
                if (k === "kind") return !b.kind;
                if (k === "about" || k === "ext" || k === "scores" || k === "alt") return false;
                return true;
            };
            const u2: Item = { ...b };
            for (const [k, v] of Object.entries(mediaFields)) if (keep(k, v)) u2[k] = v;
            u2.ext = { ...(b.ext || {}), ...p.f.ext };
            u2.scores = { ...(b.scores || {}), ...p.f.scores };
            u2.alt = { ...(b.alt || {}), ...p.f.alt };
            const alUpdated = numOf(b.alUpdated) || 0;
            if (!p.favOnly && (p.ef.alUpdated || 0) > alUpdated) {
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
async function fetchAniListDetails(signal: AbortSignal) {
    const ids = [...items.entries()].flatMap(([id, b]): [string, number][] =>
        b.ext && b.ext.anilist && !b.relAt ? [[id, b.ext.anilist]] : []
    );
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
            const p: Partial<Item> = { rel: x.rel || [], relAt: nowISO() };
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
/** links entries AniList relates to each other (a sequel, an adaptation): related works that are both in the library
 * become cross-links (both directions) */
export function autoLinkAniList() {
    const byAl = new Map<number, string>();
    for (const [id, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, id);
    for (const [id, b] of items) {
        for (const r of b.rel || []) {
            const other = byAl.get(r.id);
            if (!other || other === id) continue;
            const add = (from: string, to: string, type: string) => {
                const x = items.get(from);
                if (!x || (x.links || []).some(l => l.id === to)) return;
                quietPatch(from, { links: [...(x.links || []), { id: to, type, auto: "anilist" }] });
            };
            const type = r.type || "";
            add(id, other, type === "prequel" ? "prequel" : type === "sequel" ? "sequel" : type);
            add(other, id, type === "prequel" ? "sequel" : type === "sequel" ? "prequel" : type);
        }
    }
}
/** a tag, made (with a colour) if you didn't have it */
export function ensureTag(name: string) {
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

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initAnilist() {
    AL.onWait = s => alSet(alSync.phase, `AniList asked us to slow down, waiting ${s} s…`, alSync.done, alSync.total);
    AL.onRetry = n =>
        alSet(alSync.phase, `AniList's server had a hiccup, trying again (${n} of 2)…`, alSync.done, alSync.total);
}
