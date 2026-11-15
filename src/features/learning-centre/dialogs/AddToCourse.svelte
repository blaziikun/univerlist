<!--
    src/features/learning-centre/dialogs/AddToCourse.svelte
    ─────────────────────────────────────────────────────────────────
      Add to Learning Centre, under Add's search results: a book that was found goes into a course you choose, in the
      topic and at the level guessed for it (lcGuess), both changeable. It joins the course only; your library gets it
      when you start it. What's chosen is this one's own; done() closes it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { markDirty, toast } from "../../core/core";
    import { BOOK_LEVELS, LCS, lcAddBook, lcCurId, lcSub } from "../learning";
    import { lcGuess } from "../learning-build";
    import { lvlName, topicOptions } from "../pages/look";

    let { t, a, year, words, done }: { t: string; a: string; year?: number | null; words: string[]; done: () => void } = $props();

    const courses = $derived.by(() => {
        void store.meta;
        return LCS().filter(s => !s.hidden).map(s => ({ id: s.id, name: s.name }));
    });
    // svelte-ignore state_referenced_locally
    let cid = $state(lcCurId() || ""),
        topic = $state(""),
        lvl = $state(2);
    // a course picked: its topics, and the guess for this book in it
    const topics = $derived.by(() => {
        const C = lcSub(cid);
        return C ? topicOptions(C) : [];
    });
    $effect.pre(() => {
        const C = lcSub(cid);
        if (!C) return;
        const g = lcGuess(C, t, words);
        topic = g.topic;
        lvl = g.lvl;
    });
    function add() {
        const C = lcSub(cid);
        if (!C) return;
        const r = lcAddBook(C, { t, a, year: year || undefined, topic: topic || undefined, lvl });
        markDirty();
        toast(r.added ? `Added ${t} to ${C.name}` : `${t} is in ${C.name} already`);
        done();
    }
</script>

<div class="lcto panel"><p class="label">Add <b>{t}</b> to the Learning Centre</p>
    {#if !courses.length}<p class="hint">Make a course first (Learning Centre › Courses › New course).</p>{:else}<div class="bar"><label class="ctl">Course <select class="sel" id="lcto-course" bind:value={cid}>{#each courses as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
        <label class="ctl">Topic <select class="sel" id="lcto-topic" bind:value={topic}>{#each topics as o (o.id)}<option value={o.id}>{o.name}</option>{/each}<option value="">Other</option></select></label>
        <label class="ctl">Level <select class="sel" id="lcto-lvl" bind:value={lvl}>{#each BOOK_LEVELS as l (l)}<option value={l}>{lvlName(l)}</option>{/each}</select></label>
        <button class="btn sm gold" data-act="lcto-add" onclick={add}>Add to course</button><button class="btn sm ghost" data-act="lcto-close" onclick={done}>Cancel</button></div>{/if}</div>
