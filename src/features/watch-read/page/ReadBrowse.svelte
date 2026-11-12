<!--
    src/features/watch-read/page/ReadBrowse.svelte
    ─────────────────────────────────────────────────────────────────
      "On your servers" on the Read page: each of your reading servers to pick, and its catalogue, walked series by
      series (or folder by folder), with the way back up; a chapter opens in the reader with the others beside it to go
      on to. readBrowseView() and the rest in readlibs.ts; its buttons are its own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { readBrowse, readBrowseGo, readBrowseRead, readBrowseUp, readBrowseView } from "../readlibs";

    const v = $derived.by(() => {
        void stageNews.page;
        return readBrowseView();
    });
    type Row = NonNullable<typeof v.rows>[number];
</script>

{#snippet row(e: Row)}{#if e.thumb}<Pic src={e.thumb} loading="lazy" referrerpolicy={undefined} />{:else}<span class="rln">{e.n}</span>{/if}<span class="rlt"><b>{e.title}</b><small>{e.sub}</small></span>{/snippet}
<section class="wrow"><h3>On your servers <span class="chips inl">{#each v.libs as l, i (i + ":" + l.id)}<button class="chip" data-act="rl-browse" data-k={l.id} aria-pressed={l.on} onclick={() => readBrowse(l.id)}>{l.name}</button>{/each}</span></h3>{" "}{#if v.crumbs.length}<div class="crumbs">{#each v.crumbs as c (c.i)}{#if c.i < v.crumbs.length - 1}<button class="linkbtn" data-act="rl-up" data-k={c.i} onclick={() => readBrowseUp(c.i)}>{c.title}</button>{" / "}{:else}<b>{c.title}</b>{/if}{/each}</div>{" "}{/if}{#if v.busy}<p class="think">Reading the server…</p>{:else if v.err}<p class="err">{v.err}</p>{:else if v.rows}{#if v.rows.length}<div class="rlist grid">{#each v.rows as e (e.i)}{#if e.chap}<button class="rlrow" data-act="rl-bread" data-k={e.i} onclick={() => readBrowseRead(e.i)}>{@render row(e)}</button>{:else}<button class="rlrow" data-act="rl-bopen" data-k={e.i} onclick={() => readBrowseGo(e.i)}>{@render row(e)}</button>{/if}{/each}</div>{:else}<p class="hint">Empty.</p>{/if}{:else}<p class="hint">Pick a server to see what's on it.</p>{/if}</section>
