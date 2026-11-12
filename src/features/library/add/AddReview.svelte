<!--
    src/features/library/add/AddReview.svelte
    ─────────────────────────────────────────────────────────────────
      Add's second step: the picture, a note if it's already in your library, the entry form (EntryFields, as Edit
      details has it), your score and what to do with it (plan to buy, Up next, favourite, private), then Add.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { store } from "../../core/store.svelte";
    import { $ as one, MEDIA, scoreMax, vault } from "../../core/core";
    import { focusDialog } from "../../core/modals";
    import { setPendingCover } from "../../core/events";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Cover from "../tiles/Cover.svelte";
    import EntryFields from "../entry/EntryFields.svelte";
    import { boxesOf, readFields } from "../entry/fields";
    import { addNew, alreadyNote, SRC_NAME } from "./add";
    import type { ItemDraft, Modal } from "../../core/model";

    let { m }: { m: Modal } = $props();

    // svelte-ignore state_referenced_locally
    const start: ItemDraft = m.draft || { title: "" };
    let boxes = $state(boxesOf(start)),
        rating = $state(""),
        toBuy = $state(false),
        queue = $state(false),
        fav = $state(false),
        // svelte-ignore state_referenced_locally
        priv = $state(!!m.private);
    // the entry as the heading and the notes above the form see it: taken again when the medium changes
    const d = $derived.by((): ItemDraft => {
        void boxes.medium;
        return untrack(() => ({ ...start, ...readFields(boxes) }));
    });
    const src = $derived(typeof d.src === "string" ? d.src : "");
    const note = $derived(alreadyNote(d, m.medium || "book"));

    function save() {
        const x: ItemDraft = { ...start, ...readFields(boxes) };
        if (!x.title) {
            store.dialog({ draft: x, error: "It needs a title." });
            return;
        }
        addNew(x, m.coverData || "", { rating, toBuy, queue, fav, priv: priv && !!vault.key });
    }
    function back() {
        store.dialog({ step: "search", error: "" });
        store.flush();
        focusDialog();
    }
    function picture() {
        setPendingCover("add");
        one("#file-cover")?.click();
    }
</script>

<DialogHead title={"Add " + MEDIA[d.medium || m.medium || "book"].one} />
{#if m.busy}<p class="think">Filling in the details…</p>{/if}
<div class="bar"><div style="width:84px"><Cover b={{ ...d, cover: m.cover || d.cover || "", coverData: m.coverData || "" }} /></div>
    <div class="bar"><button class="btn" data-act="add-cover" onclick={picture}>{d.cover || m.coverData ? "Use my own picture instead" : "Add a picture"}</button>{#if src}<span class="hint">From {SRC_NAME[src] || src}</span>{/if}</div></div>
{#if note}<p class="err">{note}</p>{/if}
<EntryFields bind:boxes p="a-" />
<div class="bar"><label class="ctl">Your score <input class="inp" id="a-rating" inputmode="decimal" style="width:60px" placeholder="/{scoreMax()}" bind:value={rating}></label><label class="ctl"><input type="checkbox" id="a-buy" bind:checked={toBuy}> Plan to buy</label><label class="ctl"><input type="checkbox" id="a-queue" bind:checked={queue}> Add to Up next</label><label class="ctl"><input type="checkbox" id="a-fav" bind:checked={fav}> Favourite</label>{#if vault.key}<label class="ctl"><input type="checkbox" id="a-private" bind:checked={priv}> 🔒 Private</label>{/if}</div>
<div class="bar"><button class="btn gold" data-act="add-save" onclick={save}>Add</button><button class="btn ghost" data-act="add-back" onclick={back}>Back</button></div>
{#if m.error}<p class="err">{m.error}</p>{/if}
