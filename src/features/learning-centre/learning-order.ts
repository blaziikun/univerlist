// src/features/learning-centre/learning-order.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: the order to read a course's books in, and what to read next
//
//  A book comes after everything it needs (done, or underway); among the books that are free to come next, the lower
//  level goes first (Foundations before Undergraduate, and so on), then the one its reading list put first. Books that
//  wait on each other in a circle (a mistake in the data) are let through one at a time in that same order, so nothing
//  is ever left out.
// ─────────────────────────────────────────────────────────────────

import type { Course, PathBook } from "../core/model";
import { lvlOf, pwBucket, pwMet, pwState } from "./learning";

/** a course's books (all but those kept for reference), in the order to read them */
export function lcOrder(C: Course): PathBook[] {
    const B = C.books.filter(b => !b.ref),
        at = new Map(B.map((b, i) => [b.id, i])),
        key = (b: PathBook): [number, number, number] => [lvlOf(b), b.ord ?? 1e9, at.get(b.id) || 0],
        before = (x: PathBook, y: PathBook) => {
            const a = key(x),
                c = key(y);
            return a[0] - c[0] || a[1] - c[1] || a[2] - c[2];
        };
    // how many books each one still waits on, and which books wait on it
    const waits = new Map<string, number>(),
        next = new Map<string, PathBook[]>();
    for (const b of B) {
        const need = [...new Set((b.after || []).map(c => c.k).filter(k => at.has(k) && k !== b.id))];
        waits.set(b.id, need.length);
        for (const k of need) next.set(k, [...(next.get(k) || []), b]);
    }
    const out: PathBook[] = [],
        done = new Set<string>(),
        free = B.filter(b => !waits.get(b.id));
    while (out.length < B.length) {
        // nothing is free: a circle; the first of what's left goes, as if it were
        if (!free.length) free.push(B.filter(b => !done.has(b.id)).sort(before)[0]);
        free.sort(before);
        const b = free.shift();
        if (!b || done.has(b.id)) continue;
        done.add(b.id);
        out.push(b);
        for (const x of next.get(b.id) || []) {
            const n = (waits.get(x.id) || 0) - 1;
            waits.set(x.id, n);
            if (n === 0 && !done.has(x.id)) free.push(x);
        }
    }
    return out;
}

/** a book to read now, and the books that finishing it (or starting it) would let you start */
export interface NextRow {
    b: PathBook;
    unlocks: PathBook[];
}
/** what to read now, in order: what you're reading, then what's ready. A book below the level you're at now is taken
 *  as known and left out (it's still on the map); optional books, and another book on a topic you've already read
 *  one on at that level, come last. max: how many ready ones to give */
export function lcNext(C: Course, max = 6) {
    const order = lcOrder(C),
        known = (b: PathBook) => !!C.now && lvlOf(b) < C.now && pwState(b) !== "reading";
    // what a book would let you start: books waiting only on it
    const unlocks = (b: PathBook) =>
        order.filter(
            x =>
                pwBucket(C, x) === "waiting" &&
                (x.after || []).some(c => c.k === b.id) &&
                (x.after || []).filter(c => !pwMet(C, c)).every(c => c.k === b.id)
        );
    // a book on a topic you've already read (or are reading) a book on, at its level or above, is another way
    // through the same thing: it comes after the rest
    const serves = (x: PathBook, t: string | undefined) => !!t && (x.topic === t || (x.tops || []).includes(t));
    const covered = (b: PathBook) =>
        C.books.some(
            x => x !== b && serves(x, b.topic) && lvlOf(x) >= lvlOf(b) && ["done", "reading"].includes(pwState(x))
        );
    const reading = order.filter(b => pwState(b) === "reading" && !b.ref),
        free = order.filter(b => pwBucket(C, b) === "ready" && !known(b)),
        ready = free.filter(b => !b.opt && !covered(b)),
        optional = free.filter(b => b.opt || covered(b));
    const row = (b: PathBook): NextRow => ({ b, unlocks: unlocks(b) });
    const left = order.filter(b => !["done", "skip"].includes(pwState(b)) && !b.ref).length;
    return {
        reading: reading.map(row),
        ready: [...ready, ...optional].slice(0, max).map(row),
        more: Math.max(0, ready.length + optional.length - max),
        left,
    };
}
