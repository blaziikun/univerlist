<!--
    src/features/insights/discover/GoBar.svelte
    ─────────────────────────────────────────────────────────────────
      A Discover search's button, what it's doing while it runs (and Stop), and what went wrong or what it read.
      The button runs the search (runDiscover, discover.ts); Stop is "stop" (core/nav-handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { runDiscover } from "../discover";
    import type { Modal } from "../../core/model";

    let { m, label }: { m: Modal; label: string } = $props();
</script>

<div class="bar"><button class="btn gold" data-act="disc-go" disabled={!!(m.busy || m.syncing)} onclick={() => runDiscover()}>{label}</button>{#if m.busy}<span class="think">{m.status || "Working…"}</span><button class="btn ghost" data-act="stop">Stop</button>{/if}</div>{#if m.error}<p class="err">{m.error}</p>{/if}{#if m.warn}<p class="err">{m.warn}</p>{/if}{#if m.note && m.results}<p class="hint">{m.note}</p>{/if}
