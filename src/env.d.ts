// src/env.d.ts
// ─────────────────────────────────────────────────────────────────
//  Types the app needs beyond its own code: what the build provides (Svelte components, Vite's import.meta.env, the
//  offline install's module, the test-hook switch Vite writes in, the copyable proxy as a virtual module), and what
//  browsers offer that TypeScript's own lists don't have yet
// ─────────────────────────────────────────────────────────────────
/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** true only in the builds the browser tests run (vite.config.ts, modes e2e and file-e2e): core/test-hook.ts goes in */
declare const __UL_TEST_HOOK__: boolean;

/** the stand-alone catalogue proxy, worker/proxy.ts as plain JavaScript (vite.config.ts → proxyScript) */
declare module "virtual:proxy-script" {
    const script: string;
    export default script;
}

// ── what browsers offer that TypeScript's own lists don't have yet ──
// base64 straight from and to bytes (newer browsers; core.ts b64 and unb64 fall back without them)
interface Uint8Array {
    toBase64?(): string;
}
interface Uint8ArrayConstructor {
    fromBase64?(s: string): Uint8Array<ArrayBuffer>;
}
// a file or folder of your own, kept between visits (Chromium browsers; fileSync.supported and folderSync check first)
interface FileSystemHandle {
    queryPermission(o: { mode: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission(o: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}
interface FilePickerOptions {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
}
interface Window {
    showSaveFilePicker(o?: FilePickerOptions): Promise<FileSystemFileHandle>;
    showOpenFilePicker(o?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
    showDirectoryPicker(o?: { id?: string; mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}

// Papa Parse (core.ts parseCSV): only the part the app uses
declare module "papaparse" {
    const Papa: {
        parse(text: string, options: { skipEmptyLines?: boolean | "greedy" }): { data: unknown[][] };
    };
    export default Papa;
}
