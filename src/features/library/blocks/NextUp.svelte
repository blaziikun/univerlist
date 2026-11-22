<!--
    src/features/library/blocks/NextUp.svelte
    ─────────────────────────────────────────────────────────────────
      The Next up block: your queue in your order of priority (drag to change it: lists/reorder.svelte.ts), then
      suggestions for what to start next (nextUp in blocks.ts), each one press from joining it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { MEDIA, meta, titleOf, verbOf } from "../../core/core";
    import { progText } from "../../core/views";
    import { nextUp, queueOf, type OvBlock } from "../blocks";
    import Cover from "../tiles/Cover.svelte";
    import { listDrop } from "../item-actions";
    import { Reorder } from "../lists/reorder.svelte";

    let { c }: { c: OvBlock } = $props();

    const v = $derived.by(() => {
        const Q = queueOf().filter(b => b.status !== "done");
        return {
            Q,
            sug:
                Q.length < c.n
                    ? nextUp(c.M, c.n * 2)
                          .filter(x => !meta.queue.includes(x.b.id))
                          .slice(0, c.n - Q.length)
                    : [],
        };
    });
    // dragging one of the queue onto another puts it there
    const drag = new Reorder(
        () => '.qi[data-lid="queue"][data-qid]',
        el => el.dataset.qid,
        (from, to) => {
            if (to !== from) listDrop("queue", from, to);
        }
    );
</script>

<svelte:document ondragstart={drag.start} ondragover={drag.dragover} ondrop={drag.dropped} ondragend={drag.end} />

{#if v.Q.length}<div class="queue nq">{#each v.Q.slice(0, c.n) as b, i (i + b.id)}<div class="qi nx{drag.mark(b.id)}" draggable="true" data-lid="queue" data-qid={b.id}><span class="rk">{i + 1}</span><button class="nc" data-act="open" data-id={b.id} aria-label={titleOf(b)}><Cover {b} /></button><span><b>{titleOf(b)}</b><small>{b.status === "active" ? progText(b) : b.kind || MEDIA[b.medium].one}</small></span><button class="btn sm ghost" data-act="start" data-id={b.id} title={verbOf(b.medium)[0]}>▶</button></div>{/each}</div>{:else}<p class="hint">Nothing queued. Right-click anything and choose “+ Up next”: the order here is your priority.</p>{/if}
{#if v.sug.length}<p class="label sub">Suggested</p><div class="nexts">{#each v.sug as { b, why }, i (i + b.id)}<div class="nx"><Cover {b} /><span><b>{titleOf(b)}</b><small>{why}</small></span><button class="btn sm ghost" data-act="q-add" data-id={b.id} title="Add to Up next">+</button></div>{/each}</div>{/if}
