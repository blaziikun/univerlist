// src/features/insights/taste.ts
// ─────────────────────────────────────────────────────────────────
//  Your taste, read closely: what lifts your scores, what sinks them, and where to go next
//
//  Everything here is worked out from your own scores, genres and themes (AniList's tags, TMDB and IGDB's keywords);
//  "find more" then asks AniList for the best-rated things carrying that exact mix, so the crowd's view comes in only
//  at the end.
// ─────────────────────────────────────────────────────────────────

import { addItem, inMode, isRecord, items, listOf, MEDIA, toast, ui, undo } from "../core/core";
import { AL, AL_MEDIA, alToFields } from "../sources/sources";
import { isUniversal, modeItems } from "../core/views";
import { renderMain } from "../core/shell";
import type { ActEl } from "../core/core";
import type { Entry, ItemDraft } from "../core/model";

/** an entry you've scored (the model only looks at those) */
type Scored = Entry & { rating: number };
const scored = (b: Entry): b is Scored => !!b.rating;
/** a genre ("g:…") or theme ("t:…"), and how far it moves your scores */
export interface Lift {
    f: string;
    name: string;
    kind: string;
    n: number;
    avg: number;
    lift: number;
    items: Scored[];
}
interface TasteModel {
    R: Scored[];
    mean: number;
    hi: number;
    lo: number;
    feat: (b: Entry) => string[];
    lift: Lift[];
}
function tasteModel(A: Entry[]): TasteModel {
    const R = A.filter(scored),
        mean = R.length ? R.reduce((a, b) => a + b.rating, 0) / R.length : 0,
        sorted = R.map(b => b.rating).sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0),
        hi = q(0.75),
        lo = q(0.3);
    const feat = (b: Entry) => [...(b.genres || []).map(g => "g:" + g), ...(b.themes || []).map(t => "t:" + t)];
    const F = new Map<string, { n: number; sum: number; items: Scored[] }>();
    for (const b of R)
        for (const f of feat(b)) {
            const e = F.get(f) || { n: 0, sum: 0, items: [] };
            e.n++;
            e.sum += b.rating;
            e.items.push(b);
            F.set(f, e);
        }
    const lift = [...F.entries()]
        .filter(([, e]) => e.n >= 3)
        .map(([f, e]) => ({
            f,
            name: f.slice(2),
            kind: f[0],
            n: e.n,
            avg: e.sum / e.n,
            lift: e.sum / e.n - mean,
            items: e.items.sort((a, b) => b.rating - a.rating),
        }));
    return { R, mean, hi, lo, feat, lift };
}
function tasteNuance(M: TasteModel) {
    // inside the genres you watch most: which themes your best share, and which your weakest share
    const out: { genre: string; avg: number; up: string[]; down: string[]; best: Scored[]; worst: Scored[] }[] = [];
    for (const g of M.lift
        .filter(x => x.kind === "g" && x.n >= 6)
        .sort((a, b) => b.n - a.n)
        .slice(0, 4)) {
        const H = g.items.filter(b => b.rating >= M.hi),
            L = g.items.filter(b => b.rating <= M.lo);
        if (H.length < 2 || L.length < 2) continue;
        const fr = (S: Scored[]) => {
            const c = new Map<string, number>();
            for (const b of S) for (const t of b.themes || []) c.set(t, (c.get(t) || 0) + 1 / S.length);
            return c;
        };
        const fh = fr(H),
            fl = fr(L),
            keys = new Set([...fh.keys(), ...fl.keys()]);
        const d = [...keys]
            .map((t): [string, number] => [t, (fh.get(t) || 0) - (fl.get(t) || 0)])
            .sort((a, b) => b[1] - a[1]);
        const up = d
                .filter(x => x[1] > 0.25)
                .slice(0, 3)
                .map(x => x[0]),
            down = d
                .filter(x => x[1] < -0.25)
                .slice(-3)
                .reverse()
                .map(x => x[0]);
        if (up.length || down.length)
            out.push({ genre: g.name, avg: g.avg, up, down, best: H.slice(0, 2), worst: L.slice(-2) });
    }
    return out;
}
function tastePairs(M: TasteModel) {
    // close cousins you scored far apart: the most telling pairs in your library
    const P: { a: Scored; b: Scored; shared: string[]; onlyA: string[]; onlyB: string[]; s: number }[] = [],
        R = M.R.slice()
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 220);
    for (let i = 0; i < R.length; i++)
        for (let j = i + 1; j < R.length; j++) {
            const a = R[i],
                b = R[j];
            if (a.rating - b.rating < 2.5 || MEDIA[a.medium].group !== MEDIA[b.medium].group) continue;
            const fa = new Set(M.feat(a)),
                fb = M.feat(b),
                shared = fb.filter(f => fa.has(f));
            if (shared.length < 4) continue;
            P.push({
                a,
                b,
                shared,
                onlyA: [...fa].filter(f => f[0] === "t" && !fb.includes(f)).slice(0, 3),
                onlyB: fb.filter(f => f[0] === "t" && !fa.has(f)).slice(0, 3),
                s: shared.length + (a.rating - b.rating),
            });
        }
    const used = new Set<string>();
    return P.sort((x, y) => y.s - x.s)
        .filter(p => {
            if (used.has(p.a.id) || used.has(p.b.id)) return false;
            used.add(p.a.id);
            used.add(p.b.id);
            return true;
        })
        .slice(0, 4);
}
function tasteClusters(M: TasteModel) {
    // the mixes that keep turning up among your favourites: pairs of genres and themes that travel together in your top quarter
    const top = M.R.filter(b => b.rating >= M.hi),
        c = new Map<string, { n: number; items: Scored[] }>();
    for (const b of top) {
        const f = M.feat(b).filter(x => M.lift.some(l => l.f === x && l.lift > 0));
        for (let i = 0; i < f.length; i++)
            for (let j = i + 1; j < f.length; j++) {
                const k = [f[i], f[j]].sort().join("|");
                const e = c.get(k) || { n: 0, items: [] };
                e.n++;
                e.items.push(b);
                c.set(k, e);
            }
    }
    const used = new Set<string>();
    return [...c.entries()]
        .filter(([, e]) => e.n >= 3)
        .sort((a, b) => b[1].n - a[1].n)
        .filter(([k]) => {
            const [x, y] = k.split("|");
            if (used.has(x) && used.has(y)) return false;
            used.add(x);
            used.add(y);
            return true;
        })
        .slice(0, 5)
        .map(([k, e]) => ({ parts: k.split("|"), n: e.n, items: e.items.slice(0, 4) }));
}
export const featName = (f: string) => f.slice(2);
/** Your taste, read closely (TasteRead.svelte shows it): from your scores in this mode, what lifts them and what sinks
 *  them, the themes that set your best apart inside your main genres, close cousins you scored far apart, and the
 *  mixes that keep turning up among your favourites. Null until there are a dozen scores to read */
