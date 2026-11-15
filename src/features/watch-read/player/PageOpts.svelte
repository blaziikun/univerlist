<!--
    src/features/watch-read/player/PageOpts.svelte
    ─────────────────────────────────────────────────────────────────
      This page's settings (⚙ at the top right): the episodes as numbers or detailed rows (with pictures and
      descriptions, each optional), and the page's layout: each block (the seasons with their episodes, the
      description) under the player, on its right or its left, or off, in your order; and sequels together as one
      show's seasons or each on its own. Everything about the player itself is in its own ⚙. Its buttons go through
      their data-act (wp-*, stageClick in stage.ts); its boxes are its own. It closes on a click anywhere else.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { seasonsModeSet } from "../stage";
    import { cinSideRedraw, WP, wpSave } from "../watch";
    import { pageOptsView } from "./view";

    const v = $derived.by(() => {
        void stageNews.side;
        void stageNews.player;
        return pageOptsView();
    });
    function ticked(k: "thumbs" | "desc", on: boolean) {
        wpSave({ ...WP(), [k]: on });
        cinSideRedraw();
    }
    const PLACES: [string, string][] = [
        ["main", "Under"],
        ["side", "Right"],
        ["left", "Left"],
        ["off", "Off"],
    ];
</script>

<div class="cin-pop wpopts" role="dialog" aria-label="This page's settings"><p class="ilab">Episodes</p><div class="seg sm" role="group" aria-label="Episodes">{#each [["numbers", "Numbers"], ["detailed", "Detailed"]] as [k, l] (k)}<button data-act="wp-eps" data-k={k} aria-pressed={v.eps === k}>{l}</button>{/each}</div>{#if v.eps === "detailed"}<div class="wpo-ticks"><label class="ctl"><input type="checkbox" data-wp="thumbs" checked={v.thumbs} onchange={e => ticked("thumbs", e.currentTarget.checked)}> Pictures</label><label class="ctl"><input type="checkbox" data-wp="desc" checked={v.desc} onchange={e => ticked("desc", e.currentTarget.checked)}> Descriptions</label></div>{/if}<p class="ilab">Layout</p>{#each v.blocks as b (b.k)}<div class="wpo"><span>{b.name}</span><div class="seg sm" role="group" aria-label={b.name}>{#each PLACES as [x, l] (x)}<button data-act="wp-place" data-k={b.k} data-v={x} aria-pressed={b.place === x}>{l}</button>{/each}</div><button class="cb mv" data-act="wp-move" data-k={b.k} data-d="-1" disabled={b.first} aria-label="Earlier">↑</button><button class="cb mv" data-act="wp-move" data-k={b.k} data-d="1" disabled={b.last} aria-label="Later">↓</button></div>{/each}<div class="wpo"><span>Sequels</span><div class="seg sm" role="group" aria-label="Sequels">{#each [["together", "As seasons"], ["separate", "Each on its own"]] as [x, l] (x)}<button data-seasonsmode={x} aria-pressed={v.sequels === x} onclick={() => seasonsModeSet(x)}>{l}</button>{/each}</div></div><button class="linkbtn" data-act="wp-reset">Put everything back</button></div>
