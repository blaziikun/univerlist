// src/features/learning-centre/learning-build.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: building a course from what you type, then filling it from the universities' own pages
//
//  Typing "maths" or "propulsion" finds a subject or a topic in the catalogue (catalogue/). The course is made from it
//  at once, offline: its topics by area, the standard books for each topic at their levels with what each needs first,
//  and the programmes that teach it, with their modules and reading lists. Then each programme's pages are fetched
//  (its module list, and each module's reading list where it has one of its own), through the same reader as "Fetch
//  from a link" (learning-import.ts): new modules join the programme, matched to the course's topics by name, and the
//  books on a reading list are kept with their module. A book that's already in the course (the same title and
//  author) is the same book. Programmes are fetched side by side; one that fails keeps what it had, and says so.
// ─────────────────────────────────────────────────────────────────

import { errMessage, markDirty, norm, nowISO, ui } from "../core/core";
import type { Course, CurModule, CurProgramme } from "../core/model";
import { renderMain } from "../core/shell";
import { catBookByTitle, catScope, type CatHit } from "./catalogue/catalogue";
import { acId, lcTidyTopics } from "./learning-data";
import { ACS, lcAddBook, lcNewCourse, LCS, sameBook } from "./learning";
import { lcRead } from "./learning-import";

// ── from the catalogue ──
/** a hit from the catalogue into a course (a new one when none is given): its topics, books and programmes join what
 *  the course has, nothing doubled. The course */
export function lcFromCatalogue(h: CatHit, into?: Course): Course {
    const S = h.s,
        sc = catScope(h);
    const C =
        into ||
        lcNewCourse(h.t ? h.t.name : S.name, {
            g: h.t ? h.t.name.charAt(0).toUpperCase() : S.g,
            kind: "sci",
            scope: h.t ? `${S.id}/${h.t.id}` : S.id,
        });
    // topics: the course's own named as the catalogue names them first, so a topic it already has is the same topic
    if (into) lcTidyTopics(C, ACS().gone, [S]);
    const tid: Record<string, string> = {};
    for (const t of sc.topics) {
        const names = [t.name, ...(t.aka || [])].map(norm),
            had = C.topics.find(x => names.includes(norm(x.name)));
        if (had) {
            tid[t.id] = had.id;
            had.area = t.area;
        } else {
            const id = `t-${S.id}-${t.id}`;
            C.topics.push({ id, name: t.name, area: t.area });
            tid[t.id] = id;
        }
    }
    // books: each once, in its first topic, serving the others too; then what each needs, by id
    const bid: Record<string, string> = {},
        base = Math.max(0, ...C.books.map(b => b.ord || 0));
    sc.books.forEach((b, i) => {
        const tops = sc.topics.filter(t => t.books.includes(b.k)).map(t => tid[t.id]);
        const r = lcAddBook(C, { t: b.t, a: b.a, topic: tops[0], lvl: b.lvl });
        for (const t of tops.slice(1))
            if (r.b.topic !== t && !(r.b.tops || []).includes(t)) r.b.tops = [...(r.b.tops || []), t];
        if (r.added) r.b.ord = base + i + 1;
        bid[b.k] = r.b.id;
    });
    for (const b of sc.books) {
        const x = C.books.find(y => y.id === bid[b.k]);
        if (!x) continue;
        for (const [ks, s] of [
            [b.needs || [], "done"],
            [b.with || [], "start"],
        ] as const)
            for (const k of ks) {
                const id = bid[k];
                if (id && id !== x.id && !(x.after || []).some(c => c.k === id))
                    x.after = [...(x.after || []), { k: id, s }];
            }
    }
    // programmes: their modules, the topics each teaches, and their reading lists by title and author
    for (const p of sc.progs) {
        if (C.progs.some(x => x.cat === `${S.id}/${p.id}`)) continue;
        C.progs.push({
            id: "p" + acId(),
            cat: `${S.id}/${p.id}`,
            uni: p.uni,
            name: p.name,
            url: p.url,
            ...(p.src ? { src: p.src } : {}),
            lvl: p.lvl,
            modules: p.modules.map(m => ({
                name: m.name,
                ...(m.code ? { code: m.code } : {}),
                lvl: m.lvl,
                topics: m.topics.map(t => tid[t]).filter(Boolean),
                books: (m.books || []).flatMap((k): [string, string][] => {
                    const b = S.books.find(x => x.k === k);
                    return b ? [[b.t, b.a]] : [];
                }),
                ...(m.list ? { list: m.list } : {}),
            })),
        });
    }
    // one row for each topic: books the course had before go in the catalogue's topics for them
    if (into) lcTidyTopics(C, ACS().gone);
    markDirty();
    return C;
}

// ── from the universities' own pages ──
/** a page that can be read here: not a PDF (the site's /api hands back pages only) */
export const readable = (u: string | undefined): u is string =>
    !!u && /^https?:\/\//.test(u) && !/\.pdf($|[?#])/i.test(u);
/** each programme's fetch while it's going ("…"), or how it ended: by programme id. Not saved: a programme keeps
 *  when it was last fetched and what came of it (got) */
