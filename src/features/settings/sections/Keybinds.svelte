<!--
    src/features/settings/sections/Keybinds.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Keybinds: change any shortcut, or turn one off. Pressing the new keys is caught by the app's own key
      handling (core/keys.js), which watches for ui.keyCapture.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";

    // getting around on the left, doing things on the right
    const NAV = ["search", "sidebar", "prevmode", "nextmode", "mode1", "mode2", "mode3", "mode4", "mode5", "mode6", "mode7", "mode8", "mode9", "overview", "library", "favourites", "stats", "lists", "watch", "settings", "private", "help"];
    const ACT = ["add", "pick", "discover", "filter", "select", "view1", "view2", "view3", "view4", "bigger", "smaller", "undo", "redo"];

    const custom = $derived((store.meta.settings.keys || {}) as Record<string, string[]>);
    const capturing = $derived(store.ui.keyCapture as string | null);
    /** what a shortcut is called ("Go to Music" for the numbered modes; none for a number with no mode) */
    function nameOf(id: string): string | null {
        const a = KEY_ACTIONS.find(x => x[0] === id);
        if (!a) return null;
        if (!/^mode\d$/.test(id)) return a[1];
        const m = allModes()[+id.slice(4) - 1];
        return m ? "Go to " + m.name : null;
    }
    const rows = (ids: string[]) =>
        ids.flatMap(id => {
            void store.meta;
            const name = nameOf(id);
            return name ? [{ id, name, keys: keysOf(id) }] : [];
        });
    const setKeys = (change: (K: Record<string, string[]>) => void) =>
        store.updateMeta(m => {
            const K = { ...custom };
            change(K);
            m.settings.keys = K;
        });
</script>

{#snippet column(title: string, ids: string[])}
    <div class="panel keyed">
        <h3>{title}</h3>
        {#each rows(ids) as r (r.id)}
            <div class="krow" class:off={!!custom[r.id] && !r.keys.length}>
                <span>{r.name}</span><span class="spacer"></span>
                {#if capturing === r.id}<span class="kcap">Press keys…</span>
                {:else if r.keys.length}{#each r.keys as k, i (i)}<kbd>{keyLabel(k)}</kbd>{/each}
                {:else}<span class="hint">off</span>{/if}
                <button class="btn sm ghost" onclick={() => store.go({ keyCapture: capturing === r.id ? null : r.id })}>{capturing === r.id ? "Cancel" : "Change"}</button>
                {#if r.keys.length}<button class="linkbtn" aria-label={`Turn off ${r.name}`} onclick={() => setKeys(K => (K[r.id] = []))}>off</button>{/if}
                {#if custom[r.id]}<button class="linkbtn" onclick={() => setKeys(K => delete K[r.id])}>reset</button>{/if}
            </div>
        {/each}
    </div>
{/snippet}

<h2 class="sh">Keybinds</h2>
<p class="hint" style="margin-bottom:12px">Click Change, then press the keys you want (Esc cancels); “off” turns one off. On a card: ← → for the previous and next. Right-click any cover to score it.</p>
<div class="keycols">{@render column("Getting around", NAV)}{@render column("Doing things", ACT)}</div>
<div class="bar">
    <button class="btn ghost" onclick={() => { store.updateMeta(m => (m.settings.keys = {})); toast("Every shortcut is back to the default"); }}>Reset every keybind</button>
</div>
