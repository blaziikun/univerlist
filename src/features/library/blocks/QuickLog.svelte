<!--
    src/features/library/blocks/QuickLog.svelte
    ─────────────────────────────────────────────────────────────────
      The Quick log block: what you're in the middle of, each with its usual steps and ✓, and a box to log a finish of
      anything else (its Log is this block's own: it takes what's picked here).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { cleanTitle, MEDIA, titleOf, toast } from "../../core/core";
    import { idFromOption } from "../../core/navigation";
    import { finishItem } from "../item-actions";
    import { progText } from "../../core/views";
    import { activeOf, type OvBlock } from "../blocks";

    let { c }: { c: OvBlock } = $props();

    const A = $derived(activeOf(c.M).slice(0, 5)),
        opts = $derived(c.M.filter(b => b.status !== "done").slice(0, 400).map(b => `${titleOf(b)} · ${MEDIA[b.medium].one}`));
    let q = $state("");

    function log() {
        const iid = idFromOption(q);
        if (!iid) return toast("Pick something from the list.");
        q = "";
        finishItem(iid);
    }
</script>

{#each A as b, i (i + b.id)}<div class="qlrow"><span class="t">{cleanTitle(titleOf(b))}</span><span class="hint">{progText(b)}</span>{#each MEDIA[b.medium].steps as n}<button class="btn sm" data-act="log-add" data-id={b.id} data-k={n}>+{n}</button>{/each}<button class="btn sm ghost" data-act="finish" data-id={b.id} title="Finished">✓</button></div>{/each}
<div class="bar" style="margin-top:8px"><input class="inp" id="ql-q" list="ql-opts" placeholder="Finished something else today…" style="flex:1" bind:value={q}><datalist id="ql-opts">{#each opts as o, i (i)}<option value={o}></option>{/each}</datalist><button class="btn sm gold" data-act="ql-log" onclick={log}>Log</button></div>