export const lcFetching: Record<string, "…" | "ok" | "fail"> = {};
// a module goes to every topic of the course whose name shares a meaningful word with its own
const WEAK = [
    "introduction",
    "advanced",
    "theory",
    "methods",
    "topics",
    "systems",
    "further",
    "part",
    "principles",
    "fundamentals",
];
function topicsFor(C: Course, name: string): string[] {
    const W = norm(name)
        .split(" ")
        .filter(w => w.length > 3 && !WEAK.includes(w));
    const sc = C.topics.map((t): [string, number] => [
            t.id,
            W.filter(w =>
                norm(t.name)
                    .split(" ")
                    .some(x => x === w || (w.length > 5 && x.startsWith(w.slice(0, 6))))
            ).length,
        ]),
        top = Math.max(0, ...sc.map(x => x[1]));
    return top ? sc.filter(x => x[1] === top).map(x => x[0]) : [];
}
/** a reading list's books into a module's, each once */
function addReadings(m: CurModule, L: [string, string][]): number {
    const had = m.books || [];
    const fresh = L.filter(([t, a]) => t && !had.some(([x, y]) => sameBook(x, y, t, a)));
    m.books = [...had, ...fresh];
    return fresh.length;
}
/** fetch one programme's pages: its module list, then each module's own reading list. What arrived is kept even if a
 *  page fails; the count of modules and books it added */
export async function lcFetchProg(C: Course, p: CurProgramme): Promise<number> {
    let n = 0,
        err = "";
    if (readable(p.url)) {
        try {
            const r = await lcRead(p.url, "modules");
            for (const row of r.kind === "modules" ? r.rows : []) {
                const name = (row.name || "").trim();
                if (!name) continue;
                const same = p.modules.find(
                    m => (row.code && m.code && norm(m.code) === norm(row.code)) || norm(m.name) === norm(name)
                );
                if (same) {
                    if (!same.code && row.code) same.code = row.code;
                    continue;
                }
                // a course for one topic takes only the modules that teach one of its topics
                const topics = topicsFor(C, name);
                if (!topics.length && (C.scope || "").includes("/")) continue;
                p.modules.push({
                    name,
                    ...(row.code ? { code: row.code } : {}),
                    core: row.core !== false,
                    lvl: p.lvl,
                    topics,
                    books: [],
                });
                n++;
            }
        } catch (e) {
            err = errMessage(e);
        }
    }
    for (const m of p.modules)
        if (readable(m.list)) {
            try {
                const r = await lcRead(m.list, "readings");
                n += addReadings(
                    m,
                    r.rows.flatMap((x): [string, string][] => (x.t ? [[x.t, x.a || ""]] : []))
                );
            } catch (e) {
                err ||= errMessage(e);
            }
        }
    p.got = { at: nowISO(), n, ...(err ? { err } : {}) };
    return n;
}
/** fetch the course's programmes (those given, else all with a page to read), side by side, showing each as it goes;
 *  the course is usable throughout and keeps whatever arrives */
export async function lcFetchAll(cid: string, only?: string[]): Promise<void> {
    const C = LCS().find(x => x.id === cid);
    if (!C) return;
    const P = C.progs.filter(
        p =>
            (!only || only.includes(p.id)) &&
            (readable(p.url) || p.modules.some(m => readable(m.list))) &&
            lcFetching[p.id] !== "…"
    );
    const draw = () => {
        if (ui.tab === "learn" || ui.tab === "curricula") renderMain();
    };
    for (const p of P) lcFetching[p.id] = "…";
    draw();
    await Promise.all(
        P.map(async p => {
            try {
                await lcFetchProg(C, p);
                lcFetching[p.id] = p.got?.err ? "fail" : "ok";
            } catch {
                lcFetching[p.id] = "fail";
            }
            markDirty();
            draw();
        })
    );
}

// ── a book found elsewhere (Add's search), into a course: its topic and level, guessed ──
/** the topic and level a book most likely has in a course: the catalogue's, when it knows the book and the course has
 *  that topic; else the topic sharing most words with its title and genres; a level from words in its title */
export function lcGuess(C: Course, title: string, words: string[] = []): { topic: string; lvl: number } {
    const known = catBookByTitle(title);
    const byName = known?.topic && C.topics.find(t => norm(t.name) === norm(known.topic?.name || ""));
    const W = norm([title, ...words].join(" "))
        .split(" ")
        .filter(w => w.length > 3 && !WEAK.includes(w));
    const scored = C.topics
        .map((t): [string, number] => [
            t.id,
            W.filter(w =>
                norm(`${t.name} ${t.area || ""}`)
                    .split(" ")
                    .some(x => x === w || (w.length > 5 && x.startsWith(w.slice(0, 5))))
            ).length,
        ])
        .sort((a, b) => b[1] - a[1]);
    const topic = byName ? byName.id : scored[0] && scored[0][1] ? scored[0][0] : C.topics[0]?.id || "";
    const t = title.toLowerCase();
    const lvl = known
        ? known.b.lvl
        : /\b(for beginners|a first|elementary|primer|essential|basic)\b/.test(t)
          ? 1
          : /\b(advanced|graduate|lectures on|monograph)\b/.test(t)
            ? 3
            : 2;
    return { topic, lvl };
}
