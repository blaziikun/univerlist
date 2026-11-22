<!--
    src/features/watch-read/player/CinBlocks.svelte
    ─────────────────────────────────────────────────────────────────
      The blocks under the player or beside it, in the order you set. The seasons with their episodes in one block:
      its header names the episode playing ("Episodes: The Fatal Gunman", and 3/12: episode 3 of 12), then the season
      (chips, or a list when the names are long), then the episodes, as numbers or detailed rows (pictures and
      descriptions), the one playing marked; a right-click on one offers a file or link for just that episode. And the
      description: the episode playing, then the show. They draw when the older code asks (cinSideRedraw: a season's
      episodes arrived, the page rearranged), not while the video plays. blocksView() in view.ts; an episode goes
      through cin-ep, a season chip through cin-season.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { openMenu } from "../../core/keys";
    import { cinSeasonPick } from "../watch";
    import type { BlocksView } from "./view";

    let { b, keys }: { b: BlocksView; keys: ("about" | "eps")[] } = $props();

    // seasons with short names as chips (Season 1, Season 2…); long ones (an anime's sequels) in a list
    const chips = $derived(
        !!b.parts.eps?.seasons && b.parts.eps.seasons.length <= 10 && b.parts.eps.seasons.every(s => s.title.length <= 12)
    );
    // a right-click on an episode: a file or a link for just that one
    function menu(e: MouseEvent, si: number, ep: number) {
        e.preventDefault();
        openMenu("episode", `${si}:${ep}`, e.clientX, e.clientY, { label: "Episode " + ep });
    }
</script>

{#each keys as k (k)}<section class="cblk cb-{k}">{#if k === "eps" && b.parts.eps}{@const E = b.parts.eps}<div class="cs-epsh"><h3 class="cs-h3">Episodes{#if E.name}<span class="nm">: {E.name}</span>{/if}</h3><span class="cs-at" title="The episode playing, of this season's">{E.at}</span></div>{#if E.seasons}<div class="cs-seasons">{#if chips}{#each E.seasons as x (x.i)}<button class="chip" data-act="cin-season" data-k={x.i} aria-pressed={x.on}>{x.title}</button>{/each}{:else}<select class="sel cs-sel" data-cinseason="1" aria-label="Season" value={String(E.li)} onchange={e => cinSeasonPick(+e.currentTarget.value)}>{#each E.seasons as x (x.i)}<option value={String(x.i)}>{x.title}</option>{/each}</select>{/if}</div>{/if}<div class="cs-eps {E.kind}">{#if E.loading && !E.list.length}<p class="hint">Loading…</p>{:else}{#each E.list as e (e.e)}{#if E.kind === "numbers"}<button class="cs-num{e.on ? ' on' : ''}{e.seen ? ' seen' : ''}{e.part ? ' part' : ''}" data-act="cin-ep" data-s={E.li} data-k={e.e} title={e.tip} aria-current={e.on ? "true" : undefined} oncontextmenu={ev => menu(ev, E.li, e.e)}>{e.e}</button>{:else}<button class="cs-ep2{e.on ? ' on' : ''}{e.seen ? ' seen' : ''}" data-act="cin-ep" data-s={E.li} data-k={e.e} aria-current={e.on ? "true" : undefined} oncontextmenu={ev => menu(ev, E.li, e.e)}>{#if e.img}<Pic src={e.img} loading="lazy" />{/if}<span class="n">{e.e}</span><span class="tx"><b>{e.title}</b>{#if e.about}<small>{e.about}</small>{/if}</span>{#if e.seen}<span class="ck" aria-label="Watched">✓</span>{/if}</button>{/if}{:else}<p class="hint">No episode list.</p>{/each}{/if}</div>{:else if k === "about" && b.parts.about}{@const A = b.parts.about}<div class="cs-about">{#if A.ep}<p class="cs-epname">{A.ep}</p>{/if}{#if A.epAbout}<p class="cs-epabout">{A.epAbout}</p>{/if}{#if A.show}<p class="cs-show">{A.show}</p>{/if}</div>{/if}</section>{/each}
