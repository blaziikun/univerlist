<!--
    src/features/core/menus/BlockMenu.svelte
    ─────────────────────────────────────────────────────────────────
      A block's settings, on the overview or the stats page (its ⋯, or a right-click on it): its title, what a stat you
      built measures and splits by, its width, how it's drawn, how many rows or entries, and moving, copying or
      removing it. k is "<kind>:<place>" (kind "ov" or "st", library/blocks.ts BKIND).
      The boxes save as they change (setBlocks); the buttons are "blk-…" (library/handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { curMode } from "../core";
    import { BKIND, blocksOf, setBlocks } from "../../library/blocks";
    import { STAT_MEASURES, STAT_SPLITS } from "../../library/custom-stats";
    import type { BlockSpec } from "../model";

    let { k }: { k: string } = $props();

    const kind = $derived(k.split(":")[0] || "ov"),
        i = $derived(Number(k.split(":")[1]));
    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        const cfg = blocksOf(curMode(), kind)[i];
        if (!cfg) return null;
        const def = BKIND[kind].reg()[cfg.k];
        return { cfg: { ...cfg }, def, w: String(cfg.w || def.w), types: def.types || [] };
    });
    const set = (change: Partial<BlockSpec>) =>
        setBlocks(curMode(), B => B.map((x, j) => (j === i ? { ...x, ...change } : x)), kind);
    const SPLITS = STAT_SPLITS.map((x): [string, string] => [x[0], x[1]]);
</script>

{#if v}
    {@const { cfg, def } = v}
    <div class="ctx-h"><b>{cfg.title || def.name}</b><small>{def.d}</small></div>
    <div class="ctx-s"><span class="ilab">Title</span><input class="inp" data-blkt={i} data-bkind={kind} value={cfg.title || ""} placeholder={def.name} onchange={e => set({ title: e.currentTarget.value.trim() || undefined })}></div>
    {#if def.custom}<div class="ctx-s"><span class="ilab">Measure</span><select class="sel" data-blkc="metric" data-k={i} data-bkind={kind} value={cfg.metric || "count"} onchange={e => set({ metric: e.currentTarget.value })}>{#each STAT_MEASURES as [x, l]}<option value={x}>{l}</option>{/each}</select></div>
        <div class="ctx-s"><span class="ilab">Split by</span><select class="sel" data-blkc="by" data-k={i} data-bkind={kind} value={cfg.by || "type"} onchange={e => set({ by: e.currentTarget.value })}>{#each SPLITS as [x, l]}<option value={x}>{l}</option>{/each}</select></div>
        <div class="ctx-s"><label class="ctl"><input type="checkbox" data-blkc="fin" data-k={i} data-bkind={kind} checked={!!cfg.fin} onchange={e => set({ fin: e.currentTarget.checked })}> Finished only</label></div>{/if}{#if def.nums}<div class="ctx-s"><label class="ctl"><input type="checkbox" data-blkc="nonum" data-k={i} data-bkind={kind} checked={!!cfg.nonum} onchange={e => set({ nonum: e.currentTarget.checked })}> Hide the position numbers</label></div>{/if}
    <div class="ctx-s"><span class="ilab">Width</span><div class="ctx-st">{#each [["4", "Small"], ["6", "Half"], ["8", "Large"], ["12", "Full"]] as [x, l]}<button data-act="blk-w" data-k={i} data-w={x} data-bkind={kind} aria-pressed={v.w === x}>{l}</button>{/each}</div></div>
    {#if v.types.length}<div class="ctx-s"><span class="ilab">Show as</span><div class="ctx-st">{#each v.types as [x, l]}<button data-act="blk-type" data-k={i} data-t={x} data-bkind={kind} aria-pressed={(cfg.type || def.type) === x}>{l}</button>{/each}</div></div>{/if}
    {#if def.rows}<div class="ctx-s"><span class="ilab">Rows · {cfg.rows || def.rows}</span><div class="ctx-st"><button data-act="blk-rows" data-k={i} data-d="-1" data-bkind={kind}>Fewer</button><button data-act="blk-rows" data-k={i} data-d="1" data-bkind={kind}>More</button></div></div>{/if}
    {#if def.n}<div class="ctx-s"><span class="ilab">How many · {cfg.n || def.n}</span><div class="ctx-st">{#each [3, 5, 8, 12, 20] as n}<button data-act="blk-n" data-k={i} data-n={n} data-bkind={kind} aria-pressed={(cfg.n || def.n) === n}>{n}</button>{/each}</div></div>{/if}
    <div class="ctx-a"><button data-act="blk-move" data-k={i} data-d="-1" data-bkind={kind}>↑ Earlier</button><button data-act="blk-move" data-k={i} data-d="1" data-bkind={kind}>↓ Later</button><button data-act="blk-dup" data-k={i} data-bkind={kind}>Duplicate</button><button data-act="blk-del" data-k={i} data-bkind={kind}>Remove</button></div>
{/if}
