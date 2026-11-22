<!--
    src/features/library/tiers/TierChip.svelte
    ─────────────────────────────────────────────────────────────────
      An entry on a tier list: its picture (or its name), its score, its name under it; as a row with its place when
      the list is ranked. Pressing it selects it (tl-sel, Shift for a run); it's dragged to a tier, or into place.
      mark: selected, being dragged, inside the box being drawn, or dragged over.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import type { ChipLook } from "../tiers";

    let { c, mark = "", n = -1 }: { c: ChipLook; mark?: string; n?: number } = $props();
</script>

{#if n < 0}<button class="tchip{mark}" draggable="true" data-tkey={c.key} data-act="tl-sel" data-k={c.key} title={c.title}>{#if c.image}<Pic src={c.image} loading="lazy" draggable="false" />{:else}<span class="noimg">{c.name.slice(0, 26)}</span>{/if}{#if c.score}<span class="tsc">{c.score}</span>{/if}<span class="tl">{c.name}</span></button>{:else}<div class="rkrow{mark}" draggable="true" data-tkey={c.key} data-act="tl-sel" data-k={c.key}><span class="rkn">{n + 1}</span>{#if c.image}<Pic src={c.image} loading="lazy" draggable="false" />{:else}<span class="noimg"></span>{/if}
    <span class="rkt"><b>{c.name}</b>{#if c.sub}<small>{c.sub}</small>{/if}</span>{#if c.score}<span class="rks">{c.score}</span>{/if}</div>{/if}
