<!--
    src/features/library/tiles/Card.svelte
    ─────────────────────────────────────────────────────────────────
      A library card: the cover with its score, parts and heart, the title and a line under it, and progress while
      it's in progress. Opens the entry (data-act="open"). The Grid view draws these, and so do the strips on the
      item card and Stats › Coming up.
      sel: picked while selecting several. badge: its place while ranking by dragging. mark: what a drag over it shows.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { titleOf } from "../../core/core";
    import Cover from "./Cover.svelte";
    import Heart from "./Heart.svelte";
    import { boxAttr, cardSub, progLook } from "./tiles";
    import { tilesWatch } from "./watch";
    import type { Entry } from "../../core/model";

    let { b, sel = false, badge = 0, mark = "" }: { b: Entry; sel?: boolean; badge?: number; mark?: string } =
        $props();

    const t = $derived.by(() => {
        tilesWatch();
        return { bx: boxAttr(b), prog: progLook(b), title: titleOf(b), sub: cardSub(b) };
    });
    const bx = $derived(t.bx);
    const prog = $derived(t.prog);
</script>

<button class="card{bx.cls}{sel ? ' sel' : ''}{mark}" data-act="open" data-id={b.id} data-oid={b.id} draggable="true" style={bx.st || undefined}><span class="check">✓</span>{#if badge}<span class="rkb">{badge}</span>{/if}<span class="cwrap"><Cover {b} /><Heart {b} /></span>
    <span class="t">{t.title}</span><span class="a">{t.sub}</span>
    {#if prog != null}<span class="prog" title="{prog}%"><span style="width:{prog}%"></span></span>{/if}</button>
