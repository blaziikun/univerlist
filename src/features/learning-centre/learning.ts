// src/features/learning-centre/learning.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: an official extension (Settings › Extensions › Built in) with a space of its own
//
//  It's for learning something in the best order. A course is a subject (mathematics) or a narrower topic
//  (propulsion): its topics, grouped by area; the books for each, placed by level (Foundations, Undergraduate,
//  Master's, PhD); which book needs which done or underway first; the programmes it was built from; and, only if it's a
//  degree you're taking, its modules, credits and marks. One course is the current one (the default, unless you've
//  picked another), and it's what Courses and Curricula show.
//
//  A book's progress comes from your library when it's there; a book joins your library when you start it. The data is
//  checked, converted and merged in learning-data.ts; the reading order is worked out in learning-order.ts; a new course
//  is built from the catalogue and the universities' own pages in learning-build.ts.
// ─────────────────────────────────────────────────────────────────

import {
    addItem,
    clone,
    idTitle,
    isSealed,
    items,
    markDirty,
    meta,
    norm,
    nowISO,
    ownOf,
    patch,
    plural,
    titleOf,
    toast,
    ui,
} from "../core/core";
import type { ActEl } from "../core/core";
import type { Course, Courses, Modal, PathBook, PathCond, PathModule } from "../core/model";
import { autoCovers } from "../sources/covers";
import { renderMain } from "../core/shell";
import { BLOCKS } from "../library/blocks";
import { closeModal, openModal, renderOverlay } from "../core/modals";
import { goTab } from "../core/navigation";
import { acId, lcAreaFor, lcConvertOld, lcForget, LEVELS } from "./learning-data";
import { catSubjectsFor, catTopicFor } from "./catalogue/catalogue";

export { acId, LEVELS };
export const PW_ST: [string, string][] = [
    ["todo", "To read"],
    ["reading", "Reading"],
    ["done", "Done"],
    ["skip", "Skipping"],
];
const PW_RANK: Record<string, number> = { todo: 0, skip: 0, reading: 1, done: 2 };
/** the four levels a book can be at, as the map's columns */
export const BOOK_LEVELS = [1, 2, 3, 4];
/** the Learning Centre, in today's form (older data is converted, never dropped) */
export const ACS = (): Courses => {
    if (!meta.courses || meta.courses.v !== 3) meta.courses = lcConvertOld(meta.courses);
    return meta.courses;
};
export const LCS = () => ACS().courses;
export const lcSub = (id: string | null | undefined): Course | undefined => LCS().find(s => s.id === id);

// ── the current course: the one you picked, else the default, else the first ──
/** the course Courses and Curricula show */
export function lcCurId(): string | undefined {
    const L = LCS(),
        shown = L.filter(s => !s.hidden);
    if (ui.learnSub && L.some(s => s.id === ui.learnSub)) return ui.learnSub;
    const d = ACS().def;
    return (shown.find(s => s.id === d) || shown[0])?.id;
}
export const lcCur = (): Course | undefined => lcSub(lcCurId());
/** pick the current course (no id: the default) */
export function lcPick(id: string | null) {
    ui.learnSub = id;
    ui.lcHub = false;
    ui.learnDel = null;
    ui.lcOpen = null;
}

export const pwBook = (C: Course, k: string | undefined) => C.books.find(b => b.id === k);
export const lcMod = (C: { modules?: PathModule[] }, id: string | undefined): PathModule | undefined =>
    (C.modules || []).find(m => m.id === id);
/** a book's level: what it was given, else undergraduate */
export const lvlOf = (b: PathBook) => b.lvl || 2;
/** a book's topic's name */
export const topicName = (C: Course, b: PathBook) => C.topics.find(t => t.id === b.topic)?.name || "Other";

// ── progress: from your library when the book is there, else from the course ──
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
const surnames = (s: string) =>
    norm(s)
        .split(" ")
        .filter(w => w.length > 2);
