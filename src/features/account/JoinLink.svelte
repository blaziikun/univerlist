<!--
    src/features/account/JoinLink.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync, on a device opened from a "Sign in on another device" code (or its link): one tap, and it's signed
      in with your library. No passkey is made here: the code came from a device you're already signed in on.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { acct, joinWithLink, notJoining } from "./account-state.svelte";
</script>

<div class="acct-card">
    <h3>Sign in on this device</h3>
    <p class="hint">
        The code you scanned comes from a device you're already signed in on. Tap below and your library comes in; from then
        on both keep in step by themselves.
    </p>
    <div class="bar">
        <button class="btn gold" disabled={!!acct.busy} onclick={joinWithLink}>Sign in here</button>
        <button class="btn ghost" onclick={notJoining}>Not now</button>
    </div>
</div>
