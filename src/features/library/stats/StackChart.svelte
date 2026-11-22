<!--
    src/features/library/stats/StackChart.svelte
    ─────────────────────────────────────────────────────────────────
      A stacked column chart: a column per month or week, each piece a kind of thing (its colour, SERIES), with the
      scale's lines and a tooltip per column. stackLook() in blocks/charts.ts works it out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { SERIES } from "../../core/core";
    import { plain, stackLook, type Column, type Fmt } from "../blocks/charts";

    let { data, fmt = plain, unit = "" }: { data: Column[]; fmt?: Fmt; unit?: string } = $props();

    const c = $derived(stackLook(data, SERIES, { fmt, unit }));
</script>

<svg class="chart" viewBox="0 0 {c.w} {c.h + 22}" role="img" aria-label={c.label}>{#each c.ticks as t, i (i)}<line class="gridl" x1={c.pad} x2={c.w} y1={t.y} y2={t.y} /><text x={c.pad - 6} y={t.y + 3} text-anchor="end">{t.text}</text>{/each}
    {#each c.cols as d, i (i)}<g class="col"><title>{d.tip}</title><rect class="hit" x={d.x} y="0" width={c.bw} height={c.h} />{#each d.segs as s, j (j)}<rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill} class="seg" />{/each}</g>{#if d.label != null}<text x={d.lx} y={c.h + 15} text-anchor="middle">{d.label}</text>{/if}{/each}</svg>
