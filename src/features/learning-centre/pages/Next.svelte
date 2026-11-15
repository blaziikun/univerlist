<!--
    src/features/learning-centre/pages/Next.svelte
    ─────────────────────────────────────────────────────────────────
      Next: the books to read now, in order: what you're reading, then what's ready (everything it needs is done or
      underway), lower levels first, as the reading lists ordered them; each with what it would let you start. One
      click starts a book (lc-start: it joins your library then) or marks it done (lc-done). nextLook() in look.ts
      works it out from lcNext() (learning-order.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Course } from "../../core/model";
    import { nextLook, type BookLook } from "./look";

    let { C }: { C: Course } = $props();

    const v = $derived(nextLook(C));
</script>

{#snippet row(c: BookLook & { opens: string[] }, reading: boolean)}<li class="lcni {c.bk}"><button class="lcnb" data-act="pw-book" data-k={c.id} title={c.tip}><b>{c.star ? "★ " : ""}{c.t}</b><small>{[c.who, c.topic, c.lvl].filter(Boolean).join(" · ")}</small>{#if c.opens.length}<small class="lcopens">Then {c.opens.join(", ")}</small>{/if}</button>
    <span class="lcnact">{#if reading}<span class="pwpill reading">Reading</span>{:else}<button class="btn sm gold" data-act="lc-start" data-k={c.id}>Start</button>{/if}<button class="btn sm ghost" data-act="lc-done" data-k={c.id}>Done</button></span></li>{/snippet}

<section class="panel lcnext"><h3 class="pwh">Next {#if v.left}<span class="lcn">{v.left} to go</span>{/if}</h3>
    {#if v.empty}<p class="hint">No books yet. Fetch a programme's reading lists (Built from, below), or use one in Curricula.</p>
    {:else if !v.reading.length && !v.ready.length}<p class="hint">{v.left ? "Everything left waits on something: open a book on the map to see what." : "All done. Raise the level you're aiming for, or fetch more."}</p>
    {:else}<ol class="lcnl">{#each v.reading as c (c.id)}{@render row(c, true)}{/each}{#each v.ready as c (c.id)}{@render row(c, false)}{/each}</ol>{#if v.more}<p class="hint">…and {v.more} more ready after these.</p>{/if}{/if}</section>
