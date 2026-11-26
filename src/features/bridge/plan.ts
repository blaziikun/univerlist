// src/features/bridge/plan.ts
// ─────────────────────────────────────────────────────────────────
//  The Pathagoras bridge, worked out before anything changes: which of your books move on, which are new, and what
//  goes back. Pure, so it's tested on its own (tests/unit/bridge.test.ts); bridge/pathagoras.ts carries it out once
//  you allow it.
//
//  A status only ever moves forward (want → active → done), never back, so neither app can undo the other.
// ─────────────────────────────────────────────────────────────────

import type { Item, Status } from "../core/model";

/** what Pathagoras offers: a book you're reading or have finished there */
export interface Offered {
    title: string;
    creator: string;
    status: "active" | "done";
    univerlistId?: string;
}

/** what goes back: every Learning book (tagged Learning, or of kind Academic) */
export interface Sent {
    id: string;
    title: string;
    creator: string;
    status: string;
}

export interface Plan {
    /** books here whose status moves on */
    moves: { id: string; status: Status }[];
    /** books Pathagoras has that aren't here */
    adds: Offered[];
}

/** "The Rising Sea: Foundations…" and "rising sea" are the same title: lower case, no accents, article or subtitle */
export function sameTitle(title: string): string {
    return title
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .split(":")[0]
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/^\s*(the|a|an)\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
}
const surnames = (who: string) =>
    new Set(
        sameTitle(who.replace(/,| and | & /g, "|"))
            .split(/\s+/)
            .filter(w => w.length > 2)
    );

const ORDER: Record<string, number> = { want: 0, paused: 0, dnf: 0, active: 1, redo: 1, done: 2 };

export const isLearning = (it: Pick<Item, "tags" | "kind" | "medium">, tag: string) =>
    it.medium === "book" && ((it.tags || []).includes(tag) || it.kind === "Academic");

/** your book that an offered one is: by UniverList's own id, else the same title and a shared surname */
function findHere(offer: Offered, books: (Item & { id: string })[]): (Item & { id: string }) | undefined {
    if (offer.univerlistId) {
        const byId = books.find(b => b.id === offer.univerlistId);
        if (byId) return byId;
    }
    const title = sameTitle(offer.title),
        theirs = surnames(offer.creator);
    const same = books.filter(b => sameTitle(b.title) === title);
    return (
        same.find(b => [...surnames(b.creator || "")].some(s => theirs.has(s))) ?? (theirs.size ? undefined : same[0])
    );
}

export function planBridge(offers: Offered[], books: (Item & { id: string })[]): Plan {
    const plan: Plan = { moves: [], adds: [] };
    for (const offer of offers) {
        const here = findHere(offer, books);
        if (!here) {
            if (!plan.adds.some(a => sameTitle(a.title) === sameTitle(offer.title))) plan.adds.push(offer);
            continue;
        }
        if ((ORDER[offer.status] ?? 0) > (ORDER[here.status] ?? 0))
            plan.moves.push({ id: here.id, status: offer.status });
    }
    return plan;
}

/** what Pathagoras is told, from an unknown message: dropped unless it's exactly an offer */
export function readOffer(data: unknown, version: number): Offered[] | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const d = data as Record<string, unknown>;
    if (d.kind !== "pathagoras-bridge" || d.v !== version || d.step !== "offer" || !Array.isArray(d.books)) return null;
    if (d.books.length > 5000) return null;
    const out: Offered[] = [];
    for (const raw of d.books) {
        if (!raw || typeof raw !== "object") continue;
        const b = raw as Record<string, unknown>;
        const title = typeof b.title === "string" ? b.title.slice(0, 500).trim() : "";
        const status = b.status === "active" || b.status === "done" ? b.status : null;
        if (!title || !status) continue;
        out.push({
            title,
            creator: typeof b.creator === "string" ? b.creator.slice(0, 300) : "",
            status,
            ...(typeof b.univerlistId === "string" ? { univerlistId: b.univerlistId.slice(0, 120) } : {}),
        });
    }
    return out;
}
