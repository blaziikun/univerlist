<!--
    src/features/learning-centre/pages/PathsMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's Reading next block: the course open last (or the first), how far through its books you are, and
      what you're reading and what's ready next.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { lcSub, pwBucket, pwCur, pwMark, PWS, pwState } from "../learning";
    import { pwCardLook } from "./look";
    import PwCard from "./PwCard.svelte";

    const v = $derived.by(() => {
        void store.meta;
        void store.itemsByFrame; // your library, taken in once a frame
        void store.ui;
        const P = pwCur() || PWS()[0];
        if (!P) return null;
        pwMark(P);
        const main = P.books.filter(b => !b.ref),
            d = main.filter(b => pwState(b) === "done").length;
        return {
            id: P.id,
            line: `${(lcSub(P.sub) || P).name} · ${d}/${main.length} books`,
            w: main.length ? Math.round((d / main.length) * 100) : 0,
            cards: [...main.filter(b => pwBucket(P, b) === "reading"), ...main.filter(b => pwBucket(P, b) === "ready")]
                .slice(0, 5)
                .map(b => pwCardLook(P, b, true)),
        };
    });
</script>

{#if !v}<p class="hint">No course yet. <button class="linkbtn" data-act="tab" data-k="learn">Start one</button></p>{:else}<p class="hint">{v.line}</p><div class="prog"><span style="width:{v.w}%"></span></div>
    <div class="pwlist mini">{#each v.cards as c, i (i + c.id)}<PwCard {c} />{/each}</div><button class="linkbtn" data-act="learn-path" data-k={v.id}>Open the course</button>{/if}
