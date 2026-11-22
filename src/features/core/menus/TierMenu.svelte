<!--
    src/features/core/menus/TierMenu.svelte
    ─────────────────────────────────────────────────────────────────
      The right-click menu on an entry of the tier or ranked list that's open: move it (or everything selected) to a
      tier, back to Unplaced, open it, or take it off the list.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { plural } from "../core";
    import { tierEnt, tierSel } from "../../library/tiers";

    let { k }: { k: string } = $props();

    const t = $derived.by(() => {
        void store.items;
        const L = store.meta.lists.find(x => x.id === store.ui.listId);
        if (!L || !L.rows) return null;
        return {
            L: { ...L, rows: L.rows.map(r => ({ ...r })) },
            e: tierEnt(L, k) || { name: "", image: "", sub: "" },
            n: tierSel.has(k) && tierSel.size > 1 ? tierSel.size : 1,
            own: !!(L.ents || {})[k],
        };
    });
</script>

{#if t}
    {@const { L, e } = t}
    <div class="ctx-h"><b>{t.n > 1 ? plural(t.n, "entry", "entries") : e.name}</b><small>{L.layout === "rank" ? "Ranking" : "Move to"}</small></div><div class="ctx-st">{#if L.layout === "rank"}<button data-act="ctx-tier" data-k={k} data-row="0">Add to the ranking</button>{:else}{#each L.rows as r, i}<button data-act="ctx-tier" data-k={k} data-row={i} style="border-color:{r.color}">{r.label}</button>{/each}{/if}<button data-act="ctx-tier" data-k={k} data-row="pool">Unplaced</button></div>
    {#if e.item}<div class="ctx-a"><button data-act="ctx-open" data-k={k}>Open card</button></div>{:else if e.char}<div class="ctx-a"><button data-act="open-char" data-k={k}>Open character</button></div>{/if}{#if t.own}<div class="ctx-a"><button data-act="ctx-tier-forget" data-k={k}>Remove from this list</button></div>{/if}
{/if}
