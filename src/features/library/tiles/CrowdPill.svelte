<!--
    src/features/library/tiles/CrowdPill.svelte
    ─────────────────────────────────────────────────────────────────
      The crowd's score for an entry, out of 100, with each site's own on hover (crowdLook in core/views.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Item } from "../../core/model";
    import { crowdLook } from "../../core/views";

    let { b }: { b: Item } = $props();

    const c = $derived(crowdLook(b));
</script>

{#if c}<span class="crowd" title={c.title}>{c.avg}</span>{/if}
