// src/features/learning-centre/pages/look.ts
// ─────────────────────────────────────────────────────────────────
//  What the Learning Centre's pages show, worked out in plain TypeScript: a course on the hub, what to read next, the
//  map (topics down, levels across), what the course was built from, the degree, and Curricula. The components in
//  this folder only draw it.
// ─────────────────────────────────────────────────────────────────

import { fmtDate, idTitle, items, norm, plural, safeUrl } from "../../core/core";
import type { Course, CurProgramme, Item, PathBook, PathModule } from "../../core/model";
import {
    ACS,
    BOOK_LEVELS,
    courseProgress,
    LCS,
    LEVELS,
    lvlOf,
    pwBucket,
    pwCondText,
    pwLib,
    pwMark,
    pwMet,
    pwShort,
    pwState,
    pwUnlocks,
    PW_WORD,
    sameBook,
    subjLevel,
    topicName,
} from "../learning";
import { lcNext } from "../learning-order";
import { lcFetching, readable } from "../learning-build";

// two kinds of course, always shown apart on the hub: what you study and what you're into
export const LC_KINDS: [string, string][] = [
    ["sci", "Academic"],
    ["arts", "Interests"],
];
export const LC_STATUS: [string, string][] = [
    ["planned", "Planned"],
    ["taking", "Taking"],
    ["done", "Done"],
    ["dropped", "Dropped"],
];
/** what's unfolded on a course's page (its ⋯, Built from, Degree), by "what:course": kept while you're on it, so a
 *  redraw (a fetch arriving, a change saved) doesn't fold it back */
export const lcFolds = new Set<string>();
/** a level's name, short ("Master's") */
export const lvlName = (n: number) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, n))][0];
/** the course switcher's choices */
export const switchLook = (cur: string | undefined) => {
    const def = ACS().def;
    return {
        options: LCS()
            .filter(s => !s.hidden || s.id === cur)
            .map(s => ({ id: s.id, name: `${s.g || "∫"} ${s.name}${s.id === def ? " (default)" : ""}` })),
        isDefault: !!cur && cur === def,
    };
};

// ── a course on the hub ──
export function courseCardLook(S: Course) {
    const [d, n] = courseProgress(S),
        rd = S.books.filter(b => pwState(b) === "reading"),
        guess = Math.round(subjLevel(S));
    // The level you set wins; without one, the books you've finished give a rough level, said as such.
    const lv = S.now ? lvlName(S.now) : guess ? "Around " + lvlName(guess) : "Not started";
    return {
        id: S.id,
        name: `${S.g || "∫"} ${S.name}`,
        level: [lv, S.goal ? "aiming for " + lvlName(S.goal).toLowerCase() : ""].filter(Boolean).join(" → "),
        def: ACS().def === S.id,
        width: n ? (d / n) * 100 : 0,
        line:
            (n ? `${d}/${n} books` : "no books yet") +
            (S.topics.length ? ` · ${plural(S.topics.length, "topic")}` : "") +
            (S.degree ? " · degree" : "") +
            (rd.length
                ? " · reading " +
                  rd
                      .map(b => b.t)
                      .slice(0, 2)
                      .join(", ")
                : ""),
    };
}

// ── a book's card ──
/** other courses holding the same book: by title, then author */
function otherCourses(C: Course) {
    const by = new Map<string, { name: string; a: string }[]>();
    for (const O of LCS())
        if (O.id !== C.id)
            for (const b of O.books) {
                const k = idTitle(String(b.t).split(":")[0]);
                by.set(k, [...(by.get(k) || []), { name: O.name, a: b.a || "" }]);
            }
    return (b: PathBook) => [
        ...new Set(
            (by.get(idTitle(String(b.t).split(":")[0])) || [])
                .filter(x => sameBook(b.t, b.a, b.t, x.a))
                .map(x => x.name)
        ),
    ];
}
/** a book's card on the map or in Next: its title, author, status, what it needs and unlocks, and where else it is */
export function bookLook(C: Course, b: PathBook, others: (b: PathBook) => string[] = otherCourses(C)) {
    const bk = pwBucket(C, b),
        lid = pwLib(b),
        L = lid ? items.get(lid) : undefined,
        wait = (b.after || []).filter(c => !pwMet(C, c)),
        unl = pwUnlocks(C, b),
        tops = [b.topic, ...(b.tops || [])].filter(Boolean),
        also = others(b);
    const cover: Item | null = L && L.cover && lid ? { ...L, id: lid } : null;
    const needs = (b.after || []).map(c => pwCondText(C, c)).filter(Boolean),
        unlocks = unl.map(x => pwShort(x));
    return {
        id: b.id,
        bk,
        st: pwState(b),
        cover,
        t: b.t,
        a: b.a || "",
        who: pwShort(b) === b.t ? b.a || "" : pwShort(b),
        word: PW_WORD[bk] || "",
        lvl: lvlName(lvlOf(b)),
        topic: topicName(C, b),
        star: !!b.top,
        opt: !!b.opt,
        multi: tops.length > 1 ? tops.length : 0,
        also,
        wait: bk === "waiting" && wait.length ? "After " + wait.map(c => pwCondText(C, c)).join(" and ") : "",
        tip: [
            `${b.t}${b.a ? " · " + b.a : ""}`,
            `${lvlName(lvlOf(b))} · ${PW_WORD[bk] || ""}`,
            needs.length ? "Needs: " + needs.join("; ") : "Needs nothing first",
            unlocks.length ? "Unlocks: " + unlocks.join(", ") : "",
            tops.length > 1 ? `Serves ${tops.length} topics` : "",
            also.length ? "Also in " + also.join(", ") : "",
        ]
            .filter(Boolean)
            .join("\n"),
    };
}
export type BookLook = ReturnType<typeof bookLook>;

