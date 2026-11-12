// src/features/learning-centre/learning.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: an official extension (Settings › Extensions › Built in) with a space of its own
//
//  It starts empty. Everything in it is yours: subjects (with your level in each field, if you like) and paths. A path
//  is one way through a subject, from the university you choose for it (a different one per path if you like):
//    stages (years, terms…) → modules (code, name, credits, core or option) → readings, in reading order
//  Each reading can wait for others ("once Spivak is underway", "once Rudin is done"), so the path knows what you can
//  start now, what's waiting and what finishing a book unlocks. A reading's progress comes from your library when it's
//  there. Module lists and reading lists can be fetched from a university's own pages (learning-import below), checked,
//  then saved. A Learning Centre from an import or an older version comes in through lcConvertOld(), which checks it.
// ─────────────────────────────────────────────────────────────────

import {
    addItem,
    clone,
    fieldsOf,
    isRecord,
    isSealed,
    items,
    lcEmpty,
    listOf,
    markDirty,
    meta,
    norm,
    nowISO,
    numOf,
    ownOf,
    patch,
    recordsOf,
    strsOf,
    textOf,
    titleOf,
    toast,
    ui,
} from "../core/core";
import type { ActEl } from "../core/core";
import type { Course, Courses, Curriculum, Modal, PathBook, PathCond, PathModule, Pathway } from "../core/model";
import { autoCovers } from "../sources/covers";
import { renderMain } from "../core/shell";
import { BLOCKS } from "../library/blocks";
import { closeModal, openModal, renderOverlay } from "../core/modals";

import { lcHubClick } from "./learning-hub";
import { goTab } from "../core/navigation";

const PW_COLORS = [
    "#d4ad55",
    "#7aa7f0",
    "#6fcf97",
    "#e0896a",
    "#b394ee",
    "#4fc3b3",
    "#e58ac0",
    "#c9c26a",
    "#9fb3c8",
    "#ef7f7f",
];
export const PW_ST: [string, string][] = [
    ["todo", "To read"],
    ["reading", "Reading"],
    ["done", "Done"],
    ["skip", "Skipping"],
];
const PW_RANK: Record<string, number> = { todo: 0, skip: 0, reading: 1, done: 2 };
/** the levels you rate yourself at in a course's fields: name, and what it means */
export const LEVELS: [name: string, about: string][] = [
    ["Not started", "–"],
    ["Foundations", "School and first-year level"],
    ["Undergraduate", "Finals of a strong bachelor's"],
    ["Master's", "A taught master's"],
    ["PhD", "Qualifying exams"],
    ["Research", "Original work"],
];
export const acId = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
/** the Learning Centre, in today's form */
export const ACS = (): Courses => {
    if (!meta.courses || meta.courses.v !== 2) meta.courses = lcConvertOld(meta.courses);
    meta.courses.curricula = meta.courses.curricula || {};
    lcOnePerCourse(meta.courses);
    return meta.courses;
}; // older data is converted, never dropped
export const PWS = () => ACS().paths;
export const LSUBS = () => ACS().subjects;
export const lcSub = (id: string | null | undefined): Course | undefined => LSUBS().find(s => s.id === id);
/** a pathway, by its id */
export const lcPath = (id: string): Pathway | undefined => PWS().find(p => p.id === id);
/** the pathway open */
export const pwCur = (): Pathway | null => PWS().find(p => p.id === ui.pwId) || null;
export const pwBook = (P: Pathway, k: string | undefined) => P.books.find(b => b.id === k);
export const lcMod = (P: { modules?: PathModule[] }, id: string | undefined): PathModule | undefined =>
    (P.modules || []).find(m => m.id === id);
export const lcLane = (P: Pathway, b: PathBook): string => b.th || (lcMod(P, b.mod) || { name: "" }).name || "Readings";
// ── a course and its pathway are one thing ──
// The course is what you're learning (your level in its fields, the best books, where to learn it); its pathway is what
// you work through (reading order, years and modules, milestones). They're stored apart (meta.courses.subjects and
// .paths, so exports keep their shape), but there is exactly one pathway per course, made when it's first needed.
export const coursePath = (S: Course): Pathway =>
    PWS().find(p => p.sub === S.id) || lcNewPath({ name: S.name, sub: S.id });
/** keeps it one pathway per course: older libraries and imports can have several, or some with no course. Nothing is
 * dropped: several become one (see lcAbsorb), and a pathway without a course becomes a course of its own */
