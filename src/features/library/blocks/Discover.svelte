<!--
    src/features/library/blocks/Discover.svelte
    ─────────────────────────────────────────────────────────────────
      The Insights block: how often you finish what you start, for the genres you have most of, and the way to the
      rest of Insights.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { modeItems } from "../../core/views";
    import { finishRates } from "../../insights/mode-pages";
    import type { OvBlock } from "../blocks";
    import Bars from "./Bars.svelte";

    let { c }: { c: OvBlock } = $props();

    const R = $derived(
        (void c,
        finishRates(modeItems(), b => b.genres)
            .sort((a, b) => b.n - a.n)
            .slice(0, 6)
            .sort((a, b) => b.pct - a.pct))
    );
</script>

{#if R.length}<Bars rates={R} /><p class="hint"><button class="linkbtn" data-act="open-discover">More insights</button></p>{:else}<p class="hint">Start or finish a few things and this fills in. <button class="linkbtn" data-act="open-discover">Insights</button></p>{/if}
