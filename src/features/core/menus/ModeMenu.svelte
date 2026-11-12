<!--
    src/features/core/menus/ModeMenu.svelte
    ─────────────────────────────────────────────────────────────────
      The right-click menu on a mode: go there, edit it and its look, open in it at start, its own profile.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { modeById } from "../core";
    import { modeItems } from "../views";

    let { k }: { k: string } = $props();

    const m = $derived.by(() => {
        void store.meta;
        void store.items;
        const x = modeById(k);
        return { ...x, n: modeItems(x).length };
    });
</script>

<div class="ctx-h"><b>{m.g || ""} {m.name}</b><small>{m.n} things</small></div>
<div class="ctx-a"><button data-act="mode" data-k={k}>Go there</button>{#if !m.sealedOnly}<button data-act="ctx-mode-edit" data-k={k}>Edit mode and look</button><button data-act="ctx-mode-start" data-k={k}>Open in it when I start</button>{/if}<button data-act="profile-edit" data-k={k}>Profile for this mode</button></div>
