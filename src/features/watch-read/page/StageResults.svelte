<!--
    src/features/watch-read/page/StageResults.svelte
    ─────────────────────────────────────────────────────────────────
      What Watch's or Read's search found (inside #sres): a list you arrow through from the box, or covers, with the
      one ↑ ↓ marked. It draws when a search answers or the mark moves (stageRefresh in stage.ts), not the whole page,
      as the HTML did. stageResView() there works out what it shows; a press opens one (stage-pick, stageClick).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { type StageKind, stageResView } from "../stage";

    let { kind }: { kind: StageKind } = $props();

    const v = $derived.by(() => {
        void stageNews.page;
        void stageNews.res;
        return stageResView(kind);
    });
</script>

{#if v.shown === "busy"}<p class="think sres-busy">Searching…</p>{:else if v.shown === "none"}<p class="hint">Nothing found for “{v.q}”.</p>{:else if v.shown === "list" && v.covers}<div class="wgrid">{#each v.rows as r (r.i)}<button class="wtile{r.on ? ' on' : ''}" data-act="stage-pick" data-k={r.i}>{#if r.img}<Pic src={r.img} loading="lazy" />{:else}<span class="nocov">{r.title}</span>{/if}<span class="t">{r.title}</span><span class="hint">{r.sub}</span></button>{/each}</div>{:else if v.shown === "list"}<div class="slist" role="listbox">{#each v.rows as r (r.i)}<!-- svelte-ignore a11y_role_has_required_aria_props --><button class="sli{r.on ? ' on' : ''}" role="option" data-act="stage-pick" data-k={r.i}><span class="st">{r.title}</span><span class="sm">{r.meta}</span>{#if r.pill}<span class={r.pill.cls}>{r.pill.word}</span>{/if}</button>{/each}</div>{/if}
