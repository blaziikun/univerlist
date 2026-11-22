<!--
    src/features/core/menus/TabMenu.svelte
    ─────────────────────────────────────────────────────────────────
      The right-click menu on a mode's tab: hide it in this mode, or change the tabs.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { curMode } from "../core";
    import { TAB_NAME } from "../shell";

    let { k }: { k: string } = $props();

    const mode = $derived.by(() => {
        void store.meta;
        void store.ui;
        return curMode().name;
    });
</script>

<div class="ctx-h"><b>{TAB_NAME[k] || k}</b><small>{mode}</small></div><div class="ctx-a"><button data-act="tab-hide" data-k={k}>Hide in {mode}</button><button data-act="tab-edit">Add, remove or reorder tabs…</button></div>
