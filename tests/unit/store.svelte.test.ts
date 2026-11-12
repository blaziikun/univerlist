// @vitest-environment happy-dom
// The store (src/features/core/store.svelte.ts): Svelte code sees changes the older modules make, one update per burst.
// core.ts and navigation.ts are stand-ins here, doing what the real ones do: markDirty and render tell the listeners.
import { describe, it, expect, vi } from "vitest";
import { flushSync } from "svelte";

const app = vi.hoisted(() => {
    const listeners: ((part: string) => void)[] = [];
    const tell = (part: string) => {
        for (const f of listeners) f(part);
    };
    return {
        changeListeners: listeners,
        items: new Map([["a", { title: "Dune", status: "want" }]]),
        meta: { profile: { name: "Ana" } },
        ui: { page: "profile" },
        markDirty: (id?: string) => tell(id ? "items" : "meta"),
        render: () => tell("ui"),
    };
});
vi.mock("../../src/features/core/core.ts", () => ({
    changeListeners: app.changeListeners,
    items: app.items,
    meta: app.meta,
    ui: app.ui,
    markDirty: app.markDirty,
}));
vi.mock("../../src/features/core/navigation.ts", () => ({ render: app.render }));
const { items, markDirty, render } = app;
const { store } = await import("../../src/features/core/store.svelte.ts");
const tick = () => new Promise<void>(r => queueMicrotask(r)).then(() => flushSync());

/** run fn as an effect (what a component's template is); returns how many times it has run */
function watching(fn: () => unknown) {
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
    it("redraws what reads the library when the older code changes it", async () => {
        let titles: string[] = [];
        const w = watching(() => (titles = [...store.items.values()].map(x => x.title)));
        expect(titles).toEqual(["Dune"]);
        items.set("b", { title: "Piranesi", status: "want" }); // as the older code would
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
    it("changes go through the same steps as the older code's (saved, then redrawn)", async () => {
        let status = "";
        const w = watching(() => (status = store.item("a")!.status));
        store.updateItem("a", { status: "done" });
        await tick();
        expect(status).toBe("done");
        expect(items.get("a")!.status).toBe("done"); // the same object the older code uses
        w.stop();
    });
});
