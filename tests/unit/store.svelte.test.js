// @vitest-environment happy-dom
// The store (src/features/core/store.svelte.ts): Svelte code sees changes the classic scripts make, one update per burst.
// The classic globals are stand-ins here, doing what core.js does: markDirty and render tell the listeners.
import { describe, it, expect, beforeAll } from "vitest";
import { flushSync } from "svelte";

let store;
beforeAll(async () => {
    const listeners = [];
    const tell = part => {
        for (const f of listeners) f(part);
    };
    Object.assign(globalThis, {
        changeListeners: listeners,
        items: new Map([["a", { title: "Dune", status: "want" }]]),
        meta: { profile: { name: "Ana" } },
        ui: { page: "profile" },
        markDirty: id => tell(id ? "items" : "meta"),
        render: () => tell("ui"),
    });
    ({ store } = await import("../../src/features/core/store.svelte.ts"));
});
const tick = () => new Promise(r => queueMicrotask(r)).then(() => flushSync());

/** run fn as an effect (what a component's template is); returns how many times it has run */
function watching(fn) {
    let runs = 0;
    const stop = $effect.root(() => {
        $effect(() => {
            fn();
            runs++;
        });
    });
    flushSync();
    return { runs: () => runs, stop };
}

describe("the store", () => {
    it("redraws what reads the library when classic code changes it", async () => {
        let titles = [];
        const w = watching(() => (titles = [...store.items.values()].map(x => x.title)));
        expect(titles).toEqual(["Dune"]);
        items.set("b", { title: "Piranesi", status: "want" }); // as a classic script would
        markDirty("b");
        await tick();
        expect(titles).toEqual(["Dune", "Piranesi"]);
        w.stop();
    });
    it("turns a burst of changes into one update", async () => {
        const w = watching(() => store.items.size);
        for (let i = 0; i < 1000; i++) markDirty("x");
        await tick();
        expect(w.runs()).toBe(2); // once at first, once for the whole burst
        w.stop();
    });
    it("only redraws for the part it reads", async () => {
        const w = watching(() => store.meta.profile.name);
        render(); // a ui change
        markDirty("a"); // an item change
        await tick();
        expect(w.runs()).toBe(1);
        store.updateMeta(m => (m.profile.name = "Bea"));
        await tick();
        expect(w.runs()).toBe(2);
        w.stop();
    });
    it("changes go through the same steps as the classic scripts' (saved, then redrawn)", async () => {
        let status = "";
        const w = watching(() => (status = store.item("a").status));
        store.updateItem("a", { status: "done" });
        await tick();
        expect(status).toBe("done");
        expect(items.get("a").status).toBe("done"); // the same object the classic scripts use
        w.stop();
    });
});
