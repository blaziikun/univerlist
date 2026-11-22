<!--
    src/features/library/blocks/ModeBlock.svelte
    ─────────────────────────────────────────────────────────────────
      The blocks a mode's own page has a small version of: This season, Series, Diary and Now playing. Each is drawn
      beside its page (insights/pages/…Mini.svelte), from the same function the page uses.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { OvBlock } from "../blocks";
    import SeasonalMini from "../../insights/pages/SeasonalMini.svelte";
    import SeriesMini from "../../insights/pages/SeriesMini.svelte";
    import DiaryMini from "../../insights/pages/DiaryMini.svelte";
    import PlayingMini from "../../insights/pages/PlayingMini.svelte";

    let { c }: { c: OvBlock } = $props();
</script>

{#if c.cfg.k === "seasonal"}<SeasonalMini />{:else if c.cfg.k === "series"}<SeriesMini M={c.M} />{:else if c.cfg.k === "diary"}<DiaryMini M={c.M} />{:else}<PlayingMini M={c.M} />{/if}
