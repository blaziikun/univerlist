<!--
    src/features/library/page/EmptyLibrary.svelte
    ─────────────────────────────────────────────────────────────────
      What the library page says when there's nothing to show: an empty library (search to add, or import), a shelf
      with nothing on it yet, or filters nothing passes (with a button to clear them).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    let { total, base }: { total: number; base: number } = $props();
</script>

<div class="empty"><h3>{total ? "Nothing here" : "An empty shelf"}</h3><p>{base ? "Nothing matches these filters." : total ? "Nothing on this shelf yet." : `Search for anything in the bar at the top and press +, or import what you already track.`}</p><div class="bar" style="justify-content:center">{#if base}<button class="btn" data-act="clear-filters">Clear filters</button>{/if}<button class="btn gold" data-act="focus-search">Search to add</button><button class="btn" data-act="go-settings" data-k="io">Import</button></div></div>
