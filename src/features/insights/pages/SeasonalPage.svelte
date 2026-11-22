<!--
    src/features/insights/pages/SeasonalPage.svelte
    ─────────────────────────────────────────────────────────────────
      This season (the Culture mode's tab): the anime airing in a season, most popular first, from AniList, as TV, films
      and the rest, each with when its next episode airs and whether it's in your library. Step to earlier or later
      seasons, and show everything, only what's new to you or only what you have; those are the page's own buttons.
      The season's list is fetched by loadSeason() and kept in seasonState (mode-pages.ts), which also feeds the
      overview's block; it says when it's changed by redrawing the page (renderMain), which this catches up with.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { statusWord, ui } from "../../core/core";
    import { until } from "../../core/views";
    import { seasonNow, SEASONS } from "../../sources/sources";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import { alIndex, loadSeason, SEASON_NAME, seasonGroups, seasonKey, seasonState } from "../mode-pages";

    const v = $derived.by(() => {
        const u = store.ui;
        void store.itemsByFrame; // your library, taken in once a frame
        const s = u.season || seasonNow(),
            byAl = alIndex();
        return {
            s,
            only: u.seasonOnly || "",
            busy: seasonState.busy,
            err: seasonState.err,
            byAl,
            groups: seasonGroups(seasonState.list || [], u.seasonOnly || "", byAl),
        };
    });
    // the season shown isn't the one kept, or nothing's been asked for yet: ask (after this draw, as the page did)
    $effect(() => {
        void store.ui;
        if (seasonState.key !== seasonKey() || (!seasonState.list && !seasonState.busy && !seasonState.err))
            setTimeout(() => loadSeason(), 0);
    });
    function step(d: number) {
        const s = ui.season || seasonNow();
        if (!d) ui.season = null;
        else {
            let i = SEASONS.indexOf(s.season) + d,
                y = s.year;
            if (i < 0) {
                i = 3;
                y--;
            }
            if (i > 3) {
                i = 0;
                y++;
            }
            ui.season = { season: SEASONS[i], year: y };
        }
        seasonState.key = "";
        seasonState.list = null;
        seasonState.err = "";
        store.flush("ui");
    }
    function only(k: string) {
        ui.seasonOnly = k;
        store.flush("ui");
    }
</script>

<HiddenNote />
<div class="ph"><div class="ttl"><h2 class="ltitle">{SEASON_NAME[v.s.season]} {v.s.year}</h2><p>Anime airing this season, most popular first, from AniList.</p></div><span class="spacer"></span>
    <button class="btn sm ghost" data-act="season-step" data-k="-1" onclick={() => step(-1)}>← Earlier</button><button class="btn sm ghost" data-act="season-step" data-k="0" onclick={() => step(0)}>Now</button><button class="btn sm ghost" data-act="season-step" data-k="1" onclick={() => step(1)}>Later →</button>
    <div class="seg">{#each [["", "Everything"], ["new", "Not in my list"], ["mine", "In my list"]] as [k, l]}<button data-act="season-only" data-k={k} aria-pressed={v.only === k} onclick={() => only(k)}>{l}</button>{/each}</div><button class="btn sm ghost" data-act="season-refresh" title="Fetch again" onclick={() => loadSeason(true)}>↻</button></div>
{#if v.busy}<p class="think">Reading the season from AniList…</p>{:else if v.err}<p class="err">{v.err}</p>{/if}
{#each v.groups as [n, list] (n)}<section class="group"><div class="plaque"><h3>{n}</h3><span class="n">{list.length}</span></div><div class="schart">{#each list as r}{@const al = r.ext?.anilist}{@const id = al ? v.byAl.get(al) : undefined}{@const mine = id ? store.item(id) : undefined}<div class="scard">{#if r.cover}<Pic src={r.cover} loading="lazy" />{:else}<span class="nocov">{r.title}</span>{/if}
    <div class="sb"><span class="t">{r.title}</span><span class="hint">{[r.creator, r.kind, r.total ? r.total + " eps" : ""].filter(Boolean).join(" · ")}</span>
        <span class="chips">{#each (r.genres || []).slice(0, 3) as g}<span class="chip ghostchip">{g}</span>{/each}</span>
        <span class="sfoot">{#if r.airing}<span class="hint">Ep {r.airing.ep} in {until(r.airing.at)}</span>{:else}<span class="hint">{r.airStatus === "NOT_YET_RELEASED" ? "Not out yet" : r.airStatus === "FINISHED" ? "Finished" : "Airing"}</span>{/if}{#if r.scores?.anilist}<span class="crowd">{r.scores.anilist}</span>{/if}
            {#if mine && id}<button class="pill {mine.status}" data-act="open" data-id={id}>{statusWord(mine.status, "anime")}</button>{:else}<button class="btn sm" data-act="seasonal-add" data-k={String(al)}>+ Plan</button>{/if}</span></div></div>{/each}</div></section>{/each}