// ── Next: what to read now, in order ──
export function nextLook(C: Course) {
    pwMark(C);
    const N = lcNext(C),
        others = otherCourses(C);
    const row = (r: { b: PathBook; unlocks: PathBook[] }) => ({
        ...bookLook(C, r.b, others),
        opens: r.unlocks.map(x => pwShort(x)),
    });
    return {
        reading: N.reading.map(row),
        ready: N.ready.map(row),
        more: N.more,
        left: N.left,
        empty: !C.books.length,
    };
}

// ── the map: topics down (by area), levels across ──
export function mapLook(C: Course) {
    pwMark(C);
    const others = otherCourses(C),
        main = C.books.filter(b => !b.ref);
    const known = new Set(C.topics.map(t => t.id)),
        rows = [
            ...C.topics.map(t => ({ id: t.id, name: t.name, area: t.area || "Topics" })),
            ...(main.some(b => !b.topic || !known.has(b.topic)) ? [{ id: "", name: "Other", area: "Other" }] : []),
        ];
    const inRow = (id: string, b: PathBook) =>
        id ? b.topic === id || (b.tops || []).includes(id) : !b.topic || !known.has(b.topic);
    const counted = (L: PathBook[]) => {
        const n = L.filter(b => pwState(b) !== "skip");
        return { d: n.filter(b => pwState(b) === "done").length, n: n.length };
    };
    const areas: { a: string; rows: ReturnType<typeof mkRow>[] }[] = [];
    function mkRow(r: { id: string; name: string }) {
        const L = main.filter(b => inRow(r.id, b));
        return {
            id: r.id || "other",
            name: r.name,
            ...counted(L),
            cells: BOOK_LEVELS.map(l => L.filter(b => lvlOf(b) === l).map(b => bookLook(C, b, others))),
        };
    }
    for (const r of rows) {
        const row = mkRow(r);
        if (!row.n && !row.cells.some(x => x.length)) continue;
        const g = areas.find(x => x.a === r.area);
        if (g) g.rows.push(row);
        else areas.push({ a: r.area, rows: [row] });
    }
    return {
        areas,
        cols: BOOK_LEVELS.map(l => ({ l, name: lvlName(l), ...counted(main.filter(b => lvlOf(b) === l)) })),
        ...counted(main),
    };
}

// ── what it was built from ──
/** how a programme's fetch stands, in words */
function fetchWord(p: CurProgramme): { cls: string; t: string } {
    const now = lcFetching[p.id];
    if (now === "…") return { cls: "busy", t: "Fetching its pages…" };
    if (p.got)
        return p.got.err
            ? { cls: "fail", t: `Couldn't fetch everything (${p.got.err}) · kept what it has` }
            : {
                  cls: "ok",
                  t: `Fetched ${fmtDate(p.got.at)}${p.got.n ? ` · ${plural(p.got.n, "new item")}` : " · nothing new"}`,
              };
    return readable(p.url) || p.modules.some(m => readable(m.list))
        ? { cls: "", t: "From the catalogue · not fetched yet" }
        : { cls: "", t: "From the catalogue" };
}
export function builtLook(C: Course) {
    return C.progs.map(p => ({
        id: p.id,
        uni: p.uni,
        name: p.name,
        href: safeUrl(p.url),
        src: safeUrl(p.src) && p.src !== p.url ? safeUrl(p.src) : "",
        mods: p.modules.length,
        lists: p.modules.filter(m => (m.books || []).length).length,
        books: p.modules.reduce((a, m) => a + (m.books || []).length, 0),
        canFetch: readable(p.url) || p.modules.some(m => readable(m.list)),
        state: fetchWord(p),
    }));
}

