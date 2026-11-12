<!--
    src/features/library/private/Unlock.svelte
    ─────────────────────────────────────────────────────────────────
      Unlock the private collection: how many entries are sealed, the passphrase, and what went wrong (ui.modal.err).
      Unlock and Enter are this one's own: once it opens, the collection is shown.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { errMessage, plural, toast, ui, vault, vaultUnlock } from "../../core/core";
    import { closeModal } from "../../core/modals";
    import { render, resetSub } from "../../core/navigation";
    import { sweepSealed } from "../../core/actions";
    import DialogHead from "../../core/dialog/DialogHead.svelte";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        return m && m.kind === "unlock" ? { n: store.meta.vault?.n || 0, err: m.err || "" } : null;
    });
    let pass = $state(""),
        busy = $state(false);
    async function unlock() {
        if (!pass || busy) return;
        const m = store.ui.modal;
        busy = true;
        try {
            await vaultUnlock(pass);
            if (ui.modal === m) closeModal();
            ui.private = true;
            sweepSealed();
            resetSub();
            ui.page = "profile";
            render();
            toast(`Opened your private collection: ${plural(vault.ids.size, "entry", "entries")}`);
        } catch (err) {
            busy = false;
            store.dialog({ err: errMessage(err) === "wrong" ? "That passphrase didn't work." : "Couldn't unlock." }, m);
        }
    }
</script>

{#if v}
    <DialogHead title="🔒 Private collection" />
    <p class="hint">{v.n} encrypted entries. Enter your passphrase to open them.</p>
    <!-- svelte-ignore a11y_autofocus: the passphrase is all there is to type -->
    <div class="field"><label for="vpu">Passphrase</label><input id="vpu" type="password" autocomplete="current-password" autofocus bind:value={pass} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); unlock(); } }}></div>
    {#if v.err}<p class="err">{v.err}</p>{/if}<div class="bar"><button class="btn gold" data-act="vault-unlock" disabled={busy} onclick={unlock}>{busy ? "Unlocking…" : "Unlock"}</button></div>
{/if}
