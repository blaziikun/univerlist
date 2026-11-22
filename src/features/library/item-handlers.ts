// src/features/library/item-handlers.ts
// ─────────────────────────────────────────────────────────────────
//  The item card's buttons that change your library, and the ones it shares with other pages
//
//  Scores, volumes, seasons and episodes, the reading log and journal, links, artwork, hiding, moving and deleting.
//  The card itself is Svelte (library/card/): it handles its own fields, tabs and folds, and the buttons that act on
//  what's typed into it; these stay here so a button's name means the same wherever it's drawn.
//  core/actions.ts calls itemClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import {
    $,
    change,
    errName,
    items,
    linkItems,
    markDirty,
    meta,
    nowISO,
    patch,
    quietPatch,
    scheduleSave,
    stateChanged,
    textOf,
    titleOf,
    toast,
    ui,
    undo,
    unlinkItems,
    vault,
    verbOf,
} from "../core/core";
import {
    alEpisodes,
    allArt,
    olDescription,
    tvmazeByImdb,
    tvmazeEpisodes,
    wdAdaptations,
    wdFind,
    wdMediumOf,
} from "../sources/sources";
import { coverSrc } from "../sources/covers";
import { curSort, modeItems, sortBy } from "../core/views";
import { renderMain } from "../core/shell";
import { closeModal, openModal, renderOverlay, seasonsOn } from "../core/modals";
import { libraryKeys, owned } from "../insights/discover";
import { watchFromItem } from "../watch-read/watch";
import { refreshCtx } from "../core/keys";
import { goList, render } from "../core/navigation";
import {
    addFromAniList,
    addFromWikidata,
    finishItem,
    itemRefresh,
    logProgress,
    makePrivate,
    makePublic,
    removeFromQueue,
    setStatus,
    toggleFav,
} from "./item-actions";
import { coverPickLoad, runRefresh, setCover, setPendingCover } from "../core/events";
import type { ActEl } from "../core/core";
import type { Item, Modal } from "../core/model";

