// src/features/account/api.ts
// ─────────────────────────────────────────────────────────────────
//  Account: talking to /api/sync
//
//  Same-origin only, with the session in an HttpOnly cookie the page can't read. Every change carries X-UL-Sync, which
//  the server requires (another site can't send it), alongside its Origin check.
// ─────────────────────────────────────────────────────────────────

import type { PasskeyBox, PassphraseBox } from "./crypto";
import type { LinkBox } from "./link-device";

const BASE = "api/sync";

export class SyncError extends Error {
    constructor(
        public status: number,
        message: string,
        public data: unknown = null
    ) {
        super(message);
    }
}

async function call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...((init.headers as Record<string, string>) || {}) };
    if (init.method && init.method !== "GET") headers["X-UL-Sync"] = "1";
    if (init.json !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(init.json);
    }
    const r = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store" });
    if (!r.ok) {
        let d: { error?: string } | null = null;
        try {
            d = await r.json();
        } catch {
            /* not JSON */
        }
        throw new SyncError(r.status, (d && d.error) || `couldn't reach the server (${r.status})`, d);
    }
    return r;
}
const post = (path: string, json: unknown = {}) => call(path, { method: "POST", json }).then(r => r.json());

type Passkey = { id: string; label: string; created: number; used: number; box: PasskeyBox | null };
export type Me = {
    name: string;
    created: number;
    version: number;
    size: number;
    updated: number;
    rp_id: string;
    user_handle: string; // the account's passkey user id (to tell password managers which passkeys still count)
    recovery_signin: number; // the recovery code can sign in (codes made before this could only unlock)
    kid: string | null; // which sync key the account uses (null: not set up, or set up before key ids)
    has_key: number; // sync is set up: something can open the sync key
    has_pass: number; // there's a passphrase box
    pass_box: PassphraseBox | null;
    passkeys: Passkey[];
    sessions: { id: string; label: string; created: number; seen: number; current: boolean }[];
};
/** a ceremony's options from the server: its id, and what to hand the passkey */
type Ceremony = { id: string; options: Record<string, unknown> };
type SignedIn = { ok: true; name: string; passkey?: string; box?: PasskeyBox | null; linkBox?: LinkBox };

export const api = {
    me: (): Promise<Me> => call("/me").then(r => r.json()),
    registerOptions: (name: string): Promise<Ceremony> => post("/register/options", { name }),
    registerVerify: (id: string, response: unknown): Promise<SignedIn> => post("/register/verify", { id, response }),
    loginOptions: (): Promise<Ceremony> => post("/login/options"),
    loginVerify: (id: string, response: unknown): Promise<SignedIn> => post("/login/verify", { id, response }),
    logout: () => post("/logout"),
    revoke: (body: { id?: string; others?: boolean }) => post("/sessions/revoke", body),
    // ── confirm it's you (needed for the moments that change who can get in: see confirmed() in account-state) ──
    confirmOptions: (): Promise<Ceremony> => post("/confirm/options"),
    confirmPasskey: (id: string, response: unknown) => post("/confirm", { id, response }),
    confirmCode: (code: string) => post("/confirm", { code }),
    passkeyOptions: (): Promise<Ceremony> => post("/passkey/options"),
    passkeyVerify: (id: string, response: unknown) => post("/passkey/verify", { id, response }),
    passkeyRemove: (id: string) => post("/passkey/remove", { id }),
    /** turn sync on: the first boxes for a new sync key, all at once. Refused (409) if another device just did */
    setup: (kid: string, passkey: { id: string; box: PasskeyBox } | null, keybox: PassphraseBox, auth: string) =>
        post("/setup", { kid, ...(passkey ? { passkey } : {}), keybox, auth }),
    /** let this passkey unlock your library: its box (the sync key sealed by its secret) */
    passkeyBox: (id: string, box: PasskeyBox) => post("/passkey/box", { id, box }),
    // ── adding a device with a QR code (link-device.ts) ──
    linkStart: (box: LinkBox): Promise<{ token: string; expires: number }> => post("/link/start", { box }),
    linkState: (): Promise<{ used: boolean; live: boolean }> => call("/link/state").then(r => r.json()),
    linkCancel: () => post("/link/cancel"),
    /** whose account a code signs into, before it's used (it still works once afterwards) */
    linkPeek: (token: string): Promise<{ name: string }> => post("/link/peek", { token }),
    /** sign this device in with a code it scanned (no passkey) */
    linkJoin: (token: string): Promise<SignedIn> => post("/link/join", { token }),
    audit: (): Promise<{ at: number; kind: string; detail: string }[]> => call("/audit").then(r => r.json()),
    versions: (): Promise<{ version: number; size: number; at: string }[]> => call("/versions").then(r => r.json()),
    /** a new recovery code: its box, and the key it signs in with */
    putKey: (keybox: PassphraseBox, auth: string) =>
        call("/key", { method: "PUT", json: { keybox, auth } }).then(r => r.json()),
    /** lost your passkey: sign in with the key made from your recovery code */
    recover: (auth: string): Promise<SignedIn> => post("/recover", { auth }),
    /** the library as stored (still sealed), its version, and the passphrase box if there is one */
    async getData(): Promise<{ version: number; keybox: PassphraseBox | null; data: Uint8Array | null }> {
        const r = await call("/data");
        if ((r.headers.get("Content-Type") || "").includes("json")) {
            const j = await r.json();
            return { version: j.version || 0, keybox: j.keybox, data: null };
        }
        const kb = r.headers.get("X-Keybox");
        return {
            version: Number(r.headers.get("X-Version")),
            keybox: kb ? JSON.parse(decodeURIComponent(kb)) : null,
            data: new Uint8Array(await r.arrayBuffer()),
        };
    },
    getVersion: (v: number) => call(`/data/version?v=${v}`).then(async r => new Uint8Array(await r.arrayBuffer())),
    putData: (data: Uint8Array, version: number) =>
        call("/data", {
            method: "PUT",
            body: data as BodyInit,
            headers: { "Content-Type": "application/octet-stream", "If-Match": String(version) },
        }).then(r => r.json()),
    deleteAccount: () => post("/delete", { confirm: "DELETE" }),
};
