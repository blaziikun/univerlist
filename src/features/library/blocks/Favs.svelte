<!--
    src/features/library/blocks/Favs.svelte
    ─────────────────────────────────────────────────────────────────
      The Favourites block: your favourites in order, filling whole rows (as many rows as it's set to).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { favPos } from "../../core/views";
    import type { OvBlock } from "../blocks";
    import FavTile from "../tiles/FavTile.svelte";

    let { c }: { c: OvBlock } = $props();

    const F = $derived(c.M.filter(b => b.fav).sort((a, b) => favPos(a.id) - favPos(b.id)));
</script>

{#if F.length}<div class="favgrid ov fillrows{c.cfg.nonum ? ' nonum' : ''}" data-rows={c.cfg.rows || 2}>{#each F as b, i (i + b.id)}<FavTile {b} />{/each}</div>{:else}<p class="hint">Press the ♡ on any cover to add a favourite.</p>{/if}
