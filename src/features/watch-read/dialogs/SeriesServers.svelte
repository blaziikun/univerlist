<!--
    src/features/watch-read/dialogs/SeriesServers.svelte
    ─────────────────────────────────────────────────────────────────
      A show's (or film's) servers: the addresses kept in your settings and the links an extension keeps for it, each
      removed with ✕ (ss-del, series.ts), and adding more: pasted links or addresses, one per line, with a name (Add
      is this dialog's own: it takes what's typed here, then empties the boxes). Which show is the one open (W.show).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { caretAtStart } from "../../core/dialog/caret";
    import { ssAdd, ssList, ssName, ssOwners } from "../series";

    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        return { name: ssName(), list: ssList(), owners: ssOwners().length };
    });
    let raw = $state(""),
        name = $state("");
    async function add() {
        if (await ssAdd(raw, name)) raw = name = "";
    }
</script>

<DialogHead title="Servers for {v.name}" />
<p class="hint">As many as you like. They belong to this series, so every episode tries them. If one is slow or broken, switch under the player (⇄), or the next one is tried by itself.</p>
<div class="ssl">{#each v.list as s, i (i + ":" + s.value)}<div class="srvrow"><span class="pill">{s.kind === "held" ? "Extension" : "Address"}</span><span class="sn" title={s.value}><b>{s.name}</b></span><button class="btn sm ghost" data-act="ss-del" data-k={i} aria-label="Remove">✕</button></div>{:else}<p class="hint">None yet.</p>{/each}</div>
<!-- svelte-ignore a11y_autofocus: pasting the links is the first thing to do here -->
<div class="fields"><div class="field full"><label for="ss-in">Paste links or addresses, one per line</label><textarea id="ss-in" rows="4" spellcheck="false" autofocus placeholder="http://nas.local/videos/{'{'}title}/Season {'{'}season}/{'{'}title} S{'{'}s2}E{'{'}e2}.mp4" bind:value={raw} use:caretAtStart></textarea></div>
    <div class="field"><label for="ss-name">Name (optional)</label><input id="ss-name" placeholder="e.g. Living-room NAS" bind:value={name}></div></div>
<div class="bar"><button class="btn gold" data-act="ss-add" onclick={add}>Add</button></div>
{#if !v.owners}<p class="hint">Only addresses work without an extension; other kinds of link need the extension that plays them, switched on in Settings › Extensions.</p>{/if}
