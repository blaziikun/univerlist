// CSVs in the one-file build, with no internet: the CSV reader (Papa Parse) comes inside the file, a semicolon file
// from Excel in another language opens as columns, and the CSV you download can't carry a spreadsheet formula.
import ENV from "./env.ts";
import fs from "node:fs";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext({ acceptDownloads: true });
    await setup(c);
    const p = await c.newPage(),
        errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    await c.setOffline(true);
    const open = (name: string, text: string) =>
        ev(
            async ([name, text]) => {
                await __ulTest.handleImportFile(new File([text], name));
                await new Promise(r => setTimeout(r, 300));
                return {
                    kind: __ulTest.ui.modal && __ulTest.ui.modal.kind,
                    preview: __ulTest.ui.modal && __ulTest.ui.modal.preview,
                    error: __ulTest.ui.modal && __ulTest.ui.modal.error,
                };
            },
            [name, text]
        );

    let st = await open(
        "goodreads.csv",
        'Title;Author;Exclusive Shelf;My Rating;Date Read\r\n"Dune";Frank Herbert;read;5;2024/03/05\r\n"Der Steppenwolf";"Hesse; Hermann";to-read;0;\r\n'
    );
    ok(
        "a semicolon Goodreads export is recognised, offline",
        st.kind === "io" && st.preview && st.preview.kind === "Goodreads" && st.preview.items!.length === 2,
        JSON.stringify(st).slice(0, 200)
    );
    ok(
        "…its quoted fields kept whole",
        st.preview && st.preview.items![1].creator === "Hesse; Hermann",
        st.preview && st.preview.items![1].creator
    );
    await ev(() => __ulTest.closeModal());
    st = await open("liste.csv", "Film\tGesehen am\tWertung\nStalker\t2024-01-02\t9\n");
    ok(
        "any other CSV (here tab-separated) opens the column matcher with its columns",
        st.kind === "csvmap" && JSON.stringify(st.preview!.columns) === '["Film","Gesehen am","Wertung"]',
        JSON.stringify(st).slice(0, 200)
    );
    await ev(() => __ulTest.closeModal());

    await ev(() =>
        __ulTest.addItem({
            medium: "film",
            title: '=HYPERLINK("https://example.com","click")',
            status: "done",
            notes: "+cmd",
        })
    );
    const [dl] = await Promise.all([p.waitForEvent("download"), ev(() => __ulTest.exportCSV(""))]);
    const text = fs.readFileSync(await dl.path(), "utf8");
    ok(
        "the CSV you download starts a would-be formula with a '",
        text.includes('"\'=HYPERLINK(""https://example.com"",""click"")"') &&
            text.includes(",'+cmd,") &&
            !/(^|,)[=+@]/m.test(text),
        text.split("\n")[1]
    );
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
