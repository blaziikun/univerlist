<!--
    src/features/library/people/CharViewer.svelte
    ─────────────────────────────────────────────────────────────────
      A character's pictures, large, one at a time: ← and →, and "Use this". A click outside the bar closes it
      ("char-view-close", library/people-handlers.ts); where it is, is the dialog's (ui.modal.view).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import Pic from "../../core/dialog/Pic.svelte";

    let { gal, at }: { gal: { u: string; k: string }[]; at: number } = $props();

    const i = $derived(Math.max(0, Math.min(gal.length - 1, at)));
    const g = $derived(gal[i]);
</script>

{#if g}
    <div class="cviewer" data-act="char-view-close"><Pic src={g.u} /><div class="cvbar"><button class="ib" data-act="char-view" data-k={(i - 1 + gal.length) % gal.length} aria-label="Previous" onclick={() => store.dialog({ view: (i - 1 + gal.length) % gal.length })}>←</button><span>{i + 1} / {gal.length}</span><button class="ib" data-act="char-view" data-k={(i + 1) % gal.length} aria-label="Next" onclick={() => store.dialog({ view: (i + 1) % gal.length })}>→</button><button class="btn sm" data-act="char-pic" data-k={i}>Use this</button></div></div>
{/if}
