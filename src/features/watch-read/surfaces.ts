// src/features/watch-read/surfaces.ts
// ─────────────────────────────────────────────────────────────────
//  The player and the reader, as main.ts hands them to the older code
//
//  Both sit over everything, on <body>: the player (#cinema, player/Cinema.svelte) while something plays, the reader
//  (#reader, reader/Reader.svelte) while a book is open. watch.ts and read.ts open and close them (renderPlayer,
//  renderReader) through these, so they never import the components that import them. Each is mounted when it opens
//  and let go when it closes, so nothing of it stays in memory.
// ─────────────────────────────────────────────────────────────────

import { type Component, flushSync, mount, unmount } from "svelte";
import Cinema from "./player/Cinema.svelte";
import Reader from "./reader/Reader.svelte";

/** one component on <body>, there only while it's needed */
function surface(C: Component) {
    let app: ReturnType<typeof mount> | null = null;
    return {
        show() {
            if (app) return;
            app = mount(C, { target: document.body });
            flushSync();
        },
        hide() {
            if (!app) return;
            const a = app;
            app = null;
            unmount(a);
        },
    };
}
export const playerSurface = surface(Cinema);
export const readerSurface = surface(Reader);
