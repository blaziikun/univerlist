<!--
    src/features/account/JoinLink.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync, on a device opened from a "Sign in on another device" code (or its link): it says whose account the
      code signs into, and one tap signs this device in with that library. No passkey is made here. When this browser
      already has a library, or is signed in to an account, signing in merges it into the code's account, so that needs
      you to say the account is yours first (unticked to begin with: "Not now" leaves everything here as it was).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { acct, checkLink, joinNeedsChoice, joinWithLink, notJoining } from "./account-state.svelte";

    let mine = $state(false);
    const as = $derived(acct.joinAs),
        choose = $derived(joinNeedsChoice(as));

    onMount(() => {
        if (!acct.joinAs) checkLink();
    });
</script>

<div class="acct-card">
    <h3>Sign in on this device</h3>
    {#if as}
        <p class="hint">
            This code signs this device in to the account <b>{as.name}</b>. Go on only if that's your own account and you
            made the code on a device you're signed in on: your library comes in, and from then on both keep in step by
            themselves.
        </p>
        {#if choose}
            <p class="hint">
                {as.signedInAs
                    ? `This browser is signed in as ${as.signedInAs}${as.library ? " and has a library" : ""}.`
                    : "This browser already has a library."}
                Signing in to <b>{as.name}</b> {as.signedInAs ? "signs it out of that account and " : ""}merges this browser's
                library into <b>{as.name}</b>, where it's saved and anyone signed in to that account can see it.
            </p>
            <label class="bar"><input type="checkbox" bind:checked={mine} /> {as.name} is my own account: merge this browser's library into it</label>
        {/if}
    {/if}
    <div class="bar">
        <button class="btn gold" disabled={!!acct.busy || !as || (choose && !mine)} onclick={() => joinWithLink(mine)}>Sign in here</button>
        <button class="btn ghost" onclick={notJoining}>Not now</button>
    </div>
</div>
