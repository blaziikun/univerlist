<!--
    src/features/watch-read/page/ReadServers.svelte
    ─────────────────────────────────────────────────────────────────
      "Your reading servers" on the Read page: Komga, Kavita, OPDS catalogues and shared folders (ServerList), with
      Done (rl-servers, handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import ServerList from "./ServerList.svelte";
</script>

<section class="panel wservers"><h3>Your reading servers<span class="r"><button class="btn sm ghost" data-act="rl-servers">Done</button></span></h3><ServerList set="rlibs" /></section>
