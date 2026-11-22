<!--
    src/features/library/blocks/Queue.svelte
    ─────────────────────────────────────────────────────────────────
      The Up next block: the first things in your queue.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { MEDIA, titleOf } from "../../core/core";
    import { queueOf, type OvBlock } from "../blocks";
    import Cover from "../tiles/Cover.svelte";

    let { c }: { c: OvBlock } = $props();

    const Q = $derived((void c, queueOf()));
</script>

{#if Q.length}<div class="board">{#each Q.slice(0, 6) as b, i (i + b.id)}<button data-act="open" data-id={b.id}><span class="r">{i + 1}</span><Cover {b} /><span class="t">{titleOf(b)}</span><span class="hint">{b.kind || MEDIA[b.medium].one}</span></button>{/each}</div>{:else}<p class="hint">Queue things from their cards.</p>{/if}
