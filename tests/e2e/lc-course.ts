// The Learning Centre as it's used: type what you want to learn ("propulsion", "maths") and a course is built at once
// from the catalogue, then filled from the programmes' own pages (stood in for here by saved copies of real ones); the
// course page (Next, the map, Built from, a degree only when it is one); the course switcher and the default course;
// Curricula's reading lists; a book found in Add going straight into a course; and the tabs each mode offers.
import fs from "node:fs";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
const CORS = { "access-control-allow-origin": "*" },
    FIX = (f: string) => fs.readFileSync(`${ENV.FIX}/lc/${f}`, "utf8");
// the programmes' pages: MIT's Course 18 chart, Imperial's Aeronautics modules, two MIT OpenCourseWare syllabi;
// Cambridge's course page fails, to show the rest still arrives
const PAGES: [RegExp, string][] = [
    [/catalog\.mit\.edu\/degree-charts\/mathematics-course-18/, "mit-course-18.html"],
    [/imperial\.ac\.uk\/aeronautics\/study\/ug\/current-students\/modules/, "imperial-aero-modules.html"],
    [/ocw\.mit\.edu\/courses\/16-50-/, "ocw-16-50-syllabus.html"],
    [/ocw\.mit\.edu\/courses\/8-04-/, "ocw-8-04-syllabus.html"],
];
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ viewport: { width: 1400, height: 900 } });
    await setup(c);
    const asked: string[] = [];
    await c.route(/^https:\/\/[^/]*(mit\.edu|cam\.ac\.uk|imperial\.ac\.uk|tudelft\.nl)\//, r => {
        const u = r.request().url(),
            hit = PAGES.find(([re]) => re.test(u));
        asked.push(u);
        if (/maths\.cam\.ac\.uk/.test(u)) return r.abort();
        return hit
            ? r.fulfill({ status: 200, contentType: "text/html", headers: CORS, body: FIX(hit[1]) })
            : r.fulfill({ status: 404, headers: CORS, body: "not here" });
    });
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await ev(() => {
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    ok(
        "no courses yet: the page says how to start",
        await ev(
            () =>
                /No courses yet/.test(document.querySelector(".learn")!.textContent) &&
                !!document.querySelector('[data-act="lc-new"]')
        )
    );

    // ---- "propulsion": a course for one topic, and what it builds on ----
    await p.click('[data-act="lc-new"]');
    await p.fill("#lcn-q", "propulsion");
    await p.waitForTimeout(150);
    const hits = await ev(() => [...document.querySelectorAll(".lchit b")].map(x => x.textContent));
    ok(
        "typing propulsion finds the topic inside aerospace engineering first",
        hits[0] === "Propulsion" && hits.includes("Rocket and space propulsion"),
        JSON.stringify(hits)
    );
    await p.click(".lchit");
    await p.waitForTimeout(300);
    const pr = await ev(() => {
        const C = __ulTest.lcCur()!;
        return {
            name: C.name,
            scope: C.scope,
            topics: C.topics.map(t => t.name).sort(),
            books: C.books.length,
            hp: C.books.find(b => b.t === "Mechanics and Thermodynamics of Propulsion"),
            cengel: C.books.find(b => b.t === "Thermodynamics: An Engineering Approach")?.id,
            progs: C.progs.map(p => p.uni),
            open: __ulTest.ui.tab === "learn" && !__ulTest.ui.modal,
        };
    });
    ok(
        "…built at once: the topic, what it builds on, its books by level with what each needs, its programmes",
        pr.name === "Propulsion" &&
            pr.scope === "aerospace/propulsion" &&
            pr.topics.join() === "Engineering mathematics,Fluid mechanics,Propulsion,Thermodynamics" &&
            !!pr.hp &&
            pr.hp.lvl === 2 &&
            (pr.hp.after || []).some(x => x.k === pr.cengel && x.s === "done") &&
            pr.progs.join() === "MIT,Imperial College London,TU Delft" &&
            pr.open,
        JSON.stringify(pr)
    );
    // the pages are fetched in the background: Imperial's modules page and an OpenCourseWare syllabus
    await p
        .waitForFunction(() => __ulTest.lcCur()!.progs.every(p => !!p.got), null, { timeout: 20000 })
        .catch(() => {});
    const pf = await ev(() => {
        const C = __ulTest.lcCur()!,
            imp = C.progs.find(p => p.uni === "Imperial College London")!;
        return {
            got: C.progs.map(p => (p.got ? (p.got.err ? "err" : "ok") : "-")).join(),
            imp: imp.modules.map(m => m.code).filter(Boolean),
            spacecraft: imp.modules.some(m => m.code === "AERO70037"),
            env: imp.modules.some(m => m.code === "AERO70042"),
            shown: document.querySelector(".lcbuilt summary")!.textContent,
        };
    });
    ok(
        "…then each programme's pages are fetched: new modules that teach its topics join, the rest are left out",
        pf.imp.includes("AERO70003") && !pf.env && /3 programmes/.test(pf.shown),
        JSON.stringify(pf)
    );

    // ---- the course page, top to bottom ----
    const page = await ev(() => ({
        order: [...document.querySelectorAll(".lccourse > *")].map(
            x => x.className.split(" ").find(c => /^lc(head|next|mapw|built|deg)$/.test(c)) || x.className
        ),
        degree: !!document.querySelector(".lcdeg"),
        gone: ["Milestones", "Crème", "Best places", "Opportunities", "How to work through it", "Mastery"].filter(w =>
            document.querySelector(".lccourse")!.textContent.includes(w)
        ),
        built: document.querySelector<HTMLDetailsElement>(".lcbuilt")!.open,
        next: [...document.querySelectorAll(".lcni .lcnb b")].map(b => b.textContent),
        cols: [...document.querySelectorAll(".lcmh span")].map(s => s.textContent),
        areas: [...document.querySelectorAll(".lcarea span")].map(s => s.textContent),
    }));
    ok(
        "the course page is its head, Next, the map and Built from (folded), nothing else, and no degree unless it's one",
        page.order.join() === "lchead,lcnext,lcmapw,lcbuilt" && !page.degree && !page.gone.length && !page.built,
        JSON.stringify(page)
    );
    ok(
        "Next starts at the bottom: foundations first, in the order they need each other",
        page.next.length >= 3 &&
            page.next.indexOf("Thermodynamics: An Engineering Approach") >= 0 &&
            !page.next.includes("Aircraft Engines and Gas Turbines"),
        JSON.stringify(page.next)
    );
    ok(
        "the map: topics down by area, levels across",
        page.cols.join() === "Topic,Foundations,Undergraduate,Master's,PhD" &&
            page.areas.includes("Propulsion") &&
            page.areas.includes("Foundations"),
        JSON.stringify(page)
    );
    const first = await ev(() => document.querySelector<HTMLElement>(".lcni .lcnb")!.dataset.k!);
    await p.click(`[data-act="lc-start"][data-k="${first}"]`);
    await p.waitForTimeout(200);
    const st = await ev(k => {
        const C = __ulTest.lcCur()!,
            b = C.books.find(x => x.id === k)!;
        return {
            st: __ulTest.pwState(b),
            lib: b.lib ? __ulTest.items.get(b.lib)?.status : "",
            row: document.querySelector(".lcni")!.classList.contains("reading"),
            card: document.querySelector(`.lcb[data-k="${k}"]`)!.classList.contains("reading"),
            library: [...__ulTest.items.values()].filter(x => x.medium === "book").length,
        };
    }, first);
    ok(
        "Start: it's underway, it joins your library (the only one that does), and the map colours it",
        st.st === "reading" && st.lib === "active" && st.row && st.card && st.library === 1,
        JSON.stringify(st)
    );
    await p.click(`[data-act="lc-done"][data-k="${first}"]`);
    await p.waitForTimeout(200);
    ok(
        "Done: it's read, and leaves Next",
        await ev(
            k =>
                __ulTest.pwState(__ulTest.lcCur()!.books.find(x => x.id === k)!) === "done" &&
                ![...document.querySelectorAll(".lcni .lcnb")].some(x => (x as HTMLElement).dataset.k === k) &&
                document.querySelector(`.lcb[data-k="${k}"]`)!.classList.contains("done"),
            first
        )
    );
    ok(
        "a card says on hover what it needs and what it unlocks",
        await ev(() => {
            const hp = __ulTest.lcCur()!.books.find(b => b.t === "Mechanics and Thermodynamics of Propulsion")!;
            const t = document.querySelector(`.lcb[data-k="${hp.id}"]`)!.getAttribute("title")!;
            return /Needs: Çengel is done/.test(t) && /Unlocks: .*Kerrebrock/.test(t);
        })
    );

    // ---- "maths": a second course; MIT's page brings more modules, Cambridge's can't be reached ----
    await p.click('[data-act="lc-new"]');
    await p.fill("#lcn-q", "math");
    await p.waitForTimeout(150);
    ok("math finds Mathematics", await ev(() => document.querySelector(".lchit b")!.textContent === "Mathematics"));
    await p.press("#lcn-q", "Enter");
    await p
        .waitForFunction(
            () =>
                __ulTest.lcCur()!.name === "Mathematics" &&
                __ulTest
                    .lcCur()!
                    .progs.every(p => !/^https/.test(p.url || "") || /\.pdf$/.test(p.url || "") || !!p.got),
            null,
            { timeout: 20000 }
        )
        .catch(() => {});
    const ma = await ev(() => {
        const C = __ulTest.lcCur()!,
            [cam, part3, mit] = C.progs;
        return {
            cam: [cam.got?.err ? "failed" : "?", cam.modules.length],
            part3: part3.got ? "fetched" : "skipped (a PDF)",
            mit: mit.modules.map(m => m.code),
            topics: mit.modules.find(m => m.code === "18.705")?.topics?.map(t => C.topics.find(x => x.id === t)?.name),
            asked: 0,
        };
    });
    ok(
        "…one programme failing keeps what it had and says so; the others arrive; a PDF isn't fetched",
        ma.cam[0] === "failed" &&
            ma.cam[1] === 24 &&
            ma.part3 === "skipped (a PDF)" &&
            ["18.112", "18.115", "18.125", "18.705"].every(x => ma.mit.includes(x)) &&
            (ma.topics || []).includes("Commutative algebra"),
        JSON.stringify(ma)
    );
    ok("…and it never asked for the PDF", !asked.some(u => /\.pdf/.test(u)), asked.join(" "));
    ok(
        "Built from shows each programme's fetch",
        await ev(() => {
            document.querySelector<HTMLDetailsElement>(".lcbuilt")!.open = true;
            const t = document.querySelector(".lcbuilt")!.textContent;
            return (
                /Couldn't fetch everything/.test(t) && /Fetched .* 4 new items/.test(t) && /From the catalogue/.test(t)
            );
        })
    );

    // ---- the switcher, and the default course ----
    const ids = await ev(() => __ulTest.LCS().map(c => [c.name, c.id]));
    const prop = ids.find(x => x[0] === "Propulsion")![1],
        maths = ids.find(x => x[0] === "Mathematics")![1];
    await p.click('[data-act="lc-default"]');
    await p.waitForTimeout(100);
    await p.selectOption("#lc-switch", prop);
    await p.waitForTimeout(200);
    const sw = await ev(() => ({
        cur: __ulTest.lcCurId(),
        def: __ulTest.ACS().def,
        name: document.querySelector<HTMLInputElement>(".h2in")!.value,
    }));
    ok(
        "the switcher changes the current course; Make default keeps the other as default",
        sw.cur === prop && sw.def === maths && sw.name === "Propulsion",
        JSON.stringify(sw)
    );
    await ev(() => __ulTest.goTab("curricula"));
    await p.waitForTimeout(200);
    ok(
        "Curricula follows the current course, with no subject chips",
        await ev(
            () =>
                /for Propulsion/.test(document.querySelector(".curr h2")!.textContent) &&
                !document.querySelector(".chips .chip[data-act]")
        )
    );
    await p.selectOption("#lc-switch", maths);
    await p.waitForTimeout(200);
    ok(
        "…and switching there switches everywhere",
        await ev(() => {
            const ok1 = /for Mathematics/.test(document.querySelector(".curr h2")!.textContent);
            __ulTest.goTab("learn");
            return ok1 && document.querySelector<HTMLInputElement>(".h2in")!.value === "Mathematics";
        })
    );
    await p.selectOption("#lc-switch", prop);
    await p.waitForTimeout(100);
    // a new tab (no place to come back to) opens the Learning Centre on the default course
    await ev(() => __ulTest.flushSave());
    const p2 = await c.newPage(),
        ev2 = evaluator(p2);
    await p2.goto(ENV.APP);
    await p2.waitForFunction(() => window.__ulTest?.booted, null, { timeout: 30000 });
    await ev2(() => {
        __ulTest.setMode("academic");
        __ulTest.goTab("learn");
    });
    await p2.waitForTimeout(300);
    ok(
        "the Learning Centre opens on the default course",
        await ev2(
            () =>
                document.querySelector<HTMLInputElement>(".h2in")!.value === "Mathematics" &&
                !!document.querySelector(".lcdef")
        )
    );
    await p2.close();

    // ---- Curricula: modules → topics → reading lists, and using one ----
    await p.selectOption("#lc-switch", maths);
    await ev(() => {
        const C = __ulTest.lcCur()!,
            k = C.books.find(b => b.t === "Galois Theory")!.id;
        __ulTest.ACS().courses.find(x => x.id === C.id)!.books = C.books.filter(b => b.id !== k);
        __ulTest.markDirty();
        __ulTest.goTab("curricula");
    });
    await p.waitForTimeout(250);
    const cu = await ev(() => {
        const mod = [...document.querySelectorAll(".cumod")].find(m =>
            /Galois Theory \(Part II\)/.test(m.textContent)
        )!;
        return {
            progs: document.querySelectorAll(".cuprog").length,
            topics: [...mod.querySelectorAll(".cutops .chip")].map(x => x.textContent),
            list: [...mod.querySelectorAll(".culist li")].map(li => [
                li.querySelector("b")!.textContent,
                li.classList.contains("in"),
            ]),
            btn: mod.querySelector<HTMLButtonElement>('[data-act="uni-use"]')!.disabled,
            mitRest: /18\.112 Functions of a Complex Variable/.test(
                document.querySelector(".cuprog:last-child")!.textContent
            ),
        };
    });
    ok(
        "each module shows the topics it teaches and its reading list, each book marked when it's in the course",
        cu.progs === 3 &&
            cu.topics.join() === "Galois theory" &&
            JSON.stringify(cu.list) === '[["Galois Theory",false],["Algebra",true]]' &&
            !cu.btn &&
            cu.mitRest,
        JSON.stringify(cu)
    );
    await p.click('.cumod:has-text("Galois Theory (Part II)") [data-act="uni-use"]');
    await p.waitForTimeout(200);
    ok(
        '"Use this reading list" brings the book back, in its topic and at its level',
        await ev(() => {
            const C = __ulTest.lcCur()!,
                g = C.books.find(b => b.t === "Galois Theory");
            return !!g && C.topics.find(t => t.id === g.topic)?.name === "Galois theory" && g.lvl === 2;
        })
    );

    // ---- Add: a book found in search, straight into a course ----
    await ev(() => __ulTest.openAdd());
    await p.waitForSelector("#a-q");
    await p.click('[data-act="add-medium"][data-k="book"]');
    await p.fill("#a-q", "Rocket Propulsion Elements");
    await p.click('[data-act="add-search"]');
    await p.waitForSelector('[data-act="add-tolc"]', { timeout: 10000 });
    await p.click('[data-act="add-tolc"]');
    await p.waitForSelector("#lcto-course");
    await p.selectOption("#lcto-course", prop);
    await p.waitForTimeout(100);
    const guess = await ev(() => ({
        topic: document.querySelector<HTMLSelectElement>("#lcto-topic")!.selectedOptions[0].textContent,
        lvl: document.querySelector<HTMLSelectElement>("#lcto-lvl")!.selectedOptions[0].textContent,
    }));
    ok(
        "Add to Learning Centre guesses its topic and level in the course you pick",
        /Propulsion/.test(guess.topic!) && guess.lvl === "Undergraduate",
        JSON.stringify(guess)
    );
    const before = await ev(() => __ulTest.items.size);
    await p.click('[data-act="lcto-add"]');
    await p.waitForTimeout(150);
    ok(
        "…and adds it to that course without a library entry",
        await ev(
            ([id, n]) =>
                __ulTest.lcSub(id)!.books.some(b => b.t === "Rocket Propulsion Elements" && b.lvl === 2) &&
                __ulTest.items.size === n &&
                !document.querySelector(".lcto"),
            [prop, before] as const
        )
    );
    await ev(() => __ulTest.closeModal());

    // ---- a degree only when it's one ----
    await ev(() => __ulTest.goTab("learn"));
    await p.click(".lcmore summary");
    await p.check("#lc-degree");
    await p.waitForTimeout(150);
    ok(
        'ticking "This is a degree I\'m taking" brings the Degree section, folded',
        await ev(
            () => !!document.querySelector(".lcdeg") && !document.querySelector<HTMLDetailsElement>(".lcdeg")!.open
        )
    );
    await ev(() => {
        const C = __ulTest.lcCur()!;
        C.stages = [
            { id: "y1", name: "Year 1" },
            { id: "y2", name: "Year 2" },
        ];
        C.modules = [
            {
                id: "mA",
                stage: "y1",
                code: "",
                name: "Mathematics 1",
                credits: 15,
                core: true,
                status: "done",
                grade: "",
            },
        ];
        __ulTest.markDirty();
    });
    await p.waitForTimeout(150);
    await ev(() => {
        document.querySelector<HTMLDetailsElement>(".lcdeg")!.open = true;
    });
    ok(
        "in it, a year with modules is folded and says how far along it is; a year with none is open",
        await ev(() => {
            const S = [...document.querySelectorAll<HTMLDetailsElement>(".lcdeg .lcstg")];
            return (
                S.length === 2 &&
                !S[0].open &&
                /1 module · 15\/15 credits done/.test(S[0].querySelector("summary")!.textContent) &&
                S[1].open
            );
        })
    );

    // ---- on a phone the map is a list by topic, each book with its level ----
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(200);
    const ph = await ev(() => ({
        head: getComputedStyle(document.querySelector(".lcmh")!).display,
        tag: getComputedStyle(document.querySelector(".lcb .lclv")!).display,
        wide: document.documentElement.scrollWidth <= innerWidth,
    }));
    ok(
        "on a phone the map is a list, each book tagged with its level, and nothing scrolls sideways",
        ph.head === "none" && ph.tag !== "none" && ph.wide,
        JSON.stringify(ph)
    );
    await p.setViewportSize({ width: 1400, height: 900 });

    // ---- the tabs each mode offers ----
    const tabs = await ev(() =>
        Object.fromEntries(
            ["academic", "animanga", "screen", "games"].map(id => {
                __ulTest.setMode(id);
                const on = __ulTest.tabsFor();
                return [id, on.join()];
            })
        )
    );
    ok(
        "the Learning Centre's tabs are only its own and the core ones",
        !/seasonal|releasing|diary|playing|series|quotes/.test(tabs.academic),
        JSON.stringify(tabs)
    );
    const offered = async (id: string) => {
        await ev(m => __ulTest.setMode(m), id);
        await p.click(".tabedit");
        await p.waitForSelector(".tedit");
        const L = await ev(() => [...document.querySelectorAll(".tedit label")].map(x => x.textContent!.trim()));
        await p.keyboard.press("Escape");
        await p.waitForTimeout(100);
        return L;
    };
    const lcTabs = await offered("academic"),
        culture = await offered("animanga"),
        screen = await offered("screen");
    ok(
        "the ⋯ menu offers only what fits: no This season or Releasing in the Learning Centre",
        !lcTabs.some(t => /This season|Releasing|Diary|Playing|Pathways/.test(t)) && lcTabs.includes("Curricula"),
        JSON.stringify(lcTabs)
    );
    ok(
        "…This season in Culture, Releasing (not This season) in Film & TV, and no Learning Centre tabs in either",
        culture.includes("This season") &&
            screen.includes("Releasing") &&
            !screen.includes("This season") &&
            ![...culture, ...screen].some(t => /Courses|Curricula/.test(t)),
        JSON.stringify({ culture, screen })
    );
    await p.click(".tabedit");
    await p.check('#ctx [data-tabon="releasing"]');
    await p.keyboard.press("Escape");
    await ev(() => __ulTest.goTab("releasing"));
    await p.waitForTimeout(200);
    ok(
        "Releasing is a tab of its own in Film & TV",
        await ev(
            () => __ulTest.ui.tab === "releasing" && /Next episodes/.test(document.querySelector("main")!.textContent)
        )
    );

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await b.close();
    process.exit(0);
})();
