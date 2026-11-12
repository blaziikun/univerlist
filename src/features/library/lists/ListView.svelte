<!--
    src/features/library/lists/ListView.svelte
    ─────────────────────────────────────────────────────────────────
      One list open in the Lists tab, or Up next: its name and what it's for (a list's own boxes, saved as you leave
      them), numbered or not, sorting it once, adding to it, deleting it; then its entries (ListRows). The boxes are
      this page's own; the buttons go through li-add, list-del, list-del-yes and list-del-no.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { changeMeta, items, ticked, titleOf } from "../../core/core";
    import type { Item } from "../../core/model";
    import type { ListLook } from "../connect";
    import { setListIds } from "../item-actions";
    import ListRows from "./ListRows.svelte";

    let { l }: { l: ListLook } = $props();

    const del = $derived(!!store.ui.confirmListDel);
    // a box that's saved what's typed, or put back what was there when it's left empty
    function rename(box: HTMLInputElement) {
        const v = box.value.trim() || l.name;
        changeMeta("Rename list", "lists", A => A.map(x => (x.id === l.id ? { ...x, name: v } : x)));
        box.value = v;
    }
    function describe(box: HTMLInputElement) {
        const v = box.value.trim();
        changeMeta("Describe list", "lists", A => A.map(x => (x.id === l.id ? { ...x, desc: v } : x)));
        box.value = v;
    }
    function numbered(box: HTMLInputElement) {
        const v = ticked(box);
        changeMeta("List order", "lists", A => A.map(x => (x.id === l.id ? { ...x, numbered: v } : x)));
    }
    // sorting is done once: the list keeps the order, and the menu goes back to its first line
    const SORT_KEY: Record<string, (b: Partial<Item>) => string | number> = {
        year: b => b.year || 9999,
        title: b => titleOf({ title: "", ...b }).toLowerCase(),
        rating: b => -(b.rating || 0),
        added: b => b.addedAt || "",
    };
    function sort(box: HTMLSelectElement) {
        const f = SORT_KEY[box.value];
        box.value = "";
        if (!f) return;
        setListIds(
            l.id,
            a =>
                a.slice().sort((x, y) => {
                    const p = f(items.get(x) || {}),
                        q = f(items.get(y) || {});
                    return p < q ? -1 : p > q ? 1 : 0;
                }),
            "Sort list"
        );
    }
</script>

{#snippet back()}<div class="eyebrow"><button class="linkbtn" data-act="go-list" data-k="">Lists</button> /</div>{/snippet}
{#if l.queue}<div class="ph"><div class="ttl">{@render back()}<h2 class="ltitle">Up next</h2><p>One queue for everything. Drag to reorder; starting something takes it off.</p></div><span class="spacer"></span><button class="btn" data-act="li-add" data-k="queue">+ Add</button></div>
      {#if l.rows.length}<ListRows {l} />{:else}<div class="empty"><h3>Nothing queued</h3><p>Add what you plan to start next.</p></div>{/if}{:else}<div class="ph"><div class="ttl">{@render back()}<!-- svelte-ignore a11y_missing_content --><h2><input class="h2in" id="list-name" value={l.name} aria-label="List name" onchange={e => rename(e.currentTarget)}></h2><input class="inp ldesc" id="list-desc" value={l.desc} placeholder="What this list is for (optional)" onchange={e => describe(e.currentTarget)}></div><span class="spacer"></span>
      <label class="ctl"><input type="checkbox" id="list-numbered" checked={l.numbered} onchange={e => numbered(e.currentTarget)}> Numbered order</label>
      <select class="sel" id="list-sort" aria-label="Sort once" onchange={e => sort(e.currentTarget)}><option value="">Sort once by…</option><option value="year">Release year</option><option value="title">Title</option><option value="rating">Your score</option><option value="added">Date added</option></select>
      <button class="btn" data-act="li-add" data-k={l.id}>+ Add</button>{#if del}<button class="btn danger" data-act="list-del-yes">Delete list</button><button class="btn ghost" data-act="list-del-no">Keep</button>{:else}<button class="btn danger" data-act="list-del">Delete</button>{/if}</div>
    {#if l.rows.length}<ListRows {l} />{:else}<div class="empty"><h3>Empty list</h3><p>Add entries with + Add, or from any card's "Lists" section, or select several in the library.</p></div>{/if}{/if}
