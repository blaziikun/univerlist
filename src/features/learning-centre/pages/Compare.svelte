<!--
    src/features/learning-centre/pages/Compare.svelte
    ─────────────────────────────────────────────────────────────────
      Compare a pathway with another programme (another course's pathway with topics): which of its topics are in
      this one, covered or not yet. Which one is ui.lcCmp. Only when there's another to compare with.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import type { Pathway } from "../../core/model";
    import { compareLook } from "./look";

    let { P, cmp }: { P: Pathway; cmp: string | null | undefined } = $props();

    const c = $derived(compareLook(P, cmp));
</script>

{#if c}<section class="panel"><h3 class="pwh">Compare with another programme</h3><div class="bar"><select class="sel" id="lc-cmp" aria-label="Programme to compare with" value={c.chosen} onchange={e => store.go({ lcCmp: e.currentTarget.value || null })}>{#each c.options as [k, l], i (i + k)}<option value={k}>{l}</option>{/each}</select></div>
    {#if c.other}<p class="hint">{c.other.line}</p><div class="topics">{#each c.other.topics as x, i (i + x.t)}<span class="topic {x.cls}" title={x.title}>{x.t}</span>{/each}</div><p class="hint">Filled: covered · outlined: here, not done yet · faded: not here.</p>{/if}</section>{/if}
