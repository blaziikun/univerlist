<!--
    src/features/watch-read/page/ServerList.svelte
    ─────────────────────────────────────────────────────────────────
      One list of your servers: media servers on the Watch page (set "libs"), reading servers on the Read page
      ("rlibs"). Each one's kind, whether it's used, its name, address and key, Test (and how it went), Share (a code a
      friend can paste), ✕; then a button to add each kind, and a box for a friend's code. serverListView() in
      medialibs.ts works out what it shows; its buttons and boxes are its own (libAdd, libTest… there).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { libAdd, libCode, libDel, libField, libShare, libTest, serverListView } from "../medialibs";

    let { set }: { set: "libs" | "rlibs" } = $props();

    const v = $derived.by(() => {
        void stageNews.page;
        return serverListView(set);
    });
    // a friend's code, as you paste it; emptied once it's added
    let code = $state("");
    function add() {
        if (libCode(code)) code = "";
    }
</script>

<div class="libs">{#each v.rows as l, i (i + ":" + l.id)}<div class="librow"><span class="libt">{l.type}</span><input type="checkbox" data-lib={l.id} data-f="on" checked={l.on} aria-label="Use this server" onchange={e => libField(l.id, "on", e.currentTarget.checked)}>{" "}<input class="inp" data-lib={l.id} data-f="name" value={l.name} placeholder="Name" style="width:130px" onchange={e => libField(l.id, "name", e.currentTarget.value)}>{" "}<input class="inp" data-lib={l.id} data-f="url" value={l.url} placeholder={l.ph} style="flex:1;min-width:200px" onchange={e => libField(l.id, "url", e.currentTarget.value)}>{" "}<input class="inp" type="password" data-lib={l.id} data-f="key" value={l.key} placeholder={l.kph} style="width:180px" autocomplete="off" onchange={e => libField(l.id, "key", e.currentTarget.value)}>{" "}<button class="btn sm" data-act="lib-test" data-k={l.id} onclick={() => libTest(l.id)}>{l.testing ? "Testing…" : "Test"}</button><button class="btn sm ghost" data-act="lib-share" data-k={l.id} title="Copy a code a friend can paste to add this server" onclick={() => libShare(l.id)}>Share</button><button class="btn sm ghost" data-act="lib-del" data-k={l.id} aria-label="Remove" onclick={() => libDel(l.id)}>✕</button>{" "}{#if l.from}<span class="libfrom">from {l.from}</span>{/if}{#if l.result}<span class="libst {l.result.ok ? 'ok' : 'bad'}">{l.result.t}</span>{/if}</div>{/each}{" "}<div class="bar">{#each v.kinds as k (k.t)}<button class="btn sm" data-act="lib-add" data-set={set} data-k={k.t} onclick={() => libAdd(set, k.t)}>+ {k.name}</button>{/each}<span class="spacer"></span><input class="inp sm" id="lib-code-{set}" placeholder="Paste a friend's server code" style="width:220px" bind:value={code}><button class="btn sm" data-act="lib-code" data-set={set} onclick={add}>Add</button></div>{" "}<p class="hint">{#if v.read}Komga: Account → API keys (or your email:password). Kavita: Settings → your API key. OPDS: any catalogue address (Calibre-web is <code>/opds</code>). Shared folder: an address that lists your CBZ, ZIP, PDF, EPUB files or folders of pages. Keys are saved in this browser and in your backups, never inside index.html. A share code includes the key, so only send it to people you'd give the key to.{:else}Jellyfin/Emby: Dashboard → API keys. Plex: your X-Plex-Token. Shared folder: any address that lists your video files (a NAS or cloud share link, rclone serve, nginx/Caddy file browsing), with the token if the link needs one. Keys are saved in this browser and in your backups, never inside index.html. A share code includes the key, so only send it to people you'd give the key to.{/if}</p></div>
