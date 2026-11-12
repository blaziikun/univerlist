<!--
    src/features/library/blocks/BlockGrid.svelte
    ─────────────────────────────────────────────────────────────────
      A page of blocks you arrange per mode: the overview's (and, once it moves, the stats page's). Each block in the
      mode's layout (blocksOf), in its width, with its title, its "All" link, its settings (⋯, or right-click: the
      block menu) and − to remove it; drawn by its component (views), or as a chart (ChartBlock) when it says what it
      shows. Below: adding a block, arranging them (then they're dragged into place), and where the layout comes from.
      The buttons go through blk-… (library/handlers.ts), as the stats page's do; dragging into place is this grid's
      own. Blocks are packed like masonry (each spans as many 6px rows as it's tall) and rows of covers fill whole
      rows (fitRows, packBlocks in blocks.ts), again whenever what's in them, the width or a picture changes.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts" generics="X extends object">
    import { onMount, type Component } from "svelte";
    import { store } from "../../core/store.svelte";
    import { curMode } from "../../core/core";
    import {
        blockAdded,
        blocksOf,
        blockSource,
        BKIND,
        fitRows,
        packBlocks,
        setBlocks,
        type BlockBase,
        type BlockDef,
    } from "../blocks";
    import ChartBlock from "./ChartBlock.svelte";

    let {
        kind,
        reg,
        base,
        views,
    }: {
        kind: string;
        reg: Record<string, BlockDef<X>>;
        base: X;
        views: Record<string, Component<{ c: BlockBase & X }>>;
    } = $props();

    const v = $derived.by(() => {
        void store.meta;
        const u = store.ui,
            mode = curMode(),
            B = blocksOf(mode, kind);
        return {
            mode,
            edit: u.blocksEdit === kind,
            adding: u.blockAdd === kind,
            src: blockSource(mode, kind),
            hasShared: !!((store.meta.layout.shared || {})[BKIND[kind].key] || []).length,
            blocks: B.map((cfg, i) => {
                const def = reg[cfg.k];
                return { i, cfg, def, c: { ...base, mode, cfg, n: cfg.n || def.n || 8, type: cfg.type || def.type } };
            }),
            opts: Object.entries(reg)
                .filter(([, d]) => !d.only || d.only(mode))
                .map(([k, d]) => ({ k, d, on: B.some(x => x.k === k) })),
        };
    });

    // ── dragging blocks into place, while arranging ──
    let from = $state<number | null>(null),
        over = $state<number | null>(null);
    function start(e: DragEvent, i: number) {
        if (!v.edit || (e.target instanceof Element && e.target.closest(".qi"))) return;
        from = i;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try {
                e.dataTransfer.setData("text/plain", "blk");
            } catch (_) {}
        }
        e.stopPropagation();
    }
    function enter(e: DragEvent, i: number) {
        if (from == null) return;
        e.preventDefault();
        over = i;
    }
    function drop(e: DragEvent, to: number) {
        if (from == null) return;
        const f = from;
        from = over = null;
        e.preventDefault();
        e.stopPropagation();
        if (to === f) return;
        setBlocks(
            curMode(),
            B => {
                const x = B.splice(f, 1)[0];
                B.splice(to, 0, x);
                return B;
            },
            kind
        );
    }
    const end = () => (from = over = null);

    // a block just added flashes once
    let just = $state(-1);
    $effect(() => {
        const n = v.blocks.length;
        if (blockAdded.kind !== kind || Date.now() - blockAdded.at > 1400) return;
        blockAdded.kind = "";
        just = n - 1;
        setTimeout(() => (just = -1), 1400);
    });

    // ── masonry, and whole rows of covers ──
    let grid = $state<HTMLElement>();
    const layout = () => {
        if (!grid) return;
        fitRows(grid);
        packBlocks(grid);
    };
    $effect(() => {
        void v;
        layout();
    });
    onMount(() => {
        if (!grid) return;
        const g = grid;
        let w = g.clientWidth,
            again: ReturnType<typeof setTimeout> | undefined;
        const ro =
            "ResizeObserver" in window
                ? new ResizeObserver(() => {
                      if (Math.abs(g.clientWidth - w) > 2) {
                          w = g.clientWidth;
                          layout();
                      }
                  })
                : null;
        ro?.observe(g);
        // a picture arriving makes its block taller
        const loaded = (e: Event) => {
            if (!(e.target instanceof HTMLImageElement)) return;
            clearTimeout(again);
            again = setTimeout(layout, 120);
        };
        g.addEventListener("load", loaded, true);
        if (document.fonts) document.fonts.ready.then(layout);
        return () => {
            ro?.disconnect();
            clearTimeout(again);
            g.removeEventListener("load", loaded, true);
        };
    });
</script>

<div class="blocks{v.edit ? ' editing' : ''}" data-bkind={kind} bind:this={grid}>{#each v.blocks as b (b.i + ":" + b.cfg.k)}{@const V = views[b.cfg.k]}<!-- svelte-ignore a11y_no_static_element_interactions: dragging is for the mouse; without one, a block's menu moves it earlier or later --><section class="panel blk w{b.cfg.w || b.def.w}{from === b.i ? ' drag' : ''}{over === b.i ? ' over' : ''}{just === b.i ? ' justadded' : ''}" data-bi={b.i} data-bk={b.cfg.k} data-bkind={kind} draggable={v.edit ? "true" : "false"} ondragstart={e => start(e, b.i)} ondragover={e => enter(e, b.i)} ondrop={e => drop(e, b.i)} ondragend={end}>
    <h3 class="bh"><span class="bt">{b.cfg.title || b.def.name}</span>{#if b.def.link}<span class="r"><button class="linkbtn" data-act={b.def.link[0]} data-k={b.def.link[1]}>All</button></span>{/if}</h3>
    <div class="btools">{#if v.edit}<span class="bdrag" title="Drag to move">⋮⋮</span>{/if}<button class="bset" data-act="blk-menu" data-k={b.i} data-bkind={kind} title="Block settings (or right-click)" aria-label="Settings for {b.def.name}">⋯</button><button class="bx" data-act="blk-del" data-k={b.i} data-bkind={kind} title="Remove this block" aria-label="Remove {b.def.name}">−</button></div>
    <div class="bbody"><svelte:boundary onerror={e => console.warn(b.cfg.k, e)}>{#if V}<V c={b.c} />{:else if b.def.chart}<ChartBlock type={b.c.type} data={b.def.chart(b.c)} />{/if}{#snippet failed()}<p class="hint">This block couldn't load.</p>{/snippet}</svelte:boundary></div></section>{/each}</div>
<div class="blkbar">{#if v.adding}<div class="blkpick panel"><p class="label">Add a block</p><div class="blkopts">{#each v.opts as o (o.k)}<button class="blkopt" data-act="blk-add" data-k={o.k} data-bkind={kind}><b>{o.d.name}</b><small>{o.d.d}</small>{#if o.on}<em>on</em>{/if}</button>{/each}</div><div class="bar"><button class="btn sm ghost" data-act="blk-addclose">Close</button></div></div>{:else}<button class="btn sm ghost" data-act="blk-addopen" data-bkind={kind}>+ Add a block</button><button class="btn sm ghost" data-act="blk-edit" data-bkind={kind}>{v.edit ? "Done arranging" : "Arrange"}</button>
    <span class="blksrc hint">{v.src === "own" ? `This layout is ${v.mode.name}'s own.` : v.src === "shared" ? "Using the layout shared by every mode." : `${v.mode.name}'s default layout.`}</span>
    <button class="btn sm ghost" data-act="blk-share" data-bkind={kind} title="Every mode without its own layout uses this one">Use this layout in every mode</button>
    {#if v.src === "own"}<button class="btn sm ghost" data-act="blk-unown" data-bkind={kind}>{v.hasShared ? "Go back to the shared layout" : "Go back to the default"}</button>{/if}{/if}</div>
