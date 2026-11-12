<!--
    src/features/learning-centre/pages/Opportunities.svelte
    ─────────────────────────────────────────────────────────────────
      Opportunities: competitions, summer schools, internships, grants you could apply for, and by when. Yours only:
      never in a pack made to share (lcStripPersonal). Ticking one off and "Add" (which takes what's typed here) are
      this section's own; removing one is lc-opp-del (learning-hub.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { acId, lcSub, LSUBS } from "../learning";
    import { markDirty, ticked, toast } from "../../core/core";
    import type { Course } from "../../core/model";
    import { oppsLook } from "./look";

    let { S }: { S: Course } = $props();

    const O = $derived(oppsLook(S));
    let t = $state(""),
        when = $state(""),
        url = $state("");

    function tick(id: string, box: HTMLInputElement) {
        const o = LSUBS()
            .flatMap(x => x.opps || [])
            .find(y => y.id === id);
        if (!o) return;
        o.done = ticked(box);
        markDirty();
    }
    function add() {
        const C = lcSub(S.id);
        if (!C) return;
        const tt = t.trim(),
            u = url.trim();
        if (!tt) return toast("Write it first.");
        if (u && !/^https:\/\//i.test(u)) return toast("Links need to start with https://");
        C.opps = [...(C.opps || []), { id: acId(), t: tt, when: when || "", url: u, done: false }];
        t = when = url = "";
        markDirty();
    }
</script>

<section class="panel lcopps"><h3 class="pwh">Opportunities <span class="hint">yours only: never in shared exports</span></h3>
    {#if O.length}<div class="pwgoals">{#each O as o, i (i + o.id)}<label class="pwgoal{o.done ? ' on' : ''}"><input type="checkbox" data-lcopp={o.id} checked={!!o.done} onchange={e => tick(o.id, e.currentTarget)}><span>{o.note ? o.t + " " : o.t}{#if o.note}<small class="hint">{o.note}</small>{/if}</span>{#if o.date}<small>{o.date}</small>{/if}{#if o.url}<a class="link" href={o.href} target="_blank" rel="noopener noreferrer">↗</a>{/if}<button class="linkbtn" data-act="lc-opp-del" data-k={o.id} aria-label="Remove">✕</button></label>{/each}</div>{:else}<p class="hint">Competitions, summer schools, internships, grants: what you could apply for, and by when.</p>{/if}
    <div class="bar"><input class="inp" id="lc-opp-t" placeholder="Add one (e.g. Putnam, a research internship)" style="flex:2;min-width:180px" aria-label="Opportunity" bind:value={t}><input class="inp" type="date" id="lc-opp-d" style="width:150px" aria-label="Deadline" bind:value={when}><input class="inp" id="lc-opp-u" placeholder="Link" style="flex:1;min-width:120px" aria-label="Link" bind:value={url}><button class="btn sm" data-act="lc-opp-add" data-k={S.id} onclick={add}>Add</button></div></section>
