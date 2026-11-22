<!--
    src/features/library/progress/SetPage.svelte
    ─────────────────────────────────────────────────────────────────
      Where are you in it: the page, episode or chapter you're on (and, for a book, where you're reading it), logged
      as a session (logProgress). Opened by "set-page" on a tile or card. Log and Enter are this one's own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { cleanTitle, LANES, titleOf, unitOf } from "../../core/core";
    import { closeModal } from "../../core/modals";
    import { caretAtStart } from "../../core/dialog/caret";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { logProgress } from "../item-actions";

    const b = $derived.by(() => {
        const m = store.ui.modal,
            it = m && m.kind === "setpage" ? store.item(m.id || "") : undefined;
        return it ? { ...it, id: m?.id || "" } : null;
    });
    const start = store.ui.modal,
        first = start ? store.item(start.id || "") : undefined;
    let page = $state(String(first?.prog || 0)),
        lane = $state(first?.lane || "");
    function log() {
        if (!b) return;
        const v = parseFloat(page),
            id = b.id,
            book = b.medium === "book";
        closeModal();
        if (Number.isFinite(v)) logProgress(id, v, { lane: book ? lane : undefined });
    }
</script>

{#if b}
    {@const one = unitOf(b)[0]}
    <DialogHead title={`Where are you in ${cleanTitle(titleOf(b))}?`} />
    <!-- svelte-ignore a11y_autofocus: the number is what you came to change -->
    <div class="bar"><label class="ctl">{one.charAt(0).toUpperCase() + one.slice(1)} <input class="inp" id="sp-page" inputmode="decimal" autofocus style="width:100px" bind:value={page} use:caretAtStart onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); log(); } }}></label>{#if b.total}<span class="hint">of {b.total}</span>{/if}
    {#if b.medium === "book"}<select class="sel" id="sp-lane" bind:value={lane}><option value="">Where?</option>{#each LANES as [k, l]}<option value={k}>{l}</option>{/each}</select>{/if}<button class="btn gold" data-act="sp-save" onclick={log}>Log</button></div>
{/if}
