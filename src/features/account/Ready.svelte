<!--
    src/features/account/Ready.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync, signed in and unlocked: sign in on another device, when it last synced, your passkey, where you're in
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { acct, keepOnlyPasskey, letPasskeyUnlock, replacePasskey, revoke, showQr, syncHere } from "./account-state.svelte";
    import { state as syncState } from "./sync";
    import { size, when } from "./format";
    import LinkQr from "./LinkQr.svelte";
    import More from "./More.svelte";

    const me = $derived(acct.me!);
    const signsInOnly = $derived(me.passkeys.filter(p => !p.box));
    let showMore = $state(false);
</script>

{#if acct.newPasskey}
    <div class="acct-card">
        <h3>Set up a new passkey?</h3>
        <p class="hint">You signed in with your recovery code. If your old passkey is lost, make a new one on this device: it takes the old one's place, so you still have just one.</p>
        <div class="bar">
            <button class="btn gold" disabled={!!acct.busy} onclick={replacePasskey}>Set up a new passkey</button>
            <button class="btn ghost" onclick={() => (acct.newPasskey = false)}>Not now</button>
        </div>
    </div>
{/if}

<div class="acct-card">
    <div class="acct-head">
        <div>
            <h3>{me.name}</h3>
            <p class="hint">
                {me.version ? `Saved ${when(me.updated)} · ${size(me.size)}` : "Nothing saved yet"}
                {syncState().at ? ` · this device synced ${when(syncState().at)}` : ""}
            </p>
        </div>
        <button class="btn" disabled={!!acct.busy} onclick={syncHere}>Sync now</button>
    </div>
    <p class="hint">Keeps in step by itself: a minute or two after you change something, and whenever you come back to the app.</p>
    {#if !acct.qr}
        <div class="bar">
            <button class="btn gold" disabled={!!acct.busy} onclick={showQr}>Sign in on another device</button>
            <span class="hint">Your phone or another computer: scan a code, or open a link there. No new passkey.</span>
        </div>
    {/if}
    {#if !me.recovery_signin}
        <p class="hint">Your recovery code was made before it could sign you in, only unlock. <button class="linkbtn" onclick={() => (showMore = true)}>Make a new one</button> so it can do both.</p>
    {/if}
</div>
<LinkQr />

<div class="acct-cols">
    <section>
        <p class="label">{me.passkeys.length > 1 ? "Passkeys" : "Your passkey"}</p>
        {#if me.passkeys.length > 1}
            <p class="hint">You only need one. Keep the one you use (it's usually the newest on your phone or Mac) and the others are removed.</p>
        {/if}
        {#each me.passkeys as k (k.id)}
            <div class="acct-row">
                <span>{k.label || "A passkey"}</span>
                <small class="hint">made {when(k.created)}{k.used ? ` · used ${when(k.used)}` : ""}</small>
                {#if me.passkeys.length > 1}<button class="linkbtn" disabled={!!acct.busy} onclick={() => keepOnlyPasskey(k.id)}>Keep only this one</button>{/if}
            </div>
        {/each}
        {#if signsInOnly.length}
            <p class="hint">Your passkey signs you in but can't unlock your library by itself yet.
                <button class="linkbtn" disabled={!!acct.busy} onclick={letPasskeyUnlock}>Let it unlock too</button></p>
        {/if}
    </section>
    <section>
        <p class="label">Signed in on</p>
        {#each me.sessions as s (s.id)}
            <div class="acct-row">
                <span>{s.label || "A device"}{s.current ? " (this one)" : ""}</span>
                <small class="hint">{when(s.seen)}</small>
                {#if !s.current}<button class="linkbtn" onclick={() => revoke(s.id)}>Sign out</button>{/if}
            </div>
        {/each}
        {#if me.sessions.length > 1}<button class="btn sm ghost" onclick={() => revoke()}>Sign out everywhere else</button>{/if}
    </section>
</div>

<button class="linkbtn" onclick={() => (showMore = !showMore)}>
    {showMore ? "Less" : "More: history, older versions, recovery code, new passkey and leaving"}
</button>
{#if showMore}<More />{/if}

<style>
    .acct-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
</style>
