// src/features/learning-centre/learning-data.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre's data: checking what comes in, turning older versions into today's, and two copies meeting
//
//  Today's shape is { v: 3, courses, def, gone }: a course holds its topics, its books (each with a topic and a level),
//  the programmes it was built from and, for a degree, its modules. Before, a course and its pathway were stored apart
//  (v2: subjects, paths and curricula by course); older still was the Academic mode's programmes and pathways. Both
//  come in through lcConvertOld(), and nothing is dropped: what this version doesn't show is kept on the course (kept).
//
//  Deleting leaves a note in gone (the id, and when), so when this device and another one meet (a sync) or an export
//  is brought in, what was deleted here isn't brought back from the other copy.
// ─────────────────────────────────────────────────────────────────

import { fieldsOf, isRecord, items, listOf, norm, nowISO, numOf, ownOf, recordsOf, strsOf, textOf } from "../core/core";
import type { Course, Courses, CurModule, CurProgramme, LcTopic, PathBook, PathCond, PathModule } from "../core/model";
import { catAreaFor, catBookIn, catSubjectsFor, catTopicFor, looseTopic } from "./catalogue/catalogue";
import type { CatSubject } from "./catalogue/types";

/** the levels: name, and what it means (a book's level is 1 to 4; you can be at 0 to 5) */
export const LEVELS: [name: string, about: string][] = [
    ["Not started", "–"],
    ["Foundations", "School and first-year level"],
    ["Undergraduate", "Finals of a strong bachelor's"],
    ["Master's", "A taught master's"],
    ["PhD", "Qualifying exams"],
    ["Research", "Original work"],
];
export const acId = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const lcEmpty = (): Courses => ({ v: 3, courses: [], gone: {} });

// ── a year, part or term's name as a level: Year 1 or Part IA is undergraduate, Part III or an MSc a master's ──
/** the level a stage's name says, if it says one (1 Foundations … 4 PhD) */
export function stageLevel(name: string): number | undefined {
    const s = String(name || "");
    if (/\b(ph\.?\s?d|doctora|dphil|level\s*8)\b/i.test(s)) return 4;
    if (
        /\bpart\s*(iii|3)\b|\bm\.?sc\b|\bmast\b|\bmaster|\bmmath|\bmphil|\bmres\b|\bgraduate\b|\bpostgrad|\blevel\s*7\b|\byear\s*(4|5|four|five)\b|\b(fourth|fifth)[ -]year\b/i.test(
            s
        )
    )
        return 3;
    if (/\bfoundation|\bprelim|\byear\s*0\b|\ba[ -]?level|\bschool\b|\baccess\b/i.test(s)) return 1;
    if (
        /\bpart\s*(i|ii|ia|ib|1|2|1a|1b)\b|\byear\s*(1|2|3|one|two|three)\b|\b(first|second|third|final)[ -]year\b|\blevel\s*[456]\b|\bbachelor|\bb\.?sc\b|\bb\.?a\b|\bundergrad|\bfreshman|\bsophomore|\bjunior\b|\bsenior\b/i.test(
            s
        )
    )
        return 2;
    return undefined;
}
/** a level from outside: one of LEVELS */
const levelOf = (x: unknown) => Math.max(0, Math.min(LEVELS.length - 1, Math.round(numOf(x) || 0)));
/** a book's level from outside: 1 to 4, or none */
const bookLevel = (x: unknown) => {
    const n = numOf(x);
    return n == null ? undefined : Math.max(1, Math.min(4, Math.round(n)));
};

