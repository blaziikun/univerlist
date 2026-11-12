<!--
    src/features/watch-read/page/WatchPage.svelte
    ─────────────────────────────────────────────────────────────────
      The Watch page: the search row; your media servers, when open; then either a show you opened (ShowPage), or what
      the search found, what you're in the middle of, and what's on your servers. The player sits over it (#cinema,
      player/Cinema.svelte). It draws when the older code asks it to (renderMain), and not while the player covers it:
      that waits until the player closes (W.pageStale), as the HTML page did. watchPageView() in stage.ts.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { stageQ, watchPageView } from "../stage";
    import LibBrowse from "./LibBrowse.svelte";
    import ShowPage from "./ShowPage.svelte";
    import StageContinue from "./StageContinue.svelte";
    import StageHead from "./StageHead.svelte";
    import StageResults from "./StageResults.svelte";
    import WatchServers from "./WatchServers.svelte";

    const v = $derived.by(() => {
        void stageNews.page;
        return watchPageView();
    });
    // what's typed now: "Continue watching" hides while there's a search
    const typed = $derived.by(() => {
        void stageNews.page;
        void stageNews.res;
        return stageQ("watch");
    });
</script>

<div class="watch stage"><StageHead kind="watch" />{" "}{#if v.servers}<WatchServers />{" "}{/if}{#if v.show}<ShowPage />{:else}<div id="sres"><StageResults kind="watch" /></div>{#if v.cont}<StageContinue c={v.cont} hidden={!!typed} />{/if}{#if v.browse}<LibBrowse />{/if}{" "}{#if v.empty}<div class="empty"><h3>Find something to watch</h3><p>Type above. Episodes come from TVmaze and AniList; you play your own files, links or servers.</p></div>{/if}{/if}</div>
