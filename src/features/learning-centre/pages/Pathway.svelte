<!--
    src/features/learning-centre/pages/Pathway.svelte
    ─────────────────────────────────────────────────────────────────
      A course's pathway, inside the course's page: its university, programme, link and summary; its layout (Modules,
      Map, Stages, Threads); what was brought together into it; what the programme adds up to and what it takes to
      graduate; what you're reading, what's ready and what finishing it unlocks; the readings in the chosen layout;
      those kept for reference; the comparison with another programme; how to work through it, and milestones.
      P is a copy (LearnPage.svelte): its boxes save to the pathway itself (lcPath). pathLook() in look.ts works out
      the rest.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, safeUrl } from "../../core/core";
    import type { Pathway } from "../../core/model";
    import { lcPath } from "../learning";
    import { pathLook, pwCardLook, PW_VIEWS } from "./look";
    import Line from "./Line.svelte";
    import PwCard from "./PwCard.svelte";
    import Programme from "./Programme.svelte";
    import Graduation from "./Graduation.svelte";
    import PathNow from "./PathNow.svelte";
    import PathModules from "./PathModules.svelte";
    import PathBoard from "./PathBoard.svelte";
    import Compare from "./Compare.svelte";
    import PathFoot from "./PathFoot.svelte";

    let { P, open, cmp }: { P: Pathway; open: string | null | undefined; cmp: string | null | undefined } = $props();

    const v = $derived(pathLook(P));

    // its university, programme and link are kept trimmed; its summary as typed
    function field(f: "uni" | "programme" | "url" | "about", value: string) {
        const Q = lcPath(P.id);
        if (!Q) return;
        Q[f] = f === "about" ? value : value.trim();
        markDirty();
    }
</script>

<div class="ph pwhead"><div class="ttl">
    <div class="lcmeta"><input class="inp" data-pw="uni" value={P.uni || ""} placeholder="University" aria-label="University" onchange={e => field("uni", e.currentTarget.value)}><input class="inp" data-pw="programme" value={P.programme || ""} placeholder="Programme or course" aria-label="Programme" onchange={e => field("programme", e.currentTarget.value)}>
        <input class="inp" data-pw="url" value={P.url || ""} placeholder="Its page (link)" aria-label="Link" onchange={e => field("url", e.currentTarget.value)}>{#if P.url}<a class="link" href={safeUrl(P.url)} target="_blank" rel="noopener">Open ↗</a>{/if}</div>
    <textarea class="inp ldesc pwabout" data-pw="about" rows="2" placeholder="A summary: what this course is for, where it gets you" value={P.about || ""} onchange={e => field("about", e.currentTarget.value)}></textarea></div><span class="spacer"></span>
    <div class="seg" role="group" aria-label="Layout">{#each PW_VIEWS as [k, l]}<button data-act="pw-view" data-k={k} aria-pressed={v.view === k}>{l}</button>{/each}</div>
    <button class="btn sm" data-act="pw-add">+ Book</button><button class="btn sm gold" data-act="lc-import" data-k={P.id}>Fetch from a link…</button></div>
{#if v.merged.length}<p class="hint lcmerged"><Line parts={v.merged} /></p>{/if}
<Programme {P} /><Graduation {P} />
{#if v.main.length || !(P.modules || []).length}<PathNow {P} {v} />{/if}
<div class="pwbody v-{v.view}">{#if v.view === "modules"}<PathModules {P} {open} />{:else}<PathBoard {P} {v} />{/if}</div>
{#if v.refs.length}<section class="group"><div class="plaque"><h3>Keep for reference</h3><span class="n">{v.refs.length}</span></div><div class="pwgrid">{#each v.refs as b, i (i + b.id)}<PwCard c={pwCardLook(P, b, true)} />{/each}</div></section>{/if}
<Compare {P} {cmp} />
<PathFoot {P} goals={v.goals} rules={v.rules} />
