<!--
    src/features/settings/parts/Seg.svelte
    ─────────────────────────────────────────────────────────────────
      A row of buttons where one is chosen (Comfortable | Compact)
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    let {
        options,
        value,
        label,
        onpick,
    }: { options: [string, string][]; value: string; label: string; onpick: (k: string) => void } = $props();
</script>

<div class="seg" role="group" aria-label={label}>
    {#each options as [k, l] (k)}
        <button aria-pressed={value === k} onclick={() => onpick(k)}>{l}</button>
    {/each}
</div>
