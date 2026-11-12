<!--
    src/features/learning-centre/pages/LearnMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Courses block: your courses (the first eight), each with your level, or how many books it has.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { plural } from "../../core/core";
    import { LEVELS, LSUBS, subjLevel, subjPaths } from "../learning";

    const S = $derived.by(() => {
        void store.meta;
        void store.itemsByFrame; // your library, taken in once a frame
        return LSUBS()
            .filter(s => !s.hidden)
            .slice(0, 8)
            .map(s => {
                const lv = subjLevel(s);
                return {
                    id: s.id,
                    name: `${s.g || "∫"} ${s.name}`,
                    w: (lv / 5) * 100,
                    note: lv ? LEVELS[Math.round(lv)][0] : plural(subjPaths(s).reduce((a, p) => a + p.books.length, 0), "book"),
                };
            });
    });
</script>

{#if !S.length}<p class="hint">Nothing here yet. <button class="linkbtn" data-act="tab" data-k="learn">Add a course</button></p>{:else}<div class="lminis">{#each S as s, i (i + s.id)}<button class="lmini" data-act="learn-jump" data-k={s.id}><span>{s.name}</span><span class="lbar"><i style="width:{s.w}%"></i></span><small>{s.note}</small></button>{/each}</div>{/if}
