// src/features/learning-centre/learning-hub.ts
// ─────────────────────────────────────────────────────────────────
//  Learning Centre: a course is a hub
//
//  Everything about one course in one place: your level in its fields and how much of it you've actually finished
//  (mastery), its pathways (opened right here), what it takes to graduate from each programme, the best books (crème de
//  la crème), the few best places to learn it (universities, certifications and independent ones, each with a link to
//  check), and opportunities you're keeping an eye on. Modules can wait on other modules, and topics on other topics.
//  This is what the hub works out and its buttons; pages/ draws it (Mastery, Creme, Sources, Opportunities.svelte).
// ─────────────────────────────────────────────────────────────────

import { markDirty } from "../core/core";
import type { ActEl } from "../core/core";
import type { Course, Courses, PathModule, PathTopic, Pathway } from "../core/model";
import { LSUBS, lcTopics, pwCur, pwState, subjPaths } from "./learning";

// ── mastery: what you've finished, not what you rate yourself ──
export function lcMastery(S: Course) {
    const P = subjPaths(S);
    let td = 0,
        tn = 0,
        bd = 0,
        bn = 0;
    for (const p of P) {
        const t = lcTopics(p);
        td += t.done;
        tn += t.n;
        const core = p.books.filter(b => !b.ref && !b.opt);
        bn += core.length;
        bd += core.filter(b => pwState(b) === "done").length;
    }
    const parts = [tn ? td / tn : null, bn ? bd / bn : null].filter(x => x != null);
    const pct = parts.length ? Math.round((parts.reduce((a, x) => a + x, 0) / parts.length) * 100) : 0;
    return { pct, td, tn, bd, bn, level: pct >= 95 ? 4 : pct >= 70 ? 3 : pct >= 35 ? 2 : pct > 0 ? 1 : 0 };
}
// ── modules waiting on modules, topics waiting on topics ──
export const lcModDone = (m: PathModule | undefined) => !!m && (m.status === "done" || m.status === "dropped");
/** the modules a module waits on that aren't done yet */
export function lcModWaits(P: Pathway, m: PathModule): PathModule[] {
    return (m.after || [])
        .map(id => (P.modules || []).find(x => x.id === id))
        .filter((x): x is PathModule => !!x && !lcModDone(x));
}
/** the topics a topic waits on that aren't covered yet */
export function lcTopicWaits(P: Pathway, t: PathTopic): string[] {
    if (!(t.after || []).length) return [];
    const T = lcTopics(P).T;
    return (t.after || []).filter(n => T[n] && !T[n].done);
}
export function lcHubClick(act: string, _t: ActEl, k: string | undefined): boolean {
    const P = pwCur();
    switch (act) {
        case "lc-src-del": {
            const s = LSUBS().find(x => (x.sources || []).some(y => y.id === k));
            if (s) {
                s.sources = (s.sources || []).filter(y => y.id !== k);
                markDirty();
            }
            return true;
        }
        case "lc-opp-del": {
            const s = LSUBS().find(x => (x.opps || []).some(y => y.id === k));
            if (s) {
                s.opps = (s.opps || []).filter(y => y.id !== k);
                markDirty();
            }
            return true;
        }
        case "lc-stage-spec":
            if (P) {
                const s = (P.stages || []).find(x => x.id === k);
                if (s) {
                    s.spec = !s.spec || undefined;
                    markDirty();
                }
            }
            return true;
    }
    return false;
}
// Opportunities are personal: they never go into a pack of chosen parts (packs.ts), only your own whole backup
// ("Download everything", the library folder: export-zip.ts) and your synced library
export const lcStripPersonal = (C: Courses): Courses => ({
    ...C,
    subjects: (C.subjects || []).map(s => {
        const { opps: _opps, ...rest } = s;
        return rest;
    }),
});
