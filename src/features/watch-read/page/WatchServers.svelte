<!--
    src/features/watch-read/page/WatchServers.svelte
    ─────────────────────────────────────────────────────────────────
      "Your media servers" on the Watch page: Jellyfin, Emby, Plex and shared folders (ServerList), and, folded under
      them, link patterns for files at addresses you can predict ({title}, {season}, {e2}…), tried in order. A pattern
      that doesn't point at your own network or a server you've added isn't kept (patternSet in watch.ts). Done, + Server,
      ↑ and ✕ go through their data-act (watch-servers, srv-add, srv-up, srv-del in handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { patternSet, patternsView } from "../watch";
    import ServerList from "./ServerList.svelte";

    const rows = $derived.by(() => {
        void stageNews.page;
        return patternsView();
    });
    function changed(i: number, f: "name" | "pattern", e: Event & { currentTarget: HTMLInputElement }, was: string) {
        if (!patternSet(i, f, e.currentTarget.value)) e.currentTarget.value = was;
    }
</script>

<section class="panel wservers"><h3>Your media servers<span class="r"><button class="btn sm ghost" data-act="watch-servers">Done</button></span></h3><ServerList set="libs" />{" "}<details class="wpat" open={rows.length > 0}><summary>Link patterns <span class="advtag">advanced</span></summary><p class="hint">On your own network or a server you've added. For files at predictable addresses. Fill-ins: <code>{"{title}"}</code> <code>{"{stitle}"}</code> (the season's own title) <code>{"{year}"}</code> <code>{"{season}"}</code> <code>{"{episode}"}</code> <code>{"{s2}"}</code> <code>{"{e2}"}</code> (two digits) <code>{"{abs}"}</code> (episode number across every season).</p>{" "}{#each rows as r (r.i)}<div class="srvrow"><input type="checkbox" data-srv={r.i} data-f="on" checked={r.on} aria-label="Use this server" onchange={e => patternSet(r.i, "on", e.currentTarget.checked)}><input class="inp" data-srv={r.i} data-f="name" value={r.name} placeholder="Name" style="width:130px" onchange={e => changed(r.i, "name", e, r.name)}><input class="inp" data-srv={r.i} data-f="pattern" value={r.pattern} placeholder={"http://nas.local/videos/{title}/Season {season}/{title} S{s2}E{e2}.mp4"} style="flex:1" onchange={e => changed(r.i, "pattern", e, r.pattern)}><button class="btn sm ghost" data-act="srv-up" data-k={r.i} disabled={!r.i} aria-label="Try earlier">↑</button><button class="btn sm ghost" data-act="srv-del" data-k={r.i} aria-label="Remove">✕</button></div>{/each}{#if rows.length}{" "}{/if}<div class="bar"><button class="btn sm" data-act="srv-add">+ Server</button><span class="hint">Tried in order after your servers; if one can't play an episode, the next is tried.</span></div></details></section>