// ── checking what comes in: what isn't the shape it keeps is left out ──
const idOf = (x: Record<string, unknown>) => (typeof x.id === "string" && x.id ? x.id : "");
function condsOf(x: unknown): PathCond[] {
    return recordsOf(x).flatMap((c): PathCond[] =>
        typeof c.k === "string"
            ? [{ k: c.k, s: textOf(c.s) || "done", ...(numOf(c.p) != null ? { p: numOf(c.p) } : {}) }]
            : []
    );
}
/** a course's books: each with an id and a title, its conditions and parts as they should be */
export function booksOf(x: unknown): PathBook[] {
    return recordsOf(x).flatMap(b => {
        const id = idOf(b);
        if (!id) return [];
        const year = typeof b.year === "number" ? b.year : textOf(b.year);
        const out: PathBook = {
            ...b,
            id,
            t: textOf(b.t),
            a: textOf(b.a),
            year,
            st: textOf(b.st) || "todo",
            lib: textOf(b.lib) || undefined,
            after: condsOf(b.after),
            topic: textOf(b.topic) || undefined,
            tops: Array.isArray(b.tops) ? strsOf(b.tops) : undefined,
            lvl: bookLevel(b.lvl),
            ord: numOf(b.ord),
            mod: textOf(b.mod) || undefined,
            parts: Array.isArray(b.parts)
                ? recordsOf(b.parts).map(p => ({ t: textOf(p.t), done: !!p.done }))
                : undefined,
        };
        for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
        return [out];
    });
}
/** a degree's modules: each with an id and a name, its topics and the modules it waits on as they should be */
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
const pairsOf = (x: unknown): [string, string][] =>
    listOf(x).flatMap((b): [string, string][] =>
        Array.isArray(b) && typeof b[0] === "string" && b[0] ? [[b[0], textOf(b[1])]] : []
    );
/** a programme's modules: names, the topics each teaches, their reading lists */
function curModulesOf(x: unknown): CurModule[] {
    return recordsOf(x).flatMap((m): CurModule[] => {
        const name = textOf(m.name);
        if (!name) return [];
        const out: CurModule = {
            ...m,
            name,
            code: textOf(m.code) || undefined,
            core: m.core === undefined ? undefined : !!m.core,
            lvl: bookLevel(m.lvl),
            topics: strsOf(m.topics),
            books: pairsOf(m.books),
            list: textOf(m.list) || undefined,
        };
        for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
        return [out];
    });
}
function progsOf(x: unknown): CurProgramme[] {
    return recordsOf(x).flatMap((p): CurProgramme[] => {
        const id = idOf(p);
        if (!id) return [];
        const got = fieldsOf(p.got);
        return [
            {
                ...p,
                id,
                uni: textOf(p.uni),
                name: textOf(p.name),
                url: textOf(p.url) || undefined,
                src: textOf(p.src) || undefined,
                lvl: bookLevel(p.lvl),
                modules: curModulesOf(p.modules),
                got: textOf(got.at)
                    ? { at: textOf(got.at), n: numOf(got.n) || 0, ...(textOf(got.err) ? { err: textOf(got.err) } : {}) }
                    : undefined,
            },
        ];
    });
}
const topicsOf = (x: unknown): LcTopic[] =>
    recordsOf(x).flatMap(t =>
        idOf(t) && textOf(t.name) ? [{ id: idOf(t), name: textOf(t.name), area: textOf(t.area) || undefined }] : []
    );
/** one course, checked */
function courseOf(s: Record<string, unknown>): Course | null {
    const id = idOf(s);
    if (!id) return null;
    const fields: Course["fields"] = {};
    for (const [f, v] of Object.entries(fieldsOf(s.fields))) if (isRecord(v)) fields[f] = { ...v, lvl: levelOf(v.lvl) };
    const C: Course = {
        ...s,
        id,
        name: textOf(s.name) || "Untitled",
        g: textOf(s.g) || undefined,
        kind: textOf(s.kind) || undefined,
        hidden: s.hidden ? true : undefined,
        now: s.now == null ? undefined : levelOf(s.now),
        goal: levelOf(s.goal),
        fields,
        order: Array.isArray(s.order) ? strsOf(s.order) : undefined,
        scope: textOf(s.scope) || undefined,
        topics: topicsOf(s.topics),
        books: booksOf(s.books),
        progs: progsOf(s.progs),
        degree: s.degree ? true : undefined,
        uni: textOf(s.uni) || undefined,
        programme: textOf(s.programme) || undefined,
        url: textOf(s.url) || undefined,
        about: textOf(s.about) || undefined,
        stages: Array.isArray(s.stages)
            ? recordsOf(s.stages).flatMap(st =>
                  idOf(st) ? [{ id: idOf(st), name: textOf(st.name), ...(st.spec ? { spec: true } : {}) }] : []
              )
            : undefined,
        modules: Array.isArray(s.modules) ? modulesOf(s.modules) : undefined,
        req: isRecord(s.req) ? Object.fromEntries(Object.entries(s.req).map(([k, v]) => [k, numOf(v)])) : undefined,
        sources: Array.isArray(s.sources)
            ? recordsOf(s.sources).flatMap(x =>
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
              )
            : undefined,
        opps: Array.isArray(s.opps)
            ? recordsOf(s.opps).flatMap(x =>
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
              )
            : undefined,
        kept: isRecord(s.kept) ? s.kept : undefined,
    };
    for (const k of Object.keys(C)) if (C[k] === undefined) delete C[k];
    return C;
}
/** today's Learning Centre, checked */
function lcCheck(o: Record<string, unknown>): Courses {
    const seen = new Set<string>(),
        courses = recordsOf(o.courses).flatMap(s => {
            const C = courseOf(s);
            if (!C || seen.has(C.id)) return [];
            seen.add(C.id);
            return [C];
        });
    const gone: Record<string, string> = {};
    for (const [k, v] of Object.entries(fieldsOf(o.gone))) if (typeof v === "string") gone[k] = v;
    return { v: 3, courses, ...(textOf(o.def) ? { def: textOf(o.def) } : {}), gone };
}

