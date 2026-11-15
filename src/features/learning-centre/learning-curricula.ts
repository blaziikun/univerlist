// src/features/learning-centre/learning-curricula.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: Curricula, the programmes the current course was built from
//
//  Each programme is a university's modules, each teaching some of the course's topics, with its reading list. "Use
//  this reading list" puts a module's books into the course, in its topic and at its level; a book the course already
//  has (the same title and author) serves that topic too. Programmes come from the catalogue when a course is built
//  (learning-build.ts), or from a university's page ("Fetch a programme", learning-import.ts).
// ─────────────────────────────────────────────────────────────────

import { markDirty, norm, toast } from "../core/core";
import type { ActEl } from "../core/core";
import type { Course } from "../core/model";
import { BLOCKS } from "../library/blocks";
import { openModal } from "../core/modals";
import { ACS, addedWord, lcCur, lcSub, lcTakeList, lcTopic } from "./learning";
import { acId, lcForget } from "./learning-data";
import { lcFetchAll } from "./learning-build";

// a module goes to every topic of the course whose name shares a meaningful word with it; with none, it becomes a topic
// of its own
function matchTopics(C: Course, name: string): string[] {
    const W = norm(name)
        .split(" ")
        .filter(
            w =>
                w.length > 3 &&
                !["introduction", "advanced", "theory", "methods", "topics", "systems", "further", "part"].includes(w)
        );
    const sc = C.topics.map((t): [string, number] => [
            t.id,
            W.filter(w =>
                norm(t.name)
                    .split(" ")
                    .some(x => x === w || (w.length > 5 && x.startsWith(w.slice(0, 6))))
            ).length,
        ]),
        top = Math.max(0, ...sc.map(x => x[1]));
    if (top) return sc.filter(x => x[1] === top).map(x => x[0]);
    return [
        lcTopic(
            C,
            String(name)
                .replace(/^[A-Z]{2,6}[ -]?\d{2,6}[A-Z]?\s*/, "")
                .trim() || name
        ),
    ];
}
/** a programme from fetched modules, into a course: the number of modules */
export function uniAddProgramme(
    cid: string,
    o: {
        uni?: string;
        name?: string;
        url?: string;
        modules: { name: string; code?: string; core?: boolean; books?: [title: string, author: string][] }[];
    }
): number {
    const C = lcSub(cid);
    if (!C) return 0;
    C.progs.push({
        id: "p" + acId(),
        uni: o.uni || "",
        name: o.name || "Programme",
        url: o.url || "",
        modules: o.modules.map(m => ({
            name: m.name,
            ...(m.code ? { code: m.code } : {}),
            core: !!m.core,
            topics: matchTopics(C, m.name),
            books: m.books || [],
        })),
    });
    markDirty();
    return o.modules.length;
}
export function uniClick(act: string, t: ActEl, k: string | undefined): boolean {
    const C = lcCur(),
        p = C && C.progs.find(x => x.id === k);
    switch (act) {
        // a module's reading list into the course: its first topic, at the module's (or programme's) level
        case "uni-use": {
            const m = p && p.modules[Number(t.dataset.m)];
            if (C && p && m) {
                const n = lcTakeList(C, m.books || [], (m.topics || [])[0] || lcTopic(C, m.name), m.lvl || p.lvl);
                toast(addedWord(n, C.name));
            }
            return true;
        }
        case "uni-fetch":
            if (C) openModal("lcimport", { cur: C.id, want: "modules", step: "link", url: "" });
            return true;
        case "uni-again":
            if (C) void lcFetchAll(C.id, k ? [k] : undefined);
            return true;
        case "uni-del":
            if (C && p) {
                const before = C.progs.slice();
                C.progs = C.progs.filter(x => x.id !== k);
                lcForget(ACS(), [p.id]);
                markDirty();
                toast(`Removed ${p.uni || p.name}`, {
                    label: "Undo",
                    fn: () => {
                        C.progs = before;
                        delete (ACS().gone || {})[p.id];
                        markDirty();
                    },
                });
            }
            return true;
    }
    return false;
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initLearningCurricula() {
    // the overview's block (drawn by pages/CurriculaMini.svelte)
    BLOCKS.courses = { name: "Curricula", d: "The programmes your courses were built from", w: 8 };
}
