// The Pathagoras bridge's plan: statuses only move forward, new books are added once, and only a real offer is read.
import { describe, it, expect } from "vitest";
import { planBridge, readOffer, sameTitle } from "../../src/features/bridge/plan";
import type { Item } from "../../src/features/core/model";

const book = (id: string, title: string, creator: string, status: Item["status"]) =>
    ({ id, title, creator, status, medium: "book", tags: ["Learning"] }) as Item & { id: string };

describe("the Pathagoras bridge", () => {
    it("moves statuses forward, never back", () => {
        const here = [
            book("a", "Calculus", "Michael Spivak", "want"),
            book("b", "Principles of Mathematical Analysis", "Walter Rudin", "done"),
        ];
        const plan = planBridge(
            [
                { title: "Calculus", creator: "Michael Spivak", status: "active" },
                { title: "Principles of Mathematical Analysis", creator: "Walter Rudin", status: "active" },
            ],
            here
        );
        expect(plan.moves).toEqual([{ id: "a", status: "active" }]);
        expect(plan.adds).toEqual([]);
    });

    it("adds what isn't here once, and tells same-titled books apart by author", () => {
        const here = [book("a", "Calculus", "James Stewart", "done")];
        const plan = planBridge(
            [
                { title: "Calculus", creator: "Michael Spivak", status: "active" },
                { title: "The Rising Sea: Foundations of Algebraic Geometry", creator: "Ravi Vakil", status: "done" },
                { title: "Rising Sea", creator: "Ravi Vakil", status: "done" },
            ],
            here
        );
        expect(plan.adds.map(a => a.title)).toEqual(["Calculus", "The Rising Sea: Foundations of Algebraic Geometry"]);
        expect(sameTitle("The Rising Sea: Foundations…")).toBe("rising sea");
    });

    it("finds a book by its own id first", () => {
        const plan = planBridge(
            [{ title: "Another title", creator: "", status: "done", univerlistId: "a" }],
            [book("a", "Calculus", "x", "active")]
        );
        expect(plan.moves).toEqual([{ id: "a", status: "done" }]);
    });

    it("reads only an offer from this protocol", () => {
        expect(
            readOffer(
                {
                    kind: "pathagoras-bridge",
                    v: 1,
                    step: "offer",
                    books: [{ title: "x", status: "done" }, { title: "y", status: "want" }, "junk"],
                },
                1
            )
        ).toEqual([{ title: "x", creator: "", status: "done" }]);
        expect(readOffer({ kind: "pathagoras-bridge", v: 2, step: "offer", books: [] }, 1)).toBeNull();
        expect(readOffer("nope", 1)).toBeNull();
    });
});
