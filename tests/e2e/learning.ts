// The Learning Centre (an official extension, empty to start), the menu line, Dramas as Film & TV shelves, a score scale per
// title, and search results split by type. University pages are stood in for by local copies.
// What it once got wrong: in a reading's dialog, Enter added a part twice, and Edit closed after every change made in it.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
// the import dialog's rows, which the dialog keeps untyped (Modal): the tests cast them to this, the shape they have
import type { LcRow } from "../../src/features/learning-centre/learning-import";
const CORS = { "access-control-allow-origin": "*" };
// a programme page: years as headings, modules in a table and a list, optional ones under their own heading
const PROGRAMME = `<html><body><nav><a href="/">Home</a><a href="/study">Study</a></nav><h1>Aeronautical Engineering MEng</h1>
  <h2>Year 1</h2><table><tr><th>Code</th><th>Module</th><th>Credits</th></tr>
    <tr><td>AERO40001</td><td>Mathematics 1</td><td>15</td></tr><tr><td>AERO40002</td><td>Aerostructures 1</td><td>10</td></tr><tr><td>AERO40003</td><td>Fluid Mechanics 1</td><td>10</td></tr></table>
  <h2>Year 2</h2><ul><li><a href="/m/AERO50001">AERO50001 Aerodynamics 2 (15 credits)</a></li><li>AERO50002 – Flight Mechanics (10 credits)</li></ul>
  <h3>Optional modules</h3><ul><li>AERO50010 Spacecraft Propulsion (5 ECTS)</li><li>AERO50011 Philosophy of Mind (5 ECTS)</li></ul>
  <footer><p>© 2026 Example University</p></footer></body></html>`;
// a Talis Aspire list, as its own data: two sections, in order
const R = "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    RL = "http://purl.org/vocab/resourcelist/schema#",
    DC = "http://purl.org/dc/terms/",
    BIBO = "http://purl.org/ontology/bibo/",
    FOAF = "http://xmlns.com/foaf/0.1/";
const u = (v: string) => [{ type: "uri", value: v }],
    l = (v: string) => [{ type: "literal", value: v }];