/** the entry in your library a book is, if any */
export function pwLib(b: PathBook): string | null {
    if (b.lib && items.has(b.lib)) return b.lib;
    const C = pwLibIndex().get(norm(String(b.t).split(":")[0])) || [],
        sn = surnames(b.a || "");
    return (
        C.find(id => {
            const c = items.get(id)?.creator || "";
            return !c || !sn.length || sn.some(w => norm(c).includes(w));
        }) || null
    );
}
/** whether two books are the same: the same title (before any subtitle) and, when both name one, an author in common */
export function sameBook(t1: string, a1: string | undefined, t2: string, a2: string | undefined): boolean {
    const x = idTitle(String(t1).split(":")[0]),
        y = idTitle(String(t2).split(":")[0]);
    if (!x || x !== y) return false;
    const s1 = surnames(a1 || ""),
        s2 = surnames(a2 || "");
    return !s1.length || !s2.length || s1.some(w => s2.includes(w));
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
export function pwMet(C: Course, c: PathCond) {
    const x = pwBook(C, c.k);
    if (!x) return true;
    const s = pwState(x);
    return c.s === "start" ? s === "reading" || s === "done" : c.s === "part" ? pwPartDone(x, c.p || 0) : s === "done";
}
/** where a book is: done, reading, skip, reference, ready (all it needs is met) or waiting */
export function pwBucket(C: Course, b: PathBook): string {
    const s = pwState(b);
    if (b.ref) return "ref";
    if (s === "done" || s === "reading" || s === "skip") return s;
    return (b.after || []).every(c => pwMet(C, c)) ? "ready" : "waiting";
}
export const pwShort = (b: PathBook) => {
    const sur = (b.a || "").split(",")[0].trim().split(" ").pop();
    return b._dupe || !sur ? b.t : sur;
};
export function pwCondText(C: Course, c: PathCond) {
    const x = pwBook(C, c.k);
    if (!x) return "";
    return `${pwShort(x)} ${c.s === "start" ? "is underway" : c.s === "part" ? `${((x.parts || [])[c.p || 0] || {}).t || "part " + ((c.p || 0) + 1)} is done` : "is done"}`;
}
/** books by the same surname are told apart by their titles */
export function pwMark(C: Course) {
    const n: Record<string, number> = {};
    const sur = (b: PathBook) => (b.a || "").split(",")[0].trim().split(" ").pop() || "";
    for (const b of C.books) {
        const s = sur(b);
        n[s] = (n[s] || 0) + 1;
    }
    for (const b of C.books) {
        const s = sur(b);
        b._dupe = n[s] > 1 ? `${s} (${b.t.length > 28 ? b.t.slice(0, 26) + "…" : b.t})` : "";
    }
}
export const pwLabel = (b: PathBook) => {
    const sur = (b.a || "").split(",")[0].trim().split(" ").pop();
    return sur ? `${b.t} · ${sur}` : b.t;
};
export const pwUnlocks = (C: Course, b: PathBook) => C.books.filter(x => (x.after || []).some(c => c.k === b.id));
export const PW_WORD: Record<string, string> = {
    done: "Done",
    reading: "Reading",
    ready: "Ready",
    waiting: "Waiting",
    ref: "Reference",
    skip: "Skipping",
};
/** a course's books done, of those that count. Counts the same books as the map and Next: everything but reference books and skipped ones. */
export function courseProgress(C: Course): [done: number, all: number] {
    const core = C.books.filter(b => !b.ref && pwState(b) !== "skip");
    return [core.filter(b => pwState(b) === "done").length, core.length];
}
/** your level across the fields you've rated */
export function subjLevel(S: Course) {
    const V = Object.values(S.fields || {})
        .map(f => f.lvl || 0)
        .filter(v => v > 0);
    return V.length ? V.reduce((a, v) => a + v, 0) / V.length : 0;
}

// ── changing a course ──
/** a new course, empty, made current */
export function lcNewCourse(name: string, o: Partial<Course> = {}): Course {
    const C: Course = {
        id: acId(),
        name,
        g: name.charAt(0).toUpperCase(),
        fields: {},
        order: [],
        goal: 0,
        topics: [],
        books: [],
        progs: [],
        ...o,
    };
    LCS().push(C);
    lcPick(C.id);
    markDirty();
    return C;
}
/** a topic of the course by name, made if it has none. A name the catalogue knows ("Group theory", "Vectors and
 *  Matrices") is the catalogue's topic (Groups, Linear algebra), in its area; another goes in the area given, or the
 *  one it fits best */
export function lcTopic(C: Course, name: string, area?: string): string {
    const subs = catSubjectsFor(C),
        cat = subs.length ? catTopicFor(name, subs) : null,
        as = cat ? cat.t.name : name;
    const had = C.topics.find(t => norm(t.name) === norm(as) || norm(t.name) === norm(name));
    if (had) return had.id;
    const id = "t" + acId();
    C.topics.push({ id, name: as, area: cat ? cat.t.area : area || lcAreaFor(C, name, subs) });
    return id;
}
/** a book into a course: one it already has (the same title and author) serves this topic too; otherwise it's added */
export function lcAddBook(
    C: Course,
    x: { t: string; a?: string; year?: string | number; isbn?: string; topic?: string; lvl?: number; lib?: string }
): { b: PathBook; added: boolean } {
    const had = C.books.find(b => sameBook(b.t, b.a, x.t, x.a));
    if (had) {
        if (x.topic && had.topic !== x.topic && !(had.tops || []).includes(x.topic))
            had.tops = [...(had.tops || []), x.topic];
        if (!had.topic && x.topic) had.topic = x.topic;
        if (x.lib && !had.lib) had.lib = x.lib;
        return { b: had, added: false };
    }
    const b: PathBook = {
        id: "b" + acId(),
        t: x.t,
        a: x.a || "",
        st: "todo",
        after: [],
        ord: Math.max(0, ...C.books.map(y => y.ord || 0)) + 1,
        ...(x.year ? { year: x.year } : {}),
        ...(x.isbn ? { isbn: x.isbn } : {}),
        ...(x.topic ? { topic: x.topic } : {}),
        ...(x.lvl ? { lvl: x.lvl } : {}),
        ...(x.lib ? { lib: x.lib } : {}),
    };
    C.books.push(b);
    return { b, added: true };
}
/** a book's state, here and in your library: starting one that isn't in your library yet adds it there */
export function pwSetState(C: Course, b: PathBook, s: string) {
    b.st = s;
    let lid = pwLib(b);
    if (!lid && (s === "reading" || s === "done")) {
        lid = addItem(
            {
                medium: "book",
                kind: "Academic",
                title: b.t,
                creator: b.a || "",
                subject: C.name,
                year: Number(b.year) || undefined,
                isbn: b.isbn || undefined,
                status: s === "done" ? "done" : "active",
                startedAt: nowISO(),
                ...(s === "done" ? { finishedAt: nowISO() } : {}),
            },
            "Start " + b.t
        );
        b.lib = lid;
        setTimeout(() => autoCovers([lid || ""]), 300);
    } else if (lid) {
        const L = items.get(lid);
        if (L) {
            if (s === "reading" && !["active", "redo"].includes(L.status))
                patch(lid, { status: "active", startedAt: L.startedAt || nowISO() }, "Start " + titleOf(L));
            if (s === "done" && L.status !== "done")
                patch(lid, { status: "done", finishedAt: L.finishedAt || nowISO() }, "Finish " + titleOf(L));
            if (s === "todo" && ["active", "redo", "done"].includes(L.status))
                patch(lid, { status: "want" }, "Back to planned");
        }
    }
    markDirty();
}
/** a book out of its course, and out of what waited on it; noted, so a sync doesn't bring it back */
export function lcRemoveBook(C: Course, id: string) {
    C.books = C.books.filter(x => x.id !== id);
    for (const x of C.books) x.after = (x.after || []).filter(c => c.k !== id);
    lcForget(ACS(), [id]);
    markDirty();
}
/** moves the i-th of a list by d places; false when it can't go there */
export function lcMove<T>(L: T[], i: number, d: number): boolean {
    const j = i + d;
    if (i < 0 || j < 0 || j >= L.length) return false;
    [L[i], L[j]] = [L[j], L[i]];
    return true;
}

// ── clicks ──
export function learnClick(act: string, t: ActEl, k: string | undefined): boolean {
    const S = k ? lcSub(k) : undefined;
    switch (act) {
        // a course (all courses when there's none)
        case "learn-open":
            lcPick(S ? k || null : null);
            ui.lcHub = !S;
            renderMain();
            scrollTo(0, 0);
            return true;
        case "learn-jump":
            lcPick(S ? k || null : null);
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
                if (S.hidden && ui.learnSub === S.id) ui.learnSub = null;
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
                before = clone(C),
                gone = C.courses.find(s => s.id === k);
            if (!gone || !k) return true;
            C.courses = C.courses.filter(s => s.id !== k);
            lcForget(C, [k]);
            if (C.def === k) delete C.def;
            ui.learnSub = null;
            ui.learnDel = null;
            ui.lcHub = !C.courses.length;
            markDirty();
            renderMain();
            toast(`Deleted ${gone.name}`, {
                label: "Undo",
                fn: () => {
                    meta.courses = before;
                    markDirty();
                },
            });
            return true;
        }
    }
    return false;
}
/** a book's dialog: the course and the book it's open on */
export interface PwBookModal extends Modal {
    pid: string;
    bid: string;
    edit?: boolean;
    confirm?: boolean;
}
export const isPwBookModal = (m: Modal | null): m is PwBookModal =>
    !!m && m.kind === "pwbook" && typeof m.pid === "string" && typeof m.bid === "string";
