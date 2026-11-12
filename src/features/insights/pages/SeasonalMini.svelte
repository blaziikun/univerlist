<!--
    src/features/insights/pages/SeasonalMini.svelte
    ─────────────────────────────────────────────────────────────────
      The overview's This season block: the season's TV anime (as This season shows them), each with where it is in
      your library or a way to plan it, and the way to the whole season.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { items, statusWord } from "../../core/core";
    import Pic from "../../core/dialog/Pic.svelte";
    import { alIndex, loadSeason, seasonKey, seasonState } from "../mode-pages";

    const v = $derived.by(() => {
        void store.ui;
        void store.itemsByFrame; // your library, taken in once a frame
        const byAl = alIndex();
        return {
            busy: seasonState.busy,
            err: seasonState.err,
            L: (seasonState.list || [])
                .filter(r => r.kind === "TV")
                .slice(0, 12)
                .map(r => {
                    const al = r.ext?.anilist;
                    return { r, al, mine: al ? items.get(byAl.get(al) || "") : undefined };
                }),
        };
    });
    // the season shown isn't the one kept, or nothing's been asked for yet: ask (after this draw, as the block did)
    $effect(() => {
        void store.ui;
        if (seasonState.key !== seasonKey() || (!seasonState.list && !seasonState.busy && !seasonState.err))
            setTimeout(() => loadSeason(), 0);
    });
</script>

{#if v.busy && !v.L.length}<p class="think">Reading this season…</p>{:else if v.L.length}<div class="strip">{#each v.L as { r, al, mine }, i (i)}<div class="smini">{#if r.cover}<Pic src={r.cover} loading="lazy" />{/if}<span class="t">{r.title}</span>{#if mine}<span class="pill {mine.status}">{statusWord(mine.status, "anime")}</span>{:else}<button class="btn sm" data-act="seasonal-add" data-k={al}>+ Plan</button>{/if}</div>{/each}</div><button class="linkbtn" data-act="tab" data-k="seasonal">The whole season</button>{:else}<p class="hint">{v.err || "Nothing yet."}</p>{/if}