// ── the degree: modules by stage, credits and marks, what it takes to graduate ──
// The credits line counts against the programme's own total when one is set, else against the modules listed.
export function degreeLook(C: Course) {
    const mods = C.modules || [],
        cr = (m: PathModule) => +(m.credits || 0) || 0;
    const graded = mods.filter(
            m => m.grade !== "" && m.grade != null && !Number.isNaN(parseFloat(String(m.grade))) && cr(m)
        ),
        avg = graded.length
            ? graded.reduce((a, m) => a + parseFloat(String(m.grade)) * cr(m), 0) /
              graded.reduce((a, m) => a + cr(m), 0)
            : null;
    const st = C.stages || [],
        none = mods.filter(m => !st.some(s => s.id === m.stage));
    return {
        groups: [
            ...st.map(s => ({ id: s.id, name: s.name, mods: mods.filter(m => m.stage === s.id) })),
            ...(none.length || !st.length ? [{ id: "", name: st.length ? "No stage" : "Modules", mods: none }] : []),
        ].map(g => ({
            ...g,
            // folded, a stage says how far along it is: "3 modules · 35/35 credits done"
            sum: g.mods.length
                ? `${plural(g.mods.length, "module")} · ${g.mods.filter(m => m.status === "done").reduce((a, m) => a + cr(m), 0)}/${g.mods.reduce((a, m) => a + cr(m), 0)} credits done`
                : "no modules yet",
        })),
        line: mods.length
            ? `${mods.filter(m => m.status === "done").reduce((a, m) => a + cr(m), 0)}/${+(C.req?.credits || 0) || mods.reduce((a, m) => a + cr(m), 0)} credits done · ${plural(mods.filter(m => m.status === "taking").length, "module")} under way` +
              (avg != null ? ` · credit-weighted mark ${avg.toFixed(1)}` : "")
            : "No modules yet: add them, or fetch them from the programme's page.",
        books: (id: string) => C.books.filter(b => b.mod === id).length,
    };
}
/** graduation: core modules, how many options, how many credits */
export function gradLook(C: Course) {
    const mods = C.modules || [];
    if (!mods.length) return null;
    const R = C.req || {},
        core = mods.filter(m => m.core !== false),
        opt = mods.filter(m => m.core === false),
        cr = (m: PathModule) => +(m.credits || 0) || 0;
    const coreDone = core.filter(m => m.status === "done").length,
        optDone = opt.filter(m => m.status === "done").length,
        optTaking = opt.filter(m => ["taking", "done"].includes(m.status || "")).length;
    const crDone = mods.filter(m => m.status === "done").reduce((a, m) => a + cr(m), 0);
    const need = +(R.options || 0) || 0,
        credits = +(R.credits || 0) || 0;
    return {
        ok: coreDone === core.length && (!need || optDone >= need) && (!credits || crDone >= credits),
        core: `${coreDone}/${core.length}`,
        opts: `${optDone}${need ? "/" + need : ""}`,
        optsWord: `options${need ? " needed" : ""}${optTaking > optDone ? ` · ${optTaking - optDone} under way` : ""}`,
        credits: `${crDone}${credits ? "/" + credits : ""}`,
        reqOptions: String(R.options || ""),
        reqCredits: String(R.credits || ""),
    };
}

// ── Curricula: each programme's modules, the topics they teach, and their reading lists ──
export function curriculaLook(C: Course) {
    const tname = (id: string) => C.topics.find(t => t.id === id)?.name || "";
    return C.progs.map(p => ({
        id: p.id,
        uni: p.uni,
        name: p.name,
        href: safeUrl(p.url),
        src: safeUrl(p.src) && p.src !== p.url ? safeUrl(p.src) : "",
        canFetch: readable(p.url) || p.modules.some(m => readable(m.list)),
        state: fetchWord(p),
        modules: p.modules.map((m, i) => {
            const books = (m.books || []).map(([t, a]) => ({
                t,
                a,
                inCourse: C.books.some(b => sameBook(b.t, b.a, t, a)),
            }));
            return {
                i,
                name: m.name,
                code: m.code || "",
                lvl: lvlName(m.lvl || p.lvl || 2),
                core: m.core,
                topics: (m.topics || []).map(tname).filter(Boolean),
                books,
                all: books.length > 0 && books.every(b => b.inCourse),
                list: safeUrl(m.list),
            };
        }),
    }));
}
/** a name for a topic, for a select */
export const topicOptions = (C: Course) =>
    C.topics
        .slice()
        .sort((a, b) => norm(a.area || "").localeCompare(norm(b.area || "")) || 0)
        .map(t => ({ id: t.id, name: `${t.name}${t.area ? " · " + t.area : ""}` }));
