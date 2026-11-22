// src/features/library/handlers.ts
// ─────────────────────────────────────────────────────────────────
//  The library page: what its buttons do
//
//  Filters and views, selecting several things at once, the overview blocks, and the right-click menu. core/actions.ts
//  calls libraryClick() for every button with a data-act; it returns true when the button is one of these. e is the
//  click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import {
    $,
    $$,
    change,
    changeMeta,
    clone,
    curMode,
    isStatus,
    items,
    markDirty,
    meta,
    modeById,
    nowISO,
    patch,
    plural,
    present,
    quietPatch,
    toast,
    ui,
    undo,
    vault,
} from "../core/core";
import { coverSrc, scoreQ } from "../sources/covers";
import { curView, modeItems, VIEW_ALIAS, viewOpts } from "../core/views";
import { combineItems } from "../core/parts";
import { renderMain, renderSide } from "../core/shell";
import { FILT_EMPTY, isFiltList, listOrder, VIEW_LIST } from "./library";
import { BKIND, blockAdded, blocksOf, setBlocks } from "./blocks";
import { openModal, renderOverlay } from "../core/modals";
import { setTier, tierPlace, tierSel } from "./tiers";
import { closeCtx, openMenu, refreshCtx } from "../core/keys";
import { afterChange, goLib, goList, goSettings, goStats, goTab, render } from "../core/navigation";
import { makePrivate, newListId, openItem, patchChar, queueAdd, setStatus, toggleFav } from "./item-actions";
import { coverPickLoad } from "../core/events";
import type { ActEl } from "../core/core";
import type { Modal } from "../core/model";

