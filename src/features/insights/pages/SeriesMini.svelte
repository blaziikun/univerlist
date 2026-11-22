<!--
    src/features/insights/pages/SeriesMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Series block: the series you're partway through (seriesGroups, as Series shows them), each with
      how many you've finished and its first books.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Entry } from "../../core/model";
    import Cover from "../../library/tiles/Cover.svelte";
    import { seriesGroups } from "../mode-pages";

    let { M }: { M: Entry[] } = $props();

    const G = $derived(
        seriesGroups(M)
            .filter(g => g.next)
            .slice(0, 4)
    );
</script>

{#each G as g, i (i + g.name)}<div class="serrow"><b>{g.name}</b><span class="hint">{g.done}/{g.items.length}</span><div class="sstack mini">{#each g.items.slice(0, 8) as { b }, j (j + b.id)}<button class="sitem{b.status === 'done' ? ' done' : ''}" data-act="open" data-id={b.id}><Cover {b} /></button>{/each}</div></div>{:else}<p class="hint">Series you're partway through show here.</p>{/each}
