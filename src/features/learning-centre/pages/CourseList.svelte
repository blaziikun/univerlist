<!--
    src/features/learning-centre/pages/CourseList.svelte
    ─────────────────────────────────────────────────────────────────
      All courses (the hub): Academic and Interests apart, each opening as the current course (learn-open), and the
      courses you've hidden. A new course is made from the bar above (lc-new).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { courseCardLook } from "./look";
    import CourseCard from "./CourseCard.svelte";

    let {
        kinds,
        hidden,
    }: {
        kinds: { w: string; wl: string; cards: ReturnType<typeof courseCardLook>[] }[];
        hidden: { id: string; name: string }[];
    } = $props();

    const any = $derived(kinds.some(k => k.cards.length));
</script>

<div class="learn"><div class="lhead"><div><h2 class="ltitle">Courses</h2><p class="hint">What you're learning, each in the best order to learn it: its topics, the books for each by level, and what to read next. Pick one to make it the current course across the Learning Centre.</p></div></div>
    {#if !any}<div class="empty"><p>No courses yet.</p><p class="hint">Type what you want to learn ("maths", "theoretical physics", "propulsion") and a course is built from the standard books and the programmes that teach it.</p><button class="btn gold" data-act="lc-new" data-k="">+ New course</button></div>{/if}
    {#each kinds as k (k.w)}{#if k.cards.length}<section class="group"><div class="plaque lkindh"><h3>{k.wl}</h3></div><div class="lcov">{#each k.cards as c (c.id)}<CourseCard {c} />{/each}</div></section>{/if}{/each}
    {#if hidden.length}<p class="hint">Hidden: {#each hidden as s, i (s.id)}{i ? ", " : ""}<button class="linkbtn" data-act="learn-unhide" data-k={s.id}>{s.name}</button>{/each}</p>{/if}</div>
