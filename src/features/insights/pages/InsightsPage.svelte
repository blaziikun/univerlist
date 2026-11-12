<!--
    src/features/insights/pages/InsightsPage.svelte
    ─────────────────────────────────────────────────────────────────
      Insights (a mode's "discover" tab): what your own library says, then where to look further. How often you finish
      what you start, your taste read closely, finishing by genre, theme and type, where you drop off, how long things
      take you, what's waited longest, the searches for new things (Discover), and what to read next from your own
      backlog. insightsView() in mode-pages.ts works it out. Look further opens Discover on that search, which is this
      page's own button.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { cleanTitle, curMode, fmtDate, titleOf } from "../../core/core";
    import { openModal } from "../../core/modals";
    import Bars from "../../library/blocks/Bars.svelte";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import Cover from "../../library/tiles/Cover.svelte";
    import TasteRead from "./TasteRead.svelte";
    import { insightsView } from "../mode-pages";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        void store.ui;
        return insightsView();
    });
    function discover(k: string) {
        openModal("discover", { mode: k, shelf: (curMode().match || []).includes("book:Academic") ? "academic" : "fiction" });
    }
</script>

<HiddenNote />
{#if !v.started}<div class="empty"><h3>Nothing to read yet</h3><p>Start or finish a few things and this fills in: how often you finish what you start, by genre, theme and type, and how long things take you.</p></div>
    <section class="panel"><h3>Look further</h3>{@render engines()}</section>{:else}<div class="ph"><div class="ttl"><p>What your own library says: how often you finish what you start, where you drop off, and how long things take you. Then where to look further.</p></div></div>
    <div class="ihero"><div><b>{v.mean}%</b><span>of what you start, you finish</span></div><div><b>{v.done}</b><span>finished</span></div><div><b>{v.dropped}</b><span>dropped</span></div><div><b>{v.waiting}</b><span>waiting</span></div></div>
    <div class="dash"><TasteRead />
        {#if v.byG.length}<section class="panel span6"><h3>Finished, by genre</h3><p class="hint">The line is your overall rate.</p><Bars rates={v.byG} mean={v.mean} /></section>{/if}
        {#if v.byT.length}<section class="panel span6"><h3>Finished, by theme</h3><p class="hint">Themes from AniList, TMDB and IGDB.</p><Bars rates={v.byT} mean={v.mean} /></section>{/if}
        {#if v.byK.length > 1}<section class="panel span6"><h3>Finished, by type</h3><Bars rates={v.byK} mean={v.mean} /></section>{/if}
        {#if v.drops.length}<section class="panel span6"><h3>Where you drop off</h3><Bars rows={v.drops.map(r => ({ l: r.k, v: Math.round((r.drop / r.n) * 100) }))} fmt={x => x + "%"} /></section>{/if}
        {#if v.take.length}<section class="panel span6"><h3>How long things take you</h3><p class="hint">Middle time from starting to finishing.</p><Bars rows={v.take.map(([k, d]) => ({ l: k, v: d }))} fmt={x => (x === 1 ? "1 day" : x + " days")} /></section>{/if}
        {#if v.old.length}<section class="panel span6"><h3>Waiting longest</h3><div class="mini">{#each v.old as b (b.id)}<button data-act="open" data-id={b.id}><span class="t">{cleanTitle(titleOf(b))}</span><span class="hint">added {fmtDate(b.addedAt)}</span></button>{/each}</div></section>{/if}
        <section class="panel span6"><h3>Look further</h3>{@render engines()}</section>
        {#if v.next.length}<section class="panel span12"><h3>From your own backlog</h3><div class="nexts row">{#each v.next as { b, why } (b.id)}<button class="nx" data-act="open" data-id={b.id}><Cover {b} /><span><b>{titleOf(b)}</b><small>{why}</small></span></button>{/each}</div></section>{/if}
    </div>{/if}

{#snippet engines()}{#each v.engines as [k, l, d] (k)}<button class="engine" data-act="disc-open" data-k={k} onclick={() => discover(k)}><b>{l}</b><small>{d}</small></button>{/each}{/snippet}
