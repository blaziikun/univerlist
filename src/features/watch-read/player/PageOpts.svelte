<!--
    src/features/watch-read/player/PageOpts.svelte
    ─────────────────────────────────────────────────────────────────
      "Customise this page" (⋯ beside the player): the episode list as numbers or detailed (with pictures and
      descriptions, each optional), where each block goes (under, beside or off) and in what order, sequels together
      as seasons or each on its own, and where each button sits (on the video, under it, hidden) and in what order. Its
      buttons go through their data-act (wp-*, stageClick in stage.ts); its boxes are its own.
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
        ["side", "Side"],
        ["off", "Off"],
    ];
    const SPOTS: [string, string][] = [
        ["video", "On video"],
        ["under", "Under"],
        ["off", "Hidden"],
    ];
</script>

{#snippet mv(act: "wp-move" | "wp-tool", k: string, first: boolean, last: boolean)}{#if act === "wp-move"}<button class="cb" data-act="wp-move" data-k={k} data-d="-1" disabled={first} aria-label="Earlier">↑</button><button class="cb" data-act="wp-move" data-k={k} data-d="1" disabled={last} aria-label="Later">↓</button>{:else}<button class="cb" data-act="wp-tool" data-k={k} data-d="-1" disabled={first} aria-label="Earlier">↑</button><button class="cb" data-act="wp-tool" data-k={k} data-d="1" disabled={last} aria-label="Later">↓</button>{/if}{/snippet}
<div class="wpopts panel" role="dialog" aria-label="Customise this page"><div class="wpo-h"><b>This page</b><button class="cb" data-act="wp-opts" aria-label="Close">✕</button></div>{" "}<div class="wpo-grid"><div>{" "}<p class="ilab">Episodes</p><div class="seg">{#each [["numbers", "Numbers"], ["detailed", "Detailed"]] as [k, l] (k)}<button data-act="wp-eps" data-k={k} aria-pressed={v.eps === k}>{l}</button>{/each}</div>{" "}{#if v.eps === "detailed"}<label class="ctl"><input type="checkbox" data-wp="thumbs" checked={v.thumbs} onchange={e => ticked("thumbs", e.currentTarget.checked)}> Pictures</label><label class="ctl"><input type="checkbox" data-wp="desc" checked={v.desc} onchange={e => ticked("desc", e.currentTarget.checked)}> Episode descriptions</label>{" "}{/if}<p class="ilab">Blocks</p>{#each v.blocks as b (b.k)}<div class="wpo"><span>{b.name}</span><div class="seg sm">{#each PLACES as [x, l] (x)}<button data-act="wp-place" data-k={b.k} data-v={x} aria-pressed={b.place === x}>{l}</button>{/each}</div>{@render mv("wp-move", b.k, b.first, b.last)}</div>{/each}{" "}<p class="ilab">Page</p>{" "}<div class="wpo-row"><span>Sequels</span><select class="sel" data-seasonsmode="1" aria-label="Sequels" value={v.sequels} onchange={e => seasonsModeSet(e.currentTarget.value)}><option value="together">Together, as seasons</option><option value="separate">Each on its own</option></select></div>{" "}</div><div>{" "}<p class="ilab">Buttons <button class="btn sm" data-act="wp-edit" style="margin-left:8px">Edit on the page…</button></p><div class="wpo-tools">{#each v.tools as t (t.k)}<div class="wpo"><span>{t.name}</span><div class="seg sm">{#each SPOTS as [x, l] (x)}<button data-act="wp-spot" data-k={t.k} data-v={x} aria-pressed={t.spot === x}>{l}</button>{/each}</div>{@render mv("wp-tool", t.k, t.first, t.last)}</div>{/each}</div>{" "}<button class="linkbtn" data-act="wp-reset">Put everything back</button>{" "}</div></div></div>
