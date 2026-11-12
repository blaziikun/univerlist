<!--
    src/features/learning-centre/pages/Graduation.svelte
    ─────────────────────────────────────────────────────────────────
      What it takes to graduate from a pathway's programme: its core modules, how many options and how many credits
      (the two you set from its regulations), and whether you're there. Only for a pathway with modules.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty } from "../../core/core";
    import type { Pathway } from "../../core/model";
    import { lcPath } from "../learning";
    import { gradLook } from "./look";

    let { P }: { P: Pathway } = $props();

    const g = $derived(gradLook(P));

    function req(k: "options" | "credits", value: string) {
        const Q = lcPath(P.id);
        if (!Q) return;
        Q.req = { ...(Q.req || {}), [k]: value === "" ? undefined : Math.max(0, +value) };
        markDirty();
    }
</script>

{#if g}<section class="panel lcgrad"><h3 class="pwh">{g.ok ? "To graduate " : "To graduate"}{#if g.ok}<span class="pill active">all done</span>{/if}</h3>
    <div class="lcreq"><div><b>{g.core}</b><span>core modules</span></div>
        <div><b>{g.opts}</b><span>{g.optsWord}</span></div>
        <div><b>{g.credits}</b><span>credits</span></div></div>
    <div class="bar"><label class="ctl">Options needed <input class="inp" type="number" min="0" data-lcreq="options" value={g.reqOptions} style="width:70px" aria-label="Options needed" onchange={e => req("options", e.currentTarget.value)}></label>
        <label class="ctl">Credits needed <input class="inp" type="number" min="0" data-lcreq="credits" value={g.reqCredits} style="width:80px" aria-label="Credits needed" onchange={e => req("credits", e.currentTarget.value)}></label>
        <span class="hint">From the programme's regulations: how many optional modules count, and the credits for the degree.</span></div></section>{/if}
