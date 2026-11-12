// src/features/learning-centre/learning-curricula.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: Curricula, what different programmes teach in one course, side by side
//
//  Per course: topics (the common currency, grouped by area), the programmes you compare (each module teaches some
//  topics and sets some books), and your picks. The merged view shows every topic once, which programmes teach it (★
//  compulsory, ● offered) and every book they set for it, most-set first: click one to make it your book for that
//  topic. Nothing is built in: you add programmes by pasting their module list or fetching it from the university's
//  page (or bring them in with an import).
// ─────────────────────────────────────────────────────────────────

import { addItem, clone, findExisting, idTitle, markDirty, norm, plural, slug, toast, ui } from "../core/core";
import type { ActEl } from "../core/core";
import type { Curriculum } from "../core/model";
import { renderMain } from "../core/shell";
import { BLOCKS } from "../library/blocks";
import { openModal } from "../core/modals";
import { acId, ACS, coursePath, lcSub, LSUBS } from "./learning";
import { goTab } from "../core/navigation";

const CUR = (): Record<string, Curriculum> => (ACS().curricula ||= {});
/** a course's Curricula (made empty the first time it's needed) */
export const curS = (sid: string): Curriculum => {
    const c = CUR();
    return (c[sid] = c[sid] || { topics: [], books: {}, progs: [], chosen: {}, extra: {}, hide: [] });
};
/** a course's Curricula with every book it knows: those set by its programmes' modules and those you added */
export function uniData(sid: string) {
    const S = curS(sid),
        books: Record<string, [title: string, author: string]> = { ...S.books };
    for (const p of S.progs)
        for (const m of p.modules) for (const b of m.books || []) if (Array.isArray(b)) books[b[0]] = [b[1], b[2]];
    for (const L of Object.values(S.extra || {})) for (const [k, t, a] of L) books[k] = [t, a];
    return { S, progs: S.progs, books };
}
export const bookKey = (t: string, a: string) => "u" + slug(t + " " + (a || "")).slice(0, 40);
/** the course Curricula shows */
export const curSid = (): string | undefined => {
    const L = LSUBS(),
        c = CUR();
    return (L.find(s => s.id === ui.uniSub) || L.find(s => (c[s.id] || { progs: [] }).progs.length) || L[0])?.id;
};
// a module goes to every topic whose name shares a meaningful word with it; with none, it becomes a topic of its own
function uniMatchTopics(sid: string, name: string): string[] {
    const S = curS(sid),
        W = norm(name)
            .split(" ")
            .filter(
                w =>
                    w.length > 3 &&
                    !["introduction", "advanced", "theory", "methods", "topics", "systems", "further", "part"].includes(
                        w
                    )
            );
    const sc = S.topics.map((t): [string, number] => [
            t.id,
            W.filter(w =>
                norm(t.name)
                    .split(" ")
                    .some(x => x === w || (w.length > 5 && x.startsWith(w.slice(0, 6))))
            ).length,
        ]),
        top = Math.max(0, ...sc.map(x => x[1]));
    if (top) return sc.filter(x => x[1] === top).map(x => x[0]);
    const id = "t" + acId();
    S.topics.push({
        id,
        name:
            String(name)
                .replace(/^[A-Z]{2,6}[ -]?\d{2,6}[A-Z]?\s*/, "")
                .trim() || name,
        area: "Topics",
    });
    return [id];
}
// a programme from fetched (or pasted) modules: { name, code, core, books: [[t, a]] }
export function uniAddProgramme(
    sid: string,
    {
        uni,
        name,
        why,
        kind,
        url,
        modules,
    }: {
        uni?: string;
        name?: string;
        why?: string;
        kind?: string;
        url?: string;
        modules: { name: string; code?: string; core?: boolean; books?: [title: string, author: string][] }[];
    }
): number {
    const S = curS(sid),
        known = (bt: string, ba: string) =>
            Object.entries(uniData(sid).books).find(
                ([, v]) =>
                    idTitle(v[0]) === idTitle(bt) ||
                    (idTitle(v[0]).startsWith(idTitle(bt) + " ") &&
                        (!ba || norm(v[1]).includes(norm(ba).split(" ").pop() || "")))
            );
    const mods = modules.map(m => ({
        name: [m.code, m.name].filter(Boolean).join(" "),
        core: !!m.core,
        topics: uniMatchTopics(sid, m.name),
        books: (m.books || []).map(([bt, ba]) => {
            const k = known(bt, ba);
            if (k) return k[0];
            const key = bookKey(bt, ba);
            S.books[key] = [bt, ba || ""];
            return key;
        }),
    }));
    S.progs.push({
        id: "p" + acId(),
        uni: uni || "",
        name: name || "Programme",
        kind: kind || "mine",
        why: why || "",
        url: url || "",
        modules: mods,
    });
    markDirty();
    return mods.length;
}
/** a pasted programme's modules: one per line, ★ at the start for a compulsory one, its books after a dash, separated
 *  by semicolons ("Author, Title" when the comma comes early) */
