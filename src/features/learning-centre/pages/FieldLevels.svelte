<!--
    src/features/learning-centre/pages/FieldLevels.svelte
    ─────────────────────────────────────────────────────────────────
      Your level in each of a course's fields, on the six-step scale (learn-lvl), removing one (learn-field-del), and a
      box to add one (Enter adds it, and the box stays ready for the next). Compact: it sits in the course's ⋯.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { markDirty } from "../../core/core";
    import type { Course } from "../../core/model";
    import { LEVELS, lcSub } from "../learning";

    let { S }: { S: Course } = $props();

    const rows = $derived(
        (S.order || Object.keys(S.fields || {})).map(f => {
            const v = ((S.fields || {})[f] || {}).lvl || 0;
            return { f, v, gap: !!S.goal && v < S.goal };
        })
    );

    function add(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const C = lcSub(S.id),
            v = e.currentTarget.value.trim();
        if (!C || !v || C.fields[v]) return;
        C.fields[v] = { lvl: 0 };
        C.order = [...(C.order || Object.keys(C.fields).filter(f => f !== v)), v];
        e.currentTarget.value = "";
        markDirty();
    }
</script>

<p class="label">Your level in each field</p><div class="lfields">{#each rows as r, i (i + r.f)}<div class="lfield{r.gap ? ' gap' : ''}"><span class="lf">{r.f}</span><div class="ldots" role="group" aria-label="{r.f} level">{#each LEVELS as [n], l}<button class="ld{l <= r.v && r.v ? ' on' : ''}{l === r.v ? ' cur' : ''}" data-act="learn-lvl" data-k={S.id} data-f={r.f} data-l={l} title={n} aria-pressed={l === r.v}></button>{/each}</div><span class="ln">{LEVELS[r.v][0]}</span><button class="linkbtn" data-act="learn-field-del" data-k={S.id} data-f={r.f} aria-label="Remove {r.f}">✕</button></div>{/each}
    <input class="inp" placeholder="+ a field (press Enter)" data-learnfield={S.id} aria-label="Add a field" onkeydown={add}></div>
