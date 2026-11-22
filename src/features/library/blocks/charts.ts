// src/features/library/blocks/charts.ts
// ─────────────────────────────────────────────────────────────────
//  What a chart shows, worked out once: bars, columns, a donut or a ranked list of rows, the bars either side of the
//  middle (you vs the crowd), and how often you finish what you start. Chart.svelte, Bars.svelte and GapChart.svelte
//  draw it; the stats page's older strings (chartOf in statblocks.ts) draw from the same functions until it moves.
//  A row's label is plain words, with an optional small note after it (a genre's "· 5 scored").
// ─────────────────────────────────────────────────────────────────

/** a chart's row: its label (and a small note after it), and a number */
export interface Row {
    l: string;
    sub?: string;
    v: number;
}
/** how a chart writes its numbers */
export type Fmt = (v: number) => string | number;
export const plain: Fmt = v => v;
/** a row's label as one line of plain text, for a tooltip or a screen reader */
const rowText = (r: Row) => (r.sub ? `${r.l} · ${r.sub}` : r.l);

const PAL = (i: number) => (i < 5 ? `var(--s${i + 1})` : `hsl(${(i * 47 + 200) % 360} 55% 58%)`);

export function barsLook<R extends Row>(rows: R[], fmt: Fmt = plain) {
    const max = Math.max(1, ...rows.map(r => r.v));
    return rows.map(r => ({ ...r, w: (r.v / max) * 100, text: String(fmt(r.v)) }));
}
export function colsLook(rows: Row[], fmt: Fmt = plain) {
    const max = Math.max(1, ...rows.map(r => r.v));
    return rows.map(r => ({
        ...r,
        title: `${rowText(r)}: ${fmt(r.v)}`,
        text: String(fmt(r.v)),
        h: Math.max(2, Math.round((r.v / max) * 100)),
        o: (0.45 + (0.55 * r.v) / max).toFixed(2),
    }));
}
export function donutLook(rows: Row[], fmt: Fmt = plain) {
    const tot = rows.reduce((a, r) => a + r.v, 0) || 1,
        R = 46,
        C = 2 * Math.PI * R;
    let acc = 0;
    return {
        R,
        total: String(fmt(tot)),
        label: rows.map(r => `${rowText(r)}: ${fmt(r.v)}`).join("; "),
        arcs: rows.map((r, i) => {
            const len = (r.v / tot) * C,
                off = acc;
            acc += len;
            return {
                ...r,
                colour: PAL(i % 12),
                dash: `${len} ${C - len}`,
                off: -off,
                title: `${rowText(r)}: ${fmt(r.v)}`,
                pct: Math.round((r.v / tot) * 100),
            };
        }),
    };
}
export function listLook(rows: Row[], fmt: Fmt = plain) {
    const tot = rows.reduce((a, r) => a + r.v, 0) || 1;
    return rows.map(r => ({ ...r, text: String(fmt(r.v)), pct: Math.round((r.v / tot) * 100) }));
}
/** above or below the crowd: each row's bar either side of the middle */
export function gapLook(rows: Row[]) {
    const max = Math.max(1, ...rows.map(r => Math.abs(r.v)));
    return rows.map(r => ({ ...r, neg: r.v < 0, w: (Math.abs(r.v) / max) * 50, text: `${r.v > 0 ? "+" : ""}${r.v}` }));
}

/** one column of a stacked chart: its label, and a value for each series */
export interface Column {
    l: string;
    v: number[];
}
/** a stacked column chart (finished per month, hours per week): its scale's lines, and each column's pieces, one per
 *  series (SERIES in core.ts: what kind of thing), with a tooltip saying what's in it */
export function stackLook(
    data: Column[],
    series: [string, string][],
    { h = 160, fmt = plain, unit = "" }: { h?: number; fmt?: Fmt; unit?: string } = {}
) {
    const w = 640,
        pad = 30,
        tot = (d: Column) => d.v.reduce((a, x) => a + x, 0),
        max = Math.max(1, ...data.map(tot)),
        bw = (w - pad) / data.length;
    const tipFor = (d: Column) =>
        `${d.l}: ` +
            series
                .map((s, k) => (d.v[k] ? `${s[1]} ${fmt(d.v[k])}${unit}` : ""))
                .filter(Boolean)
                .join(", ") || `${d.l}: none`;
    return {
        w,
        h,
        pad,
        bw,
        label: data.map(tipFor).join("; "),
        ticks: [0, max / 2, max].map(t => ({ y: h - (t / max) * (h - 10), text: String(fmt(t)) })),
        cols: data.map((d, i) => {
            let y = h;
            const x = pad + i * bw + bw * 0.16,
                bwid = bw * 0.68;
            const segs = d.v.flatMap((v, s) => {
                if (!v) return [];
                const bh = (v / max) * (h - 10);
                y -= bh;
                return [{ x, y, w: bwid, h: Math.max(0, bh), fill: `var(--s${s + 1})` }];
            });
            return {
                tip: tipFor(d),
                x: pad + i * bw,
                segs,
                label: data.length <= 14 || i % Math.ceil(data.length / 10) === 0 ? d.l : null,
                lx: pad + i * bw + bw / 2,
            };
        }),
    };
}
