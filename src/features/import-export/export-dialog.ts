// src/features/import-export/export-dialog.ts
// ─────────────────────────────────────────────────────────────────
//  Download everything: choose what goes in
//
//  "Download everything…" (Settings › Data, sources & keys) opens the dialog (ExportDialog.svelte) instead of downloading at once. Every
//  part is listed and ticked, so a full backup is still one click (Download), and anything you'd rather leave out is
//  one untick away: the same choice import already gives you. Private things (your keys, private extensions, the
//  private collection) go in only sealed with a backup passphrase. The download itself is "export-zip"
//  (import-export/handlers.ts), which reads what's ticked here (ui.expParts) and the private choices (ui.exp,
//  ui.expPass).
// ─────────────────────────────────────────────────────────────────

import { closestTo, items, meta, ui } from "../core/core";
import { openModal } from "../core/modals";
import { EXT } from "../extensions/extensions";

/** a part of the export: its key, what it's called, and how many there are now (or null) */
type ExportPart = [key: string, label: string, count: string | null];
export function exportParts(): ExportPart[] {
    const count = (n: number) => (n ? n.toLocaleString() : null);
    return [
        ["library", "Your library", count(items.size)],
        ["favourites", "Favourites, characters and people", count((meta.favOrder || []).length)],
        ["lists", "Lists, Up next, tier and ranked lists", count((meta.lists || []).length)],
        ["profile", "Your profile (name, picture, banner)", null],
        ["preferences", "Settings, layout, modes and tags", null],
        ["themes", "Themes", count(Object.keys(meta.themes || {}).length)],
        ...(meta.courses
            ? [["academic", "The Learning Centre: courses, pathways, opportunities", null] satisfies ExportPart]
            : []),
        ...(EXT.list.some(x => !x.private)
            ? [
                  [
                      "extensions",
                      "Extensions and their settings",
                      count(EXT.list.filter(x => !x.private).length),
                  ] satisfies ExportPart,
              ]
            : []),
        ["images", "Pictures (covers, banners, your uploads), so the backup works without the internet", null],
    ];
}
// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initExportDialog() {
    document.addEventListener("click", e => {
        const t = closestTo(e, '[data-act="export-open"]');
        if (!t) return;
        ui.expAsk = false;
        openModal("exportpick");
    });
}
