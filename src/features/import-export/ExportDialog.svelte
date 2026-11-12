<!--
    src/features/import-export/ExportDialog.svelte
    ─────────────────────────────────────────────────────────────────
      Download everything: every part ticked (untick what you'd rather leave out), the private things sealed with a
      passphrase, readable copies if you want them, and Download. The choices are ui's (expParts, exp, expPass), which
      "export-zip" (import-export/handlers.ts) reads; so is how the packing is going (expRun) and the question asked
      when there's no passphrase (expAsk, answered by export-addpass and export-nokeys).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../core/store.svelte";
    import { meta, ui } from "../core/core";
    import { EXT } from "../extensions/extensions";
    import DialogHead from "../core/dialog/DialogHead.svelte";
    import { exportParts } from "./export-dialog";

    const v = $derived.by(() => {
        const u = store.ui;
        void store.meta;
        return { ex: { ...(u.exp || {}) }, parts: { ...(u.expParts || {}) }, run: { ...(u.expRun || {}) }, ask: !!u.expAsk, pass: u.expPass || "", hasVault: !!meta.vault, privExt: EXT.list.filter(x => x.private).length, list: exportParts() };
    });
    /** a choice: kept on ui (not saved), where Download reads it */
    function choose(change: () => void) {
        change();
        store.flush("ui");
    }
</script>

<DialogHead title="Download everything" />
<p class="hint">All of it is ticked: untick anything you'd rather leave out. It comes as one .zip you can open again here, on any device.</p>
<fieldset class="expset"><legend>What goes in</legend>{#each v.list as [k, label, n]}<label class="ctl exprow"><input type="checkbox" data-expp={k} checked={v.parts[k] !== false} onchange={e => { const on = e.currentTarget.checked; choose(() => (ui.expParts = { ...(ui.expParts || {}), [k]: on })); }}> {label}{#if n}{" "}<span class="hint">{n}</span>{/if}</label>{/each}</fieldset>
<fieldset class="expset expkeys"><legend>Private things, sealed with a passphrase</legend>
    <div class="bar"><label class="ctl" for="exp-keypass">Backup passphrase</label>
        <input class="inp" id="exp-keypass" type="password" placeholder="at least 10 characters" autocomplete="new-password" value={v.pass} style="max-width:220px" oninput={e => (ui.expPass = e.currentTarget.value)}></div>
    {#each [["keys", "My keys and server addresses"], ["privExt", "Private extensions" + (v.privExt ? ` (${v.privExt})` : "")]] as [k, l]}<label class="ctl exprow"><input type="checkbox" data-exp={k} checked={v.ex[k] !== false} onchange={e => { const on = e.currentTarget.checked; choose(() => (ui.exp = { ...(ui.exp || {}), [k]: on })); }}> {l}</label>
    {/each}<label class="ctl exprow"><input type="checkbox" data-exp="private" checked={v.ex.private !== false && v.hasVault} disabled={!v.hasVault} onchange={e => { const on = e.currentTarget.checked; choose(() => (ui.exp = { ...(ui.exp || {}), private: on })); }}> The private collection (it keeps its own passphrase)</label>
    <p class="hint">With a passphrase, these go in sealed with AES-256: anyone holding the file without it gets nothing. Leave it empty and they stay out. You'll type it again when you import.</p>
    {#if v.ask}<div class="expask" id="exp-ask" role="alert"><p><b>No passphrase, so your keys and private extensions won't be in this backup.</b> Everything else will. If this is only for you, on your own computer, that may be fine.</p>
        <div class="bar"><button class="btn gold" data-act="export-addpass">Add a passphrase</button><button class="btn" data-act="export-nokeys">Download without them</button></div></div>{/if}
</fieldset>
<label class="ctl exprow"><input type="checkbox" data-exp="readable" checked={!!v.ex.readable} onchange={e => { const on = e.currentTarget.checked; choose(() => (ui.exp = { ...(ui.exp || {}), readable: on })); }}> Also add readable copies (lists as spreadsheets, stats); they're never read back in</label>
<!-- svelte-ignore a11y_autofocus: Download is what you came for -->
<div class="bar" style="margin-top:14px">
    <button class="btn gold" data-act="export-zip" autofocus disabled={!!v.run.running}>{v.run.running ? `Packing pictures… ${v.run.done || 0} of ${v.run.total || "…"}` : "Download"}</button>
    <button class="btn ghost" data-act="close">Cancel</button>
</div>
