<!--
    src/features/sources/dialogs/ChooseCovers.svelte
    ─────────────────────────────────────────────────────────────────
      Choose covers quickly: one entry at a time, with every cover the catalogues have for it. Pick one (or press
      1–9), keep the current one (→), go back (←), upload one or paste a link. Picking is library/item-handlers.ts's
      (cp-pick, cp-next, cp-prev); the link is typed here. Where it is (ui.modal.i), what's been found for each entry
      (.cands, loaded a few ahead by coverPickLoad in core/events.ts) and how many were chosen are the dialog's state.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { MEDIA, titleOf, toast } from "../../core/core";
    import { coverPickLoad, setCover } from "../../core/events";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import Cover from "../../library/tiles/Cover.svelte";

    const v = $derived.by(() => {
        void store.items;
        const m = store.ui.modal;
        if (!m || m.kind !== "coverpick") return null;
        const queue = m.queue || [],
            i = m.i || 0,
            id = queue[i],
            b = id ? store.item(id) : undefined;
        return { m: { ...m }, queue, i, id, b: b && id ? { ...b, id } : null, c: id ? (m.cands || {})[id] : undefined };
    });
    let url = $state("");
    function useLink() {
        const u = url.trim();
        if (!/^https?:\/\//.test(u)) {
            toast("Paste a link that starts with https://");
            return;
        }
        if (!v) return;
        setCover(v.id || "", u);
        url = "";
        store.dialog({ picked: (v.m.picked || 0) + 1, i: v.i + 1 });
        coverPickLoad();
    }
</script>

{#if v}
    {#if !v.b}
        <DialogHead title="Choose covers" /><p>Done: {v.m.picked || 0} covers chosen.</p><div class="bar"><button class="btn gold" data-act="close">Close</button></div>
    {:else}
        {@const { b, c, m } = v}
        <DialogHead title="Choose covers · {v.i + 1} of {v.queue.length}" />
        <div class="cpick"><div class="cpcur"><Cover {b} /><p class="hint">Current</p></div>
            <div style="min-width:0"><div class="eyebrow">{b.kind || MEDIA[b.medium].one}{b.year ? " · " + b.year : ""}</div><h3 class="cptitle">{titleOf(b)}</h3><div class="hint">{b.creator || ""}</div>
                {#if c == null}<p class="think">Finding covers…</p>{:else if c.length}<div class="covergrid cpgrid">{#each c.slice(0, 18) as x, i}<button class="cg{b.cover === x.cover ? ' on' : ''}" data-act="cp-pick" data-k={i}><Pic src={x.cover} loading="lazy" /><span>{#if i < 9}<kbd>{i + 1}</kbd>{" "}{/if}{x.label}</span></button>{/each}</div>{:else}<p class="hint">No covers found for this one. Upload one, paste a link, or skip.</p>{/if}
                <div class="bar" style="margin-top:10px"><button class="btn" data-act="cp-prev" disabled={!m.i}>← Back</button><button class="btn" data-act="cp-next">Keep current →</button><button class="btn ghost" data-act="cover-photo">Upload…</button><input class="inp" id="cp-url" placeholder="…or paste an image link" style="max-width:220px" bind:value={url}><button class="btn sm" data-act="cp-url" onclick={useLink}>Use link</button></div>
                <p class="hint">Keys: <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>→</kbd> keep and next · <kbd>←</kbd> back. Pictures you choose are never replaced by syncs.</p></div></div>
    {/if}
{/if}
