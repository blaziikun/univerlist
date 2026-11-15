// src/features/learning-centre/catalogue/catalogue.ts
// ─────────────────────────────────────────────────────────────────
//  The catalogue: subjects, their topics by area, the standard books for each topic at each level (with which book
//  needs which first), and programmes that teach the subject, with the pages that list their modules and reading lists
//
//  It's what "New course" builds from when you type a subject ("maths") or a narrower topic ("propulsion"): a course is
//  made from it at once, offline, and the programmes' own pages are fetched afterwards (learning-build.ts). Every book
//  here is a real book, and every page was checked to be what it says; the subjects' files beside this hold the data.
// ─────────────────────────────────────────────────────────────────

import { norm } from "../../core/core";
import type { Course } from "../../core/model";
import type { CatBook, CatProg, CatSubject, CatTopic } from "./types";
import { MATHS } from "./maths";
import { THEORETICAL_PHYSICS, PHYSICS } from "./physics";
import { AEROSPACE, MECHANICAL } from "./engineering";
import { COMPUTER_SCIENCE, ELECTRICAL } from "./computing";
import { CHEMISTRY, ECONOMICS, PHILOSOPHY } from "./more";

export const CATALOGUE: CatSubject[] = [
    MATHS,
    THEORETICAL_PHYSICS,
    PHYSICS,
    AEROSPACE,
    MECHANICAL,
    COMPUTER_SCIENCE,
    ELECTRICAL,
    CHEMISTRY,
    ECONOMICS,
    PHILOSOPHY,
];

// ── finding what was typed ──
/** what typing found: a subject, or one of its topics */
export interface CatHit {
    s: CatSubject;
    t?: CatTopic;
    score: number;
}
const words = (s: string) => norm(s.replace(/&/g, " and ")).split(" ").filter(Boolean);
const key = (s: string) => words(s).join(" ");
/** how well what was typed matches a name: 3 the same, 2 the start of it (or every word starts one of its words), 1
 *  every word is in it, 0 not at all */
function fitOf(q: string, name: string): number {
    const a = key(q),
        b = key(name);
    if (!a || !b) return 0;
    if (a === b) return 3;
    if (a.length >= 3 && b.startsWith(a)) return 2;
    const W = words(q),
        N = words(name);
    if (W.length && W.every(w => N.some(n => n.startsWith(w) && w.length >= 3))) return 2;
    return W.length && W.every(w => N.some(n => n === w || (w.length >= 4 && n.includes(w)))) ? 1 : 0;
}
/** subjects and topics for what was typed, best first: a whole subject before one of its topics when they fit as well */
export function catFind(q: string, max = 8): CatHit[] {
    const out: CatHit[] = [];
    for (const s of CATALOGUE) {
        const sf = Math.max(fitOf(q, s.name), ...s.aka.map(x => fitOf(q, x)));
        if (sf) out.push({ s, score: sf * 10 + 1 });
        for (const t of s.topics) {
            const tf = Math.max(fitOf(q, t.name), ...(t.aka || []).map(x => fitOf(q, x)));
            if (tf) out.push({ s, t, score: tf * 10 });
        }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, max);
}
export const catName = (h: CatHit) => (h.t ? h.t.name : h.s.name);
export const catWhere = (h: CatHit) => (h.t ? `${h.t.area} · ${h.s.name}` : `${h.s.topics.length} topics`);
/** a subject, by its id */
export const catSubject = (id: string) => CATALOGUE.find(s => s.id === id);
/** a book of the catalogue with this title, anywhere (for a book found elsewhere: its level and topic) */
export function catBookByTitle(t: string): { s: CatSubject; b: CatBook; topic?: CatTopic } | null {
    const k = key(String(t).split(":")[0]);
    for (const s of CATALOGUE)
        for (const b of s.books)
            if (key(b.t.split(":")[0]) === k) return { s, b, topic: s.topics.find(x => x.books.includes(b.k)) };
    return null;
}

// ── a course's own topic names, matched to the catalogue's ──
// Older courses and imported lists name topics their own way ("Analysis", "Group theory", "Vectors and Matrices"); they
// are matched to the catalogue's topic (Real analysis, Groups, Linear algebra) so a course has one row for each.
const SMALL = new Set(["and", "of", "the", "to", "in", "for", "an", "a", "with", "on", "introduction", "intro"]);
const SMALL_MORE = ["i", "ii", "iii", "iv", "ia", "ib", "part", "advanced", "elementary", "basic", "further"];
for (const w of SMALL_MORE) SMALL.add(w);
/** a word, singular: "groups" is "group", but "analysis", "physics" and "class" stay as they are */
const one = (w: string) => (w.length > 3 && w.endsWith("s") && !/(ss|is|us|ics)$/.test(w) ? w.slice(0, -1) : w);
/** the words of a topic's name that say what it is */
const topicWords = (s: string) =>
    words(s)
        .map(one)
        .filter(w => !SMALL.has(w));
const sameWords = (a: string[], b: string[]) => a.length === b.length && a.every(w => b.includes(w));
const inside = (a: string[], b: string[]) => a.length > 0 && a.every(w => b.includes(w));
/** a name that stands for no topic in particular ("General", "Readings") */
export const looseTopic = (name: string) =>
    !topicWords(name).length || ["general", "topics", "other", "readings", "misc", "miscellaneous"].includes(key(name));
