<!--
    src/features/watch-read/page/StageContinue.svelte
    ─────────────────────────────────────────────────────────────────
      "Continue watching" or "Continue reading": what you're in the middle of, newest first, as a list with how far
      you are or as covers (continueView() in stage.ts). It folds, and stays as you left it (stageContSet). Hidden, not
      gone, while you type a search, as the HTML page did. A cover arriving in the background shows at once (each one
      reads its entry through the store); a press goes through watch-item or read-open.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Cover from "../../library/tiles/Cover.svelte";
    import { store } from "../../core/store.svelte";
    import { stageContSet, type StageCont } from "../stage";
    import type { Entry } from "../../core/model";

    let { c, hidden }: { c: StageCont; hidden: boolean } = $props();

    // the entry as it is now, so a picture that arrives shows on its cover
    const live = (b: Entry): Entry => {
        void store.itemsByFrame;
        const it = store.itemsByFrame.get(b.id);
        return it ? { ...it, id: b.id } : b;
    };
</script>

<details class="stcont" open={c.open} data-stagecont="1" {hidden} ontoggle={e => stageContSet(e.currentTarget.open)}><summary><span>Continue {c.word}</span><span class="cn">{c.rows.length}</span></summary>{" "}{#if c.covers}<div class="wstrip">{#each c.rows as r (r.b.id)}<button class="wtile" data-act={c.act} data-id={r.b.id}><Cover b={live(r.b)} /><span class="t">{r.title}</span><span class="hint">{r.sub}</span></button>{/each}</div>{:else}<div class="slist">{#each c.rows as r (r.b.id)}<button class="sli" data-act={c.act} data-id={r.b.id}><span class="st">{r.title}</span><span class="sm">{r.sub}</span><span class="sbar"><i style="width:{r.pct}%"></i></span></button>{/each}</div>{/if}</details>
