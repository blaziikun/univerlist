<!--
    src/features/library/stats/Wrapped.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › Year in review: pick a year, and see how much you finished, the time it took, your top five, month by
      month, the year's genres and shelves, your first of the year and your favourites. wrappedLook() in
      insights/mode-pages.ts works it out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { wrappedLook } from "../../insights/mode-pages";
    import Cover from "../tiles/Cover.svelte";
    import Bars from "../blocks/Bars.svelte";

    const w = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return wrappedLook();
    });
</script>

<div class="wrapped">
    <div class="wbar"><div class="seg">{#each w.yrs as y (y)}<button data-act="wrap-year" data-k={y} aria-pressed={y === w.yr}>{y}</button>{/each}</div></div>
    {#if w.n}<section class="whero"><p class="eyebrow">{w.head}</p><h2>{w.title}</h2><p>{w.line}</p></section>
        {#if w.top.length}<section class="wtop"><p class="label">Your top {w.top.length}</p><div class="wpod">{#each w.top as x, i (i + x.b.id)}<button class="wp p{i + 1}" data-act="open" data-id={x.b.id}><span class="wn">{i + 1}</span><Cover b={x.b} /><b>{x.title}</b><small>{x.score}</small></button>{/each}</div></section>{/if}
        <div class="dash"><section class="panel span6"><h3>Month by month</h3><div class="ybars big">{#each w.months as m, i (i)}<span title={String(m.n)}><i style="height:{m.h}%"></i><small>{m.l}</small></span>{/each}</div></section>
            <section class="panel span6"><h3>Genres of the year</h3>{#if w.genres.length}<Bars rows={w.genres} />{:else}<p class="hint">No genres yet.</p>{/if}</section>
            {#if w.shelves}<section class="panel span6"><h3>By shelf</h3><Bars rows={w.shelves} /></section>{/if}
            <section class="panel span6"><h3>Firsts and favourites</h3><div class="mini">{#if w.first}<button data-act="open" data-id={w.first.id}><span class="t">First of the year: {w.first.title}</span><span class="hint">{w.first.date}</span></button>{/if}
                {#each w.favs as f, i (i + f.id)}<button data-act="open" data-id={f.id}><span class="t">♥ {f.title}</span><span class="hint">favourite</span></button>{/each}</div></section></div>{:else}<div class="empty"><h3>Nothing finished in {w.yr}</h3><p>Finish something and this fills in.</p></div>{/if}</div>
