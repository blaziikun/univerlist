<!--
    src/features/library/stats/Taste.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › Your taste: what your scores say in plain words (downloadable as Markdown or JSON, taste-export), then
      the genres, themes, creators, types and decades you score above and below your average (tasteData, packs.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { tasteData, tasteSentences } from "../../import-export/packs";

    const t = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        const t = tasteData();
        return { ...t, words: tasteSentences(t).join(" ") };
    });
    type Rows = typeof t.genres;
</script>

{#snippet table(rows: Rows, label: string)}{#if rows.length}<table class="lib small"><thead><tr><th>{label}</th><th>Entries</th><th>Your mean</th><th>vs your average</th></tr></thead><tbody>{#each rows as x, i (i + x.k)}<tr><td>{x.k}</td><td class="num">{x.n}</td><td class="num">{x.mean.toFixed(1)}</td><td class="num lift {x.lift >= 0 ? 'up' : 'down'}">{x.lift >= 0 ? "+" : "−"}{Math.abs(x.lift).toFixed(1)}</td></tr>{/each}</tbody></table>{:else}<p class="hint">Not enough scored yet.</p>{/if}{/snippet}
<div class="dash">
    <section class="panel span12"><h3>In plain words · {t.mode}</h3><p class="taste">{t.words}</p>
        <div class="bar"><button class="btn sm" data-act="taste-export" data-k="md">Download as Markdown</button><button class="btn sm ghost" data-act="taste-export" data-k="json">As JSON</button><span class="hint">Copy the Markdown to use anywhere: it sums up what you like, in plain words.</span></div></section>
    <section class="panel span6"><h3>Genres that lift your scores</h3>{@render table(t.genres.slice(0, 12), "Genre")}</section>
    <section class="panel span6"><h3>Genres you score lower</h3>{@render table(t.genres.slice(-8).reverse(), "Genre")}</section>
    {#if t.themes.length}<section class="panel span6"><h3>Themes</h3>{@render table(t.themes.slice(0, 12), "Theme")}</section>{/if}
    <section class="panel span6"><h3>Creators and studios</h3>{@render table(t.creators.slice(0, 12), "Creator")}</section>
    <section class="panel span6"><h3>Types</h3>{@render table(t.types.slice(0, 10), "Type")}</section>
    {#if t.decades.length}<section class="panel span6"><h3>Decades</h3>{@render table(t.decades, "Decade")}</section>{/if}
</div>
