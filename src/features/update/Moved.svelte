<!--
    src/features/update/Moved.svelte
    ─────────────────────────────────────────────────────────────────
      At the old address with a library: UniverList has moved, and how to take the library across (moved.ts). Signed
      in, the new address brings it down once you sign in there with your recovery code; otherwise Download everything
      (the usual dialog) and drop the file there. "Later" hides it until the next visit.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { HOME } from "./moved";

    let { signedIn }: { signedIn: boolean } = $props();
    let shown = $state(true);
</script>

{#if shown}
    <div class="moved" role="status">
        <p>
            <b>UniverList has moved to univerlist.app.</b>
            {#if signedIn}
                Your library syncs, so sign in there with your recovery code and it comes across (you'll make a new passkey
                there: a passkey belongs to its address).
            {:else}
                Your library stays in this browser at this address: download it here, then drop the file on univerlist.app.
            {/if}
        </p>
        <div class="acts">
            {#if !signedIn}<button data-act="export-open">Download everything…</button>{/if}
            <a class="go" href={HOME}>Open univerlist.app</a>
            <button onclick={() => (shown = false)}>Later</button>
        </div>
    </div>
{/if}

<style lang="scss">
    @use "../../styles/tokens" as *;
    .moved {
        @include panel;
        position: fixed; z-index: 9998; left: 50%; top: 16px; transform: translateX(-50%);
        width: min(640px, calc(100% - 24px));
        display: flex; flex-direction: column; gap: 10px; padding: 14px 16px;
        font: 400 14px/1.45 var(--f-ui, system-ui); color: inherit; box-shadow: 0 10px 40px rgba(0, 0, 0, .45);
    }
    p { margin: 0; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; }
    button, a { font: 500 14px/1.3 var(--f-ui, system-ui); padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; text-decoration: none; }
    .go { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #000); }
</style>
