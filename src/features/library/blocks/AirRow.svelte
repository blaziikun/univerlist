<!--
    src/features/library/blocks/AirRow.svelte
    ─────────────────────────────────────────────────────────────────
      A next episode or chapter of something you follow: its cover, which one, how far behind you are, and the time
      left, which counts down by itself. airLook() in core/views.ts works it out, for airRow too.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import type { Entry } from "../../core/model";
    import { airLook, until } from "../../core/views";
    import Cover from "../tiles/Cover.svelte";

    let { b }: { b: Entry } = $props();

    const x = $derived(airLook(b));
    // the time left, worked out again every half minute
    let now = $state(Date.now());
    onMount(() => {
        const t = setInterval(() => (now = Date.now()), 30000);
        return () => clearInterval(t);
    });
    const left = $derived(x ? (void now, until(x.at)) : "");
</script>

{#if x}<button class="air" data-act="open" data-id={b.id}><Cover {b} /><span class="t">{x.title}<small>{x.what}</small></span><span class="when" data-at={x.at}>{left}</span></button>{/if}