export function lcOnePerCourse(C: Courses) {
    const subs = new Set(C.subjects.map(s => s.id)),
        seen = new Set();
    if (C.paths.every(p => subs.has(p.sub) && !seen.has(p.sub) && seen.add(p.sub))) return; // the usual case: nothing to do
    for (const P of C.paths)
        if (!subs.has(P.sub)) {
            const name = P.name || P.programme || "Untitled";
            const S: Course = { id: acId(), name, g: name.charAt(0).toUpperCase(), fields: {}, order: [], goal: 0 };
            C.subjects.push(S);
            subs.add(S.id);
            P.sub = S.id;
        }
    for (const S of C.subjects) {
        const [P, ...rest] = C.paths.filter(p => p.sub === S.id);
        if (!P || !rest.length) continue;
        for (const Q of rest) lcAbsorb(P, Q);
        C.paths = C.paths.filter(p => !rest.includes(p));
        if (rest.some(Q => Q.id === ui.pwId)) ui.pwId = P.id;
    }
    markDirty();
}
const PW_ST_ORDER = ["todo", "skip", "reading", "done"];
/** pathway Q joins pathway P: its books, years, modules, threads and milestones become P's, and everything else about
 * it (its name, university, programme, link, summary, requirements) is kept in P.merged and shown on the course */
function lcAbsorb(P: Pathway, Q: Pathway) {
    const stageOf: Record<string, string> = {};
    for (const st of Q.stages || []) {
        const same = (P.stages || []).find(x => norm(x.name) === norm(st.name));
        if (same)
            stageOf[st.id] = same.id; // "Year 1" twice is one Year 1
        else P.stages = [...(P.stages || []), st];
    }
    P.modules = [...(P.modules || []), ...(Q.modules || []).map(m => ({ ...m, stage: stageOf[m.stage] || m.stage }))];
    for (const b of Q.books || []) {
        const had = P.books.find(x => x.id === b.id);
        if (!had) P.books.push(b);
        else if (PW_ST_ORDER.indexOf(b.st || "") > PW_ST_ORDER.indexOf(had.st || "")) had.st = b.st; // the same book: keep the further along
    }
    P.threads = [...new Set([...(P.threads || []), ...(Q.threads || [])])];
    P.goals = [...(P.goals || []), ...(Q.goals || [])];
    P.method = [P.method, Q.method].filter(x => x && x.trim()).join("\n");
    for (const f of ["uni", "programme", "url", "about"] as const) if (!P[f] && Q[f]) P[f] = Q[f];
    const { books: _b, stages: _s, modules: _m, threads: _t, goals: _g, method: _d, merged, ...rest } = Q;
    P.merged = [...(P.merged || []), rest, ...(merged || [])];
}
export function lcNewPath(o: Partial<Pathway> = {}): Pathway {
    const P: Pathway = {
        id: acId(),
        name: o.name || "New path",
        sub: o.sub || "",
        uni: o.uni || "",
        programme: o.programme || "",
        url: o.url || "",
        about: o.about || "",
        method: "",
        goals: [],
        view: "modules",
        threads: [],
        stages: [],
        modules: [],
        books: [],
        at: nowISO(),
    };
    PWS().push(P);
    markDirty();
    return P;
}

// ── from the old Academic (before it was the Learning Centre): its programmes, pathways and levels, as subjects and paths ──
// Subjects keep their old ids ("s-maths"), so the personal content file and your own converted data meet without duplicates.
const LC_OLD_SUBJECTS: Record<string, [name: string, glyph: string]> = {
    maths: ["Mathematics", "∑"],
    aero: ["Aeronautics & space", "✈"],
    astro: ["Astrophysics", "◉"],
    cs: ["Computer science", "⌨"],
    robotics: ["Robotics", "⚙"],
    culinary: ["Culinary arts", "♨"],
    architecture: ["Architecture & interiors", "⌂"],
    fashion: ["Fashion design", "✂"],
    music: ["Music", "♪"],
    philosophy: ["Philosophy", "¶"],
    theology: ["Theology & religion", "✶"],
    psychology: ["Psychology", "◎"],
};
const LC_OLD_BY_NAME: Record<string, string> = {
    Mathematics: "maths",
    Aerospace: "aero",
    Engineering: "aero",
    Astrophysics: "astro",
    "Computer science": "cs",
    Robotics: "robotics",
    Electronics: "cs",
};
/** the Learning Centre from anywhere (this browser, an import, an older version's Academic) in today's form: today's
 * kind is checked, an older one is converted, and anything else is an empty one */
