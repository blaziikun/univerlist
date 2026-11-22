<!--
    src/features/library/favourites/FavouritesPage.svelte
    ─────────────────────────────────────────────────────────────────
      A mode's Favourites tab: your favourites in your one order (split by the mode's shelves or all together, as
      covers or large with why you love them), then your characters (together or by gender, filtered by what you type).
      What it shows comes from favouritesView() in connect.ts. Dragging a favourite or a character onto another puts it
      there (lists/reorder.svelte.ts); the filter box is this page's own, and remembered while the app is open
      (ui.charQ). The buttons go through layout-view, fav-nums, fav-add, fav-edit and char-add.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { ui } from "../../core/core";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import LayoutSeg from "../../core/page/LayoutSeg.svelte";
    import { favouritesView } from "../connect";
    import { charDrop, favDrop } from "../item-actions";
    import { Reorder } from "../lists/reorder.svelte";
    import Cover from "../tiles/Cover.svelte";
    import FavTile from "../tiles/FavTile.svelte";
    import CharTile from "../tiles/CharTile.svelte";
    import Pic from "../../core/dialog/Pic.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return favouritesView();
    });
    // what's typed into the characters' filter
    let q = $state(ui.charQ || "");
    function filter(value: string) {
        q = ui.charQ = value;
        store.flush("ui");
    }

    // dragging a favourite or a character into another place
    const favs = new Reorder(
        () => "[data-favid]",
        el => el.dataset.favid,
        favDrop
    );
    const chars = new Reorder(
        () => "[data-charid]",
        el => el.dataset.charid,
        charDrop
    );
    function start(e: DragEvent) {
        favs.start(e);
        chars.start(e);
    }
    function over(e: DragEvent) {
        favs.dragover(e);
        chars.dragover(e);
    }
    function drop(e: DragEvent) {
        favs.dropped(e);
        chars.dropped(e);
    }
    function end() {
        favs.end();
        chars.end();
    }
</script>

<svelte:document ondragstart={start} ondragover={over} ondrop={drop} ondragend={end} />

<HiddenNote /><div class="ph"><div class="ttl"><p>One master order; every mode shows its slice. Split follows this mode's shelves. Drag to reorder.</p></div><span class="spacer"></span>
      {#each v.segs as s (s.key)}<LayoutSeg {s} />{/each}<button class="btn sm ghost" data-act="fav-nums" aria-pressed={!v.nonum} title="Show or hide the position numbers">№</button><button class="btn gold" data-act="fav-add">+ Favourite</button></div>
    {#if v.any}{#each v.groups as g, gi (gi)}<section class="group">{#if g.name}<div class="plaque"><h3>{g.name}</h3><span class="n">{g.tiles.length}</span></div>{/if}
      <div class="favgrid {v.large ? 'large' : 'grid'}{v.nonum ? ' nonum' : ''}">{#each g.tiles as t (t.b.id)}{#if v.large}<div class="ftile2 large{favs.mark(t.b.id)}" draggable="true" data-favid={t.b.id}><button class="cwrap" data-act="open" data-id={t.b.id}><span class="rk">{t.rk}</span>{#if t.src}<Pic src={t.src} loading="lazy" />{:else}<Cover b={t.b} />{/if}</button>
      <span class="t">{t.title}</span><span class="hint">{t.hint}</span>{#if t.why}<p class="why">{t.why}</p>{/if}<button class="linkbtn" data-act="fav-edit" data-id={t.b.id}>Picture & why</button></div>{:else}<FavTile b={t.b} drag mark={favs.mark(t.b.id)} />{/if}{/each}</div></section>{/each}{:else}<div class="empty"><h3>No favourites here yet</h3><p>Press ♥ on anything's card.</p></div>{/if}
    <section class="group chars"><div class="plaque"><h3>Characters</h3><span class="n">{v.chars}</span><span class="spacer"></span><LayoutSeg s={v.charSeg} />
      <input class="inp" id="char-q" placeholder="Filter" value={q} oninput={e => filter(e.currentTarget.value)} style="max-width:150px"><button class="btn sm gold" data-act="char-add">+ Character</button></div>
      {#if v.chars}{#each v.cgroups as g, gi (gi)}{#if g.g}<p class="label sub">{g.g} · {g.shown.length}</p>{/if}<div class="chargrid2 {v.large ? 'large' : 'grid'}">{#each g.shown as c (c.id)}<CharTile {c} drag big={v.large} mark={chars.mark(c.id)} />{/each}</div>{/each}{:else}<p class="hint">Add characters from anything's Cast tab (anime, shows and films), or search for one.</p>{/if}</section>
