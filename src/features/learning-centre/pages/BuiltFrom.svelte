<!--
    src/features/learning-centre/pages/BuiltFrom.svelte
    ─────────────────────────────────────────────────────────────────
      What the course was built from, folded away: each programme (its university, its page, where its reading lists
      are printed), how many modules and reading lists it has, and how its fetch stands; fetching one again
      (uni-again), all of them, or more from another subject or topic (lc-new "more"), or from a link (lc-import).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Course } from "../../core/model";
    import { builtLook, lcFolds } from "./look";

    let { C }: { C: Course } = $props();

    const P = $derived(builtLook(C)),
        busy = $derived(P.filter(p => p.state.cls === "busy").length);
    // unfolded or not, remembered while you're on the page (lcFolds)
    // svelte-ignore state_referenced_locally
    let folded = $state(lcFolds.has("built:" + C.id));
    $effect(() => {
        if (folded) lcFolds.add("built:" + C.id);
        else lcFolds.delete("built:" + C.id);
    });
</script>

<details bind:open={folded} class="panel lcbuilt"><summary><h3 class="pwh">Built from</h3><span class="hint">{P.length ? `${P.length} programme${P.length === 1 ? "" : "s"}` : "nothing yet"}{busy ? ` · fetching ${busy}…` : ""}</span></summary>
    {#if P.length}<div class="lcprogs">{#each P as p (p.id)}<div class="lcprog"><div><b>{p.uni}</b> {p.name}</div><small>{p.mods} modules · {p.lists} with a reading list ({p.books} books){#if p.href} · <a class="link" href={p.href} target="_blank" rel="noopener noreferrer">its page ↗</a>{/if}{#if p.src} · <a class="link" href={p.src} target="_blank" rel="noopener noreferrer">reading lists ↗</a>{/if}</small><small class="lcfs {p.state.cls}">{#if p.state.cls === "busy"}<span class="spin"></span>{/if}{p.state.t}{#if p.canFetch && p.state.cls !== "busy"} · <button class="linkbtn" data-act="uni-again" data-k={p.id}>Fetch again</button>{/if}</small></div>{/each}</div>{:else}<p class="hint">Fetch more to add a subject's or topic's programmes, or add one from a link.</p>{/if}
    <div class="bar"><button class="btn sm" data-act="lc-new" data-k="more">Fetch more…</button>{#if P.some(p => p.canFetch)}<button class="btn sm ghost" data-act="uni-again" data-k="">Fetch them all again</button>{/if}<button class="btn sm ghost" data-act="lc-import">From a link…</button></div></details>
