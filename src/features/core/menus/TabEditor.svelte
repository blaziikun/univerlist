<!--
    src/features/core/menus/TabEditor.svelte
    ─────────────────────────────────────────────────────────────────
      The tab editor (⋯ at the end of a mode's tabs): its tabs in order, ticked; dragging a row or ↑↓ moves one; ★
      picks the tab the mode opens on; the tabs it could add, unticked. The ticks and dragging are this one's own
      (core/tabs.ts tabToggle, tabDropOn), and a tab can be dragged between the editor and the tab bar either way;
      ↑↓ and ★ are "tab-move" and "tab-home" (tabsClick).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { TAB_NAME } from "../shell";
    import { setTabDrag, tabDragged, tabDropOn, tabEditView, tabToggle } from "../tabs";

    let { k: _k }: { k: string } = $props();

    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        return tabEditView();
    });
    // (a row is keyed by its place too: its box is ticked as it's drawn, and a row reused for another tab would keep
    // the tick taken off the one before)
    // where a dragged tab would go: before (b) or after (a) a row
    let mark = $state<{ k: string; side: "a" | "b" } | null>(null);
    function tick(e: Event & { currentTarget: HTMLInputElement }, k: string) {
        const box = e.currentTarget;
        if (!tabToggle(k, box.checked)) box.checked = true; // the last tab stays
    }
    function start(e: DragEvent, k: string) {
        setTabDrag(k);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try {
                e.dataTransfer.setData("text/plain", k);
            } catch (_) {}
        }
    }
    function over(e: DragEvent & { currentTarget: HTMLElement }, k: string) {
        if (!tabDragged()) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        mark = { k, side: e.clientY > r.top + r.height / 2 ? "a" : "b" };
    }
    function drop(e: DragEvent, k: string) {
        const from = tabDragged(),
            after = mark?.k === k && mark.side === "a";
        setTabDrag(null);
        mark = null;
        if (!from) return;
        e.preventDefault();
        tabDropOn(from, k, after);
    }
</script>

<svelte:document ondragend={() => (mark = null)} />

<div class="ctx-h"><b>Tabs in {v.name}</b><small>Drag to reorder · ★ opens here</small></div><div class="tedit">{#each v.on as k, i (k + ":" + i)}<!-- svelte-ignore a11y_no_static_element_interactions: a row is dragged with the mouse; ↑ and ↓ move it from the keyboard --><div class="tedrow{mark?.k === k ? ' tabins-' + mark.side : ''}" draggable="true" data-tedk={k} ondragstart={e => start(e, k)} ondragover={e => over(e, k)} ondragleave={() => { if (mark?.k === k) mark = null; }} ondrop={e => drop(e, k)}><span class="tgrip" aria-hidden="true">⋮⋮</span><label class="ctl"><input type="checkbox" data-tabon={k} checked onchange={e => tick(e, k)}> {TAB_NAME[k]}</label>
    <button class="tst{v.home === k ? ' on' : ''}" data-act="tab-home" data-k={k} title={v.home === k ? "Opens here" : "Open " + v.name + " on this tab"} aria-pressed={v.home === k}>★</button>
    <button class="cb" data-act="tab-move" data-k={k} data-d="-1" disabled={!i} aria-label="Earlier">↑</button><button class="cb" data-act="tab-move" data-k={k} data-d="1" disabled={i >= v.on.length - 1} aria-label="Later">↓</button></div>{/each}
    {#if v.off.length}<p class="ilab">Add</p>{#each v.off as k (k)}<label class="ctl tedoff"><input type="checkbox" data-tabon={k} onchange={e => tick(e, k)}> {TAB_NAME[k]}</label>{/each}{/if}
    <p class="hint">{v.home ? `${v.name} opens on ${TAB_NAME[v.home]}` : `${v.name} opens where you left it`}. {#if v.home}<button class="linkbtn" data-act="tab-home" data-k="">Open where I left it instead</button>{/if}</p></div>
