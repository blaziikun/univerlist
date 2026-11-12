// Accessibility: axe-core checks every page and the main dialogs against WCAG 2.1 A and AA, and closing a dialog
// puts focus back on the button that opened it. The privacy page says this runs on every change, so it must.
import ENV from "./env.ts";
import path from "node:path";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { createRequire } from "node:module";
import { zipSync, strToU8 } from "fflate";
import zlib from "node:zlib";
import { ok, evaluator } from "./helpers.ts";
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
(async () => {
    // axe is added as a script, which the app's own CSP would rightly block
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ bypassCSP: true });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    // skip: rules left out for one sweep, each with its reason where it's called
    // leave: elements left out of the sweep (their look is known and kept), each with its reason where it's called
    // everything settled: no animation or transition still running (a new mode fades its theme in, a new tab slides in;
    // measured halfway, colours fail contrast on a slow machine), asked until none is left (one can start another), then
    // two frames. Endless ones (backdrops) are left out: they never settle, and don't change what's measured
    const settle = () =>
        ev(async () => {
            const running = () =>
                document
                    .getAnimations()
                    .filter(
                        a =>
                            (a.playState === "running" || a.pending) &&
                            a.effect &&
                            a.effect.getTiming().iterations !== Infinity
                    );
            for (let i = 0; i < 20 && running().length; i++)
                await Promise.all(running().map(a => a.finished.catch(() => {})));
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            return running().length;
        });
    const sweep = async (name: string, within: string | null = null, skip: string[] = [], leave: string[] = []) => {
        const still = await settle();
        if (still) ok(`${name}: everything settled before it's measured`, false, still + " animations still running");
        if (!(await ev(() => !!window.axe))) await p.addScriptTag({ path: AXE });
        const v = await ev(
            async ([tags, within, skip, leave]) => {
                const root: Element | Document = within ? document.querySelector(within) || document : document;
                const r = await axe.run(leave.length ? { include: [root], exclude: leave.map(x => [x]) } : root, {
                    runOnly: { type: "tag", values: tags },
                    rules: Object.fromEntries(skip.map(id => [id, { enabled: false }])),
                    resultTypes: ["violations"],
                });
                return r.violations.map(x => `${x.id} ×${x.nodes.length} (${x.nodes[0].target.join(" ")})`);
            },
            [TAGS, within, skip, leave]
        );
        ok(`${name}: no accessibility problems`, !v.length, v.join(" · "));
    };

    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await sweep("the welcome screen");
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await p.waitForTimeout(300);
    await ev(() => {
        __ulTest.addItem({ medium: "anime", title: "Frieren", status: "done", rating: 9 });
        __ulTest.addItem({ medium: "book", title: "Dune", status: "active" });
        __ulTest.addItem({ medium: "film", title: "Perfect Days", status: "want" });
    });

    for (const tab of ["overview", "library", "favourites", "stats", "lists", "discover", "rank"]) {
        await ev(t => {
            __ulTest.closeModal && __ulTest.ui.modal && __ulTest.closeModal();
            __ulTest.goTab(t);
        }, tab);
        await p.waitForTimeout(250);
        await sweep(`the ${tab} tab`);
    }
    for (const page of ["watch", "read"]) {
        await ev(pg => {
            __ulTest.ui.page = pg;
            __ulTest.render();
        }, page);
        await p.waitForTimeout(300);
        await sweep(`the ${page} page`);
    }
    // Watch & read: your servers, a show's page, the player (each layout, its panels, arranging it, YouTube), a book's
    // page and the reader in each mode
    await ev(() => {
        __ulTest.meta.settings.libs = [
            { id: "l1", type: "jellyfin", name: "Home", url: "http://192.168.1.30:8096", on: true },
        ];
        __ulTest.meta.settings.servers = [{ name: "NAS", pattern: "http://nas.local/{title}.mp4", on: true }];
        __ulTest.ui.page = "watch";
        __ulTest.ui.watchServers = true;
        __ulTest.render();
    });
    // known, and kept as they look: the small "advanced" tag, a season's watched count, an episode's line under the one
    // playing, a server that didn't play (dimmed on purpose), and the ticks in Customise this page (a row of small boxes)
    const LOOKS = [".advtag", ".wseasons .cn", ".cs-ep2 small", ".srcrow.bad", ".wpopts input[data-wp]"];
    await p.waitForTimeout(200);
    await sweep("Watch › your media servers", null, [], LOOKS);
    await ev(() => {
        __ulTest.ui.watchServers = false;
        __ulTest.W.show = { medium: "tv", title: "Sweep Show", year: 2020, about: "About it.", ext: {} };
        __ulTest.W.seasons = [
            { n: 1, label: "Season 1", eps: [1, 2, 3].map(e => ({ e, title: "Ep " + e, about: "Things." })) },
            { n: 2, label: "Season 2", eps: [{ e: 1, title: "Ep 1" }] },
        ];
        __ulTest.W.si = 0;
        __ulTest.W.view = "show";
        __ulTest.W.libNote = "Not found on your servers.";
        __ulTest.W.libMiss = true;
        __ulTest.render();
    });
    await p.waitForTimeout(200);
    await sweep("Watch › a show's page", null, [], LOOKS);
    const player = async (name: string, code: () => void) => {
        await ev(code);
        await p.waitForTimeout(300);
        await sweep("the player › " + name, "#cinema", [], LOOKS);
    };
    await player("nothing to play yet", () => {
        __ulTest.meta.settings.player = { ...__ulTest.PS(), hideUI: false };
        __ulTest.watchStart(0, 1, { empty: true });
    });
    await player("playing, docked", () => {
        __ulTest.W.player!.srcs = [
            { name: "Home", how: "original", url: "http://127.0.0.1:9/a.webm" },
            { name: "Other", url: "http://127.0.0.1:9/b.webm" },
        ];
        __ulTest.W.player!.k = 0;
        __ulTest.renderPlayer();
    });
    await player("its settings", () => {
        __ulTest.W.player!.opts = true;
        __ulTest.playerRedraw();
    });
    await player("its servers", () => {
        __ulTest.W.player!.opts = false;
        __ulTest.W.player!.srcOpen = true;
        __ulTest.playerRedraw();
    });
    await player("Customise this page", () => {
        __ulTest.W.player!.srcOpen = false;
        __ulTest.ui.wpOpts = true;
        __ulTest.meta.settings.watchPage = { eps: "detailed" };
        __ulTest.playerRedraw();
    });
    await player("arranging it", () => {
        __ulTest.ui.wpOpts = false;
        __ulTest.ui.wpEdit = true;
        __ulTest.playerRedraw();
    });
    await player("cinema mode", () => {
        __ulTest.ui.wpEdit = false;
        __ulTest.meta.settings.player = { ...__ulTest.PS(), layout: "cinema" };
        __ulTest.renderPlayer();
    });
    await player("YouTube", () => {
        __ulTest.W.player!.srcs = [{ name: "YouTube", url: "https://www.youtube.com/watch?v=abcdefghijk" }];
        __ulTest.W.player!.k = 0;
        __ulTest.meta.settings.player = { ...__ulTest.PS(), layout: "docked" };
        __ulTest.renderPlayer();
    });
    await ev(() => {
        __ulTest.W.player = null;
        __ulTest.renderPlayer();
        __ulTest.W.show = null;
        __ulTest.W.view = "home";
        __ulTest.meta.settings.rlibs = [
            { id: "r1", type: "komga", name: "Komga", url: "http://192.168.1.40:25600", on: true },
        ];
        __ulTest.ui.page = "read";
        __ulTest.ui.readServers = true;
        __ulTest.render();
    });
    await p.waitForTimeout(200);
    await sweep("Read › your reading servers");
    await ev(() => {
        __ulTest.ui.readServers = false;
        const id = __ulTest.addItem({ medium: "manga", title: "Sweep Manga", status: "active", total: 9 });
        __ulTest.readFromItem(id);
        __ulTest.RD.files = [
            { name: "Sweep Ch. 1.cbz", ch: 1 },
            { name: "Sweep Ch. 2.cbz", ch: 2 },
        ];
        __ulTest.renderMain();
        return id;
    });
    await p.waitForTimeout(300);
    await sweep("Read › a book's page");
    const png = (w: number, h: number) => {
        const tb: number[] = [];
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            tb[n] = c >>> 0;
        }
        const crc = (b: Buffer) => {
            let x = 0xffffffff;
            for (const v of b) x = tb[(x ^ v) & 255] ^ (x >>> 8);
            return (x ^ 0xffffffff) >>> 0;
        };
        const chunk = (t: string, d: Buffer) => {
            const l = Buffer.alloc(4);
            l.writeUInt32BE(d.length);
            const td = Buffer.concat([Buffer.from(t), d]),
                c = Buffer.alloc(4);
            c.writeUInt32BE(crc(td));
            return Buffer.concat([l, td, c]);
        };
        const raw = Buffer.alloc((w * 3 + 1) * h, 120);
        for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
        const ih = Buffer.alloc(13);
        ih.writeUInt32BE(w, 0);
        ih.writeUInt32BE(h, 4);
        ih[8] = 8;
        ih[9] = 2;
        return Buffer.concat([
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
            chunk("IHDR", ih),
            chunk("IDAT", zlib.deflateSync(raw)),
            chunk("IEND", Buffer.alloc(0)),
        ]);
    };
    const cbz = Buffer.from(
        zipSync({
            "p1.png": new Uint8Array(png(30, 45)),
            "p2.png": new Uint8Array(png(30, 45)),
            "p3.png": new Uint8Array(png(30, 45)),
        })
    ).toString("base64");
    const epub = Buffer.from(
        zipSync({
            mimetype: strToU8("application/epub+zip"),
            "META-INF/container.xml": strToU8(
                '<?xml version="1.0"?><container><rootfiles><rootfile full-path="c.opf"/></rootfiles></container>'
            ),
            "c.opf": strToU8(
                '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>'
            ),
            "a.xhtml": strToU8('<html lang="en"><head><title>A</title></head><body><p>One.</p></body></html>'),
        })
    ).toString("base64");
    const reader = async (name: string, file: string, b64: string, opts: { mode?: string } = {}) => {
        await ev(
            async ([file, b64, opts]) => {
                __ulTest.RD.files = [
                    { file: new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], file), ch: 1 },
                ];
                __ulTest.meta.settings.reader = { manga: opts || {} };
                await __ulTest.readStart(0);
                __ulTest.RD.opts = true;
                __ulTest.renderReader();
            },
            [file, b64, opts]
        );
        await p.waitForTimeout(400);
        await sweep("the reader › " + name, "#reader");
    };
    await reader("page by page, its settings", "Sweep Ch. 1.cbz", cbz);
    await reader("one long strip, its settings", "Sweep Ch. 1.cbz", cbz, { mode: "scroll" });
    await reader("a book, its settings", "Sweep.epub", epub);
    await ev(() => {
        __ulTest.readerDrop();
        __ulTest.renderReader();
        __ulTest.RD.item = null;
        __ulTest.ui.page = "watch";
        __ulTest.render();
    });
    await ev(() => {
        __ulTest.meta.settings.builtins = { ...(__ulTest.meta.settings.builtins || {}), backdrops: true };
    });
    const secs = await ev(() => __ulTest.setSecs().map(([k]) => k));
    for (const s of secs) {
        await ev(s => __ulTest.goSettings(s), s);
        await p.waitForTimeout(300);
        await sweep(`Settings › ${s}`);
    }
    // …and what Settings shows only sometimes: work going on, the library file to reconnect, LaunchBox's copy, a mode's grids open
    await ev(() => {
        Object.assign(__ulTest.auto, {
            running: true,
            paused: false,
            phase: "find",
            done: 4,
            total: 40,
            found: 2,
            waiting: false,
            offline: false,
        });
        Object.assign(__ulTest.alSync, { running: true, msg: "Reading your list…", done: 3, total: 12, error: "" });
        __ulTest.fileSync.state = "reconnect";
        __ulTest.fileSync.handle = { name: "library.json" } as FileSystemFileHandle; /* cast: only its name is shown */
        __ulTest.LB.idx = { at: "2026-01-05T00:00:00Z", n: 1200, games: {}, img: {} };
        __ulTest.LB.tried = true;
        __ulTest.goSettings("data");
        __ulTest.renderAutoStatus();
        __ulTest.renderAlStatus();
    });
    await p.waitForTimeout(300);
    await sweep("Settings › data, with work going on");
    await ev(() => {
        __ulTest.auto.running = false;
        __ulTest.alSync.running = false;
        __ulTest.fileSync.state = "off";
        __ulTest.fileSync.handle = null;
        __ulTest.LB.idx = null;
        __ulTest.renderAutoStatus();
        __ulTest.renderAlStatus();
        __ulTest.goSettings("modes");
        for (const d of document.querySelectorAll<HTMLDetailsElement>(".setsec details")) d.open = true;
    });
    await p.waitForTimeout(300);
    await sweep("Settings › modes, its grids open");
    await ev(() => {
        __ulTest.closeSettings();
        __ulTest.ui.page = "profile";
        __ulTest.render();
    });

    // every mode has its own theme, so contrast is checked in each of them
    const modes = await ev(() => __ulTest.meta.modes.map(m => m.id));
    for (const mode of modes) {
        await ev(m => {
            __ulTest.setMode(m);
            __ulTest.goTab("library");
        }, mode);
        await p.waitForTimeout(300);
        await sweep(`the library in the ${mode} mode`);
    }
    // the pages a mode has for what it's for
    for (const [mode, tab] of [
        ["animanga", "seasonal"],
        ["novels", "series"],
        ["novels", "quotes"],
        ["screen", "diary"],
        ["games", "playing"],
    ]) {
        await ev(
            ([m, t]) => {
                __ulTest.setMode(m);
                __ulTest.goTab(t);
            },
            [mode, tab]
        );
        await p.waitForTimeout(300);
        await sweep(`the ${tab} tab (${mode})`);
    }

    // the Learning Centre: Courses, a course with a module open in each of its pathway's layouts, and Curricula
    await ev(() => {
        const S = {
            id: "ax",
            name: "Sweep course",
            g: "S",
            fields: { Analysis: { lvl: 2 } },
            order: ["Analysis"],
            goal: 3,
            kind: "sci",
            sources: [{ id: "q1", kind: "uni", name: "North Hall", url: "https://example.org/n", note: "Why" }],
            opps: [{ id: "o1", t: "A summer school", when: "2026-07-01", url: "", done: false }],
        };
        __ulTest
            .ACS()
            .subjects.push(S, { id: "ay", name: "Other course", fields: {}, order: [], goal: 0, kind: "arts" });
        const P = __ulTest.lcNewPath({
            name: "Sweep course",
            sub: "ax",
            uni: "North Hall",
            url: "https://example.org/p",
            about: "A summary.",
        });
        P.method = "One rule";
        P.goals = [{ id: "g1", t: "Mock exam", date: "2026-03-01", done: false }];
        P.stages = [{ id: "st1", name: "Year 1" }];
        P.modules = [
            {
                id: "m1",
                stage: "st1",
                code: "MA1",
                name: "Analysis I",
                credits: "15",
                core: true,
                status: "taking",
                grade: "70",
                term: "Autumn",
                topics: [
                    { t: "Limits", done: true },
                    { t: "Series", done: false },
                ],
            },
            {
                id: "m2",
                stage: "",
                code: "",
                name: "Groups",
                credits: "10",
                core: false,
                status: "planned",
                grade: "",
                term: "",
                topics: [{ t: "Limits", done: false }],
                after: ["m1"],
            },
        ];
        P.books.push(
            { id: "k1", t: "Lanterns", a: "Ora Quill", mod: "m1", st: "reading", after: [], top: true },
            { id: "k2", t: "More Lanterns", a: "Lem Varga", mod: "m1", st: "todo", after: [{ k: "k1", s: "done" }] },
            { id: "k3", t: "A Handbook", a: "", st: "todo", after: [], ref: true }
        );
        const Q = __ulTest.lcNewPath({ name: "Other course", sub: "ay" });
        Q.modules = [
            {
                id: "x1",
                stage: "",
                code: "",
                name: "Waves",
                core: true,
                status: "planned",
                topics: [{ t: "Limits", done: false }],
            },
        ];
        __ulTest.uniAddProgramme("ax", {
            uni: "North Hall",
            name: "BSc",
            modules: [
                { name: "Analysis I", core: true, books: [["Lanterns", "Ora Quill"]] },
                { name: "Groups", books: [["Group Things", "Ina Brook"]] },
            ],
        });
        __ulTest.uniAddProgramme("ax", {
            uni: "East Gate",
            name: "MMath",
            modules: [{ name: "Analysis", books: [["Lanterns", "Ora Quill"]] }],
        });
        __ulTest.setMode("academic");
    });
    const steps: [string, () => void][] = [
        [
            "Courses",
            () => {
                __ulTest.ui.learnSub = __ulTest.ui.pwId = null;
                __ulTest.goTab("learn");
            },
        ],
        [
            "a course (Modules, one open, compared)",
            () => {
                __ulTest.ui.learnSub = "ax";
                __ulTest.ui.lcOpen = "m1";
                __ulTest.ui.lcCmp = __ulTest.PWS().find(p => p.sub === "ay")!.id;
                __ulTest.goTab("learn");
            },
        ],
        [
            "a course (Map)",
            () => {
                __ulTest.PWS().find(p => p.sub === "ax")!.view = "map";
                __ulTest.renderMain();
            },
        ],
        [
            "a course (Stages)",
            () => {
                __ulTest.PWS().find(p => p.sub === "ax")!.view = "stages";
                __ulTest.renderMain();
            },
        ],
        [
            "a course (Threads)",
            () => {
                __ulTest.PWS().find(p => p.sub === "ax")!.view = "threads";
                __ulTest.renderMain();
            },
        ],
        [
            "Curricula (merged)",
            () => {
                __ulTest.ui.uniSub = "ax";
                __ulTest.goTab("curricula");
            },
        ],
        [
            "Curricula (side by side, pasting, topics)",
            () => {
                __ulTest.ui.uniView = "side";
                __ulTest.ui.uniPaste = true;
                __ulTest.ui.uniTopics = true;
                __ulTest.renderMain();
            },
        ],
    ];
    for (const [name, step] of steps) {
        await ev(step);
        await p.waitForTimeout(300);
        // known, and kept as they look: the faint "After …" and thread counts (--faint, stated on the privacy page) and the
        // small ↑↓ text buttons that move stages, modules and readings
        await sweep(`the Learning Centre: ${name}`, null, ["target-size"], [".pww", ".pwplq > .n"]);
    }
    await ev(() => {
        __ulTest.ui.uniView = "merged";
        __ulTest.ui.uniPaste = __ulTest.ui.uniTopics = false;
        __ulTest.ui.lcOpen = __ulTest.ui.lcCmp = null;
    });

    // Stats' deeper views, a tier list (its tiers, ranked, quick rank)
    await ev(() => __ulTest.setMode("universal"));
    for (const v of ["wrapped", "taste", "log", "dupes", "compare", "franchises", "people"]) {
        await ev(v => {
            __ulTest.ui.statsView = v;
            __ulTest.goTab("stats");
        }, v);
        await p.waitForTimeout(300);
        // known, and kept as it looks: Compare's genre table writes your mean small and faint in each coloured cell
        await sweep(`Stats › ${v}`, null, [], v === "compare" ? [".heatt .hc small"] : []);
    }
    // Connections: a franchise open, a list open and Up next; Rank with its Seasons panel open
    await ev(() => {
        const [a, b] = [...__ulTest.items.keys()];
        __ulTest.linkItems(a, b, "adaptation");
        __ulTest.ui.statsView = "franchises";
        __ulTest.ui.franchise = a;
        __ulTest.goTab("stats");
    });
    await p.waitForTimeout(300);
    await sweep("Stats › a franchise open");
    await ev(() => {
        __ulTest.ui.franchise = null;
        const id = __ulTest.createList({ name: "Sweep list", ids: [...__ulTest.items.keys()] });
        __ulTest.meta.queue = [...__ulTest.items.keys()].slice(0, 2);
        __ulTest.goList(id);
    });
    await p.waitForTimeout(300);
    await sweep("a list open");
    await ev(() => __ulTest.goList("queue"));
    await p.waitForTimeout(300);
    await sweep("Up next");
    await ev(() => {
        __ulTest.ui.seasonsOpen = true;
        __ulTest.goTab("rank");
    });
    await p.waitForTimeout(300);
    await sweep("Rank, with Seasons and sequels open");
    // the shell: the sidebar pinned open with every section and Customise, the mode menu, and the search box with results
    await ev(() => {
        __ulTest.meta.layout.side.pinned = true;
        __ulTest.meta.layout.side.hide = [];
        __ulTest.goTab("library");
        __ulTest.ui.pop = "sidecust";
        __ulTest.render();
    });
    await p.waitForTimeout(300);
    // known, and kept as they look: the mode's name at the top and "New list" are faint, and the three text sizes are
    // small "A"s
    await sweep(
        "the sidebar, with Customise open",
        "#side",
        [],
        [".side-head .sh-mode", ".side-head .stext", "#side .nb.ghost"]
    );
    await ev(() => {
        __ulTest.ui.pop = null;
        __ulTest.ui.modeMenu = true;
        __ulTest.render();
    });
    await p.waitForTimeout(200);
    await sweep("the profile header with the mode menu open", ".prof");
    await ev(() => {
        __ulTest.ui.modeMenu = false;
        __ulTest.meta.layout.side.pinned = false;
        __ulTest.render();
        __ulTest.focusSearch();
    });
    await p.keyboard.type("fri");
    await p.keyboard.press("ArrowDown");
    await p
        .waitForFunction(() => __ulTest.GS.webQ === "fri" && !Object.values(__ulTest.GS.busy).some(Boolean), null, {
            timeout: 15000,
        })
        .catch(() => {});
    // known, and kept as it is: each result is an option (with ＋ to add it inside, the mouse's shortcut) in columns, not
    // in one list; the keys move through them from the box, which keeps focus
    await sweep("the search box with results, one marked", "#gs", ["aria-required-parent", "nested-interactive"]);
    await ev(() => __ulTest.closeSearch());
    await ev(() => {
        __ulTest.ui.statsView = "charts";
        const id = __ulTest.newTierList({ name: "Sweep tiers", onlyDone: false });
        __ulTest.goTab("lists");
        __ulTest.ui.listId = id;
        __ulTest.render();
    });
    await p.waitForTimeout(300);
    await sweep("a tier list");
    await ev(() => {
        __ulTest.ui.tquick = true;
        __ulTest.render();
    });
    await p.waitForTimeout(200);
    // known, and kept as it looks: the key hints on quick rank's buttons
    await sweep("a tier list: quick rank", null, [], [".tqbtns kbd"]);
    await ev(() => {
        __ulTest.ui.tquick = null;
        const L = __ulTest.meta.lists.find(l => l.id === __ulTest.ui.listId);
        L!.layout = "rank";
        L!.rows = [{ label: "Ranked", color: "#8e9bb3", ids: [...__ulTest.items.keys()].slice(0, 2) }];
        __ulTest.render();
    });
    await p.waitForTimeout(200);
    await sweep("a ranked list");
    await ev(() => {
        __ulTest.ui.listId = null;
        __ulTest.render();
    });

    await ev(m => __ulTest.setMode(m), modes[0]);

    // dialogs
    const id = await ev(() => [...__ulTest.items.keys()][0]);
    const dialogs: [string, (id: string) => void, string[]?][] = [
        [
            "The item card",
            id => {
                __ulTest.openItem(id);
            },
        ],
        [
            "Add",
            () => {
                __ulTest.openAdd();
            },
        ],
        [
            "Discover",
            () => {
                __ulTest.openDiscover();
            },
        ],
        [
            "Download everything",
            () => {
                __ulTest.openModal("exportpick");
            },
        ],
        [
            "Bring things in",
            () => {
                __ulTest.openModal("io");
            },
        ],
        [
            "Paste a list",
            () => {
                __ulTest.openModal("paste");
            },
        ],
        [
            "Keyboard shortcuts",
            () => {
                __ulTest.openModal("keys");
            },
        ],
        [
            "Pick for me",
            () => {
                __ulTest.openModal("pick");
            },
        ],
        [
            "New list",
            () => {
                __ulTest.openModal("listnew");
            },
        ],
        [
            "New tier list",
            () => {
                __ulTest.openModal("tiernew");
            },
        ],
        [
            "Artwork",
            () => {
                __ulTest.openModal("covers");
            },
        ],
        [
            "Where are you",
            id => {
                __ulTest.openModal("setpage", { id });
            },
        ],
        [
            "AniList",
            () => {
                __ulTest.openModal("anilist");
            },
        ],
        [
            "Edit profile",
            () => {
                __ulTest.openModal("profile-edit", {});
            },
        ],
        [
            "Change passphrase",
            () => {
                __ulTest.openModal("vaultpass");
            },
        ],
        [
            "Unlock the private collection",
            () => {
                __ulTest.openModal("unlock", { err: "That passphrase didn't work." });
            },
        ],
        [
            "Save this view",
            () => {
                __ulTest.openModal("saveview");
            },
        ],
        [
            "Welcome",
            () => {
                __ulTest.openModal("welcome");
            },
        ],
        [
            "Discover: Books from forums",
            () => {
                __ulTest.openModal("discover", { mode: "books" });
            },
        ],
        [
            "From a university's page",
            () => {
                __ulTest.openModal("lcnew", {});
            },
        ],
        [
            "Adjust a picture",
            () => {
                const c = document.createElement("canvas");
                c.width = c.height = 40;
                __ulTest.openFrame(c.toDataURL(), { t: "avatar" });
            },
        ],
        [
            "A show's servers",
            () => {
                __ulTest.W.show = { title: "Sweep show", medium: "tv" };
                __ulTest.openModal("seriesservers", {});
            },
        ],
        [
            "A reading",
            () => {
                const P = __ulTest.lcNewPath({ name: "Sweep", sub: "" });
                P.books.push(
                    { id: "sw1", t: "Lanterns", a: "Ora Quill", st: "todo", after: [] },
                    {
                        id: "sw2",
                        t: "More Lanterns",
                        a: "Lem Varga",
                        st: "todo",
                        after: [{ k: "sw1", s: "done" }],
                        parts: [{ t: "Part I" }],
                    }
                );
                __ulTest.openModal("pwbook", { pid: P.id, bid: "sw2", edit: true });
            },
        ],
        [
            "Fetch from a link",
            () => {
                __ulTest.openModal("lcimport", { pid: __ulTest.PWS()[0].id, step: "link", want: "auto" });
            },
        ],
        // known, and kept as they look: an unticked row is faded on purpose, and the table's ↑↓ are small text buttons
        [
            "Fetch from a link: what was found",
            () => {
                __ulTest.openModal("lcimport", {
                    pid: __ulTest.PWS()[0].id,
                    step: "review",
                    found: "readings",
                    rows: [
                        { keep: true, section: "Week 1", t: "Lanterns", a: "Ora Quill", year: "1999", imp: "core" },
                        { keep: false, t: "More", a: "", year: "" },
                    ],
                });
            },
            ["color-contrast", "target-size"],
        ],
    ];
    for (const [name, open, skip] of dialogs) {
        await ev(() => {
            if (__ulTest.ui.modal) __ulTest.closeModal();
        });
        await ev(open, id);
        await p.waitForTimeout(350);
        await sweep(name + " dialog", null, skip);
    }
    await ev(() => __ulTest.ui.modal && __ulTest.closeModal());

    // "Skip to content" is the first thing Tab reaches, and takes you past the top bar and sidebar
    await p.focus(".skip");
    await p.waitForTimeout(250);
    const skip = await ev(() => ({
        first: document.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')!
            .className,
        seen: document.querySelector(".skip")!.getBoundingClientRect().top >= 0,
    }));
    await p.keyboard.press("Enter");
    await p.waitForTimeout(100);
    ok(
        '"Skip to content" comes first, shows when reached, and moves focus to the page',
        skip.first === "skip" &&
            skip.seen &&
            (await ev(() => document.activeElement && document.activeElement.id === "main")),
        JSON.stringify(skip)
    );

    // focus comes back to whatever opened the dialog
    await ev(() => __ulTest.goTab("library"));
    await p.waitForTimeout(250);
    const opener = '[data-act="open"][data-id]';
    await p.focus(opener);
    await p.keyboard.press("Enter");
    await p.waitForSelector(".modal");
    await p.waitForTimeout(200);
    const st = await ev(() => !!document.activeElement && !!document.activeElement.closest(".modal, #overlay"));
    ok("opening an item card moves focus into it", st);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(250);
    const st2 = await ev(sel => document.activeElement && document.activeElement.matches(sel), opener);
    ok(
        "closing it puts focus back on the card that opened it",
        st2,
        await ev(() => document.activeElement && document.activeElement.outerHTML.slice(0, 80))
    );

    // while a dialog is open, Tab only goes round the dialog: the page behind is inert, and stops being so when it closes
    await p.focus(opener);
    await p.keyboard.press("Enter");
    await p.waitForSelector(".modal");
    await p.waitForTimeout(200);
    const outside = [];
    for (let i = 0; i < 60; i++) {
        await p.keyboard.press("Tab");
        const w = await ev(() => {
            const a = document.activeElement;
            return !a || a === document.body || a.closest("#overlay") ? "" : a.outerHTML.slice(0, 60);
        });
        if (w) outside.push(w);
    }
    ok("Tab stays inside an open dialog", !outside.length, outside.slice(0, 2).join(" / "));
    ok(
        "…as the page behind it is inert",
        await ev(
            () =>
                document.querySelector<HTMLElement>("#app")!.inert &&
                !document.querySelector<HTMLElement>("#overlay")!.inert
        )
    );
    await ev(() => __ulTest.openModal("keys"));
    await p.waitForTimeout(150);
    await ev(() => __ulTest.closeModal());
    await p.waitForTimeout(150);
    ok(
        "…and nothing is left inert once the dialogs close (one opened from another included)",
        await ev(() => ![...document.body.children].some(e => e instanceof HTMLElement && e.inert)),
        await ev(() =>
            [...document.body.children]
                .filter(e => e instanceof HTMLElement && e.inert)
                .map(e => e.id || e.className)
                .join()
        )
    );
    await p.focus(opener);
    await p.keyboard.press("Tab");
    ok(
        "…so Tab reaches the page again",
        await ev(
            () =>
                !!document.activeElement &&
                !document.activeElement.closest("#overlay") &&
                document.activeElement !== document.body
        )
    );

    // the menus a button opens: a block's settings, the tab editor, an episode's link
    const menus: [string, () => void][] = [
        [
            "a block's settings",
            () => {
                __ulTest.goTab("overview");
                __ulTest.openMenu("block", "ov:0", 300, 200, { label: "Block settings" });
            },
        ],
        ["the tab editor", () => __ulTest.openMenu("tabedit", "", 300, 200, { label: "Tabs" })],
        ["an episode's link", () => __ulTest.openMenu("episode", "0:3", 300, 200, { label: "Episode 3" })],
    ];
    for (const [name, open] of menus) {
        await ev(open);
        await p.waitForTimeout(250);
        await sweep(name + " menu", "#ctx");
        await ev(() => __ulTest.closeCtx());
    }
    // on a phone
    await p.setViewportSize({ width: 390, height: 844 });
    const phone: [string, () => void][] = [
        ["the library on a phone", () => __ulTest.goTab("library")],
        ["the overview on a phone", () => __ulTest.goTab("overview")],
        ["Settings on a phone", () => __ulTest.goSettings("general")],
    ];
    for (const [name, go] of phone) {
        await ev(go);
        await p.waitForTimeout(300);
        await sweep(name);
    }
    const st3 = await ev(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok("nothing scrolls sideways at 390 px", st3, String(await ev(() => document.documentElement.scrollWidth)));
    await p.setViewportSize({ width: 1280, height: 800 });

    // the privacy and terms page
    await p.goto("file://" + path.join(ENV.ROOT, "public/privacy.html"));
    await p.waitForTimeout(300);
    await sweep("the privacy and terms page");

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
