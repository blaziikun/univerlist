<!--
    src/features/learning-centre/pages/CourseCard.svelte
    ─────────────────────────────────────────────────────────────────
      A course on the Courses page, in the pathway card's look: its symbol and name, your level and what you're aiming
      for, its university and programme, its summary, how far through it you are, and what you're reading in it.
      Pressing it opens the course (learn-open). courseCardLook() in look.ts works out what it shows.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { courseCardLook } from "./look";

    let { c }: { c: ReturnType<typeof courseCardLook> } = $props();
</script>

<button class="lcpath" data-act="learn-open" data-k={c.id}><span class="lcph"><b>{c.name}</b>{#if c.level}<i>{c.level}</i>{/if}</span>
    {#if c.uni}<small class="lcuni">{c.uni}</small>{/if}
    {#if c.about}<span class="lcabout">{c.about}</span>{/if}
    <span class="lbar"><i style="width:{c.width}%"></i></span>
    <small>{c.line}</small></button>
