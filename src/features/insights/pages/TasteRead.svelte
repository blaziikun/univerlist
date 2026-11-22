<!--
    src/features/insights/pages/TasteRead.svelte
    ─────────────────────────────────────────────────────────────────
      Your taste, read closely (on the Insights page): what lifts your scores and what sinks them, the nuance inside your
      main genres, close cousins you scored far apart, and the mixes to go after more of, each with "Find more"
      (AniList's best-rated with exactly that mix, kept on ui.tasteMore). tasteView() in taste.ts works it out.
      Find more is this one's own; + Plan adds to your library ("taste-add", taste.ts tasteClick).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { fmtScore, MEDIA, scaleOf } from "../../core/core";
    import Cover from "../../library/tiles/Cover.svelte";
    import TitleLink from "./TitleLink.svelte";
    import { featName, nuanceLine, pairLine, tasteMore, tasteView } from "../taste";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        void store.ui;
        return tasteView();
    });
    const more = $derived({ ...(store.ui.tasteMore || {}) });
    const lift = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
</script>

{#if !v}<section class="panel span12 taste"><h3>Your taste</h3><p class="hint">Score at least a dozen things here and this turns into a reading of your taste: what lifts your scores, what sinks them, and the kinds of thing to go after next.</p></section>{:else}<section class="panel span12 taste"><h3>Your taste, read closely</h3><p class="hint">From {v.n} things you've scored here (your average is {fmtScore(Math.round(v.mean * 10) / 10)}). Numbers show how far each lifts or lowers your score.</p>
    <div class="tgrid">
        <div><p class="label">What lifts your scores</p><div class="tchips">{#each v.likes as x (x.f)}{@render chip(x)}{:else}<span class="hint">Nothing stands out yet.</span>{/each}</div>
            <p class="label" style="margin-top:12px">What tends to sink them</p><div class="tchips">{#each v.cools as x (x.f)}{@render chip(x)}{:else}<span class="hint">Nothing consistently.</span>{/each}</div></div>
        <div><p class="label">The nuance</p>{#each v.nu as x}<p class="tline"><b>{x.genre}</b>{#each nuanceLine(x) as p}{#if "t" in p}{p.t}{:else if "em" in p}<em>{p.em}</em>{:else}<TitleLink b={p.b} />{/if}{/each}</p>{:else}<p class="hint">Needs a few more scores inside your main genres.</p>{/each}</div>
    </div>
    {#if v.pairs.length}<p class="label" style="margin-top:14px">Close cousins, far apart</p><div class="tpairs">{#each v.pairs as p}<div class="tpair"><span><TitleLink b={p.a} /> <b class="hi">{fmtScore(p.a.rating, scaleOf(p.a))}</b></span><span class="vs">vs</span><span><TitleLink b={p.b} /> <b class="lo">{fmtScore(p.b.rating, scaleOf(p.b))}</b></span>
        <small>{pairLine(p)}</small></div>{/each}</div>{/if}
    {#if v.cl.length}<p class="label" style="margin-top:14px">Go after more of</p><div class="tclusters">{#each v.cl as c, i}<div class="tcl"><b>{c.parts.map(featName).join(" + ")}</b><small>{c.n} of your favourites, like {#each c.items.slice(0, 3) as b, j}{j ? ", " : ""}<TitleLink {b} />{/each}</small>
        <button class="btn sm" data-act="taste-more" data-k={i} onclick={() => tasteMore(i)}>Find more</button>{#if more[i]}{@const st = more[i]}{#if st.busy}<p class="think">Asking AniList for the best-rated with this mix…</p>{:else if st.err}<p class="hint">{st.err}</p>{:else if st.res.length}<div class="recs compact">{#each st.res.slice(0, 8) as r}<div class="rec"><Cover b={{ title: r.title, medium: r.medium, cover: r.cover }} /><div class="rt"><b>{r.title}</b><small>{[(MEDIA[r.medium || ""] || MEDIA.anime).one, r.year, r.scores && r.scores.anilist ? r.scores.anilist + "%" : ""].filter(Boolean).join(" · ")}</small></div><button class="btn sm" data-act="taste-add" data-k={String(r.ext?.anilist ?? "")}>+ Plan</button></div>{/each}</div>{:else}<p class="hint">Nothing new with exactly this mix.</p>{/if}{/if}</div>{/each}</div>{/if}</section>{/if}

{#snippet chip(x: { name: string; n: number; avg: number; lift: number })}<span class="tchip2 {x.lift > 0 ? 'up' : 'down'}" title="{x.n} scored · average {fmtScore(x.avg)}">{x.name}<b>{x.lift > 0 ? "+" : ""}{lift(x.lift)}</b></span>{/snippet}
