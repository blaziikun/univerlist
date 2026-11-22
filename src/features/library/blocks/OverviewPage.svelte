<!--
    src/features/library/blocks/OverviewPage.svelte
    ─────────────────────────────────────────────────────────────────
      A mode's Overview tab: its blocks (BlockGrid, with the mode's entries and profile), or, with nothing in the mode
      yet, a welcome with the ways to add things. Opening another mode draws its overview afresh (its numbers count up
      the first time).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { curMode, items } from "../../core/core";
    import { modeItems } from "../../core/views";
    import { modeProfile } from "../../core/shell";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import { BLOCKS } from "../blocks";
    import BlockGrid from "./BlockGrid.svelte";
    import { OV_VIEWS } from "./views";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        const u = store.ui,
            mode = curMode();
        return {
            key: mode.id + (u.private ? "p" : ""),
            mode,
            base: { M: modeItems(), mp: modeProfile(mode) },
            private: !!u.private,
            fresh: !!store.meta.settings.fresh && !items.size,
            named: !!store.meta.profile.name,
        };
    });
</script>

<HiddenNote />
{#if !v.base.M.length && !v.private}<div class="empty hello"><h3>{v.fresh ? "Welcome. Start with anything." : `Nothing in ${v.mode.name} yet`}</h3><p>Search for a book, show, film, game or anime (the magnifier at the top right) and press +. Or bring in what you already track: an AniList or Letterboxd profile link, or an export file.</p>
    <div class="bar" style="justify-content:center"><button class="btn gold" data-act="focus-search">Search to add</button><button class="btn" data-act="go-settings" data-k="io">Import</button>{#if !v.named}<button class="btn ghost" data-act="profile-edit" data-k={v.mode.id}>Add your name and picture</button>{/if}</div></div>{:else}{#key v.key}<BlockGrid kind="ov" reg={BLOCKS} base={v.base} views={OV_VIEWS} />{/key}{/if}
