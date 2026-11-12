<!--
    src/features/insights/discover/DiscoverDialog.svelte
    ─────────────────────────────────────────────────────────────────
      Discover: five ways to find new things. Other versions (sequels, adaptations and spin-offs of what you loved, from
      AniList's relations and Wikidata), Fans also liked (AniList), Film & TV (TMDB), Games (RAWG) and Books from forums
      (DiscoverBooks), each with what it found, and links to search elsewhere.
      Which search, what it shows and what's left out are the dialog's state (ui.modal), set here with store.dialog();
      the searches themselves are in discover.ts and write their progress and results back there. Search ("disc-go") is
      this one's own; adding or dismissing what it found, Sync and Stop change your library or another dialog's work
      and stay with the handlers (insights/handlers.ts, core/nav-handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { store } from "../../core/store.svelte";
    import { entryOf, KEYS } from "../../core/core";
    import { TMDB_ON } from "../../sources/proxy";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import DiscoverBooks from "./DiscoverBooks.svelte";
    import GoBar from "./GoBar.svelte";
    import RecCard from "./RecCard.svelte";
    import SearchLinks from "./SearchLinks.svelte";
    import { DISC_MODES, discoverChoices, isBookShelf, isRec, topSeeds } from "../discover";
    import type { Modal, Recommendation } from "../../core/model";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "discover") return null;
        void store.items;
        const meta = store.meta,
            c = { ...m, ...discoverChoices(m) },
            copy = (L: unknown[] | null | undefined) => (L ? L.filter(isRec).map(r => ({ ...r })) : null);
        return {
            m: c,
            results: copy(c.results),
            local: copy(c.local) || [],
            wd: copy(c.wd),
            anilist: !!meta.profile.anilist,
            top: topSeeds(() => true, 1)[0],
            // the Books search's starting point, for its links
            seed: c.mode !== "books" ? null : c.seed === "auto" ? topSeeds(isBookShelf(c.shelf), 1)[0] : entryOf(c.seed || ""),
        };
    });
    // the dialog's own state starts with its choices made, and AniList's other versions found (once)
    untrack(() => {
        const m = store.ui.modal;
        if (m && m.kind === "discover") store.dialog(discoverChoices(m), m);
    });
    function choose(change: Partial<Modal>) {
        const m = store.ui.modal;
        if (m) store.dialog({ ...change, ...discoverChoices({ ...m, ...change }) }, m);
    }
    const TARGETS: Record<string, [string, string][]> = {
        fans: [
            ["any", "Everything"],
            ["anime", "Anime"],
            ["manga", "Manga"],
            ["manhwa", "Manhwa"],
            ["novel", "Light novels"],
        ],
        screen: [
            ["any", "Both"],
            ["film", "Films"],
            ["tv", "Shows"],
        ],
    };
</script>

{#if v}
    {@const m = v.m}
    <DialogHead title="Discover"><span class="hint dhint">From AniList, TMDB, RAWG, Wikidata, Reddit and forums.</span></DialogHead>
    <div class="tabs" role="tablist">{#each DISC_MODES as [k, l]}<button role="tab" aria-selected={m.mode === k} data-act="disc-mode" data-k={k} onclick={() => choose({ mode: k, results: null, error: "", target: "any" })}>{l}</button>{/each}</div>
    <div class="sec" style="border:0;padding-top:4px">{#if m.mode === "versions"}<p class="hint">Sequels, adaptations and spin-offs of what you've loved that aren't in your stacks yet: the anime of a manga you read, the manga an anime came from, the film of a book. AniList relations are instant; Wikidata covers films, shows, games and books.</p>
        {#if v.local.length}<p class="label">From AniList · {v.local.length}</p><div class="recs">{#each v.local as r, i}<RecCard {r} {i} list="local" />{/each}</div>{:else}<p class="hint">{v.anilist ? "Nothing missing from AniList's relations. Nice." : "Sync AniList to see the other versions of your anime and manga."}</p>{/if}
        <div class="sec" style="margin-top:6px"><p class="label">From Wikidata</p><GoBar {m} label={v.wd ? "Check again" : "Find adaptations of my favourites"} />
            {#if v.wd}{#if v.wd.length}<div class="recs">{#each v.wd as r, i}<RecCard {r} {i} list="wd" />{/each}</div>{:else}<p class="hint">Wikidata didn't list any adaptations you don't already have.</p>{/if}{/if}</div>{:else if m.mode === "fans" || m.mode === "screen" || m.mode === "games"}{#if m.mode === "fans"}<p class="hint">What AniList users recommend to people who liked your best-scored and favourite anime and manga, counted across all of them.</p>{:else if m.mode === "screen"}<p class="hint">{TMDB_ON() ? "TMDB's recommendations for your best-scored films, shows and anime, counted across all of them." : "TMDB's recommendations need a free key (Settings → Data sources). Without one, use Other versions for adaptations, or the search links below."}</p>{:else}<p class="hint">{KEYS.rawg ? "Highly rated games tagged with the genres and themes you score highest across books, anime and everything else." : "Game recommendations need a free RAWG key (Settings → Data sources). Without one, Other versions finds games based on things you love."}</p>{/if}
        {#if TARGETS[m.mode || ""]}<div class="bar"><span class="hint">Show</span><div class="seg">{#each TARGETS[m.mode || ""] as [k, l]}<button data-act="disc-target" data-k={k} aria-pressed={m.target === k} onclick={() => choose({ target: k, results: null })}>{l}</button>{/each}</div></div>
        {/if}<GoBar {m} label={v.results ? "Search again" : m.mode === "fans" ? "Find recommendations" : m.mode === "screen" ? "Find films and shows" : "Find games"} />{@render found(v.results)}{:else}<DiscoverBooks {m} {choose} />
        <GoBar {m} label={v.results ? "Search again" : "Find books"} />{@render found(v.results)}
        {#if v.seed && v.seed.title}<SearchLinks b={v.seed} />{/if}{/if}</div>
    {#if m.mode !== "books" && v.top}<SearchLinks b={v.top} />{/if}
{/if}

{#snippet found(list: Recommendation[] | null)}{#if list}{#if list.length}<div class="recs">{#each list as r, i}<RecCard {r} {i} />{/each}</div>{:else}<p class="hint">Nothing new turned up. Try another starting point.</p>{/if}{/if}{/snippet}
