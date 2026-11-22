// Backdrops you make (src/features/backdrops/backdrop.ts): every backdrop, from a file or from storage, goes through cleanBackdrop(),
// so a shared file can only ever be shapes, colours and a picture of its own.
import { describe, expect, it } from "vitest";
import {
    cleanBackdrop,
    fromFile,
    MAX_LAYERS,
    myBackdrops,
    STARTERS,
    toFile,
} from "../../src/features/backdrops/backdrop";

const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("cleanBackdrop", () => {
    it("fills in a complete backdrop from nothing", () => {
        const w = cleanBackdrop(null);
        expect(w.name).toBe("My backdrop");
        expect(w.sky).toBe(null);
        expect(w.picture).toBe(null);
        expect(w.layers).toEqual([]);
        expect(w.id).toMatch(/^[a-z0-9]{4,16}$/);
    });
    it("clamps every number and drops what it doesn't know", () => {
        const w = cleanBackdrop({
            id: "abcd1234",
            name: "  <b>Night</b>\u0007 ",
            sky: ["#FFFFFF", "red"],
            onload: "alert(1)",
            layers: [
                {
                    shape: "skull",
                    color: "url(x)",
                    count: 1e9,
                    size: -5,
                    speed: "fast",
                    angle: 999,
                    opacity: 0,
                    extra: 1,
                },
            ],
        });
        expect(w.id).toBe("abcd1234");
        expect(w.name).toBe("bNight/b");
        expect(w.sky).toEqual(["#ffffff", "#1a1030"]);
        expect("onload" in w).toBe(false);
        expect(w.layers[0]).toMatchObject({
            shape: "dot",
            color: "#ffffff",
            count: 300,
            size: 1,
            speed: 0.5,
            angle: 360,
            opacity: 0.05,
        });
        expect("extra" in w.layers[0]).toBe(false);
    });
    it("keeps at most four layers", () => {
        expect(cleanBackdrop({ layers: Array(9).fill({}) }).layers.length).toBe(MAX_LAYERS);
    });
    it("takes a picture only when it's an image inside the backdrop, never a link", () => {
        expect(cleanBackdrop({ picture: { src: PNG } }).picture?.src).toBe(PNG);
        for (const src of [
            "https://tracker.example/pixel.png",
            "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", // SVG can carry script
            "data:text/html;base64,PGI+",
            "javascript:alert(1)",
            `data:image/png;base64,${"A".repeat(800_000)}`, // too big
        ])
            expect(cleanBackdrop({ picture: { src } }).picture).toBe(null);
    });
    it("gives each backdrop in a list its own id (a duplicate is dropped)", () => {
        const list = myBackdrops([
            { id: "aaaa1111", name: "One" },
            { id: "aaaa1111", name: "Two" },
            { name: "Three" },
            "junk",
        ]);
        expect(list.map(w => w.name)).toEqual(["One", "Three", "My backdrop"]);
    });
});

describe("backdrop files", () => {
    it("round-trips, and an opened backdrop gets a new id (so it never replaces one of yours)", () => {
        const w = cleanBackdrop({ id: "keep1234", ...STARTERS[0].make() });
        const back = fromFile(toFile(w));
        expect(back.id).not.toBe("keep1234");
        expect({ ...back, id: "" }).toEqual({ ...w, id: "" });
        expect(toFile(w)).not.toContain("keep1234");
    });
    it("says plainly when a file isn't a backdrop, or is from a newer app", () => {
        expect(() => fromFile("not json")).toThrow("isn't a backdrop file");
        // files from before 1.0, when a backdrop was called a world
        expect(fromFile(JSON.stringify({ kind: "univerlist-world", v: 1, world: { name: "Old" } })).name).toBe("Old");
        expect(() => fromFile(JSON.stringify({ kind: "something-else", backdrop: {} }))).toThrow(
            "isn't a backdrop file"
        );
        expect(() => fromFile(JSON.stringify({ kind: "univerlist-backdrop", v: 99, backdrop: {} }))).toThrow(
            "newer UniverList"
        );
    });
    it("every starter is already a clean backdrop", () => {
        for (const s of STARTERS) {
            const w = { id: "abcd1234", ...s.make() };
            expect(cleanBackdrop(w)).toEqual(w);
        }
    });
});
