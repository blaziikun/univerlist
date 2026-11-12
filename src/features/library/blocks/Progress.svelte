<!--
    src/features/library/blocks/Progress.svelte
    ─────────────────────────────────────────────────────────────────
      The In progress block: where you are in each thing you're in the middle of, with a quick +1 (or ✓ for things
      that have no steps).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { MEDIA, statusWord, titleOf } from "../../core/core";
    import { pct, progText } from "../../core/views";
    import { activeOf, type OvBlock } from "../blocks";
    import Cover from "../tiles/Cover.svelte";

    let { c }: { c: OvBlock } = $props();

    const A = $derived(activeOf(c.M));
</script>

{#if A.length}<div class="nrows">{#each A.slice(0, c.n) as b, i (i + b.id)}{@const st = MEDIA[b.medium].steps}<div class="nrow"><button class="nc" data-act="open" data-id={b.id}><Cover {b} /></button><div class="nb2"><button class="t" data-act="open" data-id={b.id}>{titleOf(b)}</button>
    <div class="pg"><span>{progText(b)}</span>{#if b.total}<span>{pct(b)}%</span>{/if}</div><div class="prog"><span style="width:{pct(b)}%"></span></div></div>
    {#if st.length}<button class="btn sm" data-act="log-add" data-id={b.id} data-k={st[0]} title="Log +{st[0]}">+{st[0]}</button>{:else}<button class="btn sm" data-act="finish" data-id={b.id} title="Mark as {statusWord('done', b.medium)}">✓</button>{/if}</div>{/each}</div>{#if A.length > c.n}<button class="linkbtn" data-act="lib-status" data-k="active">All {A.length}</button>{/if}{:else}<p class="hint">Nothing in progress.</p>{/if}
