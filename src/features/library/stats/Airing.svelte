<!--
    src/features/library/stats/Airing.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › Coming up: the next episodes and chapters of what you follow (from AniList, TVmaze and TMDB), refreshed
      on request (airing-refresh), and what's still releasing without a date.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { airingLook } from "../../core/views";
    import AirRow from "../blocks/AirRow.svelte";
    import Card from "../tiles/Card.svelte";

    const a = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return airingLook();
    });
</script>

<div class="ph"><div class="ttl"><p>Next episodes and chapters for things you're following, from AniList and TVmaze{a.tmdb ? " and TMDB" : ""}.</p></div><span class="spacer"></span><button class="btn" data-act="airing-refresh">Refresh</button></div>
{#if a.list.length}<div class="panel"><div class="airs big">{#each a.list as b, i (i + b.id)}<AirRow {b} />{/each}</div></div>{:else}<div class="empty"><h3>Nothing scheduled</h3><p>When something you're following has a date for its next episode, it appears here.</p></div>{/if}
{#if a.releasing.length}<div class="panel" style="margin-top:16px"><h3>Still releasing, no date yet</h3><div class="strip">{#each a.releasing as b, i (i + b.id)}<Card {b} sel={store.ui.sel.has(b.id)} />{/each}</div></div>{/if}
