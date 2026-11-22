<!--
    src/features/library/blocks/Chars.svelte
    ─────────────────────────────────────────────────────────────────
      The Characters block: your favourite characters from this mode, filling whole rows.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { OvBlock } from "../blocks";
    import { charsInMode } from "../connect";
    import CharTile from "../tiles/CharTile.svelte";

    let { c }: { c: OvBlock } = $props();

    const C = $derived((void c, charsInMode()));
</script>

{#if C.length}<div class="chargrid2 ov fillrows" data-rows={c.cfg.rows || 1}>{#each C as x, i (i + x.id)}<CharTile c={x} />{/each}</div>{:else}<p class="hint">Add characters from anything's Characters tab.</p>{/if}
