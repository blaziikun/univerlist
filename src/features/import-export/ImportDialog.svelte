<!--
    src/features/import-export/ImportDialog.svelte
    ─────────────────────────────────────────────────────────────────
      Import: choose a file (or paste a list), then see what it holds. A UniverList pack or backup lists its parts to
      tick, the passphrase for its sealed keys and private extensions, and how to bring extensions in; Merge or
      Replace (import-export/handlers.ts) bring the ticked parts in. A list from another site (Goodreads, Letterboxd…)
      says how many are new, and imports them.

      The file has been read and checked by then (handleImportFile, core/actions.ts: readImportFile and its guards);
      bringing it in checks every part again (packs.ts applyParts, events.ts runImport). What's ticked, the
      passphrase and the extensions' choice are the dialog's state (ui.modal.sel, .keypass, .extHow), which Merge and
      Replace read.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../core/store.svelte";
    import { fmtDate, isRecord, KINDS, plural } from "../core/core";
    import { runImport } from "../core/events";
    import DialogHead from "../core/dialog/DialogHead.svelte";
    import { partCount, PARTS } from "./packs";

    const v = $derived.by(() => {
        const m = store.ui.modal;
        if (!m || m.kind !== "io") return null;
        const p = m.preview,
            parts: Record<string, unknown> = (p && p.parts) || {};
        return {
            m: { ...m },
            p,
            parts,
            locked: isRecord(parts.keys) && !!parts.keys.__locked,
            list: (p && p.items) || [],
            bundle: p && p.kind === "bundle" ? PARTS.filter(([k]) => parts[k] && partCount(k, parts[k])) : [],
        };
    });
    // a pack's parts are all ticked to begin with, apart from the private collection
    $effect.pre(() => {
        if (v && v.p && v.p.kind === "bundle" && (!v.m.sel || v.m.sel instanceof Set))
            store.dialog({ sel: Object.fromEntries(v.bundle.map(([k]) => [k, k !== "private"])) });
    });
    const sel = $derived(v && v.m.sel && !(v.m.sel instanceof Set) ? v.m.sel : {});
    let bookKind = $state(KINDS.book[0]);
</script>

{#if v}
    {@const { m, p, parts, list } = v}
    <DialogHead title="Import" />
    {#if p}{#if p.kind === "bundle"}<div class="panel"><p><b>{p.name}</b>{p.savedAt ? ` · saved ${fmtDate(p.savedAt)}` : ""}. Choose what to bring in:</p>
        <div class="partlist">{#each v.bundle as [k, l, d]}<label class="ctl part"><input type="checkbox" data-part={k} checked={!!sel[k]} onchange={e => store.dialog({ sel: { ...sel, [k]: e.currentTarget.checked } })}><span><b>{l}</b> <span class="cn">{partCount(k, parts[k])}</span><br><span class="hint">{d}</span></span></label>{/each}</div>
        <!-- svelte-ignore a11y_label_has_associated_control: it names the box beside it, as it always has -->
        {#if v.locked || parts.privext}<div class="bar" style="margin-top:8px"><label class="ctl">Backup passphrase (for keys and private extensions)</label><input class="inp" id="imp-keypass" type="password" autocomplete="off" value={m.keypass || ""} style="max-width:220px" disabled={!!m.busy} oninput={e => store.dialog({ keypass: e.currentTarget.value })}></div>{/if}
        {#if (parts.extensions && sel.extensions) || (parts.privext && sel.privext)}<div class="bar exthow" style="margin-top:8px"><span class="label">Extensions in this backup</span>
            <label class="ctl"><input type="radio" name="exthow" data-exthow="all" checked={(m.extHow || "all") === "all"} onchange={() => store.dialog({ extHow: "all" })}> The extension and its settings</label>
            <label class="ctl"><input type="radio" name="exthow" data-exthow="settings" checked={m.extHow === "settings"} onchange={() => store.dialog({ extHow: "settings" })}> Only its settings and servers (keep the version you have)</label></div>{/if}
        <div class="bar" style="margin-top:10px"><button class="btn gold" data-act="import-merge" disabled={!!m.busy}>{#if m.busy === "Merging…"}<span class="spin"></span>Merging…{:else}Merge{/if}</button><button class="btn" data-act="import-replace" disabled={!!m.busy}>{#if m.busy === "Replacing…"}<span class="spin"></span>Replacing…{:else}Replace these parts{/if}</button></div>
        {#if m.busy}<div class="busybar" role="status" aria-live="polite"><span></span></div><p class="hint">{m.busy} This can take a little while with a lot of pictures. Keep this window open.</p>{/if}
        <p class="hint">Merge adds what's new and keeps what you have. Replace swaps each ticked part for the file's version and leaves the unticked ones alone. You can undo it (pictures excepted).</p></div>{:else}<div class="panel"><p><b>{p.name}</b>: {list.length} items from {p.kind}{p.lists && p.lists.length ? ` and ${plural(p.lists.length, "list")}` : ""}. {String(p.match)} already here will be updated; {list.length - (p.match || 0)} are new.</p>
        <div class="bar" style="margin-top:10px">{#if list.every(x => x.medium === "book")}<label class="ctl">New books are <select class="sel" id="imp-kind" onchange={e => (bookKind = e.currentTarget.value)}>{#each KINDS.book as k}<option selected={k === bookKind}>{k}</option>{/each}</select></label>{/if}<button class="btn gold" data-act="import-csv" onclick={() => p && runImport(p, { bookKind })}>Import {list.length}</button></div>
        <p class="hint">Updates fill in scores, status, dates and tags; nothing you wrote here is removed. You can undo the whole import.</p></div>{/if}{/if}
    <div class="bar"><button class="btn" data-act="import-file">Choose a file…</button><button class="btn" data-act="open-paste">Paste a list…</button><button class="btn ghost" data-act="go-settings" data-k="export">Export…</button></div>
    <p class="hint">UniverList .zip packs and backups, Letterboxd (.zip), MyAnimeList (.xml), Goodreads, StoryGraph and IMDb CSVs are recognised automatically. Any other CSV opens the column matcher.</p>
    {#if m.error}<p class="err">{m.error}</p>{/if}
{/if}
