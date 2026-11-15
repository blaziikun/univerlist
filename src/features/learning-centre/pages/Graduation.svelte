<!--
    src/features/learning-centre/pages/Graduation.svelte
    ─────────────────────────────────────────────────────────────────
      What it takes to graduate from a degree: its core modules, how many options and how many credits (the two you
      set from its regulations), and whether you're there. Only for a degree with modules.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty } from "../../core/core";
    import type { Course } from "../../core/model";
    import { lcSub } from "../learning";
    import { gradLook } from "./look";

    let { C }: { C: Course } = $props();

    const g = $derived(gradLook(C));

    function req(k: "options" | "credits", value: string) {
        const S = lcSub(C.id);
        if (!S) return;
        S.req = { ...(S.req || {}), [k]: value === "" ? undefined : Math.max(0, +value) };
        markDirty();
    }
</script>

{#if g}<div class="lcgrad"><p class="label">To graduate {#if g.ok}<span class="pill active">all done</span>{/if}</p>
    <div class="lcreq"><div><b>{g.core}</b><span>core modules</span></div><div><b>{g.opts}</b><span>{g.optsWord}</span></div><div><b>{g.credits}</b><span>credits</span></div></div>
    <div class="bar"><label class="ctl">Options needed <input class="inp" type="number" min="0" data-lcreq="options" value={g.reqOptions} style="width:70px" aria-label="Options needed" onchange={e => req("options", e.currentTarget.value)}></label>
        <label class="ctl">Credits needed <input class="inp" type="number" min="0" data-lcreq="credits" value={g.reqCredits} style="width:80px" aria-label="Credits needed" onchange={e => req("credits", e.currentTarget.value)}></label>
        <span class="hint">From the programme's regulations.</span></div></div>{/if}
