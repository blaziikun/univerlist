<!--
    src/features/core/shell/Search.svelte
    ─────────────────────────────────────────────────────────────────
      The search box, over a dimmed page: what you type finds things in your library at once and on the web a moment
      later, in a column for each kind of thing (Culture, Literature, Film & TV, Games, Music), split by type inside;
      ＋ adds a result straight in, as what's picked in the bar above; characters and lists that match; and a way to
      add it yourself. ↑ ↓ move through every row, Enter opens the one marked, Escape closes. What it shows comes from
      searchView() in core/search.ts, which keeps the rows in order for the keys (GS.rows); its typing, keys and presses
      are handed to searchTyped, searchKey and searchPress there (presses before anything else gets them, so the box
      keeps focus). Mounted in #gs (renderTop in core/shell.ts), which opens and closes around it.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../Icon.svelte";
    import { type SearchRow, searchKey, searchPress, searchTyped, searchView } from "../search";
    import { shellNews } from "./shell-state.svelte";
    import Pic from "../dialog/Pic.svelte";
    import Cover from "../../library/tiles/Cover.svelte";

    const v = $derived.by(() => {
        void shellNews.search;
        return searchView();
    });
    function keys(e: KeyboardEvent) {
        if (e.target instanceof Element && e.target.id === "gq") searchKey(e);
    }
</script>

<svelte:document onkeydowncapture={keys} onpointerdowncapture={searchPress} />

{#snippet row(r: SearchRow)}<!-- svelte-ignore a11y_role_has_required_aria_props --><div class="gsr{r.on ? ' on' : ''} {r.t === 'mine' || r.t === 'web' ? r.t : 'chip'}" data-gs={r.i} role="option">{#if r.t === "mine"}<span class="gsc"><Cover b={r.b} /></span><span class="gst"><b>{r.title}</b><small>{r.meta}</small></span>{#if r.score}<span class="gss">{r.score}</span>{:else}<span class="gsin">✓</span>{/if}{:else if r.t === "web"}<span class="gsc">{#if r.r.cover}<Pic src={r.r.cover} loading="lazy" />{:else}<span class="nocov"></span>{/if}</span><span class="gst"><b>{r.r.title}</b><small>{r.meta}</small></span>{#if r.adding}<span class="gsadd busy" aria-label="Adding"></span>{:else}<button class="gsadd" type="button" tabindex="-1" data-gsq={r.q} title="Add as {r.add} (click the row to fill in details)" aria-label="Quick add {r.r.title}"><Icon name="plus" /></button>{/if}{:else if r.t === "char"}<span class="gsc round">{#if r.img}<Pic src={r.img} />{/if}</span><span class="gst"><b>{r.name}</b><small>Character</small></span>{:else if r.t === "list"}<span class="gsi">{r.ic}</span><span class="gst"><b>{r.name}</b><small>List</small></span>{:else}<span class="gsi"><Icon name="plus" /></span><span class="gst"><b>Add “{r.q}” yourself</b></span>{/if}</div>{/snippet}
<div class="gsbox"><span class="gsic"><Icon name="search" /></span><input id="gq" placeholder="Search your library and the web" autocomplete="off" spellcheck="false" aria-label="Search" oninput={e => searchTyped(e.currentTarget.value)}><button class="gsx" type="button" tabindex="-1" data-act="search-close" aria-label="Clear or close search" title="Clear (Esc closes)"><Icon name="x" /></button></div><div class="gsres" id="gsres" hidden={!v}>{#if v}<div class="gsbar"><span class="hint">＋ adds straight to</span>{#each v.qs as c (c.k)}<button class="chip" data-gsqs={c.k} aria-pressed={c.on}>{c.word}</button>{/each}<span class="spacer"></span><span class="hint">↑↓ to move · Enter to open · Esc to close</span></div><div class="gscols">{#each v.cols as c (c.k)}<div class="gscol{c.here ? ' here' : ''}"><div class="gsg">{c.name}{#if c.busy}<span class="hint">{c.busy}</span>{:else if c.retry}<button class="linkbtn" data-gsretry={c.k}>slow · try again</button>{/if}</div>{#each c.parts as p, j (j)}{#if p.sl}<div class="gssub">{p.sl}</div>{/if}{#each p.rows as r (r.i)}{@render row(r)}{/each}{/each}{#if c.none}<p class="hint gsp">{c.none}</p>{/if}{#if c.more}<button class="gsmore" data-gsmore={c.k}>{c.more}</button>{/if}</div>{/each}</div>{" "}{#if v.extra.length}<div class="gsextra">{#each v.extra as r (r.i)}{@render row(r)}{/each}</div>{" "}{/if}<div class="gsfoot">{@render row(v.add)}{#if v.links}<span class="gslinks">{#each v.links as l, i (i)}<a class="chip" href={l.url} target="_blank" rel="noopener noreferrer">{l.name} ↗</a>{/each}</span>{:else}<span class="hint">↑ ↓ to move · Enter to open · + to add</span>{/if}</div>{/if}</div>
