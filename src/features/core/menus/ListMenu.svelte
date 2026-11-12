<!--
    src/features/core/menus/ListMenu.svelte
    ─────────────────────────────────────────────────────────────────
      The right-click menu on a list in the sidebar or on the Lists tab: rename it, open, duplicate, numbered or not,
      delete. Up next has only Open.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { changeMeta } from "../core";
    import { listCount } from "../../library/tiers";

    let { k }: { k: string } = $props();

    const l = $derived.by(() => {
        const x = store.meta.lists.find(x => x.id === k);
        return x ? { ...x } : null;
    });
    function rename(box: HTMLInputElement) {
        const v = box.value.trim();
        if (v) changeMeta("Rename list", "lists", L => L.map(x => (x.id === k ? { ...x, name: v } : x)));
        else if (l) box.value = l.name; // an empty name isn't kept
    }
</script>

{#if l}
    <div class="ctx-h"><b>{l.name}</b><small>{l.kind === "tier" ? "Tier list" : l.numbered ? "Numbered list" : "List"} · {listCount(l)} entries</small></div>
    <div class="ctx-s"><span class="ilab">Name</span><input class="inp" data-lrename={k} value={l.name} onchange={e => rename(e.currentTarget)}></div>
    <div class="ctx-a"><button data-act="ctx-list-open" data-k={k}>Open</button><button data-act="ctx-list-dup" data-k={k}>Duplicate</button>{#if l.kind !== "tier"}<button data-act="ctx-list-num" data-k={k}>{l.numbered ? "Unnumbered" : "Numbered"}</button>{/if}<button data-act="ctx-list-del" data-k={k}>Delete</button></div>
{:else if k === "queue"}
    <div class="ctx-h"><b>Up next</b><small>Your priority queue</small></div><div class="ctx-a"><button data-act="ctx-list-open" data-k="queue">Open</button></div>
{/if}
