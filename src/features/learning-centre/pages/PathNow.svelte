<!--
    src/features/learning-centre/pages/PathNow.svelte
    ─────────────────────────────────────────────────────────────────
      A pathway right now: how much of its core is done (the ring), how many readings are under way, ready and waiting,
      each thread's progress, what you're reading, what's ready to start, and what finishing a reading unlocks.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Pathway } from "../../core/model";
    import { pwCardLook, type pathLook } from "./look";
    import PwCard from "./PwCard.svelte";

    let { P, v }: { P: Pathway; v: ReturnType<typeof pathLook> } = $props();
</script>

<div class="pwnow">
    <section class="panel pwring"><div class="ring" style="--p:{v.pct}"><b>{v.pct}%</b><small>{v.ringNote}</small></div>
        <div class="pwcounts"><span class="reading"><b>{v.reading.length}</b> reading</span><span class="ready"><b>{v.ready.length}</b> ready</span><span class="waiting"><b>{v.waiting.length}</b> waiting</span></div>
        <div class="covbars">{#each v.laneBars as x, i (i + x.th)}<div style="--th:{x.colour}"><span>{x.th}</span><span class="b"><span style="width:{x.w}%"></span></span><span class="v">{x.d}/{x.n}</span></div>{/each}</div></section>
    <section class="panel"><h3 class="pwh">Reading now</h3>{#if v.reading.length}<div class="pwlist">{#each v.reading as b, i (i + b.id)}<PwCard c={pwCardLook(P, b, true)} />{/each}</div>{:else}<p class="hint">{v.main.length ? "Nothing started yet. Pick from what's ready." : "No books yet: add them, or fetch a reading list."}</p>{/if}</section>
    <section class="panel"><h3 class="pwh">Ready to start</h3>{#if v.ready.length}<div class="pwlist">{#each v.ready.slice(0, 6) as b, i (i + b.id)}<PwCard c={pwCardLook(P, b, true)} />{/each}</div>{#if v.ready.length > 6}<p class="hint">and {v.ready.length - 6} more</p>{/if}{:else}<p class="hint">{v.waiting.length ? "Everything left is waiting on something you're reading." : "Nothing left to start."}</p>{/if}
        {#if v.nexts.length}<div class="pwnext">{#each v.nexts as x, i (i + x.id)}<p><span class="hint">Finishing</span> <b>{x.name}</b> <span class="hint">unlocks</span> {x.unlocks}</p>{/each}</div>{/if}</section>
</div>
