// @vitest-environment happy-dom
// The Learning Centre's data and reasoning: an older Learning Centre turned into today's without losing anything, the
// order to read a course in, what typing a subject or topic finds in the catalogue (and that every book and page in it
// holds together), two copies meeting with deletions kept, and which tabs each mode offers.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clone, DEFAULT_MODES, items, meta, ui } from "../../src/features/core/core";
import type { Course, Courses, Mode, PathBook } from "../../src/features/core/model";
import {
    lcConvertOld,
    lcMerge,
    lcStripPersonal,
    stageLevel,
    topicOfModule,
} from "../../src/features/learning-centre/learning-data";
import { lcAddBook, lcCurId, lcTopic, sameBook } from "../../src/features/learning-centre/learning";
import { lcNext, lcOrder } from "../../src/features/learning-centre/learning-order";
import {
    catBookIn,
    catFind,
    catScope,
    catTopicFor,
    CATALOGUE,
} from "../../src/features/learning-centre/catalogue/catalogue";
import { lcFromCatalogue, lcGuess } from "../../src/features/learning-centre/learning-build";
import { applyParts } from "../../src/features/import-export/packs";
import { tabFits } from "../../src/features/core/shell";
import { pageAllowed } from "../../worker/proxy";

// the second version's shape: a course and its pathway apart, Curricula by course
const V2 = {
    v: 2,
    subjects: [
        {
            id: "s-maths",
            name: "Mathematics",
            g: "∑",
            fields: { Analysis: { lvl: 2 }, Algebra: { lvl: 1 } },
            order: ["Analysis", "Algebra"],
            goal: 3,
            sources: [{ id: "src1", kind: "uni", name: "Cambridge" }],
            opps: [{ id: "op1", t: "Putnam", when: "2026-12-01" }],
        },
        { id: "s-aero", name: "Aeronautics", fields: {}, goal: 3 },
    ],
    paths: [
        {
            id: "p1",
            name: "Mathematics",
            sub: "s-maths",
            uni: "Cambridge",
            method: "Do every sheet.",
            goals: [{ id: "g1", t: "Part IB by June", date: "2027-06-01" }],
            view: "map",
            threads: ["Analysis"],
            stages: [
                { id: "ia", name: "Part IA" },
                { id: "iii", name: "Part III", spec: true },
            ],
            modules: [
                { id: "m1", stage: "ia", name: "Analysis I", status: "done" },
                { id: "m3", stage: "iii", name: "Algebraic Topology", status: "planned" },
            ],
            books: [
                {
                    id: "b1",
                    t: "Calculus",
                    a: "Michael Spivak",
                    mod: "m1",
                    st: "done",
                    top: true,
                    note: "every exercise",
                },
                {
                    id: "b2",
                    t: "Algebraic Topology",
                    a: "Allen Hatcher",
                    mod: "m3",
                    st: "todo",
                    after: [{ k: "b1", s: "done" }],
                },
                { id: "b3", t: "Topology", a: "James Munkres", where: "Point-set topology", st: "reading" },
            ],
        },
        // a second pathway for the same course: joined into it
        {
            id: "p2",
            name: "Oxford",
            sub: "s-maths",
            uni: "Oxford",
            stages: [{ id: "y1", name: "Year 1" }],
            modules: [{ id: "m9", stage: "y1", name: "Groups and Group Actions", status: "planned" }],
            books: [{ id: "b9", t: "Groups and Symmetry", a: "M. A. Armstrong", mod: "m9" }],
        },
        {
            id: "p3",
            name: "Aero",
            sub: "s-aero",
            uni: "Imperial",
            stages: [{ id: "y4", name: "Year 4" }],
            modules: [{ id: "a1", stage: "y4", code: "AERO70016", name: "Orbital Mechanics", credits: 5, grade: 71 }],
            books: [{ id: "c1", t: "Orbital Mechanics for Engineering Students", a: "Howard D. Curtis", mod: "a1" }],
            req: { credits: 480 },
        },
        // a pathway with no course: a course of its own
        { id: "p4", name: "Chess openings", books: [{ id: "z1", t: "My System", a: "Aron Nimzowitsch" }] },
    ],
    curricula: {
        "s-maths": {
            topics: [{ id: "t1", name: "Real analysis", area: "Analysis" }],
            books: { k1: ["Understanding Analysis", "Stephen Abbott"] },
            progs: [
                {
                    id: "pr1",
                    uni: "Oxford",
                    name: "BA",
                    modules: [{ name: "Analysis I", core: true, topics: ["t1"], books: ["k1"] }],
                },
            ],
            chosen: { t1: "k1" },
            extra: {},
            hide: [],
        },
    },
};
const course = (C: Courses, id: string) => C.courses.find(c => c.id === id)!;
const book = (C: Course, id: string) => C.books.find(b => b.id === id)!;

