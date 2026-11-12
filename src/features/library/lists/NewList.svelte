<!--
    src/features/library/lists/NewList.svelte
    ─────────────────────────────────────────────────────────────────
      New list: a list (numbered or not) or a tier list, of things in your library, characters, or cast and people;
      its name, what it's for, and the mode it shows in (or ranks from). Starts with what you'd selected, if anything.
      Opened by "list-new" and "tier-new" (library/list-handlers.ts) and from the command list. The kind of list and
      what's in it are the dialog's state (ui.modal.type, .what); the boxes are this one's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { caretAtStart } from "../../core/dialog/caret";
    import { store } from "../../core/store.svelte";
    import { curMode, plural, toast, ui } from "../../core/core";
    import { closeModal, focusDialog } from "../../core/modals";
    import { goList } from "../../core/navigation";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { createList } from "../item-actions";
    import { newTierList, TIER_WHAT } from "../tiers";

    const m = $derived.by(() => {
        const m = store.ui.modal;
        return m && m.kind === "listnew" ? { ...m } : null;
    });
    // svelte-ignore state_referenced_locally
    let name = $state(store.ui.modal?.name || ""),
        desc = $state(""),
        mode = $state(curMode().id),
        onlyDone = $state(true),
        numbered = $state(true);

    // the modes it can show in (or rank from), and the one chosen: yours unless it isn't offered, then the first
    const modes = $derived.by((): [string, string][] => {
        const tier = m?.type === "tier";
        return [
            ...(tier ? [] : [["", "Every mode"] satisfies [string, string]]),
            ...store.meta.modes.filter(x => tier || x.id !== "universal").map((x): [string, string] => [x.id, x.name + (tier ? "" : " only")]),
        ];
    });
    const modeShown = $derived(modes.some(o => o[0] === mode) ? mode : modes[0]?.[0] || "");
    function set(change: { type?: string; what?: string }) {
        store.dialog(change);
        store.flush();
        focusDialog();
    }
    function create() {
        if (!m) return;
        const n = name.trim();
        if (!n) {
            toast("Give the list a name.");
            return;
        }
        const what = m.what || "items",
            things = what === "items",
            tier = m.type === "tier";
        const lid =
            tier || !things
                ? newTierList({ name: n, layout: tier ? "tiers" : "rank", what, mode: things || tier ? modeShown : "", onlyDone: things && tier ? onlyDone : false, ids: things ? m.ids : [] })
                : createList({ name: n, desc: desc.trim(), mode: modeShown, numbered, ids: m.ids });
        closeModal();
        ui.selecting = false;
        ui.sel.clear();
        goList(lid);
    }
</script>

{#if m}
    {@const tier = m.type === "tier"}
    {@const what = m.what || "items"}
    {@const things = what === "items"}
    <DialogHead title={tier ? "New tier list" : "New list"} />
    <div class="seg" style="margin-bottom:12px">{#each [["list", "List"], ["tier", "Tier list"]] as [k, l]}<button data-act="ln-type" data-k={k} aria-pressed={(m.type || "list") === k} onclick={() => set({ type: k })}>{l}</button>{/each}</div>
    <!-- svelte-ignore a11y_autofocus: the name is where you start -->
    <div class="fields"><div class="field full"><label for="ln-name">Name</label><input id="ln-name" autofocus placeholder={tier ? "e.g. Every anime I've finished, 2026 so far" : things ? "e.g. Cosmere reading order, Comfort rewatches" : what === "chars" ? "e.g. Best villains" : "e.g. Favourite voice actors"} bind:value={name} use:caretAtStart onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); create(); } }}></div>
        <!-- svelte-ignore a11y_label_has_associated_control: it names the buttons beside it -->
        <div class="field full"><label>What's in it</label><div class="seg">{#each Object.entries(TIER_WHAT) as [k, l]}<button data-act="ln-what" data-k={k} aria-pressed={what === k} onclick={() => set({ what: k })}>{l}</button>{/each}</div></div>
        {#if !tier && things}<div class="field full"><label for="ln-desc">What it's for (optional)</label><input id="ln-desc" bind:value={desc}></div>{/if}
        {#if things || tier}<div class="field"><label for="ln-mode">{tier && things ? "Rank things from" : "Show it in"}</label><select id="ln-mode" onchange={e => (mode = e.currentTarget.value)}>{#each modes as [v, l]}<option value={v} selected={v === modeShown}>{l}</option>{/each}</select></div>{/if}</div>
    {#if tier && things}<div class="bar"><label class="ctl"><input type="checkbox" id="ln-done" bind:checked={onlyDone}> Only things I've finished or scored</label></div>{:else if !tier && things}<div class="bar"><label class="ctl"><input type="checkbox" id="ln-num" bind:checked={numbered}> Numbered order (a reading or watch order)</label></div>{:else}<p class="hint">Your {what === "chars" ? "favourite characters" : "saved people"} start in it; pull in the {what === "chars" ? "characters" : "cast"} of any title from your library once it's made.</p>{/if}
    <div class="bar"><button class="btn gold" data-act="ln-create" onclick={create}>Create</button></div>{#if m.ids && m.ids.length}<p class="hint">Starts with {plural(m.ids.length, "entry", "entries")}.</p>{/if}
{/if}
