<!--
    src/features/settings/sections/Advanced.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Advanced: the app's name, the film catalogue's country, links on cards, and how long reading takes.
      Each field saves as you change it (events.ts: set-appname, set-region, set-links, data-speed).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import Row from "../parts/Row.svelte";
    import { APP_NAME, DEFAULT_SETTINGS } from "../../core/core";

    const S = $derived({ ...store.meta.settings });
    const SPEEDS: [string, string][] = [
        ["page", "min per book page"],
        ["chapter", "min per manga chapter"],
        ["manhwa", "min per manhwa chapter"],
        ["novel", "min per light-novel chapter"],
        ["issue", "min per comic issue"],
    ];
    const speeds = $derived((S.speeds || DEFAULT_SETTINGS.speeds) as Record<string, number>);
</script>

<h2 class="sh">Advanced</h2>
<Row label="App name" hint="Shown in the header and the browser tab.">
    <input class="inp" id="set-appname" value={S.appName || APP_NAME} maxlength="40" style="max-width:280px" aria-label="App name" />
</Row>
<Row label="Film and TV region" hint="Which country's film catalogue is searched first (two letters: GB, US, JP…).">
    <input class="inp" id="set-region" value={S.region || "GB"} maxlength="2" style="width:60px;text-transform:uppercase" aria-label="Region code" />
</Row>
<Row label="Links to other sites">
    <label class="ctl"><input type="checkbox" id="set-links" checked={!!S.showLinks} /> Show links to AniList, IMDb and others on cards</label>
</Row>
<Row label="Time estimates" hint="Anime, TV and films use their real runtimes.">
    <div class="bar">
        {#each SPEEDS as [k, l] (k)}
            <label class="ctl"><input class="inp" data-speed={k} inputmode="decimal" value={speeds[k]} style="width:56px" aria-label={l} /> {l}</label>
        {/each}
    </div>
</Row>
