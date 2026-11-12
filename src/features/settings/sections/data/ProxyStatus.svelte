<!--
    src/features/settings/sections/data/ProxyStatus.svelte
    ─────────────────────────────────────────────────────────────────
      Under the proxy script in Settings › Data: which sources your proxy has keys for. The first time it's shown the
      proxy is asked (pxStatusAsk in proxy.ts), and Settings draws again with the answer.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../../core/store.svelte";
    import { pxStatusAsk, pxStatusView } from "../../../sources/proxy";

    const v = $derived.by(() => {
        void store.ui;
        void store.meta;
        return pxStatusView();
    });
    // not known yet: ask (again each time the page draws while it isn't, as before)
    $effect(() => {
        if (v.k === "checking") pxStatusAsk();
    });
</script>

{#if v.k === "checking"}<p class="hint">Checking your proxy…</p>{:else if v.k === "old"}<p class="hint">Your proxy is the older IGDB-only script. Replace its code with the one below to add the other sources.</p>{:else}<div class="chips pxchips">{#each v.chips as c (c.l)}<span class="chip{c.on ? ' on' : ''}" title={c.on ? "Set up" : "No key in the Worker yet"}>{`${c.on ? "● " : "○ "}${c.l}`}</span>{/each}</div>{/if}
