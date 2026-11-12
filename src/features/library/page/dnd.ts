// src/features/library/page/dnd.ts
// ─────────────────────────────────────────────────────────────────
//  Dragging on the library page: what a drop does
//
//  LibraryPage.svelte follows the drag (native drag and drop, and the box you drag over covers to select them);
//  these make the change, through the same saves as everything else, so it can be undone.
//    moveTiles   covers dropped beside another: your Shelf order (with Ranking, your order among equal scores)
//    groupMove   covers dropped on a group's plaque: a new status or type
//    orderDrop   while arranging: one cover dropped on another, to put it there
//  Each works from the groups as sorted, not from what's drawn, so a long shelf that draws only part of itself (a big
//  library) keeps the order of the tiles you can't see.
// ─────────────────────────────────────────────────────────────────

import {
    change,
    changeMeta,
    clone,
    curMode,
    isStatus,
    items,
    KINDS,
    markDirty,
    meta,
    nowISO,
    plural,
    statusWord,
    toast,
    undo,
} from "../../core/core";
import { curSort } from "../../core/views";
import { renderMain } from "../../core/shell";
import type { LibGroup } from "../library";

/** the group an entry is shown in, and the order it's in */
const groupOf = (groups: LibGroup[], id: string) => groups.find(g => g.items.some(b => b.id === id));
/** the saved order a group's sort keeps: your ranking among equal scores, or your shelf */
const orderKey = (sort: string): "myOrder" | "orders" => (sort === "rank" || sort === "mine" ? "myOrder" : "orders");

/** put covers where you dropped them: your Shelf order (or, with Ranking, your order among equal scores) */
export function moveTiles(groups: LibGroup[], ids: string[], to: string, after: boolean) {
    const mode = curMode(),
        gs = groupOf(groups, to)?.sort || curSort();
    let key = orderKey(gs);
    if (!["shelf", "rank", "mine"].includes(gs)) {
        mode.sort = "shelf";
        mode.gsort = {};
        key = "orders";
        toast("Switched to Shelf order so your arrangement stays");
    }
    const before = clone(meta[key] || {}),
        cur = groups.flatMap(g => g.items.map(b => b.id)).filter(x => !ids.includes(x)),
        i = cur.indexOf(to);
    cur.splice(i < 0 ? cur.length : i + (after ? 1 : 0), 0, ...ids);
    meta[key] = { ...(meta[key] || {}), [mode.id]: cur };
    markDirty();
    renderMain();
    const back = {
        label: "Undo",
        fn: () => {
            meta[key] = before;
            markDirty();
            renderMain();
        },
    };
    if (key === "myOrder" && ids.some(id => items.get(id)?.rating !== items.get(to)?.rating))
        toast("Moved. Ranking puts higher scores first, so your order only shows among equal scores.", back);
    else toast(`Moved ${plural(ids.length, "entry")}`, back);
}

/** whether these entries can be dropped on this group ("status:done", "type:game:RPG", "kind:Manga") */
export function groupMoveOk(key: string, ids: string[]) {
    const [g, ...rest] = key.split(":"),
        v = rest.join(":");
    if (g === "status") return isStatus(v);
    if (g === "type") {
        const [med] = v.split(":");
        return ids.every(id => items.get(id)?.medium === med);
    }
    if (g === "kind")
        return (
            !Array.isArray(curMode().shelves) && ids.every(id => (KINDS[items.get(id)?.medium || ""] || []).includes(v))
        );
    return false;
}
export function groupMove(key: string, ids: string[]) {
    if (!groupMoveOk(key, ids)) return toast("That grouping can't be changed by dragging.");
    const [g, ...rest] = key.split(":"),
        v = rest.join(":");
    if (g === "status") {
        if (isStatus(v))
            change(`Move ${plural(ids.length, "entry")} to ${statusWord(v)}`, ids, x =>
                x
                    ? {
                          ...x,
                          status: v,
                          ...(v === "done" && !x.finishedAt ? { finishedAt: nowISO() } : {}),
                          ...(v === "active" && !x.startedAt ? { startedAt: nowISO() } : {}),
                          ...(v === "dnf" ? { droppedAt: nowISO() } : {}),
                      }
                    : undefined
            );
    } else {
        const kind = g === "type" ? v.split(":").slice(1).join(":") : v;
        change(`Set type of ${plural(ids.length, "entry")}`, ids, x => (x ? { ...x, kind } : undefined));
    }
    toast(`Moved ${plural(ids.length, "entry")}`, { label: "Undo", fn: undo });
    renderMain();
}

/** while arranging: drag any cover onto another to put it there (undoable) */
export function orderDrop(groups: LibGroup[], from: string, to: string) {
    if (from === to) return;
    const mode = curMode(),
        grp = groupOf(groups, to),
        key = grp ? orderKey(grp.sort) : "orders";
    const shown = grp ? grp.items.map(b => b.id) : groups.flatMap(g => g.items.map(b => b.id)),
        was = shown.indexOf(from),
        at = shown.indexOf(to);
    if (was < 0 || at < 0) return;
    const a = shown.filter(x => x !== from);
    a.splice(a.indexOf(to) + (was < at ? 1 : 0), 0, from);
    if (key === "myOrder") {
        const A = items.get(from),
            B = items.get(to);
        if (A && B && (A.rating || 0) !== (B.rating || 0))
            toast("Ranking keeps scores first: dragging reorders things with the same score.");
    }
    changeMeta(key === "myOrder" ? "Reorder my ranking" : "Arrange shelf", key, O => {
        const old = ((O || {})[mode.id] || []).filter(x => !a.includes(x));
        return { ...(O || {}), [mode.id]: [...a, ...old] };
    });
}
