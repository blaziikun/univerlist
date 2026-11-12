<!--
    src/features/learning-centre/pages/CourseList.svelte
    ─────────────────────────────────────────────────────────────────
      Courses: what you're learning, Academic and Interests apart, each with a box to add one (Enter adds it and opens
      it), "From a university's page…" (the NewCourse dialog), and the courses you've hidden.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, ui } from "../../core/core";
    import type { Course } from "../../core/model";
    import { acId, LSUBS } from "../learning";
    import type { courseCardLook } from "./look";
    import CourseCard from "./CourseCard.svelte";

    let {
        kinds,
        hidden,
    }: {
        kinds: { w: string; wl: string; cards: ReturnType<typeof courseCardLook>[] }[];
        hidden: { id: string; name: string }[];
    } = $props();

    // Enter in a "+ Course" box makes it (under the kind it's in) and opens it
    function add(e: KeyboardEvent & { currentTarget: HTMLInputElement }, kind: string) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const v = e.currentTarget.value.trim();
        if (!v) return;
        const S: Course = { id: acId(), name: v, g: v.charAt(0).toUpperCase(), fields: {}, order: [], goal: 0 };
        if (kind === "arts") S.kind = "arts"; // made under Interests
        LSUBS().push(S);
        ui.learnSub = S.id;
        e.currentTarget.value = "";
        markDirty();
    }
</script>

<div class="learn"><div class="lhead"><div><h2 class="ltitle">Courses</h2><p class="hint">What you're learning: a degree subject or anything you're into. Each course is one place: your level in its fields, what to read in what order, its years and modules, and the programmes you compare in Curricula.</p></div><span class="spacer"></span>
    <button class="btn sm" data-act="lc-newpath" data-k="">From a university's page…</button></div>
    {#each kinds as k (k.w)}<section class="group"><div class="plaque lkindh"><h3>{k.wl}</h3></div><div class="lcov">{#each k.cards as c, i (i + c.id)}<CourseCard {c} />{/each}
        <div class="lcpath lcnew"><b>+ {k.w === "arts" ? "Interest" : "Course"}</b><input class="inp" placeholder={k.w === "arts" ? "e.g. Music theory, Chess" : "e.g. Mathematics, Philosophy"} data-learnnew={k.w} aria-label="New {k.w === 'arts' ? 'interest' : 'course'}" onkeydown={e => add(e, k.w)}><small class="hint">Press Enter</small></div></div></section>{/each}
    {#if hidden.length}<p class="hint">Hidden: {#each hidden as s, i (i + s.id)}{i ? ", " : ""}<button class="linkbtn" data-act="learn-unhide" data-k={s.id}>{s.name}</button>{/each}</p>{/if}</div>
