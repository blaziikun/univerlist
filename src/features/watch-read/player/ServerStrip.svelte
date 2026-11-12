<!--
    src/features/watch-read/player/ServerStrip.svelte
    ─────────────────────────────────────────────────────────────────
      The one Servers bar at the top of the player: an icon that lists what each server is (cin-srcs), Server 1 2 3…
      (cin-src-pick: switching keeps your place), still looking while extensions answer, and + to add one for this
      series (ss-open). It draws when servers arrive (srvRefresh in watch.ts) without touching what's playing.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../../core/Icon.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { W } from "../watch";
    import { srvStripView } from "./view";

    const s = $derived.by(() => {
        void stageNews.srv;
        void stageNews.player;
        return W.player ? srvStripView(W.player) : null;
    });
</script>

{#if s}<div class="cin-srv" role="group" aria-label="Servers"><button class="srv ico" data-act="cin-srcs" aria-expanded={s.open} title="Servers: what each one is"><Icon name="servers" /></button>{#each s.list as x (x.i)}<button class="srv{x.on ? ' on' : ''}{x.bad ? ' bad' : ''}" data-act="cin-src-pick" data-k={x.i} aria-pressed={x.on} aria-label="Server {x.i + 1}" title={x.title}>{x.i + 1}</button>{/each}{#if s.looking}<span class="srv wait" title="Still checking your servers" aria-label="Still checking your servers"><span class="dots"></span></span>{/if}<button class="srv add" data-act="ss-open" title="Add a server for this series" aria-label="Add a server for this series">+</button></div>{/if}
