<!--
    src/features/core/shell/TabsBar.svelte
    ─────────────────────────────────────────────────────────────────
      A mode's tabs, under its profile header, and the button that opens the tab editor (core/menus/TabEditor.svelte).
      A tab dragged along the bar goes before or after another (tabDropOn in core/tabs.ts); one dragged from the
      editor's rows can be dropped here too, and one from here there, as the tab being dragged is shared (tabDragged).
      The marks where it would go are this bar's own; the buttons go through tab and tab-edit.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { closestTo } from "../core";
    import { setTabDrag, tabDragged, tabDropOn } from "../tabs";

    let { tabs, title }: { tabs: { k: string; name: string; on: boolean }[]; title: string } = $props();

    // where a dragged tab would go: before or after this one
    let mark = $state<{ k: string; after: boolean } | null>(null);
    const BAR = '.ptabs [data-act="tab"]';
    function start(e: DragEvent) {
        const el = closestTo(e, BAR);
        if (!el) return;
        const k = el.dataset.k || null;
        setTabDrag(k);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try {
                e.dataTransfer.setData("text/plain", k || "");
            } catch (_) {}
        }
    }
    function over(e: DragEvent) {
        if (!tabDragged()) return;
        const el = closestTo(e, BAR);
        if (!el) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        mark = { k: el.dataset.k || "", after: e.clientX > r.left + r.width / 2 };
    }
    function drop(e: DragEvent) {
        const from = tabDragged();
        if (!from) return;
        const el = closestTo(e, BAR),
            after = !!mark && mark.after && mark.k === el?.dataset.k;
        setTabDrag(null);
        mark = null;
        if (!el) return;
        e.preventDefault();
        tabDropOn(from, el.dataset.k || "", after);
    }
    function end() {
        setTabDrag(null);
        mark = null;
    }
    const cls = (k: string) => (mark && mark.k === k ? (mark.after ? "tabins-a" : "tabins-b") : undefined);
</script>

<svelte:document ondragstart={start} ondragover={over} ondrop={drop} ondragend={end} />

<nav class="tabs ptabs" aria-label="Tabs"><div class="ptabs-in"><div class="ptabs-list" role="tablist">{#each tabs as t (t.k)}<button role="tab" aria-selected={t.on} data-act="tab" data-k={t.k} draggable="true" class={cls(t.k)}>{t.name}</button>{/each}</div><button class="tabedit" data-act="tab-edit" {title} aria-label="Edit tabs">⋯</button></div></nav>
