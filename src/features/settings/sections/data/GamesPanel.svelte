<!--
    src/features/settings/sections/data/GamesPanel.svelte
    ─────────────────────────────────────────────────────────────────
      Settings › Data › Your games: match every game again and fix its cover (gamesUpdate in igdb.ts), find real spines
      through your proxy (spinesUpdate in proxy.ts), LaunchBox's boxes and spines, and the table of what the check
      found. Both jobs draw the page again as they go, so this follows the page.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../../core/store.svelte";
    import { gamesUpdate, gamesView } from "../../../sources/igdb";
    import { spinesUpdate } from "../../../sources/proxy";
    import LaunchBox from "./LaunchBox.svelte";

    const v = $derived.by(() => {
        void store.ui;
        void store.meta;
        void store.items;
        return gamesView();
    });
</script>

<div class="panel"><h3>Your games</h3><p class="hint">{`Matches every game again (${v.src}), fixes covers that are missing or don't load, fills in platforms, developer and time to beat, and counts the characters it can find. Covers you picked yourself are left alone.`}</p>{" "}<div class="bar"><button class="btn" data-act="spines-update" disabled={v.spines.running} title="ScreenScraper, through your proxy" onclick={() => spinesUpdate()}>{v.spines.running ? `Spines: ${v.spines.done} of ${v.spines.total}…` : "Find real spines"}</button><button class="btn" data-act="games-update" disabled={v.games.running} onclick={() => gamesUpdate()}>{v.games.running ? `Checking ${v.games.done} of ${v.games.total}…` : "Check and fix my games"}</button>{#if !v.igdb}<span class="hint">Characters for most games need IGDB (see Your own keys below).</span>{/if}</div>{" "}<LaunchBox />{" "}{#if v.rows.length}<div class="tablewrap"><table class="lib small"><thead><tr><th>Game</th><th>Matched on</th><th>Cover</th><th>Characters</th></tr></thead><tbody>{#each v.rows as r, i (i)}<tr><td><button class="linkbtn" data-act="open" data-id={r.id}>{r.title}</button></td><td>{r.from || "nowhere"}</td><td class={r.cover === "missing" ? "bad" : ""}>{r.cover}</td><td class={r.chars ? "" : "bad"}>{r.chars == null ? r.note || "–" : r.chars}</td></tr>{/each}</tbody></table></div>{/if}</div>
