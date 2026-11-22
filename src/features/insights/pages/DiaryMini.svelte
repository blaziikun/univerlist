<!--
    src/features/insights/pages/DiaryMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Diary block: your latest watches by date (diaryEvents, as the Diary shows them), with your
      score and ↻ for a rewatch.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { fmtScore, scaleOf, titleOf } from "../../core/core";
    import type { Entry } from "../../core/model";
    import { diaryEvents } from "../mode-pages";

    let { M }: { M: Entry[] } = $props();

    const E = $derived(diaryEvents(M).slice(0, 7));
</script>

{#if E.length}<div class="drows small">{#each E as e, i (i)}<button class="drow2" data-act="open" data-id={e.b.id}><span class="dd">{new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><span class="dt"><b>{titleOf(e.b)}</b></span><span class="dr">{e.b.rating ? fmtScore(e.b.rating, scaleOf(e.b)) : ""}</span><span class="dx">{e.re ? "↻" : ""}</span></button>{/each}</div><button class="linkbtn" data-act="tab" data-k="diary">The whole diary</button>{:else}<p class="hint">Watches show here by date.</p>{/if}
