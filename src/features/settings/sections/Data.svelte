<!--
    src/features/settings/sections/Data.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Data, sources & keys: bring things in, take everything with you (with your keys sealed by a passphrase),
      a library folder kept up to date, your free API keys, what happens online, and erasing everything.
      The buttons are handled by the older code under the same names (import-export/handlers.ts: import-*, export-*,
      folder-*, offline-*; settings/handlers.ts: key-*, erase*; library/item-handlers.ts: coverpick-start; settings.ts:
      igdb-copy), so this only draws it. Its own parts are in data/: Your games with LaunchBox's panel, the proxy's
      sources, and the line about work going on in the background.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { store } from "../../core/store.svelte";
    import Row from "../parts/Row.svelte";
    import { coverCache, fmtDate, KEYS, meta, ui } from "../../core/core";
    import { renderMain } from "../../core/shell";
    import { ago } from "../../core/views";
    import { folderSync } from "../../import-export/packs";
    import { KEY_INFO, offlineTargets } from "../settings";
    import { siteShares, UNIVERLIST_WORKER } from "../../sources/proxy";
    import GamesPanel from "./data/GamesPanel.svelte";
    import ProxyStatus from "./data/ProxyStatus.svelte";
    import WorkStatus from "./data/WorkStatus.svelte";
    import { testKey } from "../../sources/sources";

    const SCOPES: [string, string][] = [
        ["missing", "This mode: no cover yet"],
        ["books", "This mode: books without a chosen cover"],
        ["all", "This mode: everything"],
    ];
    const keyWord = (has: boolean, st: string | undefined, lent = false) =>
        !has
            ? lent
                ? "This site's"
                : "No key"
            : st === "bad"
                ? "Key rejected"
                : st === "ok"
                    ? "Working"
                    : st === "offline"
                        ? "Couldn't check"
                        : st === "checking"
                            ? "Checking…"
                            : "Key saved";

    const v = $derived.by(() => {
        void store.meta;
        void store.ui;
        void store.items;
        const S = meta.settings,
            imgs = offlineTargets(),
            al = meta.profile.anilist as { name?: string } | null;
        return {
            S: { ...S },
            ks: { ...((ui.keyState || {}) as Record<string, string>) },
            keys: { ...KEYS },
            shares: { ...siteShares },
            x: ui.expRun ?? null,
            o: ui.offline ?? null,
            al: al || S.anilistUser ? String(al?.name || S.anilistUser) : "",
            impNote: String(ui.impNote || ""),
            folder: {
                supported: folderSync.supported,
                name: folderSync.handle?.name || "",
                state: folderSync.state,
                lastSaved: folderSync.lastSaved,
            },
            imgs: imgs.length,
            have: imgs.filter(u => coverCache.urls.has(u)).length,
            fails: Object.keys(coverCache.hostFails),
            cpScope: String(ui.cpScope || "missing"),
            confirmErase: !!ui.confirmErase,
        };
    });

    // whether the browser has promised to keep this library when the disk runs low (asked at start-up, main.ts; or here)
    let kept = $state<boolean | null>(null);
    const keepAsk = async () => {
        kept = (await navigator.storage?.persist?.().catch(() => false)) ?? null;
    };
    onMount(() => {
        navigator.storage
            ?.persisted?.()
            .then(x => (kept = x))
            .catch(() => {});
    });

    // check each saved key once, the first time this page opens (Working / Key rejected)
    onMount(() => {
        if (ui.keysTested) return;
        ui.keysTested = true;
        setTimeout(async () => {
            const ks = (ui.keyState = (ui.keyState || {}) as Record<string, string>);
            for (const k of Object.keys(KEY_INFO))
                if (KEYS[k] && !ks[k]) {
                    ks[k] = "checking";
                    ks[k] = await testKey(k);
                }
            if (ui.page === "settings") renderMain();
        }, 50);
    });
</script>

