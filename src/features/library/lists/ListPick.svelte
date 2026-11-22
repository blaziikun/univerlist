<!--
    src/features/library/lists/ListPick.svelte
    ─────────────────────────────────────────────────────────────────
      Lists for an entry (or several selected): tick the lists it's in, or make a new one with it in.
      Opened by "list-pick" (the card, a cover's right-click menu) and the library's bar for what you've selected.
      Ticking a list is "lp-toggle" (library/list-handlers.ts); the new list's name is this one's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { cleanTitle, curMode, modeById, titleOf, toast } from "../../core/core";
    import { isUniversal } from "../../core/views";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { createList } from "../item-actions";
    import type { List } from "../../core/model";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "listpick") return null;
        const ids = m.ids || [m.id || ""];
        return {
            ids,
            title: ids.length === 1 ? "Lists · " + cleanTitle(titleOf(store.item(ids[0]) || { title: "" })) : `Add ${ids.length} to a list`,
            lists: store.meta.lists.filter(l => l.kind !== "tier").map(l => ({ ...l, ids: [...l.ids] })),
        };
    });
    const has = (l: List) => !!v && v.ids.every(id => l.ids.includes(id));
    let name = $state("");
    function create() {
        const n = name.trim();
        if (!n || !v) return;
        createList({ name: n, ids: v.ids, mode: isUniversal() ? "" : curMode().id });
        name = "";
        toast("Added to " + n);
    }
</script>

{#if v}
    <DialogHead title={v.title} />
    {#if v.lists.length}<div class="mini">{#each v.lists as l}<button data-act="lp-toggle" data-k={l.id} aria-pressed={has(l)}><span class="t">{has(l) ? "✓ " : ""}{l.numbered ? "№ " : "≡ "}{l.name}</span><span class="hint">{l.ids.length} entries{l.mode ? " · " + modeById(l.mode).name : ""}</span></button>{/each}</div>{:else}<p class="hint">No lists yet.</p>{/if}
    <div class="bar" style="margin-top:10px"><input class="inp" id="lp-new" placeholder="New list name" style="max-width:260px" bind:value={name} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); create(); } }}><button class="btn" data-act="lp-create" onclick={create}>Create & add</button><span class="spacer"></span><button class="btn gold" data-act="close">Done</button></div>
{/if}
