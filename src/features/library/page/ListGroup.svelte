<!--
    src/features/library/page/ListGroup.svelte
    ─────────────────────────────────────────────────────────────────
      One group in the List view: its plaque and a table of its entries, sorted by a column's heading. In a big
      library only the rows near the window are drawn (shelf.svelte.ts), with an empty row standing in for the rest,
      and the few rows that decide the columns' widths are kept in out of sight (columns.ts), so the columns are as wide
      as with every row drawn, wherever you scroll. Screen readers are told the table's full length and each row's
      place in it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { ShelfWindow } from "./shelf.svelte";
    import ListRow from "./ListRow.svelte";
    import { ITEMS_VER } from "../../core/core";
    import { cellTexts, sizingRows } from "./columns";
    import type { Entry } from "../../core/model";
    import type { LibGroup, LibraryView } from "../library";

    let {
        gr,
        lib,
        virtual,
        vp,
        selOf,
        drop,
    }: {
        gr: LibGroup;
        lib: LibraryView;
        virtual: boolean;
        vp: { y: number; h: number; tick: number };
        selOf: (id: string) => boolean;
        drop: string | null;
    } = $props();

    const key = $derived(lib.group + ":" + gr.k);
    const win = new ShelfWindow();
    let body: HTMLElement | undefined = $state();
    /** the rows kept out of sight to hold the columns' widths (a big library only), and what they were picked for */
    let sizers = $state.raw<Entry[]>([]);
    let sizedFor = "";
    const first = $derived(virtual ? win.first() : 0);
    const shown = $derived(virtual ? gr.items.slice(first, win.end(gr.items.length)) : gr.items);
    const rows = $derived(win.starts.length - 1);
    const th = (k: string) => (lib.sort === k ? "descending" : undefined);

    $effect(() => {
        void [vp.y, vp.h, vp.tick, win.a, win.b, win.ready, win.above, win.below, gr.items, virtual];
        const el = body;
        if (!virtual || !el) {
            if (sizers.length) sizers = [];
            sizedFor = "";
            return;
        }
        untrack(() => {
            win.update(el, { layout: "table", ids: gr.items.map(b => b.id), key: "list" }, vp.y, vp.h, vp.tick);
            // the rows that decide the columns, picked again when the library changes: measured in the fonts of a row
            // on the page
            const items = gr.items,
                k = [ITEMS_VER, items.length, items[0]?.id, items[items.length - 1]?.id].join("|"),
                row = el.querySelector<HTMLTableRowElement>(":scope > tr.tr:not(.vpad)");
            if (k === sizedFor || !row) return;
            const font = (sel: string) => {
                const e = row.querySelector<HTMLElement>(sel);
                return e ? getComputedStyle(e).font : "";
            };
            const fonts = [...row.cells].map((td, i) =>
                i < 2 ? "" : i === 2 ? font(".tt") : getComputedStyle(td).font
            );
            sizers = sizingRows(items, cellTexts, fonts);
            sizedFor = k;
        });
    });
</script>

{#if gr.k}<div class="plaque{drop === key ? ' dropok' : ''}" data-gdrop={key}><h3>{gr.label}</h3><span class="n">{gr.items.length}</span></div>{/if}<div class="tablewrap"><table class="lib" aria-rowcount={virtual ? gr.items.length + 1 : undefined}><thead><tr><th></th><th></th><th aria-sort={th("title")}><button data-act="lsort" data-k="title">Title</button></th><th>Creator</th><th>Type</th><th>Genre</th><th aria-sort={th("release")}><button data-act="lsort" data-k="release">Year</button></th><th>Progress</th><th>Status</th><th aria-sort={th("rank")}><button data-act="lsort" data-k="rank">Score</button></th><th>Crowd</th><th aria-sort={th("ended")}><button data-act="lsort" data-k="ended">Ended</button></th></tr></thead><tbody bind:this={body}>
    {#if virtual && win.ready && win.a > 0}<tr class="vpad" aria-hidden="true" style="overflow-anchor:none"><td colspan="12" style="padding:0;border:0;border-bottom:1px solid var(--line);height:{win.above}px;overflow-anchor:none"></td></tr>{/if}{#each shown as b, j (b.id)}<ListRow {b} sel={selOf(b.id)} at={virtual ? first + j + 2 : 0} />{/each}{#if virtual && win.ready && win.b < rows}<tr class="vpad" aria-hidden="true" style="overflow-anchor:none"><td colspan="12" style="padding:0;border:0;border-bottom:1px solid var(--line);height:{win.below}px;overflow-anchor:none"></td></tr>{/if}{#each sizers as b (b.id)}<ListRow {b} sel={false} sizing />{/each}
  </tbody></table></div>
