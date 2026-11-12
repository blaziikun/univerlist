// src/features/core/store.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  The store: the app's state, for Svelte
//
//  One place for components to read your library (items), everything else you keep (meta) and where you are (ui), and
//  to change them. Reading through the store is what makes a component redraw when that part changes:
//      const done = $derived([...store.items.values()].filter(it => it.status === "done").length);
//
//  Why it wraps core.ts's objects instead of replacing them: the older code changes those objects directly
//  (`meta.settings.x = y`, then markDirty()). Svelte's $state works by handing out a proxy, and changes made to the
//  plain object behind a proxy aren't seen through it. So the objects stay where they are, and the store keeps a
//  version number per part that the older code bumps after every change (core.ts stateChanged). A component that reads
//  store.items depends on items' version, and redraws when it moves.
//
//  One catch: a part's inner objects are changed in place too, so keeping one in a $derived shows nothing new (Svelte
//  sees the same object and skips the redraw). Keep a copy instead, or read it where it's used:
//      const S = $derived({ ...store.meta.settings });      ✓ redraws when settings change
//      const S = $derived(store.meta.settings);             ✗ the same object every time: never redraws
//  As features move to Svelte, their writes go through the actions below. Once no older code writes a part any more,
//  that part can become real $state here, and no component has to change.
// ─────────────────────────────────────────────────────────────────

import { flushSync } from "svelte";
import type { Item, Meta, Modal, Part, Ui } from "./model";
import { changeListeners, items, markDirty, meta, ui } from "./core";
import { render } from "./navigation";

const version = $state<Record<Part, number>>({ items: 0, meta: 0, ui: 0 });
// your entries' changes, taken in once a frame (store.itemsByFrame): entries change in the background one at a time
// (covers arriving, a sync, an import), and something that works a lot out from them (a page of blocks, hundreds of
// covers) would otherwise do it once per change
const framed = $state({ n: 0 });
let frameAsked = false;

// A burst of changes (an import adds thousands of items) becomes one update, once the code making them has finished.
const pending = new Set<Part>();
function changed(part: Part) {
    if (!pending.size) queueMicrotask(publish);
    pending.add(part);
}
function publish() {
    if (pending.has("items") && !frameAsked) {
        frameAsked = true;
        requestAnimationFrame(() => {
            frameAsked = false;
            framed.n++;
        });
    }
    for (const part of pending) version[part]++;
    pending.clear();
}
changeListeners.push(changed);

/** reading a part's version is what subscribes whoever is reading (a component, a $derived) to that part */
const watch = (part: Part) => version[part];

export const store = {
    /** your library, by id */
    get items(): ReadonlyMap<string, Item> {
        watch("items");
        return items;
    },
    /** your library, for something that works a lot out from all of it: read where store.items would be, it brings
     *  changes to your entries at most once a frame. Read store.ui beside it, and a redraw that's asked for (render())
     *  still brings everything at once */
    get itemsByFrame(): ReadonlyMap<string, Item> {
        void framed.n;
        return items;
    },
    item(id: string): Item | undefined {
        watch("items");
        return items.get(id);
    },
    /** everything you keep that isn't a library entry: profile, lists, modes, settings… */
    get meta(): Readonly<Meta> {
        watch("meta");
        return meta;
    },
    /** where you are: page, mode, tab, filters */
    get ui(): Readonly<Ui> {
        watch("ui");
        return ui;
    },

    // ── changing things: the same steps the older code takes, so saving and every cache stay right ──
    /** change an entry: it's saved, and everything showing it redraws */
    updateItem(id: string, change: Partial<Item>) {
        const it = items.get(id);
        if (!it) return;
        Object.assign(it, change);
        markDirty(id);
        render();
    },
    /** change what you keep: saved, and redrawn */
    updateMeta(change: (m: Meta) => void) {
        change(meta);
        markDirty();
        render();
    },
    /** go somewhere in the app (not saved) */
    go(change: Partial<Ui>) {
        Object.assign(ui, change);
        render();
    },
    /** change the open dialog's own state (its tab, what's unfolded, what's loading): not saved, and only the dialog
     *  redraws. Given the dialog it was meant for (`m`), a change that arrives after that dialog has closed is dropped */
    dialog(change: Partial<Modal>, m: Modal | null = ui.modal) {
        if (!m) return;
        Object.assign(m, change);
        if (m === ui.modal) changed("ui");
    },
    /** draw what has changed now rather than a moment later: before moving focus into something just drawn. Name a
     *  part when it was changed in place without saying so (renderOverlay(), after the older code set ui.modal.tab) */
    flush(part?: Part) {
        if (part) changed(part);
        // asked from inside a redraw (a box Svelte removes sends "change" as it goes, and a listener redraws the page):
        // the redraw under way picks the change up, a moment later
        if ($effect.tracking()) return;
        publish();
        flushSync();
    },
};
