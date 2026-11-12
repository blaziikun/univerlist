<!--
    src/features/learning-centre/pages/CurriculaMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Curricula block: each course you compare programmes for, with how many of its topics you've
      picked a book for.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { ACS, LSUBS } from "../learning";

    const rows = $derived.by(() => {
        void store.meta;
        const cur = ACS().curricula || {};
        return LSUBS().flatMap(s => {
            const c = cur[s.id];
            if (!c || !c.topics.length) return [];
            const n = c.topics.filter(t => c.chosen[t.id]).length;
            return [{ id: s.id, name: s.name, w: (n / c.topics.length) * 100, note: `${n}/${c.topics.length} picked` }];
        });
    });
</script>

{#if !rows.length}<p class="hint">No comparison yet. <button class="linkbtn" data-act="tab" data-k="curricula">Open Curricula</button></p>{:else}<div class="lminis">{#each rows as r, i (i + r.id)}<button class="lmini" data-act="uni-jump" data-k={r.id}><span>{r.name}</span><span class="lbar"><i style="width:{r.w}%"></i></span><small>{r.note}</small></button>{/each}</div>{/if}