describe("an older Learning Centre comes in as today's, nothing lost", () => {
    it("reads a stage's name as a level where it says one", () => {
        expect([stageLevel("Year 1"), stageLevel("Part IA"), stageLevel("Part II"), stageLevel("Final year")]).toEqual([
            2, 2, 2, 2,
        ]);
        expect([stageLevel("Part III"), stageLevel("MSc"), stageLevel("Year 4"), stageLevel("Level 7")]).toEqual([
            3, 3, 3, 3,
        ]);
        expect([stageLevel("PhD"), stageLevel("Foundation year"), stageLevel("Michaelmas")]).toEqual([4, 1, undefined]);
        expect([
            topicOfModule("AERO50001 Aerodynamics 2"),
            topicOfModule("Analysis I"),
            topicOfModule("Fluid Mechanics"),
        ]).toEqual(["Aerodynamics", "Analysis", "Fluid Mechanics"]);
    });

    it("each pathway becomes (or joins) its course: books keep their ids, state, conditions and modules", () => {
        const C = lcConvertOld(clone(V2));
        expect(C.v).toBe(3);
        expect(C.courses.map(c => c.id)).toEqual(["s-maths", "s-aero", "s-p4"]);
        const M = course(C, "s-maths");
        expect(M.books.map(b => b.id)).toEqual(["b1", "b2", "b3", "b9"]);
        expect(book(M, "b1")).toMatchObject({ st: "done", top: true, note: "every exercise", mod: "m1", lvl: 2 });
        expect(book(M, "b2")).toMatchObject({ lvl: 3, after: [{ k: "b1", s: "done" }] }); // Part III: master's
        expect(book(M, "b9").lvl).toBe(2); // Year 1
        expect(book(M, "b3").lvl).toBeUndefined(); // no module: no level said
        const tname = (b: PathBook) => M.topics.find(t => t.id === b.topic)?.name;
        // books the catalogue knows go in its topics, named and placed as it names and places them
        expect([tname(book(M, "b1")), tname(book(M, "b2")), tname(book(M, "b3"))]).toEqual([
            "Calculus",
            "Algebraic topology",
            "Metric and topological spaces",
        ]);
        expect(M.topics.find(t => t.name === "Calculus")?.area).toBe("Foundations");
        expect(M.topics.find(t => t.name === "Real analysis")?.area).toBe("Analysis"); // Curricula's, kept
        // the degree's stages and modules, both pathways'
        expect(M.stages!.map(s => s.name)).toEqual(["Part IA", "Part III", "Year 1"]);
        expect(M.modules!.map(m => m.id)).toEqual(["m1", "m3", "m9"]);
        expect(M.degree).toBeUndefined(); // no marks, no requirements: not a degree
        expect(course(C, "s-aero")).toMatchObject({ degree: true, uni: "Imperial", req: { credits: 480 } });
        expect(course(C, "s-p4").books.map(b => b.t)).toEqual(["My System"]);
    });

    it("keeps what this version doesn't show: milestones, method, sources, opportunities, Curricula's picks", () => {
        const M = course(lcConvertOld(clone(V2)), "s-maths");
        const kept = JSON.stringify(M.kept);
        for (const x of ["Do every sheet.", "Part IB by June", '"threads"', '"chosen"', '"Oxford"'])
            expect(kept).toContain(x);
        expect(M.sources).toEqual([{ id: "src1", kind: "uni", name: "Cambridge", url: "", note: "" }]);
        expect(M.opps![0]).toMatchObject({ id: "op1", t: "Putnam" });
        // Curricula's programme, its module's books by title and author
        expect(M.progs).toEqual([
            expect.objectContaining({
                id: "pr1",
                modules: [
                    expect.objectContaining({
                        name: "Analysis I",
                        topics: ["t1"],
                        books: [["Understanding Analysis", "Stephen Abbott"]],
                    }),
                ],
            }),
        ]);
        expect(M.topics.find(t => t.id === "t1")).toEqual({ id: "t1", name: "Real analysis", area: "Analysis" });
    });

    it("today's shape comes back the same through an export and an import", () => {
        const C = lcConvertOld(clone(V2));
        const again = lcConvertOld(JSON.parse(JSON.stringify(C)));
        expect(again).toEqual(C);
        // a pack made to share leaves opportunities out, and nothing else
        const shared = lcStripPersonal(C);
        expect(course(shared, "s-maths").opps).toBeUndefined();
        expect(course(shared, "s-maths").books).toEqual(course(C, "s-maths").books);
    });
});

