// src/features/core/globals.d.ts
// ─────────────────────────────────────────────────────────────────
//  The classic scripts' globals, as TypeScript sees them
//
//  The .js files in src/features share one global scope (order.json), and new code reaches them by name. This says
//  which names exist and their types, so a typo is an error before anything runs. Each line goes once nothing uses it.
// ─────────────────────────────────────────────────────────────────

import type { Item, Meta, Mode, Part, Ui } from "./model";

declare global {
    // ── the state (core/core.js). Svelte code reads it through store.svelte.ts, which knows when it changed ──
    const items: Map<string, Item>;
    const meta: Meta;
    const ui: Ui;
    /** called with what changed, after every change (core/core.js `changed`) */
    const changeListeners: ((part: Part) => void)[];
    const APP_V: number;
    /** where the library is saved in this browser ("idb", "local", or "none": not saved) (core.js) */
    let storage: string;

    // ── what changing it takes: save (markDirty: an item's id, or nothing for meta), then redraw ──
    /** save what changed to this browser now (core.js); resolves once it's written */
    function flushSave(): Promise<void>;
    function markDirty(id?: string): void;
    /** change entries as one undoable step (core.js): fn gets each entry and returns it changed, or null to delete it */
    function change(
        label: string,
        ids: string[],
        fn: (before: Item | null, id: string) => Item | null | undefined,
        opts?: { metaKeys?: string[]; metaBefore?: Record<string, unknown> }
    ): void;
    function render(): void;
    function toast(text: string, action?: { label: string; fn: () => void }): void;
    function snapshot(): object;
    function builtinOn(id: string): boolean;
    function goSettings(section: string): void;
    function setThemeVal(key: string, value: unknown): void;
    /** the theme the current mode shows, all filled in (core/theme.js) */
    function modeTheme(): Record<string, unknown> & { backdrop?: string };
    function renderMain(): void;
    function renderSide(): void;
    function undo(): void;
    function clone<T>(o: T): T;
    function norm(s: string): string;
    function plural(n: number, one: string, many?: string): string;
    /** change one part of meta as an undoable step (core.js) */
    function changeMeta(label: string, key: string, fn: (before: Record<string, unknown>) => unknown): void;
    function modeChanged(): void;
    function applyDensity(): void;
    function modeById(id: string): Mode & { profile?: Record<string, unknown> };
    function allModes(): (Mode & { sealedOnly?: boolean })[];
    function modeProfile(mode: Mode): { name?: string; banner?: string; avatar?: string };
    function avatarHTML(profile: unknown, size?: number, cls?: string): string;
    const coverCache: { src(url: string): string; urls: Set<string>; hostFails: Record<string, unknown> };
    const ICON: Record<string, string>;
    const SCALES: [string, string][];
    // keybinds (core/keys.js)
    const KEY_ACTIONS: [string, string, string[]][];
    function keysOf(id: string): string[];
    function keyLabel(k: string): string;
    // ── Settings (settings/): the section list, and what the sections read from the classic scripts ──
    function setSecs(): [string, string][];
    const SET_ALIAS: Record<string, string>;
    function donateLinkHTML(cls?: string): string;
    function typesSettingsHTML(mode?: Mode): string;
    const APP_NAME: string;
    const SOURCE_URL: string;
    const DEFAULT_SETTINGS: { speeds: Record<string, number> } & Record<string, unknown>;
    // Appearance (core/theme.js, core/shell.js, watch-read/stage.js)
    type Theme = Record<string, string | number> & { name?: string; backdrop?: string };
    function editingMode(): Mode & { g?: string; hidden?: boolean; shelves?: unknown };
    function editThemeId(): string;
    function resolveTheme(id: unknown): Theme;
    function themesUsing(id: string): Mode[];
    function themeList(): [string, Theme][];
    function themeOpts(): [string, string][];
    function themeFmt(key: string, value: unknown): string;
    const THEME_PRESETS: Record<string, Theme>;
    const FONTS: Record<string, [number[], string]>;
    function fontStack(font: string): string;
    const BG_STYLES: [string, string][];
    const BACKDROPS: [string, string][];
    function myBackdropChoices(): [string, string][];
    const SIDE_TEXT: [string, string][];
    function STAGE_LOOKS(): [string, string][];
    function stageLook(): string;
    function keyFor(id: string): string;
    // Modes (core/core.js, core/views.js, settings.js)
    const MEDIA: Record<string, { name: string; one?: string }>;
    const MEDIA_KEYS: string[];
    const DEFAULT_CRITERIA: Record<string, string[]>;
    const SHELF_AUTO: [string, string][];
    const VIEW_LIST: [string, string][];
    const GROUPS: [string, string][];
    const SORTS: [string, string][];
    function isSpace(mode: Mode): boolean;
    function kindToggles(match: string[], medium: string): [string, boolean][];
    function shelvesOf(mode: Mode): { name: string }[];
    function curView(mode: Mode): string;
    function curGroup(mode: Mode): string;
    function curSort(mode: Mode): string;
    function describePats(patterns: string[] | undefined): string;
    function matrixHTML(match: string[], prefix: string, media?: string[]): string;
    // Data, sources & keys (settings.js, sources/, core/shell.js, import-export/)
    let KEYS: Record<string, string>;
    const siteShares: { tmdb: boolean; igdb: boolean };
    const KEY_INFO: Record<string, [string, string, string, string]>;
    function testKey(which: string): Promise<string>;
    function offlineTargets(): string[];
    function gamesUpdateHTML(): string;
    function pxStatusHTML(): string;
    function statusPanelHTML(): string;
    const UNIVERLIST_WORKER: string;
    function fmtDate(iso: string): string;
    function ago(iso: string): string;
    const folderSync: { supported: boolean; handle: { name: string } | null; state: string; lastSaved: number | null };
    // Private collection (core/core.js)
    const vault: {
        key: CryptoKey | null;
        ids: Set<string>;
        prefs: { kinds: Record<string, string[]>; links: { name: string; url: string }[] } | null;
    };
    const SEALED_MODE: Mode;
    function vaultReady(): boolean;
    // Extensions (extensions/)
    type ExtManifest = {
        id: string;
        name: string;
        version?: string;
        description?: string;
        author?: string;
        permissions: string[];
        companion?: { url: string; setup?: string };
        settings?: { key: string; label: string; type?: string; default?: unknown; secret?: boolean }[];
    };
    type Ext = { manifest: ExtManifest; on: boolean; private?: boolean; data?: { settings?: Record<string, unknown> } };
    const EXT: { list: Ext[]; health: Record<string, string>; pinged?: boolean };
    const EXT_PERMS: Record<string, string>;
    const EXT_OFFICIAL: [string, string, string][];
    const BUILTINS: { id: string; name: string; desc: string; jobs: string[]; off?: boolean }[];
    function extGet(id: string): Ext | undefined;
    function extPing(x: Ext): Promise<unknown>;
    function closeModal(): void;
    // the guide (settings/guide.js)
    const GUIDE_MD: string;
    function mdRender(md: string): string;
    function slug(s: string): string;
    interface Window {
        ulBooted?: boolean; // the app's own start-up has finished (events.js)
        ulJoining?: boolean; // this page was opened from a "Sign in on another device" code (main.ts)
        /** music, for the classic scripts' search and details (main.ts) */
        ulBackdrops?: { clean: typeof import("../backdrops/backdrop").myBackdrops }; // backdrops' one check (main.ts)
        ulPages?: { show: (page: string, main: HTMLElement) => void; hide: () => void }; // the Svelte pages (core/pages.ts)
        ulHls?: () => Promise<typeof import("hls.js").default>; // hls.js, loaded when first needed (main.ts)
        ulMusic?: {
            searchAlbums: typeof import("../music/musicbrainz").searchAlbums;
            albumDetails: typeof import("../music/musicbrainz").albumDetails;
        };
    }

    // ── the library as one bundle (import-export), for sync ──
    function packParts(): Record<string, unknown>;
    function applyParts(
        parts: Record<string, unknown>,
        sel: Record<string, boolean>,
        how: "merge" | "replace",
        v?: number
    ): Promise<{ items?: number }>;
}
