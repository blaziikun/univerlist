// Music: MusicBrainz release groups become albums the app can add (title, artist, year, kind, cover, genres), and an
// album's details give its track count and minutes per track. MusicBrainz is stood in for by a fake fetch.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { albumDetails, searchAlbums, toAlbum } from "../../src/features/music/musicbrainz";

const OK_COMPUTER = {
    id: "b1392450-e666-3926-a536-22c65f834433",
    title: "OK Computer",
    "primary-type": "Album",
    "first-release-date": "1997-05-21",
    "artist-credit": [{ name: "Radiohead" }],
    tags: [
        { name: "alternative rock", count: 9 },
        { name: "art rock", count: 4 },
    ],
};
let calls: string[];
beforeEach(() => {
    calls = [];
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
        calls.push(String(url));
        const u = String(url);
        const body = u.includes("/release-group/?query=")
            ? {
                  "release-groups": [
                      OK_COMPUTER,
                      {
                          id: "x",
                          title: "Live at Somewhere",
                          "primary-type": "Album",
                          "secondary-types": ["Live"],
                          "artist-credit": [{ name: "A", joinphrase: " & " }, { name: "B" }],
                      },
                  ],
              }
            : u.includes("/release-group/")
              ? {
                    ...OK_COMPUTER,
                    genres: [{ name: "rock", count: 3 }],
                    releases: [
                        { id: "late", status: "Official", date: "2009-03-24" },
                        { id: "first", status: "Official", date: "1997-05-21" },
                        { id: "boot", status: "Bootleg", date: "1990" },
                    ],
                }
              : { id: "first", media: [{ tracks: [{ length: 240000 }, { length: 300000 }, { length: 180000 }] }] };
        return new Response(JSON.stringify(body), { status: 200 });
    });
});

describe("music: MusicBrainz", () => {
    it("turns a release group into an album: artist, year, kind, cover, genres", () => {
        expect(toAlbum(OK_COMPUTER)).toEqual({
            src: "mb",
            medium: "album",
            title: "OK Computer",
            creator: "Radiohead",
            year: 1997,
            kind: "Album",
            cover: "https://coverartarchive.org/release-group/b1392450-e666-3926-a536-22c65f834433/front-500",
            genres: ["Alternative Rock", "Art Rock"],
            ext: { mbid: "b1392450-e666-3926-a536-22c65f834433" },
        });
    });
    it("searches, and says a live album is Live and credits several artists as written", async () => {
        const r = await searchAlbums("ok computer");
        expect(r.map(a => [a.title, a.kind, a.creator])).toEqual([
            ["OK Computer", "Album", "Radiohead"],
            ["Live at Somewhere", "Live", "A & B"],
        ]);
        expect(calls[0]).toContain("query=ok%20computer");
        expect(calls[0]).toContain("fmt=json");
    });
    it("takes tracks and length from the first official edition (not a later one, not a bootleg)", async () => {
        const d = await albumDetails(OK_COMPUTER.id);
        expect(d).toMatchObject({ total: 3, runtime: 4, edition: "first", genres: ["Rock"] });
        expect(calls.at(-1)).toContain("/release/first?inc=recordings");
    });
    it("waits its turn: at most one request a second, as MusicBrainz asks", async () => {
        const t0 = Date.now();
        await searchAlbums("a");
        await searchAlbums("b");
        expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
    });
});