export function lcConvertOld(o: unknown): Courses {
    if (isRecord(o) && o.v === 2) return lcCheck(o); // already today's kind
    const out: Courses = lcEmpty();
    if (!isRecord(o)) return out;
    const subs = new Map<string, Course>(),
        sub = (old: string): string => {
            if (!old) return "";
            const id = "s-" + old;
            if (!subs.has(id)) {
                const [name, g] = ownOf(LC_OLD_SUBJECTS, old) || [old, old.charAt(0).toUpperCase()];
                subs.set(id, { id, name, g, fields: {}, order: [], goal: 0 });
            }
            return id;
        };
    const subOf = (p: Record<string, unknown>) => {
        const subject = textOf(p.subject);
        return sub(
            textOf(p.sub) ||
                ownOf(LC_OLD_BY_NAME, subject) ||
                (Object.entries(LC_OLD_SUBJECTS).find(([, v]) => v[0] === subject) || [])[0] ||
                ""
        );
    };
    for (const [k, st] of Object.entries(fieldsOf(fieldsOf(o.learn).subjects))) {
        const F = Object.entries(fieldsOf(fieldsOf(st).fields)),
            goal = levelOf(fieldsOf(st).goal);
        if (!F.length && !goal) continue;
        const S = subs.get(sub(k));
        if (!S) continue;
        for (const [f, v] of F) {
            S.fields[f] = { lvl: levelOf(fieldsOf(v).lvl) };
            (S.order ||= []).push(f);
        }
        S.goal = goal;
    }
    for (const p of recordsOf(o.paths))
        out.paths.push({
            ...p,
            id: textOf(p.id) || acId(),
            name: textOf(p.name),
            sub: subOf(p),
            uni: textOf(p.uni),
            programme: "",
            url: "",
            stages: [],
            modules: [],
            view: ["map", "stages", "threads"].includes(textOf(p.view)) ? textOf(p.view) : "map",
            books: booksOf(p.books).map(b => ({ ...b, opt: b.opt || !!b.branch || undefined })),
        });
    for (const p of recordsOf(o.programmes)) {
        const stages: { id: string; name: string }[] = [],
            modules: PathModule[] = [],
            books: PathBook[] = [];
        recordsOf(p.years).forEach((y, i) => {
            const sid = acId() + i;
            stages.push({ id: sid, name: "Year " + (numOf(y.n) || i + 1) });
            for (const m of recordsOf(y.modules)) {
                const mid = textOf(m.id) || acId();
                modules.push({
                    id: mid,
                    stage: sid,
                    code: textOf(m.code),
                    name: textOf(m.name),
                    credits: textOf(m.credits),
                    core: m.kind !== "option",
                    status: textOf(m.status) || "planned",
                    grade: textOf(m.grade),
                    term: textOf(m.term),
                    topics: listOf(m.topics).flatMap(t =>
                        typeof t === "string"
                            ? [{ t, done: false }]
                            : isRecord(t)
                              ? [{ t: textOf(t.t), done: !!t.done }]
                              : []
                    ),
                });
                for (const iid of strsOf(m.readings)) {
                    const it = items.get(iid);
                    if (it)
                        books.push({
                            id: "b" + acId(),
                            t: it.title,
                            a: it.creator || "",
                            mod: mid,
                            th: "",
                            st: "todo",
                            note: "",
                            after: [],
                            lib: iid,
                        });
                }
            }
        });
        out.paths.push({
            id: textOf(p.id) || acId(),
            name: textOf(p.name),
            sub: subOf(p),
            uni: textOf(p.uni),
            programme: textOf(p.name),
            url: "",
            about: textOf(p.basis),
            method: "",
            goals: [],
            view: "modules",
            threads: [],
            stages,
            modules,
            books,
            at: nowISO(),
        });
    }
    out.subjects = [...subs.values()];
    // your Curricula picks, books you added and programmes you pasted: they meet the programmes again when your content file comes in
    const curricula: Record<string, Curriculum> = {};
    for (const [k, c] of Object.entries(fieldsOf(o.cur))) {
        const x = fieldsOf(c);
        curricula["s-" + k] = curriculumOf({
            progs: recordsOf(x.mine).map(p => ({ ...p, kind: "mine" })),
            chosen: x.chosen,
            extra: x.extra,
            hide: x.hide,
        });
    }
    out.curricula = curricula;
    return out;
}
// ── checking a Learning Centre that comes in (an import, the cloud copy): what isn't the shape it keeps is left out ──
const idOf = (x: Record<string, unknown>) => (typeof x.id === "string" && x.id ? x.id : "");
/** a level from outside, one of LEVELS (a page draws each by its place in that list) */
const levelOf = (x: unknown) => Math.max(0, Math.min(LEVELS.length - 1, Math.round(numOf(x) || 0)));
/** a pathway's readings: each with an id and a title, its conditions and parts as they should be */
function booksOf(x: unknown): PathBook[] {
    return recordsOf(x).flatMap(b => {
        const id = idOf(b);
        if (!id) return [];
        const after = recordsOf(b.after).flatMap((c): PathCond[] =>
            typeof c.k === "string"
                ? [{ k: c.k, s: textOf(c.s) || "done", ...(numOf(c.p) != null ? { p: numOf(c.p) } : {}) }]
                : []
        );
        const parts = recordsOf(b.parts).map(x => ({ t: textOf(x.t), done: !!x.done }));
        const year = typeof b.year === "number" ? b.year : textOf(b.year);
        return [
            {
                ...b,
                id,
                t: textOf(b.t),
                a: textOf(b.a),
                year,
                mod: textOf(b.mod),
                th: textOf(b.th),
                st: textOf(b.st) || "todo",
                note: textOf(b.note),
                lib: textOf(b.lib) || undefined,
                after,
                ...(Array.isArray(b.parts) ? { parts } : { parts: undefined }),
            },
        ];
    });
}
/** a pathway's modules: each with an id and a name, its topics and the modules it waits on as they should be */
function modulesOf(x: unknown): PathModule[] {
    return recordsOf(x).flatMap(m => {
        const id = idOf(m);
        if (!id) return [];
        const grade = typeof m.grade === "number" ? m.grade : textOf(m.grade),
            credits = typeof m.credits === "number" ? m.credits : textOf(m.credits);
        return [
            {
                ...m,
                id,
                stage: textOf(m.stage),
                code: textOf(m.code),
                name: textOf(m.name),
                credits,
                grade,
                status: textOf(m.status) || "planned",
                term: textOf(m.term),
                core: m.core !== false,
                topics: recordsOf(m.topics).map(t => ({
                    t: textOf(t.t),
                    done: !!t.done,
                    ...(Array.isArray(t.after) ? { after: strsOf(t.after) } : {}),
                })),
                ...(Array.isArray(m.after) ? { after: strsOf(m.after) } : { after: undefined }),
            },
        ];
    });
}
/** a course's Curricula: topics, programmes and books, with your picks */
function curriculumOf(x: Record<string, unknown>): Curriculum {
    const books: Curriculum["books"] = {};
    for (const [k, v] of Object.entries(fieldsOf(x.books)))
        if (Array.isArray(v)) books[k] = [textOf(v[0]), textOf(v[1])];
    const extra: Curriculum["extra"] = {};
    for (const [k, v] of Object.entries(fieldsOf(x.extra)))
        extra[k] = listOf(v).flatMap((e): [string, string, string][] =>
            Array.isArray(e) && typeof e[0] === "string" ? [[e[0], textOf(e[1]), textOf(e[2])]] : []
        );
    return {
        topics: recordsOf(x.topics).flatMap(t =>
            idOf(t) ? [{ id: idOf(t), name: textOf(t.name), ...(t.area != null ? { area: textOf(t.area) } : {}) }] : []
        ),
        books,
        progs: recordsOf(x.progs).flatMap(p =>
            idOf(p)
                ? [
                      {
                          ...p,
                          id: idOf(p),
                          uni: textOf(p.uni),
                          name: textOf(p.name),
                          modules: recordsOf(p.modules).map(m => ({
                              ...m,
                              name: textOf(m.name),
                              core: !!m.core,
                              topics: strsOf(m.topics),
                              books: listOf(m.books).flatMap((b): (string | string[])[] =>
                                  typeof b === "string" ? [b] : Array.isArray(b) ? [b.map(textOf)] : []
                              ),
                          })),
                      },
                  ]
                : []
        ),
        chosen: Object.fromEntries(
            Object.entries(fieldsOf(x.chosen)).filter((e): e is [string, string] => typeof e[1] === "string")
        ),
        extra,
        hide: strsOf(x.hide),
    };
}
/** today's Learning Centre, checked: courses and pathways with ids, every list a list, every name words */
function lcCheck(o: Record<string, unknown>): Courses {
    const subjects = recordsOf(o.subjects).flatMap((s): Course[] => {
        const id = idOf(s);
        if (!id) return [];
        const fields: Course["fields"] = {};
        for (const [f, v] of Object.entries(fieldsOf(s.fields)))
            if (isRecord(v)) fields[f] = { ...v, lvl: levelOf(v.lvl) };
        return [
            {
                ...s,
                id,
                name: textOf(s.name) || "Untitled",
                g: textOf(s.g) || undefined,
                fields,
                order: Array.isArray(s.order) ? strsOf(s.order) : undefined,
                goal: levelOf(s.goal),
                sources: recordsOf(s.sources).flatMap(x =>
                    idOf(x)
                        ? [
                              {
                                  id: idOf(x),
                                  kind: textOf(x.kind),
                                  name: textOf(x.name),
                                  url: textOf(x.url),
                                  note: textOf(x.note),
                              },
                          ]
                        : []
                ),
                opps: recordsOf(s.opps).flatMap(x =>
                    idOf(x)
                        ? [
                              {
                                  ...x,
                                  id: idOf(x),
                                  t: textOf(x.t),
                                  when: textOf(x.when),
                                  url: textOf(x.url),
                                  done: !!x.done,
                              },
                          ]
                        : []
                ),
            },
        ];
    });
    const paths = recordsOf(o.paths).flatMap((p): Pathway[] => {
        const id = idOf(p);
        if (!id) return [];
        return [
            {
                ...p,
                id,
                name: textOf(p.name),
                sub: textOf(p.sub),
                uni: textOf(p.uni),
                programme: textOf(p.programme),
                url: textOf(p.url),
                about: textOf(p.about),
                method: textOf(p.method),
                view: textOf(p.view) || undefined,
                goals: recordsOf(p.goals).flatMap(g =>
                    idOf(g) ? [{ id: idOf(g), t: textOf(g.t), date: textOf(g.date), done: !!g.done }] : []
                ),
                threads: strsOf(p.threads),
                stages: recordsOf(p.stages).flatMap(st =>
                    idOf(st) ? [{ id: idOf(st), name: textOf(st.name), ...(st.spec ? { spec: true } : {}) }] : []
                ),
                modules: modulesOf(p.modules),
                books: booksOf(p.books),
                merged: Array.isArray(p.merged) ? recordsOf(p.merged) : undefined,
                req: isRecord(p.req)
                    ? Object.fromEntries(Object.entries(p.req).map(([k, v]) => [k, numOf(v)]))
                    : undefined,
            },
        ];
    });
    const curricula: Record<string, Curriculum> = {};
    for (const [k, c] of Object.entries(fieldsOf(o.curricula))) if (isRecord(c)) curricula[k] = curriculumOf(c);
    return { v: 2, subjects, paths, curricula };
}

