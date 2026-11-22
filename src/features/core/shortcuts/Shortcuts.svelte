<!--
    src/features/core/shortcuts/Shortcuts.svelte
    ─────────────────────────────────────────────────────────────────
      Keyboard shortcuts: every one and its keys (yours, or the usual ones), and a way to change them in Settings.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { KEY_ACTIONS, keyLabel, keysOf } from "../keys";
    import DialogHead from "../dialog/DialogHead.svelte";

    const rows = $derived.by(() => {
        void store.meta;
        return KEY_ACTIONS.map(([id, l]) => ({ id, l, keys: keysOf(id).map(keyLabel) }));
    });
</script>

<DialogHead title="Keyboard shortcuts" />
<p class="hint">Change any of them in Settings.</p><div class="keys">{#each rows as r (r.id)}<span>{#each r.keys as k, i}{i ? " " : ""}<span class="kbd">{k}</span>{/each}</span><span>{r.l}</span>{/each}</div><div class="bar"><button class="btn" data-act="go-settings" data-k="keys">Change them</button></div>
