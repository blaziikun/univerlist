// tests/hook.d.ts
// ─────────────────────────────────────────────────────────────────
//  The test hook as the browser tests see it: window.__ulTest, typed by what the page puts there
//  (src/features/core/test-hook.ts), and what a test leaves on the page for itself to read back later.
// ─────────────────────────────────────────────────────────────────
import type Axe from "axe-core";
import type { TestHook } from "../src/features/core/test-hook";

declare global {
    // the test builds only (pnpm build:e2e); in the page, inside page.evaluate
    var __ulTest: TestHook;
    // a11y: axe-core, once the test has put its script on the page
    var axe: typeof Axe;

    // a test's own notes on the page, each set by the test before it reads it
    interface Window {
        __ab: [string, string]; // sweep: the two entries combined
        __bad: string[]; // xss: links that would run script
        __blobs: number; // memory: object URLs made and not yet let go
        __csp: string[]; // csp: what the page's policy blocked
        __ctx: ({ path: string } & Record<string, unknown>)[]; // watch-card-sources: what the extension was asked
        // dialogs: the last right-click
        __ctxAt: { act?: string; id?: string; x: number; y: number; scrollY: number } | null;
        __ctxClosed: number; // dialogs: how often the menu closed
        __id: string; // watch-card-sources: the show
        __kept: WeakSet<Element>; // elements a test checks are still the same ones after the page draws again
        __laned?: number; // blocks-stats-tiers: set by a link that mustn't run
        __long: number[]; // library-load: long tasks, in ms
        __path: string; // watch-card-sources: where the extension was asked from
        __pwned?: number; // csp: set only if a script that mustn't run did
        __renders: number; // how often the page was drawn again
        __rm: TestHook["renderMain"]; // the page's own renderMain, kept while a test counts its redraws
        __seen: string[]; // backup-passphrase: the dialog's lines while it worked
        __videos: number; // player-keeps-playing: <video> elements added
        __watcher: MutationObserver; // player-keeps-playing: what counts them
        __x?: number; // xss: set only if an attack ran
        __ulSawSecret(b64: string): void; // sync-server: a passkey's secret, handed to the test (exposeBinding)
    }
}
