<!--
    src/features/library/blocks/Bars.svelte
    ─────────────────────────────────────────────────────────────────
      Horizontal bars, everywhere the app draws them: rows of a label, a bar as long as its share of the largest and
      its number (Insights' drop-offs and times, Playing's platforms, the overview's and Stats' charts), or, given
      rates, how often you finish what you start, by genre, theme or type, with the line for your overall rate.
      A row's colour, when it has one, is its bar's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { fmtScore } from "../../core/core";
    import type { FinishRate } from "../../insights/mode-pages";
    import { barsLook, plain, type Fmt, type Row } from "./charts";

    let {
        rows = [],
        fmt = plain,
        rates = null,
        mean = 0,
    }: { rows?: (Row & { colour?: string })[]; fmt?: Fmt; rates?: FinishRate[] | null; mean?: number } = $props();

    const bars = $derived(rates ? [] : barsLook(rows, fmt));
    const rateRows = $derived(
        (rates || []).map(r => ({
            ...r,
            note: `${r.done}/${r.n}${r.drop ? ` · ${r.drop} dropped` : ""}${r.avg ? ` · avg ${fmtScore(Math.round(r.avg * 10) / 10)}` : ""}`,
        }))
    );
</script>

{#if rates}<div class="ratebars">{#each rateRows as r, i (i + r.k)}<div class="rb"><span class="l">{r.k}</span><span class="b"><span style="width:{r.pct}%"></span>{#if mean}<i style="left:{mean}%" title="Your overall rate: {mean}%"></i>{/if}</span><span class="v">{r.pct}%</span><span class="hint">{r.note}</span></div>{/each}</div>{:else}<div class="hbars">{#each bars as r, i (i + r.l)}<div><span>{r.sub ? r.l + " " : r.l}{#if r.sub}<small class="hint">· {r.sub}</small>{/if}</span><span class="b"><span style="width:{r.w}%;{r.colour ? 'background:' + r.colour : ''}"></span></span><span class="v">{r.text}</span></div>{/each}</div>{/if}
