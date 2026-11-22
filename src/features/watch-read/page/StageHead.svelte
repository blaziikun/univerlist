<!--
    src/features/watch-read/page/StageHead.svelte
    ─────────────────────────────────────────────────────────────────
      The search row at the top of Watch and Read: the long box that searches as you type (↑ ↓ through the results,
      Enter to open one, Escape to empty it), the type searched, covers or a list, your servers and Upload files. What it
      shows is stageHeadView() in stage.ts; typing and the keys are stageTyped() and stageKey() there. The buttons go
      through their data-act (stage-clear, watch-servers or rl-servers, watch-files or read-files).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../../core/Icon.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { stageCat, stageCoversSet, stageHeadView, stageKey, type StageKind, stageTyped } from "../stage";

    let { kind }: { kind: StageKind } = $props();

    const v = $derived.by(() => {
        void stageNews.page;
        void stageNews.res;
        return stageHeadView(kind);
    });
    // what's in the box: yours as you type, and what the page says when it changes from outside (Escape, ✕, a search)
    let q = $state("");
    $effect.pre(() => {
        q = v.q;
    });
    function typed(e: Event & { currentTarget: HTMLInputElement }) {
        q = e.currentTarget.value;
        stageTyped(kind, q);
    }
    function key(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
        if (!stageKey(kind, e, e.currentTarget)) return;
        e.preventDefault();
        e.stopPropagation();
    }
</script>

<div class="shead"><div class="sq"><Icon name="search" /><input id={v.id} placeholder={v.placeholder} value={q} autocomplete="off" spellcheck="false" aria-label="Search" oninput={typed} onkeydown={key}>{#if q}<button class="sqx" data-act="stage-clear" aria-label="Clear"><Icon name="x" /></button>{/if}</div>{" "}<div class="sgrow"><label class="lbsel"><span class="lbk">Type</span><select class="sel" data-stagecat={kind} aria-label="Type" value={v.cat} onchange={e => stageCat(kind, e.currentTarget.value)}>{#each v.cats as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label><span class="spacer"></span>{" "}<label class="ctl stog"><input type="checkbox" data-stagecovers="1" checked={v.covers} onchange={e => stageCoversSet(e.currentTarget.checked)}> Covers</label>{" "}<button class="btn sm ghost" data-act={v.srvAct} aria-pressed={v.srvOn}>{v.srvLabel}</button>{" "}<button class="btn sm ghost" data-act={v.filesAct}>Upload files</button></div></div>
