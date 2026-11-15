<!--
    src/features/learning-centre/pages/MapCard.svelte
    ─────────────────────────────────────────────────────────────────
      A book on the map: its title and author, coloured by where it's at; ★ if it's one of the best, ⋈ when it serves
      several topics, and the other courses it's in. Hovering shows what it needs and unlocks; pressing opens it
      (pw-book). Its level shows on a phone, where the map is a list.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { BookLook } from "./look";

    let { c }: { c: BookLook } = $props();
</script>

<button class="lcb {c.bk}" data-act="pw-book" data-k={c.id} title={c.tip}><b>{c.star ? "★ " : ""}{c.t}</b><small>{c.who}</small>
    <span class="lcbm"><i class="lclv">{c.lvl}</i>{#if c.multi}<i class="lcx" title="Serves {c.multi} topics">⋈ {c.multi}</i>{/if}{#if c.also.length}<i class="lcx" title="Also in {c.also.join(', ')}">also in {c.also[0]}{c.also.length > 1 ? ` +${c.also.length - 1}` : ""}</i>{/if}</span>{#if c.wait}<span class="lcw">{c.wait}</span>{/if}</button>