// ── from the second version (v2): a course and its pathway stored apart, Curricula by course ──
/** the second version, checked as it was checked then (its fields as they were) */
interface V2 {
    subjects: Record<string, unknown>[];
    paths: Record<string, unknown>[];
    curricula: Record<string, Record<string, unknown>>;
}
const PW_ST_ORDER = ["todo", "skip", "reading", "done"];
/** the further along of two states (a book read on one device and started on another is read) */
export const furtherOf = (a: string | undefined, b: string | undefined) =>
    PW_ST_ORDER.indexOf(b || "todo") > PW_ST_ORDER.indexOf(a || "todo") ? b : a;
/** a v2 Learning Centre in today's shape: each course takes its pathway (two or more are joined into one), each
 *  pathway's stages become its books' levels where their names say one, and its Curricula become its programmes */
function fromV2(o: V2): Courses {
    const out = lcEmpty();
    const subs = o.subjects.filter(s => idOf(s));
    // a pathway without a course becomes a course of its own
    for (const p of o.paths)
        if (!subs.some(s => s.id === p.sub)) {
            const name = textOf(p.name) || textOf(p.programme) || "Untitled";
            const id = textOf(p.sub) || "s-" + (idOf(p) || acId());
            if (!subs.some(s => s.id === id)) subs.push({ id, name, g: name.charAt(0).toUpperCase() });
            p.sub = id;
        }
    for (const s of subs) {
        const C = courseOf({ ...s, topics: [], books: [], progs: [] });
        if (!C) continue;
        const paths = o.paths.filter(p => p.sub === C.id && idOf(p)),
            cur = fieldsOf(o.curricula[C.id]);
        const topicAt = new Map<string, string>(), // a topic's name → its id
            topic = (name: string, area?: string) => {
                const k = norm(name);
                const had = topicAt.get(k);
                if (had) return had;
                const id = "t" + acId();
                C.topics.push({ id, name, area: area || areaFor(C, name, cur) });
                topicAt.set(k, id);
                return id;
            };
        // Curricula's topics are the course's topics, by the same ids
        for (const t of topicsOf(cur.topics)) {
            C.topics.push({ ...t, area: t.area || "" });
            topicAt.set(norm(t.name), t.id);
        }
        const pathKept: Record<string, unknown>[] = [];
        paths.forEach((P, i) => {
            const stages = recordsOf(P.stages).flatMap(st =>
                    idOf(st) ? [{ id: idOf(st), name: textOf(st.name), ...(st.spec ? { spec: true } : {}) }] : []
                ),
                mods = modulesOf(P.modules);
            // the degree's stages and modules: "Year 1" twice is one Year 1
            const stageOf: Record<string, string> = {};
            for (const st of stages) {
                const same = (C.stages || []).find(x => norm(x.name) === norm(st.name));
                if (same) stageOf[st.id] = same.id;
                else C.stages = [...(C.stages || []), st];
            }
            if (stages.length || mods.length)
                C.modules = [...(C.modules || []), ...mods.map(m => ({ ...m, stage: stageOf[m.stage] || m.stage }))];
            for (const f of ["uni", "programme", "url", "about"] as const)
                if (!C[f] && textOf(P[f])) C[f] = textOf(P[f]);
            if (!C.req && isRecord(P.req))
                C.req = Object.fromEntries(Object.entries(P.req).map(([k, v]) => [k, numOf(v)]));
            const stageName = (id: string) => (C.stages || []).find(x => x.id === (stageOf[id] || id))?.name || "";
            booksOf(P.books).forEach((b, j) => {
                const had = C.books.find(x => x.id === b.id);
                if (had) {
                    had.st = furtherOf(had.st, b.st);
                    return;
                }
                const m = mods.find(x => x.id === b.mod),
                    where = textOf(b.where),
                    th = textOf(b.th);
                const name = where || (m ? topicOfModule(m.name) : "") || th || "General";
                const lvl = m ? stageLevel(stageName(m.stage)) : undefined;
                C.books.push({ ...b, topic: topic(name), ...(lvl ? { lvl } : {}), ord: i * 1000 + j });
            });
            // what a pathway had that a course doesn't show: kept
            const {
                books: _b,
                stages: _s,
                modules: _m,
                uni: _u,
                programme: _p,
                url: _l,
                about: _a,
                req: _r,
                sub: _sub,
                ...rest
            } = P;
            pathKept.push(rest);
        });
        // a degree is one with marks, or with what it takes to graduate written down
        if (
            (C.modules || []).some(m => m.grade !== "" && m.grade != null) ||
            (C.req && Object.values(C.req).some(Boolean))
        )
            C.degree = true;
        // Curricula's programmes: their modules with the books they set, by title and author
        const bk = fieldsOf(cur.books),
            pair = (k: unknown): [string, string] | null => {
                if (Array.isArray(k)) return typeof k[1] === "string" ? [k[1], textOf(k[2])] : null;
                const v = typeof k === "string" ? bk[k] : null;
                return Array.isArray(v) && typeof v[0] === "string" ? [v[0], textOf(v[1])] : null;
            };
        C.progs = recordsOf(cur.progs).flatMap((p): CurProgramme[] =>
            idOf(p)
                ? [
                      {
                          ...p,
                          id: idOf(p),
                          uni: textOf(p.uni),
                          name: textOf(p.name),
                          url: textOf(p.url) || undefined,
                          modules: recordsOf(p.modules).map(m => ({
                              ...m,
                              name: textOf(m.name),
                              core: !!m.core,
                              topics: strsOf(m.topics),
                              books: listOf(m.books).flatMap(k => {
                                  const x = pair(k);
                                  return x ? [x] : [];
                              }),
                          })),
                      },
                  ]
                : []
        );
        const keep: Record<string, unknown> = {};
        if (pathKept.length) keep.paths = pathKept;
        const { topics: _t, progs: _pr, ...curRest } = cur;
        if (Object.keys(curRest).length) keep.curricula = curRest;
        if (Object.keys(keep).length) C.kept = { ...(C.kept || {}), ...keep };
        out.courses.push(C);
    }
    return out;
}
/** a module's name as a topic: without its code, or the number it has in a series ("Aerodynamics 2", "Analysis I") */
export const topicOfModule = (name: string) =>
    name
        .replace(/^[A-Z]{2,6}[ -]?\d{2,6}[A-Z]?\s*[:–-]?\s*/, "")
        .replace(/\s+(\d{1,2}|[IVX]{1,4}|I[AB])$/, "")
        .trim() || name;