describe("one row for each topic", () => {
    // an older course naming its topics its own way, the catalogue's way too, and once with no topic at all
    const OWN = {
        v: 2,
        subjects: [{ id: "s-m", name: "Mathematics", fields: {}, goal: 3 }],
        paths: [
            {
                id: "p",
                sub: "s-m",
                stages: [{ id: "ia", name: "Part IA" }],
                modules: [
                    { id: "m1", stage: "ia", name: "Analysis I" },
                    { id: "m2", stage: "ia", name: "Groups" },
                    { id: "m3", stage: "ia", name: "Vectors and Matrices" },
                    { id: "m4", stage: "ia", name: "Complex Analysis" },
                    { id: "m5", stage: "ia", name: "Analysis and Topology" },
                ],
                books: [
                    { id: "b1", t: "Understanding Analysis", a: "Stephen Abbott", mod: "m1" },
                    { id: "b2", t: "Groups and Symmetry", a: "M. A. Armstrong", mod: "m2" },
                    { id: "b3", t: "Linear Algebra Done Right", a: "Sheldon Axler", mod: "m3" },
                    { id: "b4", t: "Complex Analysis", a: "Elias M. Stein, Rami Shakarchi", mod: "m4" },
                    { id: "b5", t: "Lecture notes", a: "Someone", mod: "m5" },
                    { id: "b6", t: "My own notebook", a: "Me" },
                ],
            },
        ],
        curricula: {
            "s-m": {
                topics: [
                    { id: "t1", name: "Real analysis" },
                    { id: "t2", name: "Group theory" },
                    { id: "t3", name: "complex analysis" },
                    { id: "t4", name: "Linear Algebra" },
                ],
            },
        },
    };
    const rows = (b: PathBook) => [b.topic, ...(b.tops || [])].length;
    const names = (C: Course) => C.topics.map(t => t.name.toLowerCase());

    it("matches a name to the catalogue's topic: any case, a name it's known by, the same words", () => {
        const M = [CATALOGUE[0]];
        const is = (n: string) => catTopicFor(n, M)?.t.name;
        expect([is("Complex Analysis"), is("Group theory"), is("Groups"), is("Vectors and Matrices")]).toEqual([
            "Complex analysis",
            "Groups",
            "Groups",
            "Linear algebra",
        ]);
        expect([is("Analysis"), is("Analysis I"), is("Topology")]).toEqual([
            "Real analysis",
            "Real analysis",
            "Metric and topological spaces",
        ]);
        // no topic in particular, and a name of its own, aren't matched
        expect([is("General"), is("Readings"), is("Analysis and Topology"), is("Knot theory")]).toEqual([
            undefined,
            undefined,
            undefined,
            undefined,
        ]);
    });

    it("converting: one topic for each name, each in an area, never Topics or General, each book in one row", () => {
        const C = lcConvertOld(clone(OWN)).courses[0];
        const N = names(C);
        expect(new Set(N).size).toBe(N.length);
        expect(N).toEqual(expect.arrayContaining(["real analysis", "groups", "complex analysis", "linear algebra"]));
        expect(N).not.toEqual(expect.arrayContaining(["analysis"]));
        expect(N).not.toEqual(expect.arrayContaining(["group theory"]));
        for (const t of C.topics) expect(["", "Topics", "General", "Other"]).not.toContain(t.area);
        for (const b of C.books) expect(rows(b)).toBe(1);
        // Curricula's topic of the same name is the one the book is in, under its own id
        expect(book(C, "b1").topic).toBe("t1");
        // a topic of its own goes in the area it fits: Analysis and Topology in Analysis
        expect(C.topics.find(t => t.name === "Analysis and Topology")?.area).toBe("Analysis");
        // a book with no topic, in a topic of its own in a real area
        const own = C.topics.find(t => t.id === book(C, "b6").topic)!;
        expect(["", "Topics", "General", "Other"]).not.toContain(own.area);
    });

    it("the catalogue's subject fetched into it: still one row each, and no book in two rows it doesn't serve", () => {
        const C = lcConvertOld(clone(OWN)).courses[0];
        lcFromCatalogue(catFind("maths")[0], C);
        const N = names(C);
        expect(new Set(N).size).toBe(N.length);
        expect(N.filter(n => n.includes("analysis") && !/real|complex|functional|numerical/.test(n))).toEqual([
            "analysis and topology",
        ]);
        // a book in two rows only where the catalogue puts it in two topics
        for (const b of C.books) {
            const k = catBookIn([CATALOGUE[0]], b.t, b.a);
            expect(rows(b)).toBe(k ? Math.max(1, k.topics.length) : 1);
        }
        expect(C.books.filter(b => b.t === "Understanding Analysis").length).toBe(1);
        // the topic it named its own way is joined into the catalogue's
        expect(C.topics.some(t => t.name === "Analysis")).toBe(false);
    });

    it("an imported section's name is the catalogue's topic where it is one", () => {
        const C = lcConvertOld(clone(OWN)).courses[0];
        const id = lcTopic(C, "Group Theory");
        expect(C.topics.find(t => t.id === id)?.name).toBe("Groups");
        const own = lcTopic(C, "Knot theory");
        expect(C.topics.find(t => t.id === own)?.area).toBe("Algebra");
    });
});