// ── progress: from your library when the book is there, else from the path ──
let pwLibIdx: { n: number; m: Map<string, string[]> } | null = null;
function pwLibIndex(): Map<string, string[]> {
    if (pwLibIdx && pwLibIdx.n === items.size) return pwLibIdx.m;
    const m = new Map<string, string[]>();
    for (const [id, b] of items)
        if (b.medium === "book" && !isSealed(b)) {
            for (const t of [b.title, titleOf(b)]) {
                const k = norm(String(t || "").split(":")[0]);
                if (k) {
                    const L = m.get(k);
                    if (L) L.push(id);
                    else m.set(k, [id]);
                }
            }
        }
    pwLibIdx = { n: items.size, m };
    return m;
}
const pwSurnames = (s: string) =>
    norm(s)
        .split(" ")
        .filter(w => w.length > 2);
/** the entry in your library a reading is, if any */
export function pwLib(b: PathBook): string | null {
    if (b.lib && items.has(b.lib)) return b.lib;
    const C = pwLibIndex().get(norm(String(b.t).split(":")[0])) || [],
        sn = pwSurnames(b.a || "");
    return (
        C.find(id => {
            const c = items.get(id)?.creator || "";
            return !c || !sn.length || sn.some(w => norm(c).includes(w));
        }) || null
    );
}
export function pwState(b: PathBook): string {
    if (b.st === "skip") return "skip";
    const lid = pwLib(b),
        L = lid ? items.get(lid) : null;
    const ls = !L
        ? "todo"
        : L.status === "done"
          ? "done"
          : ["active", "redo", "paused"].includes(L.status)
            ? "reading"
            : "todo";
    const was = ownOf(PW_RANK, b.st || "todo");
    return was != null && PW_RANK[ls] > was ? ls : b.st || "todo";
}
export const pwPartDone = (b: PathBook, i: number) => pwState(b) === "done" || !!(b.parts || [])[i]?.done;
export function pwMet(P: Pathway, c: PathCond) {
    const x = pwBook(P, c.k);
    if (!x) return true;
    const s = pwState(x);
    return c.s === "start" ? s === "reading" || s === "done" : c.s === "part" ? pwPartDone(x, c.p || 0) : s === "done";
}
export function pwBucket(P: Pathway, b: PathBook): string {
    const s = pwState(b);
    if (b.ref) return "ref";
    if (s === "done" || s === "reading" || s === "skip") return s;
    return (b.after || []).every(c => pwMet(P, c)) ? "ready" : "waiting";
}
/** each reading's stage on its pathway, by reading id */
export function pwStages(P: Pathway): Record<string, number> {
    const memo: Record<string, number> = {},
        seen = new Set<string>();
    const d = (k: string): number => {
        if (memo[k] != null) return memo[k];
        if (seen.has(k)) return 0;
        seen.add(k);
        const b = pwBook(P, k);
        const after = (b && b.after) || [];
        const v = !after.length ? 0 : 1 + Math.max(...after.map(c => d(c.k)));
        seen.delete(k);
        return (memo[k] = v);
    };
    for (const b of P.books) d(b.id);
    return memo;
}
export const pwShort = (b: PathBook) => {
    const sur = (b.a || "").split(",")[0].trim().split(" ").pop();
    return b._dupe || !sur ? b.t : sur;
};
export function pwCondText(P: Pathway, c: PathCond) {
    const x = pwBook(P, c.k);
    if (!x) return "";
    return `${pwShort(x)} ${c.s === "start" ? "is underway" : c.s === "part" ? `${((x.parts || [])[c.p || 0] || {}).t || "part " + ((c.p || 0) + 1)} is done` : "is done"}`;
}
export function pwMark(P: Pathway) {
    const n: Record<string, number> = {};
    const sur = (b: PathBook) => (b.a || "").split(",")[0].trim().split(" ").pop() || "";
    for (const b of P.books) {
        const s = sur(b);
        n[s] = (n[s] || 0) + 1;
    }
    for (const b of P.books) {
        const s = sur(b);
        b._dupe = n[s] > 1 ? `${s} (${b.t.length > 28 ? b.t.slice(0, 26) + "…" : b.t})` : "";
    }
}
export const pwLabel = (b: PathBook) => {
    const sur = (b.a || "").split(",")[0].trim().split(" ").pop();
    return sur ? `${b.t} · ${sur}` : b.t;
};
export const pwUnlocks = (P: Pathway, b: PathBook) => P.books.filter(x => (x.after || []).some(c => c.k === b.id));
export const pwLanes = (P: Pathway) => [...new Set([...(P.threads || []), ...P.books.map(b => lcLane(P, b))])];
export const pwColor = (P: Pathway, th: string) => PW_COLORS[Math.max(0, pwLanes(P).indexOf(th)) % PW_COLORS.length];
export const PW_WORD: Record<string, string> = {
    done: "Done",
    reading: "Reading",
    ready: "Ready",
    waiting: "Waiting",
    ref: "Reference",
    skip: "Skipping",
};
export function pathProgress(P: Pathway): [done: number, all: number] {
    const core = P.books.filter(b => !b.ref && !b.opt);
    return [core.filter(b => pwState(b) === "done").length, core.length];
}

