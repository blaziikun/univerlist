<!--
    src/features/library/page/LibraryGroup.svelte
    ─────────────────────────────────────────────────────────────────
      One group on the library page (a status, a type, a genre…): its plaque, and its shelf of covers, cards or
      spines in the order it's sorted. In a big library only the rows near the window are drawn (shelf.svelte.ts),
      with an empty block standing in for the rest; otherwise every tile is.
      The plaque is where tiles are dropped to move them to this group (LibraryPage's dragging).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { callOf } from "../../core/views";
    import { boxShapes, gameAspect, spineSize, tileStyle, volumesOf } from "../tiles/tiles";
    import Card from "../tiles/Card.svelte";
    import CoverTile from "../tiles/CoverTile.svelte";
    import Spine from "../tiles/Spine.svelte";
    import { ShelfWindow, type ShelfTiles } from "./shelf.svelte";
    import type { LibGroup, LibraryView } from "../library";
    import type { Entry } from "../../core/model";

    let {
        gr,
        lib,
        cls,
        virtual,
        vp,
        arrange,
        selOf,
        markOf,
        drop,
    }: {
        gr: LibGroup;
        lib: LibraryView;
        /** the shelf's class: grid, faceout or shelf, and its options */
        cls: string;
        virtual: boolean;
        vp: { y: number; h: number; tick: number };
        arrange: boolean;
        selOf: (id: string) => boolean;
        markOf: (id: string) => string;
        /** the group a drag is over, to show it takes the drop */
        drop: string | null;
    } = $props();

    const view = $derived(lib.view);
    const vo = $derived(lib.vo);
    const key = $derived(lib.group + ":" + gr.k);
    const win = new ShelfWindow();
    let wrap: HTMLElement | undefined = $state();

    const on = $derived(virtual && !win.off);
    const first = $derived(on ? win.first() : 0);
    const shown = $derived(on ? gr.items.slice(first, win.end(gr.items.length)) : gr.items);
    const rows = $derived(win.starts.length - 1);
    const flow = $derived(view === "spine" || (view === "cover" && !!vo.true));
    // the blocks standing in for rows not drawn. The browser mustn't hold the page still by one of them (scroll
    // anchoring) when rows are drawn above it, or the page would jump by all the rows it stands for
    const pad = (h: number) =>
        (flow ? `flex:0 0 100%;height:${h}px` : `grid-column:1/-1;height:${h}px`) + ";overflow-anchor:none";

    // the shelf's tiles, for working out its rows
    function tiles(): ShelfTiles {
        const z = vo.z,
            gz = vo.gap,
            items = gr.items,
            split = !!vo.split;
        return {
            layout: flow ? "flow" : "grid",
            ids: items.map(b => b.id),
            key: [view, z, gz, split, vo.titles, vo.true, boxShapes()].join("|"),
            width:
                view === "spine"
                    ? i => {
                          const b = items[i],
                              vols = volumesOf(b, split);
                          if (!vols.length) return spineSize(b)[0] * z;
                          return vols.reduce((a, v) => a + spineSize(b, v)[0] * z, 0) + (vols.length - 1) + 3 * gz;
                      }
                    : (i, cover) => {
                          const b = items[i],
                              ts = Number(/--ts:([\d.]+)/.exec(tileStyle(b))?.[1] || 1),
                              box = b.medium === "game" && boxShapes() ? gameAspect(b) * 1.5 : 1;
                          return cover * 0.86 * z * ts * box;
                      },
            height:
                view === "spine"
                    ? (a, e) => {
                          let h = 0;
                          for (let i = a; i < e; i++) h = Math.max(h, spineSize(items[i])[1] * z);
                          return h;
                      }
                    : undefined,
        };
    }
    $effect(() => {
        // after the window moves or the page changes, and after this shelf's own draw
        void [vp.y, vp.h, vp.tick, win.a, win.b, win.ready, win.above, win.below, gr.items, cls, virtual];
        const el = wrap;
        if (!virtual || !el) return;
        untrack(() => win.update(el, tiles(), vp.y, vp.h, vp.tick));
    });
    const rk = (i: number) => (gr.sort === "rank" && arrange ? i + 1 : 0);
</script>

{#snippet tile(b: Entry, i: number)}
    {#if view === "spine"}{@const vols = volumesOf(b, !!vo.split)}{#if vols.length}<span class="volset{markOf(b.id)}" data-oid={b.id} draggable={arrange ? "true" : undefined}>{#each vols as v}<Spine {b} call="" vol={v} sel={selOf(b.id)} />{/each}</span>{:else}<Spine {b} call={callOf(b.id)} sel={selOf(b.id)} {arrange} mark={markOf(b.id)} />{/if}{:else if view === "cover"}<CoverTile {b} sel={selOf(b.id)} badge={rk(i)} mark={markOf(b.id)} />{:else}<Card {b} sel={selOf(b.id)} badge={rk(i)} mark={markOf(b.id)} />{/if}
{/snippet}

<section class="group">{#if gr.k}<div class="plaque{drop === key ? ' dropok' : ''}" data-gdrop={key}><h3>{gr.label}</h3><span class="n">{gr.items.length}</span></div>{/if}<div class={cls} data-gsort={gr.sort} bind:this={wrap}>{#if on && win.ready && win.a > 0}<div class="vpad" aria-hidden="true" style={pad(win.above)}></div>{/if}{#each shown as b, j (b.id)}{@render tile(b, first + j)}{/each}{#if on && win.ready && win.b < rows}<div class="vpad" aria-hidden="true" style={pad(win.below)}></div>{/if}</div></section>
