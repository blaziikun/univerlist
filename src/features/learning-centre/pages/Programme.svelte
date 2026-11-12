<!--
    src/features/learning-centre/pages/Programme.svelte
    ─────────────────────────────────────────────────────────────────
      What a pathway's programme adds up to: topics covered, credits done, modules you're taking, a credit-weighted
      mark, and how far through each area of topics you are. Only for a pathway with modules (programmeLook, look.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Pathway } from "../../core/model";
    import { programmeLook } from "./look";

    let { P }: { P: Pathway } = $props();

    const g = $derived(programmeLook(P));
</script>

{#if g}<section class="panel lcprog"><div class="tiles">{#each g.tiles.slice(0, 2) as [v, k] (k)}<div class="tile"><div class="v">{v}</div><div class="k">{k}</div></div>{/each}
    {#each g.tiles.slice(2) as [v, k] (k)}<div class="tile"><div class="v">{v}</div><div class="k">{k}</div></div>{/each}</div>
    {#if g.areas.length}<div class="covbars">{#each g.areas as x, i (i + x.a)}<div><span>{x.a}</span><span class="b"><span style="width:{x.w}%"></span></span><span class="v">{x.done}/{x.n}</span></div>{/each}</div>{/if}</section>{/if}
