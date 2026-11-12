// @vitest-environment happy-dom
// AniList allows so many requests a minute (sources/sources.ts AL.q). Requests that arrive together queue and go one
// at a time; a "slow down" waits as long as AniList says (Retry-After); and whoever asked can give up while waiting.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AL } from "../../src/features/sources/sources";

let sent: { at: number; q: string }[];
/** a stand-in answer from AniList: what AL.q reads of one */
type Answer = { status: number; ok: boolean; headers: Headers; json: () => Promise<unknown> };
const answer = (status = 200, headers: Record<string, string> = {}): Answer => ({
    status,
    ok: status < 300,
    headers: new Headers(headers),
    json: async () => (status < 300 ? { data: { ok: true } } : { errors: [{ message: "Too Many Requests." }] }),
});
let replies: (Answer | Promise<Answer>)[];
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    Object.assign(AL, { last: 0, line: Promise.resolve(), burst: 0 });
    sent = [];
    replies = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_: unknown, o: RequestInit) => {
            if (o.signal && o.signal.aborted) throw new DOMException("Aborted", "AbortError");
            sent.push({ at: Date.now(), q: JSON.parse(String(o.body)).query });
            return replies.shift() || answer();
        })
    );
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete AL.onWait;
});
const t0 = () => new Date("2026-05-01T12:00:00Z").getTime();
const when = () => sent.map((s): [string, number] => [s.q, s.at - t0()]);
// whether a promise has settled yet, and how
const watch = (p: Promise<unknown>) => {
    const s: { done: boolean; err: Error | null } = { done: false, err: null };
    p.then(
        () => (s.done = true),
        (e: Error) => {
            s.done = true;
            s.err = e;
        }
    );
    return s;
};

describe("AniList's queue", () => {
    it("sends requests that arrive together one at a time, in order", async () => {
        const all = Promise.all(["a", "b", "c"].map(q => AL.q(q)));
        await vi.advanceTimersByTimeAsync(AL.gap * 3);
        await all;
        expect(when()).toEqual([
            ["a", 0],
            ["b", AL.gap],
            ["c", AL.gap * 2],
        ]);
    });

    it("waits as long as a 429 asks (Retry-After), and the queue waits with it", async () => {
        const waited: number[] = [];
        AL.onWait = s => waited.push(s);
        replies.push(answer(429, { "Retry-After": "5" }));
        const a = AL.q("a"),
            b = AL.q("b");
        await vi.advanceTimersByTimeAsync(4000);
        expect(when()).toEqual([["a", 0]]);
        await vi.advanceTimersByTimeAsync(10000);
        await Promise.all([a, b]);
        expect(waited).toEqual([5]);
        expect(when()).toEqual([
            ["a", 0],
            ["a", 5000],
            ["b", 5000 + AL.gap],
        ]);
    });

    it("holds back one already waiting for its turn when a 429 comes in meanwhile", async () => {
        let release: (a: Answer) => void = () => {};
        replies.push(new Promise<Answer>(r => (release = r)));
        const a = AL.q("a"),
            b = AL.q("b");
        await vi.advanceTimersByTimeAsync(AL.gap - 100);
        release(answer(429, { "Retry-After": "10" }));
        await vi.advanceTimersByTimeAsync(20000);
        await Promise.all([a, b]);
        expect(when().map(([q, at]) => [q, at >= 10000 ? "after" : at])).toEqual([
            ["a", 0],
            ["a", "after"],
            ["b", "after"],
        ]);
        expect(sent[2].at - sent[1].at).toBeGreaterThanOrEqual(AL.gap);
    });

    it("reads a Retry-After given as a date, and waits a minute when there's none", async () => {
        const waited: number[] = [];
        AL.onWait = s => waited.push(s);
        replies.push(answer(429, { "Retry-After": new Date(t0() + 8000).toUTCString() }), answer(429));
        const a = AL.q("a");
        await vi.advanceTimersByTimeAsync(80000);
        await a;
        expect(waited).toEqual([8, 61]);
    });

    it("lets something you're waiting on go ahead of the queue, but not past a 429's wait", async () => {
        replies.push(answer(429, { "Retry-After": "6" }));
        const a = AL.q("a"),
            b = AL.q("b");
        await vi.advanceTimersByTimeAsync(1000);
        const now = AL.q("now", {}, undefined, 0, true);
        await vi.advanceTimersByTimeAsync(20000);
        await Promise.all([a, b, now]);
        expect(when()[0]).toEqual(["a", 0]);
        expect(
            when()
                .slice(1)
                .every(([, at]) => at >= 6000)
        ).toBe(true);
        expect(
            when()
                .map(([q]) => q)
                .slice(1)
        ).toEqual(expect.arrayContaining(["a", "b", "now"]));
    });

    it("lets whoever asked give up while queued, at once, without holding up the rest", async () => {
        const ctl = new AbortController();
        const a = AL.q("a"),
            b = watch(AL.q("b", {}, ctl.signal)),
            c = AL.q("c");
        await vi.advanceTimersByTimeAsync(100);
        ctl.abort();
        await vi.advanceTimersByTimeAsync(0);
        expect(b.done && b.err && b.err.name).toBe("AbortError");
        await vi.advanceTimersByTimeAsync(AL.gap * 3);
        await Promise.all([a, c]);
        expect(when()).toEqual([
            ["a", 0],
            ["c", AL.gap],
        ]);
    });

    it("lets whoever asked give up during a 429's wait", async () => {
        const ctl = new AbortController();
        replies.push(answer(429, { "Retry-After": "60" }));
        const a = watch(AL.q("a", {}, ctl.signal));
        await vi.advanceTimersByTimeAsync(1000);
        ctl.abort();
        await vi.advanceTimersByTimeAsync(0);
        expect(a.done && a.err && a.err.name).toBe("AbortError");
        await vi.advanceTimersByTimeAsync(120000);
        expect(sent.length).toBe(1);
    });
});
