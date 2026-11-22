<!--
    src/features/library/lists/ListRows.svelte
    ─────────────────────────────────────────────────────────────────
      A list's entries, or Up next's, in order: each one's cover, what it is, its note (a list's own boxes, saved as
      you leave them), and buttons to move it, start it (Up next) or take it off. Dragging one onto another puts it
      there (reorder.svelte.ts). The buttons go through li-move, li-remove and start.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { changeMeta } from "../../core/core";
    import type { ListLook } from "../connect";
    import { listDrop } from "../item-actions";
    import { Reorder } from "./reorder.svelte";
    import Cover from "../tiles/Cover.svelte";
    import MediumDot from "../tiles/MediumDot.svelte";

    let { l }: { l: ListLook } = $props();

    const drag = new Reorder(
        () => `.qi[data-lid="${CSS.escape(l.id)}"][data-qid]`,
        el => el.dataset.qid,
        (from, to) => {
            if (to !== from) listDrop(l.id, from, to);
        }
    );
    function note(id: string, box: HTMLInputElement) {
        const v = box.value.trim();
        changeMeta("List note", "lists", A =>
            A.map(x => (x.id === l.id ? { ...x, notes: { ...(x.notes || {}), [id]: v } } : x))
        );
        box.value = v;
    }
</script>

<svelte:document ondragstart={drag.start} ondragover={drag.dragover} ondrop={drag.dropped} ondragend={drag.end} />

<div class="queue">{#each l.rows as r, i (i + ":" + r.b.id)}<div class="qi{drag.mark(r.b.id)}" draggable="true" data-lid={l.id} data-qid={r.b.id}><span class="h" aria-hidden="true">⋮⋮</span>{#if l.numbered}<span class="num rk">{i + 1}</span>{/if}<Cover b={r.b} />
    <div style="min-width:0"><button class="t" data-act="open" data-id={r.b.id}>{r.title}</button><div class="hint"><MediumDot m={r.b.medium} />{r.line}</div>
      {#if !l.queue}<input class="inp lnote" data-lnote={l.id} data-id={r.b.id} value={l.notes[r.b.id] || ""} placeholder="Note for this entry" onchange={e => note(r.b.id, e.currentTarget)}>{/if}</div>
    <div class="bar"><button class="btn sm" data-act="li-move" data-lid={l.id} data-id={r.b.id} data-k="-1" disabled={i === 0} aria-label="Move up">↑</button><button class="btn sm" data-act="li-move" data-lid={l.id} data-id={r.b.id} data-k="1" disabled={i === l.rows.length - 1} aria-label="Move down">↓</button>
      {#if l.queue}<button class="btn sm gold" data-act="start" data-id={r.b.id}>Start</button>{/if}<button class="btn sm ghost" data-act="li-remove" data-lid={l.id} data-id={r.b.id} aria-label="Remove">✕</button></div></div>{/each}</div>
