// src/features/account/passkey-unlock.ts
// ─────────────────────────────────────────────────────────────────
//  Account: a passkey that unlocks your library, not just signs you in
//
//  Passkeys can produce a secret for the site (the WebAuthn "PRF" extension): the same 32 bytes every time you use that
//  passkey here, different for every passkey and every site, and only ever given to this page. So when you sign in we
//  ask for it in the same prompt, turn it into a key-encryption key, and open your sync key with it: no passphrase.
//    - the secret is taken out of the passkey's answer before that answer goes to the server (takeSecret)
//    - synced passkeys (iCloud Keychain, Google Password Manager, 1Password…) give the same secret on all your devices,
//      so signing in on a new phone or laptop opens your library straight away
//    - where a passkey or browser can't do this, the passphrase box still works (crypto.ts)
// ─────────────────────────────────────────────────────────────────

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { b64, open, rnd, seal, type PasskeyBox } from "./crypto";

/** what we ask each passkey to make its secret from. Fixed and public: the secret depends on the passkey, not on this */
const PRF_INPUT = new TextEncoder().encode("UniverList sync key v1");

/** what a passkey ceremony tells us about unlocking */
export type Secret = {
    id: string; // which passkey answered
    secret: Uint8Array | null; // its PRF secret, if it gave one
    can: boolean; // whether it can give one at all (false: this passkey or browser can't; it signs in only)
};

type Options = { extensions?: Record<string, unknown> } & Record<string, unknown>;
/** the same options, also asking the passkey for its secret */
const withPrf = <T extends Options>(o: T): T => ({
    ...o,
    extensions: { ...o.extensions, prf: { eval: { first: PRF_INPUT } } },
});

/** take the secret out of a passkey's answer, so it's never sent anywhere. Strips every extension result */
function takeSecret(r: { id: string; clientExtensionResults: unknown }): Secret {
    const prf = (r.clientExtensionResults as { prf?: { enabled?: boolean; results?: { first?: BufferSource } } }).prf;
    r.clientExtensionResults = {}; // the server doesn't need them, and the secret must not reach it
    const first = prf?.results?.first;
    const secret = !first
        ? null
        : ArrayBuffer.isView(first)
          ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength).slice()
          : new Uint8Array(first).slice();
    return { id: r.id, secret, can: !!secret || prf?.enabled === true };
}

// ── the three ceremonies, each asking for the secret as well ──
/** make a passkey (sign-up, or adding one). Some passkeys give their secret right away; others say they can, later */
export async function createPasskey(options: Options) {
    let response: Awaited<ReturnType<typeof startRegistration>>;
    try {
        response = await startRegistration({ optionsJSON: withPrf(options) as never });
    } catch (e) {
        // a few older authenticators refuse the request outright when it asks for the secret: try once without
        if ((e as Error)?.name !== "NotSupportedError") throw e;
        response = await startRegistration({ optionsJSON: options as never });
    }
    return { response, got: takeSecret(response) };
}
/** sign in (the server's challenge, checked by the server) */
export async function usePasskey(options: Options) {
    const response = await startAuthentication({ optionsJSON: withPrf(options) as never });
    return { response, got: takeSecret(response) };
}
/** just ask one of these passkeys for its secret. Nothing is sent to the server, so the challenge can be our own */
export async function confirmWithPasskey(rpId: string, ids: string[]): Promise<Secret> {
    const { got } = await usePasskey({
        challenge: b64url(rnd(32)),
        rpId,
        allowCredentials: ids.map(id => ({ id, type: "public-key" })),
        userVerification: "required",
        timeout: 120_000,
    });
    return got;
}

// ── the passkey box: the sync key sealed by a key made from the passkey's secret (HKDF-SHA256) ──
async function passkeyKek(secret: Uint8Array): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey("raw", secret as BufferSource, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: PRF_INPUT },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["wrapKey", "unwrapKey"]
    );
}
export async function sealWithPasskey(syncKey: CryptoKey, secret: Uint8Array): Promise<PasskeyBox> {
    return { v: 1, kdf: "PRF-HKDF-SHA256", ...(await seal(syncKey, await passkeyKek(secret))) };
}
/** the sync key, opened with a passkey's secret (extractable, so it can be sealed for another passkey); wrong secret throws */
export async function openWithPasskey(box: PasskeyBox, secret: Uint8Array): Promise<CryptoKey> {
    if (box.v !== 1 || box.kdf !== "PRF-HKDF-SHA256") throw new Error("unknown key format");
    return open(box, await passkeyKek(secret), true);
}

const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
