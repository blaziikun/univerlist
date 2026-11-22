<!--
    src/features/account/Account.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Account & sync

      Sign in with a passkey; your library syncs between your devices, encrypted here before it leaves.
      This picks which part to show; what each does is in account-state.svelte.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { acct, load } from "./account-state.svelte";
    import SignedOut from "./SignedOut.svelte";
    import SetUp from "./SetUp.svelte";
    import Unlock from "./Unlock.svelte";
    import Ready from "./Ready.svelte";
    import SaveCode from "./SaveCode.svelte";
    import JoinLink from "./JoinLink.svelte";

    // Ask the server how the account stands when this opens, when you open it again (Settings › Account & sync, even if
    // it's already showing), and when you come back to the tab: another device may have signed in or changed something.
    // Not on every redraw: each ask counts toward the account's daily reads.
    onMount(() => {
        load();
        // not in the middle of a step (a passkey prompt can hide the tab for a moment) or while a code is on screen
        const again = () => !acct.busy && !acct.code && !acct.joining && load();
        const opened = (e: Event) => (e as CustomEvent).detail === "account" && again(),
            back = () => document.visibilityState === "visible" && again();
        document.addEventListener("ul:settings-open", opened);
        document.addEventListener("visibilitychange", back);
        return () => {
            document.removeEventListener("ul:settings-open", opened);
            document.removeEventListener("visibilitychange", back);
        };
    });
</script>

<div class="acct">
    {#if acct.code}
        <SaveCode />
    {:else if acct.joining}
        <JoinLink />
    {:else if acct.view === "loading"}
        <p class="hint">Checking…</p>
    {:else if acct.view === "nosite"}
        <p class="hint">
            {acct.error ||
                "Sign-in works on the website (it needs a passkey, which a file opened from disk can't use). Your library here works the same either way."}
        </p>
    {:else if acct.view === "noserver"}
        <p class="hint">This copy's server doesn't have sync set up. (Hosting your own? The steps are in the README.)</p>
    {:else if acct.view === "out"}
        <SignedOut />
    {:else if acct.view === "setup"}
        <SetUp />
    {:else if acct.view === "locked"}
        <Unlock />
    {:else if acct.view === "ready"}
        <Ready />
    {/if}

    {#if acct.busy}<p class="hint" role="status">{acct.busy}</p>{/if}
    {#if acct.error}<p class="acct-err" role="alert">{acct.error}</p>{/if}
    {#if acct.note}<p class="hint" role="status">{acct.note}</p>{/if}
</div>

<style>
    /* shared by every part of the account page (they're children, so the rules reach them through :global) */
    .acct { display: flex; flex-direction: column; gap: 14px; }
    .acct :global(.acct-card) { border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
    .acct :global(.acct-card h3) { margin: 0; font-family: var(--f-head); font-size: 18px; }
    .acct :global(.acct-cols) { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
    .acct :global(.acct-row) { display: flex; align-items: baseline; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--line); }
    .acct :global(.acct-row > span) { flex: 1; min-width: 0; }
    .acct :global(.bar) { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .acct :global(.bar .inp) { flex: 1; min-width: 150px; }
    .acct-err { color: var(--danger, #e06c6c); margin: 0; }
</style>
