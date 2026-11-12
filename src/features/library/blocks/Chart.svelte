<!--
    src/features/library/blocks/Chart.svelte
    ─────────────────────────────────────────────────────────────────
      A chart of rows, drawn the way a block is set to: bars (Bars.svelte), columns, a donut or a ranked list.
      charts.ts works out each.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Bars from "./Bars.svelte";
    import { colsLook, donutLook, listLook, plain, type Fmt, type Row } from "./charts";

    let { type, rows, fmt = plain }: { type: string | undefined; rows: Row[]; fmt?: Fmt } = $props();

    const cols = $derived(type === "cols" ? colsLook(rows, fmt) : []),
        donut = $derived(type === "donut" ? donutLook(rows, fmt) : null),
        list = $derived(type === "list" ? listLook(rows, fmt) : []);
</script>

{#snippet label(r: Row)}{r.sub ? r.l + " " : r.l}{#if r.sub}<small class="hint">· {r.sub}</small>{/if}{/snippet}
{#if !rows.length}<p class="hint">Nothing to show yet.</p>{:else if type === "cols"}<div class="cols">{#each cols as r, i (i + r.l)}<span title={r.title}><em>{r.text}</em><i style="height:{r.h}%;opacity:{r.o}"></i><small>{@render label(r)}</small></span>{/each}</div>{:else if donut}<div class="donutwrap"><svg class="donut" viewBox="0 0 120 120" role="img" aria-label={donut.label}><g transform="rotate(-90 60 60)">{#each donut.arcs as a, i (i + a.l)}<circle r={donut.R} cx="60" cy="60" fill="none" stroke={a.colour} stroke-width="18" stroke-dasharray={a.dash} stroke-dashoffset={a.off}><title>{a.title}</title></circle>{/each}</g><text x="60" y="58" text-anchor="middle" class="dt1">{donut.total}</text><text x="60" y="74" text-anchor="middle" class="dt2">total</text></svg>
    <div class="dlegend">{#each donut.arcs as a, i (i + a.l)}<span><i style="background:{a.colour}"></i>{@render label(a)}<b>{a.pct}%</b></span>{/each}</div></div>{:else if type === "list"}<table class="lib small ranked"><tbody>{#each list as r, i (i + r.l)}<tr><td class="num">{i + 1}</td><td>{@render label(r)}</td><td class="num">{r.text}</td><td class="num hint">{r.pct}%</td></tr>{/each}</tbody></table>{:else}<Bars {rows} {fmt} />{/if}
