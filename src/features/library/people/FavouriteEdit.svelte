<!--
    src/features/library/people/FavouriteEdit.svelte
    ─────────────────────────────────────────────────────────────────
      A favourite: why it's one, and the picture it shows on your profile (its cover, its banner, pictures the
      catalogues have, one you upload or link). Opened by "fav-edit". Finding pictures and choosing one are
      library/people-handlers.ts's (fv-load, fv-pick, fv-clear, fv-upload); the link and "why" are typed here.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { entryOf, patch, titleOf, toast } from "../../core/core";
    import { closeModal } from "../../core/modals";
    import { caretAtStart } from "../../core/dialog/caret";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Pic from "../../core/dialog/Pic.svelte";

    const v = $derived.by(() => {
        void store.items;
        const m = store.ui.modal,
            b = m && m.kind === "favedit" ? entryOf(m.id || "") : null;
        return m && b ? { m: { ...m, art: m.art && [...m.art] }, b } : null;
    });
    const first = entryOf(store.ui.modal?.id || "");
    let why = $state(first?.favWhy || ""),
        url = $state("");
    function useLink() {
        const u = url.trim();
        if (v && /^https?:\/\//.test(u)) patch(v.b.id, { favArt: u, favArtData: "" }, "Favourite picture");
    }
    function save() {
        if (!v) return;
        patch(v.b.id, { favWhy: why.trim() }, "Why it's a favourite");
        closeModal();
        toast("Saved");
    }
</script>

{#if v}
    {@const { m, b } = v}
    {@const pics = [{ cover: b.cover, label: "Cover" }, b.banner ? { cover: b.banner, label: "Banner", wide: true } : null, ...(m.art || [])].filter((c): c is { cover: string; label: string; wide?: boolean } => !!c && !!c.cover).filter((c, i, a) => a.findIndex(x => x.cover === c.cover) === i)}
    <DialogHead title={"Favourite: " + titleOf(b)} />
    <!-- svelte-ignore a11y_autofocus: "why" is where you start -->
    <div class="sec"><p class="label">Why it's a favourite</p><textarea id="fv-why" autofocus placeholder="What it did to you, the moment it clicked, why it stays with you…" bind:value={why} use:caretAtStart></textarea></div>
    <div class="sec"><p class="label">The picture it shows on your profile</p>
        <div class="bar"><button class="btn" data-act="fv-load" disabled={!!m.busy}>{m.busy ? "Searching…" : m.art ? "Search again" : "Find pictures"}</button><button class="btn" data-act="fv-upload">Upload</button><input class="inp" id="fv-url" placeholder="…or paste an image link" style="max-width:240px" bind:value={url}><button class="btn sm" data-act="fv-url" onclick={useLink}>Use link</button>{#if b.favArt || b.favArtData}<button class="btn sm ghost" data-act="fv-clear">Use the cover</button>{/if}</div>
        <div class="covergrid">{#each pics as c}<button class="cg{(b.favArt || b.cover) === c.cover ? ' on' : ''}{c.wide ? ' wide' : ''}" data-act="fv-pick" data-url={c.cover}><Pic src={c.cover} loading="lazy" /><span>{c.label}</span></button>{/each}</div></div>
    <div class="bar"><button class="btn gold" data-act="fv-save" onclick={save}>Save</button></div>
{/if}
