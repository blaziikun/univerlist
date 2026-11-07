// src/features/import-export/export-dialog.js
// ─────────────────────────────────────────────────────────────────
//  Download everything: choose what goes in
//
//  "Download everything…" (Settings › Data, sources & keys) opens this dialog instead of downloading at once. Every
//  part is listed and ticked, so a full backup is still one click (Download), and anything you'd rather leave out is
//  one untick away: the same choice import already gives you. Private things (your keys, private extensions, the
//  private collection) go in only sealed with a backup passphrase. The download itself is "export-zip"
//  (import-export/handlers.js), which reads what's ticked here (ui.expParts) and the private choices (ui.exp,
//  ui.expPass).
// ─────────────────────────────────────────────────────────────────

// [part, what it's called, how many there are now (or null)]
function exportParts() {
    const count = n => (n ? n.toLocaleString() : null);
    return [
        ["library", "Your library", count(items.size)],
        ["favourites", "Favourites, characters and people", count((meta.favOrder || []).length)],
        ["lists", "Lists, Up next, tier and ranked lists", count((meta.lists || []).length)],
        ["profile", "Your profile (name, picture, banner)", null],
        ["preferences", "Settings, layout, modes and tags", null],
        ["themes", "Themes", count(Object.keys(meta.themes || {}).length)],
        ...(meta.courses ? [["academic", "The Learning Centre: courses, pathways, opportunities", null]] : []),
        ...(typeof EXT !== "undefined" && EXT.list.some(x => !x.private)
            ? [["extensions", "Extensions and their settings", count(EXT.list.filter(x => !x.private).length)]]
            : []),
        ["images", "Pictures (covers, banners, your uploads), so the backup works without the internet", null],
    ];
}
const exportPartOn = k => (ui.expParts || {})[k] !== false;

MODALS.exportpick = function () {
    const ex = ui.exp || {},
        run = ui.expRun || {},
        hasVault = !!meta.vault,
        privExt = typeof EXT !== "undefined" ? EXT.list.filter(x => x.private).length : 0,
        row = ([k, label, n]) =>
            `<label class="ctl exprow"><input type="checkbox" data-expp="${k}"${exportPartOn(k) ? " checked" : ""}> ${esc(label)}${n ? ` <span class="hint">${esc(n)}</span>` : ""}</label>`;
    return (
        head("Download everything") +
        `<p class="hint">All of it is ticked: untick anything you'd rather leave out. It comes as one .zip you can open again here, on any device.</p>
    <fieldset class="expset"><legend>What goes in</legend>${exportParts().map(row).join("")}</fieldset>
    <fieldset class="expset expkeys"><legend>Private things, sealed with a passphrase</legend>
      <div class="bar"><label class="ctl" for="exp-keypass">Backup passphrase</label>
        <input class="inp" id="exp-keypass" type="password" placeholder="at least 10 characters" autocomplete="new-password" value="${esc(ui.expPass || "")}" style="max-width:220px"></div>
      <label class="ctl exprow"><input type="checkbox" data-exp="keys"${ex.keys !== false ? " checked" : ""}> My keys and server addresses</label>
      <label class="ctl exprow"><input type="checkbox" data-exp="privExt"${ex.privExt !== false ? " checked" : ""}> Private extensions${privExt ? ` (${privExt})` : ""}</label>
      <label class="ctl exprow"><input type="checkbox" data-exp="private"${ex.private !== false && hasVault ? " checked" : ""}${hasVault ? "" : " disabled"}> The private collection (it keeps its own passphrase)</label>
      <p class="hint">With a passphrase, these go in sealed with AES-256: anyone holding the file without it gets nothing. Leave it empty and they stay out. You'll type it again when you import.</p>
      ${
          ui.expAsk
              ? `<div class="expask" id="exp-ask" role="alert"><p><b>No passphrase, so your keys and private extensions won't be in this backup.</b> Everything else will. If this is only for you, on your own computer, that may be fine.</p>
        <div class="bar"><button class="btn gold" data-act="export-addpass">Add a passphrase</button><button class="btn" data-act="export-nokeys">Download without them</button></div></div>`
              : ""
      }
    </fieldset>
    <label class="ctl exprow"><input type="checkbox" data-exp="readable"${ex.readable ? " checked" : ""}> Also add readable copies (lists as spreadsheets, stats); they're never read back in</label>
    <div class="bar" style="margin-top:14px">
      <button class="btn gold" data-act="export-zip" autofocus${run.running ? " disabled" : ""}>${run.running ? `Packing pictures… ${run.done || 0} of ${run.total || "…"}` : "Download"}</button>
      <button class="btn ghost" data-act="close">Cancel</button>
    </div>`
    );
};

document.addEventListener("click", e => {
    const t = e.target.closest('[data-act="export-open"]');
    if (!t) return;
    ui.expAsk = false;
    openModal("exportpick");
});
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.expp) return;
    ui.expParts = { ...(ui.expParts || {}), [t.dataset.expp]: t.checked };
});