export function tasteView() {
    const M = tasteModel(modeItems());
    if (M.R.length < 12) return null;
    return {
        n: M.R.length,
        mean: M.mean,
        likes: M.lift
            .filter(x => x.lift > 0.35)
            .sort((a, b) => b.lift * Math.sqrt(b.n) - a.lift * Math.sqrt(a.n))
            .slice(0, 8),
        cools: M.lift
            .filter(x => x.lift < -0.35)
            .sort((a, b) => a.lift * Math.sqrt(a.n) - b.lift * Math.sqrt(b.n))
            .slice(0, 6),
        nu: tasteNuance(M),
        pairs: tastePairs(M),
        cl: tasteClusters(M),
    };
}
/** a line of the reading, in pieces: plain words, a theme in italics, or one of your entries (a link to it). Plain words
 *  next to each other are one piece, so the line is laid out as one run of text, as it was drawn as HTML */
export type TastePiece = { t: string } | { em: string } | { b: Entry };
function pieces(parts: (string | TastePiece)[]): TastePiece[] {
    const out: TastePiece[] = [];
    for (const p of parts) {
        const last = out[out.length - 1];
        if (typeof p === "string") {
            if (last && "t" in last) last.t += p;
            else out.push({ t: p });
        } else out.push(p);
    }
    return out.filter(p => !("t" in p) || p.t);
}
const joined = (L: Entry[], by: string) => L.flatMap((b, i) => (i ? [by, { b }] : [{ b }]));
/** the nuance in a genre, after its name: ": your best carry …; the ones you rate lowest lean on …. Think … over …." */
export function nuanceLine(x: ReturnType<typeof tasteNuance>[number]): TastePiece[] {
    return pieces([
        ": ",
        ...[
            x.up.length ? ["your best carry ", { em: x.up.join(", ") }] : [],
            x.down.length ? ["the ones you rate lowest lean on ", { em: x.down.join(", ") }] : [],
        ]
            .filter(c => c.length)
            .flatMap((c, i) => (i ? ["; ", ...c] : c)),
        ". ",
        ...(x.best.length ? ["Think ", ...joined(x.best, " and ")] : []),
        ...(x.worst.length ? [" over ", ...joined(x.worst, " or ")] : []),
        ".",
    ]);
}
/** what two close cousins share, and what only one has */
export function pairLine(p: ReturnType<typeof tastePairs>[number]) {
    return `Both ${
        p.shared
            .filter(f => f[0] === "g")
            .slice(0, 3)
            .map(featName)
            .join(", ") || "share a lot"
    }. ${p.onlyA.length ? `Only the first has ${p.onlyA.map(featName).join(", ")}` : ""}${p.onlyA.length && p.onlyB.length ? "; " : ""}${p.onlyB.length ? `only the second has ${p.onlyB.map(featName).join(", ")}` : ""}.`;
}
/** "Find more" on a mix: AniList's best-rated with exactly those genres and tags, kept on ui.tasteMore[i] */
export async function tasteMore(i: number) {
    const M = tasteModel(modeItems()),
        c = tasteClusters(M)[i];
    if (!c) return;
    ui.tasteMore = { ...(ui.tasteMore || {}), [i]: { busy: true, res: [] } };
    renderMain();
    const g = c.parts.filter(f => f[0] === "g").map(featName),
        tg = c.parts.filter(f => f[0] === "t").map(featName);
    try {
        const d = await AL.q(
            `query($g:[String],$t:[String]){ Page(perPage: 24){ media(genre_in:$g, tag_in:$t, sort:[SCORE_DESC], isAdult:false, averageScore_greater: 70){ ${AL_MEDIA} } } }`,
            { g: g.length ? g : undefined, t: tg.length ? tg : undefined }
        );
        const have = new Set([...items.values()].map(b => (b.ext || {}).anilist).filter(Boolean));
        // AniList's answer: Page.media, each one read by alToFields
        const page = isRecord(d) && isRecord(d.Page) ? d.Page : {};
        const res = listOf(page.media)
            .map(m => ({ src: "anilist", ...alToFields(m) }))
            .filter(
                r =>
                    !have.has(r.ext?.anilist) &&
                    (isUniversal() || inMode({ medium: r.medium || "", kind: r.kind || "" }))
            );
        ui.tasteMore = { ...(ui.tasteMore || {}), [i]: { res } };
        ui.tasteRes = { ...(ui.tasteRes || {}), ...Object.fromEntries(res.map(r => [r.ext?.anilist, r])) };
    } catch (_) {
        ui.tasteMore = ui.tasteMore || {};
        ui.tasteMore[i] = {
            err: navigator.onLine ? "AniList didn't answer. Try again in a moment." : "This needs the internet.",
            res: [],
        };
    }
    renderMain();
}
export function tasteClick(act: string, _t: ActEl, k: string | undefined) {
    if (act === "taste-add") {
        const r = (ui.tasteRes || {})[k || ""];
        if (!r) return true;
        const data: ItemDraft = { ...r, status: "want", copy: "none", rating: 0, source: "anilist" };
        for (const x of ["src", "recs", "cast", "votes", "popularity"]) delete data[x];
        addItem(data, "Add " + r.title);
        toast(`Planned: ${r.title}`, { label: "Undo", fn: undo });
        for (const st of Object.values(ui.tasteMore || {}))
            if (st.res) st.res = st.res.filter(x => x.ext?.anilist !== r.ext?.anilist);
        renderMain();
        return true;
    }
    return false;
}
