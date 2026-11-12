<!--
    src/features/learning-centre/pages/PathModules.svelte
    ─────────────────────────────────────────────────────────────────
      The Modules view of a pathway: its stages (years, terms, parts) in order, each with its modules, then modules in
      no stage, readings outside any module, and boxes to add a stage or a reading. A stage's name is edited in place;
      marking it specialised, moving and deleting it, and adding a module go through lc-… (learning.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { all } from "../../core/views";
    import { markDirty, MEDIA, titleOf } from "../../core/core";
    import { store } from "../../core/store.svelte";
    import type { Pathway } from "../../core/model";
    import { lcAddReading, lcPath } from "../learning";
    import { libraryBooks, looseReadings, pwCardLook } from "./look";
    import PathModule_ from "./PathModule.svelte";
    import PwCard from "./PwCard.svelte";

    let { P, open }: { P: Pathway; open: string | null | undefined } = $props();

    const st = $derived(P.stages || []),
        mods = $derived(P.modules || []),
        none = $derived(mods.filter(m => !st.some(s => s.id === m.stage))),
        loose = $derived(looseReadings(P));
    // the books in your library, for an open module's "Link a book" box
    const lib = $derived.by(() => {
        if (!open) return [];
        void store.items;
        return libraryBooks(all(), titleOf, x => MEDIA[x.medium].one);
    });
    const groups = $derived([
        ...st.map(s => ({ s, L: mods.filter(m => m.stage === s.id) })),
        ...(none.length || !st.length ? [{ s: null, L: none }] : []),
    ]);

    function stageName(id: string, value: string) {
        const Q = lcPath(P.id),
            s = Q && (Q.stages || []).find(x => x.id === id),
            v = value.trim();
        if (!s || !v) return;
        s.name = v;
        markDirty();
    }
    // Enter in a "+ reading" box adds "title, author" (to a module, or outside any)
    function addRead(e: KeyboardEvent & { currentTarget: HTMLInputElement }, mid: string) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const Q = lcPath(P.id);
        if (!Q || !lcAddReading(Q, mid, e.currentTarget.value.trim())) return;
        e.currentTarget.value = "";
        markDirty();
    }
</script>

{#each groups as { s, L }, gi (gi + (s ? s.id : ""))}<section class="group lcstage"><div class="plaque">{#if s}<input class="inp h3in" data-lcs={s.id} value={s.name} aria-label="Stage name" onchange={e => stageName(s.id, e.currentTarget.value)}><button class="chip lcspec" data-act="lc-stage-spec" data-k={s.id} aria-pressed={!!s.spec} title="A specialised stage: Part III, a master's year, a research year">{s.spec ? "Specialised" : "+ specialised"}</button><span class="lcrb h"><button class="linkbtn" data-act="lc-stage-up" data-k={s.id} aria-label="Move up">↑</button><button class="linkbtn" data-act="lc-stage-down" data-k={s.id} aria-label="Move down">↓</button><button class="linkbtn danger" data-act="lc-stage-del" data-k={s.id} aria-label="Delete stage">✕</button></span>{:else}<h3>{st.length ? "No stage" : "Modules"}</h3>{/if}<span class="n">{L.length}</span>
    <span class="spacer"></span><button class="btn sm ghost" data-act="lc-mod-add" data-k={s ? s.id : ""}>+ Module</button></div><div class="lcmods">{#each L as m, i (i + m.id)}<PathModule_ {P} {m} {open} {lib} {addRead} />{/each}</div></section>{/each}
{#if loose.length}<section class="group"><div class="plaque"><h3>Other readings</h3><span class="n">{loose.length}</span></div><ol class="lcreads">{#each loose as b, i (i + b.id)}<li><PwCard c={pwCardLook(P, b)} /></li>{/each}</ol></section>{/if}
<div class="bar"><button class="btn sm" data-act="lc-stage-add">+ Stage (a year, term or part)</button><input class="inp" placeholder="+ reading outside any module (press Enter)" data-lcaddread="" style="flex:1;max-width:420px" onkeydown={e => addRead(e, "")}></div>
