// The Learning Centre's course hub: mastery from finished work, graduation requirements, modules and topics that wait on
// others, crème de la crème, the seven best places to learn it (https links only), and opportunities kept out of shared exports
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1300, height: 900 } });
    await setup(c);
    const p = await c.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await ev(() => {
        const C = __ulTest.ACS();
        C.subjects.push({
            id: "s-x",
            name: "Mathematics",
            g: "∑",
            fields: { Analysis: { lvl: 2 }, Algebra: { lvl: 1 } },
            order: ["Analysis", "Algebra"],
            goal: 3,
        });
        const P = __ulTest.lcNewPath({ name: "Cambridge Tripos", uni: "Cambridge", sub: "s-x" });
        P.stages = [
            { id: "y1", name: "Part IA" },
            { id: "p3", name: "Part III" },
        ];
        P.modules = [
            {
                id: "a",
                stage: "y1",
                name: "Analysis I",
                credits: 10,
                core: true,
                status: "done",
                topics: [
                    { t: "Limits", done: true },
                    { t: "Continuity", done: true },
                ],
            },
            {
                id: "b",
                stage: "y1",
                name: "Groups",
                credits: 10,
                core: true,
                status: "planned",
                topics: [{ t: "Subgroups", done: false }],
            },
            {
                id: "c",
                stage: "p3",
                name: "Algebraic Topology",
                credits: 20,
                core: false,
                status: "planned",
                after: ["b"],
                topics: [{ t: "Homotopy", done: false, after: ["Subgroups"] }],
            },
        ];
        P.books = [
            { id: "k1", t: "Calculus", a: "Spivak", st: "done", top: true },
            { id: "k2", t: "Topology", a: "Munkres", st: "todo" },
        ];
        __ulTest.setMode("academic");
        __ulTest.ui.learnSub = "s-x";
        __ulTest.ui.pwId = null;
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    const st = await ev(() => ({
        m: __ulTest.lcMastery(__ulTest.lcSub("s-x")!),
        ring: (document.querySelector(".lcmastery .ring b") || {}).textContent,
        creme: document.querySelectorAll(".lccreme .pwlist > *").length,
        prog: document.querySelectorAll(".lcgrad").length,
    }));
    ok(
        "mastery comes from finished work (topics and core books)",
        st.m.td === 2 && st.m.tn === 4 && st.m.bd === 1 && st.m.bn === 2 && st.ring === "50%",
        JSON.stringify(st)
    );
    ok("the starred book is in the crème de la crème", st.creme === 1, JSON.stringify(st));
    ok(
        "the course page shows its programme (what it takes to graduate) right there",
        st.prog === 1,
        JSON.stringify(st)
    );
    // sources: https only, seven at most
    await p.fill("#lc-src-name", "Bad link");
    await p.fill("#lc-src-url", "javascript:alert(1)");
    await p.click('[data-act="lc-src-add"]');
    await p.waitForTimeout(100);
    ok("a link that isn't https is refused", await ev(() => !(__ulTest.lcSub("s-x")!.sources || []).length));
    for (let i = 0; i < 8; i++) {
        await ev(i => {
            const S = __ulTest.lcSub("s-x");
            if ((S!.sources || []).length < 7)
                S!.sources = [
                    ...(S!.sources || []),
                    { id: "q" + i, kind: "uni", name: "U" + i, url: "https://example.org/" + i },
                ];
        }, i);
    }
    await ev(() => __ulTest.renderMain());
    await p.waitForTimeout(100);
    ok(
        "seven places at most, each with a link to check",
        await ev(
            () =>
                __ulTest.lcSub("s-x")!.sources!.length === 7 &&
                !document.querySelector("#lc-src-name") &&
                document.querySelectorAll(".lcsr a.link").length === 7
        )
    );
    // opportunities: yours, and not in what you share
    await p.fill("#lc-opp-t", "Putnam");
    await p.fill("#lc-opp-u", "https://maa.org/putnam");
    await p.click('[data-act="lc-opp-add"]');
    await p.waitForTimeout(100);
    ok("an opportunity is kept", await ev(() => (__ulTest.lcSub("s-x")!.opps || []).length === 1));
    ok(
        "…and left out of shared exports",
        await ev(
            () =>
                !JSON.stringify(__ulTest.lcStripPersonal(__ulTest.ACS())).includes("Putnam") &&
                JSON.stringify(__ulTest.ACS()).includes("Putnam")
        )
    );
    const st2 = await ev(async () => {
        const all = await __ulTest.v2Files({}),
            some = await __ulTest.v2Files({ parts: { library: false, favourites: false, lists: false } }),
            none = await __ulTest.v2Files({ parts: { academic: false } });
        const ac = (r: typeof all) => String((r.files.find(f => f.name === "academic.json") || {}).data || "");
        return { all: ac(all), some: ac(some), none: ac(none) };
    });
    ok(
        "…but your own backups keep every course, pathway and opportunity, whatever else you leave out",
        [st2.all, st2.some].every(a => a.includes("Putnam") && a.includes("Cambridge Tripos")),
        st2.all.length + " / " + st2.some.length
    );
    ok("…unless you untick the Learning Centre", !st2.none, String(st2.none.length));
    // the programme: graduation, waits
    await ev(() => {
        __ulTest.ui.pwId = __ulTest.PWS().find(x => x.name === "Cambridge Tripos")!.id;
        __ulTest.renderMain();
    });
    await p.waitForTimeout(150);
    await p.fill('[data-lcreq="options"]', "1");
    await p.dispatchEvent('[data-lcreq="options"]', "change");
    await p.waitForTimeout(100);
    const st3 = await ev(() => ({
        req: __ulTest.pwCur()!.req,
        txt: document.querySelector<HTMLElement>(".lcgrad")!.innerText,
        wait: (document.querySelector(".lcmod .lcwait") || {}).textContent,
    }));
    ok(
        "graduation: core done, options needed",
        st3.req!.options === 1 &&
            /1\/2\s*core/.test(st3.txt.replace(/\n/g, " ")) &&
            /0\/1\s*options needed/.test(st3.txt.replace(/\n/g, " ")),
        JSON.stringify(st3)
    );
    ok("a module waits on the one it needs", /Waits on Groups/.test(st3.wait || ""), JSON.stringify(st3));
    ok(
        "a topic waits on the topic it needs",
        await ev(
            () =>
                __ulTest.lcTopicWaits(__ulTest.pwCur()!, __ulTest.pwCur()!.modules![2].topics![0]).join() ===
                "Subgroups"
        )
    );
    await ev(() => {
        __ulTest.ui.lcOpen = "b";
        __ulTest.renderMain();
    });
    await p.waitForTimeout(100);
    await p.fill('[data-lctopicadd="b"]', "Sylow theorems < Subgroups");
    await p.press('[data-lctopicadd="b"]', "Enter");
    await p.waitForTimeout(100);
    ok(
        '"Topic < what it needs" adds a waiting topic',
        await ev(() => {
            const t = __ulTest.pwCur()!.modules![1].topics!.find(x => x.t === "Sylow theorems");
            return !!t && t.after!.join() === "Subgroups";
        })
    );
    await p.click('[data-act="lc-stage-spec"][data-k="p3"]');
    await p.waitForTimeout(100);
    ok("Part III can be marked a specialised stage", await ev(() => __ulTest.pwCur()!.stages![1].spec === true));
    ok("no page errors", !errs.length, errs.join(" | "));
    if (process.env.SHOTS) {
        await ev(() => {
            __ulTest.ui.pwId = null;
            __ulTest.renderMain();
        });
        await p.screenshot({ path: ENV.OUT + "/lc-hub.png", fullPage: true });
    }
    await b.close();
})();
