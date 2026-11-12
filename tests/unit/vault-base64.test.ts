// @vitest-environment happy-dom
// The private collection is sealed as base64 (core/core.ts b64, unb64). Spreading every byte into one
// String.fromCharCode call stops working past about 125 KB, and then the collection silently stopped sealing.
import { afterEach, describe, expect, it } from "vitest";
import { b64, items, meta, unb64, vault, vaultKey, vaultSeal } from "../../src/features/core/core";
import { bare } from "./bare";

const MB = 1048576;
const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7919) % 256);
const native = { to: Uint8Array.prototype.toBase64, from: Uint8Array.fromBase64 };
afterEach(() => {
    Uint8Array.prototype.toBase64 = native.to;
    Uint8Array.fromBase64 = native.from;
    items.clear();
    vault.key = null;
    vault.ids.clear();
});

describe("base64", () => {
    it("takes 1 MB and gives it back, without the browser's own base64", () => {
        delete Uint8Array.prototype.toBase64;
        delete Uint8Array.fromBase64;
        const u = bytes(MB);
        const s = b64(u);
        expect(s).toBe(Buffer.from(u).toString("base64"));
        expect(Buffer.from(unb64(s)).equals(Buffer.from(u))).toBe(true);
        expect(b64(u.buffer)).toBe(s);
    });

    it("uses the browser's own base64 where there is one", () => {
        let used = 0;
        Uint8Array.prototype.toBase64 = function () {
            used++;
            return Buffer.from(this).toString("base64");
        };
        Uint8Array.fromBase64 = s => {
            used++;
            return new Uint8Array(Buffer.from(s, "base64"));
        };
        const u = bytes(MB);
        expect(Buffer.from(unb64(b64(u))).equals(Buffer.from(u))).toBe(true);
        expect(used).toBe(2);
    });

    it("seals a private collection of over 1 MB, and it opens again", async () => {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        meta.vault = { salt: b64(salt), iv: "", ct: "", n: 0 };
        vault.key = await vaultKey("a long passphrase", salt);
        vault.prefs = { kinds: {}, links: [] };
        items.set("book-secret", bare({ medium: "book", title: "Secret", notes: "x".repeat(1.25 * MB) }));
        vault.ids.add("book-secret");
        await vaultSeal();
        expect(meta.vault.ct.length).toBeGreaterThan(1.6 * MB);
        const pt = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: unb64(meta.vault.iv) },
            vault.key,
            unb64(meta.vault.ct)
        );
        expect(JSON.parse(new TextDecoder().decode(pt)).items["book-secret"].notes.length).toBe(1.25 * MB);
    });
});
