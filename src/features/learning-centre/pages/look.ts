// src/features/learning-centre/pages/look.ts
// ─────────────────────────────────────────────────────────────────
//  What the Learning Centre's pages show, worked out in plain TypeScript: a course's card, a reading's card, a
//  pathway at a glance (its buckets, lanes and stages), a programme's totals, what it takes to graduate, the
//  comparison with another programme, the hub's sections and Curricula's table. The components in this folder only
//  draw it. A sentence that mixes plain words with bold ones is worked out as pieces with the plain words joined
//  (lcLine), so it's drawn as the same runs of text the page always had.
// ─────────────────────────────────────────────────────────────────

import { findExisting, fmtDate, items, norm, plural, safeUrl, ui } from "../../core/core";
import type { Course, CurProgramme, Curriculum, Entry, Item, PathBook, PathModule, Pathway } from "../../core/model";
import {
    ACS,
    coursePath,
    lcArea,
    lcLane,
    lcMod,
    lcSub,
    lcTopics,
    LEVELS,
    LSUBS,
    pathProgress,
    pwBucket,
    pwColor,
    pwCondText,
    pwLanes,
    pwLib,
    pwMark,
    pwMet,
    pwPartDone,
    PWS,
    pwShort,
    pwStages,
    pwState,
    pwUnlocks,
    PW_WORD,
    subjLevel,
} from "../learning";
import { lcMastery, lcModDone, lcModWaits, lcTopicWaits } from "../learning-hub";

/** a piece of a sentence: plain words, bold words, or a link (↗) */
export type LcPiece = { t: string } | { b: string } | { a: string; label: string };
/** a sentence's pieces, with the plain words next to each other joined into one */
function lcLine(parts: (string | LcPiece)[]): LcPiece[] {
    const out: LcPiece[] = [];
    for (const x of parts) {
        const p = typeof x === "string" ? { t: x } : x;
        const last = out[out.length - 1];
        if ("t" in p && last && "t" in last) last.t += p.t;
        else if (!("t" in p) || p.t) out.push({ ...p });
    }
    return out;
}

// two kinds of course, always shown apart on the Courses page: what you study and what you're into
export const LC_KINDS: [string, string][] = [
    ["sci", "Academic"],
    ["arts", "Interests"],
];
export const PW_VIEWS: [string, string][] = [
    ["modules", "Modules"],
    ["map", "Map"],
    ["stages", "Stages"],
    ["threads", "Threads"],
];
export const LC_STATUS: [string, string][] = [
    ["planned", "Planned"],
    ["taking", "Taking"],
    ["done", "Done"],
    ["dropped", "Dropped"],
];

// ── where the Courses tab is: a course (a pathway opens as its course), or all of them ──
/** the course open, live; as the page always did, it also notes which pathway the page's buttons act on */
export function learnOpen(): Course | undefined {
    const cur = PWS().find(p => p.id === ui.pwId);
    if (cur) ui.learnSub = cur.sub; // a pathway opens as its course
    const S = ui.learnSub ? lcSub(ui.learnSub) : undefined;
    if (!S) {
        ui.pwId = null;
        return undefined;
    }
    const P = coursePath(S);
    ui.pwId = P.id; // what the pathway's buttons act on
    pwMark(P);
    return S;
}

// ── a course on the Courses page ──
export function courseCardLook(S: Course) {
    const P = PWS().find(p => p.sub === S.id),
        lv = subjLevel(S),
        [d, n] = P ? pathProgress(P) : [0, 0],
        tp = P ? lcTopics(P) : { n: 0, done: 0 },
        rd = P ? P.books.filter(b => pwState(b) === "reading") : [],
        mods = (P && P.modules) || [],
        cu = (ACS().curricula || {})[S.id];
    const level = lv ? LEVELS[Math.round(lv)][0] : "";
    return {
        id: S.id,
        name: `${S.g || "∫"} ${S.name}`,
        level:
            level || S.goal
                ? [level, S.goal ? "aiming for " + LEVELS[S.goal][0].toLowerCase() : ""].filter(Boolean).join(" · ")
                : "",
        uni: P && (P.uni || P.programme) ? [P.uni, P.programme].filter(Boolean).join(" · ") : "",
        about: P && P.about ? (P.about.length > 220 ? P.about.slice(0, 218) + "…" : P.about) : "",
        width: n ? (d / n) * 100 : tp.n ? (tp.done / tp.n) * 100 : 0,
        line:
            (n ? `${d}/${n} books` : tp.n ? `${tp.done}/${tp.n} topics` : "nothing in it yet") +
            (mods.length ? ` · ${plural(mods.length, "module")}` : "") +
            (cu && cu.progs.length ? ` · ${plural(cu.progs.length, "programme")} compared` : "") +
            (rd.length
                ? " · reading " +
                  rd
                      .map(b => b.t)
                      .slice(0, 2)
                      .join(", ")
                : ""),
    };
}

