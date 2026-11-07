// src/features/account/link-device.ts
// ─────────────────────────────────────────────────────────────────
//  Account: adding your phone (or any device) with a QR code
//
//  On a device that's signed in, "Sign in on another device" makes a one-time link, good for ten minutes:
//    https://<site>/#link=<token>.<secret>
//  The token tells the server which account the new device joins; the secret seals your sync key for the trip.
//  Everything after # stays in the browser (it's never sent to any server), so the server holds the sealed key but
//  never the secret. Scanning it with the phone's camera (or opening the link on another computer) opens the site
//  there; one tap signs that device in, it opens the sealed key with the secret, and your library comes in. No passkey
//  is made: the code came from a device you're signed in on, so that's the approval. Works between any two devices (an
//  iPhone and a Windows PC, say), with no Bluetooth, which a passkey's own "use a phone" sign-in needs.
// ─────────────────────────────────────────────────────────────────

import { renderSVG } from "uqr";
import { b64, open, rnd, seal } from "./crypto";

/** the sync key, sealed for one QR code */
export type LinkBox = { v: 1; kdf: "LINK-AES-GCM"; iv: string; wrapped: string; kid: string };

const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c =>
        c.charCodeAt(0)
    );
const kekOf = (secret: Uint8Array) =>
    crypto.subtle.importKey("raw", secret as BufferSource, "AES-GCM", false, ["wrapKey", "unwrapKey"]);

/** a new secret, and the sync key sealed by it (for the server to hold until the new device asks) */
export async function sealForLink(syncKey: CryptoKey): Promise<{ box: LinkBox; secret: Uint8Array }> {
    const secret = rnd(32);
    return { box: { v: 1, kdf: "LINK-AES-GCM", ...(await seal(syncKey, await kekOf(secret))) }, secret };
}
export async function openLinkBox(box: LinkBox, secret: Uint8Array): Promise<CryptoKey> {
    if (box.v !== 1 || box.kdf !== "LINK-AES-GCM") throw new Error("unknown key format");
    return open(box, await kekOf(secret), true);
}

/** the address the QR code holds */
export const linkUrl = (token: string, secret: Uint8Array) =>
    `${location.origin}${location.pathname}#link=${token}.${b64url(secret)}`;
/** the QR code itself, as an SVG (made here from our own address: nothing from outside goes into it) */
export const qrSvg = (text: string) => renderSVG(text, { ecc: "M", border: 2, blackColor: "#111", whiteColor: "#fff" });

/** this page was opened from a QR code: take the link out of the address (so it isn't left in history) */
export function linkFromUrl(): { token: string; secret: Uint8Array } | null {
    const m = /^#link=([A-Za-z0-9_-]{20,})\.([A-Za-z0-9_-]{40,})$/.exec(location.hash);
    if (!m) return null;
    // window.history, not history: the classic scripts have a global of that name (the undo list)
    window.history.replaceState(null, "", location.pathname + location.search);
    try {
        return { token: m[1], secret: unb64url(m[2]) };
    } catch {
        return null;
    }
}
