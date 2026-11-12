<!--
    src/features/insights/pages/GameCard.svelte
    ─────────────────────────────────────────────────────────────────
      A game you're playing: its cover, where you play it, hours played against hours to beat, and +1 h, +2 h and
      Beaten, from gameLook() in mode-pages.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { titleOf } from "../../core/core";
    import Cover from "../../library/tiles/Cover.svelte";
    import { gameLook } from "../mode-pages";
    import type { Entry } from "../../core/model";

    let { b }: { b: Entry } = $props();
    const g = $derived(gameLook(b));
</script>

<div class="gcard"><button class="gc" data-act="open" data-id={b.id}><Cover {b} /></button><div class="gb"><button class="t" data-act="open" data-id={b.id}>{titleOf(b)}</button>
    <span class="hint">{g.sub}</span>
    <div class="pg"><span>{b.prog || 0} h played</span>{#if b.total}<span>~{b.total} h to beat</span>{/if}</div>{#if g.pct != null}<div class="prog"><span style="width:{g.pct}%"></span></div>{/if}
    <div class="bar"><button class="btn sm" data-act="log-add" data-id={b.id} data-k="1">+1 h</button><button class="btn sm" data-act="log-add" data-id={b.id} data-k="2">+2 h</button><button class="btn sm ghost" data-act="finish" data-id={b.id}>Beaten</button></div></div></div>