describe("the order to read a course in", () => {
    const C = (books: PathBook[], now?: number): Course => ({
        id: "c",
        name: "C",
        fields: {},
        topics: [],
        books,
        progs: [],
        now,
    });
    beforeEach(() => items.clear());

    it("what a book needs comes first, then the lower level, then its reading list's order", () => {
        const B: PathBook[] = [
            { id: "x", t: "X", lvl: 3, ord: 1, after: [{ k: "y", s: "done" }] },
            { id: "y", t: "Y", lvl: 2, ord: 5 },
            { id: "z", t: "Z", lvl: 1, ord: 9 },
            { id: "w", t: "W", lvl: 2, ord: 2 },
        ];
        expect(lcOrder(C(B)).map(b => b.id)).toEqual(["z", "w", "y", "x"]);
    });

    it("books that wait on each other in a circle are all still there", () => {
        const B: PathBook[] = [
            { id: "a", t: "A", after: [{ k: "b", s: "done" }] },
            { id: "b", t: "B", after: [{ k: "a", s: "done" }] },
            { id: "c", t: "C" },
        ];
        expect(
            lcOrder(C(B))
                .map(b => b.id)
                .sort()
        ).toEqual(["a", "b", "c"]);
    });

    it("Next: what you're reading, then what's ready, each with what it lets you start; below your level is known", () => {
        const B: PathBook[] = [
            { id: "f", t: "Foundations book", lvl: 1, st: "todo" },
            { id: "r", t: "Reading", lvl: 2, st: "reading" },
            { id: "a", t: "Ready", lvl: 2, st: "todo" },
            { id: "w", t: "Waits on Ready", lvl: 3, after: [{ k: "a", s: "done" }] },
            { id: "s", t: "Waits on Reading being underway", lvl: 3, after: [{ k: "r", s: "start" }] },
        ];
        const N = lcNext(C(B, 2));
        expect(N.reading.map(x => x.b.id)).toEqual(["r"]);
        expect(N.ready.map(x => x.b.id)).toEqual(["a", "s"]); // "f" is below your level
        expect(N.ready[0].unlocks.map(b => b.id)).toEqual(["w"]);
        expect(N.left).toBe(5);
        // at no level yet, the foundations book is first
        expect(lcNext(C(B)).ready[0].b.id).toBe("f");
    });

    it("another book on a topic you've read one on at that level comes after the rest", () => {
        const B: PathBook[] = [
            { id: "d", t: "Done one", topic: "t", lvl: 2, st: "done" },
            { id: "alt", t: "Another on the same", topic: "t", lvl: 2, ord: 1 },
            { id: "new", t: "A new topic", topic: "u", lvl: 2, ord: 2 },
        ];
        expect(lcNext(C(B)).ready.map(x => x.b.id)).toEqual(["new", "alt"]);
    });
});