/** the catalogue's topic a name is, in these subjects: the same words as its name or a name it's known by (any case,
 *  plural or not); else the closest whose name holds all the words ("Analysis" is Real analysis), or whose name of two
 *  words or more is all in it ("Fluid mechanics for engineers" is Fluid mechanics) */
export function catTopicFor(name: string, subs: CatSubject[]): { s: CatSubject; t: CatTopic } | null {
    if (looseTopic(name)) return null;
    const W = topicWords(name);
    const all = subs.flatMap(s => s.topics.map(t => ({ s, t, N: [t.name, ...(t.aka || [])].map(topicWords) })));
    const same = all.find(x => x.N.some(n => sameWords(W, n)));
    if (same) return { s: same.s, t: same.t };
    let best: { s: CatSubject; t: CatTopic } | null = null,
        gap = Number.POSITIVE_INFINITY;
    for (const x of all)
        for (const n of x.N)
            if ((inside(W, n) || (n.length > 1 && inside(n, W))) && Math.abs(n.length - W.length) < gap) {
                best = { s: x.s, t: x.t };
                gap = Math.abs(n.length - W.length);
            }
    return best;
}
/** the area of these subjects a topic the catalogue doesn't have fits best: the one sharing most words with it (its
 *  name, its topics' names) */
export function catAreaFor(name: string, subs: CatSubject[]): string {
    const W = topicWords(name),
        score = new Map<string, number>();
    for (const s of subs)
        for (const t of s.topics) {
            const N = new Set([t.area, t.name, ...(t.aka || [])].flatMap(topicWords));
            const n = W.filter(w => N.has(w)).length;
            if (n) score.set(t.area, (score.get(t.area) || 0) + n);
        }
    let best = "",
        most = 0;
    for (const [a, n] of score)
        if (n > most) {
            best = a;
            most = n;
        }
    return best;
}
/** the catalogue's subjects a course draws on: what it was built from, its programmes', the subject its name is, and
 *  the one most of its books are in */
export function catSubjectsFor(C: Pick<Course, "name" | "scope" | "progs" | "books">): CatSubject[] {
    const ids = new Set<string>();
    for (const x of [C.scope, ...C.progs.map(p => p.cat)]) if (typeof x === "string" && x) ids.add(x.split("/")[0]);
    for (const h of catFind(C.name)) if (!h.t && h.score >= 21) ids.add(h.s.id);
    const count = new Map<string, number>();
    for (const b of C.books) {
        const s = catBookIn(CATALOGUE, b.t, b.a)?.s.id;
        if (s) count.set(s, (count.get(s) || 0) + 1);
    }
    const top = [...count].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) ids.add(top[0]);
    return CATALOGUE.filter(s => ids.has(s.id));
}
/** surnames: the last word of each author */
const surnames = (a: string | undefined) =>
    String(a || "")
        .split(/,|&|\band\b/)
        .map(x => words(x).pop() || "")
        .filter(x => x.length > 1);
/** a book in these subjects: the same title (before any colon) and, when both have one, an author in common; with the
 *  topics the catalogue puts it in */
export function catBookIn(
    subs: CatSubject[],
    t: string,
    a?: string
): { s: CatSubject; b: CatBook; topics: CatTopic[] } | null {
    const k = key(String(t).split(":")[0]),
        A = surnames(a);
    for (const s of subs)
        for (const b of s.books)
            if (key(b.t.split(":")[0]) === k && (!A.length || surnames(b.a).some(x => A.includes(x))))
                return { s, b, topics: s.topics.filter(x => x.books.includes(b.k)) };
    return null;
}

/** what a hit brings: the topics (a topic and what it builds on, or the whole subject), the books in them with what
 *  they need, and the programmes' modules that teach them */
export function catScope(h: CatHit): { topics: CatTopic[]; books: CatBook[]; progs: CatProg[] } {
    const S = h.s;
    if (!h.t) return { topics: S.topics, books: S.books, progs: S.progs };
    const T = new Set<string>(),
        addT = (id: string) => {
            if (T.has(id)) return;
            T.add(id);
            for (const a of S.topics.find(x => x.id === id)?.after || []) addT(a);
        };
    addT(h.t.id);
    // its own books, and every book they need, however far back
    const B = new Set<string>(),
        addB = (k: string) => {
            if (B.has(k)) return;
            B.add(k);
            const b = S.books.find(x => x.k === k);
            for (const n of [...(b?.needs || []), ...(b?.with || [])]) addB(n);
        };
    for (const k of h.t.books) addB(k);
    // a topic it builds on with none of those books brings its first one, so its row isn't empty
    for (const id of T) {
        const tp = S.topics.find(x => x.id === id);
        if (tp && !tp.books.some(k => B.has(k)) && tp.books[0]) addB(tp.books[0]);
    }
    // the topics those books are in join too
    for (const t of S.topics) if (t.books.some(k => B.has(k))) T.add(t.id);
    const topics = S.topics.filter(t => T.has(t.id));
    return {
        topics,
        books: S.books.filter(b => B.has(b.k)),
        progs: S.progs
            .map(p => ({ ...p, modules: p.modules.filter(m => m.topics.some(x => T.has(x))) }))
            .filter(p => p.modules.length),
    };
}
