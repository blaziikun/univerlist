<!--
    src/features/account/Unlock.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync, signed in on a device that can't open your library by itself (its passkey can't unlock in this
      browser, or was made before passkey unlock): the recovery code, or another passkey, does it once. The easiest way
      to add a device is still a QR code from one that's already in (Sign in on another device).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { acct, signOut, unlockWithCode, unlockWithPasskey } from "./account-state.svelte";

    let code = $state("");
    const anyUnlocks = $derived(!!acct.me?.passkeys.some(p => p.box));

    async function unlock() {
        await unlockWithCode(code);
        if (!acct.error) code = "";
    }
</script>

<div class="acct-card">
    <h3>Unlock your library on this device</h3>
    <p class="hint">
        Easiest: on a device where you're already in, open Account & sync and choose <b>Sign in on another device</b>, then scan the code
        with this one. Or type your recovery code (once; this device remembers it).
    </p>
    {#if acct.me?.has_pass}
        <div class="bar">
            <input class="inp" bind:value={code} autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Recovery code" aria-label="Recovery code" />
            <button class="btn gold" disabled={!!acct.busy} onclick={unlock}>Unlock</button>
        </div>
    {/if}
    {#if anyUnlocks}
        <div class="bar"><button class="btn" disabled={!!acct.busy} onclick={unlockWithPasskey}>Use a passkey instead</button></div>
    {/if}
    <p class="hint">Signed in as <b>{acct.me?.name}</b> · <button class="linkbtn" onclick={signOut}>Sign out</button></p>
</div>
