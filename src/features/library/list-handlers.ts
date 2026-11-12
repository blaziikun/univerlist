// src/features/library/list-handlers.ts
// ─────────────────────────────────────────────────────────────────
//  Lists: what its buttons do
//
//  Your lists, Up next, tier lists and the head-to-head comparisons.
//  core/actions.ts calls listClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import { changeMeta, linkItems, meta, toast, ui, undo } from "../core/core";
import { rankState } from "../core/views";
import { renderMain } from "../core/shell";
import { franchises } from "./connect";
import { closeModal, openModal } from "../core/modals";
import { tierPlace } from "./tiers";
import { goList, goTab } from "../core/navigation";
import { createList, listIds, listMove, queueAdd, setListIds } from "./item-actions";
import type { ActEl } from "../core/core";
import type { Modal } from "../core/model";

export function listClick(
    _e: Event,
    t: ActEl,
    act: string,
    key: string | undefined,
    id: string | undefined,
    m: Modal | null
): boolean {
    const k = key ?? "";
    switch (act) {
        case "list-pick": {
            const back = m && m.kind === "item" ? { kind: "item", id: m.id, tab: m.tab } : null;
            openModal("listpick", { id: id || m?.id, back });
            return true;
        }
        // lists
        case "list-new":
            openModal("listnew", { ids: ui.selecting ? [...ui.sel] : [], type: k === "tier" ? "tier" : "list" });
            return true;
        case "lp-toggle": {
            const ids = m?.ids || [m?.id || ""],
                l = meta.lists.find(x => x.id === k);
            if (!l) return true;
            const has = ids.every(i => l.ids.includes(i));
            setListIds(
                k,
                a => (has ? a.filter(x => !ids.includes(x)) : [...a, ...ids.filter(x => !a.includes(x))]),
                has ? "Remove from list" : "Add to list"
            );
            return true;
        }
        case "li-add": {
            const lid = k,
                name = lid === "queue" ? "Up next" : meta.lists.find(l => l.id === lid)?.name;
            openModal("pickitem", {
                title: "Add to " + name,
                purpose: "list",
                lid,
                scope: "mode",
                added: new Set(listIds(lid)),
            });
            return true;
        }
        case "li-move":
            listMove(t.dataset.lid || "", id || "", Number(k));
            return true;
        case "li-remove":
            setListIds(t.dataset.lid || "", a => a.filter(x => x !== id), "Remove from list");
            return true;
        case "list-del":
            ui.confirmListDel = true;
            renderMain();
            return true;
        case "list-del-no":
            ui.confirmListDel = false;
            renderMain();
            return true;
        case "list-del-yes": {
            const lid = ui.listId;
            ui.confirmListDel = false;
            ui.listId = null;
            changeMeta("Delete list", "lists", L => L.filter(l => l.id !== lid));
            toast("Deleted the list", { label: "Undo", fn: undo });
            return true;
        }
        case "fr-tolist": {
            const f = franchises().find(x => x.key === k);
            if (!f) return true;
            const lid = createList({
                name: f.name + " order",
                desc: "In release order. Drag to change it.",
                numbered: true,
                ids: f.members.map(b => b.id),
            });
            goList(lid);
            toast("Made a list you can reorder");
            return true;
        }
        // queue
        case "q-add":
            queueAdd(id || "");
            return true;
        case "q-remove":
            changeMeta("Remove from Up next", "queue", q => q.filter(x => x !== id));
            return true;
        // compare
        case "cmp-link":
            if (ui.cmpA && ui.cmpB) linkItems(ui.cmpA, ui.cmpB, "similar");
            toast("Linked as similar");
            return true;
        case "cmp-rank":
            if (ui.cmpA && ui.cmpB) {
                rankState.pair = [ui.cmpA, ui.cmpB];
                rankState.mode = "liked";
                goTab("rank");
            }
            return true;
        // tier lists
        case "tier-new":
            openModal("listnew", { type: "tier" });
            return true;
        case "tier-new-from-sel": {
            const ids = m?.ids;
            closeModal();
            openModal("listnew", { type: "tier", ids });
            return true;
        }
        case "tp-place": {
            const tl = meta.lists.find(x => x.id === k),
                row = Number(t.dataset.row),
                ids = m?.ids || [];
            closeModal();
            if (!tl) return true;
            tierPlace(tl.id, ids, row);
            toast(`Added ${ids.length} to ${tl.name}`, { label: "Open", fn: () => goList(tl.id) });
            return true;
        }
    }
    return false;
}
