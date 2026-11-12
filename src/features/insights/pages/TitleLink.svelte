<!--
    src/features/insights/pages/TitleLink.svelte
    ─────────────────────────────────────────────────────────────────
      An entry's title as a link that opens its card, inside a sentence (Your taste).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { cleanTitle, titleOf } from "../../core/core";
    import type { Entry } from "../../core/model";

    let { b }: { b: Entry } = $props();
</script>

<button class="linkbtn" data-act="open" data-id={b.id}>{cleanTitle(titleOf(b))}</button>
