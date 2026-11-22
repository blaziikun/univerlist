<!--
    src/features/core/shell/Logo.svelte
    ─────────────────────────────────────────────────────────────────
      The app's name in the top bar, in the logo style you chose (logoLook in core/theme.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { logoLook } from "../theme";

    let { l }: { l: ReturnType<typeof logoLook> } = $props();
</script>

{#if l.style === "two"}<span class="logo two"><span class="l1">{l.parts[0]}</span><span class="l2">{l.parts[1]}</span></span>{:else}<span class="logo {l.style}">{l.parts[0]}</span>{/if}
