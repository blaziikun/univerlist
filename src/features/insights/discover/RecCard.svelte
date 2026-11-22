<!--
    src/features/insights/discover/RecCard.svelte
    ─────────────────────────────────────────────────────────────────
      Something Discover found: its cover, what it is, why it's suggested, where it was mentioned and where to read
      about it, and "+ Add as planned" or "Not for me" ("rec-add", "rec-no", insights/handlers.ts, which find it by
      its place in its list: the main results, AniList's other versions "local", or Wikidata's "wd").
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import MediumDot from "../../library/tiles/MediumDot.svelte";
    import { MEDIA, safeUrl } from "../../core/core";
    
    import Cover from "../../library/tiles/Cover.svelte";
    import type { Recommendation } from "../../core/model";

    let { r, i, list = "r" }: { r: Recommendation; i: number; list?: string } = $props();
    const md = $derived(r.medium || "book");
</script>

<div class="rec"><Cover b={{ title: r.title, creator: r.creator || r.author, medium: md, cover: r.cover, year: r.year }} />
    <div><div class="eyebrow" style="font-size:9.5px"><MediumDot m={md} />{MEDIA[md] ? MEDIA[md].one : md}{r.kind ? " · " + r.kind : ""}</div><div class="t">{r.title}</div><div class="hint">{r.creator || r.author || ""}{r.year ? " · " + r.year : ""}{r.pages ? " · " + r.pages + " pp" : ""}{r.verified === false ? " · not matched on Open Library" : ""}</div>
        <p class="why">{r.reason || ""}</p>
        {#if r.threads && r.threads.length}<p>{#each r.threads.slice(0, 3) as t, j}{#if j}<br>{/if}<a class="link" href={safeUrl(t.url)} target="_blank" rel="noopener">{t.label} ↗</a>{/each}</p>{/if}
        {#if r.olKey}<p><a class="link" href="https://openlibrary.org{r.olKey}" target="_blank" rel="noopener">Open Library ↗</a></p>{:else if r.wikidata}<p><a class="link" href={safeUrl(r.wikidata)} target="_blank" rel="noopener">Wikidata ↗</a></p>{:else if r.qid}<p><a class="link" href="https://www.wikidata.org/wiki/{r.qid}" target="_blank" rel="noopener">Wikidata ↗</a></p>{/if}
        <div class="bar" style="margin-top:8px">{#if r.added}<span class="pill own">Added</span>{:else if r.dismissed}<span class="pill">Dismissed</span>{:else}<button class="btn gold" data-act="rec-add" data-k={i} data-list={list}>+ Add as planned</button><button class="btn ghost" data-act="rec-no" data-k={i} data-list={list}>Not for me</button>{/if}</div></div></div>
