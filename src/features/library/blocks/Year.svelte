<!--
    src/features/library/blocks/Year.svelte
    ─────────────────────────────────────────────────────────────────
      The This year block: what you finished each month this year, your best so far, and the way to Year in review.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import type { OvBlock } from "../blocks";
    import CoverTile from "../tiles/CoverTile.svelte";

    let { c }: { c: OvBlock } = $props();

    const v = $derived.by(() => {
        const yr = new Date().getFullYear(),
            Y = c.M.filter(b => b.status === "done" && b.finishedAt && new Date(b.finishedAt).getFullYear() === yr),
            byM = Array.from({ length: 12 }, (_, i) => Y.filter(b => new Date(b.finishedAt || "").getMonth() === i).length),
            mx = Math.max(1, ...byM);
        return {
            months: byM.map((n, i) => ({
                title: `${new Date(yr, i, 1).toLocaleDateString("en-GB", { month: "long" })}: ${n}`,
                h: Math.round((n / mx) * 100),
                l: "JFMAMJJASOND"[i],
            })),
            best: Y.filter(b => b.rating)
                .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                .slice(0, 4),
        };
    });
</script>

<div class="ybars">{#each v.months as m, i (i)}<span title={m.title}><i style="height:{m.h}%"></i><small>{m.l}</small></span>{/each}</div>
{#if v.best.length}<div class="strip tight">{#each v.best as b, i (i + b.id)}<CoverTile {b} sel={store.ui.sel.has(b.id)} />{/each}</div>{/if}<button class="linkbtn" data-act="stats-view" data-k="wrapped">Year in review</button>
