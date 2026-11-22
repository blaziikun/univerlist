<!--
    src/features/library/blocks/ChartBlock.svelte
    ─────────────────────────────────────────────────────────────────
      A block that's a chart: what it measures (for one you set up yourself), then its rows drawn the way it's set to
      (Chart.svelte), or either side of the middle (GapChart.svelte). The block says what it shows (its chart, in
      blocks.ts, statblocks.ts or custom-stats.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { ChartData } from "../blocks";
    import Chart from "./Chart.svelte";
    import GapChart from "./GapChart.svelte";

    let { type, data }: { type: string | undefined; data: ChartData } = $props();
</script>

{#if data.desc}<p class="hint statdesc">{data.desc}</p>{/if}{#if data.gap}<GapChart rows={data.rows} />{:else}<Chart {type} rows={data.rows} fmt={data.fmt} />{/if}