// ── Courses: what you're learning (a degree subject or a field of interest), each with fields you rate (optional) and its pathways ──
// (drawn by pages/: LearnPage.svelte and the components beside it, from what pages/look.ts works out)
export function subjLevel(S: Course) {
    const V = Object.values(S.fields || {})
        .map(f => f.lvl || 0)
        .filter(v => v > 0);
    return V.length ? V.reduce((a, v) => a + v, 0) / V.length : 0;
}
export const subjPaths = (S: Course) => PWS().filter(p => p.sub === S.id);
// ── a course's pathway: what you work through, inside the course's page ──
// topics across a pathway's modules: covered once ticked, or once their module is done
/** a pathway's topics: covered once ticked, or once their module is done */
export function lcTopics(P: Pathway): {
    T: Record<string, { done: boolean; mods: string[] }>;
    n: number;
    done: number;
} {
    const T: Record<string, { done: boolean; mods: string[] }> = {};
    for (const m of P.modules || [])
        for (const t of m.topics || []) {
            const e = T[t.t] || (T[t.t] = { done: false, mods: [] });
            e.done = e.done || !!t.done || m.status === "done";
            e.mods.push(m.name);
        }
    const L = Object.values(T);
    return { T, n: L.length, done: L.filter(e => e.done).length };
}
// a topic's area, from the course's curricula (when it lists a topic of that name), else "Topics"
export function lcArea(P: Pathway, t: string): string {
    const cu = (ACS().curricula || {})[P.sub];
    const x = cu && cu.topics.find(y => norm(y.name) === norm(t));
    return x ? x.area || "Topics" : "Topics";
}
function lcSubFromForm(sub: string, nn: string): string {
    if (sub !== "+") return sub;
    if (!nn) return "";
    const S: Course = { id: acId(), name: nn, g: nn.charAt(0).toUpperCase(), fields: {}, order: [], goal: 0 };
    LSUBS().push(S);
    return S.id;
}

