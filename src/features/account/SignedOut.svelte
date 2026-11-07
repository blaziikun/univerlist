<!--
    src/features/account/SignedOut.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync, signed out: make an account, sign in with your passkey, or (passkey lost) with your recovery code
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../core/store.svelte";
    import { acct, signIn, signInWithCode, signUp } from "./account-state.svelte";

    let name = $state(store.meta.profile.name || ""),
        code = $state(""),
        lost = $state(false);
</script>

<div class="acct-card">
    <h3>Your library on all your devices</h3>
    <p class="hint">
        You sign in with a <b>passkey</b> (your fingerprint, face or device PIN): no password to remember or leak. Your
        library is <b>encrypted on this device</b> before it goes anywhere, so nobody else can read it, and it follows you to
        your phone and other computers.
    </p>
    <div class="bar">
        <input class="inp" bind:value={name} placeholder="Your name" maxlength="40" aria-label="Your name" />
        <button class="btn gold" disabled={!!acct.busy} onclick={() => signUp(name)}>Create an account</button>
    </div>
    <div class="bar">
        <span class="hint">Already have one?</span>
        <button class="btn" disabled={!!acct.busy} onclick={signIn}>Sign in with a passkey</button>
        <button class="linkbtn" onclick={() => (lost = !lost)}>Lost your passkey?</button>
    </div>
    {#if lost}
        <div class="bar">
            <input class="inp" bind:value={code} autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Recovery code" aria-label="Recovery code to sign in" />
            <button class="btn" disabled={!!acct.busy} onclick={() => signInWithCode(code)}>Sign in with it</button>
        </div>
    {/if}
    <p class="hint">
        Signed in on another device already? There, open Account & sync and choose <b>Sign in on another device</b>, then
        scan the code with this one (or open its link here). No passkey needed.
    </p>
    <p class="hint"><a href="privacy.html" target="_blank" rel="noopener">What's kept, and the terms</a></p>
</div>