const TALIS = {
    "https://x.rl.talis.com/lists/abc": { [R + "type"]: u(RL + "List"), [R + "_1"]: u("s1"), [R + "_2"]: u("s2") },
    s1: {
        [R + "type"]: u(RL + "Section"),
        [DC + "title"]: l("Essential reading"),
        [R + "_1"]: u("i1"),
        [R + "_2"]: u("i2"),
    },
    s2: { [R + "type"]: u(RL + "Section"), [DC + "title"]: l("Further reading"), [R + "_1"]: u("i3") },
    i1: { [RL + "resource"]: u("r1"), [RL + "importance"]: u(RL + "ImportanceEssential") },
    i2: { [RL + "resource"]: u("r2") },
    i3: { [RL + "resource"]: u("r3") },
    r1: {
        [DC + "title"]: l("Fundamentals of Aerodynamics"),
        [BIBO + "authorList"]: u("al1"),
        [DC + "date"]: l("2017"),
        [BIBO + "isbn13"]: l("9781259129919"),
    },
    al1: { [R + "_1"]: u("p1") },
    p1: { [FOAF + "name"]: l("John D. Anderson") },
    r2: { [DC + "title"]: l("Aerodynamics for Engineering Students"), [DC + "creator"]: u("p2") },
    p2: { [FOAF + "name"]: l("E. L. Houghton") },
    r3: { [DC + "title"]: l("Theory of Wing Sections"), [DC + "creator"]: u("p3") },
    p3: { [FOAF + "name"]: l("Ira H. Abbott") },
};
// a module's own page with its reading list in Harvard style
const MODPAGE = `<html><body><h1>AERO50002 Flight Mechanics</h1><p>Learn how aircraft fly.</p><h2>Reading list</h2><ul>
  <li>Etkin, B. (1996) <i>Dynamics of Flight: Stability and Control</i>. 3rd edn. New York: Wiley.</li>
  <li>Cook, M.V. (2012) <i>Flight Dynamics Principles</i>. Oxford: Butterworth-Heinemann.</li>
  <li><a href="/library">Library guide</a></li></ul></body></html>`;
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1400, height: 900 } });
    await setup(c);
    await c.route("https://www.example.ac.uk/**", r =>
        r.request().url().includes("/m/AERO50002")
            ? r.fulfill({ status: 200, contentType: "text/html", headers: CORS, body: MODPAGE })
            : r.fulfill({ status: 200, contentType: "text/html", headers: CORS, body: PROGRAMME })
    );
    await c.route("https://x.rl.talis.com/**", r =>
        r.request().url().endsWith(".json")
            ? r.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(TALIS) })
            : r.fulfill({ status: 200, contentType: "text/html", headers: CORS, body: '<div id="app"></div>' })
    );
    await c.route("https://blocked.example.ac.uk/**", r => r.abort());
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');

    // ---- empty, and an official extension ----
    const st = await ev(() => ({
        courses: __ulTest.meta.courses,
        ac: (({ name, space, extra }) => ({ name, space, extra }))(__ulTest.meta.modes.find(x => x.id === "academic")!),
        main: __ulTest.allModes().map(x => x.id),
        spaces: __ulTest.spaceModes().map(x => x.id),
        dramas: __ulTest.meta.modes.some(x => x.id === "dramas"),
    }));
    ok(
        "it starts empty: no subjects, no paths",
        st.courses.v === 2 && !st.courses.subjects.length && !st.courses.paths.length,
        JSON.stringify(st.courses)
    );
    ok(
        "the Learning Centre is a mode right after Games, and an extension you can switch off",
        st.ac.space === "learning-centre" &&
            st.ac.name === "Learning Centre" &&
            st.main.indexOf("academic") === st.main.indexOf("games") + 1 &&
            st.spaces.join() === "academic",
        JSON.stringify(st)
    );
    ok(
        "its tabs: Library, Courses, Curricula (pathways open inside their course)",
        st.ac.extra!.join() === "learn,curricula" &&
            (await ev(() => {
                __ulTest.setMode("academic");
                return __ulTest.tabsFor().slice(0, 3).join();
            })) === "library,learn,curricula",
        st.ac.extra!.join()
    );
    ok("it has a shortcut like the other modes (⇧6)", await ev(() => __ulTest.allModes()[5].id === "academic"));
    await ev(() => __ulTest.setMode("universal"));
    ok("no Dramas mode for a new library", !st.dramas);
    ok(
        "it is listed under Settings › Extensions › Built in",
        await ev(() => {
            __ulTest.goSettings("ext");
            return !!document.querySelector('[data-builtin="learning-centre"]');
        })
    );

    // ---- the line in the menus, with Watch & read on and off ----
    const lines = () =>
        ev(() => {
            __ulTest.ui.page = "profile";
            __ulTest.ui.modeMenu = true;
            __ulTest.render();
            const mm = document.querySelector(".modemenu"),
                sd = document.querySelector("#side");
            return {
                menu: !!(mm && mm.querySelector(".msep")),
                side: !!(sd && sd.querySelector(".nsep")),
                lc: !!(mm && [...mm.querySelectorAll('[data-k="academic"]')].length),
                after: mm
                    ? [...mm.children].findIndex(x => x instanceof HTMLElement && x.dataset.k === "academic") <
                      [...mm.children].findIndex(x => x.classList.contains("msep"))
                    : false,
            };
        });
    let L = await lines();
    ok(
        "the mode menu: Games, Learning Centre, the line, then Watch & read",
        L.menu && L.side && L.lc && L.after,
        JSON.stringify(L)
    );
    await ev(() => __ulTest.builtinSet("watch-read", false));
    L = await lines();
    ok("…and keeps the line with Watch & read switched off", L.menu && L.side, JSON.stringify(L));
    await ev(() => __ulTest.builtinSet("watch-read", true));

    // ---- switched off: academic books go to Literature ----
    const bid = await ev(() =>
        __ulTest.addItem({
            medium: "book",
            kind: "Academic",
            title: "Calculus",
            creator: "Michael Spivak",
            status: "want",
            subject: "Mathematics",
        })
    );
    const where = () =>
        ev(
            i => ({
                lit: __ulTest.modeItems(__ulTest.modeById("novels")).some(x => x.id === i),
                hub: __ulTest.modeItems(__ulTest.modeById("universal")).some(x => x.id === i),
                lc: __ulTest.spaceModes().length
                    ? __ulTest.modeItems(__ulTest.modeById("academic")).some(x => x.id === i)
                    : false,
            }),
            bid
        );
    let W = await where();
    ok(
        "on: an academic book is in the Learning Centre, not Literature or Hub",
        W.lc && !W.lit && !W.hub,
        JSON.stringify(W)
    );
    await ev(() => {
        __ulTest.setMode("academic");
        __ulTest.builtinSet("learning-centre", false);
    });
    W = await where();
    const st2 = await ev(() => {
        const mode = __ulTest.curMode().id;
        __ulTest.ui.modeMenu = true;
        __ulTest.render();
        return { mode, menu: !!document.querySelector('.modemenu [data-k="academic"]') };
    });
    ok(
        "off: it shows under Literature (and Hub), the space is gone from the menu, and you're moved out of it",
        W.lit && W.hub && !W.lc && !st2.menu && st2.mode === "universal",
        JSON.stringify({ W, st: st2 })
    );
    ok(
        "…and it can't be opened while off",
        await ev(() => {
            __ulTest.setMode("academic");
            return __ulTest.curMode().id !== "academic";
        })
    );
    await ev(() => __ulTest.builtinSet("learning-centre", true));

    // ---- subjects ----
    await ev(() => {
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    await ev(() => __ulTest.goTab("learn"));
    await p.waitForTimeout(150);
    await p.fill("[data-learnnew]", "Aeronautics");
    await p.press("[data-learnnew]", "Enter");
    await p.waitForTimeout(200);
    const st3 = await ev(() => ({ subs: __ulTest.ACS().subjects.map(s => s.name), open: __ulTest.ui.learnSub }));
    ok("a subject you add, opened", st3.subs.join() === "Aeronautics" && !!st3.open, JSON.stringify(st3));
    await p.fill("[data-learnfield]", "Aerodynamics");
    await p.press("[data-learnfield]", "Enter");
    await p.waitForTimeout(150);
    await p.click('[data-act="learn-lvl"][data-l="2"]');
    await p.waitForTimeout(150);
    ok(
        "its fields, rated on the scale (optional)",
        await ev(
            () =>
                __ulTest.ACS().subjects[0].fields.Aerodynamics.lvl === 2 &&
                /Undergraduate/.test(document.querySelector(".lfield .ln")!.textContent)
        )
    );

    // ---- a course's years and modules, fetched from a university's programme page ----
    const aeroId = await ev(() => __ulTest.ACS().subjects[0].id);
    await ev(() => {
        __ulTest.ui.learnSub = __ulTest.ui.pwId = null;
        __ulTest.renderMain();
    });
    await p.waitForTimeout(100);
    await p.click('[data-act="lc-newpath"]');
    await p.waitForSelector("#lcn-uni");
    await p.selectOption("#lcn-sub", aeroId);
    await p.fill("#lcn-uni", "Example University");
    await p.fill("#lcn-prog", "MEng");
    await p.fill("#lcn-url", "https://www.example.ac.uk/aero/modules");
    await p.fill("#lcn-about", "The whole degree, years 1 and 2 to start with.");
    await p.click('[data-act="lc-create"][data-k="fetch"]');
    await p.waitForSelector('[data-act="lci-fetch"]');
    await p.click('[data-act="lci-fetch"]');
    await p.waitForSelector('[data-act="lci-save"]', { timeout: 10000 });
    const rows = await ev(() =>
        (__ulTest.ui.modal!.rows as LcRow[]) /* cast: see LcRow above */
            .map(r => [r.stage, r.code, r.name, r.credits, r.core])
    );
    ok(
        "the module list is read: codes, names, credits, by year",
        rows.length === 7 &&
            rows[0].join("|") === "Year 1|AERO40001|Mathematics 1|15|true" &&
            rows[3].slice(0, 4).join("|") === "Year 2|AERO50001|Aerodynamics 2|15",
        JSON.stringify(rows)
    );
    ok(
        "…optional ones marked as options, nothing from the menus or footer",
        rows[5][4] === false && rows[6][4] === false && !rows.some(r => /Home|Study|©/.test(String(r[2]))),
        JSON.stringify(rows.slice(4))
    );
    await p.uncheck('[data-lcikeep="6"]');
    await p.fill('[data-lci="5"][data-f="name"]', "Spacecraft Propulsion (option)");
    await p.press('[data-lci="5"][data-f="name"]', "Tab");
    await p.click('[data-act="lci-save"]');
    await p.waitForTimeout(300);
    const st4 = await ev(() => {
        const P = __ulTest.pwCur();
        return {
            name: P!.name,
            uni: P!.uni,
            sub: __ulTest.ACS().subjects[0].id === P!.sub,
            stages: P!.stages!.map(s => s.name),
            mods: P!.modules!.map(m => m.name),
            y2: P!.modules!.filter(m => P!.stages!.find(s => s.id === m.stage)!.name === "Year 2").length,
        };
    });
    ok(
        "saved as the path's stages and modules, with your edits, minus the one you unticked",
        st4.stages.join() === "Year 1,Year 2" &&
            st4.mods.length === 6 &&
            st4.mods.includes("Spacecraft Propulsion (option)") &&
            !st4.mods.includes("Philosophy of Mind") &&
            st4.y2 === 3 &&
            st4.sub,
        JSON.stringify(st4)
    );
    if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + "/lc-path.png", fullPage: true });
    ok(
        "the path page shows the modules",
        await ev(
            () => document.querySelectorAll(".lcmod").length === 6 && document.querySelectorAll(".lcstage").length >= 2
        )
    );

    // ---- a module's reading list from Talis Aspire ----
    const aid = await ev(() => __ulTest.pwCur()!.modules!.find(m => m.code === "AERO50001")!.id);
    await p.click(`[data-act="lc-open"][data-k="${aid}"]`);
    await p.waitForTimeout(100);
    await p.click(`[data-act="lc-import"][data-m="${aid}"]`);
    await p.waitForSelector("#lci-url");
    await p.fill("#lci-url", "https://x.rl.talis.com/lists/ABCDEF01-2345-6789-ABCD-EF0123456789.html");
    await p.click('[data-act="lci-fetch"]');
    await p.waitForSelector('[data-act="lci-save"]', { timeout: 10000 });
    if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + "/lc-review.png" });
    const rows2 = await ev(() => ({
        how: __ulTest.ui.modal!.how,
        r: (__ulTest.ui.modal!.rows as LcRow[]) /* cast: see LcRow above */
            .map(r => [r.section, r.t, r.a, r.year, r.imp]),
    }));
    ok(
        "a Talis Aspire list is read exactly, in order, with sections and authors",
        rows2.how === "Talis Aspire" &&
            rows2.r.length === 3 &&
            rows2.r[0].join("|") === "Essential reading|Fundamentals of Aerodynamics|John D. Anderson|2017|core" &&
            rows2.r[2][0] === "Further reading" &&
            rows2.r[1][2] === "E. L. Houghton",
        JSON.stringify(rows2)
    );
    await p.click('[data-act="lci-save"]');
    await p.waitForTimeout(300);
    const st5 = await ev(i => {
        const P = __ulTest.pwCur(),
            B = P!.books.filter(b => b.mod === i);
        return { n: B.length, order: B.map(b => b.t.split(" ")[0]), buckets: B.map(b => __ulTest.pwBucket(P!, b)) };
    }, aid);
    ok(
        "saved under that module, in order, each waiting for the one before",
        st5.n === 3 &&
            st5.order.join() === "Fundamentals,Aerodynamics,Theory" &&
            st5.buckets.join() === "ready,waiting,waiting",
        JSON.stringify(st5)
    );
    await ev(i => {
        const P = __ulTest.pwCur(),
            b = P!.books.find(x => x.mod === i);
        __ulTest.pwSetState(P!, b!, "reading");
        __ulTest.renderMain();
    }, aid);
    ok(
        "starting the first one makes the next ready",
        await ev(i => {
            const P = __ulTest.pwCur(),
                B = P!.books.filter(b => b.mod === i);
            return __ulTest.pwBucket(P!, B[1]) === "ready";
        }, aid)
    );

    // ---- a module page with a Harvard-style list, and editing ----
    const fid = await ev(() => __ulTest.pwCur()!.modules!.find(m => m.code === "AERO50002")!.id);
    await p.click(`[data-act="lc-open"][data-k="${fid}"]`);
    await p.waitForTimeout(100);
    await p.click(`[data-act="lc-import"][data-m="${fid}"]`);
    await p.fill("#lci-url", "https://www.example.ac.uk/m/AERO50002");
    await p.click('[data-act="lci-fetch"]');
    await p.waitForSelector('[data-act="lci-save"]', { timeout: 10000 });
    const rows3 = await ev(() =>
        (__ulTest.ui.modal!.rows as LcRow[]) /* cast: see LcRow above */
            .map(r => [r.t, r.a, r.year])
    );
    ok(
        "a reading list on an ordinary page: titles, authors and years, not the page's other links",
        rows3.length === 2 &&
            rows3[0].join("|") === "Dynamics of Flight: Stability and Control|Etkin, B.|1996" &&
            rows3[1][0] === "Flight Dynamics Principles",
        JSON.stringify(rows3)
    );
    await p.click('[data-act="lci-save"]');
    await p.waitForTimeout(300);
    const second = await ev(i => __ulTest.pwCur()!.books.filter(b => b.mod === i)[1].id, fid);
    await p.click(`[data-act="lc-read-up"][data-k="${second}"]`);
    await p.waitForTimeout(150);
    ok(
        "readings reorder with ↑",
        await ev(i => __ulTest.pwCur()!.books.filter(b => b.mod === i)[0].t === "Flight Dynamics Principles", fid)
    );
    await p.fill(`[data-lcaddread="${fid}"]`, "Aircraft Performance, Anderson");
    await p.press(`[data-lcaddread="${fid}"]`, "Enter");
    await p.waitForTimeout(150);
    ok(
        'and you can add one by hand: "title, author"',
        await ev(i => {
            const B = __ulTest.pwCur()!.books.filter(b => b.mod === i);
            return B[2].t === "Aircraft Performance" && B[2].a === "Anderson";
        }, fid)
    );
    await p.fill(`[data-lcm="${fid}"][data-f="name"]`, "Flight Mechanics & Control");
    await p.press(`[data-lcm="${fid}"][data-f="name"]`, "Tab");
    await p.waitForTimeout(150);
    ok(
        "modules are edited in place",
        await ev(i => __ulTest.lcMod(__ulTest.pwCur()!, i)!.name === "Flight Mechanics & Control", fid)
    );
    // a module's topics, status and mark, and what the programme adds up to
    await p.fill(`[data-lctopicadd="${fid}"]`, "Longitudinal stability");
    await p.press(`[data-lctopicadd="${fid}"]`, "Enter");
    await p.waitForTimeout(100);
    await p.fill(`[data-lctopicadd="${fid}"]`, "Lateral dynamics");
    await p.press(`[data-lctopicadd="${fid}"]`, "Enter");
    await p.waitForTimeout(100);
    await p.check(`[data-lctopic="${fid}"][data-i="0"]`);
    await p.waitForTimeout(100);
    await p.fill(`[data-lcm="${fid}"][data-f="grade"]`, "72");
    await p.press(`[data-lcm="${fid}"][data-f="grade"]`, "Tab");
    await p.waitForTimeout(100);
    await p.selectOption(`.lcmod.open select[data-f="status"]`, "done");
    await p.waitForTimeout(150);
    const st6 = await ev(() =>
        [...document.querySelectorAll(".lcprog .tile")].map(
            t => t.querySelector(".v")!.textContent + " " + t.querySelector(".k")!.textContent
        )
    );
    ok(
        "modules have topics to tick, a status and a mark; the programme adds up topics, credits and a weighted mark",
        st6[0] === "2/2 Topics covered" &&
            /^10\/\d+ Credits done$/.test(st6[1]) &&
            st6[3] === "72.0 Credit-weighted mark",
        JSON.stringify(st6)
    );
    ok(
        "all four views are there: Modules, Map, Stages, Threads",
        await ev(
            () =>
                [...document.querySelectorAll('[data-act="pw-view"]')].map(b => b.textContent).join() ===
                "Modules,Map,Stages,Threads"
        )
    );
    for (const v of ["map", "stages", "threads"]) {
        await p.click(`[data-act="pw-view"][data-k="${v}"]`);
        await p.waitForTimeout(120);
    }
    ok(
        "…each draws (map, stages, threads)",
        await ev(() => document.querySelectorAll(".pwbody.v-threads .pwplq").length >= 2)
    );
    await p.click('[data-act="pw-view"][data-k="modules"]');

    // ---- can't be fetched: says so, and pasting works instead ----
    await p.click('[data-act="lc-import"]:not([data-m])');
    await p.fill("#lci-url", "https://blocked.example.ac.uk/list");
    await p.click('[data-act="lci-fetch"]');
    await p.waitForSelector(".modal .err", { timeout: 15000 });
    ok(
        "a page that can't be reached says so and opens the paste box",
        await ev(
            () =>
                /Paste its text/.test(document.querySelector(".modal .err")!.textContent) &&
                document.querySelector<HTMLDetailsElement>(".modal details")!.open
        )
    );
    await p.fill(
        "#lci-text",
        "Year 3\nAERO60001 Aircraft Design (20 credits)\nAERO60002 Individual Project (30 credits)\nAERO60003 Avionics (10 credits)"
    );
    await p.click('[data-act="lci-paste"]');
    await p.waitForSelector('[data-act="lci-save"]');
    const rows4 = await ev(() => ({
        kind: __ulTest.ui.modal!.found,
        r: (__ulTest.ui.modal!.rows as LcRow[]) /* cast: see LcRow above */
            .map(r => [r.stage, r.code, r.name, r.credits]),
    }));
    ok(
        "pasted text is read the same way",
        rows4.kind === "modules" &&
            rows4.r.length === 3 &&
            rows4.r[0].join("|") === "Year 3|AERO60001|Aircraft Design|20",
        JSON.stringify(rows4)
    );
    await p.click('[data-act="lci-save"]');
    await p.waitForTimeout(200);
    ok(
        "…and joins as Year 3",
        await ev(
            () =>
                __ulTest
                    .pwCur()!
                    .stages!.map(s => s.name)
                    .join() === "Year 1,Year 2,Year 3"
        )
    );

    // ---- Curricula: programmes compared topic by topic ----
    await ev(() => __ulTest.goTab("curricula"));
    await p.waitForTimeout(200);
    ok(
        "Curricula starts empty, with a way in",
        await ev(
            () =>
                /Nothing compared/.test(document.querySelector(".curr")!.textContent) &&
                !!document.querySelector("[data-unitopicadd]")
        )
    );
    for (const tp of ["Fluids — Aerodynamics", "Fluids — Compressible flow", "Flight — Flight mechanics"]) {
        await p.fill("[data-unitopicadd]", tp);
        await p.press("[data-unitopicadd]", "Enter");
        await p.waitForTimeout(80);
    }
    await p.click('[data-act="uni-paste"]');
    await p.fill("#up-uni", "Imperial");
    await p.fill("#up-name", "Aeronautics MEng");
    await p.fill(
        "#up-text",
        "★ Aerodynamics 2 — Anderson, Fundamentals of Aerodynamics\nCompressible Flow — Anderson, Modern Compressible Flow\n★ Flight Mechanics — Etkin, Dynamics of Flight"
    );
    await p.click('[data-act="uni-save"]');
    await p.waitForTimeout(150);
    await p.click('[data-act="uni-paste"]');
    await p.fill("#up-uni", "MIT");
    await p.fill("#up-name", "Course 16");
    await p.fill(
        "#up-text",
        "★ 16.100 Aerodynamics — Anderson, Fundamentals of Aerodynamics; Houghton, Aerodynamics for Engineering Students\nSpacecraft systems — Wertz, Space Mission Engineering"
    );
    await p.click('[data-act="uni-save"]');
    await p.waitForTimeout(150);
    const st7 = await ev(() => {
        const S = __ulTest.curS(__ulTest.curSid()!);
        return {
            progs: S.progs.length,
            topics: S.topics.map(t => t.name).join(),
            rows: document.querySelectorAll(".unitable tbody tr:not(.uarea)").length,
            star: [...document.querySelectorAll(".unitable .uc.core")].length,
            twice: [...document.querySelectorAll(".ubk i")].some(i => i.textContent === "×2"),
        };
    });
    ok(
        "pasted programmes are matched to topics (★ compulsory, ● offered) and a book set twice says ×2",
        st7.progs === 2 && st7.rows === 4 && st7.star >= 2 && st7.twice && /Spacecraft systems/.test(st7.topics),
        JSON.stringify(st7)
    );
    await p.click('.ubk:has-text("Aerodynamics for Engineering Students")');
    await p.waitForTimeout(100);
    await p.click('[data-act="uni-topath"]');
    await p.waitForTimeout(250);
    const st8 = await ev(() => {
        const P = __ulTest.pwCur();
        return { name: P!.name, view: P!.view, books: P!.books.map(b => b.t), th: P!.threads };
    });
    ok(
        "your picks join the course's reading order: one thread per area, in order",
        st8.name === "Aeronautics" &&
            st8.books.includes("Aerodynamics for Engineering Students") &&
            st8.books.includes("Fundamentals of Aerodynamics") &&
            st8.th!.join().endsWith("Fluids,Flight,Topics"),
        JSON.stringify(st8)
    );
    ok(
        "…and the course is still one course with one reading order",
        await ev(() => __ulTest.ACS().subjects.length === 1 && __ulTest.PWS().length === 1)
    );
    await ev(() => {
        __ulTest.ui.uniView = "side";
        __ulTest.goTab("curricula");
    });
    await p.waitForTimeout(100);
    ok(
        "…and Side by side lists each programme's modules",
        await ev(() => document.querySelectorAll(".uniside .panel").length === 2)
    );
    await ev(() => {
        __ulTest.ui.uniView = "merged";
        __ulTest.ui.pwId = __ulTest.PWS()[0].id;
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(150);
    ok(
        "the course opens as one page: its title, then what to read and its modules",
        await ev(
            () =>
                __ulTest.ui.tab === "learn" &&
                !!document.querySelector(".lsubj h2") &&
                !!document.querySelector(".pwhead") &&
                !!document.querySelector(".lfields")
        )
    );

    // ---- two pathways for one course (an older library, or an import) become one, nothing lost ----
    await ev(() => {
        const Q = __ulTest.lcNewPath({
            name: "Maths for engineers",
            uni: "Another University",
            about: "Just the maths.",
            sub: __ulTest.PWS()[0].sub,
        });
        Q.books.push({
            id: "kreyszig",
            t: "Advanced Engineering Mathematics",
            a: "Kreyszig",
            st: "reading",
            after: [],
        });
        Q.goals = [{ id: "g9", t: "Finish Kreyszig", done: false }];
    });
    await p.click('[data-act="learn-open"][data-k=""]');
    await p.waitForTimeout(200);
    const st9 = await ev(() => ({
        paths: __ulTest.PWS().length,
        cards: [...document.querySelectorAll(".lcov .lcpath:not(.lcnew)")].map(x => x.querySelector("b")!.textContent),
        about: (document.querySelector(".lcpath .lcabout") || {}).textContent,
        uni: (document.querySelector(".lcpath .lcuni") || {}).textContent,
    }));
    if (process.env.SHOTS) {
        await p.screenshot({ path: ENV.OUT + "/lc-overview.png" });
        await ev(() => {
            __ulTest.ui.modeMenu = true;
            __ulTest.render();
        });
        await p.screenshot({ path: ENV.OUT + "/lc-menu.png", clip: { x: 0, y: 0, width: 700, height: 700 } });
        await ev(() => {
            __ulTest.ui.modeMenu = false;
            __ulTest.render();
        });
    }
    ok(
        "Courses: one card per course, with its university and summary",
        st9.paths === 1 &&
            st9.cards.length === 1 &&
            /Aeronautics/.test(st9.cards[0]) &&
            /whole degree/.test(st9.about!) &&
            /Example University · MEng/.test(st9.uni!),
        JSON.stringify(st9)
    );
    await p.click(".lcov .lcpath:not(.lcnew)");
    await p.waitForTimeout(200);
    const st10 = await ev(() => {
        const P = __ulTest.pwCur();
        return {
            books: P!.books.map(b => b.t),
            goals: (P!.goals || []).map(g => g.t),
            mods: (P!.modules || []).length,
            merged: (document.querySelector(".lcmerged") || {}).textContent || "",
        };
    });
    ok(
        "…the second pathway's books and milestones are in the course, and where it came from is shown",
        st10.books.includes("Advanced Engineering Mathematics") &&
            st10.goals.includes("Finish Kreyszig") &&
            st10.mods >= 6 &&
            st10.books.filter(t => t === "Aerodynamics for Engineering Students").length === 1 &&
            /Maths for engineers \(Another University\): Just the maths/.test(st10.merged),
        JSON.stringify(st10)
    );

    const st11 = await ev(() => {
        const Q = __ulTest.lcNewPath({ name: "Number theory", sub: "" });
        Q.books.push({
            id: "hw",
            t: "An Introduction to the Theory of Numbers",
            a: "Hardy & Wright",
            st: "todo",
            after: [],
        });
        const S = __ulTest.ACS().subjects.find(x => x.name === "Number theory");
        return {
            course: !!S,
            same:
                !!S &&
                __ulTest
                    .PWS()
                    .find(p => p.sub === S.id)!
                    .books.some(b => b.id === "hw"),
        };
    });
    ok(
        "a pathway with no course becomes a course of its own, books and all",
        st11.course && st11.same,
        JSON.stringify(st11)
    );
    await ev(() => {
        const S = __ulTest.ACS().subjects.find(x => x.name === "Number theory");
        __ulTest.ACS().subjects = __ulTest.ACS().subjects.filter(x => x !== S);
        __ulTest.ACS().paths = __ulTest.ACS().paths.filter(p => p.sub !== S!.id);
    });

    // ---- an older library: Academic and Dramas, migrated once ----
    const st12 = await ev(() => {
        __ulTest.meta.modes = __ulTest.meta.modes.filter(x => x.id !== "academic");
        __ulTest.meta.modes.push({
            id: "academic",
            name: "Academic",
            g: "∫",
            match: ["book:Academic"],
            extra: ["learn", "paths", "courses"],
            blocks: [
                { k: "courses", w: 8 },
                { k: "summary", w: 12 },
            ],
            theme: "library",
        });
        __ulTest.meta.modes.splice(4, 0, {
            id: "dramas",
            name: "Dramas",
            g: "❀",
            match: ["tv:K-drama"],
            theme: "blossom",
        });
        const sc = __ulTest.modeById("screen");
        sc.dramas2 = false;
        sc.dramasSplit = true;
        sc.match = ["film", "!film:Anime film", "tv", "!tv:K-drama", "!tv:C-drama", "!tv:J-drama"];
        sc.shelves = [
            { name: "Films", match: ["film", "!film:Anime film"] },
            { name: "Series", match: ["tv"] },
        ];
        // an Academic mode's data from before the Learning Centre, which the app still brings in
        __ulTest.meta.courses = {
            programmes: [
                {
                    id: "x",
                    name: "Mathematics (BSc / MMath)",
                    subject: "Mathematics",
                    years: [
                        {
                            n: 1,
                            modules: [
                                {
                                    id: "m1",
                                    name: "Analysis I",
                                    credits: 15,
                                    kind: "core",
                                    status: "taking",
                                    topics: [{ t: "Real analysis", done: true }],
                                    readings: [],
                                },
                            ],
                        },
                    ],
                },
            ],
            paths: [
                {
                    id: "old",
                    name: "Maths",
                    sub: "maths",
                    books: [
                        { id: "spivak", t: "Calculus", a: "Michael Spivak", th: "Analysis", st: "reading", after: [] },
                        {
                            id: "rudin",
                            t: "Principles",
                            a: "Walter Rudin",
                            th: "Analysis",
                            st: "todo",
                            after: [{ k: "spivak", s: "done" }],
                        },
                    ],
                },
            ],
            learn: { subjects: { maths: { fields: { "Real & functional analysis": { lvl: 3 } }, goal: 4 } } },
        } as unknown as typeof __ulTest.meta.courses; // cast: the old shape, on purpose
        const kd = __ulTest.addItem({ medium: "tv", kind: "K-drama", title: "Crash Landing on You", status: "done" });
        __ulTest.items.get(kd)!.modeHome = "dramas";
        __ulTest.migratePaths();
        const ac = __ulTest.meta.modes.find(x => x.id === "academic"),
            s2 = __ulTest.modeById("screen");
        const C = __ulTest.meta.courses,
            pw = C.paths.find(p => p.sub === "s-maths"),
            pr = pw; // the old pathway and programme: one course now
        return {
            ac: [ac!.name, ac!.space, ac!.extra!.join(), (ac!.blocks || []).map(x => x.k).join()],
            courses: [
                C.v,
                C.subjects
                    .filter(s => s.id === "s-maths")
                    .map(s => s.id + ":" + s.name + ":" + s.fields["Real & functional analysis"].lvl + ":" + s.goal)
                    .join(),
                pw && pw.sub,
                pw && pw.books.map(b => b.st).join(),
                pw && __ulTest.pwBucket(pw, pw.books[1]),
                pr && pr.stages![0].name,
                pr &&
                    pr.modules![0].name +
                        "|" +
                        pr.modules![0].status +
                        "|" +
                        pr.modules![0].topics!.filter(t => t.done).length +
                        " topics",
            ].join(" / "),
            dramas: __ulTest.meta.modes.some(x => x.id === "dramas"),
            home: __ulTest.items.get(kd)!.modeHome || "",
            inScreen: __ulTest.modeItems(s2).some(x => x.id === kd),
            shelves: __ulTest.shelvesOf(s2).map(x => x.name),
            series: __ulTest
                .shelvesOf(s2)
                .find(x => x.name === "Series")!
                .test(__ulTest.items.get(kd)!),
        };
    });
    ok(
        "an old Academic becomes the Learning Centre, its own data carried over: levels, pathways (with progress and order), programmes",
        st12.ac.join("|") === "Learning Centre|learning-centre|learn,curricula|summary" &&
            st12.courses ===
                "2 / s-maths:Mathematics:3:4 / s-maths / reading,todo / waiting / Year 1 / Analysis I|taking|1 topics",
        JSON.stringify(st12)
    );
    ok(
        "an old Dramas mode goes; its dramas are in Film & TV under K-drama (shown because you have one)",
        !st12.dramas && !st12.home && st12.inScreen && st12.shelves.join() === "Films,Series,K-drama" && !st12.series,
        JSON.stringify(st12)
    );

    // ---- the old built-in content, as a personal file ----
    if (process.env.LC_CONTENT) {
        await p.setInputFiles("#file-import", process.env.LC_CONTENT);
        await p.waitForSelector('[data-act="import-merge"]');
        const offered = await ev(() => document.querySelector(".modal")!.textContent);
        ok("the content file is offered as a Learning Centre part", /Learning Centre/.test(offered));
        await ev(() => {
            const sel = __ulTest.ui.modal!.sel as Record<string, boolean>; /* cast: Import's ticks are a record */
            for (const k of Object.keys(sel)) sel[k] = k === "academic";
        });
        await p.click('[data-act="import-merge"]');
        await p.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 30000 });
        // several pathways in one course are one now: find a pathway by its old id, kept or folded in
        const st13 = await ev(() => {
            const C = __ulTest.ACS(),
                from = (id: string) => C.paths.find(p => p.id === id || (p.merged || []).some(x => x.id === id)),
                m = from("lc-maths"),
                t = from("lcp-aero");
            return {
                subs: C.subjects.length,
                maths: C.subjects.filter(s => s.id === "s-maths").length,
                one: C.paths.length === new Set(C.paths.map(p => p.sub)).size,
                paths: C.paths.reduce((a, p) => a + 1 + (p.merged || []).length, 0),
                phd:
                    m &&
                    [
                        m.sub,
                        m.books.length,
                        m.books.filter(b => __ulTest.pwBucket(m, b) === "ready").length > 0,
                        m.books.filter(b => __ulTest.pwBucket(m, b) === "waiting").length > 0,
                    ].join(),
                cur: Object.values(C.curricula!).reduce((a, c) => a + c.progs.length, 0),
                mathsTopics: (C.curricula!["s-maths"] || { topics: [] }).topics.length,
                aero: t && [t.stages!.length, t.modules!.length, t.modules![0].topics!.length > 0].join(),
            };
        });
        ok(
            "…and brings in every course, pathway, programme and curriculum (no duplicate courses, one pathway each)",
            st13.subs >= 12 &&
                st13.maths === 1 &&
                st13.one &&
                st13.paths >= 22 &&
                st13.cur >= 24 &&
                st13.mathsTopics > 20,
            JSON.stringify(st13)
        );
        ok(
            "…pathways keep what each book waits for; programmes keep their years and topics",
            /^s-maths,\d+,true,true$/.test(st13.phd!) && /^\d+,\d+,true$/.test(st13.aero!),
            JSON.stringify(st13)
        );
        await ev(() => {
            __ulTest.setMode("academic");
            __ulTest.ui.uniSub = "s-maths";
            __ulTest.goTab("curricula");
        });
        await p.waitForTimeout(300);
        ok(
            "…and Curricula shows the comparison table again (topics × programmes, books they set)",
            await ev(
                () =>
                    document.querySelectorAll(".unitable tbody tr:not(.uarea)").length > 20 &&
                    document.querySelectorAll(".unitable thead th").length > 6 &&
                    document.querySelectorAll(".ubk").length > 30
            )
        );
        if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + "/lc-curricula.png" });
        await ev(() => {
            __ulTest.ui.pwId = null;
            __ulTest.ui.learnSub = "s-maths";
            __ulTest.goTab("learn");
        });
        await p.waitForTimeout(200);
        ok(
            "…and each course is one page, with what was folded into it listed",
            await ev(() => !!document.querySelector(".lsubj h2") && !!document.querySelector(".lcmerged"))
        );
        if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + "/lc-content.png" });
    }

    // ---- one reading's dialog: where it's at, what it waits for, its parts, editing and removing it ----
    await ev(() => {
        __ulTest.setMode("academic");
        const S = { id: "sr", name: "Reading test", g: "R", fields: {}, order: [], goal: 0 };
        __ulTest.ACS().subjects.push(S);
        const P = __ulTest.lcNewPath({ name: "Reading test", sub: "sr" });
        P.books.push(
            { id: "ra", t: "Lanterns and Limits", a: "Ora Quill", st: "todo", after: [], mod: "" },
            { id: "rb", t: "Further Lanterns", a: "Lem Varga", st: "todo", after: [], mod: "" }
        );
        __ulTest.ui.learnSub = "sr";
        __ulTest.ui.pwId = P.id;
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    await p.click('.pwb[data-act="pw-book"][data-k="rb"]');
    await p.waitForSelector(".pwmodal");
    ok(
        "a reading opens in its own dialog, drawn by Svelte",
        await ev(
            () =>
                __ulTest.ui.modal!.kind === "pwbook" &&
                document.querySelector("#overlay .modal")!.hasAttribute("data-svelte") &&
                /Further Lanterns/.test(document.querySelector(".pwmodal h3")!.textContent)
        )
    );
    await p.selectOption("#pw-cond-k", "ra");
    await p.selectOption("#pw-cond-s", "done");
    await p.click('[data-act="pw-cond-add"]');
    await p.waitForTimeout(150);
    ok(
        '…"Add" makes it wait for another, and the dialog and the page say so',
        await ev(() => {
            const b = __ulTest.pwCur()!.books.find(x => x.id === "rb");
            return (
                b!.after!.length === 1 &&
                b!.after![0].k === "ra" &&
                b!.after![0].s === "done" &&
                /Quill is done/.test(document.querySelector(".pwconds")!.textContent) &&
                __ulTest.pwBucket(__ulTest.pwCur()!, b!) === "waiting"
            );
        })
    );
    await p.fill("[data-pwpartadd]", "Part I");
    await p.press("[data-pwpartadd]", "Enter");
    await p.waitForTimeout(120);
    await p.fill("[data-pwpartadd]", "Part II");
    await p.press("[data-pwpartadd]", "Enter");
    await p.waitForTimeout(120);
    ok(
        "…Enter adds a part (once), and the box empties",
        await ev(
            () =>
                __ulTest
                    .pwCur()!
                    .books.find(x => x.id === "rb")!
                    .parts!.map(x => x.t)
                    .join() === "Part I,Part II" &&
                document.querySelector<HTMLInputElement>("[data-pwpartadd]")!.value === ""
        )
    );
    await p.check('[data-pwpart="0"]');
    await p.waitForTimeout(120);
    ok(
        "…ticking a part keeps it",
        await ev(() => __ulTest.pwCur()!.books.find(x => x.id === "rb")!.parts![0].done === true)
    );
    await p.fill('[data-pwb="note"]', "Skip chapter 3.");
    await p.click(".pwmodal summary");
    await p.waitForTimeout(120);
    await p.fill('[data-pwb="t"]', "Further Lanterns, Revised");
    await p.press('[data-pwb="t"]', "Tab");
    await p.waitForTimeout(150);
    ok(
        "…Edit stays open while you change things (it closed after every change)",
        await ev(() => document.querySelector<HTMLDetailsElement>(".pwmodal details")!.open)
    );
    await p.check('[data-pwbc="opt"]', { timeout: 5000 });
    await p.waitForTimeout(150);
    ok(
        '…notes, the title and "Optional" are saved as they change, and the page shows them',
        await ev(() => {
            const b = __ulTest.pwCur()!.books.find(x => x.id === "rb");
            return (
                b!.note === "Skip chapter 3." &&
                b!.t === "Further Lanterns, Revised" &&
                b!.opt === true &&
                /Further Lanterns, Revised/.test(document.querySelector(".pwmodal h3")!.textContent) &&
                [...document.querySelectorAll(".pwb")].some(x => /Further Lanterns, Revised/.test(x.textContent))
            );
        })
    );
    await p.click('.pwconds [data-act="pw-book"]').catch(() => {});
    await p.click('[data-act="pw-rm"]');
    await p.waitForTimeout(100);
    ok(
        '…"Remove from path" asks first',
        await ev(() => !!document.querySelector('[data-act="pw-rm-yes"]') && __ulTest.ui.modal!.confirm === true)
    );
    await p.click('[data-act="pw-rm-no"]');
    await p.waitForTimeout(100);
    ok(
        '…"Keep" takes the question back',
        await ev(
            () => !document.querySelector('[data-act="pw-rm-yes"]') && __ulTest.pwCur()!.books.some(x => x.id === "rb")
        )
    );
    await p.click('[data-act="pw-rm"]');
    await p.click('[data-act="pw-rm-yes"]');
    await p.waitForTimeout(150);
    ok(
        "…and removing it takes it off the path and closes the dialog",
        await ev(() => !__ulTest.ui.modal && !__ulTest.pwCur()!.books.some(x => x.id === "rb"))
    );
    await p.click('.pwb[data-act="pw-book"][data-k="ra"]');
    await p.waitForSelector(".pwmodal");
    await p.click('[data-act="pw-st"][data-k="reading"]');
    await p.waitForTimeout(150);
    ok(
        "…marking one as reading shows at once",
        await ev(
            () =>
                __ulTest.pwState(__ulTest.pwCur()!.books.find(x => x.id === "ra")!) === "reading" &&
                document.querySelector('[data-act="pw-st"][data-k="reading"]')!.getAttribute("aria-pressed") === "true"
        )
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok("…and Escape closes it", await ev(() => !__ulTest.ui.modal));
    await ev(() => {
        __ulTest.ACS().subjects = __ulTest.ACS().subjects.filter(x => x.id !== "sr");
        __ulTest.ACS().paths = __ulTest.ACS().paths.filter(x => x.sub !== "sr");
        __ulTest.ui.learnSub = null;
        __ulTest.ui.pwId = null;
        __ulTest.render();
    });

    // ---- a score scale for one title ----
    const fm = await ev(() => __ulTest.addItem({ medium: "film", title: "Perfect Days", status: "done" }));
    await ev(i => __ulTest.openItem(i), fm);
    await p.waitForSelector("#it-scale");
    await p.selectOption("#it-scale", "5");
    await p.waitForTimeout(200);
    await p.click('.stars [data-act="rate"][data-k="9"]');
    await p.waitForTimeout(200);
    const st14 = await ev(
        i => ({
            r: __ulTest.items.get(i)!.rating,
            sc: __ulTest.items.get(i)!.scale,
            shown: document.querySelector(".bigscore")!.textContent,
            usual: __ulTest.meta.settings.ratingScale,
            other: __ulTest.fmtScore(9),
        }),
        fm
    );
    ok(
        "one film in stars: 4½★ is stored as 9/10, shown as stars, your usual scale untouched",
        st14.r === 9 && st14.sc === "5" && st14.shown === "★★★★½" && st14.usual === "10d" && st14.other === "9",
        JSON.stringify(st14)
    );
    ok(
        "…so it ranks next to a 9/10 from anything else",
        await ev(i => {
            const a = __ulTest.addItem({ medium: "film", title: "Other", status: "done", rating: 9 });
            return __ulTest.items.get(i)!.rating === __ulTest.items.get(a)!.rating;
        }, fm)
    );
    await ev(() => __ulTest.closeModal());

    // ---- search: anime and manga apart ----
    await ev(() => __ulTest.focusSearch());
    await p.fill("#gq", "Horimiya");
    await p.waitForTimeout(1500);
    const st15 = await ev(() => {
        const col = [...document.querySelectorAll(".gscol")].find(x =>
            /Culture/.test(x.querySelector(".gsg")!.textContent)
        );
        return col ? [...col.querySelectorAll(".gssub")].map(x => x.textContent) : null;
    });
    ok("Culture's results are split: Anime, then Manga", st15 && st15.join() === "Anime,Manga", JSON.stringify(st15));

    // ---- Courses: Academic and Interests, always shown apart ----
    await ev(() => {
        __ulTest.ui.pwId = null;
        __ulTest.ui.learnSub = null;
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    const st16 = await ev(() => ({
        heads: [...document.querySelectorAll(".learn .lkindh h3")].map(h => h.textContent),
        adds: document.querySelectorAll("[data-learnnew]").length,
    }));
    ok(
        "Courses shows Academic and Interests, each with its own add box",
        st16.heads.join() === "Academic,Interests" && st16.adds === 2,
        JSON.stringify(st16)
    );
    await p.fill('[data-learnnew="arts"]', "Music theory");
    await p.press('[data-learnnew="arts"]', "Enter");
    await p.waitForTimeout(200);
    ok(
        "…and one added under Interests is an interest",
        await ev(() => (__ulTest.ACS().subjects.find(s => s.name === "Music theory") || {}).kind === "arts")
    );

    // ---- the pages drawn by Svelte: what you type stays put, and boxes act on their own ----
    // What it once got wrong: a redraw from elsewhere (covers arriving, a sync) drew the whole course again, and a box
    // without an id (a course's summary, "+ topic", "+ reading") lost its focus and what you'd typed into it
    const aero = await ev(() => {
        const S = { id: "sv", name: "Gliding", g: "G", fields: {}, order: [], goal: 0 };
        __ulTest.ACS().subjects.push(S);
        const P = __ulTest.lcNewPath({ name: "Gliding", sub: "sv", about: "Flying without an engine." });
        P.modules = [
            {
                id: "gm1",
                stage: "",
                code: "GL1",
                name: "Wings",
                credits: "10",
                core: true,
                status: "taking",
                grade: "",
                term: "",
                topics: [{ t: "Lift", done: false }],
            },
        ];
        __ulTest.uniAddProgramme("sv", {
            uni: "North Hall",
            name: "Gliding BSc",
            modules: [{ name: "Wings", core: true, books: [["Lift and Drag", "Ora Quill"]] }],
        });
        return "sv";
    });
    await ev(s => {
        __ulTest.closeSearch();
        __ulTest.ui.pwId = null;
        __ulTest.ui.learnSub = s;
        __ulTest.ui.lcOpen = null;
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    }, aero);
    await p.waitForTimeout(200);
    await p.click('textarea[data-pw="about"]');
    await p.keyboard.press("End");
    await p.keyboard.type(" Half typed");
    await ev(() => __ulTest.renderMain());
    await p.waitForTimeout(100);
    const st17 = await ev(() => {
        const t = document.querySelector<HTMLTextAreaElement>('textarea[data-pw="about"]');
        return { focus: document.activeElement === t, v: t && t.value };
    });
    ok(
        "a redraw while you type in a course keeps the box, its focus and what you typed",
        st17.focus && /Half typed$/.test(st17.v!),
        JSON.stringify(st17)
    );
    await p.keyboard.press("Tab");
    await p.waitForTimeout(100);
    ok("…and it's saved when you leave it", await ev(() => /Half typed$/.test(__ulTest.pwCur()!.about!)));
    const mid = await ev(() => __ulTest.pwCur()!.modules![0].id);
    await ev(i => {
        __ulTest.ui.lcOpen = i;
        __ulTest.renderMain();
    }, mid);
    await p.waitForTimeout(150);
    await p.click(`[data-lctopicadd="${mid}"]`);
    await p.keyboard.type("Wing theory");
    await ev(() => {
        __ulTest.markDirty();
        __ulTest.renderMain();
    });
    await p.waitForTimeout(100);
    const st18 = await ev(
        i => ({
            v: document.querySelector<HTMLInputElement>(`[data-lctopicadd="${i}"]`)!.value,
            focus: document.activeElement === document.querySelector(`[data-lctopicadd="${i}"]`),
        }),
        mid
    );
    ok('…the same in an open module\'s "+ topic" box', st18.v === "Wing theory" && st18.focus, JSON.stringify(st18));
    await p.keyboard.press("Enter");
    await p.waitForTimeout(120);
    const st19 = await ev(
        i => ({
            t: __ulTest.lcMod(__ulTest.pwCur()!, i)!.topics!.map(x => x.t),
            v: document.querySelector<HTMLInputElement>(`[data-lctopicadd="${i}"]`)!.value,
            focus: document.activeElement === document.querySelector(`[data-lctopicadd="${i}"]`),
        }),
        mid
    );
    ok(
        "Enter adds the topic, empties the box and keeps you in it",
        st19.t.includes("Wing theory") && st19.v === "" && st19.focus,
        JSON.stringify(st19)
    );
    await p.fill("[data-learnfield]", "Propulsion");
    await p.press("[data-learnfield]", "Enter");
    await p.waitForTimeout(120);
    ok(
        "…and the same for a field",
        await ev(() => {
            const b = document.querySelector<HTMLInputElement>("[data-learnfield]");
            return (
                !!__ulTest.lcSub(__ulTest.ui.learnSub)!.fields.Propulsion &&
                b!.value === "" &&
                document.activeElement === b
            );
        })
    );
    await p.fill("#pw-goal-t", "Pass the mock");
    await p.press("#pw-goal-t", "Enter");
    await p.waitForTimeout(120);
    ok(
        "a milestone is added with Enter, and its box empties",
        await ev(
            () =>
                (__ulTest.pwCur()!.goals || []).some(g => g.t === "Pass the mock") &&
                document.querySelector<HTMLInputElement>("#pw-goal-t")!.value === "" &&
                [...document.querySelectorAll(".pwgoal span")].some(x => x.textContent === "Pass the mock")
        )
    );
    await p.click('[data-act="pw-goal-add"]');
    await p.waitForTimeout(100);
    ok(
        '…and "Add" with nothing written adds nothing, and says why',
        await ev(
            () =>
                __ulTest.pwCur()!.goals!.length === 1 &&
                /Write the milestone/.test(document.querySelector(".toast")?.textContent ?? "")
        )
    );
    await p.check('.pwgoal:has-text("Pass the mock") input');
    await p.waitForTimeout(100);
    ok(
        "…ticked off, it's done and sorts last",
        await ev(
            () =>
                __ulTest.pwCur()!.goals!.find(g => g.t === "Pass the mock")!.done === true &&
                /Pass the mock/.test([...document.querySelectorAll(".pwgoal")].pop()!.textContent)
        )
    );
    await p.fill(`[data-lcm="${mid}"][data-f="name"]`, "");
    await p.press(`[data-lcm="${mid}"][data-f="name"]`, "Tab");
    await p.waitForTimeout(100);
    ok("an emptied module name keeps the one it had", await ev(i => !!__ulTest.lcMod(__ulTest.pwCur()!, i)!.name, mid));
    await p.selectOption("[data-learngoal]", "4");
    await p.waitForTimeout(100);
    ok(
        "the level you aim for is saved, and the page says so",
        await ev(
            () =>
                __ulTest.lcSub(__ulTest.ui.learnSub)!.goal === 4 &&
                /aiming for phd/.test(document.querySelector(".lsubj .hint")!.textContent)
        )
    );
    await ev(() => {
        const Q = __ulTest.lcNewPath({ name: "Physics", sub: "" });
        Q.modules = [
            {
                id: "ph1",
                stage: "",
                code: "",
                name: "Mechanics",
                core: true,
                status: "planned",
                topics: [
                    { t: "Wing theory", done: false },
                    { t: "Waves", done: false },
                ],
            },
        ];
        __ulTest.renderMain();
    });
    await p.waitForTimeout(150);
    const phys = await ev(() => __ulTest.PWS().find(x => x.name === "Physics")!.id);
    await p.selectOption("#lc-cmp", phys);
    await p.waitForTimeout(150);
    ok(
        "comparing with another programme shows which of its topics are here",
        await ev(
            () =>
                __ulTest.ui.lcCmp &&
                /1 of 2 topics in Physics/.test(document.querySelector("#lc-cmp")!.closest(".panel")!.textContent)
        )
    );
    await ev(() => {
        __ulTest.ui.lcCmp = null;
        __ulTest.ui.lcOpen = null;
    });
    // What it once got wrong: any change in any box anywhere (the library's search, Settings) gave the course
    // Curricula would show an empty comparison, saved into your library and its exports
    const st20 = await ev(() => {
        __ulTest.ACS().subjects.unshift({ id: "cz", name: "Untouched", fields: {}, order: [], goal: 0 });
        __ulTest.ui.uniSub = "cz";
        __ulTest.setMode("universal");
        __ulTest.goTab("library");
        const box = document.createElement("input");
        document.body.append(box);
        box.value = "x";
        box.dispatchEvent(new Event("change", { bubbles: true }));
        box.remove();
        return { had: "cz" in (__ulTest.ACS().curricula || {}) };
    });
    ok("a change in a box elsewhere doesn't add an empty comparison to a course", !st20.had, JSON.stringify(st20));
    await ev(() => {
        __ulTest.ACS().subjects = __ulTest.ACS().subjects.filter(s => s.id !== "cz");
        delete __ulTest.ACS().curricula!.cz;
        __ulTest.ui.uniSub = undefined;
        __ulTest.setMode("academic");
    });
    // Curricula: a book of your own for a topic, and the paste box
    await ev(s => {
        __ulTest.ui.uniSub = s;
        __ulTest.ui.uniView = "merged";
        __ulTest.goTab("curricula");
    }, aero);
    await p.waitForTimeout(150);
    const tid = await ev(() => __ulTest.curS(__ulTest.curSid()!).topics[0].id);
    await p.fill(`[data-uniadd="${tid}"]`, "My Own Wings — Ada Brennick");
    await p.press(`[data-uniadd="${tid}"]`, "Tab");
    await p.waitForTimeout(150);
    ok(
        '"+ book" adds your own and picks it; the box empties',
        await ev(t => {
            const S = __ulTest.curS(__ulTest.curSid()!);
            return (
                /^u/.test(S.chosen[t]) &&
                document.querySelector<HTMLInputElement>(`[data-uniadd="${t}"]`)!.value === "" &&
                document.querySelector(".ubk.on")!.textContent.includes("My Own Wings")
            );
        }, tid)
    );
    await p.click('[data-act="uni-paste"]');
    await p.fill("#up-uni", "Lone");
    await p.click('[data-act="uni-save"]');
    await p.waitForTimeout(100);
    ok(
        "a pasted programme needs its modules",
        await ev(
            () =>
                !__ulTest.curS(__ulTest.curSid()!).progs.some(x => x.uni === "Lone") &&
                !!document.querySelector("#up-uni")
        )
    );
    await p.click('[data-act="uni-paste"]');
    await p.waitForTimeout(100);
    await p.click('[data-act="uni-paste"]');
    await p.waitForTimeout(100);
    ok(
        "…and opened again, the paste box starts empty",
        await ev(() => document.querySelector<HTMLInputElement>("#up-uni")!.value === "")
    );
    await p.click('[data-act="uni-paste"]');

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})();
