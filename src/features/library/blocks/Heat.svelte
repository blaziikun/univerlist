<!--
    src/features/library/blocks/Heat.svelte
    ─────────────────────────────────────────────────────────────────
      The activity grid: a square for every day of the last weeks, coloured by how long you spent that day (or marked
      when you only finished something). heatLook() in core/views.ts works it out, for heatHTML too.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { heatLook } from "../../core/views";

    let { byDay, weeks = 20 }: { byDay: Map<string, number>; weeks?: number } = $props();

    const H = $derived(heatLook(byDay, weeks));
</script>

<div style="overflow-x:auto"><div class="heat">{#each H as d, i (i)}<i title={d.title} style={d.style}></i>{/each}</div></div>
