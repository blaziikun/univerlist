<!--
    src/features/watch-read/player/SourcesPanel.svelte
    ─────────────────────────────────────────────────────────────────
      The servers for this episode (or film), from the strip's icon: each one's name, how it plays and whose it is,
      which one is playing and which didn't play; picking one switches to it from where you are (cin-src-pick), and a
      server just for this series can be added (ss-open).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { WatchPlayer } from "../../core/model";
    import { sourcesView } from "./view";

    let { p }: { p: WatchPlayer } = $props();
    const s = $derived(sourcesView(p));
</script>

<div class="cin-opts cin-srcs panel"><p class="ilab">Servers for this {s.what}</p>{#each s.rows as x (x.i)}<button class="srcrow{x.on ? ' on' : ''}{x.bad ? ' bad' : ''}" data-act="cin-src-pick" data-k={x.i}><span class="dot"></span><span class="sn"><b>Server {x.i + 1}</b><small class="srvname">{x.name}</small><small>{x.how}</small></span>{#if x.bad}<span class="hint">didn't play</span>{:else if x.on}<span class="hint">playing</span>{/if}</button>{/each}<p class="hint">If one won't play, the next is tried by itself. Your place is kept when you switch. <button class="linkbtn" data-act="ss-open">Add a server for this series</button></p></div>
