<!--
    src/features/watch-read/page/ReadServerList.svelte
    ─────────────────────────────────────────────────────────────────
      "On your servers" for the book or series open on the Read page: what your reading servers (and extensions that
      offer chapters) have, with Start or Continue on the next one; picking the right series by hand; or, with no
      servers yet, where to add one. readServerListView() and the rest in readlibs.ts; its buttons and box are its own
      (rl-servers goes through handlers.ts, as the search row's does).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { readFound, readPick, readPickClose, readPickOpen, readPickView, readServerListView } from "../readlibs";
    import type { Item } from "../../core/model";

    let { it }: { it: Item } = $props();

    const v = $derived.by(() => {
        void stageNews.page;
        return readServerListView(it);
    });
    const pick = $derived.by(() => {
        void stageNews.page;
        return readPickView();
    });
    // the name to search the servers for, as you type it
    let q = $state("");
    $effect.pre(() => {
        q = pick?.q ?? "";
    });
    function key(e: KeyboardEvent) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        readPickOpen(q);
    }
</script>

{#if !v}<p class="hint">Add your Komga, Kavita or a shared folder under <button class="linkbtn" data-act="rl-servers">Your servers</button> and chapters show up here by themselves.</p>{:else}<section class="wrow"><h3>On your servers <span class="hint">{v.note}</span>{#if v.pickLabel}{" "}<button class="linkbtn" data-act="rl-pick-open" onclick={() => readPickOpen()}>{v.pickLabel}</button>{/if}</h3>{" "}{#if pick}<div class="panel libpick"><div class="bar"><input class="inp" id="rl-q" bind:value={q} style="flex:1" onkeydown={key}><button class="btn sm" data-act="rl-pick-go" onclick={() => readPickOpen(q)}>Search</button><button class="linkbtn" data-act="rl-pick-close" onclick={readPickClose}>Close</button></div>{" "}{#if pick.busy}<p class="think">Looking…</p>{:else if pick.res.length}<div class="rlist">{#each pick.res as r (r.i)}<button class="rlrow" data-act="rl-pick" data-k={r.i} onclick={() => readPick(r.i)}>{#if r.thumb}<Pic src={r.thumb} referrerpolicy={undefined} />{:else}<span class="rln">≡</span>{/if}<span class="rlt"><b>{r.title}</b><small>{r.lib}</small></span></button>{/each}</div>{:else}<p class="hint">Nothing with that name.</p>{/if}</div>{" "}{/if}{#if v.rows.length}<div class="bar" style="margin-bottom:8px">{#if v.next}<button class="btn gold" data-act="rl-read" data-k={v.next.i} onclick={() => v.next && readFound(v.next.i)}>{v.next.label}</button>{/if}</div>{" "}<div class="rlist">{#each v.rows as c (c.i)}<button class="rlrow{c.seen ? ' seen' : ''}" data-act="rl-read" data-k={c.i} onclick={() => readFound(c.i)}>{#if c.thumb}<Pic src={c.thumb} loading="lazy" referrerpolicy={undefined} />{:else}<span class="rln">{c.n}</span>{/if}<span class="rlt"><b>{c.name}</b><small>{c.meta}</small></span>{#if c.seen}<span class="hint">read</span>{/if}</button>{/each}</div>{/if}</section>{/if}
