<!--
    src/features/update/UpdateToast.svelte
    ─────────────────────────────────────────────────────────────────
      Update: "saved for offline" and "a new version is ready"
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    type Register = (o: { onNeedRefresh?: () => void; onOfflineReady?: () => void }) => (reload?: boolean) => Promise<void>;
    let { register }: { register: Register } = $props();

    let shown = $state<"" | "offline" | "update">("");
    let apply: (reload?: boolean) => Promise<void> = async () => {};

    onMount(() => {
        apply = register({
            onNeedRefresh: () => (shown = "update"),
            onOfflineReady: () => { shown = "offline"; setTimeout(() => { if (shown === "offline") shown = ""; }, 6000); }
        });
    });
</script>

{#if shown}
    <div class="toast" role="status">
        {#if shown === "update"}
            <span>A new version of UniverList is ready.</span>
            <button class="go" onclick={() => apply(true)}>Reload</button>
            <button onclick={() => (shown = "")}>Later</button>
        {:else}
            <span>Saved for offline use: UniverList now opens with no internet.</span>
            <button onclick={() => (shown = "")}>OK</button>
        {/if}
    </div>
{/if}

<style lang="scss">
    @use "../../styles/tokens" as *;
    .toast {
        @include panel;
        position: fixed; z-index: 9999; left: 50%; bottom: 20px; transform: translateX(-50%);
        display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px;
        font: 500 14px/1.3 var(--f-ui, system-ui); color: inherit; box-shadow: 0 10px 40px rgba(0, 0, 0, .45);
        animation: rise .35s $ease-out;
        @include phone { left: 12px; right: 12px; transform: none; flex-wrap: wrap; }
    }
    button { font: inherit; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: transparent; color: inherit; cursor: pointer; }
    .go { background: var(--accent); border-color: var(--accent); color: #000; }
    @keyframes rise { from { opacity: 0; translate: 0 12px; } }
</style>
