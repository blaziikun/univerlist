<!--
    src/features/library/tiles/MediumDot.svelte
    ─────────────────────────────────────────────────────────────────
      The medium's coloured dot before a title, in a mode with more than one medium (mdotLook in core/views.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { mdotLook } from "../../core/views";

    let { m }: { m: string } = $props();

    // the mode decides whether it's shown
    const d = $derived.by(() => {
        void store.ui;
        return mdotLook(m);
    });
</script>

{#if d}<span class="mdot" style={d.style} title={d.title}></span>{/if}