/** a topic's area: the area Curricula gave a topic of that name, else the course's field the name starts with or
 *  contains ("Analysis I" in Analysis); else none yet, and lcTidyTopics() finds it one */
function areaFor(C: Course, name: string, cur: Record<string, unknown>): string {
    const t = recordsOf(cur.topics).find(x => norm(x.name) === norm(name));
    if (t && textOf(t.area)) return textOf(t.area);
    const F = C.order || Object.keys(C.fields || {}),
        n = norm(name);
    return F.find(f => n.includes(norm(f))) || "";
}
/** the second version's three lists, checked loosely (the conversion checks each piece) */
const v2Of = (o: Record<string, unknown>): V2 => ({
    subjects: recordsOf(o.subjects),
    paths: recordsOf(o.paths).map(p => ({ ...p })),
    curricula: Object.fromEntries(
        Object.entries(fieldsOf(o.curricula)).filter((e): e is [string, Record<string, unknown>] => isRecord(e[1]))
    ),
});

// ── from the old Academic (before it was the Learning Centre): its programmes, pathways and levels ──
// Subjects keep their old ids ("s-maths"), so a personal content file and your own converted data meet without duplicates.
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
function fromOldest(o: Record<string, unknown>): V2 {
    const subs = new Map<string, Record<string, unknown>>(),
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
        const fields: Record<string, { lvl: number }> = {},
            order: string[] = [];
        for (const [f, v] of F) {
            fields[f] = { lvl: levelOf(fieldsOf(v).lvl) };
            order.push(f);
        }
        Object.assign(S, { fields, order, goal });
    }
    const paths: Record<string, unknown>[] = [];
    for (const p of recordsOf(o.paths))
        paths.push({
            ...p,
            id: textOf(p.id) || acId(),
            name: textOf(p.name),
            sub: subOf(p),
            uni: textOf(p.uni),
            books: booksOf(p.books).map(b => ({ ...b, opt: b.opt || !!b.branch || undefined })),
        });
    for (const p of recordsOf(o.programmes)) {
        const stages: { id: string; name: string }[] = [],
            modules: Record<string, unknown>[] = [],
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
                            st: "todo",
                            after: [],
                            lib: iid,
                        });
                }
            }
        });
        paths.push({
            id: textOf(p.id) || acId(),
            name: textOf(p.name),
            sub: subOf(p),
            uni: textOf(p.uni),
            programme: textOf(p.name),
            about: textOf(p.basis),
            stages,
            modules,
            books,
            at: nowISO(),
        });
    }
    // your Curricula picks, books you added and programmes you pasted
    const curricula: Record<string, Record<string, unknown>> = {};
    for (const [k, c] of Object.entries(fieldsOf(o.cur))) {
        const x = fieldsOf(c);
        curricula["s-" + k] = {
            progs: recordsOf(x.mine).map(p => ({ ...p, kind: "mine" })),
            chosen: x.chosen,
            extra: x.extra,
            hide: x.hide,
        };
    }
    return { subjects: [...subs.values()], paths, curricula };
}

