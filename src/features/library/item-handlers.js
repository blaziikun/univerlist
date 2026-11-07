// src/features/library/item-handlers.js
// ─────────────────────────────────────────────────────────────────
//  The item card: what its buttons do
//
//  Status, scores, progress and the reading log, notes and links, seasons, volumes and episodes, and the artwork.
//  core/actions.js calls itemClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function itemClick(e, t, act, k, id, m) {
    switch (act) {
        case "fav-toggle":
            e.stopPropagation();
            toggleFav(id || (m && m.id));
            refreshCtx();
            return true;
        case "crit-open":
            m.critOpen = !m.critOpen;
            renderOverlay();
            return true;
        case "rate": {
            const v = Number(k);
            if (m && m.kind === "item") patch(m.id, { rating: v, critAvg: undefined }, v ? "Score" : "Clear score");
            return true;
        }
        case "crit": {
            const b = items.get(m.id),
                C = { ...(b.crit || {}), [t.dataset.crit]: Number(k) || undefined };
            if (!C[t.dataset.crit]) delete C[t.dataset.crit];
            patch(m.id, critPatch(b, C), "Score " + t.dataset.crit);
            return true;
        }
        case "item-hide": {
            const b = items.get(m.id);
            patch(m.id, { hidden: !b.hidden || undefined }, b.hidden ? "Show in lists" : "Hide from lists");
            toast(b.hidden ? "Back in your lists" : "Hidden from every list. It's on the Hidden list in the sidebar.", {
                label: "Undo",
                fn: undo,
            });
            return true;
        }
        case "vol-tog": {
            const b = items.get(m.id),
                S = new Set(b.volsOwned || []),
                v = Number(k);
            S.has(v) ? S.delete(v) : S.add(v);
            patch(m.id, { volsOwned: [...S].sort((a, c) => a - c) }, "Volumes owned");
            return true;
        }
        case "vols-all": {
            const b = items.get(m.id);
            patch(m.id, { volsOwned: Array.from({ length: b.vols || 0 }, (_, i) => i + 1) }, "Volumes owned");
            return true;
        }
        case "vols-none":
            patch(m.id, { volsOwned: [] }, "Volumes owned");
            return true;
        case "game-comp":
            patch(m.id, { completion: k || undefined }, "How far");
            return true;
        case "streams-load": {
            const b = items.get(m.id);
            try {
                const d = await alEpisodes(b.ext.anilist);
                quietPatch(m.id, { streams: d.links });
                if (!d.links.length) toast("AniList lists no official streams for this.");
            } catch (_) {
                toast("Couldn't reach AniList.");
            }
            renderOverlay();
            return true;
        }
        case "watch-open":
            watchFromItem(id || m.id);
            return true;
        case "eps-load": {
            const b = items.get(m.id);
            m.busy = "eps";
            renderOverlay();
            try {
                let tid = b.ext.tvmaze;
                if (!tid && b.ext.imdb) {
                    const s = await tvmazeByImdb(b.ext.imdb);
                    tid = s && s.ext.tvmaze;
                    if (tid) quietPatch(m.id, { ext: { ...b.ext, tvmaze: tid } });
                }
                if (tid) m.eps = await tvmazeEpisodes(tid);
                else m.error = "TVmaze doesn't know this show.";
            } catch (_) {
                m.error = "Couldn't load episodes. Are you online?";
            }
            m.busy = null;
            renderOverlay();
            return true;
        }
        case "ep-season":
            m.season = Number(k);
            renderOverlay();
            return true;
        case "ep-tog":
        case "ep-seasonall": {
            const b = items.get(m.id),
                S = new Set(b.epsSeen || []);
            if (act === "ep-tog") S.has(k) ? S.delete(k) : S.add(k);
            else for (const ep of (m.eps || []).filter(x => x.s === Number(k))) S.add(ep.s + "x" + ep.e);
            const tot = (m.eps || []).length,
                done = tot && S.size >= tot;
            patch(
                m.id,
                {
                    epsSeen: [...S],
                    prog: S.size,
                    total: tot || b.total,
                    status: done
                        ? "done"
                        : S.size
                          ? ["want", "paused"].includes(b.status)
                              ? "active"
                              : b.status
                          : b.status,
                    startedAt: b.startedAt || (S.size ? nowISO() : null),
                    finishedAt: done ? b.finishedAt || nowISO() : b.finishedAt,
                    lastAt: nowISO(),
                },
                "Episodes"
            );
            return true;
        }
        case "ep-to": {
            const b = items.get(m.id),
                v = Number(k);
            logProgress(m.id, (b.prog || 0) === v ? v - 1 : v);
            return true;
        }
        case "coverpick-start":
        case "bulk-covers": {
            const scope = act === "bulk-covers" ? "sel" : ($("#cp-scope") || {}).value || "missing";
            const queue =
                scope === "sel"
                    ? [...ui.sel]
                    : modeItems()
                          .filter(b =>
                              scope === "all"
                                  ? true
                                  : scope === "books"
                                    ? ["book", "comic", "novel"].includes(b.medium) && !b.coverPicked
                                    : !coverSrc(b)
                          )
                          .sort(sortBy(curSort()))
                          .map(b => b.id);
            if (!queue.length) {
                toast("Nothing to choose covers for there.");
                return true;
            }
            openModal("coverpick", { queue, i: 0, cands: {}, picked: 0 });
            coverPickLoad();
            return true;
        }
        case "cp-pick": {
            const id = m.queue[m.i],
                c = (m.cands[id] || [])[Number(k)];
            if (!c) return true;
            setCover(id, c.cover);
            m.picked++;
            m.i++;
            renderOverlay();
            coverPickLoad();
            return true;
        }
        case "cp-next":
            m.i++;
            renderOverlay();
            coverPickLoad();
            return true;
        case "cp-prev":
            m.i = Math.max(0, m.i - 1);
            renderOverlay();
            coverPickLoad();
            return true;
        case "cp-url": {
            const u = $("#cp-url").value.trim();
            if (!/^https?:\/\//.test(u)) {
                toast("Paste a link that starts with https://");
                return true;
            }
            setCover(m.queue[m.i], u);
            m.picked++;
            m.i++;
            renderOverlay();
            coverPickLoad();
            return true;
        }
        case "season-toggle": {
            const b = items.get(m.id);
            patch(m.id, { bySeason: !seasonsOn(b) }, "Seasons");
            return true;
        }
        case "season-add": {
            const b = items.get(m.id),
                S = b.seasons || [];
            patch(m.id, { seasons: [...S, { n: S.length + 1, status: "want" }] }, "Add season");
            return true;
        }
        case "season-del": {
            const b = items.get(m.id);
            patch(
                m.id,
                { seasons: (b.seasons || []).filter((_, i) => i !== Number(k)).map((x, i) => ({ ...x, n: i + 1 })) },
                "Remove season"
            );
            return true;
        }
        case "season-avg": {
            const S = (items.get(m.id).seasons || []).filter(x => x.rating);
            if (S.length)
                patch(
                    m.id,
                    { rating: Math.round((S.reduce((a, x) => a + +x.rating, 0) / S.length) * 10) / 10 },
                    "Score from seasons"
                );
            return true;
        }
        case "item-tab":
            m.tab = k;
            m.error = "";
            renderOverlay();
            if ((k === "cast" || k === "chars") && !m.cast && !m.busy && canFetchCast(items.get(m.id))) loadCast(m);
            return true;
        case "item-prev":
            stepItem(-1);
            return true;
        case "item-next":
            stepItem(1);
            return true;
        case "item-refresh":
            itemRefresh(m.id);
            return true;
        case "edit":
            m.editing = true;
            renderOverlay(true);
            return true;
        case "cancel-edit":
            m.editing = false;
            renderOverlay(true);
            return true;
        case "save-edit": {
            const f = readFields("e-");
            if (!f.title) {
                toast("It needs a title.");
                return true;
            }
            if (f.vibe) ensureTag(f.vibe);
            m.editing = false;
            change("Edit details", m.id, b => ({
                ...b,
                ...f,
                tags: f.vibe && !(b.tags || []).includes(f.vibe) ? [...(b.tags || []), f.vibe] : b.tags,
            }));
            renderOverlay(true);
            toast("Saved", { label: "Undo", fn: undo });
            return true;
        }
        case "delete":
            m.confirmDelete = true;
            renderOverlay();
            return true;
        case "delete-no":
            m.confirmDelete = false;
            renderOverlay();
            return true;
        case "delete-yes": {
            const bid = m.id,
                title = titleOf(items.get(bid));
            closeModal();
            removeFromQueue(bid);
            const linked = (items.get(bid).links || []).map(l => l.id).filter(x => items.has(x));
            change("Delete " + title, [bid, ...linked], (b, xid) =>
                xid === bid ? null : { ...b, links: (b.links || []).filter(l => l.id !== bid) }
            );
            meta.favOrder = meta.favOrder.filter(x => x !== bid);
            meta.lists = meta.lists.map(l => ({ ...l, ids: l.ids.filter(x => x !== bid) }));
            if (vault.ids.delete(bid)) vault.sealDue = true;
            markDirty();
            toast("Deleted " + title, { label: "Undo", fn: undo });
            return true;
        }
        case "toggle-buy":
            patch(m.id, { toBuy: !items.get(m.id).toBuy }, "Plan to buy");
            return true;
        case "rate-half": {
            const r = items.get(m.id).rating || 0;
            if (!r) return true;
            patch(m.id, { rating: r % 1 ? Math.floor(r) : Math.max(0.5, r - 0.5) }, "Score");
            return true;
        }
        case "untag":
            change("Remove tag " + k, m.id, b => ({ ...b, tags: b.tags.filter(x => x !== k) }));
            return true;
        case "item-private":
            if (!vault.key) {
                closeModal();
                goList("private");
                toast("Unlock your private list first.");
                return true;
            }
            m.id = makePrivate(m.id);
            render();
            toast("Now private and encrypted");
            return true;
        case "item-public":
            m.id = makePublic(m.id);
            render();
            toast("Moved out of your private list");
            return true;
        case "reread":
            change(verbOf(items.get(m.id).medium)[1], m.id, b => ({
                ...b,
                status: "redo",
                repeat: (b.repeat || 0) + 1,
                reads: [
                    ...(b.reads || []),
                    { startedAt: b.startedAt, finishedAt: b.finishedAt, rating: b.rating || undefined },
                ],
                startedAt: nowISO(),
                finishedAt: null,
                prog: 0,
                epsSeen: [],
            }));
            return true;
        case "log-save": {
            const b = items.get(m.id),
                total = parseFloat($("#pg-total") ? $("#pg-total").value : ""),
                now = parseFloat($("#pg-now").value) || 0;
            const lane = $("#pg-lane") ? $("#pg-lane").value : undefined,
                vol = $("#pg-vol") ? parseInt($("#pg-vol").value, 10) : NaN;
            if (Number.isFinite(total) && total > 0 && total !== b.total) quietPatch(m.id, { total });
            logProgress(m.id, now, { lane, vol: Number.isFinite(vol) && vol !== b.vol ? vol : undefined });
            renderOverlay();
            return true;
        }
        case "log-add": {
            const b = items.get(id);
            logProgress(id, (b.prog || 0) + Number(k));
            return true;
        }
        case "log-set":
            openModal("setpage", { id });
            return true;
        case "sp-save": {
            const v = parseFloat($("#sp-page").value);
            const lane = $("#sp-lane") ? $("#sp-lane").value : undefined;
            const bid = m.id;
            closeModal();
            if (Number.isFinite(v)) logProgress(bid, v, { lane });
            return true;
        }
        case "log-del":
            change("Remove session", m.id, b => ({ ...b, log: b.log.filter((_, i) => i !== Number(k)) }));
            return true;
        case "start":
            setStatus(id, "active");
            return true;
        case "finish":
            finishItem(id);
            return true;
        case "quote-add": {
            const text = $("#qt-text").value.trim();
            if (!text) return true;
            const page = $("#qt-page").value.trim();
            change("Add quote", m.id, b => ({ ...b, quotes: [...b.quotes, { text, page, date: nowISO() }] }));
            return true;
        }
        case "quote-del":
            change("Remove quote", m.id, b => ({ ...b, quotes: b.quotes.filter((_, i) => i !== Number(k)) }));
            return true;
        case "journal-add": {
            const text = $("#jr-text").value.trim();
            if (!text) return true;
            change("Add journal entry", m.id, b => ({ ...b, journal: [...b.journal, { text, date: nowISO() }] }));
            return true;
        }
        case "journal-del":
            change("Remove journal entry", m.id, b => ({ ...b, journal: b.journal.filter((_, i) => i !== Number(k)) }));
            return true;
        // connections
        case "link-add": {
            const target = idFromOption($("#lk-target").value);
            if (!target) {
                toast("Pick something from the list.");
                return true;
            }
            linkItems(m.id, target, $("#lk-type").value, $("#lk-note").value.trim());
            return true;
        }
        case "link-similar":
            linkItems(m.id, k, "similar");
            return true;
        case "unlink":
            unlinkItems(m.id, k);
            return true;
        case "rel-add":
            await addFromAniList(Number(k), t.dataset.src);
            renderMain();
            return true;
        case "adapt-find": {
            const b = items.get(m.id);
            m.busy = "adapt";
            renderOverlay();
            try {
                const q = b.ext.wikidata || (await wdFind((b.alt && b.alt.en) || b.title, b.medium, b.year));
                if (q && !b.ext.wikidata) quietPatch(m.id, { ext: { ...b.ext, wikidata: q } });
                const keys = libraryKeys();
                m.adapt = q
                    ? (await wdAdaptations([q]))
                          .map(r => ({ ...r, medium: wdMediumOf(r.desc) }))
                          .filter(r => r.medium && !owned(r.title, keys))
                    : [];
            } catch (_) {
                m.error = "Couldn't reach Wikidata.";
            }
            m.busy = null;
            renderOverlay();
            return true;
        }
        case "adapt-add": {
            const r = m.adapt[Number(k)];
            m.adapt.splice(Number(k), 1);
            renderOverlay();
            await addFromWikidata(r, m.id);
            return true;
        }
        case "find-art": {
            const bid = m.id;
            m.artSaved = null;
            m.busy = "art";
            m.error = "";
            m.art = null;
            m.ctl = new AbortController();
            renderOverlay();
            try {
                const r = await allArt(items.get(bid), m.ctl.signal, s => {
                    if (ui.modal === m) {
                        m.status = s;
                        renderOverlay();
                    }
                });
                m.art = r.covers;
                quietPatch(bid, {
                    artSeen: r.covers
                        .filter(c => c.cover && !/^data:/.test(c.cover))
                        .slice(0, 150)
                        .map(c => ({ cover: c.cover, label: c.label, ...(c.wide ? { wide: true } : {}) })),
                    artAt: nowISO(),
                });
                scheduleSave();
                const cur = items.get(bid),
                    mt = r.meta,
                    p = {};
                if (mt) {
                    if (!cur.year && mt.year) p.year = mt.year;
                    if (!cur.total && mt.total) p.total = mt.total;
                    if (mt.olKey && !cur.ext.olKey) p.ext = { ...cur.ext, olKey: mt.olKey };
                    if (!cur.about && mt.olKey) {
                        const d = await olDescription(mt.olKey);
                        if (d) p.about = d;
                    }
                }
                if (Object.keys(p).length) patch(bid, p, "Fill in details");
            } catch (err) {
                if (err.name !== "AbortError") m.error = "Couldn't reach the artwork sources. Are you online?";
            }
            m.busy = null;
            if (ui.modal === m) renderOverlay();
            return true;
        }
        case "art-url": {
            const u = $("#art-url").value.trim();
            if (!/^https?:\/\//.test(u)) {
                toast("Paste a link that starts with https://");
                return true;
            }
            patch(
                m.id,
                { cover: u, coverData: null, coverColor: null, color: null, coverPicked: true },
                "Change cover"
            );
            cacheAndColour(m.id).then(() => updateItemTiles(m.id));
            return true;
        }
        case "cover-photo":
            pendingCover = "item";
            $("#file-cover").click();
            return true;
        case "spine-upload":
            pendingCover = "spine";
            $("#file-cover").click();
            return true;
        case "spine-clear":
            patch(m.id, { spineArt: null, spinePicked: true }, "Spine from the cover");
            return true;
        case "uncover":
            patch(
                m.id,
                { cover: null, coverData: null, coverChecked: true, coverColor: null, coverPicked: true },
                "Remove cover"
            );
            return true;
        case "rc-go":
            runRefresh();
            return true;
        case "rc-stop":
            if (m.ctl) m.ctl.abort();
            return true;
    }
    return false;
}
