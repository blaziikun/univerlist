<!--
    src/features/library/people/AddCharacter.svelte
    ─────────────────────────────────────────────────────────────────
      Add a character: search AniList's characters and save one ("cs-add", library/people-handlers.ts), or add one
      yourself with a name, the title they're from and a picture link. Opened by "char-add", from a title when it's
      the item card's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { caretAtStart } from "../../core/dialog/caret";
    import { store } from "../../core/store.svelte";
    import { isRecord, listOf, MEDIA, nowISO, titleOf } from "../../core/core";
    import { all } from "../../core/views";
    import { closeModal } from "../../core/modals";
    import { idFromOption, titleKey } from "../../core/navigation";
    import { alCharSearch } from "../../sources/sources";
    import DialogHead from "../../core/dialog/DialogHead.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import { addChar } from "../item-actions";

    const m = $derived.by(() => {
        void store.meta; // "♥ Saved" once it's added
        const m = store.ui.modal;
        return m && m.kind === "charadd" ? { ...m, results: m.results && [...m.results] } : null;
    });
    const open = store.ui.modal,
        start = open?.from ? store.item(open.from) : undefined;
    let q = $state(open?.q || ""),
        name = $state(""),
        from = $state(start ? titleOf(start) + " · " + MEDIA[start.medium].one : ""),
        img = $state("");
    const opts = $derived(all().map(x => `${titleOf(x)} · ${MEDIA[x.medium].one}`));

    async function search() {
        const s = q.trim(),
            live = store.ui.modal;
        if (!s) return;
        store.dialog({ q: s, busy: true, error: "" });
        try {
            store.dialog({ busy: false, results: await alCharSearch(s) }, live);
        } catch (_) {
            store.dialog({ busy: false, error: "Couldn't reach AniList." }, live);
        }
    }
    function addMine() {
        const n = name.trim();
        if (!n) return;
        const fid = idFromOption(from),
            it = fid ? store.item(fid) : undefined;
        addChar({
            id: "c" + Date.now().toString(36),
            name: n,
            image: img.trim(),
            media: it && fid ? [{ id: fid, title: titleOf(it), medium: it.medium }] : from.trim() ? [{ id: null, title: titleKey(from), medium: "" }] : [],
            why: "",
            tags: [],
            addedAt: nowISO(),
        });
        closeModal();
    }
</script>

{#if m}
    <DialogHead title="Add a character" />
    <!-- svelte-ignore a11y_autofocus: the search box is where you start -->
    <div class="bar"><input class="inp" id="cs-q" autofocus placeholder="Search AniList characters, e.g. Ranpo Edogawa" bind:value={q} use:caretAtStart style="max-width:360px" onkeydown={e => { if (e.key === "Enter") { e.preventDefault(); search(); } }}><button class="btn gold" data-act="cs-search" disabled={!!m.busy} onclick={search}>{m.busy ? "Searching…" : "Search"}</button></div>
    {#if m.error}<p class="err">{m.error}</p>{/if}
    {#if m.results}{#if m.results.length}<div class="castgrid">{#each m.results as c, i}{#if isRecord(c)}<div class="castc">{#if c.image}<Pic src={String(c.image)} />{:else}<span class="noimg">{String(c.name).charAt(0)}</span>{/if}<span class="t">{c.name}</span><span class="hint">{listOf(c.media).map(x => (isRecord(x) ? x.title : undefined)).slice(0, 2).join(" · ")}</span><button class="btn sm" data-act="cs-add" data-k={i}>{store.meta.chars.some(x => x.alId === c.alId) ? "♥ Saved" : "♡ Add"}</button></div>{/if}{/each}</div>{:else}<p class="hint">No characters found.</p>{/if}{/if}
    <div class="sec"><p class="label">Or add one yourself</p><div class="fields"><div class="field"><label for="cm-name">Name</label><input id="cm-name" bind:value={name}></div><div class="field"><label for="cm-from">From</label><input id="cm-from" list="cm-opts" bind:value={from}><datalist id="cm-opts">{#each opts as o}<option value={o}></option>{/each}</datalist></div>
        <div class="field full"><label for="cm-img">Picture link (optional)</label><input id="cm-img" placeholder="https://…" bind:value={img}></div></div><div class="bar"><button class="btn" data-act="cm-add" onclick={addMine}>Add character</button></div></div>
{/if}
