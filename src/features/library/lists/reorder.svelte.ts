// src/features/library/lists/reorder.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  Dragging rows or tiles into another place: a list's rows and Up next (ListView, the overview's Next up), your
//  favourites and characters (FavouritesPage)
//
//  One per kind of thing on a page. The page hands its document's drag events to it (<svelte:document ondragstart…>),
//  and draws the marks it keeps (mark(key): "drag" on what's dragged, "over" on where it would go) as classes, so
//  Svelte never sets back a class set from outside. Dropping one on another puts it before or after that one, as the
//  shared listeners in core/events.ts did: drop() says where, and the page saves it.
// ─────────────────────────────────────────────────────────────────

import { closestTo } from "../../core/core";

export class Reorder {
    /** what's being dragged, and what it's over */
    from = $state<string | null>(null);
    over = $state<string | null>(null);

    /** sel: what can be dragged and dropped on; key: its key (from the element); drop: put from at to */
    constructor(
        private sel: () => string,
        private key: (el: HTMLElement) => string | undefined,
        private drop: (from: string, to: string) => void
    ) {}

    /** the classes to add to a row: "drag", "over", both or none */
    mark(k: string) {
        return (this.from === k ? " drag" : "") + (this.from !== null && this.over === k ? " over" : "");
    }
    start = (e: DragEvent) => {
        const el = closestTo(e, this.sel()),
            k = el ? this.key(el) : undefined;
        if (k === undefined) return;
        this.from = k;
        if (!e.dataTransfer) return;
        e.dataTransfer.effectAllowed = "move";
        try {
            e.dataTransfer.setData("text/plain", k);
        } catch (_) {}
    };
    private target(e: DragEvent) {
        if (this.from === null) return undefined;
        const el = closestTo(e, this.sel());
        return el ? this.key(el) : undefined;
    }
    dragover = (e: DragEvent) => {
        const k = this.target(e);
        if (k === undefined) return;
        e.preventDefault();
        this.over = k;
    };
    end = () => {
        this.from = this.over = null;
    };
    dropped = (e: DragEvent) => {
        const to = this.target(e),
            from = this.from;
        if (to === undefined || from === null) return;
        e.preventDefault();
        this.from = null;
        this.drop(from, to);
    };
}
