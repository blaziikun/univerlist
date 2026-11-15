<!--
    src/features/learning-centre/pages/LearnMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Courses block: your courses (the first eight), each with how far through its books you are.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { LCS, courseProgress } from "../learning";

    const S = $derived.by(() => {
        void store.meta;
        void store.itemsByFrame; // your library, taken in once a frame
        return LCS()
            .filter(s => !s.hidden)
            .slice(0, 8)
            .map(s => {
                const [d, n] = courseProgress(s);
                return { id: s.id, name: `${s.g || "∫"} ${s.name}`, w: n ? (d / n) * 100 : 0, note: n ? `${d}/${n} books` : "no books yet" };
            });
    });
</script>

{#if !S.length}<p class="hint">Nothing here yet. <button class="linkbtn" data-act="tab" data-k="learn">Add a course</button></p>{:else}<div class="lminis">{#each S as s (s.id)}<button class="lmini" data-act="learn-jump" data-k={s.id}><span>{s.name}</span><span class="lbar"><i style="width:{s.w}%"></i></span><small>{s.note}</small></button>{/each}</div>{/if}
