<!--
    src/features/account/More.svelte
    ─────────────────────────────────────────────────────────────────
      Account & sync › More: older versions to go back to, what happened, the recovery code, replacing your passkey, and
      leaving
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { acct, deleteAccount, history, replacePasskey, replaceRecoveryCode, restore, signOut, signOutAndClear, type History } from "./account-state.svelte";
    import { size, when } from "./format";

    const me = $derived(acct.me!);
    let past = $state<History>({ audit: [], versions: [] });
    let typed = $state("");

    onMount(async () => {
        past = await history().catch(() => past);
    });
</script>

<div class="acct-cols">
    <section>
        <p class="label">Older versions</p>
        {#each past.versions as v (v.version)}
            <div class="acct-row">
                <span>Version {v.version}</span>
                <small class="hint">{when(v.at)} · {size(v.size)}</small>
                {#if v.version !== me.version}<button class="linkbtn" onclick={() => restore(v.version)}>Go back to this</button>{/if}
            </div>
        {/each}
    </section>
    <section>
        <p class="label">What happened</p>
        <div class="acct-audit">
            {#each past.audit as a, i (i)}
                <div class="acct-row"><span>{a.kind}</span><small class="hint">{a.detail} · {when(a.at)}</small></div>
            {/each}
        </div>
    </section>
</div>

<div class="acct-cols">
    <section>
        <p class="label">Recovery code</p>
        <p class="hint">{me.has_pass ? "Lost it? Make a new one: the old one stops working." : "You don't have one yet: make one and keep it safe."}</p>
        <div class="bar"><button class="btn sm" disabled={!!acct.busy} onclick={replaceRecoveryCode}>Make a new recovery code</button></div>
    </section>
    <section>
        <p class="label">New passkey</p>
        <p class="hint">Lost your passkey, or moving to a phone that doesn't have it? Make a new one on this device. It replaces the old one: you still have just one.</p>
        <div class="bar"><button class="btn sm" disabled={!!acct.busy} onclick={replacePasskey}>Replace my passkey</button></div>
    </section>
    <section>
        <p class="label">Leave</p>
        <div class="bar"><button class="btn sm ghost" onclick={signOut}>Sign out here</button></div>
        <div class="bar"><button class="btn sm ghost" onclick={signOutAndClear}>Sign out and remove my library from this browser</button></div>
        <p class="hint">The second is for a computer that isn't yours: nothing of yours is left here. Your library stays in your account.</p>
        <div class="bar">
            <input class="inp" bind:value={typed} placeholder="Type DELETE" aria-label="Type DELETE to confirm" style="max-width:140px" />
            <button class="btn sm danger" onclick={() => deleteAccount(typed)}>Delete my account and cloud copy</button>
        </div>
        <p class="hint">Your library on this device stays.</p>
    </section>
</div>

<style>
    .acct-audit { max-height: 240px; overflow: auto; }
</style>
