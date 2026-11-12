// @vitest-environment happy-dom
// Actions on entries (library/item-actions.ts): moving one into the private collection, splitting one into volumes
// (core/parts.ts), which keeps which volumes you own, and how a tier list shows its scores (library/tiers.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addItem, fmtScore, history, items, meta, migrateItem, vault } from "../../src/features/core/core";
import { makePrivate } from "../../src/features/library/item-actions";
import { splitIntoVolumes } from "../../src/features/core/parts";
import { chipLook, tierEnt } from "../../src/features/library/tiers";

// no volume covers: Apple Books is never asked
vi.mock("../../src/features/sources/box-art", async real => ({
    ...(await real()),
    itunesJSON: () => Promise.reject(new Error("offline")),
}));

// the page's frame, as index.html has it: adding an entry redraws the sidebar
beforeEach(() => {
    document.body.innerHTML = `<div id="app"><header id="top"></header><aside id="side"></aside><main id="main"></main></div><div id="overlay"></div>`;
});
afterEach(() => {
    items.clear();
    history.length = 0;
    vault.key = null;
    vault.ids.clear();
});

describe("makePrivate", () => {
    it("gives the entry an anonymous id and forgets the undo steps that name it", () => {
        items.set("dune-book", migrateItem({ title: "Dune", medium: "book", status: "want" }));
        history.push({ label: "Add Dune", entries: [], at: Date.now() });
        vault.key = {} as CryptoKey; // any key (a cast: nothing is sealed here, so it's never used)
        const nid = makePrivate("dune-book");
        expect(nid).not.toBe("dune-book");
        expect(items.has("dune-book")).toBe(false);
        expect(items.get(nid)?.private).toBe(true);
        expect(vault.ids.has(nid)).toBe(true);
        expect(history.length).toBe(0);
    });
});

describe("splitting into volumes", () => {
    it("marks the volumes you own as owned (and finished, when the whole is)", async () => {
        const id = addItem(
            { title: "Frieren", medium: "manga", status: "done", copy: "physical", vols: 3, volsOwned: [1, 3] },
            "Add"
        );
        await splitIntoVolumes(id);
        const vols = [...items.values()]
            .filter(b => b.partOf === id)
            .sort((a, b) => Number(a.seriesNo) - Number(b.seriesNo));
        expect(vols.map(b => [b.seriesNo, b.status, b.copy])).toEqual([
            [2, "want", "none"],
            [3, "done", "physical"],
        ]);
    });
});

describe("a tier list", () => {
    it("shows an entry's score on that entry's own scale, as its card does", () => {
        meta.settings.ratingScale = "10d";
        const id = addItem({ title: "Mushishi", medium: "anime", status: "done", rating: 8.5, scale: "100" }, "Add");
        const L = {
            id: "l1",
            name: "Best",
            kind: "tier",
            ids: [id],
            rows: [{ label: "S", color: "#e5675a", ids: [id] }],
        };
        expect(tierEnt(L, id)?.scale).toBe("100");
        expect(chipLook(L, id)?.score).toBe(fmtScore(8.5, "100")); // what its chip shows (TierChip.svelte)
    });
});
