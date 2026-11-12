<!--
    src/features/library/tiles/StatusPill.svelte
    ─────────────────────────────────────────────────────────────────
      Where an entry stands (In progress, Finished…), as a pill; nothing for something only planned. otherwise: drawn
      in its place for a planned one (statusPillLook in core/views.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Snippet } from "svelte";
    import type { Item } from "../../core/model";
    import { statusPillLook } from "../../core/views";

    let { b, otherwise }: { b: Item; otherwise?: Snippet } = $props();

    const p = $derived(statusPillLook(b));
</script>

{#if p}<span class={p.cls}>{p.word}</span>{:else if otherwise}{@render otherwise()}{/if}
