<!--
    src/features/learning-centre/pages/PwCard.svelte
    ─────────────────────────────────────────────────────────────────
      A book in the overview's Reading next: its cover when it's in your library, title and author, where it's at, its
      topic and level, and what it waits for. Pressing it opens the book (pw-book). bookLook() in look.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Cover from "../../library/tiles/Cover.svelte";
    import type { BookLook } from "./look";

    let { c }: { c: BookLook } = $props();
</script>

<button class="pwb {c.bk}" data-act="pw-book" data-k={c.id}>
    {#if c.cover}<span class="pwc"><Cover b={c.cover} /></span>{/if}
    <span class="pwt"><b>{c.t}</b><small>{c.a}</small>
        <span class="pwm"><i class="pws">{c.word}</i><i>{c.lvl}</i><i class="pwth">{c.topic}</i></span>
        {#if c.wait}<span class="pww">{c.wait}</span>{/if}</span></button>
