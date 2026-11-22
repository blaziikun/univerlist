<!--
    src/features/settings/parts/KindTypes.svelte
    ─────────────────────────────────────────────────────────────────
      What each type is called, and which ones count as one (Settings › Library for every mode; Settings › Modes for
      the media a mode shows). A type folded into another can't be renamed: it shows under the other's name. Saving
      is core/types.ts (kindLabelSet, kindMergeSet); the fields keep their data-kindlabel and data-kindmerge names.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { kindLabelSet, kindMergeSet, typesView } from "../../core/types";
    import type { Mode } from "../../core/model";

    let { mode }: { mode?: Mode } = $props();

    // the types come from your library, and their names and merges from your settings
    const rows = $derived.by(() => {
        void store.items;
        void store.meta;
        void store.ui;
        return typesView(mode);
    });
</script>

{#if !rows.length}<p class="hint">Types show up here as your library grows.</p>{/if}{#each rows as r (r.m)}<div class="kindrow"><b>{r.name}</b><div class="kinds">{#each r.kinds as x (x.k)}<label class="kindc{x.into ? ' merged' : ''}"><input class="inp" data-kindlabel="{r.m}|{x.k}" value={x.label} placeholder={x.k} title="What {x.k} is called" disabled={!!x.into} onchange={e => kindLabelSet(r.m, x.k, e.currentTarget.value)}>{" "}<select class="sel" data-kindmerge="{r.m}|{x.k}" title="Show {x.k} as its own type, or as part of another" onchange={e => kindMergeSet(r.m, x.k, e.currentTarget.value)}>{#each x.opts as [v, l] (v)}<option value={v} selected={v === x.into}>{l}</option>{/each}</select></label>{/each}</div></div>{/each}
