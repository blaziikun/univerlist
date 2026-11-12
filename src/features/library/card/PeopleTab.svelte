<!--
    src/features/library/card/PeopleTab.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's Characters tab (who's in the story) and Cast tab (who plays or voices them): one list, fetched
      once from whichever free source knows it (library/item-actions.ts fetchCast), shown two ways. When the list is
      for another title of the same name, "Choose the right one" searches for the right one.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { norm } from "../../core/core";
    import { TMDB_ON } from "../../sources/proxy";
    import CharTile from "../tiles/CharTile.svelte";
    import { canFetchCast } from "../item";
    import { castFrom, castPickOpen } from "../item-actions";
    import type { CastMember, Entry, Modal } from "../../core/model";

    let { b, m, which }: { b: Entry; m: Modal; which: "chars" | "cast" } = $props();

    const cast = $derived(m.cast || []);
    const isVA = $derived(["anime", "game"].includes(b.medium));
    const from = $derived(m.cast && !b.ext.anilist ? castFrom.get(b.id) : undefined);
    // characters you saved from this, and whether one in the list is one of them (or a person one you saved)
    const mine = $derived(store.meta.chars.filter(c => (c.media || []).some(x => x.id === b.id || (x.alId && x.alId === (b.ext || {}).anilist))));
    const savedChar = (c: CastMember) =>
        store.meta.chars.find(x => (c.alId && x.alId === c.alId) || (!c.alId && norm(x.name) === norm(c.name) && (x.media || []).some(y => y.id === b.id)));
    const savedPerson = (n: string | undefined) => !!n && (store.meta.people || []).some(p => norm(p.name) === norm(n) && p.fav);

    let pickBox: HTMLInputElement | undefined = $state();
    const pickSearch = () => {
        const dm = store.ui.modal;
        if (dm) castPickOpen(dm, pickBox?.value ?? "");
    };
</script>

{#snippet source()}{#if m.cast && !b.ext.anilist}<div class="castsrc"><span class="hint">From {from?.src || "the free sources"}{from?.title ? ": " + from.title + (from.year ? " (" + from.year + ")" : "") : ""}.</span> <button class="linkbtn" data-act="cast-pick">{m.cast.length ? "Wrong title? Choose the right one" : "Find it by another name"}</button></div>
        {#if m.castPick}<div class="panel castpick"><div class="bar"><input class="inp" id="cp-q" value={m.castPick.q} style="flex:1" bind:this={pickBox} /><button class="btn sm" data-act="cast-pick-go" onclick={pickSearch}>Search</button><button class="linkbtn" data-act="cast-pick-close" onclick={() => store.dialog({ castPick: null })}>Close</button></div>
                {#if m.castPick.busy}<p class="think">Looking…</p>{:else if m.castPick.res.length}<div class="cplist">{#each m.castPick.res as r, i}<button class="cprow" data-act="cast-pick-use" data-k={i}><b>{r.title}</b><small>{r.sub}</small></button>{/each}</div>{:else}<p class="hint">Nothing found under that name.</p>{/if}</div>{/if}{/if}{/snippet}

{#if which === "chars"}
    {@const list = cast.filter(c => c.name)}
    {#if mine.length}<div class="sec"><p class="label">Your favourites from this</p><div class="favrow">{#each mine as c, i (i + c.id)}<CharTile {c} />{/each}</div></div>{/if}
    {#if !canFetchCast(b)}<p class="hint">No character list for this from the free sources. Add the ones you love yourself.</p>
    {:else if m.cast}<div class="sec"><p class="label">{list.length} characters</p><div class="castgrid">{#each list as c}{@const saved = !!savedChar(c)}<div class="castc">{#if c.image}<img src={c.image} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="noimg">{#if c.vaImage}<img class="vainset" src={c.vaImage} alt="" title={c.va || ""} loading="lazy" referrerpolicy="no-referrer" />{/if}{(c.name || "?").charAt(0)}</span>{/if}<span class="t">{c.name}</span><span class="hint">{c.src === "anilist" || !c.va ? c.role || "" : (c.role === "Voice" || b.medium === "game" ? "voiced by " : "played by ") + c.va}</span>
                        <button class="btn sm{saved ? ' favon' : ''}" data-act="cast-fav" data-k={cast.indexOf(c)}>{saved ? "♥ Saved" : "♡ Favourite"}</button></div>{/each}</div></div>
    {:else}<div class="bar"><button class="btn" data-act="cast-load" disabled={!!m.busy}>{m.busy === "cast" ? "Loading…" : "Show characters"}</button><span class="hint">From {b.ext.anilist ? "AniList" : b.medium === "tv" ? "TVmaze" + (TMDB_ON() ? " or TMDB" : "") : TMDB_ON() && b.ext.tmdb ? "TMDB" : "Wikidata"}. No key needed.</span></div>{/if}
    {#if m.cast && !list.length}<p class="hint">No characters listed for this yet{b.medium === "game" ? ": Wikidata covers the bigger games best" : ""}. Add the ones you love yourself.</p>{/if}{@render source()}
    <div class="bar"><button class="btn sm" data-act="char-add" data-from={b.id}>+ Add a character from this</button>{#if list.length}<button class="btn sm ghost" data-act="cast-tolist" data-k="chars">Put these characters in a list…</button>{/if}</div>
{:else if !canFetchCast(b)}<p class="hint">No cast list for this from the free sources{b.medium === "film" ? ". A free TMDB key adds film casts" : ""}.</p>
{:else if !m.cast}<div class="bar"><button class="btn" data-act="cast-load" disabled={!!m.busy}>{m.busy === "cast" ? "Loading…" : isVA ? "Show the voice cast" : "Show the cast"}</button></div>
{:else}
    {@const list = cast.filter(c => c.va)}
    {#if list.length}<div class="castgrid">{#each list as c}{@const img = c.vaImage || (c.src === "tmdb" ? c.image : "")}{@const saved = savedPerson(c.va)}<div class="castc">{#if img}<img src={img} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="noimg">{(c.va || "").charAt(0)}</span>{/if}<span class="t">{c.va}</span><span class="hint">{c.name ? "as " + c.name : c.role || ""}</span>
                    <button class="btn sm ghost{saved ? ' favon' : ''}" data-act="cast-person" data-k={cast.indexOf(c)}>{saved ? "♥ Saved" : "♡ " + (isVA ? "Voice actor" : "Actor")}</button></div>{/each}</div><div class="bar"><button class="btn sm ghost" data-act="cast-tolist" data-k="people">Put this cast in a list…</button></div>{@render source()}
    {:else}<p class="hint">No cast listed.</p>{@render source()}{/if}
{/if}
