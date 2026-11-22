<!--
    src/features/library/blocks/Health.svelte
    ─────────────────────────────────────────────────────────────────
      The Library health block: possible duplicates, entries without a cover, finished but not scored, stalled, and
      hidden, each with a way to fix it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { healthOf, type OvBlock } from "../blocks";

    let { c }: { c: OvBlock } = $props();

    const H = $derived(healthOf(c.M));
    const rows = $derived([
        [H.dupes, "possible duplicates", "health-dupes"],
        [H.noCover, "without a cover", "health-covers"],
        [H.unscored, "finished but not scored", "health-unscored"],
        [H.stale, "in progress, untouched for 2 months", "health-stale"],
        ...(H.hidden ? [[H.hidden, "hidden", "hidden-view"] as const] : []),
    ] as const);
</script>

{#each rows as [n, label, act] (act)}<div class="hrow{n ? '' : ' ok'}"><span class="n">{n || "✓"}</span><span>{label}</span>{#if n}<button class="linkbtn" data-act={act} data-k="">Fix</button>{/if}</div>{/each}
