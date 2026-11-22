<!--
    src/features/library/rank/SeasonsPanel.svelte
    ─────────────────────────────────────────────────────────────────
      The Rank tab's Seasons and sequels: anime sequels together or each on its own, TV scored season by season, new
      seasons put with their show; the shows that could be combined; and the combined ones, found by name, each with
      the season on its front. What it shows comes from seasonsView() in core/parts.ts. Its fold (remembered while the
      app is open: ui.seasonsOpen), the find box, the ticks and the front menus are its own; the buttons go through
      seasons-mode, seasons-combine and seasons-split (parts.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { markDirty, meta, ticked, ui } from "../../core/core";
    import { renderMain } from "../../core/shell";
    import { seasonFront, seasonsView } from "../../core/parts";
    import Cover from "../tiles/Cover.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return seasonsView();
    });
    let open = $state(!!ui.seasonsOpen);
    let q = $state(ui.seasonQ || "");
    function find(value: string) {
        q = ui.seasonQ = value;
        store.flush("ui");
    }
    function tv(box: HTMLInputElement) {
        meta.settings.seasons = { ...(meta.settings.seasons || {}), tv: ticked(box) };
        markDirty();
    }
    function auto(box: HTMLInputElement) {
        meta.settings.autoCombine = ticked(box);
        markDirty();
    }
    function front(head: string, box: HTMLSelectElement) {
        seasonFront(head, box.value);
        renderMain();
    }
</script>

{#if v}<details class="panel seasonsp" data-seasonsopen="1" bind:open ontoggle={e => (ui.seasonsOpen = e.currentTarget.open)}><summary><h3>Seasons and sequels</h3><span class="hint">{v.summary}</span></summary>
    <p class="hint">A combined show is ranked once, as a whole; its score is the average of its seasons until you score the whole. Each season keeps its own score inside it.</p>
    <div class="bar"><span class="lbk">Anime sequels</span><div class="seg">{#each [["together", "Together"], ["separate", "Each on its own"]] as [k, l] (k)}<button data-act="seasons-mode" data-k={k} aria-pressed={(v.apart ? "separate" : "together") === k}>{l}</button>{/each}</div>
      <label class="ctl"><input type="checkbox" data-seasons="tv" checked={v.tv} onchange={e => tv(e.currentTarget)}> Score TV shows season by season</label>
      <label class="ctl"><input type="checkbox" data-autocombine="1" checked={v.auto} disabled={v.apart} onchange={e => auto(e.currentTarget)}> Put new seasons with their show</label></div>{" "}{#if v.loose}<div class="seasonsloose"><p class="label">Not combined yet <button class="btn sm gold" data-act="seasons-combine" data-k="">Combine all {v.loose}</button></p>{#each v.looseRows as g (g.key)}<div class="srowx"><span class="t">{g.name}</span><span class="hint">{g.n}</span><button class="btn sm" data-act="seasons-combine" data-k={g.key}>Combine</button></div>{/each}</div>{" "}{/if}{#if v.heads}<div class="bar" style="margin-top:10px"><span class="label">Combined</span><span class="spacer"></span><input class="inp" id="season-q" placeholder="Find a show" value={q} oninput={e => find(e.currentTarget.value)} style="max-width:200px"></div>
      <div class="seasonslist">{#each v.shows as s (s.b.id)}<div class="srowx"><span class="pc"><Cover b={s.b} /></span><button class="t linkbtn" data-act="open" data-id={s.b.id}>{s.title}</button><span class="hint">{s.hint}</span>
          <label class="ctl">On the front <select class="sel" data-seasonfront={s.b.id} onchange={e => front(s.b.id, e.currentTarget)}>{#each s.parts as x (x.id)}<option value={x.id} selected={x.id === s.b.id}>{x.title}</option>{/each}</select></label><button class="btn sm ghost" data-act="seasons-split" data-k={s.b.id}>Split</button></div>{/each}</div>{" "}{/if}</details>{/if}
