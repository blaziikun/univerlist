<!--
    src/features/core/page/HiddenNote.svelte
    ─────────────────────────────────────────────────────────────────
      The note at the top of a mode's tab while you're looking at what you've hidden, and the way back. Each tab puts it
      at its own top (core/shell/ProfilePage.svelte for a tab it doesn't know).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
</script>

{#if store.ui.hiddenView}<div class="note"><span class="b-ic">◌</span> Hidden: these are left out of every list, stat and overview. <button class="linkbtn" data-act="hidden-view">Back to everything</button></div>{/if}
