// src/features/learning-centre/catalogue/types.ts
// ─────────────────────────────────────────────────────────────────
//  The catalogue's shape: a subject's books, its topics (each with its books) and the programmes that teach it. The
//  subjects' files (maths.ts…) are written in it; catalogue.ts finds and scopes them.
// ─────────────────────────────────────────────────────────────────

/** a book: its key (unique in its subject), title, author(s), level (1 Foundations, 2 Undergraduate, 3 Master's,
 *  4 PhD), the books it needs done first, and those it only needs underway */
export interface CatBook {
    k: string;
    t: string;
    a: string;
    lvl: number;
    needs?: string[];
    with?: string[];
}
/** a topic: its id (unique in its subject), name, area, other names it's known by, the topics it builds on, and its
 *  books (by key) */
export interface CatTopic {
    id: string;
    name: string;
    area: string;
    aka?: string[];
    after?: string[];
    books: string[];
}
/** a module of a programme: its name, code, level, the topics it teaches, the books its reading list sets (by key),
 *  and its reading list's own page */
export interface CatModule {
    name: string;
    code?: string;
    lvl: number;
    topics: string[];
    books?: string[];
    list?: string;
}
/** a programme: its university and name, its level, the page listing its modules, where its reading lists are printed
 *  (when that's a PDF, which can't be fetched), and its modules */
export interface CatProg {
    id: string;
    uni: string;
    name: string;
    lvl: number;
    url: string;
    src?: string;
    modules: CatModule[];
}
export interface CatSubject {
    id: string;
    name: string;
    g: string;
    aka: string[];
    books: CatBook[];
    topics: CatTopic[];
    progs: CatProg[];
}
/** a book, written short: key, title, author, level, and what it needs done first */
export const bk = (k: string, t: string, a: string, lvl: number, needs?: string[], with_?: string[]): CatBook => ({
    k,
    t,
    a,
    lvl,
    ...(needs && needs.length ? { needs } : {}),
    ...(with_ && with_.length ? { with: with_ } : {}),
});
