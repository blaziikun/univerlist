<!--
    src/features/library/page/SaveView.svelte
    ─────────────────────────────────────────────────────────────────
      Save this view: the library as it's filtered, sorted and shown now, under a name, in the sidebar. Opened by
      "save-view"; Save and Enter use the name, so they're this one's own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { changeMeta, toast, ui } from "../../core/core";
    import { closeModal } from "../../core/modals";
    import { toggleSide } from "../../core/navigation";
    import DialogHead from "../../core/dialog/DialogHead.svelte";

    let name = $state("");
    function save() {
        const n = name.trim();
        if (!n) return;
        const { mode, shelfKey, tag, kind, genre, status, copy, sort, group, view, q } = ui;
        const vid = "v" + Date.now().toString(36);
        changeMeta("Save view", "views", vs => [
            ...vs,
            { id: vid, name: n, state: { mode, shelfKey, tag, kind, genre, status, copy, sort, group, view, q } },
        ]);
        ui.viewId = vid;
        closeModal();
        toggleSide(true);
        toast("Saved to the sidebar");
    }
</script>

<DialogHead title="Save this view" />
<p class="hint">Saves the current medium, filters, sort and view to the sidebar.</p>
<!-- svelte-ignore a11y_autofocus: the name is all there is to type -->
<div class="bar"><input class="inp" id="sv-name" autofocus placeholder="e.g. Unfinished anime, Short books I own" style="max-width:340px" bind:value={name} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); save(); } }}><button class="btn gold" data-act="sv-save" onclick={save}>Save</button></div>
