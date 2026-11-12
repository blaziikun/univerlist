<!--
    src/features/insights/discover/SearchLinks.svelte
    ─────────────────────────────────────────────────────────────────
      "Search elsewhere for things like…": links to the sites that know about one of your entries (searchLinks in
      discover.ts), for when the searches here don't find enough.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { cleanTitle, safeUrl, titleOf } from "../../core/core";
    import { searchLinks } from "../discover";
    import type { Entry } from "../../core/model";

    let { b }: { b: Entry } = $props();
</script>

<div class="sec"><p class="label">Search elsewhere for things like {cleanTitle(titleOf(b))}</p><p>{#each searchLinks(b) as [l, u], i}{i ? "  ·  " : ""}<a class="link" href={safeUrl(u)} target="_blank" rel="noopener">{l} ↗</a>{/each}</p></div>
