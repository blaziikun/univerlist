import ENV from "./env.ts";
ENV.needExport();
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
const ZIP = ENV.EXPORT;
const H = { "access-control-allow-origin": "*", "content-type": "application/json" };
(async () => {
    const browser = await chromium.launch(ENV.launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(ctx);
    await ctx.route(/px\.test/, r => {
        const u = new URL(r.request().url()),
            p = u.pathname;
        if (p === "/status")
            return r.fulfill({
                status: 200,
                headers: H,
                body: JSON.stringify({ igdb: true, sgdb: true, tgdb: true, ss: true, cv: false, hc: true }),
            });
        if (p.startsWith("/sgdb/search"))
            return r.fulfill({
                status: 200,
                headers: H,
                body: JSON.stringify({ success: true, data: [{ id: 42, name: "Super Mario Galaxy" }] }),
            });
        if (p.startsWith("/sgdb/grids"))
            return r.fulfill({
                status: 200,
                headers: H,
                body: JSON.stringify({
                    success: true,
                    data: [
                        { url: "https://cdn2.steamgriddb.com/grid/a.png", style: "alternate" },
                        { url: "https://cdn2.steamgriddb.com/grid/b.png", style: "material" },
                    ],
                }),
            });
        if (p.startsWith("/tgdb/"))
            return r.fulfill({
                status: 200,
                headers: H,
                body: JSON.stringify({
                    data: { games: [{ id: 7, game_title: "Super Mario Galaxy", platform: 9 }] },
                    include: {
                        boxart: {
                            base_url: { large: "https://cdn.thegamesdb.net/images/large/" },
                            data: {
                                7: [
                                    { side: "front", filename: "boxart/front/7-1.jpg" },
                                    { side: "back", filename: "boxart/back/7-1.jpg" },
                                ],
                            },
                        },
                        platform: { data: { 9: { name: "Nintendo Wii" } } },
                    },
                }),
            });
        if (p.startsWith("/ss/"))
            return r.fulfill({
                status: 200,
                headers: H,
                body: JSON.stringify({
                    response: {
                        jeux: [
                            {
                                id: 1,
                                noms: [{ region: "ss", text: "Super Mario Galaxy" }],
                                systeme: { text: "Wii" },
                                medias: [
                                    { type: "box-2D-side", region: "eu", url: "https://px.test/ssimg?u=x" },
                                    { type: "box-2D", region: "eu", url: "https://px.test/ssimg?u=y" },
                                ],
                            },
                        ],
                    },
                }),
            });
        if (p.startsWith("/hc"))
            return r.fulfill({
                status: 200,
                headers: H,
                body: JSON.stringify({
                    data: {
                        search: {
                            results: {
                                hits: [
                                    {
                                        document: {
                                            id: 3,
                                            title: "Dune",
                                            image: { url: "https://assets.hardcover.app/dune.jpg" },
                                        },
                                    },
                                ],
                            },
                        },
                    },
                }),
            });
        return r.fulfill({ status: 404, headers: H, body: "{}" });
    });
    const page = await ctx.newPage(),
        errs: string[] = [];
    page.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(page);
    await page.goto(ENV.APP);
    await page.waitForTimeout(1000);
    await page.fill("#wl-name", "Sam");
    await page.click('[data-act="welcome-done"]');
    await page.setInputFiles("#file-import", ZIP);
    await page.waitForSelector('[data-act="import-replace"]');
    await page.click('[data-act="import-replace"]');
    await page.waitForTimeout(3000);
    await ev(() => {
        __ulTest.KEYS.igdb = "https://px.test/?pass=x";
    });
    const arts = await ev(async () => {
        const id = [...__ulTest.items.entries()].find(([, b]) => b.title === "Super Mario Galaxy")![0];
        return (await __ulTest.allArt({ id, ...__ulTest.items.get(id)! })).covers.map(c => c.label);
    });
    ok(
        "proxy covers in picker",
        arts.some(l => /SteamGridDB/.test(l)) &&
            arts.some(l => /Wii · front/.test(l)) &&
            arts.some(l => /spine/.test(l)),
        arts.join(" | ")
    );
    await ev(() => __ulTest.spinesUpdate());
    await page.waitForFunction(() => !__ulTest.SPN.running, null, { timeout: 120000 });
    ok(
        "spines found",
        await ev(() => [...__ulTest.items.values()].filter(b => b.spineArt).length > 0),
        await ev(() => __ulTest.SPN.got + "/" + __ulTest.SPN.total)
    );
    const hc = await ev(async () => {
        const b = { title: "Dune", creator: "Frank Herbert", medium: "book" };
        return (await __ulTest.hcCovers(b)).map(c => c.cover);
    });
    ok("hardcover", hc.includes("https://assets.hardcover.app/dune.jpg"), JSON.stringify(hc));
    await ev(() => __ulTest.goSettings("data"));
    await page.waitForTimeout(500);
    await ev(() => {
        document.querySelector<HTMLDetailsElement>(".igdbhow")!.open = true;
    });
    await page.waitForTimeout(300);
    ok(
        "proxy status chips",
        await ev(() => document.querySelectorAll(".pxchips .chip.on").length === 5),
        await ev(() => document.querySelectorAll(".pxchips .chip").length + "")
    );
    await page.screenshot({ path: ENV.OUT + "/s_data_1440.png", fullPage: true });
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" / "));
    await browser.close();
})();
