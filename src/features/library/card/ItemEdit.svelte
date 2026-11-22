<!--
    src/features/library/card/ItemEdit.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's Edit details: every field of the entry, in place of the card until you save or cancel

      The fields are the entry form Add uses too (library/entry/EntryFields.svelte). Picking another medium shows its
      own boxes and keeps what you've typed.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { change, toast, undo } from "../../core/core";
    import { focusDialog } from "../../core/modals";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import EntryFields from "../entry/EntryFields.svelte";
    import { boxesOf, readFields } from "../entry/fields";
    import type { Entry } from "../../core/model";

    let { b }: { b: Entry } = $props();

    // the boxes as you've filled them so far: the entry at first
    // svelte-ignore state_referenced_locally
    let boxes = $state(boxesOf(b));

    function close(saved: boolean) {
        store.dialog({ editing: false });
        store.flush();
        focusDialog();
        if (saved) toast("Saved", { label: "Undo", fn: undo });
    }
    function save() {
        const f = readFields(boxes);
        if (!f.title) {
            toast("It needs a title.");
            return;
        }
        change("Edit details", b.id, x => (x ? { ...x, ...f } : undefined));
        close(true);
    }
    $effect(() => focusDialog());
</script>

<DialogHead title="Edit details" />
<EntryFields bind:boxes p="e-" autofocus />
<div class="bar"><button class="btn gold" data-act="save-edit" onclick={save}>Save</button><button class="btn ghost" data-act="cancel-edit" onclick={() => close(false)}>Cancel</button></div>