/** the Learning Centre from anywhere (this browser, an import, the cloud copy, an older version) in today's form:
 *  today's is checked, an older one converted, and anything else is an empty one */
export function lcConvertOld(o: unknown): Courses {
    if (!isRecord(o)) return lcEmpty();
    if (o.v === 3) return lcCheck(o);
    const out = fromV2(o.v === 2 ? v2Of(o) : fromOldest(o));
    for (const C of out.courses) lcTidyTopics(C);
    return out;
}

// ── one row for each topic: a course's topics matched to the catalogue's ──
/** a course's topics tidied against the catalogue, after converting, building from the catalogue or importing:
 *  - a topic the catalogue has (by name, a name it's known by, or the same words) takes the catalogue's name and area;
 *  - a book the catalogue knows goes in the catalogue's topics for it (made in the course if need be);
 *  - two topics of the same name are one, and a topic that's left with none of the books it had is gone;
 *  - a topic in no area, or in a stand-in one ("Topics"), goes in the area it fits best; never in "Topics" or "General".
 *  Topics merged away are noted in gone, so another copy doesn't bring them back. */
export function lcTidyTopics(C: Course, gone?: Record<string, string>, more: CatSubject[] = []): void {
    const subs = [...catSubjectsFor(C), ...more.filter(s => !catSubjectsFor(C).includes(s))];
    const had = new Set(C.books.flatMap(b => [b.topic, ...(b.tops || [])]).filter(Boolean));
    // the catalogue's names and areas
    if (subs.length)
        for (const t of C.topics) {
            const m = catTopicFor(t.name, subs);
            if (m) {
                t.name = m.t.name;
                t.area = m.t.area;
            }
        }
    // a book the catalogue knows, in its topics
    const topicNamed = (s: CatSubject, name: string, area: string) => {
        const x = C.topics.find(t => norm(t.name) === norm(name));
        if (x) return x.id;
        const id = `t-${s.id}-${acId()}`;
        C.topics.push({ id, name, area });
        return id;
    };
    if (subs.length)
        for (const b of C.books) {
            const k = catBookIn(subs, b.t, b.a);
            if (!k?.topics.length) continue;
            const ids = k.topics.map(t => topicNamed(k.s, t.name, t.area));
            const keep = b.topic && ids.includes(b.topic) ? b.topic : ids[0];
            b.topic = keep;
            const tops = ids.filter(id => id !== keep);
            if (tops.length) b.tops = tops;
            else delete b.tops;
        }
    // the same name twice is one topic: the first
    const into: Record<string, string> = {};
    const first = new Map<string, string>();
    for (const t of C.topics) {
        const k = norm(t.name);
        const f = first.get(k);
        if (f) into[t.id] = f;
        else first.set(k, t.id);
    }
    const to = (id: string | undefined) => (id && into[id]) || id;
    for (const b of C.books) {
        b.topic = to(b.topic);
        const tops = [...new Set((b.tops || []).map(id => to(id) || ""))].filter(id => id && id !== b.topic);
        if (tops.length) b.tops = tops;
        else delete b.tops;
    }
    // what's in use now; a topic that had books and has none is gone
    const used = new Set(C.books.flatMap(b => [b.topic, ...(b.tops || [])]).filter(Boolean));
    const out = new Set(Object.keys(into));
    for (const t of C.topics) if (had.has(t.id) && !used.has(t.id)) out.add(t.id);
    for (const P of C.progs)
        for (const m of P.modules)
            m.topics = [...new Set((m.topics || []).map(id => to(id) || "").filter(id => id && !out.has(id)))];
    C.topics = C.topics.filter(t => !out.has(t.id));
    if (gone) for (const id of out) gone[id] = nowISO();
    // areas: never a stand-in
    for (const t of C.topics) if (!realArea(t.area)) t.area = lcAreaFor(C, t.name, subs);
}
const realArea = (a: string | undefined) => !!a && !looseTopic(a);
/** the area a topic the catalogue doesn't have goes in: the catalogue's area it shares most words with, else the
 *  course's own area its name holds ("Analysis and Topology" in Analysis), else the area most of its topics are in,
 *  else the course's name */
