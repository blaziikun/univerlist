// @vitest-environment happy-dom
// The database and other tabs (core/core.ts openDB): a newer version opened in another tab asks this one to let go,
// and it does at once (closing), so that tab never hangs; while an older tab holds on, this one says what's wrong.
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDB } from "../../src/features/core/core";

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
});
function fakeIDB() {
    // what openDB sets on the request and the database it opens, and the test calls as the browser would
    type On = (e?: unknown) => void;
    const req: { result: unknown; error: unknown; onsuccess?: On; onblocked?: On } = { result: null, error: null };
    const db: { close: () => void; objectStoreNames: { contains: () => boolean }; onversionchange?: On } = {
        close: vi.fn(),
        objectStoreNames: { contains: () => true },
    };
    vi.stubGlobal("indexedDB", { open: vi.fn(() => req) });
    return { req, db };
}

describe("openDB", () => {
    it("closes its copy when a newer version wants the database, and offers a reload", async () => {
        const { req, db } = fakeIDB();
        const opened = openDB("t", 1);
        req.result = db;
        req.onsuccess!();
        expect(await opened).toBe(db);
        expect(typeof db.onversionchange).toBe("function");
        db.onversionchange!({ oldVersion: 1, newVersion: 2 });
        expect(db.close).toHaveBeenCalledTimes(1);
        expect(document.querySelector(".toast")!.textContent).toMatch(/updated in another tab.*Reload/);
    });

    it("says what's holding it up while an older tab keeps the database open, then carries on", async () => {
        const { req, db } = fakeIDB();
        const opened = openDB("t", 2);
        expect(typeof req.onblocked).toBe("function");
        req.onblocked!();
        expect(document.querySelector(".toast")!.textContent).toMatch(/Close UniverList's other tabs/);
        req.result = db;
        req.onsuccess!();
        expect(await opened).toBe(db);
    });
});
