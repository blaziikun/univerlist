<!--
    src/features/learning-centre/pages/Degree.svelte
    ─────────────────────────────────────────────────────────────────
      The degree, folded away, only for a course that is one ("This is a degree I'm taking"): its university, programme
      and page; credits, marks and what it takes to graduate (Graduation); and its modules by stage, each with its
      code, credits, core or option, status and mark, edited in place. Adding and removing stages and modules, and
      fetching the module list from the programme's page, go through lc-… (learning.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty, safeUrl, ticked } from "../../core/core";
    import type { Course } from "../../core/model";
    import { lcMod, lcSub } from "../learning";
    import { degreeLook, lcFolds, LC_STATUS } from "./look";
    import Graduation from "./Graduation.svelte";

    let { C, open }: { C: Course; open: string | null | undefined } = $props();

    const v = $derived(degreeLook(C));

    function field(f: "uni" | "programme" | "url", value: string) {
        const S = lcSub(C.id);
        if (!S) return;
        S[f] = value.trim();
        markDirty();
    }
    // a module's details: an empty name keeps the one it had
    function set(id: string, f: "status" | "name" | "code" | "credits" | "grade", value: string) {
        const S = lcSub(C.id),
            m = S && lcMod(S, id);
        if (!m) return;
        m[f] = f === "name" ? value.trim() || m.name : value.trim();
        markDirty();
    }
    function core(id: string, box: HTMLInputElement) {
        const S = lcSub(C.id),
            m = S && lcMod(S, id);
        if (!m) return;
        m.core = ticked(box);
        markDirty();
    }
    function stageName(id: string, value: string) {
        const S = lcSub(C.id),
            s = S && (S.stages || []).find(x => x.id === id);
        if (!s || !value.trim()) return;
        s.name = value.trim();
        markDirty();
    }
    // a stage (a year or part) is folded until you open it, unless it has no modules yet or you've just added one to
    // it; opened or not is remembered while you're on the page (lcFolds)
    let stages = $state<Record<string, boolean>>({});
    const stageOpen = (g: { id: string; mods: { id: string }[] }) =>
        stages[g.id] ?? (lcFolds.has("stg:" + C.id + g.id) || !g.mods.length || g.mods.some(m => m.id === open));
    function stageToggle(id: string, on: boolean) {
        stages[id] = on;
        if (on) lcFolds.add("stg:" + C.id + id);
        else lcFolds.delete("stg:" + C.id + id);
    }
    // unfolded or not, remembered while you're on the page (lcFolds)
    // svelte-ignore state_referenced_locally
    let folded = $state(lcFolds.has("deg:" + C.id) || !!open);
    $effect(() => {
        if (folded) lcFolds.add("deg:" + C.id);
        else lcFolds.delete("deg:" + C.id);
    });
</script>

<details bind:open={folded} class="panel lcdeg"><summary><h3 class="pwh">Degree</h3><span class="hint">{[C.uni, C.programme].filter(Boolean).join(" · ") || "your programme"} · {v.line}</span></summary>
    <div class="lcmeta"><input class="inp" data-lcdeg="uni" value={C.uni || ""} placeholder="University" aria-label="University" onchange={e => field("uni", e.currentTarget.value)}><input class="inp" data-lcdeg="programme" value={C.programme || ""} placeholder="Programme" aria-label="Programme" onchange={e => field("programme", e.currentTarget.value)}><input class="inp" data-lcdeg="url" value={C.url || ""} placeholder="Its page (link)" aria-label="Link" onchange={e => field("url", e.currentTarget.value)}>{#if safeUrl(C.url)}<a class="link" href={safeUrl(C.url)} target="_blank" rel="noopener noreferrer">Open ↗</a>{/if}</div>
    <Graduation {C} />
    {#each v.groups as g (g.id)}<details class="lcstg" open={stageOpen(g)} ontoggle={e => stageToggle(g.id, e.currentTarget.open)}><summary><b>{g.name}</b><span class="hint">{g.sum}</span></summary><div class="lcstgh">{#if g.id}<input class="inp h3in" data-lcs={g.id} value={g.name} aria-label="Stage name" onchange={e => stageName(g.id, e.currentTarget.value)}>{:else}<b>{g.name}</b>{/if}<span class="spacer"></span><button class="btn sm ghost" data-act="lc-mod-add" data-k={g.id}>+ Module</button>{#if g.id}<button class="linkbtn danger" data-act="lc-stage-del" data-k={g.id} aria-label="Delete stage {g.name}">✕</button>{/if}</div>
        {#if g.mods.length}<div class="tablewrap"><table class="lib small lcdtab"><thead><tr><th>Code</th><th>Module</th><th>Credits</th><th>Core</th><th>Status</th><th>Mark</th><th>Books</th><th></th></tr></thead><tbody>{#each g.mods as m (m.id)}<tr class={m.status || "planned"}><td><input class="inp" data-lcm={m.id} data-f="code" value={m.code || ""} aria-label="Code" style="width:96px" onchange={e => set(m.id, "code", e.currentTarget.value)}></td><td><input class="inp" data-lcm={m.id} data-f="name" value={m.name} aria-label="Name" style="min-width:200px;width:100%" onchange={e => set(m.id, "name", e.currentTarget.value)}></td><td><input class="inp" data-lcm={m.id} data-f="credits" value={m.credits ?? ""} aria-label="Credits" style="width:64px" onchange={e => set(m.id, "credits", e.currentTarget.value)}></td><td><input type="checkbox" data-lcm={m.id} data-f="core" checked={m.core !== false} aria-label="Core" onchange={e => core(m.id, e.currentTarget)}></td><td><select class="sel" data-lcm={m.id} data-f="status" aria-label="Status" value={m.status || "planned"} onchange={e => set(m.id, "status", e.currentTarget.value)}>{#each LC_STATUS as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></td><td><input class="inp" data-lcm={m.id} data-f="grade" value={m.grade ?? ""} aria-label="Mark" style="width:64px" onchange={e => set(m.id, "grade", e.currentTarget.value)}></td><td>{v.books(m.id) || ""}</td><td><button class="linkbtn danger" data-act="lc-mod-del" data-k={m.id} aria-label="Remove {m.name}">✕</button></td></tr>{/each}</tbody></table></div>{/if}</details>{/each}
    <div class="bar"><button class="btn sm" data-act="lc-stage-add">+ Stage (a year or part)</button><button class="btn sm ghost" data-act="lc-import" data-w="modules" data-u={C.url || ""}>Fetch the modules from its page…</button></div></details>
