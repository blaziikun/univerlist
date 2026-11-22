// @vitest-environment happy-dom
// An extension's messages come from its own code, so they're treated as hostile (extensions/extensions.ts,
// extOnMessage). Its storage can't reach the keys the app keeps beside it (your settings for it, among them the
// companion's address, and its per-series servers), a companion counts only with the companion permission, and an
// answer to the app's call counts only from the extension the call went to.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXT, type ExtData, type ExtRecord, extCall, extOnMessage } from "../../src/features/extensions/extensions";
import { isOwnSource } from "../../src/features/watch-read/own-sources";

const rec = (id: string, permissions: string[], data: ExtData = {}): ExtRecord => ({
    manifest: { id, name: id, main: "main.js", permissions, settings: [] },
    files: { "main.js": "" },
    on: true,
    data,
});
// a running extension: its frame's window records what the app sends it
function running(x: ExtRecord) {
    const sent: Record<string, unknown>[] = [];
    const win = { postMessage: (m: Record<string, unknown>) => sent.push(m) };
    const frame = { contentWindow: win } as unknown as HTMLIFrameElement; // cast: only contentWindow is read
    EXT.list.push(x);
    EXT.frames.set(x.manifest.id, { frame, jobs: new Set(["watch.sources"]) });
    return { win, sent };
}
// a message from that window, as the browser would deliver it
const from = (win: object, data: unknown) => extOnMessage({ data, source: win } as unknown as MessageEvent); // cast: only data and source are read
const answer = (sent: Record<string, unknown>[], id: string) => sent.find(m => m.re === id);
// an IndexedDB that takes every write at once
const fakeDB = {
    transaction: () => {
        const t: { objectStore: () => { put: () => void }; oncomplete?: () => void } = {
            objectStore: () => ({ put: () => {} }),
        };
        setTimeout(() => t.oncomplete?.());
        return t;
    },
} as unknown as IDBDatabase; // cast: only transaction, objectStore and put are used

beforeEach(() => {
    EXT.list = [];
    EXT.frames.clear();
    EXT.wait.clear();
    EXT.db = fakeDB;
});
afterEach(() => {
    for (const w of EXT.wait.values()) clearTimeout(w.t);
});

describe("an extension's storage", () => {
    it("can't write the settings the app keeps, so it can't make a website count as your companion", async () => {
        const x = rec("sneaky", ["storage", "watch.sources"]);
        const { win, sent } = running(x);
        await from(win, {
            __ul: 1,
            id: "q1",
            fn: "storage.set",
            args: ["settings", { companionUrl: "https://videos.example.com" }],
        });
        expect(answer(sent, "q1")?.err).toMatch(/kept by the app/);
        expect(x.data.settings).toBeUndefined();
        expect(isOwnSource("https://videos.example.com/v.mp4")).toBe(false);
        await from(win, { __ul: 1, id: "q2", fn: "storage.set", args: ["series", { k: [{ value: "x" }] }] });
        expect(answer(sent, "q2")?.err).toMatch(/kept by the app/);
        expect(x.data.series).toBeUndefined();
    });
    it("can't read them either, or anything an object has by inheritance", async () => {
        const x = rec("reader", ["storage"], { settings: { password: "secret" }, note: "mine" });
        const { win, sent } = running(x);
        await from(win, { __ul: 1, id: "g1", fn: "storage.get", args: ["settings"] });
        await from(win, { __ul: 1, id: "g2", fn: "storage.get", args: ["constructor"] });
        await from(win, { __ul: 1, id: "g3", fn: "storage.get", args: ["note"] });
        expect(answer(sent, "g1")?.err).toMatch(/kept by the app/);
        expect(answer(sent, "g1")?.res).toBeNull();
        expect(answer(sent, "g2")?.res).toBeNull();
        expect(answer(sent, "g3")?.res).toBe("mine");
    });
    it("keeps its own keys as before", async () => {
        const x = rec("keeper", ["storage"]);
        const { win, sent } = running(x);
        await from(win, { __ul: 1, id: "s1", fn: "storage.set", args: ["last", { at: 3 }] });
        expect(answer(sent, "s1")?.res).toBe(true);
        expect(x.data.last).toEqual({ at: 3 });
    });
});

describe("a companion", () => {
    it("counts as yours only with the companion permission", () => {
        const typed = { settings: { companionUrl: "http://media.example.net:7879" } };
        running(rec("no-permission", ["storage"], typed));
        expect(isOwnSource("http://media.example.net:7879/stream/1")).toBe(false);
        running(rec("with-permission", ["companion"], typed));
        expect(isOwnSource("http://media.example.net:7879/stream/1")).toBe(true);
    });
});

describe("answers to the app's calls", () => {
    it("count only from the extension the call went to", async () => {
        const a = running(rec("asked", ["watch.sources"])),
            b = running(rec("other", ["watch.sources"]));
        let got: unknown = "nothing yet";
        const call = extCall("asked", "watch.sources", [{}], 5000).then(r => (got = r));
        const id = String(a.sent[0].id);
        // another extension guesses the call's id and answers first
        await from(b.win, { __ul: 1, re: id, res: [{ url: "https://elsewhere.example/v.mp4" }] });
        await new Promise(r => setTimeout(r));
        expect(got).toBe("nothing yet");
        expect(EXT.wait.has(id)).toBe(true);
        // the one asked answers
        await from(a.win, { __ul: 1, re: id, res: [{ url: "http://127.0.0.1:7879/v.mp4" }] });
        await call;
        expect(got).toEqual([{ url: "http://127.0.0.1:7879/v.mp4" }]);
        expect(EXT.wait.has(id)).toBe(false);
    });
});
