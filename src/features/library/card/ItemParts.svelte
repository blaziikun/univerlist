<!--
    src/features/library/card/ItemParts.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's Parts: seasons, sequels or volumes kept together as this one entry (core/parts.ts), each with its
      own score. Split one out, combine another in, or split a manga into its volumes.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { fmtScore, MEDIA, scaleOf, statusWord, titleOf } from "../../core/core";
    import Cover from "../tiles/Cover.svelte";
    import { combineItems, partsView } from "../../core/parts";
    import { renderMain } from "../../core/shell";
    import { idFromOption } from "../../core/navigation";
    import type { Entry } from "../../core/model";

    let { b }: { b: Entry } = $props();
    const v = $derived(partsView(b));
    const rows = $derived([{ ...b, self: true }, ...v.parts.map(x => ({ ...x, self: false }))]);

    // "Combine another…": a title picked from the list joins this entry
    function combine(box: HTMLInputElement) {
        const iid = idFromOption(box.value);
        if (!iid || iid === b.id) return;
        combineItems([b.id, iid], b.id);
        box.value = "";
        renderMain();
    }
</script>

<div class="sec partsec"><div class="bar"><span class="label">{v.parts.length ? `${v.parts.length + 1} ${v.unit} in this entry` : "Parts"}</span>{#if v.avg}<span class="hint">· average of parts {fmtScore(v.avg)}</span>{/if}<span class="spacer"></span>{#if v.parts.length}<button class="linkbtn" data-act="parts-split" data-k="">Split all apart</button>{/if}</div>
    {#if v.parts.length}<div class="parts">{#each rows as x, i}<div class="ppart{x.self ? ' self' : ''}"><span class="pn">{i + 1}</span><span class="pc"><Cover b={x} /></span><button class="pt" data-act={x.self ? "" : "open"} data-id={x.id}><b>{titleOf(x)}</b><small>{[x.year, statusWord(x.status, x.medium)].filter(Boolean).join(" · ")}</small></button><span class="ps">{x.rating ? fmtScore(x.rating, scaleOf(x)) : "–"}</span>{#if x.self}<span class="hint">this one</span>{:else}<button class="linkbtn" data-act="parts-split" data-k={x.id}>Split out</button>{/if}</div>{/each}</div>
    {:else}<p class="hint">Keep seasons, sequels or volumes together as one entry. Each part keeps its own score and dates; split any back out whenever you like. You can also drag one cover onto another in the library.</p>{/if}
    <div class="bar">{#each v.same as x}<button class="chip" data-act="parts-add" data-k={x.id} title="Combine {titleOf(x)} into this entry">+ {titleOf(x)}</button>{/each}
        <input class="inp" list="parts-opts" placeholder="Combine another…" data-partsadd="1" style="flex:1;min-width:160px" onchange={e => combine(e.currentTarget)} /><datalist id="parts-opts">{#each v.others as x}<option value="{titleOf(x)} · {MEDIA[x.medium].one}"></option>{/each}</datalist>
        {#if ["manga", "manhwa", "novel", "comic"].includes(b.medium) && (b.vols || 0) > 1 && !v.parts.length}<button class="btn sm ghost" data-act="parts-vols">Split into {b.vols} volumes</button>{/if}</div></div>