// ── a reading's card ──
export function pwCardLook(P: Pathway, b: PathBook, thread = false) {
    const bk = pwBucket(P, b),
        lid = pwLib(b),
        L = lid ? items.get(lid) : undefined,
        wait = (b.after || []).filter(c => !pwMet(P, c)),
        lane = lcLane(P, b),
        n = (b.parts || []).length,
        pd = (b.parts || []).filter((_, i) => pwPartDone(b, i)).length;
    const cover: Item | null = L && L.cover && lid ? { ...L, id: lid } : null;
    return {
        id: b.id,
        bk,
        colour: pwColor(P, lane),
        cover,
        t: b.t,
        sub: (b.a || "") + (b.year ? " · " + b.year : ""),
        word: PW_WORD[bk],
        opt: !!b.opt,
        free: !!b.free,
        parts: n ? `${pd}/${n} parts` : "",
        lane: thread ? lane : "",
        wait: bk === "waiting" && wait.length ? "After " + wait.map(c => pwCondText(P, c)).join(" and ") : "",
    };
}
export type PwCardLook = ReturnType<typeof pwCardLook>;

// ── a pathway at a glance ──
const daysTo = (d: string | undefined) => {
    if (!d) return "";
    const n = Math.round((Date.parse(d) - Date.now()) / 864e5);
    return n === 0 ? "today" : n > 0 ? `in ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} ago`;
};
export function pathLook(P: Pathway) {
    const B = P.books,
        main = B.filter(b => !b.ref),
        core = main.filter(b => !b.opt),
        by = (k: string) => main.filter(b => pwBucket(P, b) === k),
        stg = pwStages(P);
    const reading = by("reading"),
        ready = by("ready"),
        waiting = by("waiting"),
        refs = B.filter(b => b.ref);
    const cdone = core.filter(b => pwState(b) === "done").length,
        pct = core.length ? Math.round((cdone / core.length) * 100) : 0;
    const view = PW_VIEWS.some(([k]) => k === P.view)
        ? P.view || "modules"
        : P.view === "order"
          ? "stages"
          : (P.modules || []).length
            ? "modules"
            : "map";
    const lanes = pwLanes(P).filter(th => main.some(b => lcLane(P, b) === th));
    const nexts = reading
        .map((b): [PathBook, PathBook[]] => [
            b,
            pwUnlocks(P, b).filter(
                x => pwBucket(P, x) === "waiting" && (x.after || []).filter(c => !pwMet(P, c)).every(c => c.k === b.id)
            ),
        ])
        .filter(([, u]) => u.length)
        .map(([b, u]) => ({ id: b.id, name: pwShort(b), unlocks: u.map(x => pwShort(x)).join(", ") }));
    const goals = (P.goals || [])
        .slice()
        .sort(
            (a, c) => Number(!!a.done) - Number(!!c.done) || String(a.date || "9").localeCompare(String(c.date || "9"))
        )
        .map(g => ({ ...g, when: g.date ? `${fmtDate(g.date)} · ${daysTo(g.date)}` : "" }));
    const merged = (P.merged || []).flatMap((x, i): (string | LcPiece)[] => {
        const url = safeUrl(x.url);
        return [
            i ? "; " : "",
            { b: String(x.name || x.programme || "a pathway") },
            x.uni || x.programme ? ` (${[x.uni, x.programme].filter(Boolean).join(" · ")})` : "",
            ...(url ? [" ", { a: url, label: "↗" }] : []),
            x.about ? `: ${x.about}` : "",
        ];
    });
    const laneBars = lanes.slice(0, 12).map(th => {
        const L = main.filter(b => lcLane(P, b) === th),
            d = L.filter(b => pwState(b) === "done").length;
        return { th, colour: pwColor(P, th), d, n: L.length, w: L.length ? Math.round((d / L.length) * 100) : 0 };
    });
    return {
        main,
        stg,
        reading,
        ready,
        waiting,
        refs,
        pct,
        ringNote: `${cdone} of ${core.length}${core.length < main.length ? " core" : ""}`,
        view,
        lanes,
        laneBars,
        nexts,
        maxS: Math.max(0, ...main.map(b => stg[b.id] || 0)),
        goals,
        merged: merged.length ? lcLine(["Brought together here: ", ...merged]) : [],
        rules: (P.method || "")
            .split("\n")
            .map(s => s.trim())
            .filter(Boolean),
    };
}
export const stageName = (i: number) => (i === 0 ? "Start" : `Stage ${i + 1}`);
/** a pathway's readings in one lane, done of all */
export const laneDone = (P: Pathway, main: PathBook[], th: string) => {
    const L = main.filter(b => lcLane(P, b) === th);
    return { L, done: L.filter(b => pwState(b) === "done").length };
};

