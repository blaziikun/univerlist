// @vitest-environment happy-dom
// The player's own logic: which server to start on in which browser, where an episode's opening is (AniSkip, a
// file's chapters), episode names as the catalogues give them, the player's address (#watch/…), and the settings
// whose defaults changed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { meta } from "../../src/features/core/core";
import { alNumbered, epNumberIn, jikanFill } from "../../src/features/watch-read/episodes";
import { aniskipIntro, chapterIntro } from "../../src/features/watch-read/intro";
import { type Browser, chance, playOrder, typeOf } from "../../src/features/watch-read/playable";
import { placeHash, placeOf, showKey } from "../../src/features/watch-read/route";
import { playerSave, PS, WP, wpSave } from "../../src/features/watch-read/watch";

afterEach(() => vi.restoreAllMocks());

// two browsers, as canPlayType answers in each
const chrome: Browser = {
    can: m => (/^video\/(mp4|webm)/.test(m) ? "maybe" : ""),
    apple: false,
    mse: true,
};
const iphone: Browser = {
    can: m => (/^video\/mp4|mpegurl/i.test(m) ? "maybe" : ""),
    apple: true,
    mse: false,
};
const MKV = { name: "Your server · Show - 03.mkv", url: "https://box.ts.net/stream/abc/3?token=x", how: "original" },
    REMUX = { name: "converted", url: "https://box.ts.net/remux/abc/3?token=x", how: "converted", type: "video/mp4" },
    HLS = { name: "for this device", url: "https://box.ts.net/hls/abc/3/index.m3u8?token=x", how: "converted" };

describe("the server to start on", () => {
    it("reads what a source is from its type or its address", () => {
        expect(typeOf(MKV)).toBe("");
        expect(typeOf({ url: "http://nas/Show/ep.mkv" })).toBe("video/x-matroska");
        expect(typeOf(HLS)).toBe("application/vnd.apple.mpegurl");
        expect(typeOf({ url: "x", type: "Video/MP4" })).toBe("video/mp4");
    });
    it("on an iPhone, never a Matroska file first, and an adaptive stream before the rest", () => {
        const L = [{ ...MKV, type: "video/x-matroska" }, REMUX, HLS];
        expect(chance(L[0], iphone)).toBe(0);
        expect(playOrder(L, iphone)).toEqual([2, 1, 0]);
    });
    it("in Chrome, the order the servers came in (it plays Matroska without saying so)", () => {
        const L = [{ ...MKV, type: "video/x-matroska" }, REMUX, HLS];
        expect(playOrder(L, chrome)).toEqual([0, 1, 2]);
    });
    it("one it can't play at all goes last", () => {
        expect(playOrder([{ url: "http://nas/a.avi" }, { url: "http://nas/a.mp4" }], chrome)).toEqual([1, 0]);
    });
});

describe("where the opening is", () => {
    it("takes AniSkip's opening, not its ending", () => {
        const answer = {
            found: true,
            results: [
                { skipType: "ed", interval: { startTime: 1300, endTime: 1390 } },
                { skipType: "op", interval: { startTime: 62.5, endTime: 152.4 } },
            ],
        };
        expect(aniskipIntro(answer)).toEqual({ start: 62.5, end: 152.4 });
        expect(aniskipIntro({ found: false, results: [] })).toBeNull();
        expect(aniskipIntro("nonsense")).toBeNull();
        expect(
            aniskipIntro({ found: true, results: [{ skipType: "op", interval: { startTime: 90, endTime: 10 } }] })
        ).toBeNull();
    });
    it("takes a file's chapter named as its opening", () => {
        expect(
            chapterIntro([
                { start: 0, end: 30, title: "Prologue" },
                { start: 30, end: 120, title: "Opening" },
                { start: 120, end: 1300, title: "Part A" },
            ])
        ).toEqual({ start: 30, end: 120 });
        expect(chapterIntro([{ start: 0, end: 90, title: "OP" }])).toEqual({ start: 0, end: 90 });
        expect(chapterIntro([{ start: 0, end: 1400, title: "Opening night" }])).toBeNull(); // far too long for one
        expect(chapterIntro([{ start: 10, end: 90, title: "Operation Daybreak" }])).toBeNull();
    });
});

