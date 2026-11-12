<!--
    src/features/library/tiers/QuickRank.svelte
    ─────────────────────────────────────────────────────────────────
      Quick rank: the next unplaced entry, big, with a button (and a number key) per tier, Skip and Stop (tq-…,
      tiers.ts; the keys are TierListPage's).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import type { TierRow } from "../../core/model";
    import type { ChipLook } from "../tiers";

    let { c, left, rank, rows }: { c: ChipLook; left: number; rank: boolean; rows: TierRow[] } = $props();
</script>

<div class="tquick" role="dialog" aria-label="Quick rank"><div class="tqcard">{#if c.image}<Pic src={c.image} />{:else}<span class="noimg big">{c.name}</span>{/if}<b>{c.name}</b>{#if c.sub}<small>{c.sub}</small>{/if}<span class="hint">{left} left</span></div>
    <div class="tqbtns">{#if rank}<button class="btn" data-act="tq-place" data-k="0"><kbd>1</kbd> Add to the ranking</button>{:else}{#each rows.slice(0, 9) as r, i (i)}<button class="btn" data-act="tq-place" data-k={i} style="border-left:4px solid {r.color}"><kbd>{i + 1}</kbd> {r.label}</button>{/each}{/if}
        <button class="btn ghost" data-act="tq-skip"><kbd>→</kbd> Skip</button><button class="btn ghost" data-act="tq-stop"><kbd>Esc</kbd> Stop</button></div></div>
