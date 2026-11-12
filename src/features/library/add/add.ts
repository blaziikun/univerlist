// src/features/library/add/add.ts
// ─────────────────────────────────────────────────────────────────
//  Adding something: searching a catalogue, turning a result into an entry, and adding it
//
//  The dialog (AddDialog.svelte beside this) only shows what's worked out here. Adding goes through addItem(), so it
//  can be undone, and then fills in what the catalogue didn't say (artwork, details, crowd scores) in the background.
// ─────────────────────────────────────────────────────────────────

import {
    addItem,
    curMode,
    findExisting,
    findSibling,
    inMode,
    isRecord,
    items,
    markDirty,
    MEDIA,
    meta,
    nowISO,
    parseScore,
    textOf,
    toast,
    ui,
    undo,
    vault,
} from "../../core/core";
import { refreshItem, searchMedium, sourceFor } from "../../sources/sources";
import { autoLinkAniList, ensureTag } from "../../sources/anilist";
import { autoCovers, cacheAndColour, updateItemTiles } from "../../sources/covers";
import { upgradeGameCover } from "../../sources/box-art";
import { closeModal } from "../../core/modals";
import { afterChange } from "../../core/navigation";
import { makePrivate, openItem } from "../item-actions";
import type { Candidate, ItemDraft } from "../../core/model";

/** the catalogues a result can come from, by name */
export const SRC_NAME: Record<string, string> = {
    anilist: "AniList",
    tmdb: "TMDB",
    tvmaze: "TVmaze",
    rawg: "RAWG",
    wikidata: "Wikidata",
    ol: "Open Library",
    gb: "Google Books",
    jikan: "MyAnimeList",
};
/** what the search box suggests, for each medium */
export const EXAMPLE: Record<string, string> = {
    book: "e.g. The Tainted Cup",
    manga: "e.g. Vagabond",
    manhwa: "e.g. Solo Leveling",
    novel: "e.g. Mushoku Tensei",
    comic: "e.g. Saga",
    anime: "e.g. Frieren",
    tv: "e.g. White Collar",
    film: "e.g. The Prestige",
    game: "e.g. Persona 5",
    album: "e.g. OK Computer, or Radiohead OK Computer",
};
/** the "already have it" mark on a result: in this medium, or the same show filed as anime or TV ("" if neither) */
export function haveIt(
    c: { title: string; creator?: string; medium?: string; ext?: Candidate["ext"]; year?: number | null },
    med: string
): string {
    if (findExisting(c.title, c.creator || "", c.medium, c.ext)) return "In your library";
    const sib = findSibling(c.title, c.medium || med, c.year);
    return sib ? "In your library as " + MEDIA[items.get(sib)?.medium || "book"].one : "";
}
/** why a draft can't simply be added: it's already here, or the same show is here as the other medium */
export function alreadyNote(d: ItemDraft, med: string): string {
    if (findExisting(d.title || "", d.creator || "", d.medium, d.ext)) return "This is already in your library.";
    const sib = findSibling(d.title || "", d.medium || med, d.year);
    return sib
        ? `The same show is already in your library as ${MEDIA[items.get(sib)?.medium || "book"].one}. Adding it again makes a second entry.`
        : "";
}
/** search the medium's catalogue: what it found, or why it couldn't */
export async function searchFor(medium: string, q: string): Promise<{ results: Candidate[] } | { error: string }> {
    try {
        return { results: await searchMedium(medium, q) };
    } catch (err) {
        return {
            error:
                isRecord(err) && err.auth
                    ? `${sourceFor(medium)} rejected the key. Check it in Settings.`
                    : `Couldn't reach ${sourceFor(medium)}. Check you're online, or enter it yourself.`,
        };
    }
}
/** a result, filled in by its catalogue, as the entry it would become */
export function draftFrom(d: Candidate, medium: string, ikind: string): ItemDraft {
    const med = d.medium || medium,
        kind = ikind || d.kind || (med === "book" ? "Novel" : "");
    return {
        ...d,
        medium: med,
        kind,
        status: "want",
        copy: "none",
        format: med === "book" ? (d.total ? (d.total < 350 ? "Short" : "Long") : "") : undefined,
    };
}
/** what's ticked under the form */
export interface AddChoices {
    rating: string;
    toBuy: boolean;
    queue: boolean;
    fav: boolean;
    priv: boolean;
}
/** add it, open its card, and fill in the rest in the background */
export function addNew(d: ItemDraft, coverData: string, o: AddChoices) {
    const data: ItemDraft = {
        ...d,
        toBuy: o.toBuy && d.copy === "none",
        rating: Number.isFinite(parseFloat(o.rating)) ? parseScore(parseFloat(o.rating)) : 0,
        coverData: coverData || null,
        source: textOf(d.src) || "you",
        relAt: d.rel ? nowISO() : undefined,
    };
    delete data.src;
    delete data.recs;
    delete data.cast;
    // a mood tag a catalogue's draft can carry
    const vibe = textOf(data.vibe);
    if (vibe) {
        ensureTag(vibe);
        data.tags = [...new Set([...(data.tags || []), vibe])];
    }
    if (data.status === "done" && !data.finishedAt) data.finishedAt = nowISO();
    if (data.status === "active") data.startedAt = nowISO();
    if (o.fav) data.fav = 1;
    let nid = addItem(data, "Add " + d.title);
    if (o.fav) {
        meta.favOrder = [...meta.favOrder, nid];
        markDirty();
    }
    if (o.queue) {
        meta.queue = [...meta.queue, nid];
        markDirty();
    }
    if ((o.priv || ui.private) && vault.key) nid = makePrivate(nid);
    autoLinkAniList();
    closeModal();
    openItem(nid);
    toast((o.priv ? "Added privately: " : "Added ") + d.title, o.priv ? undefined : { label: "Undo", fn: undo });
    const added = items.get(nid);
    if (added && !inMode(added))
        toast(`Added. It's not part of ${curMode().name}, so it shows in Hub and the modes that include it.`);
    if (!data.cover && !data.coverData) setTimeout(() => autoCovers([nid]), 300);
    else cacheAndColour(nid).then(() => updateItemTiles(nid));
    setTimeout(
        () =>
            refreshItem(nid, undefined, { full: false })
                .then(() => upgradeGameCover(nid))
                .then(afterChange)
                .catch(() => {}),
        1200
    );
}
