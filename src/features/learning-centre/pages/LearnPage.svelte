<!--
    src/features/learning-centre/pages/LearnPage.svelte
    ─────────────────────────────────────────────────────────────────
      The Learning Centre's Courses tab (and the old Pathways tab, in libraries that still have it): every course,
      Academic and Interests apart, or the course you opened (a pathway opens as its course). Where it is comes from
      ui.learnSub and ui.pwId, which the older code and the tests set too (learnOpen() in look.ts).
      The course and its pathway are copied here each time anything changes, as the older code changes them in place;
      the parts below draw the copy and save to the real thing.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { clone } from "../../core/core";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { coursePath, LSUBS } from "../learning";
    import { courseCardLook, LC_KINDS, learnOpen } from "./look";
    import CourseList from "./CourseList.svelte";
    import Course from "./Course.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        const u = store.ui,
            S = learnOpen();
        if (S)
            return {
                course: { S: clone(S), P: clone(coursePath(S)), del: u.learnDel === S.id, open: u.lcOpen, cmp: u.lcCmp },
                list: null,
            };
        const L = LSUBS();
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
{#if v.course}<Course {...v.course} />{:else if v.list}<CourseList {...v.list} />{/if}