// ── what a programme adds up to: topics, credits, what you're taking, a credit-weighted mark ──
export function programmeLook(P: Pathway) {
    const mods = P.modules || [];
    if (!mods.length) return null;
    const cov = lcTopics(P),
        cr = mods.reduce((a, m) => a + (+(m.credits || 0) || 0), 0),
        crDone = mods.filter(m => m.status === "done").reduce((a, m) => a + (+(m.credits || 0) || 0), 0);
    const graded = mods.filter(
            m => m.grade !== "" && m.grade != null && !Number.isNaN(parseFloat(String(m.grade))) && +(m.credits || 0)
        ),
        avg = graded.length
            ? graded.reduce((a, m) => a + parseFloat(String(m.grade)) * +(m.credits || 0), 0) /
              graded.reduce((a, m) => a + +(m.credits || 0), 0)
            : null;
    const areas: Record<string, { n: number; done: number }> = {};
    for (const [t, e] of Object.entries(cov.T)) {
        const a = lcArea(P, t),
            x = areas[a] || (areas[a] = { n: 0, done: 0 });
        x.n++;
        if (e.done) x.done++;
    }
    return {
        tiles: [
            [`${cov.done}/${cov.n}`, "Topics covered"],
            [`${crDone}/${cr}`, "Credits done"],
            [String(mods.filter(m => m.status === "taking").length), "Taking now"],
            [avg != null ? avg.toFixed(1) : "–", "Credit-weighted mark"],
        ],
        areas:
            Object.keys(areas).length > 1
                ? Object.entries(areas).map(([a, x]) => ({
                      a,
                      done: x.done,
                      n: x.n,
                      w: Math.round((x.done / x.n) * 100),
                  }))
                : [],
    };
}

