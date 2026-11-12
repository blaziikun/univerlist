// @vitest-environment happy-dom
// The zip reader (import-export/importers.ts unzip) opens what it understands (stored and deflated entries) and refuses
// the rest with a reason: a password, another compression method, an entry that isn't where the zip says it is.
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { unzip, ZIP_BROKEN, ZIP_LOCKED, ZIP_METHOD } from "../../src/features/import-export/importers";

const enc = new TextEncoder();
const make = () =>
    zipSync({ "a.txt": [enc.encode("stored text"), { level: 0 }], "b.txt": enc.encode("deflated text ".repeat(50)) });
// the central directory entry for a file: where its flags, method and local header are
function central(zip: Uint8Array, name: string) {
    const dv = new DataView(zip.buffer);
    for (let p = 0; p < zip.length - 46; p++)
        if (dv.getUint32(p, true) === 0x02014b50) {
            const nl = dv.getUint16(p + 28, true);
            if (new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nl)) === name)
                return { dv, p, local: dv.getUint32(p + 42, true) };
        }
    throw new Error("no " + name);
}
const fails = async (zip: Uint8Array<ArrayBuffer>) => {
    try {
        await unzip(zip.buffer);
        return "";
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
};

describe("unzip", () => {
    it("opens stored and deflated entries", async () => {
        const files = await unzip(make().buffer);
        expect(new TextDecoder().decode(files.get("a.txt"))).toBe("stored text");
        expect(new TextDecoder().decode(files.get("b.txt"))).toBe("deflated text ".repeat(50));
    });

    it("refuses an entry with a password", async () => {
        const zip = make(),
            { dv, p, local } = central(zip, "b.txt");
        dv.setUint16(p + 8, dv.getUint16(p + 8, true) | 1, true);
        dv.setUint16(local + 6, dv.getUint16(local + 6, true) | 1, true);
        expect(await fails(zip)).toBe(ZIP_LOCKED);
    });

    it("refuses compression it can't unpack (bzip2, LZMA…) instead of handing back packed bytes", async () => {
        for (const method of [12, 14, 99]) {
            const zip = make(),
                { dv, p, local } = central(zip, "a.txt");
            dv.setUint16(p + 10, method, true);
            dv.setUint16(local + 8, method, true);
            expect(await fails(zip), String(method)).toBe(ZIP_METHOD);
        }
    });

    it("refuses an entry whose own header isn't where the zip says", async () => {
        const zip = make(),
            { dv, local } = central(zip, "b.txt");
        dv.setUint32(local, 0x12345678, true);
        expect(await fails(zip)).toBe(ZIP_BROKEN);
        const short = make(),
            c = central(short, "b.txt");
        c.dv.setUint32(c.p + 42, short.length - 10, true);
        expect(await fails(short)).toBe(ZIP_BROKEN);
    });

    it("says a zip is damaged when its directory points past its end (a download cut short), not a reading error", async () => {
        const zip = make(),
            dv = new DataView(zip.buffer),
            eocd = zip.length - 22; // no comment: the end record is the last 22 bytes
        expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
        dv.setUint32(eocd + 16, zip.length + 1000, true);
        expect(await fails(zip)).toBe(ZIP_BROKEN);
        // …and a directory entry whose name runs past the end
        const cut = make(),
            c = central(cut, "b.txt");
        c.dv.setUint16(c.p + 28, 60000, true);
        expect(await fails(cut)).toBe(ZIP_BROKEN);
    });
});
