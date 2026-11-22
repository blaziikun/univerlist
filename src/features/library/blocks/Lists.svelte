<!--
    src/features/library/blocks/Lists.svelte
    ─────────────────────────────────────────────────────────────────
      The Lists block: the first of your lists in this mode, or a way to make one.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { meta, ui } from "../../core/core";
    import { listInMode } from "../../core/shell";
    import type { OvBlock } from "../blocks";
    import { listCardLook } from "../connect";
    import ListCard from "../tiles/ListCard.svelte";

    let { c }: { c: OvBlock } = $props();

    const L = $derived(
        (void c,
        meta.lists
            .filter(l => listInMode(l) && !l.private === !ui.private)
            .slice(0, 6)
            .map(l => listCardLook(l.id, l.name, l.desc, l.ids, l.numbered ? "№" : "≡")))
    );
</script>

{#if L.length}<div class="frgrid">{#each L as x, i (i + x.id)}<ListCard c={x} />{/each}</div>{:else}<p class="hint">No lists yet. <button class="linkbtn" data-act="list-new">Make one</button></p>{/if}
