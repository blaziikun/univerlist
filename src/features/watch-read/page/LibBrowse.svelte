<!--
    src/features/watch-read/page/LibBrowse.svelte
    ─────────────────────────────────────────────────────────────────
      "On your servers" on the Watch page: each of your media servers to pick, and everything on the one picked (a
      show or a film), filtered by a box once it's read. Opening one plays it on the Watch page, matched to your library
      by name. libBrowseView() and the rest in medialibs.ts; its buttons and box are its own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { libBrowseFilter, libBrowseOpen, libBrowsePick, libBrowseView } from "../medialibs";

    const v = $derived.by(() => {
        void stageNews.page;
        return libBrowseView();
    });
    // the filter as you type it; it applies when you press Enter or leave the box
    let q = $state("");
    $effect.pre(() => {
        q = v.q;
    });
</script>

<section class="wrow"><h3>On your servers <span class="chips inl">{#each v.libs as l, i (i + ":" + l.id)}<button class="chip" data-act="lib-browse" data-k={l.id} aria-pressed={l.on} onclick={() => libBrowseOpen(l.id)}>{l.name}</button>{/each}</span>{#if v.read}<input class="inp sm" id="lib-bq" placeholder="Filter" bind:value={q} onchange={() => libBrowseFilter(q)} onkeydown={e => e.key === "Enter" && libBrowseFilter(q)}>{/if}</h3>{" "}{#if v.busy}<p class="think">Reading the server…</p>{:else if v.err}<p class="err">{v.err}</p>{:else if v.list}{#if v.list.length}<div class="wgrid">{#each v.list as r (r.i)}<button class="wtile" data-act="lib-open" data-k={r.i} onclick={() => libBrowsePick(r.i)}>{#if r.image}<Pic src={r.image} loading="lazy" referrerpolicy={undefined} />{:else}<span class="nocov">{r.title}</span>{/if}<span class="t">{r.title}</span><span class="hint">{r.sub}</span></button>{/each}</div>{:else}<p class="hint">Nothing matches.</p>{/if}{:else}<p class="hint">Pick a server to see what's on it.</p>{/if}</section>