describe("episode names", () => {
    it("reads an episode's number however a site wrote it", () => {
        expect(epNumberIn("Episode 12 - The End")).toBe(12);
        expect(epNumberIn("S2E3 - Return")).toBe(3);
        expect(epNumberIn("Season 2 Episode 3 - Return")).toBe(3);
        expect(epNumberIn("7. Night")).toBe(7);
    });
    it("numbers a season's episodes by their names, a second season's from 1, and keeps only the name", () => {
        const L = alNumbered(
            [
                { title: "Episode 14 - Two", thumbnail: "b.jpg" },
                { title: "Episode 13 - One", thumbnail: "a.jpg" },
            ],
            12
        );
        expect(L).toHaveLength(12);
        expect(L[0]).toMatchObject({ e: 1, title: "One", image: "a.jpg" });
        expect(L[1]).toMatchObject({ e: 2, title: "Two" });
        expect(L[2].title).toBe("");
    });
    it("names the rest from MyAnimeList, a page at a time, only where nothing named them", async () => {
        const asked: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (u: RequestInfo | URL) => {
                asked.push(String(u));
                return new Response(
                    JSON.stringify({
                        data: [
                            { mal_id: 1, title: "Not this one", aired: "2016-04-07T00:00:00+00:00" },
                            { mal_id: 2, title: "A Certain Bomb", aired: "2016-04-14T00:00:00+00:00" },
                        ],
                        pagination: { has_next_page: false },
                    }),
                    { headers: { "Content-Type": "application/json" } }
                );
            })
        );
        const S = {
            n: 1,
            label: "S1",
            eps: [
                { e: 1, title: "Fortune" },
                { e: 2, title: "" },
                { e: 3, title: "Episode 3" },
            ],
        };
        expect(await jikanFill(S, 31478)).toBe(true);
        expect(S.eps.map(e => e.title)).toEqual(["Fortune", "A Certain Bomb", "Episode 3"]);
        expect(asked).toEqual(["https://api.jikan.moe/v4/anime/31478/episodes?page=1"]);
        vi.unstubAllGlobals();
    });
});

describe("the player's address", () => {
    it("names a show by your entry, or by the catalogue's id", () => {
        expect(showKey({ title: "x", ext: { anilist: 21311, tvmaze: 5 } })).toBe("al.21311");
        expect(showKey({ title: "x", ext: { tvmaze: 5 } })).toBe("tm.5");
        expect(showKey({ title: "x" })).toBe("");
    });
    it("goes there and back: show, season and episode; a film has neither", () => {
        const h = placeHash({ key: "al.21311", season: 2, e: 7 });
        expect(h).toBe("#watch/al.21311/2/7");
        expect(placeOf(h)).toEqual({ key: "al.21311", season: 2, e: 7 });
        expect(placeOf("#watch/i.abc_12")).toEqual({ key: "i.abc_12", season: 1, e: null });
    });
    it("ignores an address that isn't one of its own", () => {
        for (const h of ["", "#link=abc", "#watch/", "#watch/evil.1/1/1", "#watch/al.1/0/1", "#watch/%E0%A4%A"])
            expect(placeOf(h), h).toBeNull();
    });
});

describe("the player's settings", () => {
    it("drops the defaults an older version wrote down, so today's apply (fit, 15 s jumps)", () => {
        meta.settings.player = { fit: "cover", seek: 10, speed: 1.5 };
        expect(PS().fit).toBe("contain");
        expect(PS().seek).toBe(15);
        expect(PS().speed).toBe(1.5);
        playerSave({ volume: 0.4 });
        expect(meta.settings.player).toEqual({ speed: 1.5, volume: 0.4, v: 2 });
        playerSave({ fit: "cover" });
        expect(PS().fit).toBe("cover");
    });
    it("lays the page out afresh: seasons and episodes, then the description, both under the player", () => {
        meta.settings.watchPage = {
            eps: "detailed",
            place: { about: "side", seasons: "side", eps: "side" },
            tools: ["x"],
        };
        expect(WP()).toMatchObject({ eps: "detailed", order: ["eps", "about"], place: { eps: "main", about: "main" } });
        wpSave({ ...WP(), place: { eps: "side", about: "off" } });
        expect(WP().place).toEqual({ eps: "side", about: "off" });
    });
});
