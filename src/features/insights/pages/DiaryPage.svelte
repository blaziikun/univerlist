<!--
    src/features/insights/pages/DiaryPage.svelte
    ─────────────────────────────────────────────────────────────────
      Diary (the Film & TV mode's tab): every film you watched and every show you finished, by month, newest first,
      with rewatches marked. diaryEvents() in mode-pages.ts finds them, as it does for the overview's Diary block.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { fmtScore, MEDIA, scaleOf, titleOf } from "../../core/core";
    import { modeItems } from "../../core/views";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import Cover from "../../library/tiles/Cover.svelte";
    import { diaryEvents, diaryMonths } from "../mode-pages";

    const months = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        void store.ui;
        return diaryMonths(diaryEvents(modeItems()));
    });
    const monthName = (k: string) => new Date(k + "-15").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
</script>

<HiddenNote />
<div class="ph"><div class="ttl"><p>Every film you watched and every show you finished, by date, with rewatches marked. Log a watch from a card, or "Mark watched today".</p></div></div>
{#each months as [k, es] (k)}<section class="diarymonth"><h3 class="dm">{monthName(k)} <span class="hint">{es.length}</span></h3>
    <div class="drows">{#each es as e}<button class="drow2" data-act="open" data-id={e.b.id}><span class="dd">{new Date(e.date).getDate()}</span><Cover b={e.b} /><span class="dt"><b>{titleOf(e.b)}</b><small>{[e.b.year, e.show ? MEDIA[e.b.medium].one : e.b.creator].filter(Boolean).join(" · ")}</small></span><span class="dr">{e.b.rating ? fmtScore(e.b.rating, scaleOf(e.b)) : ""}</span><span class="dx">{e.re ? "↻" : ""}{e.b.fav ? " ♥" : ""}</span></button>{/each}</div></section>{:else}<div class="empty"><h3>No diary yet</h3><p>Films you mark as watched and shows you finish appear here by date.</p></div>{/each}
