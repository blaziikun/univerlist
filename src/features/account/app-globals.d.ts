// src/features/account/app-globals.d.ts
// ─────────────────────────────────────────────────────────────────
//  What the account feature adds to the page for the classic scripts and tests (ulSync.now: sync right now).
//  The classic scripts' own globals it uses are in core/globals.d.ts.
// ─────────────────────────────────────────────────────────────────

declare global {
    interface Window {
        ulSync?: { now: () => Promise<void> };
    }
}
export {};
