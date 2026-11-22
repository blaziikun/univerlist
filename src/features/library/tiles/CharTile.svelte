<!--
    src/features/library/tiles/CharTile.svelte
    ─────────────────────────────────────────────────────────────────
      A favourite character's card: the picture with the name along the bottom (big: the name and where they're from
      underneath). Opens the character; what it shows comes from charTileLook() in connect.ts. drag: it can be dragged
      into another place (mark: the page's marks while it is, lists/reorder.svelte.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import type { FavChar } from "../../core/model";
    import { charTileLook } from "../connect";
    import { tilesWatch } from "./watch";

    let { c, drag = false, big = false, mark = "" }: { c: FavChar; drag?: boolean; big?: boolean; mark?: string } = $props();

    const t = $derived.by(() => {
        tilesWatch();
        return charTileLook(c);
    });
</script>

<div class="ctile2{big ? ' large' : ''}{mark}" draggable={drag ? "true" : undefined} data-charid={drag ? c.id : undefined}><button class="ctile" data-act="open-char" data-k={c.id} title={c.name}>{#if t.src}<Pic src={t.src} loading="lazy" />{:else}<span class="noimg">{c.name.charAt(0)}</span>{/if}<span class="nm">{c.name}</span></button>
    {#if big}<span class="t">{c.name}</span><span class="hint">{t.note}</span>{/if}</div>
