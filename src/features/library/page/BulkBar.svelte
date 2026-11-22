<!--
    src/features/library/page/BulkBar.svelte
    ─────────────────────────────────────────────────────────────────
      The bar along the bottom while you select several entries on the library page: how many, select all or none,
      and what to do with them (status, ownership, type, a list, a tag, combine, another mode, Up next, covers,
      scores, private, delete). LibraryPage mounts it on the page's body (it floats over everything), and drops it
      when you leave the library.
      The menus and the tag box are handled here, and go back to their first line once used; the buttons go through
      their data-act names (library/handlers.ts, library/item-handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import {
        change,
        COPY,
        isStatus,
        items,
        KINDS,
        meta,
        nowISO,
        STATUS,
        STATUS_WORDS,
        toast,
        ui,
        undo,
        vault,
    } from "../../core/core";
    import { store } from "../../core/store.svelte";
    import { moveToMode } from "../../core/types";
    import { renderMain } from "../../core/shell";
    import { openModal } from "../../core/modals";
    import { addTagTo, listAdd } from "../item-actions";
    import { listOrder } from "../library";

    const s = $derived.by(() => {
        void store.items;
        const m = store.meta,
            u = store.ui,
            sel = [...u.sel],
            media = new Set(sel.map(id => items.get(id)?.medium).filter(Boolean));
        return {
            on: !!u.selecting && u.page === "profile" && u.tab === "library",
            n: sel.length,
            all: listOrder.length,
            tags: Object.keys(m.tags).sort(),
            kinds: media.size === 1 ? KINDS[items.get(sel[0])?.medium || ""] || [] : [],
            lists: m.lists.filter(l => l.kind !== "tier"),
            modes: m.modes.filter(x => x.id !== "universal"),
            priv: !!vault.key && !u.private,
            confirm: !!u.confirmBulkDelete,
        };
    });

    /** a menu was used: act on the selection, and put the menu back to its first line */
    function pick(e: Event & { currentTarget: HTMLSelectElement }, act: (ids: string[], v: string) => void) {
        const v = e.currentTarget.value,
            ids = [...ui.sel];
        e.currentTarget.value = "";
        if (v && ids.length) act(ids, v);
    }
    const setStatus = (ids: string[], v: string) => {
        if (!isStatus(v)) return;
        change(`Mark ${ids.length} ${STATUS_WORDS.any[v].toLowerCase()}`, ids, b =>
            b
                ? {
                      ...b,
                      status: v,
                      startedAt: v === "active" && !b.startedAt ? nowISO() : b.startedAt,
                      finishedAt: v === "done" && !b.finishedAt ? nowISO() : b.finishedAt,
                      prog: v === "done" && b.total && b.medium !== "game" ? b.total : b.prog,
                  }
                : undefined
        );
        toast("Updated " + ids.length, { label: "Undo", fn: undo });
    };
    const setCopy = (ids: string[], v: string) => {
        change(`Set ownership for ${ids.length}`, ids, b =>
            !b
                ? undefined
                : v === "buy"
                  ? { ...b, toBuy: true }
                  : v === "nobuy"
                    ? { ...b, toBuy: false }
                    : { ...b, copy: v, toBuy: v === "none" ? b.toBuy : false }
        );
        toast("Updated " + ids.length, { label: "Undo", fn: undo });
    };
    const setKind = (ids: string[], v: string) => {
        change(`Set type for ${ids.length}`, ids, b =>
            b
                ? {
                      ...b,
                      kind: v,
                      shelf:
                          b.medium === "book"
                              ? v === "Academic"
                                  ? "academic"
                                  : v === "Non-fiction"
                                    ? "nonfiction"
                                    : "fiction"
                              : b.shelf,
                  }
                : undefined
        );
        toast("Updated " + ids.length, { label: "Undo", fn: undo });
    };
    const toList = (ids: string[], v: string) => {
        if (v === "__new") openModal("listnew", { ids });
        else {
            listAdd(v, ids);
            toast(`Added ${ids.length} to ${meta.lists.find(l => l.id === v)?.name}`);
        }
    };
    const untag = (ids: string[], tg: string) =>
        change(`Remove tag ${tg}`, ids, b =>
            b && (b.tags || []).includes(tg) ? { ...b, tags: b.tags.filter(x => x !== tg) } : undefined
        );
    const toMode = (ids: string[], v: string) => {
        moveToMode(ids, v);
        ui.sel.clear();
        renderMain();
    };
    function tagKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        addTagTo([...ui.sel], e.currentTarget.value);
        e.currentTarget.value = "";
    }
</script>

{#if s.on}
<div id="bulk" class="bulk"><span class="n">{s.n} selected</span>
    <button class="btn sm" data-act="sel-all">Select all {s.all}</button>{#if s.n}<button class="btn sm ghost" data-act="sel-none">Clear</button>
    <select class="sel" id="bulk-status" onchange={e => pick(e, setStatus)}><option value="">Status…</option>{#each STATUS as k}<option value={k}>{STATUS_WORDS.any[k]}</option>{/each}</select>
    <select class="sel" id="bulk-copy" onchange={e => pick(e, setCopy)}><option value="">Ownership…</option>{#each COPY as [k, l]}<option value={k}>{l}</option>{/each}<option value="buy">Plan to buy</option><option value="nobuy">Not buying</option></select>
    <select class="sel" id="bulk-kind" onchange={e => pick(e, setKind)}><option value="">Set type…</option>{#each s.kinds as k}<option>{k}</option>{/each}</select>
    <select class="sel" id="bulk-list" onchange={e => pick(e, toList)}><option value="">Add to list…</option>{#each s.lists as l}<option value={l.id}>{l.name}</option>{/each}<option value="__new">New list…</option></select>
    <input class="inp" id="bulk-tag" list="taglist" placeholder="Add tag…" style="width:120px;padding:5px 8px;font-size:12px" onkeydown={tagKey}><datalist id="taglist">{#each s.tags as t}<option value={t}></option>{/each}</datalist>
    {#if s.tags.length}<select class="sel" id="bulk-untag" onchange={e => pick(e, untag)}><option value="">Remove tag…</option>{#each s.tags as t}<option value={t}>{t}</option>{/each}</select>{/if}
    {#if s.n > 1}<button class="btn sm" data-act="bulk-combine" title="Keep them as one entry (seasons, sequels, volumes); each keeps its score">Combine</button>{/if}
    <select class="sel" id="bulk-mode" onchange={e => pick(e, toMode)}><option value="">Move to mode…</option>{#each s.modes as x}<option value={x.id}>{x.name}</option>{/each}<option value="auto">Where its type puts it</option></select>
    <button class="btn sm" data-act="bulk-queue">Up next</button><button class="btn sm" data-act="bulk-covers">Pick covers</button><button class="btn sm" data-act="bulk-refresh">Refresh scores</button>{#if s.priv}<button class="btn sm" data-act="bulk-private">Move to private</button>{/if}
    {#if s.confirm}<span class="err">Delete {s.n}?</span><button class="btn sm danger" data-act="bulk-delete-yes">Delete</button><button class="btn sm ghost" data-act="bulk-delete-no">Keep</button>{:else}<button class="btn sm danger" data-act="bulk-delete">Delete</button>{/if}{/if}</div>
{/if}
