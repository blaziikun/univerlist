<!--
    src/features/library/tiles/CoverTile.svelte
    ─────────────────────────────────────────────────────────────────
      A cover tile: the Cover view's face-out cover, with its score, parts and heart, the title on hover (or under it),
      and a thin progress bar. Opens the entry (data-act="open"). The Cover view draws these, and so do the
      overview's and Stats' strips.
      sel, badge, mark: as on Card.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { titleOf } from "../../core/core";
    import Cover from "./Cover.svelte";
    import Heart from "./Heart.svelte";
    import { boxAttr, progLook, tileStyle } from "./tiles";
    import { tilesWatch } from "./watch";
    import type { Entry } from "../../core/model";

    let { b, sel = false, badge = 0, mark = "" }: { b: Entry; sel?: boolean; badge?: number; mark?: string } =
        $props();

    const t = $derived.by(() => {
        tilesWatch();
        return { bx: boxAttr(b), prog: progLook(b), title: titleOf(b), style: tileStyle(b) };
    });
    const bx = $derived(t.bx);
    const prog = $derived(t.prog);
</script>

<button class="fo{bx.cls}{sel ? ' sel' : ''}{mark}" data-act="open" data-id={b.id} data-oid={b.id} draggable="true" style={t.style}><span class="check">✓</span>{#if badge}<span class="rkb">{badge}</span>{/if}<Cover {b} /><Heart {b} /><span class="hov">{t.title}</span>{#if prog != null}<span class="foprog"><span style="width:{prog}%"></span></span>{/if}</button>
