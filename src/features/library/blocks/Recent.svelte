<!--
    src/features/library/blocks/Recent.svelte
    ─────────────────────────────────────────────────────────────────
      The Recently ended block: what you finished or dropped lately, newest first.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { endedAt } from "../../core/views";
    import type { OvBlock } from "../blocks";
    import CoverTile from "../tiles/CoverTile.svelte";

    let { c }: { c: OvBlock } = $props();

    const R = $derived(
        c.M.filter(b => endedAt(b))
            .sort((a, b) => String(endedAt(b)).localeCompare(String(endedAt(a))))
            .slice(0, c.n)
    );
</script>

{#if R.length}<div class="strip">{#each R as b, i (i + b.id)}<CoverTile {b} sel={store.ui.sel.has(b.id)} />{/each}</div>{:else}<p class="hint">Nothing finished yet.</p>{/if}
