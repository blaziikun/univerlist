<!--
    src/features/library/page/ListRow.svelte
    ─────────────────────────────────────────────────────────────────
      One entry in the List view: tick, cover, title (♥ for a favourite), creator, type, genres, year, progress,
      status, your score, the crowd's, and when it ended. The row opens the entry (data-act="open").
      at: its row number for screen readers, when the table draws only part of itself. sizing: one of the rows kept out
      of sight only to hold the columns as wide as the whole table would make them (columns.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { listCells } from "./columns";
    import Cover from "../tiles/Cover.svelte";
    import { tilesWatch } from "../tiles/watch";
    import type { Entry } from "../../core/model";

    let { b, sel, at = 0, sizing = false }: { b: Entry; sel: boolean; at?: number; sizing?: boolean } = $props();

    // the row's cells, worked out again when anything changes (the scores' scale, the words for a status)
    const row = $derived.by(() => {
        tilesWatch();
        return listCells(b);
    });
</script>

<tr class="tr{sel ? ' sel' : ''}{sizing ? ' vpad' : ''}" data-act={sizing ? undefined : "open"} data-id={sizing ? undefined : b.id} aria-rowindex={at || undefined} aria-hidden={sizing ? "true" : undefined} style={sizing ? "visibility:collapse" : undefined}><td style="width:28px"><span class="check">✓</span></td><td class="mini"><Cover {b} /></td>
      <td><span class="tt">{row.title}</span>{#if b.fav}{" "}<span class="favmark inline">♥</span>{/if}</td>
      <td>{b.creator || ""}</td><td>{row.type}</td><td class="gen">{row.genres}</td><td class="num">{b.year || ""}</td><td class="num">{row.prog}</td><td>{#if b.status === "want"}<span class="hint">{row.want}</span>{:else}<span class="pill {b.status}">{row.status}</span>{/if}</td><td>{#if row.score}<span class="myscore" title="Your score">{row.score}</span>{/if}</td><td>{#if row.crowd}<span class="crowd" title={row.crowdTitle}>{row.crowd}</span>{/if}</td><td class="num">{row.ended}</td></tr>
