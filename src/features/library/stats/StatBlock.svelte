<!--
    src/features/library/stats/StatBlock.svelte
    ─────────────────────────────────────────────────────────────────
      The stats page's blocks that aren't charts of rows: the totals, finished per month and hours per week (stacked
      by kind), the activity grid, your highest scores, and you against the crowd. Each works its numbers out in
      statblocks.ts (statLook).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { fmtScore, scaleOf, titleOf } from "../../core/core";
    import { crowd } from "../../core/views";
    import type { Entry } from "../../core/model";
    import { statLook, type StBlock } from "../statblocks";
    import Cover from "../tiles/Cover.svelte";
    import CoverTile from "../tiles/CoverTile.svelte";
    import Heat from "../blocks/Heat.svelte";
    import StackChart from "./StackChart.svelte";
    import Legend from "./Legend.svelte";

    let { c }: { c: StBlock } = $props();

    const x = $derived(statLook(c));
</script>

{#snippet row(b: Entry & { d: number })}<button class="drow" data-act="open" data-id={b.id}><Cover {b} /><span class="t">{titleOf(b)}</span><span class="num">you {fmtScore(b.rating, scaleOf(b))}</span><span class="num">crowd {crowd(b).avg}</span><span class="num {b.d >= 0 ? 'up' : 'down'}">{b.d >= 0 ? "+" : "−"}{Math.abs(Math.round(b.d))}</span></button>{/snippet}
{#if x.k === "tiles"}<div class="tiles"><div class="tile"><div class="v">{x.n}</div><div class="k">Items</div></div><div class="tile"><div class="v">{x.fin}</div><div class="k">Finished</div></div><div class="tile"><div class="v">{x.year}</div><div class="k">This year</div></div>
    <div class="tile"><div class="v">{x.days}</div><div class="k">Days spent</div></div><div class="tile"><div class="v">{x.mean}</div><div class="k">Mean score</div></div><div class="tile"><div class="v">{x.streak}<span class="hint" style="font-size:14px">{` / ${x.longest}`}</span></div><div class="k">Streak / longest</div></div></div>{:else if x.k === "stack"}<Legend present={x.present} /><StackChart data={x.cols} fmt={x.fmt} unit={x.unit} />{:else if x.k === "heat"}<Heat byDay={c.st.byDay} />{:else if x.k === "loved"}{#if x.top.length}<div class="strip">{#each x.top as b, i (i + b.id)}<CoverTile {b} sel={store.ui.sel.has(b.id)} />{/each}</div>{:else}<p class="hint">Score a few things.</p>{/if}{:else if x.k === "crowd"}{#if x.lovesMore.length}<p class="label sub">You love more</p>{#each x.lovesMore as b, i (i + b.id)}{@render row(b)}{/each}<p class="label sub">The crowd loves more</p>{#each x.lovesLess as b, i (i + b.id)}{@render row(b)}{/each}{:else}<p class="hint">Scores from other sites fill this in.</p>{/if}{/if}
