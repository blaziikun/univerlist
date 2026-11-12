<!--
    src/features/library/tiles/SpineTip.svelte
    ─────────────────────────────────────────────────────────────────
      The card that shows over a spine you point at: its call number, title, who made it, how far you are, where it
      stands, whether you own it, your score and the crowd's. Placed above the spine (below it when there's no room),
      inside the window. It follows the pointer over the whole page (it was a listener in core/events.ts), and is
      mounted once (main.ts); it's drawn the first time a spine is pointed at, and hidden while none is.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { flushSync } from "svelte";
    import { closestTo, items, titleOf } from "../../core/core";
    import type { Entry } from "../../core/model";
    import { progText } from "../../core/views";
    import CopyPill from "./CopyPill.svelte";
    import CrowdPill from "./CrowdPill.svelte";
    import MediumDot from "./MediumDot.svelte";
    import MyScore from "./MyScore.svelte";
    import StatusPill from "./StatusPill.svelte";

    // the spine pointed at: the entry and its call number (null before the first one, or once it's gone)
    let tip = $state<{ b: Entry; call: string } | null>(null);
    let on = $state(false);
    let at = $state("");
    let el = $state<HTMLDivElement | null>(null);

    function over(e: MouseEvent) {
        const s = closestTo(e, ".spine");
        if (!s) {
            on = false;
            return;
        }
        const id = s.dataset.id || "",
            b = items.get(id);
        if (!b) return;
        tip = { b: { ...b, id }, call: s.dataset.call || "" };
        on = true;
        flushSync(); // drawn, so it can be measured
        if (!el) return;
        const r = s.getBoundingClientRect(),
            x = Math.min(window.innerWidth - 270, Math.max(8, r.left + r.width / 2 - 120)),
            y = r.top - el.offsetHeight - 10;
        at = `left:${x}px;top:${y < 8 ? r.bottom + 10 : y}px`;
    }
</script>

<svelte:document onmouseover={over} />

{#if tip}{@const b = tip.b}<div class="tip" hidden={!on} style={at} bind:this={el}><span class="call"><MediumDot m={b.medium} />{tip.call}</span><b>{titleOf(b)}</b><span class="hint">{[b.creator, b.kind, b.year].filter(Boolean).join(" · ")}</span>{#if b.status === "active"}<span class="hint">{progText(b)}</span>{/if}<div class="meta" style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap"><StatusPill {b} /><CopyPill {b} /><MyScore {b} /><CrowdPill {b} /></div></div>{/if}