// the entry the right-click menu is open on
const ctxId = () => $("#ctx")?.dataset.id || "";
const viewName = (v: string) => VIEW_LIST.find(x => x[0] === v)?.[1];
export function libraryClick(
    _e: Event,
    t: ActEl,
    act: string,
    key: string | undefined,
    _id: string | undefined,
    m: Modal | null
): boolean {
    const k = key ?? "";
    switch (act) {
        case "filter-toggle":
            ui.filterOpen = !ui.filterOpen;
            if (ui.tab !== "library") goTab("library");
            else renderMain();
            return true;
        case "filt-tog": {
            const f = { ...FILT_EMPTY(), ...(ui.filt || {}) },
                list = t.dataset.f;
            ui.filt = f;
            if (!isFiltList(list)) return true;
            const arr = (f[list] = (f[list] || []).slice()),
                i = arr.indexOf(k);
            if (i < 0) arr.push(k);
            else arr.splice(i, 1);
            ui.viewId = null;
            renderMain();
            return true;
        }
        case "filt-adv":
            ui.filtAdv = !!k;
            renderMain();
            return true;
        case "rule-add": {
            const f = { ...FILT_EMPTY(), ...(ui.filt || {}) };
            ui.filt = f;
            f.rules = [...(f.rules || []), { f: "crowd", op: "ge", v: "" }];
            renderMain();
            return true;
        }
        case "rule-del": {
            const f = ui.filt;
            f.rules = (f.rules || []).filter((_, i) => i !== Number(k));
            renderMain();
            return true;
        }
        case "rule-any":
            ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}), any: !!k };
            renderMain();
            return true;
        case "filt-clear":
        case "clear-filters":
            ui.filt = FILT_EMPTY();
            ui.status = "all";
            ui.q = "";
            renderMain();
            return true;
        case "view-default": {
            const v = curView();
            if (k === "mode") {
                curMode().view = v;
                toast(`${curMode().name} opens in ${viewName(v)} view`);
            } else {
                const dv =
                    k === "all-default"
                        ? VIEW_ALIAS[meta.settings.defaultView] || meta.settings.defaultView || "cover"
                        : v;
                meta.settings.defaultView = dv;
                for (const md of meta.modes) md.view = dv;
                toast(`Every mode opens in ${viewName(dv)} view`);
            }
            ui.pop = null;
            markDirty();
            renderMain();
            return true;
        }
        case "vz-all": {
            const md = curMode(),
                v = curView(md),
                o = viewOpts(md, v);
            for (const x of meta.modes)
                x.vz = { ...(x.vz || {}), [v]: { ...((x.vz || {})[v] || {}), z: o.z, gap: o.gap } };
            ui.pop = null;
            markDirty();
            renderMain();
            toast(`Every mode's ${v} view now uses this size and spacing`);
            return true;
        }
        case "blk-edit": {
            const kd = t.dataset.bkind || "ov";
            ui.blocksEdit = ui.blocksEdit === kd ? null : kd;
            renderMain();
            return true;
        }
        case "blk-addopen":
            ui.blockAdd = t.dataset.bkind || "ov";
            renderMain();
            return true;
        case "blk-addclose":
            ui.blockAdd = null;
            renderMain();
            return true;
        case "blk-add": {
            const kd = t.dataset.bkind || "ov",
                d = BKIND[kd].reg()[k];
            if (!d) return true;
            ui.blockAdd = null;
            Object.assign(blockAdded, { kind: kd, at: Date.now() }); // a grid drawn by Svelte flashes it itself
            setBlocks(curMode(), B => [...B, { k, w: d.w, rows: d.rows }], kd);
            toast(`Added ${d.name}`);
            requestAnimationFrame(() => {
                const L = $$(`.blocks[data-bkind="${kd}"] .blk`),
                    el = L[L.length - 1];
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    if (el.closest("[data-svelte]")) return;
                    el.classList.add("justadded");
                    setTimeout(() => el.classList.remove("justadded"), 1400);
                }
            });
            return true;
        }
        case "blk-del": {
            const kd = t.dataset.bkind || "ov",
                mode = curMode(),
                cfg = blocksOf(mode, kd)[Number(k)];
            if (!cfg) return true;
            const name = cfg.title || BKIND[kd].reg()[cfg.k].name,
                before = clone(mode[BKIND[kd].key] || null);
            closeCtx();
            setBlocks(mode, B => B.filter((_, i) => i !== Number(k)), kd);
            toast(`Removed ${name}`, {
                label: "Undo",
                fn: () => {
                    mode[BKIND[kd].key] = before;
                    markDirty();
                    renderMain();
                },
            });
            return true;
        }
        case "blk-w":
            setBlocks(
                curMode(),
                B => B.map((x, i) => (i === Number(k) ? { ...x, w: Number(t.dataset.w) } : x)),
                t.dataset.bkind || "ov"
            );
            return true;
        case "blk-rows": {
            const kd = t.dataset.bkind || "ov";
            setBlocks(
                curMode(),
                B =>
                    B.map((x, i) =>
                        i === Number(k)
                            ? {
                                  ...x,
                                  rows: Math.max(
                                      1,
                                      Math.min(8, (x.rows || BKIND[kd].reg()[x.k].rows || 2) + Number(t.dataset.d))
                                  ),
                              }
                            : x
                    ),
                kd
            );
            return true;
        }
        case "blk-n":
            setBlocks(
                curMode(),
                B => B.map((x, i) => (i === Number(k) ? { ...x, n: Number(t.dataset.n) } : x)),
                t.dataset.bkind || "ov"
            );
            return true;
        case "blk-type":
            setBlocks(
                curMode(),
                B => B.map((x, i) => (i === Number(k) ? { ...x, type: t.dataset.t } : x)),
                t.dataset.bkind || "ov"
            );
            return true;
        case "blk-move": {
            const kd = t.dataset.bkind || "ov",
                i = Number(k),
                j = i + Number(t.dataset.d);
            setBlocks(
                curMode(),
                B => {
                    if (j < 0 || j >= B.length) return B;
                    [B[i], B[j]] = [B[j], B[i]];
                    return B;
                },
                kd
            );
            closeCtx();
            return true;
        }
        case "blk-dup":
            setBlocks(
                curMode(),
                B => {
                    B.splice(Number(k) + 1, 0, { ...B[Number(k)] });
                    return B;
                },
                t.dataset.bkind || "ov"
            );
            closeCtx();
            return true;
        case "blk-menu": {
            const r = t.getBoundingClientRect();
            openMenu("block", `${t.dataset.bkind || "ov"}:${Number(k)}`, r.right - 290, r.bottom + 6, {
                label: "Block settings",
            });
            return true;
        }
        case "blk-share": {
            const kd = t.dataset.bkind || "ov",
                K = BKIND[kd],
                mode = curMode(),
                L = clone(blocksOf(mode, kd));
            meta.layout.shared = { ...(meta.layout.shared || {}), [K.key]: L };
            for (const md of meta.modes) if (md !== mode) delete md[K.key];
            mode[K.key] = null;
            markDirty();
            renderMain();
            toast(`Every mode now uses this ${K.word} layout. Change one mode's layout and it keeps its own.`);
            return true;
        }
        case "blk-unown": {
            const kd = t.dataset.bkind || "ov";
            curMode()[BKIND[kd].key] = null;
            markDirty();
            renderMain();
            return true;
        }
        case "blk-reset":
            curMode().blocks = null;
            ui.blockAdd = null;
            markDirty();
            renderMain();
            return true;
        case "health-dupes":
            goStats("dupes");
            return true;
        case "health-covers": {
            const queue = modeItems()
                .filter(b => !coverSrc(b))
                .map(b => b.id);
            if (queue.length) {
                openModal("coverpick", { queue, i: 0, cands: {}, picked: 0 });
                coverPickLoad();
            }
            return true;
        }
        case "health-unscored":
            goLib({ status: "done" });
            ui.filt = { ...FILT_EMPTY(), unscored: true };
            renderMain();
            return true;
        case "health-stale":
            goLib({ status: "active" });
            ui.sortOnce = "added";
            return true;
        case "ctx-status": {
            if (isStatus(k)) setStatus(ctxId(), k);
            refreshCtx();
            return true;
        }
        case "ctx-fav":
            toggleFav(ctxId());
            refreshCtx();
            return true;
        case "ctx-queue": {
            const iid = ctxId();
            if (meta.queue.includes(iid)) changeMeta("Remove from Up next", "queue", q => q.filter(x => x !== iid));
            else queueAdd(iid);
            refreshCtx();
            return true;
        }
        case "ctx-lists": {
            const iid = ctxId();
            closeCtx();
            openModal("listpick", { id: iid });
            return true;
        }
        case "ctx-hide": {
            const iid = ctxId(),
                b = items.get(iid);
            if (!b) return true;
            patch(iid, { hidden: !b.hidden || undefined }, b.hidden ? "Show in lists" : "Hide from lists");
            closeCtx();
            toast(b.hidden ? "Back in your lists" : "Hidden. Find it on the Hidden list in the sidebar.", {
                label: "Undo",
                fn: undo,
            });
            return true;
        }
        case "ctx-open": {
            const iid = k || ctxId();
            closeCtx();
            openItem(iid);
            return true;
        }
        case "ctx-char-open":
            closeCtx();
            openModal("char", { id: k });
            return true;
        case "ctx-char-top":
            changeMeta("Move to the top", "chars", L => {
                const s = L.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999)),
                    me = s.find(c => c.id === k);
                return [me, ...s.filter(c => c.id !== k)].filter(present).map((c, i) => ({ ...c, rank: i + 1 }));
            });
            closeCtx();
            return true;
        case "ctx-char-setgroup":
            patchChar(k, { group: t.dataset.g }, "Character group");
            refreshCtx();
            return true;
        case "ctx-char-del": {
            closeCtx();
            changeMeta("Remove character", "chars", L =>
                L.filter(x => x.id !== k).map((x, i) => ({ ...x, rank: i + 1 }))
            );
            toast("Removed", { label: "Undo", fn: undo });
            return true;
        }
        case "ctx-list-open":
            closeCtx();
            goList(k);
            return true;
        case "ctx-list-dup": {
            closeCtx();
            const l = meta.lists.find(x => x.id === k),
                nid = newListId();
            if (!l) return true;
            changeMeta("Duplicate list", "lists", L => [
                ...L,
                { ...clone(l), id: nid, name: l.name + " copy", created: nowISO() },
            ]);
            toast("Duplicated");
            return true;
        }
        case "ctx-list-num":
            changeMeta("List order", "lists", L => L.map(l => (l.id === k ? { ...l, numbered: !l.numbered } : l)));
            refreshCtx();
            return true;
        case "ctx-list-del": {
            closeCtx();
            if (ui.listId === k) ui.listId = null;
            changeMeta("Delete list", "lists", L => L.filter(l => l.id !== k));
            toast("Deleted the list", { label: "Undo", fn: undo });
            return true;
        }
        case "ctx-mode-edit":
            closeCtx();
            ui.editMode = k;
            goSettings("modes");
            return true;
        case "ctx-mode-start":
            closeCtx();
            meta.settings.startMode = k;
            markDirty();
            toast(`UniverList will open in ${modeById(k).name}`);
            return true;
        case "ctx-tier-forget": {
            const L = meta.lists.find(x => x.id === ui.listId);
            if (L)
                setTier(
                    L.id,
                    X => {
                        for (const r of X.rows) r.ids = r.ids.filter(i => i !== k);
                        if (X.ents) delete X.ents[k];
                        return X;
                    },
                    "Remove"
                );
            closeCtx();
            return true;
        }
        case "ctx-tier": {
            const L = meta.lists.find(x => x.id === ui.listId);
            const keys = tierSel.has(k) && tierSel.size > 1 ? [...tierSel] : [k];
            if (L) tierPlace(L.id, keys, t.dataset.row === "pool" ? "pool" : Number(t.dataset.row));
            closeCtx();
            return true;
        }
        case "stats-view":
            goStats(k);
            return true;
        case "uni-exclude": {
            const X = (meta.layout.uniExclude = meta.layout.uniExclude || []);
            const i = X.indexOf(k);
            if (i < 0) X.push(k);
            else X.splice(i, 1);
            markDirty();
            renderSide();
            renderMain();
            return true;
        }
        case "arrange":
            ui.arrange = !ui.arrange;
            if (ui.arrange) {
                ui.selecting = false;
                ui.sel.clear();
            }
            renderMain();
            return true;
        case "char-group":
            patchChar(m?.id || "", { group: k }, "Character group");
            renderOverlay();
            return true;
        case "select-toggle":
            ui.selecting = !ui.selecting;
            ui.sel.clear();
            ui.confirmBulkDelete = false;
            renderMain();
            return true;
        case "sel-all":
            for (const x of listOrder) ui.sel.add(x);
            renderMain();
            return true;
        case "sel-none":
            ui.sel.clear();
            renderMain();
            return true;
        case "bulk-queue":
            queueAdd([...ui.sel]);
            return true;
        case "bulk-combine": {
            const keep = combineItems([...ui.sel]);
            if (keep) {
                ui.selecting = false;
                renderMain();
            }
            return true;
        }
        case "bulk-tier":
            openModal("tierpick", { ids: [...ui.sel] });
            return true;
        case "bulk-refresh": {
            const ids = [...ui.sel];
            for (const i of ids) quietPatch(i, { scoresAt: null });
            scoreQ.stopped = false;
            scoreQ.start();
            toast(`Refreshing scores for ${ids.length} in the background`);
            return true;
        }
        case "bulk-private": {
            const ids = [...ui.sel].filter(i => !vault.ids.has(i));
            for (const i of ids) makePrivate(i);
            ui.sel.clear();
            render();
            toast(`Moved ${plural(ids.length, "entry", "entries")} to your private list`);
            return true;
        }
        case "bulk-delete":
            ui.confirmBulkDelete = true;
            renderMain();
            return true;
        case "bulk-delete-no":
            ui.confirmBulkDelete = false;
            renderMain();
            return true;
        case "bulk-delete-yes": {
            const ids = [...ui.sel];
            meta.queue = meta.queue.filter(x => !ids.includes(x));
            change(`Delete ${ids.length}`, ids, () => null);
            ui.sel.clear();
            ui.confirmBulkDelete = false;
            afterChange();
            toast(`Deleted ${ids.length}`, { label: "Undo", fn: undo });
            return true;
        }
    }
    return false;
}
