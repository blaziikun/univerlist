<!--
    src/features/watch-read/page/LibPick.svelte
    ─────────────────────────────────────────────────────────────────
      "Which one is it?" on a show's page, when its name didn't match anything on your servers (or matched the wrong
      thing): a box to search them by another name, and what they have, to pick by hand. The one picked is kept for
      this show (meta.watchMap). libPickView() and the rest in medialibs.ts; its buttons and box are its own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Pic from "../../core/dialog/Pic.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { libPick, libPickClose, libPickOpen, libPickView } from "../medialibs";

    const v = $derived.by(() => {
        void stageNews.page;
        return libPickView();
    });
    // what's in the box: the name it last searched for, or what you're typing
    let q = $state("");
    $effect.pre(() => {
        q = v?.q ?? "";
    });
    function key(e: KeyboardEvent) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        libPickOpen(q);
    }
</script>

{#if v}<section class="panel libpick"><h3>Which one is it?<span class="r"><button class="linkbtn" data-act="lib-pick-close" onclick={libPickClose}>Close</button></span></h3>{" "}<div class="bar"><input class="inp" id="lib-q" bind:value={q} style="flex:1" onkeydown={key}><button class="btn sm" data-act="lib-pick-go" onclick={() => libPickOpen(q)}>Search</button></div>{" "}{#if v.busy}<p class="think">Looking…</p>{:else if v.res.length}<div class="wgrid sm">{#each v.res as r (r.i)}<button class="wtile" data-act="lib-pick" data-k={r.i} onclick={() => libPick(r.i)}>{#if r.image}<Pic src={r.image} loading="lazy" referrerpolicy={undefined} />{:else}<span class="nocov">{r.title}</span>{/if}<span class="t">{r.title}</span><span class="hint">{r.sub}</span></button>{/each}</div>{:else}<p class="hint">Nothing with that name on your servers.</p>{/if}</section>{/if}
