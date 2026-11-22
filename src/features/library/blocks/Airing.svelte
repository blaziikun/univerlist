<!--
    src/features/library/blocks/Airing.svelte
    ─────────────────────────────────────────────────────────────────
      The Coming up block: the next episodes and chapters of what you follow, soonest first (from AniList).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { airingList } from "../../core/views";
    import type { OvBlock } from "../blocks";
    import AirRow from "./AirRow.svelte";

    let { c }: { c: OvBlock } = $props();

    const A = $derived((void c, airingList().slice(0, 6)));
</script>

{#if A.length}<div class="airs">{#each A as b, i (i + b.id)}<AirRow {b} />{/each}</div>{:else}<p class="hint">Nothing you follow has a date yet.</p>{/if}
