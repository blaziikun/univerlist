<!--
    src/features/import-export/PasteList.svelte
    ─────────────────────────────────────────────────────────────────
      Paste a list: one title per line, from anywhere (Serializd, a notes app). What they are, their type, the status
      they come in with and a tag; Check shows what was read, and Import looks each one up (smartimport.ts).
      What was last checked is the dialog's state (ui.modal.text, .medium, .status…); the boxes are this one's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../core/store.svelte";
    import { findExisting, KINDS, MEDIA, MEDIA_KEYS, plural, STATUS, STATUS_WORDS } from "../core/core";
    import { caretAtStart } from "../core/dialog/caret";
    import DialogHead from "../core/dialog/DialogHead.svelte";
    import { parsePasted } from "./importers";
    import { smartImport } from "./smartimport";

    const m = $derived.by(() => {
        const m = store.ui.modal;
        return m && m.kind === "paste" ? { ...m } : null;
    });
    const open = store.ui.modal;
    let text = $state(open?.text || ""),
        medium = $state(open?.medium || "tv"),
        ikind = $state(open?.ikind || ""),
        status = $state(open?.status || "done"),
        tag = $state(open?.tag ?? ((open?.medium || "tv") === "tv" ? "Serializd" : ""));
    // what's read from the text as last checked
    const parsed = $derived(m && m.text ? parsePasted(m.text, m.medium || "tv", m.status || "done") : []);
    const words = $derived(STATUS_WORDS[MEDIA[medium].group]);

    /** the boxes, into the dialog: what Check shows, and what Import brings */
    function check() {
        store.dialog({ text, medium, ikind, status, tag: tag.trim() });
    }
    function bring() {
        check();
        const list = parsePasted(text, medium, status).map(x => ({ ...x, kind: ikind || "", tags: tag.trim() ? [tag.trim()] : [] }));
        if (list.length) smartImport("a pasted list", list);
    }
</script>

{#if m}
    <DialogHead title="Paste a list" />
    <p class="hint">One title per line. A year in brackets and a score at the end are picked up too: <code>Severance (2022) - 9</code> or <code>Arcane — 4.5/5</code>. Bullets and numbering are ignored. From Serializd: open your profile, select the show titles and copy them.</p>
    <div class="bar"><label class="ctl">These are <select class="sel" id="ps-medium" onchange={e => { medium = e.currentTarget.value; ikind = ""; check(); }}>{#each MEDIA_KEYS as k}<option value={k} selected={k === medium}>{MEDIA[k].name}</option>{/each}</select></label>
        <label class="ctl">Type <select class="sel" id="ps-kind" onchange={e => (ikind = e.currentTarget.value)}><option value="">Decide later</option>{#each KINDS[medium] as k}<option selected={ikind === k}>{k}</option>{/each}</select></label>
        <label class="ctl">Mark as <select class="sel" id="ps-status" onchange={e => (status = e.currentTarget.value)}>{#each STATUS as k}<option value={k} selected={k === status}>{words[k]}</option>{/each}</select></label>
        <label class="ctl">Tag <input class="inp" id="ps-tag" bind:value={tag} style="width:120px"></label></div>
    <!-- svelte-ignore a11y_autofocus: the list is where you start -->
    <textarea id="ps-text" style="min-height:180px" placeholder={"Severance (2022) - 9\nThe Bear\nArcane — 4.5/5"} autofocus bind:value={text} use:caretAtStart></textarea>
    {#if parsed.length}<p class="hint">{plural(parsed.length, "title")} · {parsed.filter(x => findExisting(x.title, "", m.medium || "tv")).length} already in your library (they'll be updated, not duplicated) · {parsed.filter(x => x.rating).length} with scores.</p>
        <div class="mini" style="max-height:180px;overflow:auto">{#each parsed.slice(0, 30) as x}<div class="lrow"><span class="t">{x.title}</span><span class="hint">{[x.year, x.rating ? x.rating + "/10" : ""].filter(Boolean).join(" · ")}</span></div>{/each}</div>{/if}
    <div class="bar"><button class="btn" data-act="ps-preview" onclick={check}>Check</button><button class="btn gold" data-act="ps-import" onclick={bring}>Import {parsed.length || ""}</button></div>
    <p class="hint">Artwork, details and crowd scores fill in afterwards in the background.</p>
{/if}
