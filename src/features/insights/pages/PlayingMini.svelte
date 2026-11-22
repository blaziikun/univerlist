<!--
    src/features/insights/pages/PlayingMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Now playing block: the games you're in the middle of, as cards (GameCard, as Playing shows them),
      or a way to the backlog.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Entry } from "../../core/model";
    import { activeOf } from "../../library/blocks";
    import GameCard from "./GameCard.svelte";

    let { M }: { M: Entry[] } = $props();

    const now = $derived(activeOf(M).slice(0, 3));
</script>

{#if now.length}<div class="gcards">{#each now as b, i (i + b.id)}<GameCard {b} />{/each}</div>{:else}<p class="hint">Nothing in progress. <button class="linkbtn" data-act="lib-status" data-k="want">Pick from the backlog</button></p>{/if}
