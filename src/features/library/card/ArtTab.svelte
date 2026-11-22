<!--
    src/features/library/card/ArtTab.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's Art: every picture the catalogues have for it (kept from the last search), to use as its cover,
      banner, favourite picture or spine; or a picture or link of your own, the framing, and the spine on the shelf
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { coverCache, patch, toast } from "../../core/core";
    import { ago } from "../../core/views";
    import { cacheAndColour, coverSrc, updateItemTiles } from "../../sources/covers";
    import type { Entry, Modal } from "../../core/model";

    let { b, m }: { b: Entry; m: Modal } = $props();

    // the pictures from the last search are shown until you search again (pick-art reads them from the dialog)
    const kept = $derived(!m.art && !m.busy && b.artSeen && b.artSeen.length ? b.artSeen : null);
    const art = $derived(m.art || kept);
    const saved = $derived(kept ? b.artAt : m.artSaved);
    $effect(() => {
        if (kept) store.dialog({ art: kept.slice(), artSaved: b.artAt });
    });

    let link = $state("");
    function useLink() {
        const u = link.trim();
        if (!/^https?:\/\//.test(u)) {
            toast("Paste a link that starts with https://");
            return;
        }
        const id = b.id;
        patch(id, { cover: u, coverData: null, coverColor: null, color: null, coverPicked: true }, "Change cover");
        cacheAndColour(id).then(() => updateItemTiles(id));
        link = "";
    }
</script>

<div class="bar"><button class="btn" data-act="find-art" disabled={!!m.busy}>{m.busy === "art" ? "Searching…" : art ? "Search again" : "See all artwork"}</button>
    <button class="btn" data-act="cover-photo">Upload a picture</button><input class="inp" id="art-url" placeholder="…or paste an image link" style="max-width:240px" bind:value={link} /><button class="btn sm" data-act="art-url" onclick={useLink}>Use link</button>
    {#if coverSrc(b)}<button class="btn" data-act="frame-open" data-src={b.coverData || b.cover} data-k={JSON.stringify({ t: "cover", id: b.id })}>Adjust framing</button><button class="btn ghost" data-act="uncover">Remove cover</button>{/if}{#if b.coverData && b.cover}<button class="btn ghost" data-act="cover-original">Use the original</button>{/if}</div>
<div class="spinerow">{#if b.spineArt}<span class="spinepv" style="background-image:url('{coverCache.src(b.spineArt).replace(/'/g, '%27')}')" title="Its spine"></span>{/if}<span class="hint">{b.spineArt ? (b.spinePicked ? "Your own spine." : "A real spine scan.") : "The spine on the shelf is cut from the cover."}</span>
    <button class="btn sm" data-act="spine-upload">Upload a spine…</button>{#if b.spineArt}<button class="btn sm ghost" data-act="spine-clear">Cut it from the cover instead</button>{/if}<span class="hint">or use any picture below as the spine.</span></div>
<p class="hint">Paste an image while this card is open to use it as the cover. Pictures you choose are never replaced by syncs.</p>
{#if m.busy === "art"}<p class="think">{m.status || "Searching every source…"}</p>{/if}
{#if art}{#if art.length}<p class="label">Artwork ({art.length}){#if saved}{" "}<span class="hint">· saved from your last search, {ago(saved)}</span>{/if}</p><div class="covergrid">{#each art as c, i}<div class="cg{b.cover === c.cover ? ' on' : ''}{c.wide ? ' wide' : ''}"><img src={c.cover} alt={c.label} loading="lazy" referrerpolicy="no-referrer" /><span>{c.label}</span>
                <span class="cgb"><button class="btn sm" data-act="pick-art" data-k={i} data-as="cover">Cover</button>{#if c.wide}<button class="btn sm" data-act="pick-art" data-k={i} data-as="banner">Banner</button>{/if}<button class="btn sm" data-act="pick-art" data-k={i} data-as="fav">Favourite pic</button><button class="btn sm" data-act="pick-art" data-k={i} data-as="spine">Spine</button></span></div>{/each}</div>
    {:else}<p class="hint">No artwork found. Upload a picture instead.</p>{/if}{/if}
