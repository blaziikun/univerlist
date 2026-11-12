<!--
    src/features/library/page/FilterPanel.svelte
    ─────────────────────────────────────────────────────────────────
      The filter: every condition in one panel, Basic or Advanced. Status, modes (in the Hub), type, genre, themes,
      your tags, your score, release years, season, ownership, progress and favourites; Advanced adds the rules
      (FilterRules). The chips count what's on the shelf you're on (filterChoices in library.ts).
      The boxes are handled here; the chips and buttons go through their data-act names (library/handlers.ts,
      core/nav-handlers.ts), which the sidebar and the overview use too.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { plural, ui } from "../../core/core";
    import { store } from "../../core/store.svelte";
    import { renderMain } from "../../core/shell";
    import { filterChoices, filterCount, FILT_EMPTY, type FiltList } from "../library";
    import FilterRules from "./FilterRules.svelte";
    import type { Entry, Filter } from "../../core/model";

    let {
        base,
        f,
        status,
        adv,
        universal,
    }: { base: Entry[]; f: Filter; status: string; adv: boolean; universal: boolean } = $props();

    const c = $derived(filterChoices(base));
    const n = $derived(filterCount(f) + (status !== "all" ? 1 : 0));

    /** a typed value, a ticked box or a choice: the filter changes and the shelf follows */
    function setF(k: string, v: string | boolean) {
        ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}), [k]: typeof v === "string" ? v.trim() : v };
        renderMain();
    }
</script>

{#snippet chips(k: FiltList, list: [string, number][], max = 40)}
    {#if list.length}<div class="chips wrapchips">{#each list.slice(0, max) as [v, cn]}<button class="chip" data-act="filt-tog" data-f={k} data-k={v} aria-pressed={(f[k] || []).includes(v)}>{v} <span class="cn">{cn}</span></button>{/each}</div>{:else}<p class="hint">None here.</p>{/if}
{/snippet}
{#snippet sel(id: string, opts: [string, string][], val: string, k: string)}
    <select class="sel" {id} onchange={e => setF(k, e.currentTarget.value)}>{#each opts as [o, l]}<option value={o} selected={String(val) === String(o)}>{l}</option>{/each}</select>
{/snippet}

<div class="filtpanel panel">
    <div class="fp-head"><b>Filter</b><div class="seg">{#each [["", "Basic"], ["1", "Advanced"]] as [k, l]}<button data-act="filt-adv" data-k={k} aria-pressed={!!k === adv}>{l}</button>{/each}</div><span class="hint">{n ? plural(n, "condition") : "Nothing filtered"}</span><span class="spacer"></span><button class="linkbtn" data-act="filt-clear">Clear all</button><button class="btn sm ghost" data-act="filter-toggle">Done</button></div>
    <div class="fp-grid">
      <div class="fp wide"><p class="label">Status</p><div class="chips wrapchips">{#each c.status as [k, l, cn]}<button class="chip st-{k}" data-act="f-status" data-k={k} aria-pressed={status === k}>{l} <span class="cn">{cn}</span></button>{/each}</div></div>
      {#if universal}<div class="fp"><p class="label">Modes</p><div class="chips wrapchips">{#each store.meta.modes.filter(x => x.id !== "universal") as x}<button class="chip" data-act="filt-tog" data-f="modes" data-k={x.id} aria-pressed={f.modes.includes(x.id)}>{x.g || ""} {x.name}</button>{/each}</div></div>{/if}
      <div class="fp"><p class="label">Type</p>{@render chips("kinds", c.kinds)}</div>
      <div class="fp wide"><p class="label">Genre <span class="hint">· any of</span></p>{@render chips("genres", c.genres, 60)}</div>
      {#if adv && c.themes.length}<div class="fp wide"><p class="label">Themes <span class="hint">· from AniList, TMDB and IGDB · any of</span></p>{@render chips("themes", c.themes, 80)}</div>{/if}
      {#if c.tags.length}<div class="fp"><p class="label">Your tags</p>{@render chips("tags", c.tags)}</div>{/if}
      <div class="fp"><p class="label">Your score</p><div class="bar"><input class="inp" data-filt="smin" inputmode="decimal" placeholder="from" value={f.smin} style="width:72px" onchange={e => setF("smin", e.currentTarget.value)}><span class="hint">to</span><input class="inp" data-filt="smax" inputmode="decimal" placeholder={String(c.scoreTop)} value={f.smax} style="width:72px" onchange={e => setF("smax", e.currentTarget.value)}><label class="ctl"><input type="checkbox" data-filtc="unscored" checked={f.unscored} onchange={e => setF("unscored", e.currentTarget.checked)}> Not scored</label></div></div>
      <div class="fp"><p class="label">Released</p><div class="bar"><input class="inp" data-filt="ymin" inputmode="numeric" placeholder="from" value={f.ymin} style="width:72px" onchange={e => setF("ymin", e.currentTarget.value)}><span class="hint">to</span><input class="inp" data-filt="ymax" inputmode="numeric" placeholder="to" value={f.ymax} style="width:72px" onchange={e => setF("ymax", e.currentTarget.value)}></div></div>
      {#if c.seasons.length}<div class="fp"><p class="label">Season</p>{@render chips("seasons", c.seasons)}</div>{/if}
      {#if adv}
      <div class="fp"><p class="label">Ownership</p>{@render sel("filt-own", [["", "Any"], ["owned", "Own it"], ["physical", "Physical"], ["digital", "Digital"], ["none", "Don't own"], ["buy", "Plan to buy"]], f.own, "own")}</div>{/if}
      <div class="fp"><p class="label">Progress</p>{@render sel("filt-started", [["", "Any"], ["yes", "Started"], ["no", "Not started"]], f.started, "started")}<label class="ctl" style="margin-top:6px"><input type="checkbox" data-filtc="fav" checked={f.fav} onchange={e => setF("fav", e.currentTarget.checked)}> Favourites only</label></div>
    </div>{#if adv}<FilterRules {f} />{/if}<input type="hidden" value={c.step}></div>
