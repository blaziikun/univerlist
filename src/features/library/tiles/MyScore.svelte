<!--
    src/features/library/tiles/MyScore.svelte
    ─────────────────────────────────────────────────────────────────
      Your score for an entry, on its scale; nothing when you haven't scored it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { fmtScore, scaleOf } from "../../core/core";
    import type { Item } from "../../core/model";

    let { b }: { b: Item } = $props();
</script>

{#if b.rating}<span class="myscore" title="Your score">{fmtScore(b.rating, scaleOf(b))}</span>{/if}
