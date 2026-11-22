<!--
    src/features/library/tiers/TierBoard.svelte
    ─────────────────────────────────────────────────────────────────
      A tier list's board: its tiers, each with its name and colour (edited in place), how many and their mean score,
      its entries, and moving, deleting or adding a tier (tl-…, tiers.ts); or, ranked, one numbered column. A tier's
      label and zone take what's selected when pressed (tl-place).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { TierRow } from "../../core/model";
    import type { ChipLook } from "../tiers";
    import TierChip from "./TierChip.svelte";

    let {
        rows,
        rank,
        chips,
        avgs,
        mark,
        over,
        rename,
        recolour,
    }: {
        rows: TierRow[];
        rank: boolean;
        chips: Record<string, ChipLook | null>;
        avgs: string[];
        mark: (key: string) => string;
        over: (zone: string) => string;
        rename: (i: number, v: string) => void;
        recolour: (i: number, v: string) => void;
    } = $props();
</script>

{#if rank}<div class="rankboard{over('0')}" data-tz="0">{#each rows[0].ids.filter(k => chips[k]) as k, i (i + ":" + k)}{@const c = chips[k]}{#if c}<TierChip {c} mark={mark(k)} n={rows[0].ids.indexOf(k)} />{/if}{:else}<p class="hint rkempty">Drag entries here, or select some and press 1.</p>{/each}</div>{:else}<div class="tierboard">{#each rows as r, i (i)}<div class="tgap{i ? '' : ' first'}"><button data-act="tl-addrow" data-k={i} title="Add a tier here">+ tier</button></div>
    <div class="trow" data-trow={i}><div class="tlabel" style="background:{r.color}" data-act="tl-place" data-k={i}><input value={r.label} data-tllabel={i} aria-label="Tier name" onchange={e => rename(i, e.currentTarget.value)} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}><small>{r.ids.length}{avgs[i] ? " · " + avgs[i] : ""}</small><input type="color" value={r.color} data-tlcolor={i} aria-label="Tier colour" onchange={e => recolour(i, e.currentTarget.value)}></div>
        <div class="tzone{over(String(i))}" data-tz={i} data-act="tl-place" data-k={i}>{#each r.ids as k, j (j + ":" + k)}{@const c = chips[k]}{#if c}<TierChip {c} mark={mark(k)} />{/if}{/each}</div>
        <div class="tops"><button class="btn sm ghost" data-act="tl-rowmove" data-k={i} data-d="-1" disabled={i === 0} aria-label="Move tier up">↑</button><button class="btn sm ghost" data-act="tl-rowmove" data-k={i} data-d="1" disabled={i === rows.length - 1} aria-label="Move tier down">↓</button><button class="btn sm ghost" data-act="tl-rowdel" data-k={i} aria-label="Delete tier">✕</button></div></div>{/each}
    <div class="tgap last"><button data-act="tl-addrow" data-k={rows.length}>+ tier</button></div></div>{/if}
