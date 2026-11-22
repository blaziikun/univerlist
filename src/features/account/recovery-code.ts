// src/features/account/recovery-code.ts
// ─────────────────────────────────────────────────────────────────
//  Account: the recovery code
//
//  Made by the app when you turn sync on, and shown once for you to save: the way back to your cloud copy if you ever
//  lose every device and passkey. It works like a passphrase (it seals your sync key in the same kind of box), but it's
//  random (120 bits) so it can't be guessed, and nobody has to invent or remember one. It also signs you in, if you've
//  lost your passkey: signInKey() turns it into a key the server can recognise your account by. That's a separate
//  derivation (its own salt), so the server, which keeps only that key's hash, learns nothing that would open your
//  library. Written in Crockford's base32: no I, L, O or U, so it's easy to read out and to type, and typos like O for
//  0 still work.
// ─────────────────────────────────────────────────────────────────

import { b64, rnd } from "./crypto";

const ABC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 24 characters in groups of four: 7K2Q-…  (15 random bytes, 5 bits a character) */
export function newRecoveryCode(): string {
    const bytes = rnd(15);
    let bits = 0,
        n = 0,
        out = "";
    for (const b of bytes) {
        n = (n << 8) | b;
        bits += 8;
        while (bits >= 5) {
            out += ABC[(n >> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    return out.match(/.{4}/g)!.join("-");
}

/** what someone typed, in the form the code was made in: capitals, dashes in place, look-alikes fixed */
export function tidyCode(typed: string): string {
    const s = typed
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, "")
        .replace(/O/g, "0")
        .replace(/[IL]/g, "1");
    return s.length === 24 ? s.match(/.{4}/g)!.join("-") : typed.trim();
}

/** the key that signs you in with this code (PBKDF2-SHA256, 100,000 rounds, a salt of its own), base64url */
export async function signInKey(typed: string): Promise<string> {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(tidyCode(typed)), "PBKDF2", false, [
        "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            hash: "SHA-256",
            salt: new TextEncoder().encode("UniverList recovery sign-in v1"),
            iterations: 100_000,
        },
        base,
        256
    );
    return b64(new Uint8Array(bits)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
