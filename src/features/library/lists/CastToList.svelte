<!--
    src/features/library/lists/CastToList.svelte
    ─────────────────────────────────────────────────────────────────
      A title's characters or cast → a list: tick who goes in (all of them at first), choose a ranked or tier list (or
      a new one), and add. Opened from the item card ("cast-tolist", listadd.ts), which it goes back to on Close.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { titleOf } from "../../core/core";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import { castOf, castToList, isPlaceSet } from "../listadd";
    import { tierWhat } from "../tiers";
    import type { CastMember } from "../../core/model";

    const v = $derived.by(() => {
        const m = store.ui.modal,
            b = m && m.kind === "castlist" ? store.item(m.id || "") : null;
        if (!m || !b) return null;
        const cast = castOf(m);
        return {
            m: { ...m },
            b: { ...b },
            cast,
            sel: isPlaceSet(m.sel) ? m.sel : new Set(cast.map((_, i) => i)),
            lists: store.meta.lists.filter(l => l.kind === "tier" && tierWhat(l) === m.what),
        };
    });
    // svelte-ignore state_referenced_locally
    let dest = $state(v ? v.m.dest || (v.lists[0] ? v.lists[0].id : "new-rank") : "new-rank");
    function toggle(i: number) {
        if (!v) return;
        const s = new Set(v.sel);
        if (s.has(i)) s.delete(i);
        else s.add(i);
        store.dialog({ sel: s });
    }
</script>

{#if v}
    {@const { m, b } = v}
    {@const chars = m.what === "chars"}
    {@const nm = (c: CastMember) => (chars ? c.name : c.va || "")}
    {@const sub = (c: CastMember) => (chars ? (c.va ? (c.role === "Voice" || ["anime", "game"].includes(b.medium) ? "voiced by " : "played by ") + c.va : c.role || "") : c.name ? "as " + c.name : "")}
    {@const img = (c: CastMember) => (chars ? (c.src === "tmdb" ? "" : c.image || "") : c.vaImage || (c.src === "tmdb" ? c.image : "") || "")}
    <DialogHead title="{chars ? 'Characters' : 'Cast'} of {titleOf(b)} → a list" />
    <div class="bar"><label class="ctl">Into <select class="sel" id="cl-dest" onchange={e => (dest = e.currentTarget.value)}>{#each [...v.lists.map(l => [l.id, l.name]), ["new-rank", "A new ranked list"], ["new-tier", "A new tier list"]] as [k, l]}<option value={k} selected={dest === k}>{l}</option>{/each}</select></label>
        <button class="linkbtn" data-act="cl-all" onclick={() => store.dialog({ sel: new Set(v.cast.map((_, i) => i)) })}>All</button><button class="linkbtn" data-act="cl-none" onclick={() => store.dialog({ sel: new Set<number>() })}>None</button></div>
    <div class="pigrid">{#each v.cast as c, i}<button class="pirow{v.sel.has(i) ? ' on' : ''}" data-act="cl-pick" data-k={i} aria-pressed={v.sel.has(i)} onclick={() => toggle(i)}><span class="pick">{v.sel.has(i) ? "■" : ""}</span>{#if img(c)}<Pic src={img(c)} loading="lazy" />{:else}<span class="noimg">{nm(c).charAt(0)}</span>{/if}<span class="t">{nm(c)}</span><span class="hint">{sub(c)}</span></button>{:else}<p class="hint">Nothing loaded for this yet.</p>{/each}</div>
    <div class="bar pibar"><span class="spacer"></span><button class="btn gold" data-act="cl-add" disabled={!v.sel.size} onclick={() => castToList(m, dest, v.sel)}>Add {v.sel.size}</button></div>
{/if}
