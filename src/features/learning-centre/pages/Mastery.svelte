<!--
    src/features/learning-centre/pages/Mastery.svelte
    ─────────────────────────────────────────────────────────────────
      A course's mastery: how much of it you've finished (topics covered, core books read), beside your own rating of
      its fields, and the levels as a ladder with your fields placed on it. masteryLook() in look.ts works it out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Course } from "../../core/model";
    import { masteryLook } from "./look";
    import Line from "./Line.svelte";

    let { S }: { S: Course } = $props();

    const M = $derived(masteryLook(S));
</script>

<section class="panel lcmastery"><h3 class="pwh">Mastery <span class="hint">by what you've finished</span></h3>
    <div class="lcmrow"><div class="ring" style="--p:{M.pct}"><b>{M.pct}%</b><small>{M.level}</small></div>
        <div class="lcmk"><p><Line parts={M.line} /></p>
            <p class="hint">Your own rating of each field is above; this is what the finished work says.{M.aim}</p>
            <details><summary class="hint">Levels overview</summary>{#if M.ladder}<div class="lcladder">{#each M.ladder as r (r.n)}<div class="lcrung{r.goal ? ' goal' : ''}"><span class="ln"><b>{r.n}</b><small>{r.d}</small></span><span class="lfs">{#each r.fields as f, i (i + f)}<span class="chip">{f}</span>{:else}<span class="hint">–</span>{/each}</span></div>{/each}</div>{:else}<p class="hint">Add fields to place them on the ladder.</p>{/if}</details></div></div></section>
