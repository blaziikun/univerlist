// src/features/import-export/handlers.ts
// ─────────────────────────────────────────────────────────────────
//  Bringing things in, taking them with you: what its buttons do
//
//  Files, profile links and pasted lists coming in; backups, the library folder and offline pictures going out.
//  core/actions.ts calls ioClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import {
    $,
    asField,
    coverCache,
    download,
    errMessage,
    exportCSV,
    exportJSON,
    fileSync,
    findExisting,
    isRecord,
    markDirty,
    meta,
    numOf,
    PASSPHRASE_HINT,
    PASSPHRASE_MIN,
    plural,
    textOf,
    toast,
    today,
    ui,
    undo,
} from "../core/core";
import type { ActEl } from "../core/core";
import type { Modal } from "../core/model";
import { runAniListSync } from "../sources/anilist";
import { autoCovers } from "../sources/covers";
import { renderMain } from "../core/shell";
import { offlineTargets } from "../settings/settings";
import { closeModal, openModal, renderOverlay } from "../core/modals";
import { exportBundle, letterboxdRSS, listFiles, mapRows, zipFiles } from "./importers";
import type { ExportOpts } from "./export-zip";
import { smartImport } from "./smartimport";
import { applyParts, folderSync, keysForBackup, tasteData, tasteMarkdown } from "./packs";
import { EXT } from "../extensions/extensions";
import { render } from "../core/navigation";
import { IMPORT_HELP } from "../core/actions";

