<!--
    src/features/learning-centre/pages/Creme.svelte
    ─────────────────────────────────────────────────────────────────
      Crème de la crème: the books you'd keep if you kept only a few (★ on a reading, in its dialog), and the books you
      picked topic by topic in Curricula. cremeLook() in look.ts works them out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Course } from "../../core/model";
    import { cremeLook } from "./look";
    import Line from "./Line.svelte";
    import PwCard from "./PwCard.svelte";

    let { S }: { S: Course } = $props();

    const C = $derived(cremeLook(S));
</script>

{#if !C.cards.length && !C.picks.length}<section class="panel"><h3 class="pwh">Crème de la crème</h3><p class="hint">Star the best books in this course (open a book, then ★ Crème de la crème): the ones you'd keep if you could keep only a few. They gather here.</p></section>{:else}<section class="panel lccreme"><h3 class="pwh">Crème de la crème <span class="hint">{C.cards.length}</span></h3>
    {#if C.cards.length}<div class="pwlist">{#each C.cards as c, i (i + c.id)}<PwCard {c} />{/each}</div>{/if}
    {#if C.picks.length}<p class="hint"><Line parts={C.picks} /></p>{/if}</section>{/if}
