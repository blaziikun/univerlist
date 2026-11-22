<!--
    src/features/library/add/AddDialog.svelte
    ─────────────────────────────────────────────────────────────────
      Add anything: search a catalogue for it (AddSearch), then check the details and add it (AddReview); or skip the
      search and enter it yourself.

      Opened by openAdd() (core/navigation.ts). core/modals.ts draws the dialog's frame and hands this its box
      (core/dialogs.ts). Where it is (the step, the medium, the results, what's loading) is the dialog's state on
      ui.modal; what you type is each step's own. The work is in add.ts beside this.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import AddReview from "./AddReview.svelte";
    import AddSearch from "./AddSearch.svelte";

    // the dialog's state, copied each time it changes (the older code changes it in place)
    const m = $derived.by(() => {
        const m = store.ui.modal;
        return m && m.kind === "add" ? { ...m, results: m.results && [...m.results] } : null;
    });
</script>

{#if m}
    {#if m.step === "review"}<AddReview {m} />{:else}<AddSearch {m} />{/if}
{/if}