// ── graduation: core modules, how many options, how many credits ──
export function gradLook(P: Pathway) {
    const mods = P.modules || [];
    if (!mods.length) return null;
    const R = P.req || {},
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

// ── what another pathway (another university's programme, say) teaches that this one does or doesn't ──
export function compareLook(P: Pathway, with_: string | null | undefined) {
    const others = PWS().filter(x => x.id !== P.id && (x.modules || []).some(m => (m.topics || []).length));
    if (!others.length || !(P.modules || []).length) return null;
    const O = others.find(x => x.id === with_),
        mine = lcTopics(P).T,
        theirs = O ? [...new Set((O.modules || []).flatMap(m => (m.topics || []).map(t => t.t)))] : [];
    return {
        options: [["", "Choose…"], ...others.map((x): [string, string] => [x.id, x.name])],
        chosen: with_ || "",
        other: O
            ? {
                  line: `${theirs.filter(t => mine[t]).length} of ${theirs.length} topics in ${O.name} are in this one.`,
                  topics: theirs.map(t => ({
                      t,
                      cls: mine[t] ? (mine[t].done ? "on" : "mid") : "gap",
                      title: mine[t] ? "In " + mine[t].mods.join(", ") : "Not in this programme",
                  })),
              }
            : null,
    };
}

// ── the Modules view: a module, closed or open ──
/** where else a topic is taught, from the course's Curricula */
function taughtElsewhere(P: Pathway, t: string): string {
    const cu = (ACS().curricula || {})[P.sub],
        tp = cu && cu.topics.find(y => norm(y.name) === norm(t));
    if (!cu || !tp) return "";
    return cu.progs
        .flatMap(p => p.modules.filter(m => (m.topics || []).includes(tp.id)).map(m => `${p.uni}: ${m.name}`))
        .join(" · ");
}
export function moduleLook(P: Pathway, m: PathModule, openId: string | null | undefined) {
    const T = m.topics || [],
        td = T.filter(t => t.done).length,
        waits = lcModWaits(P, m),
        open = openId === m.id,
        where = open ? T.map(t => taughtElsewhere(P, t.t)) : []; // only an open module shows where else it's taught
    // how its topics spread over the course's areas (a thin bar of colours)
    const c: Record<string, number> = {};
    if (T.length >= 2)
        for (const t of T) {
            const a = lcArea(P, t.t);
            c[a] = (c[a] || 0) + 1;
        }
    const spread = Object.entries(c);
    return {
        cls: `lcmod ${m.status || "planned"}${m.core === false ? " opt" : ""}${open ? " open" : ""}`,
        colour: pwColor(P, m.name),
        open,
        name: [m.code, m.name].filter(Boolean).join(" "),
        facts: [
            m.credits ? m.credits + " credits" : "",
            m.term,
            m.core === false ? "option" : "core",
            m.grade !== "" && m.grade != null ? "mark " + m.grade : "",
        ]
            .filter(Boolean)
            .join(" · "),
        waits: waits.length && !lcModDone(m) ? waits.map(x => x.name) : [],
        bar: T.length ? Math.round((td / T.length) * 100) : null,
        spread:
            spread.length >= 2
                ? {
                      title: spread.map(([a, n]) => `${a}: ${n}`).join(" · "),
                      parts: spread.map(([a, n]) => ({ a, n, colour: pwColor(P, a) })),
                  }
                : null,
        td,
        topics: T.map((t, i) => {
            const tw = lcTopicWaits(P, t);
            return {
                t: t.t,
                done: !!t.done,
                wait: tw.length > 0,
                title: [tw.length ? "Needs " + tw.join(", ") : "", where[i] || ""].filter(Boolean).join(" · "),
            };
        }),
        others: (P.modules || [])
            .filter(x => x.id !== m.id)
            .map(x => ({
                id: x.id,
                name: [x.code, x.name].filter(Boolean).join(" "),
                on: (m.after || []).includes(x.id),
            })),
        equiv: T.flatMap((t, i) => (where[i] ? [{ t: t.t, where: where[i] }] : [])),
        reads: P.books.filter(b => b.mod === m.id && !b.ref),
    };
}
/** your library's books, as the "link a book" boxes offer them */
export const libraryBooks = (all: Entry[], titleOf: (b: Entry) => string, one: (b: Entry) => string) =>
    all
        .filter(x => x.medium === "book")
        .sort((a, c) => titleOf(a).localeCompare(titleOf(c)))
        .map(x => `${titleOf(x)} · ${one(x)}`);
export const looseReadings = (P: Pathway) => P.books.filter(b => !b.ref && !lcMod(P, b.mod));

// ── the hub: mastery, the ladder, crème de la crème, the best places to learn it, opportunities ──
export function masteryLook(S: Course) {
    const M = lcMastery(S),
        F = S.order || Object.keys(S.fields || {});
    return {
        pct: M.pct,
        level: M.level ? LEVELS[M.level][0] : "not started",
        line: lcLine([
            ...(M.tn ? [{ b: `${M.td}/${M.tn}` }, " topics covered"] : ["No topics yet"]),
            " · ",
            ...(M.bn ? [{ b: `${M.bd}/${M.bn}` }, " core books read"] : ["no core books yet"]),
        ]),
        aim: S.goal ? ` You're aiming for ${LEVELS[S.goal][0].toLowerCase()}.` : "",
        ladder: F.length
            ? LEVELS.map(([n, d], i) => ({
                  n,
                  d,
                  goal: S.goal === i,
                  fields: F.filter(f => ((S.fields || {})[f]?.lvl || 0) === i),
              })).reverse()
            : null,
    };
}
export function cremeLook(S: Course) {
    const B = PWS()
            .filter(p => p.sub === S.id)
            .flatMap(p => p.books.filter(b => b.top).map(b => ({ p, b }))),
        cu = (ACS().curricula || {})[S.id];
    const picks = cu
        ? cu.topics
              .map(t => cu.chosen[t.id])
              .filter(Boolean)
              .flatMap(k => (k && cu.books[k] ? [cu.books[k]] : []))
        : [];
    return {
        cards: B.map(({ p, b }) => pwCardLook(p, b, true)),
        picks: picks.length
            ? lcLine([
                  "Your picks in Curricula (best for self-study, topic by topic): ",
                  ...picks
                      .slice(0, 12)
                      .flatMap(([t, a], i): (string | LcPiece)[] => [i ? " · " : "", { b: t }, a ? " " + a : ""]),
                  picks.length > 12 ? ` and ${picks.length - 12} more` : "",
              ])
            : [],
    };
}
export const SRC_KINDS: [string, string][] = [
    ["uni", "University"],
    ["cert", "Certification"],
    ["indie", "Independent"],
];
export const SRC_MAX = 7;
export function sourcesLook(S: Course) {
    const q = encodeURIComponent(S.name);
    return {
        rows: (S.sources || []).map(x => ({
            ...x,
            kindName: (SRC_KINDS.find(k => k[0] === x.kind) || SRC_KINDS[2])[1],
            href: x.url ? safeUrl(x.url) : "",
        })),
        look: [
            [
                "Best universities for " + S.name,
                `https://www.google.com/search?q=${q}+best+university+programme+syllabus`,
            ],
            ["Recognised certifications", `https://www.google.com/search?q=${q}+professional+certification+accredited`],
            ["Learning it on your own", `https://www.google.com/search?q=best+way+to+self+study+${q}+curriculum`],
        ],
    };
}
export function oppsLook(S: Course) {
    return (S.opps || [])
        .slice()
        .sort(
            (a, b) => Number(!!a.done) - Number(!!b.done) || String(a.when || "9").localeCompare(String(b.when || "9"))
        )
        .map(o => ({ ...o, date: o.when ? fmtDate(o.when) : "", href: o.url ? safeUrl(o.url) : "" }));
}
/** your level in each field: the hint under the course's name */
export function levelHint(S: Course) {
    const F = S.order || Object.keys(S.fields || {}),
        lv = subjLevel(S);
    return (
        (lv
            ? `Around ${LEVELS[Math.round(lv)][0].toLowerCase()} level across the fields you've rated`
            : F.length
              ? "Tap the level you're at in each field."
              : "Add its fields below to rate yourself in each (optional).") +
        (S.goal ? ` · aiming for ${LEVELS[S.goal][0].toLowerCase()}` : "")
    );
}
export function curriculaNote(S: Course) {
    const cu = (ACS().curricula || {})[S.id];
    return cu && cu.progs.length
        ? {
              line: `${plural(cu.progs.length, "programme")} compared over ${plural(cu.topics.length, "topic")}; ${Object.keys(cu.chosen || {}).length} books picked.`,
              go: "Open the comparison",
          }
        : {
              line: `Compare what different universities teach in ${S.name.toLowerCase()}, topic by topic, and pick your book for each.`,
              go: "Start comparing",
          };
}

// ── Curricula: the courses to choose from, the programmes, and the merged table ──
/** a programme's short name in the table's head: its university's first letters, numbered when there are two */
export function progAbbr(progs: CurProgramme[], p: CurProgramme) {
    const c = String(p.uni || p.name)
            .replace(/[^A-Za-z]/g, "")
            .slice(0, 3)
            .toUpperCase(),
        same = progs.filter(x => x.uni === p.uni);
    return c + (same.length > 1 ? same.indexOf(p) + 1 : "");
}
/** a topic's row in the merged table: which programmes teach it, and every book they set for it, most set first */
export function curRow(
    S: Curriculum,
    shown: CurProgramme[],
    books: Record<string, [string, string]>,
    t: Curriculum["topics"][number]
) {
    const where = shown.map((p): [CurProgramme, CurProgramme["modules"]] => [
            p,
            p.modules.filter(m => (m.topics || []).includes(t.id)),
        ]),
        cands = new Map<string, { n: number; mods: string[] }>();
    for (const [p, M] of where)
        for (const m of M)
            for (const k of m.books || []) {
                const key = Array.isArray(k) ? k[0] : k;
                const e = cands.get(key) || { n: 0, mods: [] };
                e.n++;
                e.mods.push(`${p.uni}: ${m.name}`);
                cands.set(key, e);
            }
    for (const [k] of S.extra[t.id] || []) if (!cands.has(k)) cands.set(k, { n: 0, mods: ["Added by you"] });
    const ch = S.chosen[t.id] || null,
        sorted = [...cands.entries()].sort((a, b) => b[1].n - a[1].n),
        most = sorted[0],
        mostK = most && most[1].n > 1 ? most[0] : null,
        taught = where.filter(([, M]) => M.length).length;
    return {
        id: t.id,
        name: t.name,
        taught,
        cells: where.map(([, M]) => ({
            on: M.length > 0,
            core: M.some(m => m.core),
            title: M.map(m => m.name).join(", ") || "Not taught",
        })),
        books: sorted.flatMap(([k, e]) => {
            const bk = books[k];
            if (!bk) return [];
            return [
                {
                    k,
                    t: bk[0],
                    a: bk[1],
                    on: k === ch,
                    most: k === mostK,
                    n: e.n,
                    title: e.mods.join(" · "),
                    inLib: !!findExisting(bk[0], bk[1], "book"),
                },
            ];
        }),
    };
}
/** the courses Curricula offers */
export const curCourses = () => LSUBS().filter(s => !s.hidden || s.id === ui.uniSub);
export const courseName = (sid: string) => lcSub(sid)?.name;
