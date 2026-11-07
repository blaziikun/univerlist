<!--
    src/features/account/SetUp.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync, once per account: turn sync on. You'll get a recovery code to save; then add your other devices.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { acct, signOut, startSyncing } from "./account-state.svelte";
</script>

<div class="acct-card">
    <h3>Turn on sync</h3>
    <p class="hint">
        Your library is encrypted on this device before it's stored, so nobody else can read it, not even the site. Next
        you'll get a recovery code to keep safe, then you can add your phone by scanning a code.
    </p>
    <div class="bar"><button class="btn gold" disabled={!!acct.busy} onclick={startSyncing}>Start syncing</button></div>
    <p class="hint">Signed in as <b>{acct.me?.name}</b> · <button class="linkbtn" onclick={signOut}>Sign out</button></p>
</div>
