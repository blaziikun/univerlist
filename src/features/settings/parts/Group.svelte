<!--
    src/features/settings/parts/Group.svelte
    ─────────────────────────────────────────────────────────────────
      A group of related settings, which folds away
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Snippet } from "svelte";

    let { title, open = true, children }: { title: string; open?: boolean; children: Snippet } = $props();
</script>

<details class="panel sgroup2" {open}>
    <summary><h3>{title}</h3></summary>
    <div class="sgbody">{@render children()}</div>
</details>
