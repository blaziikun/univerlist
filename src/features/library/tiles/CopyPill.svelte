<!--
    src/features/library/tiles/CopyPill.svelte
    ─────────────────────────────────────────────────────────────────
      Whether you own an entry (Owned, Digital) or mean to buy it, as a pill (copyPillLook in core/views.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Item } from "../../core/model";
    import { copyPillLook } from "../../core/views";

    let { b }: { b: Item } = $props();

    const p = $derived(copyPillLook(b));
</script>

{#if p}<span class={p.cls}>{p.word}</span>{/if}
