<!--
    src/features/learning-centre/pages/CourseCard.svelte
    ─────────────────────────────────────────────────────────────────
      A course on the hub: its symbol and name, your level → what you're aiming for, how far through its books you are,
      and what you're reading in it. Pressing it makes it the current course (learn-open). courseCardLook() in look.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { courseCardLook } from "./look";

    let { c }: { c: ReturnType<typeof courseCardLook> } = $props();
</script>

<button class="lcpath" data-act="learn-open" data-k={c.id}><span class="lcph"><b>{c.name}</b>{#if c.def}<i class="pill lcdef">Default</i>{/if}</span>
    {#if c.level}<small class="lcuni">{c.level}</small>{/if}
    <span class="lbar"><i style="width:{c.width}%"></i></span>
    <small>{c.line}</small></button>
