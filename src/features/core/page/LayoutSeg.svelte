<!--
    src/features/core/page/LayoutSeg.svelte
    ─────────────────────────────────────────────────────────────────
      A switch for how a page lays something out (Covers or Large, By shelf or All together…), kept with your layout
      (layoutSeg in library/connect.ts; layout-view in core/nav-handlers.ts saves it).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { LayoutSeg } from "../../library/connect";

    let { s }: { s: LayoutSeg } = $props();
</script>

<div class="seg" role="group">{#each s.opts as o (o.k)}<button data-act="layout-view" data-key={s.key} data-k={o.k} aria-pressed={o.on}>{o.l}</button>{/each}</div>
