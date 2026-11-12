<!--
    src/features/learning-centre/pages/Line.svelte
    ─────────────────────────────────────────────────────────────────
      A sentence of plain, bold and linked words (lcLine in look.ts), drawn piece by piece, so its plain words stay one
      run of text as the page always had them.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { LcPiece } from "./look";

    let { parts }: { parts: LcPiece[] } = $props();
</script>

{#each parts as p}{#if "t" in p}{p.t}{:else if "b" in p}<b>{p.b}</b>{:else}<a class="link" href={p.a} target="_blank" rel="noopener">{p.label}</a>{/if}{/each}
