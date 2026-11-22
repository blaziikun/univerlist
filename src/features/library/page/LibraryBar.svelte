<!--
    src/features/library/page/LibraryBar.svelte
    ─────────────────────────────────────────────────────────────────
      The bar above the shelves: the four views, the status you're looking at (✕ to show everything), the filter,
      grouping and sort, ⋯ for size, spacing and more (ViewOptions), and Select.
      Group and Sort are handled here; the buttons go through their data-act names (core/nav-handlers.ts,
      library/handlers.ts), as the keys and the sidebar press the same ones.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, STATUS_WORDS } from "../../core/core";
    import { curGroup, groupWord, GROUPS, SORTS } from "../../core/views";
    import { renderMain, type IconName } from "../../core/shell";
    import Icon from "../../core/Icon.svelte";
    import { VIEW_LIST, type LibraryView, type ViewKey } from "../library";
    import ViewOptions from "./ViewOptions.svelte";

    let {
        lib,
        status,
        filterOpen,
        pop,
        arrange,
        selecting,
    }: {
        lib: LibraryView;
        status: string;
        filterOpen: boolean;
        pop: string | null;
        arrange: boolean;
        selecting: boolean;
    } = $props();

    const stWord = $derived.by(() => {
        void lib; // the words for a status depend on the mode
        return STATUS_WORDS[groupWord()][status] || status;
    });

    // a new sort for the mode drops the sorts its groups had of their own; Shelf order is a look, so it shows spines
    function sortTo(v: string) {
        const md = lib.mode,
            gp = curGroup(md);
        md.sort = v;
        md.gsort = Object.fromEntries(Object.entries(md.gsort || {}).filter(([k]) => !k.startsWith(gp + ":")));
        if (v === "shelf") md.view = "spine";
        markDirty();
        renderMain();
    }
    function groupTo(v: string) {
        lib.mode.group = v;
        markDirty();
        renderMain();
    }
    // each view's icon
    const viewIcon = (k: ViewKey): IconName => `v_${k}`;
</script>

{#snippet sel(id: string, opts: [string, string][], val: string, change: (v: string) => void)}
    <select class="sel" {id} onchange={e => change(e.currentTarget.value)}>{#each opts as [k, l]}<option value={k} selected={String(val) === String(k)}>{l}</option>{/each}</select>
{/snippet}

<div class="libbar"><div class="libctl">
        <div class="lb-left"><div class="seg views" role="group" aria-label="View">{#each VIEW_LIST as [k, l, d], i}<button data-act="view" data-k={k} aria-pressed={lib.view === k} title="{l}: {d} ({i + 1})"><Icon name={viewIcon(k)} /><span class="vl">{l}</span></button>{/each}</div>
          {#if status !== "all"}<button class="chip on stchip" data-act="f-status" data-k="all" title="Showing only {stWord}: click to show everything">{stWord} ✕</button>{/if}</div>
        <div class="lb-right">
          <button class="btn sm fbtn{lib.filters || filterOpen ? ' on' : ''}" data-act="filter-toggle" aria-label="Filter" aria-expanded={filterOpen}><Icon name="filter" /><span>Filter</span>{#if lib.filters}{" "}<span class="fcount">{lib.filters}</span>{/if}</button>
          <label class="lbsel"><span class="lbk">Group</span>{@render sel("group", GROUPS, lib.group, groupTo)}</label>
          <label class="lbsel"><span class="lbk">Sort</span>{@render sel("sort", SORTS, lib.sort, sortTo)}</label>
          <div class="pop"><button class="btn sm ghost lb-more" data-act="pop" data-k="viewopt" aria-expanded={pop === "viewopt"} title="Size, spacing and more" aria-label="Size, spacing and more">⋯</button>
          {#if pop === "viewopt"}<ViewOptions {lib} {arrange} />{/if}</div>
          {#if arrange}<button class="btn sm gold" data-act="arrange">Done arranging</button>{/if}
          <button class="btn sm{selecting ? ' gold' : ''}" data-act="select-toggle" title="Select several (S). Or drag a box over covers, Shift-click for a range, Ctrl/⌘-click to add one.">{selecting ? "Done" : "Select"}</button>
        </div>
      </div></div>
