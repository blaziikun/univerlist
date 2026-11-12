// Hostile zips and pictures: a zip bomb is refused before it fills memory, with a clear message; a "picture" is only
// ever what its bytes say it is; and an export too big for a plain zip says so instead of writing a broken file.
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { zipSync } from "fflate";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');

    // 4 MB of zeros squeezes to a few KB: with the limit lowered to 1 MB it stands in for a real bomb
    const bomb = Buffer.from(zipSync({ "library/anime.json": new Uint8Array(4 * 1048576) }, { level: 9 }));
    const st = await ev(
        async bytes => {
            __ulTest.ZIP_LIMITS.total = 1048576;
            const file = new File([new Uint8Array(bytes)], "bomb.zip");
            let err = "";
            try {
                await __ulTest.readImportFile(file);
            } catch (e) {
                err = e instanceof Error ? e.message : String(e);
            }
            await __ulTest.handleImportFile(file);
            await new Promise(r => setTimeout(r, 200));
            return {
                err,
                shown: document.querySelector(".modal") ? document.querySelector<HTMLElement>(".modal")!.innerText : "",
            };
        },
        [...bomb]
    );
    ok("a zip that unpacks past the limit is refused while unpacking", st.err === "too big", st.err);
    ok("…and the person is told why", /more than any export could/.test(st.shown), st.shown.slice(0, 120));
    ok(
        `the bomb was ${Math.round(bomb.length / 1024)} KB, so the limit stopped it, not its size`,
        bomb.length < 100 * 1024
    );

    const st2 = await ev(() => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
        const page = new TextEncoder().encode("<html><script>alert(1)</script></html>");
        const svg = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
        return {
            png: __ulTest.pictureType(png),
            page: __ulTest.pictureType(page),
            svg: __ulTest.pictureType(svg),
            pageData: __ulTest.bytesToData(page),
            pngData: __ulTest.bytesToData(png).slice(0, 22),
        };
    });
    ok(
        "a picture's type comes from its bytes, and an SVG (which can carry a script) isn't one",
        st2.png === "png" && st2.svg === null,
        JSON.stringify(st2)
    );
    ok(
        "…and a web page named .jpg is no picture at all",
        st2.page === null && st2.pageData === "",
        JSON.stringify(st2)
    );
    const st3 = await ev(async () => {
        const page = new TextEncoder().encode("<html><script>alert(1)</script></html>");
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
        return {
            page: await __ulTest.restoreImages([["https://example.com/a.jpg", page, "covers/a.jpg"]]),
            png: await __ulTest.restoreImages([["https://example.com/b.png", png, "covers/b.png"]]),
        };
    });
    ok(
        "restoring a backup's pictures skips the one that isn't a picture",
        st3.page === 0 && st3.png === 1,
        JSON.stringify(st3)
    );

    const st4 = await ev(() => {
        try {
            __ulTest.zipFiles(Array.from({ length: 65536 }, (_, i) => ({ name: "f" + i, data: "" })));
            return "";
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    });
    ok("an export past what a plain zip can hold stops with a reason", st4 === "too big", st4);

    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
