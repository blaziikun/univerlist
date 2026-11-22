// src/features/library/tiles/watch.ts
// ─────────────────────────────────────────────────────────────────
//  Watch: for a tile component's $derived
//
//  What a tile shows depends on more than its entry: the size and spacing, the theme, titles in your language,
//  pictures saved for offline, the scores' scale. Reading this in a tile's $derived works it out again whenever any of
//  that changes. Changes to entries come once a frame (a page can hold hundreds of tiles, and covers arrive one at a
//  time); a redraw that's asked for (render(), which tells the store where you are) still reaches every tile at once.
//  (Apart from tiles.ts, which the older modules load early, before the store can be.)
// ─────────────────────────────────────────────────────────────────

import { store } from "../../core/store.svelte";

export const tilesWatch = () => {
    void store.itemsByFrame;
    void store.meta;
    void store.ui;
};