describe("the catalogue", () => {
    it('finds a subject however it\'s typed: "math", "maths", "mathematics"', () => {
        for (const q of ["math", "maths", "Mathematics", "MATHS "]) {
            const h = catFind(q)[0];
            expect([h.s.id, h.t]).toEqual(["maths", undefined]);
        }
        const tp = catFind("theoretical physics")[0];
        expect([tp.s.id, tp.t]).toEqual(["theoretical-physics", undefined]);
        expect(catFind("physics")[0].s.id).toBe("physics");
        expect(catFind("aeronautics")[0].s.id).toBe("aerospace");
    });

    it('finds a narrow topic inside its subject: "propulsion" is aerospace engineering\'s', () => {
        const h = catFind("propulsion")[0];
        expect(h.s.id).toBe("aerospace");
        expect(h.t?.id).toBe("propulsion");
        expect(catFind("orbital mechanics")[0].t?.id).toBe("orbital");
        expect(catFind("qft")[0].t?.id).toBe("qft");
        expect(catFind("nothing like this at all")).toEqual([]);
    });

    it("a topic's course is that topic and what it builds on, with every book its books need", () => {
        const sc = catScope(catFind("propulsion")[0]);
        // propulsion builds on thermodynamics and fluid mechanics, and fluid mechanics on engineering mathematics
        expect(sc.topics.map(t => t.id).sort()).toEqual(["fluids", "maths", "propulsion", "thermo"]);
        const keys = sc.books.map(b => b.k);
        expect(keys).toEqual(expect.arrayContaining(["hill-peterson", "kerrebrock", "cengel", "white-fm"]));
        expect(keys).not.toContain("sutton"); // rockets build on propulsion, not the other way round
        for (const b of sc.books) for (const n of b.needs || []) expect(keys).toContain(n);
        // and only the programmes' modules that teach those topics
        for (const p of sc.progs)
            for (const m of p.modules) expect(m.topics.some(t => sc.topics.some(x => x.id === t))).toBe(true);
    });

    it("holds together: ten subjects, every book where it's referenced, levels 1–4, pages the site can fetch", () => {
        expect(CATALOGUE.map(s => s.id)).toEqual([
            "maths",
            "theoretical-physics",
            "physics",
            "aerospace",
            "mechanical",
            "cs",
            "ee",
            "chemistry",
            "economics",
            "philosophy",
        ]);
        const aero = CATALOGUE.find(s => s.id === "aerospace")!;
        for (const t of ["propulsion", "aerodynamics", "structures", "flight-mech", "orbital"])
            expect(aero.topics.some(x => x.id === t)).toBe(true);
        for (const s of CATALOGUE) {
            const keys = s.books.map(b => b.k);
            expect(new Set(keys).size).toBe(keys.length);
            const tids = s.topics.map(t => t.id);
            for (const b of s.books) {
                expect(b.lvl).toBeGreaterThanOrEqual(1);
                expect(b.lvl).toBeLessThanOrEqual(4);
                for (const n of [...(b.needs || []), ...(b.with || [])])
                    expect(keys, `${s.id}: ${b.k} needs ${n}`).toContain(n);
                expect(
                    s.topics.some(t => t.books.includes(b.k)),
                    `${s.id}: ${b.k} is in no topic`
                ).toBe(true);
            }
            for (const t of s.topics) {
                expect(t.books.length, `${s.id}/${t.id} has books`).toBeGreaterThan(0);
                for (const k of t.books) expect(keys).toContain(k);
                for (const a of t.after || []) expect(tids).toContain(a);
            }
            expect(s.progs.length).toBeGreaterThanOrEqual(2);
            for (const p of s.progs) {
                for (const u of [p.url, p.src, ...p.modules.map(m => m.list)].filter((x): x is string => !!x))
                    expect(pageAllowed(new URL(u).hostname), u).toBe(true);
                for (const m of p.modules) {
                    for (const t of m.topics) expect(tids, `${p.id}: ${m.name}`).toContain(t);
                    for (const k of m.books || []) expect(keys).toContain(k);
                }
            }
        }
    });
});

