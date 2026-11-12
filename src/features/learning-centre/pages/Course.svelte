<!--
    src/features/learning-centre/pages/Course.svelte
    ─────────────────────────────────────────────────────────────────
      One course: its name and symbol, its kind and the level you're aiming for, hiding and deleting it; then its
      pathway (Pathway.svelte), your level in each of its fields, the hub (mastery, crème de la crème, the best places
      to learn it, opportunities) and its Curricula. S and P are copies (LearnPage.svelte): the boxes save to the course
      itself, found by its id.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty } from "../../core/core";
    import type { Course, Pathway } from "../../core/model";
    import { LEVELS, lcSub, PWS } from "../learning";
    import { curriculaNote, LC_KINDS, levelHint } from "./look";
    import Pathway_ from "./Pathway.svelte";
    import FieldLevels from "./FieldLevels.svelte";
    import Mastery from "./Mastery.svelte";
    import Creme from "./Creme.svelte";
    import Sources from "./Sources.svelte";
    import Opportunities from "./Opportunities.svelte";

    let {
        S,
        P,
        del,
        open,
        cmp,
    }: { S: Course; P: Pathway; del: boolean; open: string | null | undefined; cmp: string | null | undefined } = $props();

    const hint = $derived(levelHint(S)),
        cur = $derived(curriculaNote(S));
    const GOALS = LEVELS.map(([n], i): [string, string] => [String(i), i ? n : "No goal"]);

    // the course's name, symbol and kind: an empty box keeps what it had; a new name is its pathway's name too
    function text(f: "kind" | "g" | "name", value: string) {
        const C = lcSub(S.id),
            v = value.trim();
        if (!C || !v) return;
        C[f] = v;
        if (f === "name") for (const Q of PWS()) if (Q.sub === C.id) Q.name = v;
        markDirty();
    }
    function goal(value: string) {
        const C = lcSub(S.id);
        if (!C) return;
        C.goal = Number(value);
        markDirty();
    }
</script>

<div class="learn"><div class="lhead"><button class="btn sm ghost" data-act="learn-open" data-k="">← All courses</button><span class="spacer"></span>
    <label class="ctl"><select class="sel" data-learnsub={S.id} data-f="kind" aria-label="Kind" value={S.kind || "sci"} onchange={e => text("kind", e.currentTarget.value)}>{#each LC_KINDS as [k, l]}<option value={k}>{l}</option>{/each}</select></label>
    <label class="ctl">Aiming for <select class="sel" data-learngoal={S.id} value={String(S.goal || 0)} onchange={e => goal(e.currentTarget.value)}>{#each GOALS as [k, l]}<option value={k}>{l}</option>{/each}</select></label>
    <button class="btn sm ghost" data-act="learn-hide" data-k={S.id}>Hide</button>
    {#if del}<button class="btn sm danger" data-act="learn-del-yes" data-k={S.id}>Delete {S.name} and everything in it</button><button class="btn sm ghost" data-act="learn-del-no">Keep</button>{:else}<button class="btn sm ghost" data-act="learn-del" data-k={S.id}>Delete</button>{/if}</div>
    <div class="lsubj"><input class="inp lgin" data-learnsub={S.id} data-f="g" value={S.g || "∫"} maxlength="2" aria-label="Symbol" onchange={e => text("g", e.currentTarget.value)}><div><!-- svelte-ignore a11y_missing_content: the heading is the box the course's name is typed in, labelled by its aria-label --><h2><input class="h2in" data-learnsub={S.id} data-f="name" value={S.name} aria-label="Course name" onchange={e => text("name", e.currentTarget.value)}></h2>
        <p class="hint">{hint}</p></div></div></div>
<Pathway_ {P} {open} {cmp} />
<div class="learn"><FieldLevels {S} />
    <Mastery {S} /><Creme {S} /><Sources {S} /><Opportunities {S} />
    <section class="panel"><h3 class="pwh">Curricula</h3><p class="hint">{cur.line}</p>
        <div class="bar"><button class="btn sm" data-act="uni-jump" data-k={S.id}>{cur.go}</button></div></section></div>