// ── clicks and edits ──
/** moves the i-th of a list by d places; false when it can't go there */
export function lcMove<T>(L: T[], i: number, d: number): boolean {
    const j = i + d;
    if (i < 0 || j < 0 || j >= L.length) return false;
    [L[i], L[j]] = [L[j], L[i]];
    return true;
}
// the next reading of the same module, in order, or within the same group (for ↑↓)
function lcReadMove(P: Pathway, b: PathBook, d: number) {
    const same = P.books.filter(x => x.mod === b.mod && !x.ref),
        i = same.indexOf(b),
        o = same[i + d];
    if (!o) return;
    const a = P.books.indexOf(b),
        c = P.books.indexOf(o);
    [P.books[a], P.books[c]] = [P.books[c], P.books[a]];
}
export function lcAddReading(P: Pathway, mid: string, text: string): PathBook | null {
    const [t, a] = text.split(/\s*[,–—]\s*|\s+by\s+/i).map(s => s.trim());
    if (!t) return null;
    const id = "b" + acId(),
        b: PathBook = { id, t, a: a || "", th: "", mod: mid || "", st: "todo", note: "", after: [] };
    P.books.push(b);
    return b;
}
export function pwSetState(_P: Pathway, b: PathBook, s: string) {
    b.st = s;
    const lid = pwLib(b),
        L = lid ? items.get(lid) : undefined;
    if (lid && L) {
        if (s === "reading" && !["active", "redo"].includes(L.status))
            patch(lid, { status: "active", startedAt: L.startedAt || nowISO() }, "Start " + titleOf(L));
        if (s === "done" && L.status !== "done")
            patch(lid, { status: "done", finishedAt: L.finishedAt || nowISO() }, "Finish " + titleOf(L));
        if (s === "todo" && ["active", "redo", "done"].includes(L.status))
            patch(lid, { status: "want" }, "Back to planned");
    }
    markDirty();
}
export function learnClick(act: string, t: ActEl, k: string | undefined): boolean {
    const S = k ? lcSub(k) : undefined;
    switch (act) {
        case "learn-open":
            ui.learnSub = S ? k : null;
            ui.pwId = S ? coursePath(S).id : null;
            ui.learnDel = null;
            renderMain();
            scrollTo(0, 0);
            return true;
        case "learn-jump":
            ui.learnSub = k;
            ui.pwId = S ? coursePath(S).id : null;
            goTab("learn");
            return true;
        case "learn-lvl": {
            const f = t.dataset.f;
            if (S && f) {
                S.fields[f] = { ...(S.fields[f] || {}), lvl: Number(t.dataset.l), at: nowISO() };
                markDirty();
            }
            return true;
        }
        case "learn-field-del": {
            const f = t.dataset.f;
            if (S && f) {
                delete S.fields[f];
                S.order = (S.order || []).filter(x => x !== f);
                markDirty();
            }
            return true;
        }
        case "learn-hide":
        case "learn-unhide":
            if (S) {
                S.hidden = act === "learn-hide" || undefined;
                if (S.hidden) ui.learnSub = ui.pwId = null;
                markDirty();
                renderMain();
            }
            return true;
        case "learn-del":
            ui.learnDel = k;
            renderMain();
            return true;
        case "learn-del-no":
            ui.learnDel = null;
            renderMain();
            return true;
        case "learn-del-yes": {
            const C = ACS(),
                before = clone(C);
            C.subjects = C.subjects.filter(s => s.id !== k);
            C.paths = C.paths.filter(p => p.sub !== k);
            ui.learnSub = ui.pwId = null;
            ui.learnDel = null;
            markDirty();
            renderMain();
            toast("Deleted", {
                label: "Undo",
                fn: () => {
                    meta.courses = before;
                    markDirty();
                },
            });
            return true;
        }
        // a pathway opens as its course; no pathway: back to all courses
        case "learn-path": {
            ui.pwId = k || null;
            const P = pwCur();
            ui.learnSub = P ? P.sub : null;
            if (ui.tab !== "learn") goTab("learn");
            else renderMain();
            scrollTo(0, 0);
            return true;
        }
    }
    return false;
}
/** a reading's dialog: the pathway and the reading it's open on */
export interface PwBookModal extends Modal {
    pid: string;
    bid: string;
    edit?: boolean;
    confirm?: boolean;
}
export const isPwBookModal = (m: Modal | null): m is PwBookModal =>
    !!m && m.kind === "pwbook" && typeof m.pid === "string" && typeof m.bid === "string";
