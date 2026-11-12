// src/features/library/page/live.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  Live: the size and spacing while you drag their sliders (ViewOptions.svelte)
//
//  The shelves follow the slider as it moves (their --z and --gz), without working the whole page out again on every
//  step; letting go keeps the new size in the mode and draws the page once.
// ─────────────────────────────────────────────────────────────────

class Live {
    z = $state<number | null>(null);
    gap = $state<number | null>(null);
    set(k: "z" | "gap", v: number) {
        this[k] = v;
    }
    clear() {
        this.z = null;
        this.gap = null;
    }
}
export const live = new Live();
