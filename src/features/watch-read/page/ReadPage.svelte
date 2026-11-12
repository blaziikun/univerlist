<!--
    src/features/watch-read/page/ReadPage.svelte
    ─────────────────────────────────────────────────────────────────
      The Read page: a book or series open (ReadBook), or the search row, your reading servers when open, what the
      search found, what you're reading, and what's on your servers. The reader opens over it (#reader). It draws when
      the older code asks it to (renderMain). readPageView() in stage.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { readPageView, stageQ } from "../stage";
    import ReadBook from "./ReadBook.svelte";
    import ReadBrowse from "./ReadBrowse.svelte";
    import ReadServers from "./ReadServers.svelte";
    import StageContinue from "./StageContinue.svelte";
    import StageHead from "./StageHead.svelte";
    import StageResults from "./StageResults.svelte";

    const v = $derived.by(() => {
        void stageNews.page;
        return readPageView();
    });
    // what's typed now: "Continue reading" hides while there's a search
    const typed = $derived.by(() => {
        void stageNews.page;
        void stageNews.res;
        return stageQ("read");
    });
</script>

{#if v.book}<ReadBook servers={v.servers} />{:else}<div class="watch read stage"><StageHead kind="read" />{" "}{#if v.servers}<ReadServers />{" "}{/if}<div id="sres"><StageResults kind="read" /></div>{#if v.cont}<StageContinue c={v.cont} hidden={!!typed} />{/if}{#if v.browse}<ReadBrowse />{/if}{" "}{#if v.empty}<div class="empty"><h3>Nothing open</h3><p>Search above, upload a file, or connect a server.</p></div>{" "}{/if}<p class="hint wnote">Nothing is uploaded anywhere: files you open stay on this computer, and chapters on your servers are read straight from them.</p></div>{/if}
