<!--
    src/features/core/menus/CharMenu.svelte
    ─────────────────────────────────────────────────────────────────
      The right-click menu on a character you saved: open, move to the top, its group, remove. "Group…" turns the menu
      into the groups to choose from, in the same place.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { CHAR_GROUPS, charGroup } from "../../library/connect";

    let { k }: { k: string } = $props();

    const c = $derived.by(() => {
        const x = store.meta.chars.find(x => x.id === k);
        return x ? { ...x } : null;
    });
    let grouping = $state(false);
</script>

{#if c}
    {#if grouping}
        <div class="ctx-h"><b>{c.name}</b><small>Group</small></div><div class="ctx-st">{#each CHAR_GROUPS as g}<button data-act="ctx-char-setgroup" data-k={k} data-g={g} aria-pressed={charGroup(c) === g}>{g}</button>{/each}</div>
    {:else}
        <div class="ctx-h"><b>{c.name}</b><small>{((c.media || [])[0] || { title: "" }).title || "Character"} · #{c.rank || "–"}</small></div>
        <div class="ctx-a"><button data-act="ctx-char-open" data-k={k}>Open</button><button data-act="ctx-char-top" data-k={k}>Move to the top</button><button data-act="ctx-char-group" data-k={k} onclick={() => (grouping = true)}>Group…</button><button data-act="ctx-char-del" data-k={k}>Remove</button></div>
    {/if}
{/if}
