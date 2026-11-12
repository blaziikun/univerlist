<!--
    src/features/library/tiles/FavTile.svelte
    ─────────────────────────────────────────────────────────────────
      A favourite's tile: its picture (the art you chose for it, else its cover), its place among your favourites, and
      its title on hover. Opens the entry; what it shows comes from favTileLook() in connect.ts. drag: it can be dragged
      into another place (mark: the page's marks while it is, lists/reorder.svelte.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import type { Entry } from "../../core/model";
    import { favTileLook } from "../connect";
    import Cover from "./Cover.svelte";
    import { tilesWatch } from "./watch";

    let { b, drag = false, mark = "" }: { b: Entry; drag?: boolean; mark?: string } = $props();

    const t = $derived.by(() => {
        tilesWatch();
        return favTileLook(b);
    });
</script>

<div class="ftile2{mark}" draggable={drag ? "true" : undefined} data-favid={drag ? b.id : undefined}><button class="cwrap" data-act="open" data-id={b.id} title={t.title}><span class="rk">{t.rk}</span>{#if t.src}<Pic src={t.src} loading="lazy" />{:else}<Cover {b} />{/if}<span class="hov">{t.title}</span></button></div>
