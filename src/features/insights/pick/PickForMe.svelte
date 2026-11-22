<!--
    src/features/insights/pick/PickForMe.svelte
    ─────────────────────────────────────────────────────────────────
      Pick for me: how much time you have, what you're in the mood for and whether you own it, then the best fit and
      six more (pick.ts works them out). The choices are the dialog's state (ui.modal.time, .media, .own), so a test or
      the older code can set them; Shuffle stirs the order once, until a choice changes.
      Open and Start are the library's buttons (core/nav-handlers.ts, library/item-handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import MediumDot from "../../library/tiles/MediumDot.svelte";
    import { store } from "../../core/store.svelte";
    import { MEDIA, titleOf, verbOf } from "../../core/core";
    import { crowd, progText } from "../../core/views";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Cover from "../../library/tiles/Cover.svelte";
    import { PICK_TIMES, pickFor, pickWhy } from "./pick";

    // a random amount for each entry, from Shuffle; a new choice puts the order back
    let jitter = $state<Map<string, number> | null>(null);
    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "pick") return null;
        void store.items;
        void store.meta;
        const time = m.time || "short",
            media = [...(m.media || [])],
            own = !!m.own;
        return { time, media, own, ...pickFor(time, media, own, jitter) };
    });
    function choose(change: { time?: string; media?: string[]; own?: boolean }) {
        jitter = null;
        store.dialog(change);
    }
    function shuffle() {
        const j = new Map<string, number>();
        for (const id of store.items.keys()) j.set(id, Math.random() * 2);
        jitter = j;
    }
</script>

{#if v}
    <DialogHead title="Pick for me" />
    <div class="bar"><span class="hint" style="width:90px">I have</span><div class="seg">{#each PICK_TIMES as [k, l]}<button data-act="pick-time" data-k={k} aria-pressed={v.time === k} onclick={() => choose({ time: k })}>{l}</button>{/each}</div></div>
    {#if v.present.length > 1}<div class="bar"><span class="hint" style="width:90px">In the mood for</span><div class="chips">{#each v.present as s}<button class="chip" data-act="pick-media" data-k={s[0]} aria-pressed={v.media.includes(s[0])} onclick={() => choose({ media: v.media.includes(s[0]) ? v.media.filter(x => x !== s[0]) : [...v.media, s[0]] })}>{s[1]}</button>{/each}</div></div>{/if}
    <div class="bar"><label class="ctl"><input type="checkbox" data-act="pick-own" checked={v.own} onchange={e => choose({ own: e.currentTarget.checked })}> Only things I own</label><button class="btn sm ghost" data-act="pick-shuffle" onclick={shuffle}>Shuffle</button></div>
    {#if v.top}
        {@const top = v.top}
        <div class="pick-top"><Cover b={top} /><div><p class="label">{MEDIA[top.medium].g} {top.kind || MEDIA[top.medium].one}</p><div class="ptitle">{titleOf(top)}</div><div class="hint">{top.creator || ""}{crowd(top).avg ? " · crowd " + crowd(top).avg : ""}</div><p style="margin:8px 0 0">{pickWhy(top).slice(0, 260)}</p>
            <div class="bar" style="margin-top:10px"><button class="btn gold" data-act="open" data-id={top.id}>Open</button>{#if top.status !== "active"}<button class="btn" data-act="start" data-id={top.id}>{verbOf(top.medium)[0]}</button>{/if}</div></div></div>
        <div class="mini">{#each v.rest as b (b.id)}<button data-act="open" data-id={b.id}><span class="t"><MediumDot m={b.medium} />{titleOf(b)}</span><span class="hint">{b.status === "active" ? progText(b) : b.kind || MEDIA[b.medium].one}</span></button>{/each}</div>
    {:else}
        <p class="hint">Nothing fits. Try another amount of time{v.present.length > 1 ? " or more media" : ""}.</p>
    {/if}
{/if}
