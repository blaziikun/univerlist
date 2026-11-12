// src/features/library/entry/fields.ts
// ─────────────────────────────────────────────────────────────────
//  The entry form's workings: which fields a medium has, what they're called, and what the boxes say as an entry
//
//  The form (EntryFields.svelte) is Add's second step and the item card's Edit details. It keeps every box as text
//  while you type, so switching medium keeps what you've typed; readFields() turns the boxes a medium shows back into
//  an entry's fields: numbers where they're numbers, genres split at commas, a book's shelf from its type.
// ─────────────────────────────────────────────────────────────────

import { COPY, FORMATS, isStatus, MEDIA_KEYS, STATUS } from "../../core/core";
import type { ItemDraft, Status } from "../../core/model";

/** the fields of the entry form, as read back */
export interface DraftFields {
    title?: string;
    creator?: string;
    medium?: string;
    kind?: string;
    status?: Status;
    year?: number | null;
    total?: number | null;
    runtime?: number | null;
    vols?: number | null;
    copy?: string;
    genres?: string[];
    franchise?: string;
    subject?: string;
    format?: string;
    series?: string;
    seriesNo?: number | null;
    chrono?: number | null;
    about?: string;
    why?: string;
    cw?: string;
    shelf?: string;
}
/** every box of the form, as typed */
export type Boxes = Record<(typeof BOXES)[number], string>;
const BOXES = [
    "title",
    "creator",
    "medium",
    "kind",
    "status",
    "year",
    "total",
    "runtime",
    "vols",
    "copy",
    "genres",
    "franchise",
    "chrono",
    "subject",
    "format",
    "series",
    "seriesNo",
    "about",
    "why",
    "cw",
] as const;
const NUMBERS = new Set(["year", "total", "runtime", "vols", "seriesNo", "chrono"]);

/** what the creator is called for each medium */
export const CREATOR_LABEL: Record<string, string> = {
    book: "Author",
    manga: "Author",
    manhwa: "Author",
    novel: "Author",
    comic: "Writer / artist",
    anime: "Studio",
    tv: "Network or creator",
    film: "Director",
    game: "Developer",
    album: "Artist",
};
/** the boxes a medium shows beyond the ones every entry has */
export const shows = (med: string) => ({
    total: med !== "film",
    runtime: ["anime", "tv", "film"].includes(med),
    vols: ["manga", "manhwa", "novel", "comic"].includes(med),
    book: med === "book", // subject and length
    series: ["book", "novel", "comic", "manga", "manhwa"].includes(med),
});
/** the boxes, filled from an entry (or a draft). A choice the list doesn't have shows as its first one, as the
 *  browser shows it, so that's what's kept */
export function boxesOf(d: ItemDraft): Boxes {
    const s = (v: unknown) => (v == null ? "" : String(v)),
        one = (v: unknown, of: readonly string[]) => (of.includes(s(v)) ? s(v) : of[0]);
    return {
        title: s(d.title),
        creator: s(d.creator),
        medium: one(d.medium || "book", MEDIA_KEYS),
        kind: s(d.kind),
        status: one(d.status || "want", STATUS),
        year: s(d.year),
        total: s(d.total),
        runtime: s(d.runtime),
        vols: s(d.vols),
        copy: one(
            d.copy || "none",
            COPY.map(([k]) => k)
        ),
        genres: (d.genres || []).join(", "),
        franchise: s(d.franchise),
        chrono: s(d.chrono),
        subject: s(d.subject),
        format: one(d.format || "", ["", ...FORMATS]),
        series: s(d.series),
        seriesNo: s(d.seriesNo),
        about: s(d.about),
        why: s(d.why),
        cw: s(d.cw),
    };
}
/** an entry's fields as the form has them: only those its medium shows */
export function readFields(v: Boxes): DraftFields {
    const S = shows(v.medium),
        shown = new Set<string>(BOXES);
    if (!S.total) shown.delete("total");
    if (!S.runtime) shown.delete("runtime");
    if (!S.vols) shown.delete("vols");
    if (!S.book) for (const k of ["subject", "format"]) shown.delete(k);
    if (!S.series) for (const k of ["series", "seriesNo"]) shown.delete(k);
    const out: DraftFields = {};
    for (const k of BOXES) {
        if (!shown.has(k)) continue;
        const raw = v[k].trim();
        if (NUMBERS.has(k)) {
            const n = parseFloat(raw);
            Object.assign(out, { [k]: Number.isFinite(n) ? n : null });
        } else if (k === "genres")
            out.genres = raw
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);
        else if (k === "status") out.status = isStatus(raw) ? raw : undefined;
        else Object.assign(out, { [k]: raw });
    }
    if (out.status === undefined) delete out.status;
    if (out.medium === "book" && out.kind !== undefined)
        out.shelf = out.kind === "Academic" ? "academic" : out.kind === "Non-fiction" ? "nonfiction" : "fiction";
    return out;
}