export function pathClick(act: string, _t: ActEl, k: string | undefined, _e?: Event): boolean {
    const P = pwCur(),
        m = isPwBookModal(ui.modal) ? ui.modal : null,
        mp = m && PWS().find(p => p.id === m.pid),
        mb = mp && m ? pwBook(mp, m.bid) : undefined;
    const done = () => {
        markDirty();
        return true;
    };
    switch (act) {
        case "pw-view":
            if (P) {
                P.view = k;
                return done();
            }
            return true;
        case "pw-add":
            if (P) {
                const b = lcAddReading(P, "", "New book");
                markDirty();
                if (b) openModal("pwbook", { pid: P.id, bid: b.id, edit: true });
            }
            return true;
        case "pw-book": {
            const pid = mp ? mp.id : P && P.id;
            if (m) {
                m.bid = k || "";
                m.confirm = false;
                m.edit = false;
                renderOverlay(true);
            } else openModal("pwbook", { pid, bid: k });
            return true;
        }
        case "pw-st":
            if (mp && mb && k) {
                pwSetState(mp, mb, k);
            }
            return true;
        case "pw-tolib":
            if (mp && mb) {
                const S = lcSub(mp.sub),
                    id = addItem(
                        {
                            medium: "book",
                            kind: "Academic",
                            title: mb.t,
                            creator: mb.a || "",
                            subject: S ? S.name : "",
                            year: Number(mb.year) || undefined,
                            status: mb.st === "done" ? "done" : mb.st === "reading" ? "active" : "want",
                        },
                        "Add " + mb.t
                    );
                mb.lib = id;
                markDirty();
                toast(`Added ${mb.t} to your library`);
                setTimeout(() => autoCovers(), 300);
            }
            return true;
        case "pw-cond-del":
            if (mb && mb.after) {
                mb.after.splice(Number(k), 1);
                markDirty();
            }
            return true;
        case "pw-part-del":
            if (mb && mb.parts) {
                mb.parts.splice(Number(k), 1);
                if (!mb.parts.length) delete mb.parts;
                markDirty();
            }
            return true;
        case "pw-rm-yes":
            if (mp && mb) {
                mp.books = mp.books.filter(x => x.id !== mb.id);
                for (const x of mp.books) x.after = (x.after || []).filter(c => c.k !== mb.id);
                markDirty();
                closeModal();
            }
            return true;
        case "pw-goal-del":
            if (P) {
                P.goals = (P.goals || []).filter(g => g.id !== k);
                return done();
            }
            return true;
    }
    return false;
}
/** what "From a university's page" (NewCourse.svelte) was given */
export interface LcTyped {
    sub: string; // a course's id, or "+" for a new one, named in subNew
    subNew: string;
    uni: string;
    programme: string;
    url: string;
    about: string;
}
/** what a pathway keeps from "From a university's page" */
const LC_TYPED = ["uni", "programme", "url", "about"] as const;
/** a course from a university's page, or more of one: what was typed fills in what its pathway doesn't have yet (or,
 *  where it already says something else, is kept beside it); then, if asked, fetch from the link. False when no course
 *  was picked or named */
