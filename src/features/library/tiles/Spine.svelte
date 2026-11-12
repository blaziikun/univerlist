<!--
    src/features/library/tiles/Spine.svelte
    ─────────────────────────────────────────────────────────────────
      A spine on the shelf, sized like the real thing (spineLook() in tiles.ts): its picture when there is one,
      otherwise the title, author and a label (a call number, a platform, the volumes). vol: one volume of a series
      standing on its own. Opens the entry (data-act="open"); while arranging, it can be dragged into place.
      The hover card with its details is core/events.ts's (it reads data-id and data-call).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { spineLook } from "./tiles";
    import { tilesWatch } from "./watch";
    import type { Entry } from "../../core/model";

    let {
        b,
        call,
        vol = 0,
        sel = false,
        arrange = false,
        mark = "",
    }: { b: Entry; call: string; vol?: number; sel?: boolean; arrange?: boolean; mark?: string } = $props();

    const s = $derived.by(() => {
        tilesWatch();
        return spineLook(b, call, vol || undefined);
    });
</script>

<button class="{s.cls}{sel ? ' sel' : ''}{mark}" data-act="open" data-id={b.id} data-oid={vol ? "" : b.id} data-call={call} draggable={arrange && !vol ? "true" : undefined} style={s.style} aria-label={s.label}>
    {#if s.art}<span class="art{s.art.real ? ' real' : ''}" style={s.art.style}></span>{/if}{#if s.dot}<span class="sdot" style="background:{s.dot}"></span>{/if}{#if vol}<span class="vnum">{vol}</span>{/if}{#if s.print}<span class="st">{s.print.title}</span><span class="sa">{s.print.author}</span><span class="lbl">{s.print.lbl}</span>{/if}</button>
