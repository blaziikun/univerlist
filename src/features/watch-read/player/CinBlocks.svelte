<!--
    src/features/watch-read/player/CinBlocks.svelte
    ─────────────────────────────────────────────────────────────────
      The blocks beside the player or under it, in the order you set: the description, the seasons (a list to pick from
      for anime, chips otherwise), and the episodes (numbers, or with pictures and descriptions), the one playing
      marked. They draw when the older code asks (cinSideRedraw: a season's episodes arrived, the page rearranged), not
      while the video plays. blocksView() in view.ts; an episode goes through cin-ep, a season chip through cin-season.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { cinSeasonPick } from "../watch";
    import type { BlocksView } from "./view";

    let { b, keys }: { b: BlocksView; keys: ("about" | "seasons" | "eps")[] } = $props();
</script>

{#each keys as k (k)}<section class="cblk cb-{k}">{#if k === "about"}<p class="cs-about">{b.parts.about}</p>{:else if k === "seasons" && b.parts.seasons}{@const s = b.parts.seasons}<div class="cs-seasons">{#if s.select}<select class="sel cs-sel" data-cinseason="1" aria-label="Season" value={String(s.li)} onchange={e => cinSeasonPick(+e.currentTarget.value)}>{#each s.list as x (x.i)}<option value={String(x.i)}>{x.title}</option>{/each}</select>{:else}{#each s.list as x (x.i)}<button class="chip" data-act="cin-season" data-k={x.i} aria-pressed={x.on}>{x.label}</button>{/each}{/if}</div>{:else if k === "eps" && b.parts.eps}{@const E = b.parts.eps}<div class="cs-epsh"><span class="ilab">Episodes</span><span class="hint">{E.count}</span></div>{" "}<div class="cs-eps {E.kind}">{#if E.loading}<p class="hint">Loading…</p>{:else}{#each E.list as e, i (i)}{#if E.kind === "numbers"}<button class="cs-num{e.on ? ' on' : ''}{e.seen ? ' seen' : ''}{e.part ? ' part' : ''}" data-act="cin-ep" data-s={E.li} data-k={e.e} title={e.tip}>{e.e}</button>{:else}<button class="cs-ep2{e.on ? ' on' : ''}{e.seen ? ' seen' : ''}" data-act="cin-ep" data-s={E.li} data-k={e.e}>{#if e.img}<Pic src={e.img} loading="lazy" />{/if}<span class="n">{e.e}</span><span class="tx"><b>{e.title}</b>{#if e.about}<small>{e.about}</small>{/if}</span>{#if e.seen}<span class="ck">✓</span>{/if}</button>{/if}{:else}<p class="hint">No episode list.</p>{/each}{/if}</div>{/if}</section>{/each}
