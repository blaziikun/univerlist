<!--
    src/features/watch-read/player/SourcesPanel.svelte
    ─────────────────────────────────────────────────────────────────
      The servers for this episode (or film), from the one server button at the top: each one's name, how it plays and
      whose it is, which one is playing and which didn't play, and whether more are still being looked for; what your
      media servers said about this show, and picking the right title on them by hand (LibPick). Picking one switches
      to it from where you are (cin-src-pick), and a server just for this series can be added (ss-open). It closes on a
      click anywhere else (Cinema.svelte).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { WatchPlayer } from "../../core/model";
    import { stageNews } from "../stage-state.svelte";
    import { libPickOpen } from "../medialibs";
    import LibPick from "../page/LibPick.svelte";
    import { sourcesView } from "./view";

    let { p }: { p: WatchPlayer } = $props();
    const s = $derived.by(() => {
        void stageNews.srv;
        return sourcesView(p);
    });
</script>

<div class="cin-pop cin-srcs" role="dialog" aria-label="Servers"><p class="ilab">Servers for this {s.what}</p>{#each s.rows as x (x.i)}<button class="srcrow{x.on ? ' on' : ''}{x.bad ? ' bad' : ''}" data-act="cin-src-pick" data-k={x.i} aria-pressed={x.on}><span class="dot"></span><span class="sn"><b>Server {x.i + 1}</b><small class="srvname">{x.name}</small><small>{x.how}</small></span>{#if x.bad}<span class="hint">didn't play</span>{:else if x.on}<span class="hint">playing</span>{/if}</button>{:else}<p class="hint">{s.looking ? "Looking through your servers…" : "None yet."}</p>{/each}{#if s.rows.length && s.looking}<p class="hint">Still looking for more…</p>{/if}{#if s.lib}<p class="hint wlib{s.lib.miss ? ' miss' : ''}">{(s.lib.miss ? "" : "● ") + s.lib.note + " "}<button class="linkbtn" data-act="lib-pick-open" onclick={() => libPickOpen()}>{s.lib.pick}</button></p><LibPick />{/if}<p class="hint">If one won't play, the next is tried by itself. Your place is kept when you switch.</p><button class="linkbtn" data-act="ss-open">Add a server for this series</button></div>