describe("building a course, and two copies meeting", () => {
    let before: typeof meta.courses;
    beforeEach(() => {
        document.body.innerHTML = `<div id="app"><header id="top"></header><aside id="side"></aside><main id="main"></main></div><div id="overlay"></div>`;
        before = clone(meta.courses);
        meta.courses = { v: 3, courses: [], gone: {} };
        ui.learnSub = null;
    });
    afterEach(() => {
        meta.courses = before;
        ui.learnSub = null;
    });

    it("a subject from the catalogue is a course at once: topics, books placed by level, what each needs", () => {
        const C = lcFromCatalogue(catFind("maths")[0]);
        expect(lcCurId()).toBe(C.id);
        expect(C.topics.length).toBe(CATALOGUE[0].topics.length);
        expect(C.books.length).toBe(CATALOGUE[0].books.length);
        const rudin = C.books.find(b => b.t === "Principles of Mathematical Analysis")!,
            abbott = C.books.find(b => b.t === "Understanding Analysis")!;
        expect(rudin).toMatchObject({ lvl: 2, after: [{ k: abbott.id, s: "done" }] });
        expect(C.progs.map(p => p.uni)).toEqual(["University of Cambridge", "University of Cambridge", "MIT"]);
        // fetched into again: nothing doubles
        lcFromCatalogue(catFind("maths")[0], C);
        expect(C.books.length).toBe(CATALOGUE[0].books.length);
        expect(C.progs.length).toBe(3);
        // a book that serves two topics is one book
        const spivak = C.books.find(b => b.t === "Calculus" && b.a === "Michael Spivak")!;
        expect(spivak.topic).toBeTruthy();
    });

    it("guesses a found book's topic and level", () => {
        const C = lcFromCatalogue(catFind("aerospace")[0]);
        const g = lcGuess(C, "Rocket Propulsion Elements");
        expect(C.topics.find(t => t.id === g.topic)?.name).toBe("Rocket and space propulsion");
        expect(g.lvl).toBe(2);
        expect(sameBook("Calculus", "Spivak", "Calculus on Manifolds", "Spivak")).toBe(false);
        expect(sameBook("Topology: a first course", "J. Munkres", "Topology", "James R. Munkres")).toBe(true);
    });

    it("deleted on one side stays deleted: a course, a book in one, a programme; additions on both sides are kept", () => {
        const base = lcConvertOld(clone(V2));
        const A = clone(base),
            B = clone(base);
        // A deletes a course, a book and a programme
        A.courses = A.courses.filter(c => c.id !== "s-aero");
        const am = course(A, "s-maths");
        am.books = am.books.filter(b => b.id !== "b3");
        am.progs = [];
        A.gone = {
            "s-aero": "2026-11-14T10:00:00.000Z",
            b3: "2026-11-14T10:00:00.000Z",
            pr1: "2026-11-14T10:00:00.000Z",
        };
        // B adds a book, finishes another, and adds a course
        const bm = course(B, "s-maths");
        lcAddBook(bm, { t: "Linear Algebra Done Right", a: "Sheldon Axler" });
        book(bm, "b2").st = "done";
        B.courses.push({ id: "new", name: "Philosophy", fields: {}, topics: [], books: [], progs: [] });
        for (const R of [lcMerge(A, B), lcMerge(B, A)]) {
            expect(R.courses.map(c => c.id).sort()).toEqual(["new", "s-maths", "s-p4"]);
            const m = course(R, "s-maths");
            expect(m.books.map(b => b.t)).not.toContain("Topology");
            expect(m.books.map(b => b.t)).toContain("Linear Algebra Done Right");
            expect(book(m, "b2").st).toBe("done");
            expect(m.progs).toEqual([]);
            expect(Object.keys(R.gone || {}).sort()).toEqual(["b3", "pr1", "s-aero"]);
            // and meeting again changes nothing
            expect(lcMerge(R, B)).toEqual(lcMerge(R, B));
            expect(
                lcMerge(R, B)
                    .courses.map(c => c.id)
                    .sort()
            ).toEqual(["new", "s-maths", "s-p4"]);
        }
    });

    it("an import that merges keeps a deletion, and one that replaces takes the import whole", async () => {
        const all = lcConvertOld(clone(V2));
        meta.courses = clone(all);
        meta.courses.courses = meta.courses.courses.filter(c => c.id !== "s-p4");
        meta.courses.gone = { "s-p4": "2026-11-14T10:00:00.000Z" };
        await applyParts({ academic: clone(all) }, { academic: true }, "merge");
        expect(meta.courses.courses.map(c => c.id)).toEqual(["s-maths", "s-aero"]);
        await applyParts({ academic: clone(all) }, { academic: true }, "replace");
        expect(meta.courses.courses.map(c => c.id)).toEqual(["s-maths", "s-aero", "s-p4"]);
    });
});

describe("the tabs a mode offers", () => {
    const mode = (id: string) => DEFAULT_MODES.find(m => m.id === id) as Mode;
    it("This season only where there's anime, Releasing where there's TV, and the Learning Centre keeps to its own", () => {
        const fits = (id: string) =>
            ["seasonal", "releasing", "series", "diary", "playing", "learn", "curricula"].filter(k =>
                tabFits(mode(id), k)
            );
        expect(fits("academic")).toEqual(["learn", "curricula"]);
        expect(fits("animanga")).toEqual(["seasonal", "releasing", "series", "diary"]);
        expect(fits("screen")).toEqual(["releasing", "diary"]);
        expect(fits("games")).toEqual(["playing"]);
        expect(fits("universal")).toEqual(["seasonal", "releasing", "series", "diary", "playing"]);
        expect(tabFits(mode("academic"), "stats")).toBe(true);
    });
});
