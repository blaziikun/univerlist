<!--
    src/features/core/dialog/DialogHead.svelte
    ─────────────────────────────────────────────────────────────────
      A dialog's heading: its title, anything beside it, and Close (data-act="close": closeModal, or back to the dialog
      this one was opened from). The same markup every dialog drawn as HTML had (head() in core/modals.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="mhead"><h3>{title}</h3>{@render children?.()}<button class="x" data-act="close" aria-label="Close">Close ✕</button></div>