// the value of a field on the card
const val = (sel: string) => $<HTMLInputElement>(sel)?.value ?? "";
export async function itemClick(
    e: Event,
    t: ActEl,
    act: string,
    key: string | undefined,
    id: string | undefined,
    m: Modal | null
): Promise<boolean> {
    const k = key ?? "";
    // first the buttons that work anywhere: on a cover, a row or the card
    switch (act) {
        case "fav-toggle":
            e.stopPropagation();
            toggleFav(id || m?.id || "");
            refreshCtx();
            return true;
        case "watch-open":
            watchFromItem(id || m?.id);
            return true;
        case "coverpick-start":
        case "bulk-covers": {
            const scope = act === "bulk-covers" ? "sel" : val("#cp-scope") || "missing";
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
        case "log-add": {
            const b = items.get(id || "");
            if (b && id) logProgress(id, (b.prog || 0) + Number(k));
            return true;
        }
        case "log-set":
            openModal("setpage", { id });
            return true;
        case "start":
            if (id) setStatus(id, "active");
            return true;
        case "finish":
            if (id) finishItem(id);
            return true;
        case "rel-add":
            await addFromAniList(Number(k), t.dataset.src);
            renderMain();
            return true;
        case "cover-photo":
            setPendingCover("item");
            $("#file-cover")?.click();
            return true;
        case "spine-upload":
            setPendingCover("spine");
            $("#file-cover")?.click();
            return true;
        case "rc-go":
            runRefresh();
            return true;
    }
    // the rest act on the dialog that's open: an entry's card, choosing covers, setting a page
    if (!m) return false;
    const mid = m.id || "",
        b: Item | undefined = items.get(mid);
    switch (act) {
        case "item-hide": {
            if (!b) return true;
            patch(mid, { hidden: !b.hidden || undefined }, b.hidden ? "Show in lists" : "Hide from lists");
            toast(b.hidden ? "Back in your lists" : "Hidden from every list. It's on the Hidden list in the sidebar.", {
                label: "Undo",
                fn: undo,
            });
            return true;
        }
        case "vol-tog": {
            const S = new Set(b?.volsOwned || []),
                v = Number(k);
            if (S.has(v)) S.delete(v);
            else S.add(v);
            patch(mid, { volsOwned: [...S].sort((a, c) => a - c) }, "Volumes owned");
            return true;
        }
        case "vols-all": {
            patch(mid, { volsOwned: Array.from({ length: b?.vols || 0 }, (_, i) => i + 1) }, "Volumes owned");
            return true;
        }
        case "vols-none":
            patch(mid, { volsOwned: [] }, "Volumes owned");
            return true;
        case "game-comp":
            patch(mid, { completion: k || undefined }, "How far");
            return true;
        case "streams-load": {
            try {
                const d = await alEpisodes(b?.ext.anilist || 0);
                quietPatch(mid, { streams: d.links });
                if (!d.links.length) toast("AniList lists no official streams for this.");
            } catch (_) {
                toast("Couldn't reach AniList.");
            }
            renderOverlay();
            return true;
        }
        case "eps-load": {
            if (!b) return true;
            m.busy = "eps";
            stateChanged("ui");
            try {
                let tid = b.ext.tvmaze;
                if (!tid && b.ext.imdb) {
                    const s = await tvmazeByImdb(b.ext.imdb);
                    tid = s?.ext.tvmaze;
                    if (tid) quietPatch(mid, { ext: { ...b.ext, tvmaze: tid } });
                }
                if (tid) m.eps = await tvmazeEpisodes(tid);
                else m.error = "TVmaze doesn't know this show.";
            } catch (_) {
                m.error = "Couldn't load episodes. Are you online?";
            }
            m.busy = false;
            stateChanged("ui");
            return true;
        }
        case "ep-tog":
        case "ep-seasonall": {
            if (!b) return true;
            const S = new Set(b.epsSeen || []);
            if (act === "ep-tog") {
                if (S.has(k)) S.delete(k);
                else S.add(k);
            } else for (const ep of (m.eps || []).filter(x => x.s === Number(k))) S.add(ep.s + "x" + ep.e);
            const tot = (m.eps || []).length,
                done = tot && S.size >= tot;
            patch(
                mid,
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
            const v = Number(k);
            logProgress(mid, (b?.prog || 0) === v ? v - 1 : v);
            return true;
        }
        case "cp-pick": {
            const i = m.i || 0,
                qid = m.queue?.[i] || "",
                c = (m.cands?.[qid] || [])[Number(k)];
            if (!c) return true;
            setCover(qid, c.cover);
            m.picked = (m.picked || 0) + 1;
            m.i = i + 1;
            renderOverlay();
            coverPickLoad();
            return true;
        }
        case "cp-next":
            m.i = (m.i || 0) + 1;
            renderOverlay();
            coverPickLoad();
            return true;
        case "cp-prev":
            m.i = Math.max(0, (m.i || 0) - 1);
            renderOverlay();
            coverPickLoad();
            return true;
        case "season-toggle": {
            if (b) patch(mid, { bySeason: !seasonsOn(b) }, "Seasons");
            return true;
        }
        case "season-add": {
            const S = b?.seasons || [];
            patch(mid, { seasons: [...S, { n: S.length + 1, status: "want" }] }, "Add season");
            return true;
        }
        case "season-del": {
            patch(
                mid,
                { seasons: (b?.seasons || []).filter((_, i) => i !== Number(k)).map((x, i) => ({ ...x, n: i + 1 })) },
                "Remove season"
            );
            return true;
        }
        case "season-avg": {
            const S = (b?.seasons || []).filter(x => x.rating);
            if (S.length)
                patch(
                    mid,
                    { rating: Math.round((S.reduce((a, x) => a + Number(x.rating), 0) / S.length) * 10) / 10 },
                    "Score from seasons"
                );
            return true;
        }
        case "item-refresh":
            itemRefresh(mid);
            return true;
        case "delete-yes": {
            if (!b) return true;
            const bid = mid,
                title = titleOf(b);
            closeModal();
            removeFromQueue(bid);
            const linked = (b.links || []).map(l => l.id).filter(x => items.has(x));
            change("Delete " + title, [bid, ...linked], (x, xid) =>
                xid === bid ? null : x ? { ...x, links: (x.links || []).filter(l => l.id !== bid) } : undefined
            );
            meta.favOrder = meta.favOrder.filter(x => x !== bid);
            meta.lists = meta.lists.map(l => ({ ...l, ids: l.ids.filter(x => x !== bid) }));
            if (vault.ids.delete(bid)) vault.sealDue = true;
            markDirty();
            toast("Deleted " + title, { label: "Undo", fn: undo });
            return true;
        }
        case "toggle-buy":
            patch(mid, { toBuy: !b?.toBuy }, "Plan to buy");
            return true;
        case "rate-half": {
            const r = b?.rating || 0;
            if (!r) return true;
            patch(mid, { rating: r % 1 ? Math.floor(r) : Math.max(0.5, r - 0.5) }, "Score");
            return true;
        }
        case "untag":
            change("Remove tag " + k, mid, x => (x ? { ...x, tags: x.tags.filter(y => y !== k) } : undefined));
            return true;
        case "item-private":
            if (!vault.key) {
                closeModal();
                goList("private");
                toast("Unlock your private list first.");
                return true;
            }
            m.id = makePrivate(mid);
            render();
            toast("Now private and encrypted");
            return true;
        case "item-public":
            m.id = makePublic(mid);
            render();
            toast("Moved out of your private list");
            return true;
        case "reread":
            if (!b) return true;
            change(verbOf(b.medium)[1], mid, x =>
                x
                    ? {
                          ...x,
                          status: "redo",
                          repeat: (x.repeat || 0) + 1,
                          reads: [
                              ...(x.reads || []),
                              { startedAt: x.startedAt, finishedAt: x.finishedAt, rating: x.rating || undefined },
                          ],
                          startedAt: nowISO(),
                          finishedAt: null,
                          prog: 0,
                          epsSeen: [],
                      }
                    : undefined
            );
            return true;
        case "log-del":
            change("Remove session", mid, x =>
                x ? { ...x, log: x.log.filter((_, i) => i !== Number(k)) } : undefined
            );
            return true;
        case "quote-del":
            change("Remove quote", mid, x =>
                x ? { ...x, quotes: x.quotes.filter((_, i) => i !== Number(k)) } : undefined
            );
            return true;
        case "journal-del":
            change("Remove journal entry", mid, x =>
                x ? { ...x, journal: x.journal.filter((_, i) => i !== Number(k)) } : undefined
            );
            return true;
        // connections
        case "link-similar":
            linkItems(mid, k, "similar");
            return true;
        case "unlink":
            unlinkItems(mid, k);
            return true;
        case "adapt-find": {
            if (!b) return true;
            m.busy = "adapt";
            stateChanged("ui");
            try {
                const q = b.ext.wikidata || (await wdFind((b.alt && b.alt.en) || b.title, b.medium, b.year));
                if (q && !b.ext.wikidata) quietPatch(mid, { ext: { ...b.ext, wikidata: q } });
                const keys = libraryKeys();
                m.adapt = q
                    ? (await wdAdaptations([q]))
                          .map(r => ({ ...r, medium: wdMediumOf(r.desc) || "" }))
                          .filter(r => r.medium && !owned(r.title, keys))
                    : [];
            } catch (_) {
                m.error = "Couldn't reach Wikidata.";
            }
            m.busy = false;
            stateChanged("ui");
            return true;
        }
        case "adapt-add": {
            const r = m.adapt?.[Number(k)];
            if (!r) return true;
            m.adapt?.splice(Number(k), 1);
            stateChanged("ui");
            await addFromWikidata({ ...r, qid: textOf(r.qid) }, mid);
            return true;
        }
        case "find-art": {
            const bid = mid,
                it = items.get(bid);
            if (!it) return true;
            const ctl = new AbortController();
            m.artSaved = null;
            m.busy = "art";
            m.error = "";
            m.art = null;
            m.ctl = ctl;
            stateChanged("ui");
            try {
                const r = await allArt(it, ctl.signal, s => {
                    m.status = s;
                    stateChanged("ui");
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
                    p: Partial<Item> = {},
                    olKey = textOf(mt?.olKey);
                if (mt && cur) {
                    if (!cur.year && mt.year) p.year = mt.year;
                    if (!cur.total && mt.total) p.total = mt.total;
                    if (olKey && !cur.ext.olKey) p.ext = { ...cur.ext, olKey };
                    if (!cur.about && olKey) {
                        const d = await olDescription(olKey);
                        if (d) p.about = d;
                    }
                }
                if (Object.keys(p).length) patch(bid, p, "Fill in details");
            } catch (err) {
                if (errName(err) !== "AbortError") m.error = "Couldn't reach the artwork sources. Are you online?";
            }
            m.busy = false;
            stateChanged("ui");
            return true;
        }
        case "spine-clear":
            patch(mid, { spineArt: null, spinePicked: true }, "Spine from the cover");
            return true;
        case "uncover":
            patch(
                mid,
                { cover: null, coverData: null, coverChecked: true, coverColor: null, coverPicked: true },
                "Remove cover"
            );
            return true;
        case "rc-stop":
            if (m.ctl) m.ctl.abort();
            return true;
    }
    return false;
}
