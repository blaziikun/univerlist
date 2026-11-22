<!--
    src/features/library/stats/Dupes.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › Duplicates: entries with the same title and medium, grouped; keeping one (dup-keep) folds the others'
      tags, notes, quotes, links and log into it (dupesLook, core/views.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { titleOf } from "../../core/core";
    import { dupesLook } from "../../core/views";
    import Cover from "../tiles/Cover.svelte";

    const G = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return dupesLook();
    });
</script>

<div class="ph"><div class="ttl"><p>Same title and medium. Keep one: its tags, notes, quotes, links and log absorb the others.</p></div></div>
{#each G as g (g.key)}<div class="panel" style="margin-bottom:12px"><h3>{g.title}</h3><div class="queue">{#each g.entries as { b, about } (b.id)}<div class="qi" style="grid-template-columns:34px minmax(0,1fr) auto"><Cover {b} /><div><button class="t" data-act="open" data-id={b.id}>{titleOf(b)}</button><div class="hint">{about}</div></div><button class="btn sm gold" data-act="dup-keep" data-id={b.id} data-k={g.key}>Keep this one</button></div>{/each}</div></div>{:else}<div class="empty"><h3>No duplicates</h3><p>Every title is unique within its medium.</p></div>{/each}
