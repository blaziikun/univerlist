<!--
    src/features/watch-read/page/ShowPage.svelte
    ─────────────────────────────────────────────────────────────────
      A show (or film) open on the Watch page: its banner, poster, name (a box, for seasons put together under one name)
      and description; whether it's on your list; adding files and servers; what your servers said, and picking by hand
      (LibPick); its seasons; and each episode with Play or Resume, a source for just that one (⋯), and watched (✓).
      showView() in watch.ts works out what it shows. The buttons go through their data-act (handlers.ts, series.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../../core/Icon.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { groupNameSet, showView } from "../watch";
    import LibPick from "./LibPick.svelte";
    import { libPickOpen } from "../medialibs";

    const v = $derived.by(() => {
        void stageNews.page;
        return showView();
    });
</script>

{#if v}<div class="wshow{v.grouped ? ' textonly' : ''}" style={v.style}><div class="wshade"></div>{" "}<div class="wsh">{#if v.poster}<Pic class="wposter" src={v.poster} />{/if}<div><p class="eyebrow">{v.eyebrow}</p>{" "}{#if v.grouped}<!-- svelte-ignore a11y_missing_content: the name is the box inside it --><h2><input class="h2in wname" id="wg-name" value={v.name} aria-label="Name for these seasons together" onchange={e => groupNameSet(e.currentTarget.value)}></h2>{:else}<h2>{v.name}</h2>{/if}{" "}{#if v.about}<p class="wabout">{v.about}</p>{" "}{/if}<div class="bar">{#if v.entry}<span class={v.entry.pill}>{v.entry.word}</span><button class="btn sm ghost" data-act="open" data-id={v.entry.id}>Open card</button>{:else}<button class="btn sm gold" data-act="watch-add">+ Add to my list</button>{/if}{" "}<button class="btn sm" data-act="watch-files">{v.film ? "Choose the file…" : "Add a folder of episodes…"}</button><button class="btn sm" data-act="ss-open" title="Links and addresses just for this series">{v.servers}</button>{#if v.grouped}<button class="btn sm ghost" data-act="wg-split">Show seasons separately</button>{/if}</div>{" "}{#if v.note}<p class="wlib{v.miss ? ' miss' : ''}">{v.note}{#if v.pick}<button class="linkbtn" data-act="lib-pick-open" onclick={() => libPickOpen()}>{v.pick}</button>{/if}</p>{/if}</div></div></div>{" "}<LibPick />{#if v.seasons.length}<div class="chips wseasons">{#each v.seasons as x (x.i)}<button class="chip" data-act="watch-season" data-k={x.i} aria-pressed={x.on}>{x.label}<span class="cn">{x.cn}</span></button>{/each}</div>{/if}{#if v.picking || v.seasons.length}{" "}{/if}{#if v.loading}<p class="think">Loading episodes…</p>{" "}{/if}<div class="weps">{#each v.eps as e, i (i)}<div class="wep{e.seen ? ' seen' : ''}">{#if e.img}<Pic src={e.img} loading="lazy" />{:else}<span class="wnum">{e.e}</span>{/if}{" "}<div class="wet">{#if e.title}<b>{e.title}</b>{/if}<small>{e.meta}</small>{#if e.about}<p class="hint">{e.about}</p>{/if}</div>{" "}<div class="wea">{#if e.play}<button class="btn sm gold" data-act="watch-play" data-s={v.si} data-k={e.e}><Icon name="play" />{e.play}</button>{/if}<button class="btn sm ghost" data-act="watch-src" data-s={v.si} data-k={e.e} title="Add a file or link for just this episode">{e.src ? "⋯" : "Add source"}</button>{" "}<button class="btn sm ghost" data-act="watch-mark" data-s={v.si} data-k={e.e} aria-pressed={e.seen} title={e.seen ? "Watched" : "Mark watched"}>{e.seen ? "✓" : "○"}</button></div></div>{:else}{#if !v.loading}<p class="hint">No episode list for this season.</p>{/if}{/each}</div>{/if}
