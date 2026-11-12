<!--
    src/features/library/lists/PickItems.svelte
    ─────────────────────────────────────────────────────────────────
      Pick from your library. For a list ("li-add"): search this mode or everything, of one medium or any, tick as many
      as you like and add them together. For a favourite ("Add a favourite"): search, and press one.
      What it offers is worked out in listadd.ts (pickPool); where you are (this mode or everything, the medium, what's
      ticked, what's been added) is the dialog's state on ui.modal, and what you type is this one's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import MediumDot from "../tiles/MediumDot.svelte";
    import { caretAtStart } from "../../core/dialog/caret";
    import { store } from "../../core/store.svelte";
    import { curMode, fmtScore, MEDIA, plural, scaleOf, titleOf, toast, undo } from "../../core/core";
    import { closeModal } from "../../core/modals";
    
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Cover from "../tiles/Cover.svelte";
    import { isIdSet, pickPool } from "../listadd";
    import { listAdd, queueAdd, toggleFav } from "../item-actions";
    import type { Entry } from "../../core/model";

    const m = $derived.by(() => {
        void store.items;
        void store.meta;
        const m = store.ui.modal;
        return m && m.kind === "pickitem" ? { ...m } : null;
    });
    // svelte-ignore state_referenced_locally
    let q = $state(store.ui.modal?.q || "");
    const many = $derived(m?.purpose === "list");
    const added = $derived(m?.added instanceof Set ? m.added : new Set<string>());
    const sel = $derived(isIdSet(m?.sel) ? m.sel : new Set<string>());
    const found = $derived(m ? pickPool(m, q) : null);

    function pick(b: Entry) {
        if (!m) return;
        if (m.purpose === "list") {
            const s = new Set(sel);
            if (s.has(b.id)) s.delete(b.id);
            else s.add(b.id);
            store.dialog({ sel: s });
        } else if (m.purpose === "fav") {
            closeModal();
            toggleFav(b.id);
        }
    }
    function add() {
        const ids = [...sel];
        if (!m || !ids.length) return;
        if (m.lid === "queue") for (const x of ids) queueAdd(x);
        else listAdd(m.lid || "", ids);
        store.dialog({ added: new Set([...added, ...ids]), sel: new Set<string>() });
        toast(`Added ${plural(ids.length, "entry", "entries")}`, { label: "Undo", fn: undo });
    }
    function enter(e: KeyboardEvent) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const first = found?.list.find(b => !added.has(b.id));
        if (first) pick(first);
    }
</script>

{#if m && found}
    {@const shown = found.list.filter(b => !added.has(b.id))}
    <DialogHead title={m.title || "Choose"} />
    <!-- svelte-ignore a11y_autofocus: the search box is where you start -->
    <div class="bar"><input class="inp" id="pi-q" autofocus placeholder="Search your library" bind:value={q} use:caretAtStart style="flex:1;min-width:180px" onkeydown={enter}>
        {#if many}<div class="seg">{#each [["mode", curMode().name], ["all", "Everything"]] as [k, l]}<button data-act="pi-scope" data-k={k} aria-pressed={(m.scope || "mode") === k} onclick={() => store.dialog({ scope: k })}>{l}</button>{/each}</div><select class="sel" id="pi-med" onchange={e => store.dialog({ med: e.currentTarget.value })}>{#each [["", "Any type"], ...found.media.map(k => [k, MEDIA[k].name || MEDIA[k].one])] as [k, l]}<option value={k} selected={(m.med || "") === k}>{l}</option>{/each}</select>{/if}</div>
    <div class={many ? "pigrid" : "mini"} style="margin-top:8px">{#each found.list as b (b.id)}{@const was = added.has(b.id)}{#if many}<button class="pirow{sel.has(b.id) ? ' on' : ''}" data-act="pi-pick" data-id={b.id} disabled={was} aria-pressed={sel.has(b.id)} onclick={() => pick(b)}><span class="pick">{was ? "✓" : sel.has(b.id) ? "■" : ""}</span><Cover {b} /><span class="t">{titleOf(b)}</span><span class="hint">{was ? "In the list" : [b.kind || MEDIA[b.medium].one, b.year, b.rating ? fmtScore(b.rating, scaleOf(b)) : ""].filter(Boolean).join(" · ")}</span></button>{:else}<button data-act="pi-pick" data-id={b.id} disabled={was} onclick={() => pick(b)}><span class="t"><MediumDot m={b.medium} />{titleOf(b)}</span><span class="hint">{was ? "✓ Added" : (b.kind || MEDIA[b.medium].one) + (b.year ? " · " + b.year : "") + (b.rating ? " · " + b.rating : "") + (b.fav ? " · ♥" : "")}</span></button>{/if}{:else}<p class="hint">Nothing matches.</p>{/each}</div>{#if found.total > found.list.length}<p class="hint">Showing {found.list.length} of {found.total}; search to narrow it.</p>{/if}
    {#if many}<div class="bar pibar"><button class="linkbtn" data-act="pi-all" onclick={() => store.dialog({ sel: new Set([...sel, ...shown.map(b => b.id)]) })}>Select all {shown.length} shown</button>{#if sel.size}<button class="linkbtn" data-act="pi-none" onclick={() => store.dialog({ sel: new Set<string>() })}>Clear</button>{/if}<span class="spacer"></span><button class="btn gold" data-act="pi-add" disabled={!sel.size} onclick={add}>Add {sel.size || ""}</button><button class="btn ghost" data-act="close">Done</button></div>{/if}
{/if}