export function lcCreate(form: LcTyped, fetch: boolean): boolean {
    const typed = {
        uni: form.uni.trim(),
        programme: form.programme.trim(),
        url: form.url.trim(),
        about: form.about.trim(),
    };
    const sub = lcSubFromForm(form.sub, form.subNew.trim()),
        S = sub ? lcSub(sub) : undefined;
    if (!S) {
        toast("Pick a course, or name a new one.");
        return false;
    }
    const N = coursePath(S);
    const clash = LC_TYPED.some(f => typed[f] && N[f] && N[f] !== typed[f]);
    if (clash) N.merged = [...(N.merged || []), { name: typed.programme || typed.uni, ...typed, at: nowISO() }];
    else for (const f of LC_TYPED) if (typed[f]) N[f] = typed[f];
    markDirty();
    closeModal();
    ui.pwId = N.id;
    ui.learnSub = sub;
    if (ui.tab !== "learn") goTab("learn");
    else renderMain();
    if (fetch) openModal("lcimport", { pid: N.id, url: typed.url || N.url, want: "auto", step: "link" });
    return true;
}
export function lcClick(act: string, t: ActEl, k: string | undefined): boolean {
    if (lcHubClick(act, t, k)) return true;
    const P = pwCur();
    switch (act) {
        case "lc-newpath":
            openModal("lcnew", { sub: k || ui.learnSub || "" });
            return true;
        case "lc-import":
            openModal("lcimport", {
                pid: k,
                mid: t.dataset.m || "",
                url: t.dataset.m ? "" : PWS().find(p => p.id === k)?.url || "",
                want: t.dataset.m ? "readings" : "auto",
                step: "link",
            });
            return true;
        case "lc-open":
            ui.lcOpen = ui.lcOpen === k ? null : k;
            renderMain();
            return true;
        case "lc-topic-del":
            if (P) {
                const md = lcMod(P, k);
                if (md && md.topics) {
                    md.topics.splice(Number(t.dataset.i), 1);
                    markDirty();
                }
            }
            return true;
        case "lc-stage-add":
            if (P) {
                P.stages = [...(P.stages || []), { id: acId(), name: `Year ${(P.stages || []).length + 1}` }];
                markDirty();
            }
            return true;
        case "lc-stage-del":
            if (P) {
                P.stages = (P.stages || []).filter(s => s.id !== k);
                for (const m of P.modules || []) if (m.stage === k) m.stage = "";
                markDirty();
            }
            return true;
        case "lc-stage-up":
        case "lc-stage-down":
            if (
                P &&
                P.stages &&
                lcMove(
                    P.stages,
                    P.stages.findIndex(s => s.id === k),
                    act.endsWith("up") ? -1 : 1
                )
            ) {
                markDirty();
            }
            return true;
        case "lc-mod-add":
            if (P) {
                const nm: PathModule = {
                    id: acId(),
                    stage: k || "",
                    code: "",
                    name: "New module",
                    credits: "",
                    core: true,
                    status: "planned",
                    grade: "",
                    term: "",
                    topics: [],
                };
                (P.modules ||= []).push(nm);
                ui.lcOpen = nm.id;
                markDirty();
            }
            return true;
        case "lc-mod-del":
            if (P) {
                const gone = new Set(P.books.filter(b => b.mod === k).map(b => b.id));
                P.modules = (P.modules || []).filter(m => m.id !== k);
                P.books = P.books.filter(b => !gone.has(b.id));
                for (const b of P.books) b.after = (b.after || []).filter(c => !gone.has(c.k));
                markDirty();
            }
            return true;
        case "lc-mod-up":
        case "lc-mod-down":
            if (P && P.modules) {
                const M = P.modules,
                    m = lcMod(P, k),
                    same = M.filter(x => m && x.stage === m.stage),
                    o = m && same[same.indexOf(m) + (act.endsWith("up") ? -1 : 1)];
                if (m && o) {
                    const a = M.indexOf(m),
                        c = M.indexOf(o);
                    [M[a], M[c]] = [M[c], M[a]];
                    markDirty();
                }
            }
            return true;
        case "lc-read-up":
        case "lc-read-down":
            if (P) {
                const b = pwBook(P, k);
                if (b) {
                    lcReadMove(P, b, act.endsWith("up") ? -1 : 1);
                    markDirty();
                }
            }
            return true;
    }
    return false;
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initLearning() {
    // the overview's blocks (drawn by pages/PathsMini.svelte and LearnMini.svelte)
    BLOCKS.paths = { name: "Reading next", d: "What you're reading in a course, and what's ready next", w: 8 };
    BLOCKS.learn = { name: "Courses", d: "Your courses, and your level in each", w: 8 };
}