<h2 class="sh">Data, sources & keys</h2>
<div class="panel">
    <h3>Bring things in</h3>
    <div class="dropzone" id="dropzone" data-act="import-file" role="button" tabindex="0">
        <b>Drop files here, or click to choose</b>
        <span class="hint">UniverList .zip or .json backups, Letterboxd .zip, MyAnimeList .xml, Goodreads, StoryGraph, IMDb or any CSV. Recognised automatically.</span>
    </div>
    <div class="bar" style="margin-top:10px">
        <input class="inp" id="imp-url" placeholder="…or paste a profile link: anilist.co/user/you, letterboxd.com/you" style="flex:1" aria-label="A profile link" />
        <button class="btn gold" data-act="import-url">Bring it in</button>
        <button class="btn ghost" data-act="open-paste">Paste a list of titles…</button>
    </div>
    <!-- always text from the app itself (import-export/handlers.ts import-url), with a link in it -->
    {#if v.impNote}<p class="hint">{@html v.impNote}</p>{/if}
</div>

{#if v.al}
    <div class="panel">
        <h3>Linked</h3>
        <Row label="AniList" hint={`${v.S.alSyncedAt ? `Last synced ${ago(String(v.S.alSyncedAt))}. ` : ""}One way: AniList → here. Reading apps that track to AniList (Paperback, Mihon, Tachiyomi, Kotatsu) show up here after a sync.`}>
            <div class="bar">
                <span>{v.al}</span>
                <button class="btn sm" data-act="al-sync">Sync now</button>
                <label class="ctl"><input type="checkbox" id="set-autosync" checked={!!v.S.autoSync} /> Sync when I open UniverList (at most every 6 hours)</label>
                <button class="btn sm ghost" data-act="al-unlink">Unlink</button>
            </div>
        </Row>
    </div>
{/if}

<div class="panel">
    <h3>Take it with you</h3>
    <div class="bar">
        <!-- opens the dialog where you choose what goes in (import-export/export-dialog.ts) -->
        <button class="btn gold" data-act="export-open" disabled={!!v.x?.running}>{v.x?.running ? `Packing pictures… ${v.x.done}/${v.x.total}` : "Download everything…"}</button>
        <button class="btn" data-act="export-json">Backup file (.json)</button>
        {#if v.x?.note}<span class="hint">{v.x.note}</span>{/if}
    </div>
    <p class="hint">
        Your library, lists, favourites, settings, themes, profile and every picture, with your keys sealed by a passphrase if you choose; you can leave
        any part out. {v.S.lastBackup ? `Last full backup ${fmtDate(String(v.S.lastBackup))}.` : "No full backup yet."}
    </p>
    {#if kept === true}
        <p class="hint">This browser keeps your library for good, even when the disk runs low.</p>
    {:else if kept === false}
        <p class="hint">
            This browser may clear your library if the disk runs low (Safari also does after a week away, unless the app is
            installed). Keep a backup, or <button class="linkbtn" onclick={keepAsk}>ask it to keep it</button>.
        </p>
    {/if}
</div>

<div class="panel">
    <h3>Library folder</h3>
    {#if !v.folder.supported}
        <p class="hint">This browser can't keep a folder up to date (Chrome and Edge can). Use the .zip instead.</p>
    {:else if v.folder.name}
        <p>Keeping <b>{v.folder.name}</b> up to date{v.folder.lastSaved ? `, last saved ${new Date(v.folder.lastSaved).toLocaleTimeString()}` : ""}.</p>
        <div class="bar">
            {#if v.folder.state === "reconnect"}<button class="btn gold" data-act="folder-reconnect">Reconnect</button>{:else}<button class="btn" data-act="folder-push">Save now</button>{/if}
            <button class="btn ghost" data-act="folder-disconnect">Stop</button>
        </div>
    {:else}
        <p class="hint">Pick a folder (iCloud Drive, Dropbox, a git repo) and UniverList keeps the layout above in it a few seconds after every change. Pick one that already has a library and it loads from it.</p>
        <div class="bar"><button class="btn" data-act="folder-connect">Choose a folder…</button></div>
    {/if}
</div>

<GamesPanel />

<div class="panel">
    <h3>Your own keys (optional)</h3>
    {#if v.shares.tmdb || v.shares.igdb}
        <p class="hint">
            This site already brings {[v.shares.tmdb && "films and TV (TMDB)", v.shares.igdb && "games (IGDB)"].filter(Boolean).join(" and ")} for everyone, through its own server. Add your own keys only if you want your own limits, the sources below, or the one-file version.
        </p>
    {/if}
    <p class="hint">Keys are kept in this browser and in your backups (sealed with your backup passphrase), never inside index.html. You can leave them out of a backup when you download one (above).</p>
    {#each Object.entries(KEY_INFO) as [k, [name, what, url, how]] (k)}
        <div class="keyrow">
            <div>
                <b>{name}</b>
                <span class="pill" class:dnf={!!v.keys[k] && v.ks[k] === "bad"} class:active={!!v.keys[k] && v.ks[k] !== "bad"}>{keyWord(!!v.keys[k], v.ks[k], (k === "tmdb" && v.shares.tmdb) || (k === "igdb" && v.shares.igdb))}</span>
                <p class="hint">{what} {how} <a class="link" href={url} target="_blank" rel="noopener">{k === "igdb" ? "How to get access ↗" : "Get a free key ↗"}</a></p>
                {#if k === "igdb"}
                    <details class="igdbhow">
                        <summary>The proxy script, and how to set it up</summary>
                        <ol class="hint">
                            <li>At <b>dash.cloudflare.com</b> → Workers & Pages → Create → Worker. Replace its code with the script below and deploy (if you already have one for IGDB, replace its code: the IGDB part works as before).</li>
                            <li>
                                In the Worker's Settings → Variables and secrets, add the keys for the sources you want: <code>CLIENT_ID</code> + <code>CLIENT_SECRET</code> (IGDB: register an app at
                                <b>dev.twitch.tv/console</b>), <code>SGDB_KEY</code> (SteamGridDB: Preferences → API), <code>TGDB_KEY</code> (TheGamesDB: request a public key on its forum),
                                <code>SS_DEVID</code> + <code>SS_DEVPASS</code> + <code>SS_USER</code> + <code>SS_PASS</code> (ScreenScraper: developer access is requested on its forum), <code>CV_KEY</code> (Comic Vine),
                                <code>HC_KEY</code> (Hardcover: Settings → API). Add <code>PASS</code> if you want a password, then put <code>?pass=yourpassword</code> on the end of the address.
                            </li>
                            <li>Paste the Worker's address (like <code>https://univerlist.yourname.workers.dev</code>) here and press Save & test.</li>
                        </ol>
                        {#if v.keys.igdb}<ProxyStatus />{/if}
                        <pre class="code">{UNIVERLIST_WORKER}</pre>
                        <button class="btn sm" data-act="igdb-copy">Copy the script</button>
                    </details>
                {/if}
            </div>
            <div class="bar">
                <!-- hidden until you press the eye (core/actions.ts key-eye) -->
                <input class="inp" id={`key-${k}`} type="password" value={v.keys[k]} placeholder={k === "igdb" ? "https://igdb.yourname.workers.dev" : "Paste key"} autocomplete="off" spellcheck="false" style="width:240px;font-family:var(--f-mono);font-size:12px" aria-label={`${name} key`} />
                <button class="btn sm ghost keyeye" data-act="key-eye" data-k={k} title="Show or hide" aria-label="Show or hide the key">👁</button>
                <button class="btn sm" data-act="key-save" data-k={k}>Save & test</button>
                {#if v.keys[k]}<button class="btn sm ghost" data-act="key-clear" data-k={k}>Remove</button>{/if}
            </div>
        </div>
    {/each}
</div>

<div class="panel">
    <h3>When it goes online</h3>
    <Row label="New things" hint="Each thing is looked up once. Nothing is retried in the background; press Refresh when you want fresher data.">
        <label class="ctl"><input type="checkbox" id="set-autofetch" checked={v.S.autoFetch !== false} /> Fetch details, scores and a cover once, when something is added</label>
    </Row>
    <Row label="Pictures offline" hint="Switch it on or off under General › Offline.">
        <span class="hint">{v.have} of {v.imgs} pictures saved on this device.</span>
    </Row>
    <Row label="Airing times" hint="Only for things you're following in Culture.">
        <label class="ctl"><input type="checkbox" id="set-airing" checked={v.S.airing !== false} /> Check for new anime episodes and chapters (at most every 6 hours)</label>
    </Row>
    <Row label="Image proxy" hint={v.fails.length ? `Refused directly: ${v.fails.join(", ")}` : ""}>
        <label class="ctl"><input type="checkbox" id="set-proxy" checked={!!v.S.imageProxy} /> Use wsrv.nl for sites that won't share pictures</label>
    </Row>
    <Row label="Refresh">
        <div class="bar">
            <button class="btn" data-act="open-covers">Refresh artwork, genres & scores…</button>
            <button class="btn" data-act="offline-go" disabled={!!v.o?.running}>{v.o?.running ? `Saving ${v.o.done} of ${v.o.total}…` : "Save every picture now"}</button>
            {#if v.o?.running}<button class="btn ghost" data-act="offline-stop">Stop</button>{:else if v.o?.note}<span class="hint">{v.o.note}</span>{/if}
        </div>
    </Row>
    <Row label="Covers" hint="Every available cover side by side; number keys pick.">
        <div class="bar">
            <select class="sel" id="cp-scope" aria-label="Which covers">
                {#each SCOPES as [k, l] (k)}<option value={k} selected={v.cpScope === k}>{l}</option>{/each}
            </select>
            <button class="btn" data-act="coverpick-start">Choose covers one by one</button>
        </div>
    </Row>
    <div id="workstat"><WorkStatus /></div>
</div>

<div class="panel">
    <h3>Start over</h3>
    <div class="bar">
        {#if v.confirmErase}
            <span class="err">Erase everything in this browser? Download a backup first if you might want it back.</span>
            <button class="btn danger" data-act="erase-yes">Erase</button>
            <button class="btn ghost" data-act="erase-no">Keep</button>
        {:else}<button class="btn danger" data-act="erase">Erase everything…</button>{/if}
    </div>
</div>
