<!--
    src/features/library/blocks/Revisits.svelte
    ─────────────────────────────────────────────────────────────────
      The Revisits block: what you've watched, read or played again, most often first.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import MediumDot from "../tiles/MediumDot.svelte";
    import { fmtScore, listOf, scaleOf, titleOf } from "../../core/core";
    
    import type { OvBlock } from "../blocks";

    let { c }: { c: OvBlock } = $props();

    const R = $derived(
        c.M.filter(b => (b.repeat || 0) > 0 || listOf(b.reads).length)
            .sort((a, b) => (b.repeat || 0) - (a.repeat || 0))
            .slice(0, c.n)
    );
</script>

{#if R.length}<div class="mini">{#each R as b, i (i + b.id)}<button data-act="open" data-id={b.id}><span class="t"><MediumDot m={b.medium} />{titleOf(b)}</span><span class="hint">×{(b.repeat || 0) + 1}{b.rating ? " · " + fmtScore(b.rating, scaleOf(b)) : ""}</span></button>{/each}</div>{:else}<p class="hint">Nothing revisited yet. "Watch again" on a card keeps the history.</p>{/if}
