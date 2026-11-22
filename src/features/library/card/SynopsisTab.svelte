<!--
    src/features/library/card/SynopsisTab.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's first tab: what it is first (its parts, the synopsis, genres and themes), then where you are with
      it (ItemProgress), then your own words: why, tags, notes, scores from sites with no API, links elsewhere
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { items, patch, safeUrl, toast } from "../../core/core";
    import { MANUAL_SCORES, SCORE_DEF } from "../../core/views";
    import { partsOf } from "../../core/parts";
    import { genreDesc } from "../../core/modals";
    import { linksOut } from "../../sources/sources";
    import { addTagTo } from "../item-actions";
    import type { Entry, Modal } from "../../core/model";
    import ItemParts from "./ItemParts.svelte";
    import ItemProgress from "./ItemProgress.svelte";

    let { b, m }: { b: Entry; m: Modal } = $props();

    const manual = $derived(MANUAL_SCORES[b.medium] || []);
    const tags = $derived(store.meta.tags);
    const showParts = $derived(partsOf(b).length > 0 || (["anime", "tv", "manga", "manhwa", "novel", "book", "comic", "game", "film"].includes(b.medium) && !!m.partsOpen));

    // Enter adds what's typed as a tag, and the box empties for the next one
    function tagKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        addTagTo(b.id, e.currentTarget.value);
        e.currentTarget.value = "";
    }
    function notes(v: string) {
        if ((items.get(b.id) || {}).notes === v) return;
        patch(b.id, { notes: v }, "Edit notes");
        toast("Notes saved");
    }
    function manualScore(k: string, typed: string) {
        const v = parseFloat(typed),
            scores = { ...items.get(b.id)?.scores };
        // a score cleared is left out (as it always was: it isn't saved)
        if (Number.isFinite(v)) scores[k] = v;
        else delete scores[k];
        patch(b.id, { scores }, "Add a score");
    }
</script>

{#snippet sec(label: string, text: unknown)}{#if text}<div class="sec"><p class="label">{label}</p><p>{text}</p></div>{/if}{/snippet}

{#if showParts}<ItemParts {b} />{/if}{#if b.about}<div class="sec"><p class="synop">{b.about}</p></div>{:else}<p class="hint">No summary yet. <button class="linkbtn" data-act="item-refresh">Fetch one</button> or add it in Edit details.</p>{/if}
{#if (b.genres || []).length}<div class="sec gensec"><span class="label">Genres</span><div class="chips">{#each b.genres as g}<button class="chip" data-act="go-genre" data-k={g} title={genreDesc(g) || undefined}>{g}</button>{/each}</div></div>{/if}
{#if b.themes?.length}<details class="sec themesec"><summary class="label">Themes · {b.themes.length}</summary><div class="chips">{#each b.themes as g}<span class="chip ghostchip">{g}</span>{/each}</div></details>{/if}
<ItemProgress {b} {m} />
{@render sec("Why it's for you", b.why)}{#if b.favWhy}{@render sec("Why it's a favourite", b.favWhy)}{/if}{#if b.cw}<div class="sec"><p class="label">Content note</p><p style="color:var(--warn)">{b.cw}</p></div>{/if}
<div class="sec"><p class="label">Tags</p><div class="tagedit">{#each b.tags || [] as t}<span class="tag"><i style="background:{tags[t]?.color || 'var(--muted)'}"></i>{t}<button data-act="untag" data-k={t} aria-label="Remove {t}">✕</button></span>{/each}
        <input class="inp" id="tag-in" list="tag-opts" placeholder="Add a tag, press Enter" onkeydown={tagKey} /><datalist id="tag-opts">{#each Object.keys(tags).filter(t => !(b.tags || []).includes(t)).sort() as t}<option value={t}></option>{/each}</datalist></div></div>
<div class="sec"><p class="label">Notes</p><textarea id="notes" placeholder="Anything: where you heard of it, what you thought…" value={b.notes || ""} onchange={e => notes(e.currentTarget.value)}></textarea></div>
{#if manual.length}<div class="sec"><p class="label">Scores from sites without an API</p><div class="bar">{#each manual as k}<label class="ctl">{SCORE_DEF[k][0]} <input class="inp" data-mscore={k} inputmode="decimal" style="width:70px" value={(b.scores || {})[k] ?? ""} placeholder={["mdl", "serializd"].includes(k) ? "/10" : "/5"} onchange={e => manualScore(k, e.currentTarget.value)} /></label>{/each}</div></div>{/if}
{#if store.meta.settings.showLinks}<div class="sec"><p class="label">Elsewhere</p><p class="links">{#each linksOut(b) as [l, u], i}{#if i}{" · "}{/if}<a class="link" href={safeUrl(u)} target="_blank" rel="noopener">{l} ↗</a>{/each}</p></div>{/if}{#if b.ext && b.ext.rawg}
    <!-- RAWG's terms ask for a visible credit, with a link, wherever its data is shown; IGDB gets the same -->
    <p class="hint credit">Game details from <a class="link" href="https://rawg.io/games/{String(b.ext.rawgSlug || b.ext.rawg)}" target="_blank" rel="noopener">RAWG</a></p>
{:else if b.ext && b.ext.igdb && b.ext.igdbSlug}<p class="hint credit">Game details from <a class="link" href="https://www.igdb.com/games/{String(b.ext.igdbSlug)}" target="_blank" rel="noopener">IGDB</a></p>{/if}
