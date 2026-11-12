<!--
    src/features/insights/pages/QuotesPage.svelte
    ─────────────────────────────────────────────────────────────────
      Quotes (the Literature mode's tab): every line you saved, newest first, and a search. What's searched for is kept
      on ui.quoteQ, so it's still there when you come back to the tab.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { cleanTitle, titleOf, ui, unitOf } from "../../core/core";
    import { modeItems } from "../../core/views";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { quotesOf } from "../mode-pages";

    let q = $state(ui.quoteQ || "");
    const Q = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        void store.ui;
        return quotesOf(modeItems(), q);
    });
</script>

<HiddenNote />
<div class="ph"><div class="ttl"><p>Every line you saved, newest first. Add quotes from a card's Journal tab.</p></div><span class="spacer"></span><input class="inp" id="quote-q" placeholder="Search quotes" style="max-width:220px" bind:value={q} oninput={() => (ui.quoteQ = q)}></div>
{#if Q.length}<div class="qwall">{#each Q as { x, b }}<figure class="qcard"><blockquote>{x.text}</blockquote><figcaption><button class="linkbtn" data-act="open" data-id={b.id}>{cleanTitle(titleOf(b))}</button>{x.page ? " · " + unitOf(b)[2] + " " + x.page : ""}</figcaption></figure>{/each}</div>{:else}<div class="empty"><h3>No quotes yet</h3><p>Open a book and save a line in its Journal tab.</p></div>{/if}
