<!--
    src/features/settings/sections/Tags.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Tags: your own labels. Rename, recolour, delete one, or all (with Undo)
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";

    let confirmAll = $state(false);
    const tags = $derived(Object.entries(store.meta.tags).sort((a, b) => a[0].localeCompare(b[0])));
    const count = (t: string) => [...store.items.values()].filter(b => (b.tags || []).includes(t)).length;
    const withTag = (t: string) => [...items.entries()].filter(([, b]) => (b.tags || []).includes(t)).map(([i]) => i);

    function recolour(t: string, color: string) {
        store.updateMeta(m => (m.tags[t].color = color));
        renderSide(); // tags show in the sidebar too
    }
    /** a new name, on every entry that has it (one undoable step); two tags renamed to one become one */
    function rename(old: string, typed: string) {
        const nw = typed.trim();
        if (!nw || nw === old) return;
        const ids = withTag(old);
        meta.tags[nw] = meta.tags[nw] || meta.tags[old];
        delete meta.tags[old];
        markDirty();
        change("Rename tag", ids, b => ({
            ...b!,
            tags: [...new Set(b!.tags.map(x => (x === old ? nw : x)))],
            vibe: b!.vibe === old ? nw : b!.vibe,
        }));
        if (store.ui.tag === old) store.go({ tag: nw });
        else render();
    }
    function remove(t: string) {
        const ids = withTag(t);
        delete meta.tags[t];
        markDirty();
        if (ui.tag === t) ui.tag = null;
        change("Delete tag " + t, ids, b => ({ ...b!, tags: b!.tags.filter(x => x !== t) }));
        render();
    }
    function removeAll() {
        const ids = [...items.entries()].filter(([, b]) => (b.tags || []).length).map(([i]) => i),
            before = clone(meta.tags);
        meta.tags = {};
        confirmAll = false;
        change("Delete every tag", ids, b => ({ ...b!, tags: [] }), { metaBefore: { tags: before } });
        render();
        toast("Deleted every tag", { label: "Undo", fn: undo });
    }
</script>

<h2 class="sh">Tags</h2>
<p class="hint" style="margin-bottom:12px">Your own labels, on top of the standard genres. Rename, recolour or delete them here.</p>
<div class="panel">
    {#if tags.length}
        <div class="taglist">
            {#each tags as [t, v] (t)}
                <div class="bar">
                    <input type="color" class="tagcol" value={v.color} aria-label={`Colour for ${t}`} onchange={e => recolour(t, e.currentTarget.value)} />
                    <input class="inp" style="max-width:220px" value={t} aria-label={`Rename ${t}`} onchange={e => rename(t, e.currentTarget.value)} />
                    <span class="hint">{count(t)}</span>
                    <button class="btn sm ghost" onclick={() => remove(t)}>Delete</button>
                </div>
            {/each}
        </div>
        <div class="bar" style="margin-top:12px">
            {#if confirmAll}
                <span class="err">Delete all {tags.length} tags from everything?</span>
                <button class="btn sm danger" onclick={removeAll}>Delete all</button><button class="btn sm ghost" onclick={() => (confirmAll = false)}>Keep</button>
            {:else}<button class="btn sm danger" onclick={() => (confirmAll = true)}>Delete every tag</button>{/if}
        </div>
    {:else}<p class="hint">No tags yet. Add them from a card's Synopsis tab.</p>{/if}
</div>

<style>
    .taglist { display: flex; flex-direction: column; gap: 6px; }
    .tagcol { width: 30px; height: 24px; border: 0; background: none; padding: 0; }
</style>
