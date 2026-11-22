<!--
    src/features/insights/pages/SeriesPage.svelte
    ─────────────────────────────────────────────────────────────────
      Series (the Literature mode's tab): trilogies and long series, kept as separate books and shown together in
      order, with how many you've finished and the next one. seriesGroups() in mode-pages.ts finds them (a Series name,
      "(Series, #2)" in a title, or sequels you linked), as it does for the overview's Series block.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { cleanTitle, STATUS_WORDS, titleOf } from "../../core/core";
    import { groupWord, modeItems } from "../../core/views";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import Cover from "../../library/tiles/Cover.svelte";
    import { seriesGroups } from "../mode-pages";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        void store.ui;
        return { G: seriesGroups(modeItems()), done: STATUS_WORDS[groupWord()].done.toLowerCase() };
    });
</script>

<HiddenNote />
<div class="ph"><div class="ttl"><p>Trilogies and long series stay separate books, shown together in order. Set a book's series in Edit details, or link sequels in Connections; "(Series, #2)" in a title is picked up too.</p></div></div>
{#each v.G as g}<section class="panel series"><h3>{g.name} <span class="r hint">{g.done} of {g.items.length} {v.done}</span></h3>
    <div class="prog"><span style="width:{Math.round(((g.done || 0) / g.items.length) * 100)}%"></span></div>
    <div class="sstack">{#each g.items as { b, n } (b.id)}<button class="sitem{b.status === 'done' ? ' done' : g.next && g.next.b.id === b.id ? ' next' : ''}" data-act="open" data-id={b.id}><Cover {b} /><span class="hint">{n != null ? "#" + n : b.year || ""}</span></button>{/each}</div>
    {#if g.next}<p class="hint">Next: <button class="linkbtn" data-act="open" data-id={g.next.b.id}>{cleanTitle(titleOf(g.next.b))}</button></p>{:else}<p class="hint">All done.</p>{/if}</section>{:else}<div class="empty"><h3>No series yet</h3><p>Give two or more books the same Series name in Edit details.</p></div>{/each}
