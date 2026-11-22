<!--
    src/features/library/lists/ListsPage.svelte
    ─────────────────────────────────────────────────────────────────
      A mode's Lists tab: every list in this mode as a card (Up next first, outside the private collection), or the one
      that's open (ui.listId): Up next or a list (ListView), or a tier list (tiers/TierListPage.svelte, drawn as it is).
      What the cards show comes from listsView() in connect.ts. The buttons go through list-new and go-list.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { meta, ui } from "../../core/core";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { type ListLook, listsView, listView } from "../connect";
    import { isTier } from "../tiers";
    import ListCard from "../tiles/ListCard.svelte";
    import TierListPage from "../tiers/TierListPage.svelte";
    import ListView from "./ListView.svelte";

    const v = $derived.by((): { tier: boolean; open: ListLook | null; cards: ReturnType<typeof listsView> | null } => {
        void store.itemsByFrame;
        void store.meta;
        const u = store.ui;
        if (u.listId && isTier(meta.lists.find(l => l.id === u.listId))) return { tier: true, open: null, cards: null };
        const open = u.listId ? listView(u.listId) : null;
        // a list that's gone (deleted, or the private collection's old card): the lists instead, as it always was
        if (u.listId && !open) ui.listId = null;
        return { tier: false, open, cards: open ? null : listsView() };
    });
</script>

{#if v.tier}<TierListPage />{:else}<HiddenNote />{#if v.open}{#key v.open.id}<ListView l={v.open} />{/key}{:else}<div class="ph"><div class="ttl"><p>Reading orders, watch orders, shortlists and tier lists. Numbered lists keep their order; drag to change it. Right-click a list to rename or duplicate it.</p></div><span class="spacer"></span><button class="btn" data-act="list-new" data-k="tier">+ Tier list</button><button class="btn gold" data-act="list-new">+ List</button></div>
    <div class="frgrid">{#if v.cards?.queue}<ListCard c={v.cards.queue} />{/if}
      {#each v.cards?.lists || [] as c, i (i + c.id)}<ListCard {c} />{/each}</div>{/if}{/if}
