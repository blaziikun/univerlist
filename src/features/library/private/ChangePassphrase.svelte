<!--
    src/features/library/private/ChangePassphrase.svelte
    ─────────────────────────────────────────────────────────────────
      Change the private collection's passphrase: the new one twice. Everything private is sealed again with it
      (vaultChangePass). Opened by "vault-pass" in Settings › Private collection; Change and Enter are this one's own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { PASSPHRASE_HINT, PASSPHRASE_MIN, toast, vaultChangePass } from "../../core/core";
    import { closeModal } from "../../core/modals";
    import DialogHead from "../../core/dialog/DialogHead.svelte";

    let a = $state(""),
        b = $state("");
    async function change() {
        if (a.length < PASSPHRASE_MIN) {
            toast(PASSPHRASE_HINT);
            return;
        }
        if (a !== b) {
            toast("Those don't match.");
            return;
        }
        await vaultChangePass(a);
        closeModal();
        toast("Passphrase changed");
    }
</script>

<DialogHead title="Change passphrase" />
<p class="hint">Everything private is re-encrypted with the new passphrase. The old one stops working.</p>
<!-- svelte-ignore a11y_autofocus: the new passphrase is all there is to type -->
<div class="fields"><div class="field full"><label for="vn1">New passphrase</label><input id="vn1" type="password" autocomplete="new-password" autofocus bind:value={a}></div><div class="field full"><label for="vn2">Again</label><input id="vn2" type="password" autocomplete="new-password" bind:value={b} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); change(); } }}></div></div>
<div class="bar"><button class="btn gold" data-act="vault-pass-save" onclick={change}>Change</button></div>
