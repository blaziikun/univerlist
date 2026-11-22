<!--
    src/features/library/stats/StatsPage.svelte
    ─────────────────────────────────────────────────────────────────
      A mode's Stats tab: charts as blocks you arrange (BlockGrid, with everything or only what's finished), with the
      deeper views one click away (ui.statsView): Year in review, Your taste, Compare, Franchises, People, Coming up
      (in a mode with anime or manga), Log and Duplicates. Compare, Franchises and People are Connections' views
      (library/connections/).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { activityStats, modeItems, STATS_VIEWS } from "../../core/views";
    import { hasAnimanga } from "../../core/shell";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { STAT_BLOCKS } from "../statblocks";
    import BlockGrid from "../blocks/BlockGrid.svelte";
    import { ST_VIEWS } from "./views";
    import Wrapped from "./Wrapped.svelte";
    import Taste from "./Taste.svelte";
    import Airing from "./Airing.svelte";
    import Log from "./Log.svelte";
    import Dupes from "./Dupes.svelte";
    import Compare from "../connections/Compare.svelte";
    import Franchises from "../connections/Franchises.svelte";
    import People from "../connections/People.svelte";

    const v = $derived.by(() => {
        const u = store.ui;
        void store.meta;
        return {
            view: u.statsView || "charts",
            basis: u.statsBasis || "all",
            views: STATS_VIEWS.filter(([k]) => k !== "airing" || hasAnimanga()),
            mode: u.mode + (u.private ? "p" : ""),
        };
    });
    // the charts' entries: everything in the mode, or only what's finished
    const base = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        const u = store.ui;
        if ((u.statsView || "charts") !== "charts") return null;
        const A = modeItems();
        return { A: u.statsBasis === "done" ? A.filter(b => b.status === "done") : A, st: activityStats() };
    });
</script>

<HiddenNote />
<div class="chips subnav" role="group" aria-label="Which stats">{#each v.views as [k, l] (k)}<button class="chip" data-act="stats-view" data-k={k} aria-pressed={v.view === k}>{l}</button>{/each}{#if v.view === "charts"}<span class="spacer"></span><div class="seg">{#each [["all", "Everything"], ["done", "Finished only"]] as [k, l] (k)}<button data-act="stats-basis" data-k={k} aria-pressed={v.basis === k}>{l}</button>{/each}</div>{/if}</div>{#if v.view === "wrapped"}<Wrapped />{:else if v.view === "taste"}<Taste />{:else if v.view === "airing"}<Airing />{:else if v.view === "log"}<Log />{:else if v.view === "dupes"}<Dupes />{:else if v.view === "compare"}<Compare />{:else if v.view === "franchises"}<Franchises />{:else if v.view === "people"}<People />{:else if base}{#key v.mode}<BlockGrid kind="st" reg={STAT_BLOCKS} {base} views={ST_VIEWS} />{/key}{/if}
