<!--
    src/features/learning-centre/pages/CurriculaMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Curricula block: each course with the programmes it was built from, and how many of their
      reading lists are in it already.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { LCS, sameBook } from "../learning";

    const rows = $derived.by(() => {
        void store.meta;
        return LCS().flatMap(s => {
            if (s.hidden || !s.progs.length) return [];
            const L = s.progs.flatMap(p => p.modules.filter(m => (m.books || []).length)),
                n = L.filter(m => (m.books || []).every(([t, a]) => s.books.some(b => sameBook(b.t, b.a, t, a)))).length;
            return [{ id: s.id, name: s.name, w: L.length ? (n / L.length) * 100 : 0, note: `${s.progs.length} programme${s.progs.length === 1 ? "" : "s"}` }];
        });
    });
</script>

{#if !rows.length}<p class="hint">No programmes yet. <button class="linkbtn" data-act="tab" data-k="curricula">Open Curricula</button></p>{:else}<div class="lminis">{#each rows as r (r.id)}<button class="lmini" data-act="learn-jump" data-k={r.id}><span>{r.name}</span><span class="lbar"><i style="width:{r.w}%"></i></span><small>{r.note}</small></button>{/each}</div>{/if}
