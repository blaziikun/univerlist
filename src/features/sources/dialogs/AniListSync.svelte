<!--
    src/features/sources/dialogs/AniListSync.svelte
    ─────────────────────────────────────────────────────────────────
      AniList: your username, Import or Sync now, how far it's got, what went wrong and when it last synced.
      The sync's progress lives in alSync (sources/anilist.ts), which isn't the store's: the sync asks the dialog to
      catch up (renderOverlay) as it goes, and this reads alSync then. Sync and Stop are "al-sync" and "al-stop"
      (sources/handlers.ts), which Settings › Data draws too; the username box is this one's own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { markDirty, meta, safeUrl } from "../../core/core";
    import { ago } from "../../core/views";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import { alSync } from "../anilist";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "anilist") return null;
        const al = store.meta.profile.anilist;
        return {
            running: alSync.running,
            msg: alSync.msg,
            pct: alSync.total ? Math.round((alSync.done / alSync.total) * 100) : null,
            error: alSync.error,
            counts: alSync.counts ? { ...alSync.counts } : null,
            warnings: [...new Set(alSync.warnings || [])],
            al: al ? { name: al.name, url: al.url, syncedAt: al.syncedAt } : null,
        };
    });
    let user = $state(meta.settings.anilistUser || ""),
        go = $state<HTMLButtonElement | null>(null);
    function keep() {
        meta.settings.anilistUser = user.trim();
        markDirty();
    }
</script>

{#if v}
    <DialogHead title="AniList" />
    <p>Bring in your anime and manga lists (including manhwa and light novels), scores, progress, dates, rewatches, custom lists as tags, favourites, favourite characters, staff and studios, and your watch-time stats. Related works become links, so franchises join up on their own.</p>
    <div class="bar"><label class="ctl">AniList username <input class="inp" id="al-user" bind:value={user} style="width:200px" disabled={v.running} onchange={keep} onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); keep(); go?.click(); } }}></label>
        {#if v.running}<button class="btn" data-act="al-stop">Stop</button>{:else}<button class="btn gold" data-act="al-sync" bind:this={go}>{v.al ? "Sync now" : "Import"}</button>{/if}</div>
    {#if v.running}<p class="think">{v.msg || "Working…"}</p>{#if v.pct != null}<div class="progress"><span style="width:{v.pct}%"></span></div>{/if}<p class="hint">AniList is limiting requests at the moment, so a big list takes a few minutes. You can close this; it keeps going.</p>{/if}
    {#if v.error}<p class="err">{v.error.charAt(0).toUpperCase() + v.error.slice(1)}</p>{/if}
    {#if v.counts && !v.running}<p class="hint">Last sync: {v.counts.added} added, {v.counts.updated} updated, {v.counts.chars} new characters.</p>{/if}
    {#if v.warnings.length && !v.running}<p class="err">AniList's servers kept erroring on: {v.warnings.join(", ")}. Everything else came in. Sync again later to fill these in.</p>{/if}
    {#if v.al}<p class="hint">Connected to <a href={safeUrl(v.al.url)} target="_blank" rel="noopener">{v.al.name}</a>, synced {ago(v.al.syncedAt || "")}. Your lists must be public on AniList for this to work.</p>{:else}<p class="hint">Your AniList lists need to be public (they are unless you changed it in AniList's settings).</p>{/if}
{/if}