/** a button that shows it's busy while it works */
const busy = (t: ActEl, label: string, on: boolean) => {
    if (t instanceof HTMLButtonElement) t.disabled = on;
    t.textContent = label;
};
const inputValue = (sel: string) => asField($(sel))?.value;
export async function ioClick(
    _e: Event,
    t: ActEl,
    act: string,
    k: string | undefined,
    _id: string | undefined,
    m: Modal | null
): Promise<boolean> {
    switch (act) {
        case "import-url": {
            const u = (inputValue("#imp-url") || "").trim();
            let mm: RegExpExecArray | null;
            ui.impNote = "";
            if ((mm = /anilist\.co\/user\/([^/?#\s]+)/i.exec(u))) {
                let user = mm[1];
                try {
                    user = decodeURIComponent(user);
                } catch (_) {}
                meta.settings.anilistUser = user;
                markDirty();
                openModal("anilist");
                runAniListSync();
            } else if (
                (mm = /letterboxd\.com\/([^/?#\s]+)/i.exec(u)) &&
                !/^(film|films|list|lists|settings)$/i.test(mm[1])
            ) {
                const user = mm[1];
                busy(t, "Reading…", true);
                try {
                    const list = await letterboxdRSS(user);
                    if (!list.length) throw new Error("empty");
                    openModal("io", {
                        preview: {
                            kind: "Letterboxd diary",
                            name: user + "'s recent diary",
                            items: list,
                            match: list.filter(x => findExisting(x.title, "", "film", fieldsOrNull(x.ext))).length,
                        },
                    });
                } catch (err) {
                    ui.impNote =
                        errMessage(err) === "empty"
                            ? "That diary is empty or private."
                            : `Letterboxd didn't let this page read the diary. Export your data instead (<a class="link" href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener">Letterboxd → Settings → Data</a>) and drop the .zip above: it has every film, rating, review and list.`;
                }
                busy(t, "Bring it in", false);
            } else {
                const site = Object.keys(IMPORT_HELP).find(s => u.toLowerCase().includes(s));
                ui.impNote = site
                    ? IMPORT_HELP[site]
                    : u
                      ? "Paste an AniList or Letterboxd profile link, or drop an export file above."
                      : "Paste a profile link first.";
            }
            renderMain();
            return true;
        }
        case "export-zip": {
            if (ui.expRun && ui.expRun.running) return true;
            // what's ticked in the dialog (import-export/export-dialog.ts); all of it unless something was unticked
            const P = ui.expParts || {},
                X = ui.exp || {},
                some = Object.values(P).some(v => v === false);
            const ex: ExportOpts = {
                app: true,
                readable: !!X.readable,
                privExt: X.privExt !== false,
                images: P.images !== false,
                parts: some ? { ...P } : undefined,
            };
            const redraw = () => (ui.modal && ui.modal.kind === "exportpick" ? renderOverlay() : renderMain());
            {
                const pass = inputValue("#exp-keypass") || ui.expPass || "";
                if (pass && pass.length < PASSPHRASE_MIN) {
                    toast(PASSPHRASE_HINT);
                    return true;
                }
                // no passphrase: keys and private extensions can't go in. Ask once, so a backup isn't made without them by accident.
                const leaving =
                    !pass &&
                    !ui.expSkip &&
                    X.keys !== false &&
                    (Object.keys(keysForBackup()).length || (X.privExt !== false && EXT.list.some(x => x.private)));
                if (leaving) {
                    ui.expAsk = true;
                    redraw();
                    const a = $("#exp-ask");
                    a && a.scrollIntoView({ block: "center", behavior: "smooth" });
                    return true;
                }
                ui.expAsk = false;
                ui.expSkip = false;
                ex.keysPass = pass || null;
                ex.private = X.private !== false && !!meta.vault;
                if (X.keys === false) {
                    ex.keysOff = true;
                }
            }
            const run = { running: true, done: 0, total: 0 };
            ui.expRun = run;
            redraw();
            let last = 0;
            try {
                const note = await exportBundle(ex, (d, n) => {
                    run.done = d;
                    run.total = n;
                    if (Date.now() - last > 300) {
                        last = Date.now();
                        redraw();
                    }
                });
                const said = "Downloaded. " + note;
                ui.expRun = { note: said };
                if (ui.modal && ui.modal.kind === "exportpick") closeModal();
                toast(said);
            } catch (err) {
                console.error(err);
                ui.expRun = { note: "Couldn't build the .zip: " + errMessage(err) };
                redraw();
            }
            renderMain();
            return true;
        }
        case "taste-export":
            k === "json"
                ? download(
                      `taste-${today()}.json`,
                      JSON.stringify(
                          tasteData(),
                          (kk, v: unknown) =>
                              kk === "b"
                                  ? isRecord(v)
                                      ? v.title
                                      : v
                                  : kk === "top" && Array.isArray(v)
                                    ? v.map(b => (isRecord(b) ? { title: b.title, rating: b.rating } : b))
                                    : v,
                          1
                      )
                  )
                : download(`taste-profile-${today()}.md`, tasteMarkdown(), "text/markdown");
            return true;
        case "folder-connect":
            if (await folderSync.connect()) {
                toast("Keeping " + (folderSync.handle ? folderSync.handle.name : "") + " up to date");
            }
            render();
            return true;
        case "folder-reconnect":
            await folderSync.reconnect();
            return true;
        case "folder-push":
            await folderSync.push(true);
            toast("Saved to " + (folderSync.handle ? folderSync.handle.name : ""));
            renderMain();
            return true;
        case "folder-disconnect":
            await folderSync.disconnect();
            return true;
        case "export-lists":
            download(`univerlist-lists-${today()}.zip`, zipFiles(listFiles("both")), "application/zip");
            return true;
        case "offline-go": {
            const todo = offlineTargets().filter(u => !coverCache.urls.has(u)),
                ctl = new AbortController(),
                run = { running: true, done: 0, total: todo.length, ctl };
            ui.offline = run;
            renderMain();
            let got = 0,
                last = 0;
            for (const u of todo) {
                if (ctl.signal.aborted || !navigator.onLine) break;
                try {
                    if (await coverCache.fetch(u, ctl.signal)) got++;
                } catch (_) {}
                run.done++;
                if (Date.now() - last > 400) {
                    last = Date.now();
                    if (ui.setSec === "library") renderMain();
                }
            }
            ui.offline = {
                note: `Saved ${got} more picture${got === 1 ? "" : "s"}.${coverCache.blocked ? " Some sites refused; those show only online." : ""}`,
            };
            render();
            return true;
        }
        case "offline-stop":
            if (ui.offline && ui.offline.ctl) ui.offline.ctl.abort();
            return true;
        case "lb-rss": {
            const u = (inputValue("#set-lb") || "").trim() || textOf(meta.settings.letterboxdUser);
            meta.settings.letterboxdUser = u;
            markDirty();
            busy(t, "Reading…", true);
            try {
                const list = await letterboxdRSS(u);
                if (!list.length) throw new Error("empty");
                openModal("io", {
                    preview: {
                        kind: "Letterboxd diary",
                        name: u + "'s recent diary",
                        items: list,
                        match: list.filter(x => findExisting(x.title, "", "film", fieldsOrNull(x.ext))).length,
                    },
                });
            } catch (err) {
                toast(
                    errMessage(err) === "empty"
                        ? "That diary is empty or private."
                        : "Letterboxd didn't allow reading the feed from here. Use your export .zip instead.",
                    {
                        label: "Export page",
                        fn: () => window.open("https://letterboxd.com/settings/data/", "_blank", "noopener"),
                    }
                );
            }
            busy(t, "Get my recent diary", false);
            return true;
        }
        case "file-create":
        case "file-open":
            if (await fileSync.connect(act === "file-create")) {
                meta.settings.welcomed3 = true;
                toast("Saving to " + (fileSync.handle ? fileSync.handle.name : ""));
            }
            render();
            return true;
        case "file-reconnect":
            await fileSync.reconnect();
            render();
            return true;
        case "file-push":
            await fileSync.push();
            toast("Saved to " + (fileSync.handle ? fileSync.handle.name : ""));
            render();
            return true;
        case "file-disconnect":
            await fileSync.disconnect();
            render();
            return true;
        case "export-json":
            exportJSON();
            return true;
        case "export-csv":
            exportCSV(k || inputValue("#exp-medium") || "");
            return true;
        case "import-file":
            $("#file-import")?.click();
            return true;
        case "export-nokeys":
            ui.expSkip = true;
            ui.expAsk = false;
            renderOverlay();
            $('[data-act="export-zip"]')?.click();
            return true;
        case "export-addpass":
            ui.expAsk = false;
            renderOverlay();
            {
                const i = $("#exp-keypass");
                if (i) {
                    i.scrollIntoView({ block: "center" });
                    i.focus();
                }
            }
            return true;
        case "import-merge":
        case "import-replace": {
            if (!m || m.busy) return true;
            const p = m.preview,
                how = act === "import-replace" ? "replace" : "merge";
            m.error = "";
            m.busy = how === "replace" ? "Replacing…" : "Merging…";
            renderOverlay();
            await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30))); // let the loader show before the work starts
            try {
                const sel = m.sel instanceof Set ? {} : m.sel || {};
                const r = await applyParts((p && p.parts) || {}, sel, how, p ? numOf(p.v) : undefined);
                m.busy = "";
                closeModal();
                toast(
                    `Imported${r.items ? " " + plural(r.items, "entry", "entries") : ""}${r.pics ? " and " + plural(r.pics, "picture") : ""}`,
                    { label: "Undo", fn: undo }
                );
                setTimeout(() => autoCovers(), 400);
            } catch (err) {
                console.error(err);
                m.busy = "";
                m.error = "Couldn't import that: " + errMessage(err);
                renderOverlay();
            }
            return true;
        }
        case "cm-import": {
            if (!m || !m.preview) return true;
            const items2 = mapRows(m.preview.rows || [], m.map || {}, {
                medium: m.medium || "film",
                scale: m.scale || "auto",
                status: m.status || "done",
            });
            smartImport(m.preview.name, items2);
            return true;
        }
    }
    return false;
}
/** an entry's ids from an import, when it has any */
const fieldsOrNull = (x: unknown) => (isRecord(x) ? x : null);
