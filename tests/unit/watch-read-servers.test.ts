// @vitest-environment happy-dom
// Watch & read's servers and catalogues (watch-read/medialibs.ts, readlibs.ts, watch.ts) answer with someone else's
// data, and they answer late. A folder listing with an odd name, a pasted server code, a catalogue's page count, and
// an answer for a show or book you've already left must neither break anything nor land on the page you're on now.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { items, meta, migrateItem } from "../../src/features/core/core";
import { AL } from "../../src/features/sources/sources";
import { FD, libMatchShow, serverFromCode } from "../../src/features/watch-read/medialibs";
import { MAX_PAGES, readMatch, remotePages, RLS } from "../../src/features/watch-read/readlibs";
import { W, watchOpen } from "../../src/features/watch-read/watch";

const json = (x: unknown) => new Response(JSON.stringify(x), { headers: { "Content-Type": "application/json" } });
// a fetch that answers by address; the first call to `held` waits until let go
function serverAnswers(byPath: Record<string, unknown>, held?: string) {
    let release = () => {};
    const gate = new Promise<void>(r => (release = r));
    let waited = false;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: RequestInfo | URL) => {
            const u = String(url);
            if (held && !waited && u.includes(held)) {
                waited = true;
                await gate;
            }
            const k = Object.keys(byPath).find(p => u.split("?")[0].endsWith(p));
            return k ? json(byPath[k]) : json([]);
        })
    );
    return () => release();
}
const code = (o: unknown) => "UL1:" + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const realQ = AL.q;

beforeEach(() => {
    document.body.innerHTML = `<div id="app"><header id="top"></header><aside id="side"></aside><main id="main"></main></div><div id="overlay"></div>`;
    meta.settings.libs = [];
    meta.settings.rlibs = [];
    W.show = null;
    W.seasons = [];
    W.player = null;
});
afterEach(() => {
    vi.unstubAllGlobals();
    AL.q = realQ;
    items.clear();
    meta.settings.libs = [];
    meta.settings.rlibs = [];
    W.show = null;
    W.seasons = [];
});

describe("a shared folder's listing", () => {
    it("keeps a file whose name has a stray % in it, instead of refusing the whole server", async () => {
        serverAnswers({ "/v/": [{ name: "100% Orange Juice.mp4" }, { name: "Show - 01.mp4" }] });
        const idx = await FD.crawl({ id: "pct", type: "folder", url: "http://nas.local/v" });
        expect(idx.files.sort()).toEqual(["100% Orange Juice.mp4", "Show - 01.mp4"]);
        expect(FD.url(idx, "100% Orange Juice.mp4")).toBe("http://nas.local/v/100%25%20Orange%20Juice.mp4");
    });
});

describe("a friend's server code", () => {
    it("is read when it names a kind of server there is", () => {
        expect(
            serverFromCode(code({ t: "plex", n: "Den", u: "http://192.168.1.4:32400", k: "tok", f: "Sam", r: 0 }))
        ).toEqual({
            type: "plex",
            name: "Den",
            url: "http://192.168.1.4:32400",
            key: "tok",
            from: "Sam",
            read: false,
        });
    });

    it("is refused when its kind is a name every object has (constructor, toString)", () => {
        for (const t of ["constructor", "toString", "__proto__"])
            expect(serverFromCode(code({ t, n: "x", u: "http://192.168.1.4" }))).toBeNull();
        expect(serverFromCode("UL1:not base64 at all")).toBeNull();
    });
});

describe("a catalogue's page count", () => {
    it("is held to what a book could have, so a huge one can't freeze the reader", async () => {
        const pages = await remotePages({
            name: "Chapter 1",
            ch: 1,
            pse: { href: "http://komga.local/p/{pageNumber}", count: 200000 },
        });
        expect(pages!.length).toBeLessThanOrEqual(MAX_PAGES);
        expect(pages![2]).toBe("http://komga.local/p/2");
    });
});

