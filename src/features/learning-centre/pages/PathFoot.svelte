<!--
    src/features/learning-centre/pages/PathFoot.svelte
    ─────────────────────────────────────────────────────────────────
      The foot of a pathway: how to work through it (your rules, one per line, editable under "Edit these"), and its
      milestones (exams, deadlines), ticked off, removed (pw-goal-del) or added: "Add", and Enter in its box, take
      what's typed here.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, ticked, toast } from "../../core/core";
    import type { Pathway } from "../../core/model";
    import { acId, lcPath } from "../learning";
    import type { pathLook } from "./look";

    let { P, goals, rules }: { P: Pathway; goals: ReturnType<typeof pathLook>["goals"]; rules: string[] } = $props();

    let t = $state(""),
        d = $state("");

    function method(value: string) {
        const Q = lcPath(P.id);
        if (!Q) return;
        Q.method = value;
        markDirty();
    }
    function tick(id: string, box: HTMLInputElement) {
        const g = (lcPath(P.id)?.goals || []).find(x => x.id === id);
        if (!g) return;
        g.done = ticked(box);
        markDirty();
    }
    function add() {
        const Q = lcPath(P.id),
            tt = t.trim();
        if (!Q) return;
        if (!tt) return toast("Write the milestone first.");
        Q.goals = [...(Q.goals || []), { id: acId(), t: tt, date: d || "", done: false }];
        t = d = "";
        markDirty();
    }
</script>

<div class="dash pwfoot">
    <section class="panel span6"><h3 class="pwh">How to work through it</h3>{#if (P.method || "").trim()}<ul class="pwrules">{#each rules as r, i (i + r)}<li>{r}</li>{/each}</ul><details class="pwmed"><summary class="hint">Edit these</summary><textarea class="inp pwmethod" data-pw="method" rows="6" value={P.method} onchange={e => method(e.currentTarget.value)}></textarea></details>{:else}<textarea class="inp pwmethod" data-pw="method" rows="5" placeholder="Your rules, one per line: how carefully, which exercises, when to move on" onchange={e => method(e.currentTarget.value)}></textarea>{/if}</section>
    <section class="panel span6"><h3 class="pwh">Milestones</h3>
        {#if goals.length}<div class="pwgoals">{#each goals as g, i (i + g.id)}<label class="pwgoal{g.done ? ' on' : ''}"><input type="checkbox" data-pwgoal={g.id} checked={!!g.done} onchange={e => tick(g.id, e.currentTarget)}><span>{g.t}</span>{#if g.when}<small>{g.when}</small>{/if}<button class="linkbtn" data-act="pw-goal-del" data-k={g.id} aria-label="Remove">✕</button></label>{/each}</div>{:else}<p class="hint">Exams, deadlines, "finish Part I by spring".</p>{/if}
        <div class="bar"><input class="inp" id="pw-goal-t" placeholder="Add a milestone" style="flex:1" bind:value={t} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}><input class="inp" type="date" id="pw-goal-d" style="width:150px" aria-label="Date" bind:value={d}><button class="btn sm" data-act="pw-goal-add" onclick={add}>Add</button></div></section>
</div>
