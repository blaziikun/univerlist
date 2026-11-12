<!--
    src/features/settings/sections/data/WorkStatus.svelte
    ─────────────────────────────────────────────────────────────────
      The foot of Settings › Data › When it goes online: a line for work going on in the background (finding artwork
      or saving it for offline, crowd scores, an AniList sync) with how far it's got and a button to pause, stop or
      try again; your library file asking for permission again; being offline; the last backup. The lines follow the
      work as it reports each step (workNews: covers.ts autoBanner, anilist.ts alBanner), without drawing the rest of
      the page; the rest follows the page. The buttons go through their data-act (sources/handlers.ts,
      import-export/handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../../core/store.svelte";
    import { workStatusView } from "../../../core/shell";
    import { alBanner } from "../../../sources/anilist";
    import { autoBanner, type WorkBanner } from "../../../sources/covers";
    import { workNews } from "../../../sources/work-state.svelte";

    const auto = $derived.by(() => {
        void workNews.auto;
        void store.ui;
        void store.meta;
        return autoBanner();
    });
    const al = $derived.by(() => {
        void workNews.al;
        void store.ui;
        void store.meta;
        return alBanner();
    });
    const v = $derived.by(() => {
        void store.ui;
        void store.meta;
        void store.items;
        return workStatusView();
    });
</script>

{#snippet line(b: WorkBanner | null)}{#if b}<span class="b-ic">{b.ic}</span>{` ${b.text} `}{#if b.pct != null}<span class="progress" style="width:120px;display:inline-block"><span style="width:{b.pct}%"></span></span>{" "}{/if}<button class="linkbtn" data-act={b.act}>{b.btn}</button>{/if}{/snippet}
<div class="banner" id="covstat" hidden={!auto}>{@render line(auto)}</div><div class="banner" id="alstat" hidden={!al}>{@render line(al)}</div>{" "}{#if v.reconnect}<div class="banner"><span class="b-ic">⇅</span>{` Your library file ${v.reconnect.name} needs permission again. `}<button class="btn sm gold" data-act="file-reconnect">Reconnect</button></div>{" "}{/if}<p class="hint">{v.hint}</p>
