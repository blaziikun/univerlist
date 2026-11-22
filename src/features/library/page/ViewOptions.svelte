<!--
    src/features/library/page/ViewOptions.svelte
    ─────────────────────────────────────────────────────────────────
      ⋯ on the library bar: size and spacing, titles, true size, game box shapes, manga as separate volumes, the
      order within a series, making this view the default, and arranging by dragging. The sliders and boxes are
      handled here; the buttons go through their data-act names (library/handlers.ts, settings/handlers.ts).
      Size and spacing change the page as you drag (the shelves' --z and --gz, live.svelte.ts) and are saved when you let
      go.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../../core/Icon.svelte";
    import { markDirty, meta } from "../../core/core";
    import { viewOpts } from "../../core/views";
    import { store } from "../../core/store.svelte";
    import { renderMain } from "../../core/shell";
    import { VIEW_LIST, type LibraryView } from "../library";
    import { live } from "./live.svelte";

    let { lib, arrange }: { lib: LibraryView; arrange: boolean } = $props();

    const view = $derived(lib.view);
    const vo = $derived(lib.vo);
    const games = $derived(lib.all.some(b => b.medium === "game"));
    // what you keep: the game boxes' shape and the order within a series
    const S = $derived({ ...store.meta.settings });

    /** one of this view's options, for this mode */
    function setOpt(k: string, v: number | boolean) {
        const md = lib.mode;
        md.vz = { ...(md.vz || {}), [view]: { ...viewOpts(md, view), [k]: v } };
    }
    function slide(k: "z" | "gap", v: number) {
        setOpt(k, v);
        live.set(k, v);
    }
    function slid() {
        live.clear();
        markDirty();
        renderMain();
    }
    function tick(k: string, on: boolean) {
        setOpt(k, on);
        markDirty();
        renderMain();
    }
    function boxes(on: boolean) {
        meta.settings.gameBoxes = on;
        markDirty();
        renderMain();
    }
    const z = $derived(live.z ?? vo.z);
    const gap = $derived(live.gap ?? vo.gap);
</script>

<div class="popbody right">
            {#if view !== "list"}<p class="label">Size and spacing</p><div class="lb-sizes-pop"><label class="sizer" title="Size (− and +)"><Icon name="size" /><input type="range" data-vz="z" min=".55" max="1.9" step=".05" value={vo.z} aria-label="Size" oninput={e => slide("z", parseFloat(e.currentTarget.value))} onchange={slid}><output>{Math.round(z * 100)}%</output></label>
  <label class="sizer" title="Spacing"><Icon name="gap" /><input type="range" data-vz="gap" min="0" max="2.5" step=".1" value={vo.gap} aria-label="Spacing" oninput={e => slide("gap", parseFloat(e.currentTarget.value))} onchange={slid}><output>{Math.round(gap * 100)}%</output></label></div>{/if}
            {#if view !== "list"}<label class="ctl"><input type="checkbox" data-vzc="titles" checked={!!vo.titles} onchange={e => tick("titles", e.currentTarget.checked)}> {view === "spine" ? "Titles on spines" : view === "cover" ? "Titles under covers" : "Titles and details"}</label>{/if}
            {#if view === "cover"}<label class="ctl"><input type="checkbox" data-vzc="true" checked={!!vo.true} onchange={e => tick("true", e.currentTarget.checked)}> True size (a Wii case taller than a DS case)</label>{/if}
            {#if games}<label class="ctl"><input type="checkbox" data-gameboxes="1" checked={S.gameBoxes !== false} onchange={e => boxes(e.currentTarget.checked)}> Game boxes in their real shape (a DS box nearly square, a Switch case narrow)</label>{/if}
            {#if view === "spine"}<label class="ctl"><input type="checkbox" data-vzc="split" checked={!!vo.split} onchange={e => tick("split", e.currentTarget.checked)}> Manga as separate volumes</label>{/if}
            {#if lib.sort === "order"}<p class="label" style="margin-top:10px">Order within a series</p><div class="seg">{#each [["release", "Release"], ["story", "Story"]] as [k, l]}<button data-act="watch-order" data-k={k} aria-pressed={(S.watchOrder || "release") === k}>{l}</button>{/each}</div><p class="hint">Story order uses each entry's place in the story (set it under More › Edit details).</p>{/if}
            <p class="label" style="margin-top:10px">Make {VIEW_LIST.find(x => x[0] === view)?.[1] || view} the default</p>
            <div class="bar"><button class="btn sm" data-act="view-default" data-k="mode">For {lib.mode.name}</button><button class="btn sm" data-act="view-default" data-k="all">For every mode</button></div>
            <div class="bar" style="margin-top:4px"><button class="btn sm" data-act="vz-all">Use this size and spacing everywhere</button></div>
            <div class="msep"></div>
            {#if view !== "list"}<button class="linkbtn" data-act="arrange">{arrange ? "Done arranging" : "Rank or arrange by dragging"}</button><br>{/if}<button class="linkbtn" data-act="save-view">Save these filters to the sidebar</button></div>
