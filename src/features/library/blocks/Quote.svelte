<!--
    src/features/library/blocks/Quote.svelte
    ─────────────────────────────────────────────────────────────────
      The A quote block: one of the lines you saved in this mode, a different one each day.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { cleanTitle, titleOf } from "../../core/core";
    import type { OvBlock } from "../blocks";

    let { c }: { c: OvBlock } = $props();

    const x = $derived.by(() => {
        const Q = c.M.flatMap(b => (b.quotes || []).map(q => ({ q, b })));
        return Q.length ? Q[Math.floor(Date.now() / 864e5) % Q.length] : null;
    });
</script>

{#if !x}<p class="hint">Save a quote from a card's Journal tab.</p>{:else}<blockquote class="bq">{x.q.text}</blockquote><button class="linkbtn" data-act="open" data-id={x.b.id}>— {cleanTitle(titleOf(x.b))}{x.q.page ? ", " + x.q.page : ""}</button>{/if}
