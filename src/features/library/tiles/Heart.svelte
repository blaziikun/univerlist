<!--
    src/features/library/tiles/Heart.svelte
    ─────────────────────────────────────────────────────────────────
      The favourite heart on a tile, and its score tag and parts badge beside it: shared by Card and CoverTile.
      The heart is pressed through data-act="fav-toggle" (library/item-handlers.ts), like the older tiles'.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../../core/Icon.svelte";
    import { heartTitle, partsCount, scoreLook } from "./tiles";
    import { tilesWatch } from "./watch";
    import type { Entry } from "../../core/model";

    let { b }: { b: Entry } = $props();

    const score = $derived.by(() => {
        tilesWatch();
        return scoreLook(b);
    });
    const parts = $derived.by(() => {
        tilesWatch();
        return partsCount(b);
    });
</script>

{#if score}<span class="sctag{score.avg ? ' avg' : ''}" title={score.avg ? "Average of its parts" : "Your score"}>{score.text}</span>{/if}{#if parts}<span class="partsb" title="{parts} parts in one entry">{parts}</span>{/if}<span class="heart{b.fav ? ' on' : ''}" data-act="fav-toggle" data-id={b.id} aria-hidden="true" title={heartTitle(b)}><Icon name={b.fav ? "heart" : "heartLine"} /></span>
