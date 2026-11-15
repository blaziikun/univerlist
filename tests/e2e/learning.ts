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
    ok("it starts empty: no courses", st.courses.v === 3 && !st.courses.courses.length, JSON.stringify(st.courses));
    ok(
        "the Learning Centre is a mode right after Games, and an extension you can switch off",
        st.ac.space === "learning-centre" &&
            st.ac.name === "Learning Centre" &&
            st.main.indexOf("academic") === st.main.indexOf("games") + 1 &&
            st.spaces.join() === "academic",
        JSON.stringify(st)
    );
    ok(
        "its tabs: Library, Courses, Curricula",
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

    // ---- a course of your own (nothing in the catalogue for it), and your level in its fields ----
    await ev(() => {
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    await p.click('[data-act="lc-new"]');
    await p.waitForSelector("#lcn-q");
    await p.fill("#lcn-q", "Gliding");
    await p.waitForTimeout(100);
    ok(
        "nothing in the catalogue for it: an empty course of that name is offered",
        await ev(
            () =>
                !document.querySelector(".lchit") &&
                /Gliding/.test(document.querySelector('[data-act="lcn-empty"]')!.textContent)
        )
    );
    await p.click('[data-act="lcn-empty"]');
    await p.waitForTimeout(250);
    const st3 = await ev(() => ({
        subs: __ulTest.LCS().map(s => s.name),
        open: __ulTest.lcCurId(),
        modal: !!__ulTest.ui.modal,
    }));
    ok(
        "…made, and it's the current course",
        st3.subs.join() === "Gliding" && st3.open === (await ev(() => __ulTest.LCS()[0].id)) && !st3.modal,
        JSON.stringify(st3)
    );
    await p.click(".lcmore summary");
    await p.fill("[data-learnfield]", "Aerodynamics");
    await p.press("[data-learnfield]", "Enter");
    await p.waitForTimeout(150);
    await p.click('[data-act="learn-lvl"][data-l="2"]');
    await p.waitForTimeout(150);
    ok(
        "its fields, rated on the scale, are in its ⋯ (optional)",
        await ev(
            () =>
                __ulTest.LCS()[0].fields.Aerodynamics.lvl === 2 &&
                /Undergraduate/.test(document.querySelector(".lfield .ln")!.textContent)
        )
    );

    // ---- a degree: its years and modules, fetched from the programme's page ----
    ok("no degree until you say it's one", await ev(() => !document.querySelector(".lcdeg")));
    await p.check("#lc-degree");
    await p.waitForTimeout(150);
    await ev(() => {
        document.querySelector<HTMLDetailsElement>(".lcdeg")!.open = true;
    });
    await p.click('.lcdeg [data-act="lc-import"][data-w="modules"]');
    await p.waitForSelector("#lci-url");
    await p.fill("#lci-url", "https://www.example.ac.uk/aero/modules");
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
        const C = __ulTest.lcCur()!;
        return {
            degree: C.degree,
            stages: C.stages!.map(s => s.name),
            mods: C.modules!.map(m => m.name),
            y2: C.modules!.filter(m => C.stages!.find(s => s.id === m.stage)!.name === "Year 2").length,
            rows: document.querySelectorAll(".lcdeg .lcdtab tbody tr").length,
        };
    });
    ok(
        "saved as the degree's years and modules, with your edits, minus the one you unticked",
        st4.degree === true &&
            st4.stages.join() === "Year 1,Year 2" &&
            st4.mods.length === 6 &&
            st4.mods.includes("Spacecraft Propulsion (option)") &&
            !st4.mods.includes("Philosophy of Mind") &&
            st4.y2 === 3 &&
            st4.rows === 6,
        JSON.stringify(st4)
    );
    const fid = await ev(() => __ulTest.lcCur()!.modules!.find(m => m.code === "AERO50002")!.id);
    // its years are folded until opened
    await ev(() => {
        for (const d of document.querySelectorAll<HTMLDetailsElement>(".lcdeg .lcstg")) d.open = true;
    });
    await p.fill(`[data-lcm="${fid}"][data-f="grade"]`, "72");
    await p.press(`[data-lcm="${fid}"][data-f="grade"]`, "Tab");
    await p.selectOption(`select[data-lcm="${fid}"][data-f="status"]`, "done");
    await p.fill(`[data-lcm="${fid}"][data-f="name"]`, "Flight Mechanics & Control");
    await p.press(`[data-lcm="${fid}"][data-f="name"]`, "Tab");
    await p.waitForTimeout(150);
    ok(
        "its modules are edited in place, and the degree adds up credits and a credit-weighted mark",
        await ev(
            i =>
                __ulTest.lcMod(__ulTest.lcCur()!, i)!.name === "Flight Mechanics & Control" &&
                /10\/\d+ credits done.*credit-weighted mark 72\.0/.test(
                    document.querySelector(".lcdeg summary")!.textContent
                ),
            fid
        )
    );

    // ---- a reading list from Talis Aspire: a topic per section, at a level ----
    await ev(() => {
        document.querySelector<HTMLDetailsElement>(".lcbuilt")!.open = true;
    });
    await p.click('.lcbuilt [data-act="lc-import"]');
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
    const st5 = await ev(() => {
        const C = __ulTest.lcCur()!,
            name = (id?: string) => C.topics.find(t => t.id === id)?.name;
        return {
            books: C.books.map(b => [b.t.split(" ")[0], name(b.topic), b.lvl, __ulTest.pwBucket(C, b)].join(":")),
        };
    });
    ok(
        "saved into a topic per section, at undergraduate level, each waiting for the one before in its topic",
        st5.books.join() ===
            "Fundamentals:Essential reading:2:ready,Aerodynamics:Essential reading:2:waiting,Theory:Further reading:2:ready",
        JSON.stringify(st5)
    );
    await ev(() => {
        const C = __ulTest.lcCur()!;
        __ulTest.pwSetState(C, C.books[0], "reading");
        __ulTest.renderMain();
    });
    await p.waitForTimeout(150);
    ok(
        "starting the first one makes the next ready, and Next puts what you're reading first",
        await ev(() => {
            const C = __ulTest.lcCur()!,
                L = [...document.querySelectorAll(".lcni")];
            return (
                __ulTest.pwBucket(C, C.books[1]) === "ready" &&
                L[0].classList.contains("reading") &&
                /Fundamentals of Aerodynamics/.test(L[0].textContent) &&
                L.length === 3
            );
        })
    );

    // ---- an ordinary page with a Harvard-style list: into a topic of its own, at master's level ----
    await p.click('.lcbuilt [data-act="lc-import"]');
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
    await p.selectOption("#lci-into", "");
    await p.selectOption("#lci-lvl", "3");
    await p.click('[data-act="lci-save"]');
    await p.waitForTimeout(300);
    ok(
        "…on the map they're in their topic's row, under Master's",
        await ev(() => {
            const row = [...document.querySelectorAll(".lcrow")].find(
                r => r.querySelector(".lctop b")!.textContent === "Readings"
            );
            const cells = row ? [...row.querySelectorAll(".lccell")] : [];
            return (
                cells.length === 4 && cells[2].querySelectorAll(".lcb").length === 2 && !cells[1].querySelector(".lcb")
            );
        })
    );

    // ---- can't be fetched: says so, and pasting works instead ----
    await p.click('.lcbuilt [data-act="lc-import"]');
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
        "…and joins the degree as Year 3",
        await ev(
            () =>
                __ulTest
                    .lcCur()!
                    .stages!.map(s => s.name)
                    .join() === "Year 1,Year 2,Year 3"
        )
    );

    // ---- Curricula: a programme fetched from its page, and a module's reading list used ----
    await ev(() => __ulTest.goTab("curricula"));
    await p.waitForTimeout(200);
    ok(
        "Curricula is for the current course, with no subject chips",
        await ev(
            () =>
                /for Gliding/.test(document.querySelector(".curr h2")!.textContent) &&
                !document.querySelector(".curr .chips") &&
                /No programmes in Gliding/.test(document.querySelector(".curr")!.textContent)
        )
    );
    await ev(
        s => {
            __ulTest.uniAddProgramme(s, {
                uni: "Example University",
                name: "MEng",
                modules: [
                    {
                        name: "Aerodynamics 2",
                        core: true,
                        books: [
                            ["Fundamentals of Aerodynamics", "John D. Anderson"],
                            ["Low-Speed Aerodynamics", "Joseph Katz, Allen Plotkin"],
                        ],
                    },
                    { name: "Wing Theory", books: [] },
                ],
            });
            __ulTest.renderMain();
        },
        await ev(() => __ulTest.lcCurId()!)
    );
    await p.waitForTimeout(200);
    const st7 = await ev(() => ({
        mods: [...document.querySelectorAll(".cumod .cumh b")].map(b => b.textContent),
        list: [...document.querySelectorAll(".culist li")].map(li => [
            li.querySelector("b")!.textContent,
            li.classList.contains("in"),
        ]),
        rest: document.querySelector(".curest")?.textContent || "",
        topics: __ulTest.lcCur()!.progs[0].modules.map(m => (m.topics || []).length),
    }));
    ok(
        "a programme's module shows its reading list, each book marked when it's already in the course",
        st7.mods.join() === "Aerodynamics 2" &&
            JSON.stringify(st7.list) === '[["Fundamentals of Aerodynamics",true],["Low-Speed Aerodynamics",false]]' &&
            /Wing Theory/.test(st7.rest) &&
            st7.topics.every(n => n > 0),
        JSON.stringify(st7)
    );
    await p.click('[data-act="uni-use"]');
    await p.waitForTimeout(200);
    ok(
        '"Use this reading list" puts its books into the course, the one it had not doubled',
        await ev(() => {
            const C = __ulTest.lcCur()!;
            return (
                C.books.filter(b => /Fundamentals of Aerodynamics/.test(b.t)).length === 1 &&
                C.books.some(b => b.t === "Low-Speed Aerodynamics") &&
                !!document.querySelector('[data-act="uni-use"][disabled]')
            );
        })
    );
    await ev(() => __ulTest.goTab("learn"));
    await p.waitForTimeout(150);

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
            M = C.courses.find(c => c.id === "s-maths"),
            rudin = M && M.books.find(b => b.id === "rudin");
        return {
            ac: [ac!.name, ac!.space, ac!.extra!.join(), (ac!.blocks || []).map(x => x.k).join()],
            courses: [
                C.v,
                M && `${M.id}:${M.name}:${M.fields["Real & functional analysis"].lvl}:${M.goal}`,
                M && M.books.map(b => b.st).join(),
                M && rudin && __ulTest.pwBucket(M, rudin),
                M && M.topics.find(t => t.id === rudin?.topic)?.name,
                M && M.stages![0].name,
                M &&
                    M.modules![0].name +
                        "|" +
                        M.modules![0].status +
                        "|" +
                        M.modules![0].topics!.filter(t => t.done).length +
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
        "an old Academic becomes the Learning Centre, its own data carried over: levels, reading order and progress, programmes",
        st12.ac.join("|") === "Learning Centre|learning-centre|learn,curricula|summary" &&
            st12.courses ===
                "3 / s-maths:Mathematics:3:4 / reading,todo / waiting / Real analysis / Year 1 / Analysis I|taking|1 topics",
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
        // a course and its pathways are one now: every course once, with its books, programmes and degree
        const st13 = await ev(() => {
            const C = __ulTest.ACS(),
                m = C.courses.find(c => c.id === "s-maths");
            return {
                subs: C.courses.length,
                maths: C.courses.filter(s => s.id === "s-maths").length,
                books: m ? m.books.length : 0,
                ready: m ? m.books.some(b => __ulTest.pwBucket(m, b) === "ready") : false,
                waiting: m ? m.books.some(b => __ulTest.pwBucket(m, b) === "waiting") : false,
                progs: C.courses.reduce((a, c) => a + c.progs.length, 0),
                kept: m ? JSON.stringify(m.kept || {}).length : 0,
            };
        });
        ok(
            "…and brings in every course once, with its books (what each needs kept) and programmes",
            st13.subs >= 12 && st13.maths === 1 && st13.books > 20 && st13.ready && st13.waiting && st13.progs >= 24,
            JSON.stringify(st13)
        );
        await ev(() => {
            __ulTest.setMode("academic");
            __ulTest.ui.learnSub = "s-maths";
            __ulTest.goTab("curricula");
        });
        await p.waitForTimeout(300);
        ok(
            "…and Curricula shows its programmes' modules and reading lists",
            await ev(
                () =>
                    document.querySelectorAll(".cuprog").length > 2 &&
                    document.querySelectorAll(".culist li").length > 20
            )
        );
        if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + "/lc-curricula.png" });
        await ev(() => __ulTest.goTab("learn"));
        await p.waitForTimeout(200);
        ok(
            "…and each course is one page with its map",
            await ev(() => !!document.querySelector(".lchead h2") && !!document.querySelector(".lcmap"))
        );
        if (process.env.SHOTS) await p.screenshot({ path: ENV.OUT + "/lc-content.png" });
    }

    // ---- one book's dialog: where it's at, what it needs first, its parts, editing and removing it ----
    await ev(() => {
        __ulTest.setMode("academic");
        const C = __ulTest.lcNewCourse("Reading test", {
            topics: [{ id: "tl", name: "Lanterns", area: "Light" }],
        });
        C.books.push(
            { id: "ra", t: "Lanterns and Limits", a: "Ora Quill", st: "todo", after: [], topic: "tl", lvl: 2 },
            { id: "rb", t: "Further Lanterns", a: "Lem Varga", st: "todo", after: [], topic: "tl", lvl: 3 }
        );
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    await p.click('.lcb[data-act="pw-book"][data-k="rb"]');
    await p.waitForSelector(".pwmodal");
    ok(
        "a book on the map opens in its own dialog",
        await ev(
            () =>
                __ulTest.ui.modal!.kind === "pwbook" &&
                document.querySelector("#overlay .modal")!.hasAttribute("data-svelte") &&
                /Further Lanterns/.test(document.querySelector(".pwmodal h3")!.textContent) &&
                /Lanterns · Master's/.test(document.querySelector(".pwmodal .hint")!.textContent)
        )
    );
    await p.selectOption("#pw-cond-k", "ra");
    await p.selectOption("#pw-cond-s", "done");
    await p.click('[data-act="pw-cond-add"]');
    await p.waitForTimeout(150);
    ok(
        '…"Add" makes it need another first, and the dialog and the map say so',
        await ev(() => {
            const b = __ulTest.lcCur()!.books.find(x => x.id === "rb");
            return (
                b!.after!.length === 1 &&
                b!.after![0].k === "ra" &&
                b!.after![0].s === "done" &&
                /Quill is done/.test(document.querySelector(".pwconds")!.textContent) &&
                __ulTest.pwBucket(__ulTest.lcCur()!, b!) === "waiting" &&
                /Needs: Quill is done/.test(document.querySelector('.lcb[data-k="rb"]')!.getAttribute("title")!)
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
                    .lcCur()!
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
        await ev(() => __ulTest.lcCur()!.books.find(x => x.id === "rb")!.parts![0].done === true)
    );
    ok(
        "…and there are no notes to keep: it's not a study log",
        await ev(() => !document.querySelector('.pwmodal [data-pwb="note"]'))
    );
    await p.click(".pwmodal summary");
    await p.waitForTimeout(120);
    await p.fill('[data-pwb="t"]', "Further Lanterns, Revised");
    await p.press('[data-pwb="t"]', "Tab");
    await p.waitForTimeout(150);
    ok(
        "…Edit stays open while you change things",
        await ev(() => document.querySelector<HTMLDetailsElement>(".pwmodal details")!.open)
    );
    await p.check('[data-pwbc="opt"]', { timeout: 5000 });
    await p.selectOption('[data-pwblvl="1"]', "4");
    await p.waitForTimeout(150);
    ok(
        '…the title, its level and "Optional" are saved as they change, and the map shows them',
        await ev(() => {
            const b = __ulTest.lcCur()!.books.find(x => x.id === "rb");
            const row = document.querySelector(".lcrow")!,
                cells = [...row.querySelectorAll(".lccell")];
            return (
                b!.t === "Further Lanterns, Revised" &&
                b!.opt === true &&
                b!.lvl === 4 &&
                /Further Lanterns, Revised/.test(document.querySelector(".pwmodal h3")!.textContent) &&
                /Further Lanterns, Revised/.test(cells[3].textContent)
            );
        })
    );
    await p.click('[data-act="pw-rm"]');
    await p.waitForTimeout(100);
    ok(
        '…"Remove" asks first',
        await ev(() => !!document.querySelector('[data-act="pw-rm-yes"]') && __ulTest.ui.modal!.confirm === true)
    );
    await p.click('[data-act="pw-rm-no"]');
    await p.waitForTimeout(100);
    ok(
        '…"Keep" takes the question back',
        await ev(
            () => !document.querySelector('[data-act="pw-rm-yes"]') && __ulTest.lcCur()!.books.some(x => x.id === "rb")
        )
    );
    await p.click('[data-act="pw-rm"]');
    await p.click('[data-act="pw-rm-yes"]');
    await p.waitForTimeout(150);
    ok(
        "…and removing it takes it out of the course, notes that it went (so a sync doesn't bring it back), and closes",
        await ev(
            () => !__ulTest.ui.modal && !__ulTest.lcCur()!.books.some(x => x.id === "rb") && !!__ulTest.ACS().gone!.rb
        )
    );
    await p.click('.lcb[data-act="pw-book"][data-k="ra"]');
    await p.waitForSelector(".pwmodal");
    await p.click('[data-act="pw-st"][data-k="reading"]');
    await p.waitForTimeout(150);
    ok(
        "…marking one as reading shows at once, and it joins your library",
        await ev(() => {
            const b = __ulTest.lcCur()!.books.find(x => x.id === "ra")!;
            return (
                __ulTest.pwState(b) === "reading" &&
                !!b.lib &&
                __ulTest.items.get(b.lib)!.status === "active" &&
                document.querySelector('[data-act="pw-st"][data-k="reading"]')!.getAttribute("aria-pressed") === "true"
            );
        })
    );
    await p.keyboard.press("Escape");
    await p.waitForTimeout(100);
    ok("…and Escape closes it", await ev(() => !__ulTest.ui.modal));

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

    // ---- all courses: Academic and Interests apart ----
    await ev(() => {
        __ulTest.lcNewCourse("Music theory", { kind: "arts" });
        __ulTest.ui.lcHub = true;
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    const st16 = await ev(() => ({
        heads: [...document.querySelectorAll(".learn .lkindh h3")].map(h => h.textContent),
        cards: document.querySelectorAll(".lcov .lcpath").length,
        sw: document.querySelector<HTMLSelectElement>("#lc-switch")!.value,
    }));
    ok(
        "all courses shows Academic and Interests apart, and the switcher says so",
        st16.heads.join() === "Academic,Interests" && st16.cards === 3 && st16.sw === "",
        JSON.stringify(st16)
    );

    // ---- the pages drawn by Svelte: what you type stays put, and boxes act on their own ----
    // What it once got wrong: a redraw from elsewhere (covers arriving, a sync) drew the whole course again, and a box
    // lost its focus and what you'd typed into it
    await ev(() => {
        __ulTest.closeSearch();
        __ulTest.ui.lcHub = false;
        __ulTest.lcNewCourse("Gliding", {
            degree: true,
            modules: [
                { id: "gm1", stage: "", code: "GL1", name: "Wings", credits: "10", core: true, status: "taking" },
            ],
        });
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    await p.click('input.h2in[data-f="name"]');
    await p.keyboard.press("End");
    await p.keyboard.type(" and soaring");
    await ev(() => __ulTest.renderMain());
    await p.waitForTimeout(100);
    const st17 = await ev(() => {
        const t = document.querySelector<HTMLInputElement>('input.h2in[data-f="name"]');
        return { focus: document.activeElement === t, v: t && t.value };
    });
    ok(
        "a redraw while you type in a course keeps the box, its focus and what you typed",
        st17.focus && st17.v === "Gliding and soaring",
        JSON.stringify(st17)
    );
    await p.keyboard.press("Tab");
    await p.waitForTimeout(100);
    ok("…and it's saved when you leave it", await ev(() => __ulTest.lcCur()!.name === "Gliding and soaring"));
    await p.click(".lcmore summary");
    await p.fill("[data-learnfield]", "Propulsion");
    await p.press("[data-learnfield]", "Enter");
    await p.waitForTimeout(120);
    ok(
        "a field is added with Enter, and its box empties and keeps you in it",
        await ev(() => {
            const b = document.querySelector<HTMLInputElement>("[data-learnfield]");
            return !!__ulTest.lcCur()!.fields.Propulsion && b!.value === "" && document.activeElement === b;
        })
    );
    const mid = await ev(() => __ulTest.lcCur()!.modules![0].id);
    await ev(() => {
        document.querySelector<HTMLDetailsElement>(".lcdeg")!.open = true;
        for (const d of document.querySelectorAll<HTMLDetailsElement>(".lcdeg .lcstg")) d.open = true;
    });
    await p.fill(`[data-lcm="${mid}"][data-f="name"]`, "");
    await p.press(`[data-lcm="${mid}"][data-f="name"]`, "Tab");
    await p.waitForTimeout(100);
    ok("an emptied module name keeps the one it had", await ev(i => !!__ulTest.lcMod(__ulTest.lcCur()!, i)!.name, mid));
    await p.selectOption("#lc-now", "2");
    await p.selectOption("#lc-goal", "4");
    await p.waitForTimeout(100);
    ok(
        "your level now and the level you aim for are saved, one line under the name",
        await ev(() => {
            const C = __ulTest.lcCur()!;
            __ulTest.renderMain();
            return (
                C.now === 2 &&
                C.goal === 4 &&
                document.querySelector<HTMLSelectElement>("#lc-now")!.value === "2" &&
                document.querySelector<HTMLSelectElement>("#lc-goal")!.value === "4"
            );
        })
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})();
