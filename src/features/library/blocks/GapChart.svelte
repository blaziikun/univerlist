<!--
    src/features/library/blocks/GapChart.svelte
    ─────────────────────────────────────────────────────────────────
      You against the crowd: for each row, a bar right of the middle where you score it above most people, left where
      below, and a line saying how it's worked out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { gapLook, type Row } from "./charts";

    let { rows }: { rows: Row[] } = $props();

    const G = $derived(gapLook(rows));
</script>

{#if !rows.length}<p class="hint">Nothing to show yet.</p>{:else}<div class="gapc">{#each G as r, i (i + r.l)}<div class="gr"><span class="gl">{r.l}</span><span class="gb"><i class={r.neg ? "neg" : "pos"} style="width:{r.w}%"></i></span><span class="gv">{r.text}</span></div>{/each}</div><p class="hint">Your score ×10 minus the crowd's, averaged. Right of centre: you like these more than most people do.</p>{/if}
