<!--
    src/features/learning-centre/pages/PathsMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Reading next block: the current course, how far through its books you are, and what to read next
      in it, in order (Next on the course's page).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { courseProgress, lcCur } from "../learning";
    import { nextLook } from "./look";
    import PwCard from "./PwCard.svelte";

    const v = $derived.by(() => {
        void store.meta;
        void store.itemsByFrame; // your library, taken in once a frame
        void store.ui;
        const C = lcCur();
        if (!C) return null;
        const [d, n] = courseProgress(C),
            N = nextLook(C);
        return {
            id: C.id,
            line: `${C.name} · ${d}/${n} books`,
            w: n ? Math.round((d / n) * 100) : 0,
            cards: [...N.reading, ...N.ready].slice(0, 5),
        };
    });
</script>

{#if !v}<p class="hint">No course yet. <button class="linkbtn" data-act="tab" data-k="learn">Start one</button></p>{:else}<p class="hint">{v.line}</p><div class="prog"><span style="width:{v.w}%"></span></div>
    <div class="pwlist mini">{#each v.cards as c (c.id)}<PwCard {c} />{/each}</div><button class="linkbtn" data-act="learn-jump" data-k={v.id}>Open the course</button>{/if}
