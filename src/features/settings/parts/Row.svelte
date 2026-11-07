<!--
    src/features/settings/parts/Row.svelte
    ─────────────────────────────────────────────────────────────────
      One setting: its name and a line about it on the left, the control on the right (the same look as every other
      setting)
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    let { label, hint = "", children }: { label: string; hint?: string; children: Snippet } = $props();
</script>

<div class="srow">
    <div class="sl2"><b>{label}</b>{#if hint}<p class="hint">{hint}</p>{/if}</div>
    <div class="sc2">{@render children()}</div>
</div>
