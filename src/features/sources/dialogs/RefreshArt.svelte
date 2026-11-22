<!--
    src/features/sources/dialogs/RefreshArt.svelte
    ─────────────────────────────────────────────────────────────────
      Refresh artwork & scores: what to fetch again (what's still without artwork, every crowd score, every book's
      most popular cover), how far it's got, and Start or Stop ("rc-go", "rc-stop": library/item-handlers.ts, which
      runs runRefresh in core/events.ts). What to fetch and how far it's got are the dialog's state (ui.modal.scope,
      .total, .done…), which the run fills in as it goes.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import DialogHead from "../../core/dialog/DialogHead.svelte";

    const m = $derived.by(() => {
        const m = store.ui.modal;
        return m && m.kind === "covers" ? { ...m } : null;
    });
    const SCOPES = [
        ["missing", "Things still without artwork"],
        ["scores", "Update every crowd score"],
        ["books", "Every book: switch to its most popular cover"],
    ];
</script>

{#if m}
    <DialogHead title="Refresh artwork & scores" />
    <p>Artwork and crowd scores load in the background on their own. Use this to retry, fill gaps, or update every score.</p>
    <div class="field" style="max-width:460px"><label for="rc-scope">What</label><select id="rc-scope" disabled={!!m.running} onchange={e => store.dialog({ scope: e.currentTarget.value })}>{#each SCOPES as [k, l]}<option value={k} selected={k === (m.scope || "missing")}>{l}</option>{/each}</select></div>
    {#if m.total}<div class="progress"><span style="width:{Math.round(((m.done || 0) / m.total) * 100)}%"></span></div><p class="hint">{String(m.done)} of {m.total} · {String(m.found)} updated{m.current ? " · " + m.current : ""}</p>{/if}
    <div class="bar">{#if m.running}<button class="btn" data-act="rc-stop">Stop</button>{:else}<button class="btn gold" data-act="rc-go">{m.total ? "Run again" : "Start"}</button>{/if}</div>
    {#if m.finished}<p class="hint">Done.</p>{/if}{#if m.error}<p class="err">{m.error}</p>{/if}
{/if}
