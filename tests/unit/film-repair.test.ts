// @vitest-environment happy-dom
// A film an earlier lookup matched to the video game of the same name is repaired once (sources/covers.ts): its
// director is read again from Wikidata, and so is its Wikipedia article, which the repair had cleared.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { items, meta, migrateItem } from "../../src/features/core/core";
import { autoCovers, scoreQ } from "../../src/features/sources/covers";

const json = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
beforeEach(() => {
    document.body.innerHTML = `<div id="app"><header id="top"></header><aside id="side"></aside><main id="main"></main></div><div id="overlay"></div>`;
    meta.settings.v9repair = true; // not the other one-time repair
    scoreQ.stopped = true; // nor the crowd scores
    vi.stubGlobal(
        "fetch",
        vi.fn(async url => {
            if (/query\.wikidata\.org\/sparql/.test(url))
                return json({
                    results: {
                        bindings: [
                            {
                                item: { value: "http://www.wikidata.org/entity/Q1" },
                                itemLabel: { value: "Heat" },
                                creatorLabel: { value: "Michael Mann" },
                                crole: { value: "dir" },
                                article: { value: "https://en.wikipedia.org/wiki/Heat_(1995_film)" },
                            },
                        ],
                    },
                });
            return json({ query: { pages: {} } });
        })
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
    items.clear();
    scoreQ.stopped = false;
});

describe("repairing a film matched to a game", () => {
    it("gets its director and its Wikipedia article back", async () => {
        items.set(
            "heat-film",
            migrateItem({
                title: "Heat",
                medium: "film",
                status: "done",
                creator: "",
                creatorFix: true,
                matchRepaired: true,
                scoresTried: "earlier",
                ext: { wikidata: "Q1", imdb: "tt0113277" },
            })
        );
        await autoCovers([]);
        await vi.waitFor(() => expect(items.get("heat-film")!.creatorFixed).toBe(true), { timeout: 3000 });
        const b = items.get("heat-film");
        expect(b!.creator).toBe("Michael Mann");
        expect(b!.ext.wiki).toBe("Heat (1995 film)");
        expect(b!.ext.wikidata).toBe("Q1");
    });
});
