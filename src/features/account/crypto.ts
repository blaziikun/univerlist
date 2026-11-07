// src/features/account/crypto.ts
// ─────────────────────────────────────────────────────────────────
//  Account: end-to-end encryption, all in this browser
//
//  Your library is sealed with a random 256-bit sync key (AES-GCM). That key leaves the browser only sealed in turn, in
//  a "box" the server keeps but can't open. There are two kinds of box (the server stores whichever you have):
//    - a passkey box: opened by a secret your passkey produces when you sign in (passkey-unlock.ts)
//    - a recovery box: opened by a key made from your recovery code (recovery-code.ts) or, on older accounts, a
//    passphrase
//      you chose (PBKDF2-SHA256, 600,000 rounds, its own random salt)
//  Both are the same two steps: make a key-encryption key, then wrap or unwrap the sync key with it (seal / open
//  below). On a device you've unlocked, the sync key is kept in this browser's IndexedDB, so it can sync on its own and
//  hand the key to a new device you add (link-device.ts). Like the library itself, it's readable only by this site's
//  own scripts: the page runs nothing else (its Content-Security-Policy), which is what keeps both safe on the device.
// ─────────────────────────────────────────────────────────────────

// Every box also says which sync key it seals (kid, a fingerprint of the key), so the server can hold the account to
// one key, and a device can tell its kept key is still the account's.

/** the sync key sealed by a key made from your passphrase */
export type PassphraseBox = {
    v: 1;
    kdf: "PBKDF2-SHA256";
    iter: number;
    salt: string;
    iv: string;
    wrapped: string;
    kid?: string; // missing on boxes made before key ids
};
/** the sync key sealed by a key made from one passkey's secret */
export type PasskeyBox = { v: 1; kdf: "PRF-HKDF-SHA256"; iv: string; wrapped: string; kid: string };

const ITER = 600_000;
const AES = { name: "AES-GCM", length: 256 } as const;
const enc = new TextEncoder(),
    dec = new TextDecoder();
export const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

// ── the sync key ──
/** a new sync key. Extractable, so it can be sealed into boxes; it only ever stays in memory while that happens */
export function newSyncKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(AES, true, ["encrypt", "decrypt"]);
}

/** which sync key this is: the first 16 bytes of a SHA-256 of it (says nothing about the key itself) */
export async function keyId(syncKey: CryptoKey): Promise<string> {
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", syncKey));
    const tagged = new Uint8Array([...enc.encode("UniverList key id\0"), ...raw]);
    return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", tagged)).slice(0, 16));
}

// ── sealing it: wrap the sync key with a key-encryption key (kek), or unwrap it ──
export async function seal(syncKey: CryptoKey, kek: CryptoKey): Promise<{ iv: string; wrapped: string; kid: string }> {
    const iv = rnd(12);
    const wrapped = await crypto.subtle.wrapKey("raw", syncKey, kek, { name: "AES-GCM", iv: iv as BufferSource });
    return { iv: b64(iv), wrapped: b64(new Uint8Array(wrapped)), kid: await keyId(syncKey) };
}
/** the sync key back out of a box. AES-GCM checks itself: the wrong kek throws instead of giving a wrong key */
export function open(box: { iv: string; wrapped: string }, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
    return crypto.subtle.unwrapKey(
        "raw",
        unb64(box.wrapped) as BufferSource,
        kek,
        { name: "AES-GCM", iv: unb64(box.iv) as BufferSource },
        AES,
        extractable,
        ["encrypt", "decrypt"]
    );
}

// ── the recovery box (a recovery code, or an older account's passphrase) ──
async function passphraseKek(pass: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey("raw", enc.encode(pass.normalize("NFKC")), "PBKDF2", false, [
        "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter },
        base,
        AES,
        false,
        ["wrapKey", "unwrapKey"]
    );
}
export async function sealWithPassphrase(syncKey: CryptoKey, pass: string): Promise<PassphraseBox> {
    const salt = rnd(16);
    const sealed = await seal(syncKey, await passphraseKek(pass, salt, ITER));
    return { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), ...sealed };
}
/** the sync key, opened with your passphrase (extractable, so it can be sealed for a passkey too); a wrong one throws */
export async function openWithPassphrase(box: PassphraseBox, pass: string): Promise<CryptoKey> {
    // a floor so it's never weak, a ceiling so a bad box can't freeze the page working it out
    if (box.v !== 1 || box.kdf !== "PBKDF2-SHA256" || !(box.iter >= 100_000 && box.iter <= 10_000_000))
        throw new Error("unknown key format");
    try {
        return await open(box, await passphraseKek(pass, unb64(box.salt), box.iter), true);
    } catch {
        throw new Error("That doesn't open it: check the code and try again.");
    }
}
// ── your library, sealed: what gets uploaded is iv (12 bytes) + AES-GCM of the gzipped JSON ──
async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    return new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(t)).arrayBuffer());
}
export async function sealData(key: CryptoKey, obj: unknown): Promise<Uint8Array> {
    const iv = rnd(12),
        z = await pipe(enc.encode(JSON.stringify(obj)), new CompressionStream("gzip"));
    const ct = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, z as BufferSource)
    );
    const out = new Uint8Array(12 + ct.length);
    out.set(iv);
    out.set(ct, 12);
    return out;
}
export async function openData(key: CryptoKey, blob: Uint8Array): Promise<Record<string, unknown>> {
    const pt = new Uint8Array(
        await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: blob.slice(0, 12) as BufferSource },
            key,
            blob.slice(12) as BufferSource
        )
    );
    return JSON.parse(dec.decode(await pipe(pt, new DecompressionStream("gzip"))), (k, v) =>
        k === "__proto__" ? undefined : v
    );
}

// ── the sync key, kept on this device in its own database. It's stored extractable on purpose: signing in another
// device, a new recovery code and a new passkey each seal it again (account-state, thisDevicesKey) ──
const DB = "ul-account";
function db(): Promise<IDBDatabase> {
    return new Promise((ok, no) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("k");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => no(r.error);
    });
}
/** keep the sync key on this device (with its id), or forget both (null) */
export async function keepKey(key: CryptoKey | null): Promise<void> {
    const kid = key ? await keyId(key) : null;
    const d = await db();
    await new Promise<void>((ok, no) => {
        const t = d.transaction("k", "readwrite"),
            k = t.objectStore("k");
        if (key && kid) {
            k.put(key, "data");
            k.put(kid, "kid");
        } else {
            k.delete("data");
            k.delete("kid");
        }
        t.oncomplete = () => ok();
        t.onerror = () => no(t.error);
    });
}
async function kept<T>(name: string): Promise<T | null> {
    try {
        const d = await db();
        return await new Promise(ok => {
            const r = d.transaction("k").objectStore("k").get(name);
            r.onsuccess = () => ok(r.result || null);
            r.onerror = () => ok(null);
        });
    } catch {
        return null;
    }
}
/** the sync key kept on this device, if it's been unlocked here */
export const keptKey = () => kept<CryptoKey>("data");
/** which key that is (null on devices unlocked before key ids) */
export const keptKeyId = () => kept<string>("kid");
