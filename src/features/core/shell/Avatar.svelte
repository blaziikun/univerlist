<!--
    src/features/core/shell/Avatar.svelte
    ─────────────────────────────────────────────────────────────────
      Your picture, or your initial on the mode's colour (avatarLook in core/shell.ts): in the profile header and in
      Settings › General.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../dialog/Pic.svelte";
    import { avatarLook } from "../shell";

    let { mp, size = 32, cls = "" }: { mp: { avatar?: string; name?: string }; size?: number; cls?: string } = $props();

    const a = $derived(avatarLook(mp));
</script>

{#if a.src}<Pic class="av {cls}" src={a.src} width={size} height={size} />{:else}<span class="av ph {cls}" style="width:{size}px;height:{size}px">{a.initial}</span>{/if}