export function lcAreaFor(C: Course, name: string, subs: CatSubject[] = catSubjectsFor(C)): string {
    const F = C.order || Object.keys(C.fields || {}),
        n = norm(name);
    const counts = new Map<string, number>();
    for (const x of C.topics) if (x.area && realArea(x.area)) counts.set(x.area, (counts.get(x.area) || 0) + 1);
    const most = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return catAreaFor(name, subs) || F.find(f => n.includes(norm(f))) || most || F[0] || C.name;
}

// ── two copies meeting (a sync, an import that merges): additions on both sides kept, deletions on either kept ──
const byId = <T extends { id: string }>(mine: T[], theirs: T[], gone: Record<string, string>) => [
    ...mine.filter(x => !gone[x.id]),
    ...theirs.filter(x => !gone[x.id] && !mine.some(y => y.id === x.id)),
];
/** this copy and another meet: courses, the books in them and their programmes are joined by id, and anything either
 *  side deleted stays deleted. Where both have the same course, this copy's settings win, and a book takes the further
 *  along of its two states */
export function lcMerge(mine: Courses, theirs: Courses): Courses {
    const gone: Record<string, string> = { ...(theirs.gone || {}) };
    for (const [k, v] of Object.entries(mine.gone || {})) if (!gone[k] || gone[k] < v) gone[k] = v;
    const courses = byId(mine.courses, theirs.courses, gone).map(C => {
        const O = theirs.courses.find(x => x.id === C.id);
        if (!O || O === C) return C;
        const books = byId(C.books, O.books, gone).map(b => {
            const o = O.books.find(x => x.id === b.id);
            return o ? { ...b, st: furtherOf(b.st, o.st) } : b;
        });
        return {
            ...C,
            topics: byId(C.topics, O.topics, gone),
            books: books.map(b => ({ ...b, after: (b.after || []).filter(c => !gone[c.k]) })),
            progs: byId(C.progs, O.progs, gone),
        };
    });
    return {
        v: 3,
        courses: courses.map(C => ({
            ...C,
            books: C.books.filter(b => !gone[b.id]),
            progs: C.progs.filter(p => !gone[p.id]),
        })),
        ...(mine.def || theirs.def ? { def: mine.def || theirs.def } : {}),
        gone,
    };
}
/** note that these were deleted, now */
export function lcForget(C: Courses, ids: string[]) {
    const at = nowISO(),
        g = (C.gone ||= {});
    for (const id of ids) g[id] = at;
}
// Opportunities are personal: they never go into a pack of chosen parts (packs.ts), only your own whole backup
// ("Download everything", the library folder: export-zip.ts) and your synced library
export const lcStripPersonal = (C: Courses): Courses => ({
    ...C,
    courses: (C.courses || []).map(s => {
        const { opps: _opps, ...rest } = s;
        return rest;
    }),
});
