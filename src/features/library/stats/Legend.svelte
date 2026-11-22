<!--
    src/features/library/stats/Legend.svelte
    ─────────────────────────────────────────────────────────────────
      A stacked chart's key: the kinds of thing it has, each with its colour.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { SERIES } from "../../core/core";

    let { present }: { present: unknown[] } = $props();
</script>

<div class="legend">{#each SERIES as s, i (s[0])}{#if present[i]}<span><i style="background:var(--s{i + 1})"></i>{s[1]}</span>{/if}{/each}</div>