describe("answers for something you've already left", () => {
    it("your media servers' episodes of the last show don't land on the one you opened", async () => {
        meta.settings.libs = [{ id: "nas", type: "folder", url: "http://nas.local/v", on: true }];
        const release = serverAnswers(
            {
                "/v/": [{ name: "Alpha", is_dir: true }],
                "/v/Alpha/": [{ name: "Alpha - 01.mp4" }, { name: "Alpha - 02.mp4" }],
            },
            "/v/"
        );
        W.show = { title: "Alpha", medium: "tv" };
        W.seasons = [{ n: 1, label: "Season 1", eps: [{ e: 1 }, { e: 2 }] }];
        const first = libMatchShow(); // waits on the server
        W.show = { title: "Beta", medium: "tv" };
        W.seasons = [{ n: 1, label: "Season 1", eps: [{ e: 1 }] }];
        await libMatchShow();
        release();
        await first;
        expect([...W.lib.keys()]).toEqual([]);
        expect(W.libNote).toBe("Not found on your servers.");
    });

    it("your reading servers' chapters of the last book don't land on the one you opened", async () => {
        meta.settings.rlibs = [{ id: "books", type: "folder", url: "http://nas.local/m", on: true }];
        items.set("alpha", migrateItem({ title: "Alpha", medium: "manga", status: "active" }));
        items.set("beta", migrateItem({ title: "Beta", medium: "manga", status: "active" }));
        const release = serverAnswers(
            {
                "/m/": [{ name: "Alpha", is_dir: true }],
                "/m/Alpha/": [{ name: "Alpha 01.cbz" }, { name: "Alpha 02.cbz" }],
            },
            "/m/"
        );
        const first = readMatch("alpha"); // waits on the server
        await readMatch("beta");
        release();
        await first;
        expect(RLS.item).toBe("beta");
        expect(RLS.list).toEqual([]);
        expect(RLS.note).toBe("Not found on your servers.");
    });

    it("AniList's seasons of the last show don't land on the one you opened", async () => {
        serverAnswers({});
        let release = () => {};
        const gate = new Promise<void>(r => (release = r));
        AL.q = vi.fn(async (query: string, vars: { id: number }) => {
            if (/streamingEpisodes/.test(query))
                return { Media: { episodes: 12, streamingEpisodes: [], externalLinks: [] } };
            if (vars.id === 10) await gate;
            return {
                Media: {
                    id: vars.id,
                    format: "TV",
                    episodes: 12,
                    seasonYear: 2010 + vars.id,
                    season: "SPRING",
                    title: { romaji: "Alpha " + vars.id, english: "Alpha " + vars.id },
                    relations: {
                        edges:
                            vars.id === 10
                                ? [{ relationType: "SEQUEL", node: { id: 11, format: "TV", type: "ANIME" } }]
                                : [],
                    },
                },
            };
        });
        items.set(
            "alpha",
            migrateItem({ title: "Alpha", medium: "anime", kind: "TV", status: "active", ext: { anilist: 10 } })
        );
        items.set("beta", migrateItem({ title: "Beta", medium: "anime", kind: "TV", status: "active" }));
        const first = watchOpen({ ...items.get("alpha")!, id: "alpha" }, { play: false });
        await watchOpen({ ...items.get("beta")!, id: "beta" }, { play: false });
        release();
        await first;
        expect(W.show!.title).toBe("Beta");
        expect(W.seasons.map(s => s.member)).toEqual(["beta"]);
        expect(W.show!.groupId).toBeUndefined();
    });

    it("TVmaze's episodes of the last show don't land on the one you opened", async () => {
        const release = serverAnswers(
            { "/shows/1/episodes": [1, 2, 3].map(e => ({ season: 1, number: e, name: "Alpha " + e })) },
            "/shows/1/episodes"
        );
        const first = watchOpen({ title: "Alpha", medium: "tv", ext: { tvmaze: 1 } }, { play: false });
        await watchOpen({ title: "Beta", medium: "film", ext: {} }, { play: false });
        release();
        await first;
        expect(W.show!.title).toBe("Beta");
        expect(W.seasons).toHaveLength(1);
        expect(W.seasons[0].label).toBe("Film");
    });
});

describe("AniList adding the seasons you haven't added yet", () => {
    it("keeps you on the season you opened", async () => {
        serverAnswers({});
        AL.q = vi.fn(async (query: string, vars: { id: number }) => {
            if (/streamingEpisodes/.test(query))
                return { Media: { episodes: 12, streamingEpisodes: [], externalLinks: [] } };
            const NEXT: Record<number, number[]> = { 1: [2], 2: [3], 3: [] },
                next = NEXT[vars.id];
            return {
                Media: {
                    id: vars.id,
                    format: "TV",
                    episodes: 12,
                    seasonYear: 2019 + vars.id,
                    season: "SPRING",
                    title: { romaji: "Show " + vars.id, english: "Show " + vars.id },
                    relations: {
                        edges: next.map(id => ({ relationType: "SEQUEL", node: { id, format: "TV", type: "ANIME" } })),
                    },
                },
            };
        });
        items.set(
            "s1",
            migrateItem({
                title: "Show",
                medium: "anime",
                kind: "TV",
                year: 2020,
                status: "want",
                ext: { anilist: 1 },
                links: [{ id: "s2", type: "sequel" }],
            })
        );
        items.set(
            "s2",
            migrateItem({
                title: "Show 2",
                medium: "anime",
                kind: "TV",
                year: 2021,
                status: "active",
                ext: { anilist: 2 },
                links: [{ id: "s1", type: "prequel" }],
            })
        );
        await watchOpen({ ...items.get("s2")!, id: "s2" }, { play: false });
        expect(W.seasons.map(s => s.member || s.title)).toEqual(["s1", "s2", "Show 3"]);
        expect(W.si).toBe(1);
        expect(W.seasons[W.si].eps).toHaveLength(12); // the season's episode list lands on the season on the page
    });
});