export function pathClick(act: string, _t: ActEl, k: string | undefined, _e?: Event): boolean {
    const m = isPwBookModal(ui.modal) ? ui.modal : null,
        mp = m ? lcSub(m.pid) : undefined,
        mb = mp && m ? pwBook(mp, m.bid) : undefined;
    switch (act) {
        case "pw-book": {
            const C = mp || lcCur();
            if (m) {
                m.bid = k || "";
                m.confirm = false;
                m.edit = false;
                renderOverlay(true);
            } else if (C) openModal("pwbook", { pid: C.id, bid: k });
            return true;
        }
        case "pw-st":
            if (mp && mb && k) pwSetState(mp, mb, k);
            return true;
        case "pw-tolib":
            if (mp && mb) {
                mb.lib = addItem(
                    {
                        medium: "book",
                        kind: "Academic",
                        title: mb.t,
                        creator: mb.a || "",
                        subject: mp.name,
                        year: Number(mb.year) || undefined,
                        status: mb.st === "done" ? "done" : mb.st === "reading" ? "active" : "want",
                    },
                    "Add " + mb.t
                );
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
                lcRemoveBook(mp, mb.id);
                closeModal();
            }
            return true;
    }
    return false;
}
export function lcClick(act: string, t: ActEl, k: string | undefined): boolean {
    const C = lcCur();
    switch (act) {
        // the course you're on becomes the one the Learning Centre opens on
        case "lc-default":
            if (C) {
                ACS().def = C.id;
                markDirty();
                toast(`${C.name} is your default course`);
            }
            return true;
        case "lc-new":
            openModal("lcnew", { into: k === "more" && C ? C.id : "" });
            return true;
        // Next: one click starts a book, or marks it done
        case "lc-start":
        case "lc-done": {
            const b = C && pwBook(C, k);
            if (C && b) {
                pwSetState(C, b, act === "lc-start" ? "reading" : "done");
                toast(`${act === "lc-start" ? "Started" : "Finished"} ${b.t}`);
            }
            return true;
        }
        case "lc-import":
            if (C)
                openModal("lcimport", {
                    pid: C.id,
                    url: t.dataset.u || "",
                    want: t.dataset.w || "auto",
                    step: "link",
                });
            return true;
        case "lc-open":
            ui.lcOpen = ui.lcOpen === k ? null : k;
            renderMain();
            return true;
        // the degree: stages and modules
        case "lc-stage-add":
            if (C) {
                C.stages = [...(C.stages || []), { id: acId(), name: `Year ${(C.stages || []).length + 1}` }];
                markDirty();
            }
            return true;
        case "lc-stage-del":
            if (C) {
                C.stages = (C.stages || []).filter(s => s.id !== k);
                for (const m of C.modules || []) if (m.stage === k) m.stage = "";
                markDirty();
            }
            return true;
        case "lc-mod-add":
            if (C) {
                const nm: PathModule = {
                    id: acId(),
                    stage: k || "",
                    code: "",
                    name: "New module",
                    credits: "",
                    core: true,
                    status: "planned",
                    grade: "",
                };
                (C.modules ||= []).push(nm);
                ui.lcOpen = nm.id;
                markDirty();
            }
            return true;
        case "lc-mod-del":
            if (C) {
                C.modules = (C.modules || []).filter(m => m.id !== k);
                for (const b of C.books) if (b.mod === k) delete b.mod;
                markDirty();
            }
            return true;
    }
    return false;
}
/** books from a reading list, into a course: each joins its topic, at its level, in the list's order; the count added */
export function lcTakeList(
    C: Course,
    L: [string, string][],
    topic: string | undefined,
    lvl: number | undefined
): number {
    let n = 0;
    for (const [t, a] of L) if (lcAddBook(C, { t, a, topic, lvl }).added) n++;
    markDirty();
    return n;
}
export const addedWord = (n: number, name: string) =>
    n ? `Added ${plural(n, "book")} to ${name}` : `They're all in ${name} already`;

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initLearning() {
    // the overview's blocks (drawn by pages/PathsMini.svelte and LearnMini.svelte)
    BLOCKS.paths = { name: "Reading next", d: "What to read next in your course, in order", w: 8 };
    BLOCKS.learn = { name: "Courses", d: "Your courses, and how far through each you are", w: 8 };
}