export function uniPasted(text: string) {
    return text
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
            const core = /^★/.test(l);
            l = l.replace(/^★\s*/, "");
            const [m, b = ""] = l.split(/\s+[—–-]\s+/);
            return {
                name: m,
                core,
                books: b
                    .split(";")
                    .map(x => x.trim())
                    .filter(Boolean)
                    .map((x): [string, string] =>
                        x.includes(",") && x.indexOf(",") < x.length / 2
                            ? [x.slice(x.indexOf(",") + 1).trim(), x.slice(0, x.indexOf(","))]
                            : [x, ""]
                    ),
            };
        });
}
export function uniClick(act: string, t: ActEl, k: string | undefined): boolean {
    const sid = curSid(),
        S = sid ? curS(sid) : undefined;
    switch (act) {
        case "uni-sub":
            ui.uniSub = k || "";
            renderMain();
            return true;
        case "uni-jump":
            ui.uniSub = k || "";
            goTab("curricula");
            scrollTo(0, 0);
            return true;
        case "uni-view":
            ui.uniView = k || "";
            renderMain();
            return true;
        case "uni-paste":
            ui.uniPaste = !ui.uniPaste;
            renderMain();
            return true;
        case "uni-topics":
            ui.uniTopics = !ui.uniTopics;
            renderMain();
            return true;
        case "uni-topic-del":
            if (S && k) {
                S.topics = S.topics.filter(x => x.id !== k);
                for (const p of S.progs) for (const m of p.modules) m.topics = (m.topics || []).filter(x => x !== k);
                delete S.chosen[k];
                markDirty();
            }
            return true;
        case "uni-fetch":
            openModal("lcimport", { cur: k, want: "modules", step: "link", url: "" });
            return true;
        case "uni-pick":
            if (S && k && t.dataset.b) {
                S.chosen[k] = t.dataset.b;
                markDirty();
            }
            return true;
        case "uni-del":
            if (S) {
                const before = clone(S.progs);
                S.progs = S.progs.filter(p => p.id !== k);
                markDirty();
                toast("Removed", {
                    label: "Undo",
                    fn: () => {
                        S.progs = before;
                        markDirty();
                    },
                });
            }
            return true;
        case "uni-tolib": {
            if (!S || !sid) return true;
            const { books } = uniData(sid),
                course = lcSub(sid);
            let n = 0;
            for (const tp of S.topics) {
                const kk = S.chosen[tp.id],
                    bk = kk && books[kk];
                if (!bk || findExisting(bk[0], bk[1], "book")) continue;
                addItem(
                    {
                        medium: "book",
                        kind: "Academic",
                        title: bk[0],
                        creator: bk[1],
                        subject: course ? course.name : "",
                        status: "want",
                        copy: "none",
                    },
                    "Add " + bk[0]
                );
                n++;
            }
            toast(n ? `Added ${plural(n, "book")} to the Learning Centre` : "They're all in your library already");
            return true;
        }
        // your picks join the course's reading order: one thread per area, in the order the topics are listed; each book waits
        // for the one before it in its area to be underway. Books already in the course stay as they are.
        case "uni-topath": {
            if (!S || !sid) return true;
            const { books } = uniData(sid),
                course = lcSub(sid),
                areas = [...new Set(S.topics.map(t => t.area || "Topics"))];
            if (!course) return true;
            const P = coursePath(course),
                before = P.books.length;
            if (!before) P.view = "map";
            P.threads = [...new Set([...(P.threads || []), ...areas])];
            for (const a of areas) {
                let prev: string | null = null;
                for (const tp of S.topics.filter(x => (x.area || "Topics") === a)) {
                    const kk = S.chosen[tp.id],
                        bk = kk && books[kk];
                    if (!bk) continue;
                    // already in the course (picked before, or on a reading list under another id): that one is used
                    const had = P.books.find(b => b.id === kk || norm(b.t) === norm(bk[0]));
                    if (had) {
                        prev = had.id;
                        continue;
                    }
                    P.books.push({
                        id: kk,
                        t: bk[0],
                        a: bk[1],
                        th: a,
                        st: "todo",
                        note: "",
                        where: tp.name,
                        after: prev ? [{ k: prev, s: "start" }] : [],
                    });
                    prev = kk;
                }
            }
            markDirty();
            ui.pwId = P.id;
            ui.learnSub = P.sub;
            goTab("learn");
            const added = P.books.length - before;
            toast(
                added
                    ? `Added ${plural(added, "pick")} to ${course.name}`
                    : `Your picks are all in ${course.name} already`
            );
            return true;
        }
    }
    return false;
}
// imports: two curricula of the same course meet (programmes, topics and books join; your picks win)
export function lcMergeCurricula(
    cur: Record<string, Curriculum>,
    inc: Record<string, Curriculum> | undefined
): Record<string, Curriculum> {
    const out = { ...cur };
    for (const [sid, c] of Object.entries(inc || {})) {
        const m = out[sid];
        if (!m) {
            out[sid] = c;
            continue;
        }
        const by = <T extends { id: string }>(a: T[], b: T[] | undefined) => [
            ...a,
            ...(b || []).filter(x => !a.some(y => y.id === x.id)),
        ];
        out[sid] = {
            topics: by(m.topics, c.topics),
            books: { ...(c.books || {}), ...m.books },
            progs: by(m.progs, c.progs),
            chosen: { ...(c.chosen || {}), ...m.chosen },
            extra: { ...(c.extra || {}), ...m.extra },
            hide: [...new Set([...(m.hide || []), ...(c.hide || [])])],
        };
    }
    return out;
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initLearningCurricula() {
    // the overview's block (drawn by pages/CurriculaMini.svelte)
    BLOCKS.courses = { name: "Curricula", d: "The books you picked from the programmes you compare", w: 8 };
}
