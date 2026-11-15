<!--
    src/features/learning-centre/pages/CourseMap.svelte
    ─────────────────────────────────────────────────────────────────
      The map: a row for each topic (grouped by area), a column for each level (Foundations, Undergraduate, Master's,
      PhD), each book a small card in its cell coloured by where it's at. How much of each topic and each level is done
      is at the row's start and under each column. On a phone it's a list grouped by topic, each book tagged with its
      level. mapLook() in look.ts works it out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Course } from "../../core/model";
    import { mapLook } from "./look";
    import MapCard from "./MapCard.svelte";

    let { C }: { C: Course } = $props();

    const v = $derived(mapLook(C));
    const pct = (d: number, n: number) => (n ? Math.round((d / n) * 100) : 0);
</script>

{#if v.areas.length}<section class="lcmapw"><h3 class="pwh">The map <span class="lcn">{v.d}/{v.n} done</span></h3><p class="hint lcmapk"><i class="lck todo"></i>To read <i class="lck reading"></i>Reading <i class="lck done"></i>Done · hover or tap a book for what it needs and unlocks · ⋈ serves several topics</p>
    <div class="lcmap"><div class="lcmh"><span>Topic</span>{#each v.cols as c (c.l)}<span>{c.name}</span>{/each}</div>
        {#each v.areas as g (g.a)}<div class="lcarea"><span>{g.a}</span></div>
            {#each g.rows as r (r.id)}<div class="lcrow"><div class="lctop"><b>{r.name}</b><small>{r.d}/{r.n}</small><span class="lbar"><i style="width:{pct(r.d, r.n)}%"></i></span></div>{#each r.cells as cell, i (i)}<div class="lccell{cell.length ? '' : ' none'}">{#each cell as c (c.id)}<MapCard {c} />{/each}</div>{/each}</div>{/each}{/each}
        <div class="lcmf"><span>Done</span>{#each v.cols as c (c.l)}<span>{c.n ? `${c.d}/${c.n}` : "–"}</span>{/each}</div></div></section>{/if}
