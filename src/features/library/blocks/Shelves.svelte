<!--
    src/features/library/blocks/Shelves.svelte
    ─────────────────────────────────────────────────────────────────
      The Shelves block: each of the mode's shelves with how many, how many finished, the time and the mean score.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { fmtScore, shelvesOf } from "../../core/core";
    import { mediumStatsOf } from "../../core/views";
    import type { OvBlock } from "../blocks";

    let { c }: { c: OvBlock } = $props();

    const S = $derived(
        shelvesOf(c.mode).flatMap(s => {
            const x = mediumStatsOf(s.test);
            return x.n ? [{ s, x, days: x.min >= 1440 }] : [];
        })
    );
</script>

<div class="mstats">{#each S as { s, x, days }, i (i + s.key)}<button class="mstat" data-act="shelf" data-k={s.key}><b>{s.name}</b><span class="row"><span><em>{x.n}</em> total</span><span><em>{x.fin}</em> finished</span></span><span class="row"><span><em>{days ? (x.min / 1440).toFixed(1) : (x.min / 60).toFixed(0)}</em> {days ? "days" : "hours"}</span><span><em>{x.mean ? fmtScore(x.mean) : "–"}</em> mean</span></span></button>{/each}</div>
