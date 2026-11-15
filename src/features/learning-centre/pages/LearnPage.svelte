<!--
    src/features/learning-centre/pages/LearnPage.svelte
    ─────────────────────────────────────────────────────────────────
      The Learning Centre's Courses tab: the current course (the one you picked, else your default), or all of them
      (the hub). Which is ui.learnSub and ui.lcHub (lcCurId() in learning.ts). The course is copied here each time
      anything changes, as the older code changes it in place; the parts below draw the copy and save to the real thing.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { clone } from "../../core/core";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { LCS, lcCur } from "../learning";
    import { courseCardLook, LC_KINDS } from "./look";
    import LcHead from "./LcHead.svelte";
    import CourseList from "./CourseList.svelte";
    import Course from "./Course.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        const u = store.ui,
            S = u.lcHub ? undefined : lcCur();
        if (S) return { course: { C: clone(S), del: u.learnDel === S.id, open: u.lcOpen }, list: null };
        const L = LCS();
        return {
            course: null,
            list: {
                kinds: LC_KINDS.map(([w, wl]) => ({
                    w,
                    wl,
                    cards: L.filter(s => !s.hidden && (s.kind || "sci") === w).map(courseCardLook),
                })),
                hidden: L.filter(s => s.hidden).map(s => ({ id: s.id, name: s.name })),
            },
        };
    });
</script>

<HiddenNote />
<LcHead cur={v.course ? v.course.C.id : ""} />
{#if v.course}<Course {...v.course} />{:else if v.list}<CourseList {...v.list} />{/if}
