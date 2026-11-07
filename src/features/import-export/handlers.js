// src/features/import-export/handlers.js
// ─────────────────────────────────────────────────────────────────
//  Bringing things in, taking them with you: what its buttons do
//
//  Files, profile links and pasted lists coming in; backups, the library folder and offline pictures going out.
//  core/actions.js calls ioClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function ioClick(e, t, act, k, id, m) {
    switch (act) {
        case "import-url": {
            const u = ($("#imp-url") || {}).value.trim();
            let mm;
            ui.impNote = "";
            if ((mm = /anilist\.co\/user\/([^/?#\s]+)/i.exec(u))) {
                meta.settings.anilistUser = decodeURIComponent(mm[1]);
                markDirty();
                openModal("anilist");
                runAniListSync();
            } else if (
                (mm = /letterboxd\.com\/([^/?#\s]+)/i.exec(u)) &&
                !/^(film|films|list|lists|settings)$/i.test(mm[1])
            ) {
                t.disabled = true;
                t.textContent = "Reading…";
                try {
                    const list = await letterboxdRSS(mm[1]);
                    if (!list.length) throw new Error("empty");
                    openModal("io", {
                        preview: {
                            kind: "Letterboxd diary",
                            name: mm[1] + "'s recent diary",
                            items: list,
                            match: list.filter(x => findExisting(x.title, "", "film", x.ext)).length,
                        },
                    });
                } catch (err) {
                    ui.impNote =
                        err.message === "empty"
                            ? "That diary is empty or private."
                            : `Letterboxd didn't let this page read the diary. Export your data instead (<a class="link" href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener">Letterboxd → Settings → Data</a>) and drop the .zip above: it has every film, rating, review and list.`;
                }
                t.disabled = false;
                t.textContent = "Bring it in";
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
            // what's ticked in the dialog (import-export/export-dialog.js); all of it unless something was unticked
            const P = ui.expParts || {},
                some = Object.values(P).some(v => v === false);
            const ex = { app: true, ...(ui.exp || {}), images: P.images !== false, parts: some ? { ...P } : undefined };
            const redraw = () => (ui.modal && ui.modal.kind === "exportpick" ? renderOverlay() : renderMain());
            {
                const pass = ($("#exp-keypass") || {}).value || ui.expPass || "";
                if (pass && pass.length < PASSPHRASE_MIN) {
                    toast(PASSPHRASE_HINT);
                    return true;
                }
                // no passphrase: keys and private extensions can't go in. Ask once, so a backup isn't made without them by accident.
                const leaving =
                    !pass &&
                    !ui.expSkip &&
                    ex.keys !== false &&
                    (Object.keys(keysForBackup()).length ||
                        (typeof EXT !== "undefined" && ex.privExt !== false && EXT.list.some(x => x.private)));
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
                ex.private = ex.private !== false && !!meta.vault;
                if (ex.keys === false) {
                    ex.keysOff = true;
                }
            }
            ui.expRun = { running: true, done: 0, total: 0 };
            redraw();
            let last = 0;
            try {
                const note = await exportBundle(ex, (d, n) => {
                    ui.expRun.done = d;
                    ui.expRun.total = n;
                    if (Date.now() - last > 300) {
                        last = Date.now();
                        redraw();
                    }
                });
                ui.expRun = { note: "Downloaded. " + note };
                if (ui.modal && ui.modal.kind === "exportpick") closeModal();
                toast(ui.expRun.note);
            } catch (err) {
                console.error(err);
                ui.expRun = { note: "Couldn't build the .zip: " + err.message };
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
                          (kk, v) =>
                              kk === "b"
                                  ? v && v.title
                                  : kk === "top"
                                    ? v.map(b => ({ title: b.title, rating: b.rating }))
                                    : v,
                          1
                      )
                  )
                : download(`taste-profile-${today()}.md`, tasteMarkdown(), "text/markdown");
            return true;
        case "folder-connect":
            if (await folderSync.connect()) {
                toast("Keeping " + folderSync.handle.name + " up to date");
            }
            render();
            return true;
        case "folder-reconnect":
            await folderSync.reconnect();
            return true;
        case "folder-push":
            await folderSync.push(true);
            toast("Saved to " + folderSync.handle.name);
            renderMain();
            return true;
        case "folder-disconnect":
            await folderSync.disconnect();
            return true;
        case "export-lists":
            download(`univerlist-lists-${today()}.zip`, zipFiles(listFiles("both")), "application/zip");
            return true;
        case "offline-go": {
            const todo = offlineTargets().filter(u => !coverCache.urls.has(u));
            ui.offline = { running: true, done: 0, total: todo.length, ctl: new AbortController() };
            renderMain();
            let got = 0,
                last = 0;
            for (const u of todo) {
                if (ui.offline.ctl.signal.aborted || !navigator.onLine) break;
                try {
                    if (await coverCache.fetch(u, ui.offline.ctl.signal)) got++;
                } catch (_) {}
                ui.offline.done++;
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
            const u = ($("#set-lb") && $("#set-lb").value.trim()) || meta.settings.letterboxdUser || "";
            meta.settings.letterboxdUser = u;
            markDirty();
            t.disabled = true;
            t.textContent = "Reading…";
            try {
                const list = await letterboxdRSS(u);
                if (!list.length) throw new Error("empty");
                openModal("io", {
                    preview: {
                        kind: "Letterboxd diary",
                        name: u + "'s recent diary",
                        items: list,
                        match: list.filter(x => findExisting(x.title, "", "film", x.ext)).length,
                    },
                });
            } catch (err) {
                toast(
                    err.message === "empty"
                        ? "That diary is empty or private."
                        : "Letterboxd didn't allow reading the feed from here. Use your export .zip instead.",
                    {
                        label: "Export page",
                        fn: () => window.open("https://letterboxd.com/settings/data/", "_blank", "noopener"),
                    }
                );
            }
            t.disabled = false;
            t.textContent = "Get my recent diary";
            return true;
        }
        case "file-create":
        case "file-open":
            if (await fileSync.connect(act === "file-create")) {
                meta.settings.welcomed3 = true;
                toast("Saving to " + fileSync.handle.name);
            }
            render();
            return true;
        case "file-reconnect":
            await fileSync.reconnect();
            render();
            return true;
        case "file-push":
            await fileSync.push();
            toast("Saved to " + fileSync.handle.name);
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
            exportCSV(k || ($("#exp-medium") ? $("#exp-medium").value : "") || "");
            return true;
        case "import-file":
            $("#file-import").click();
            return true;
        case "export-nokeys":
            ui.expSkip = true;
            ui.expAsk = false;
            renderOverlay();
            $('[data-act="export-zip"]').click();
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
            if (m.busy) return true;
            const p = m.preview,
                how = act === "import-replace" ? "replace" : "merge";
            m.error = "";
            m.busy = how === "replace" ? "Replacing…" : "Merging…";
            renderOverlay();
            await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30))); // let the loader show before the work starts
            try {
                const r = await applyParts(p.parts, m.sel || {}, how, p.v);
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
                m.error = "Couldn't import that: " + err.message;
                renderOverlay();
            }
            return true;
        }
        case "import-csv":
            runImport(m.preview, { bookKind: $("#imp-kind") ? $("#imp-kind").value : "Novel" });
            return true;
        case "ps-preview":
            readPaste(m);
            renderOverlay();
            return true;
        case "ps-import": {
            readPaste(m);
            const list = parsePasted(m.text || "", m.medium, m.status).map(x => ({
                ...x,
                kind: m.ikind || "",
                tags: m.tag ? [m.tag] : [],
            }));
            if (!list.length) return true;
            smartImport("a pasted list", list);
            return true;
        }
        case "cm-import": {
            const items2 = mapRows(m.preview.rows, m.map, {
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
