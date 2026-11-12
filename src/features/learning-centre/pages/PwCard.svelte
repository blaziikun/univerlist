<!--
    src/features/learning-centre/pages/PwCard.svelte
    ─────────────────────────────────────────────────────────────────
      A reading's card on a course's pathway: its cover when it's in your library, title, author and year, where it's
      at (ready, waiting, reading…), optional, free online, its parts, its thread, and what it waits for. Pressing it
      opens the reading (pw-book, learning.ts). pwCardLook() in look.ts works out what it shows.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Cover from "../../library/tiles/Cover.svelte";
    import type { PwCardLook } from "./look";

    let { c }: { c: PwCardLook } = $props();
</script>

<button class="pwb {c.bk}" data-act="pw-book" data-k={c.id} style="--th:{c.colour}">
    {#if c.cover}<span class="pwc"><Cover b={c.cover} /></span>{/if}
    <span class="pwt"><b>{c.t}</b><small>{c.sub}</small>
        <span class="pwm"><i class="pws">{c.word}</i>{#if c.opt}<i>optional</i>{/if}{#if c.free}<i class="pwfree">free</i>{/if}{#if c.parts}<i>{c.parts}</i>{/if}{#if c.lane}<i class="pwth">{c.lane}</i>{/if}</span>
        {#if c.wait}<span class="pww">{c.wait}</span>{/if}</span></button>
