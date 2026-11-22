<!--
    src/features/library/blocks/Bio.svelte
    ─────────────────────────────────────────────────────────────────
      The About you block: your bio for this mode, or a way to write one.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { OvBlock } from "../blocks";

    let { c }: { c: OvBlock } = $props();
</script>

{#if c.mp.bio}<p class="biotext">{c.mp.bio}</p>{:else}<p class="hint">No bio yet. <button class="linkbtn" data-act="profile-edit" data-k={c.mode.id}>Write one</button></p>{/if}
