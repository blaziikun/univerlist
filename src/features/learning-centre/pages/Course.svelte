<!--
    src/features/learning-centre/pages/Course.svelte
    ─────────────────────────────────────────────────────────────────
      One course, top to bottom: its name and your level now → the level you're aiming for (the ⋯ beside them holds
      your level in each field, its kind, "This is a degree I'm taking", hiding and deleting it); then what to read
      next (Next), the map, what it was built from, and, only for a degree, its modules and marks. C is a copy
      (LearnPage.svelte): the boxes save to the course itself, found by its id.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, ticked } from "../../core/core";
    import type { Course } from "../../core/model";
    import { LEVELS, lcSub } from "../learning";
    import { lcFolds, LC_KINDS } from "./look";
    import FieldLevels from "./FieldLevels.svelte";
    import Next from "./Next.svelte";
    import CourseMap from "./CourseMap.svelte";
    import BuiltFrom from "./BuiltFrom.svelte";
    import Degree from "./Degree.svelte";

    let { C, del, open }: { C: Course; del: boolean; open: string | null | undefined } = $props();

    const NOW = LEVELS.slice(0, 5).map(([n], i): [string, string] => [String(i), i ? n : "Not started"]),
        GOALS = LEVELS.map(([n], i): [string, string] => [String(i), i ? n : "No goal"]);

    // the course's name, symbol and kind: an empty box keeps what it had
    function text(f: "kind" | "g" | "name", value: string) {
        const S = lcSub(C.id),
            v = value.trim();
        if (!S || !v) return;
        S[f] = v;
        markDirty();
    }
    function level(f: "now" | "goal", value: string) {
        const S = lcSub(C.id);
        if (!S) return;
        S[f] = Number(value);
        markDirty();
    }
    function degree(box: HTMLInputElement) {
        const S = lcSub(C.id);
        if (!S) return;
        S.degree = ticked(box) || undefined;
        markDirty();
    }
    // unfolded or not, remembered while you're on the page (lcFolds)
    // svelte-ignore state_referenced_locally
    let folded = $state(lcFolds.has("more:" + C.id));
    $effect(() => {
        if (folded) lcFolds.add("more:" + C.id);
        else lcFolds.delete("more:" + C.id);
    });
</script>

<div class="learn lccourse"><div class="lchead"><input class="inp lgin" data-learnsub={C.id} data-f="g" value={C.g || "∫"} maxlength="2" aria-label="Symbol" onchange={e => text("g", e.currentTarget.value)}><div class="lct"><!-- svelte-ignore a11y_missing_content: the heading is the box the course's name is typed in, labelled by its aria-label --><h2><input class="h2in" data-learnsub={C.id} data-f="name" value={C.name} aria-label="Course name" onchange={e => text("name", e.currentTarget.value)}></h2>
        <div class="lclvl"><label>Your level <select class="sel" id="lc-now" value={String(C.now || 0)} onchange={e => level("now", e.currentTarget.value)}>{#each NOW as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label><span aria-hidden="true">→</span><label>aiming for <select class="sel" id="lc-goal" value={String(C.goal || 0)} onchange={e => level("goal", e.currentTarget.value)}>{#each GOALS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
            <details bind:open={folded} class="lcmore"><summary aria-label="More about this course">⋯</summary><div class="lcpop">
                <label class="ctl"><input type="checkbox" id="lc-degree" checked={!!C.degree} onchange={e => degree(e.currentTarget)}> This is a degree I'm taking</label>
                <label class="ctl">Kind <select class="sel" data-learnsub={C.id} data-f="kind" aria-label="Kind" value={C.kind || "sci"} onchange={e => text("kind", e.currentTarget.value)}>{#each LC_KINDS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
                <FieldLevels S={C} />
                <div class="bar"><button class="btn sm ghost" data-act="learn-hide" data-k={C.id}>Hide</button>{#if del}<button class="btn sm danger" data-act="learn-del-yes" data-k={C.id}>Delete {C.name} and everything in it</button><button class="btn sm ghost" data-act="learn-del-no">Keep</button>{:else}<button class="btn sm ghost" data-act="learn-del" data-k={C.id}>Delete</button>{/if}</div></div></details></div></div></div>
    <Next {C} />
    <CourseMap {C} />
    <BuiltFrom {C} />
    {#if C.degree}<Degree {C} {open} />{/if}</div>
