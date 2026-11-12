import ENV from "./env.ts";
ENV.needExport();
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { execSync } from "node:child_process";
import { ok } from "./helpers.ts";
const ZIP = ENV.EXPORT,
    APP = ENV.APP;
(async () => {
    const browser = await chromium.launch(ENV.launch);
    const mk = async () => {
        const c = await browser.newContext({ acceptDownloads: true });
        await setup(c);
        const p = await c.newPage();
        const errs: string[] = [];
        p.on("pageerror", e => errs.push(e.message));
        p.on("console", m => /privext|extension|passphrase/i.test(m.text()) && console.log("C", m.text()));
        await p.goto(APP);
        await p.waitForTimeout(1000);
        await p.fill("#wl-name", "S");
        await p.click('[data-act="welcome-done"]');
        return [c, p, errs] as const;
    };
    const [, p1, e1] = await mk();
    await p1.setInputFiles("#file-import", ZIP);
    await p1.waitForSelector('[data-act="import-replace"]');
    await p1.click('[data-act="import-replace"]');
    await p1.waitForTimeout(3000);
    const tiny =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const iid = await p1.evaluate((t: string) => {
        __ulTest.KEYS.tmdb = "TMDBSECRET";
        __ulTest.saveKeys();
        const id = [...__ulTest.items.keys()][0];
        __ulTest.quietPatch(id, { coverData: t });
        __ulTest.meta.profile.avatarData = t;
        __ulTest.goSettings("io");
        return id;
    }, tiny);
    await p1.waitForTimeout(300);
    await p1.evaluate(() => __ulTest.goSettings("ext"));
    await p1.waitForTimeout(300);
    const [fc] = await Promise.all([p1.waitForEvent("filechooser"), p1.click('[data-act="ext-pick"]')]);
    await fc.setFiles(ENV.FIX + "/sample-private.json");
    await p1.waitForTimeout(1000);
    await p1.evaluate(() => __ulTest.goSettings("io"));
    await p1.waitForTimeout(300);
    await p1.click('[data-act="export-open"]');
    await p1.fill("#exp-keypass", "hunter22-x");
    const [dl] = await Promise.all([
        p1.waitForEvent("download", { timeout: 120000 }),
        p1.click('[data-act="export-zip"]'),
    ]);
    await dl.saveAs(ENV.OUT + "/v2.zip");
    const list = execSync(
        `python3 -c "import zipfile,json;z=zipfile.ZipFile('${ENV.OUT}/v2.zip');n=z.namelist();print(json.dumps(sorted(set(x.split('/')[0]+('/'+x.split('/')[1] if x.count('/')>1 else '') for x in n))));print('KEYS', z.read('private/keys.json').decode()[:80]);print('PRIVEXT', 'private/extensions.json' in n, any(x.startswith('extensions/sample-private') for x in n));print('SECRET_IN_ZIP', any(b'TMDBSECRET' in z.read(x) for x in n));print('COVERREF', json.loads(z.read([x for x in n if x.startswith('library/')][0]).decode()).get('${iid}',{}).get('coverData','')[:40] if False else '');"`
    ).toString();
    ok(
        "folders",
        /library/.test(list) &&
            /collections/.test(list) &&
            /personal/.test(list) &&
            /academic\.json/.test(list) &&
            !/apps/.test(list) &&
            !/ranking/.test(list) &&
            /images\/covers/.test(list) &&
            /private/.test(list)
    );
    ok("private extension sealed, not loose", /PRIVEXT True False/.test(list));
    ok("keys encrypted", /univerlist-keys-1/.test(list) && /SECRET_IN_ZIP False/.test(list));
    // fresh copy, import it back
    const [, p2, e2] = await mk();
    await p2.setInputFiles("#file-import", ENV.OUT + "/v2.zip");
    await p2.waitForSelector('[data-act="import-replace"]');
    await p2.fill("#imp-keypass", "hunter22-x");
    await p2.click('[data-act="import-replace"]');
    await p2.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 120000 });
    const r = await p2.evaluate(
        (i: string) => ({
            n: __ulTest.items.size,
            key: __ulTest.KEYS.tmdb,
            cover: (__ulTest.items.get(i)?.coverData || "").slice(0, 22),
            av: (__ulTest.meta.profile.avatarData || "").slice(0, 22),
            modes: __ulTest.meta.modes.length,
            lists: __ulTest.meta.lists.length,
            favs: __ulTest.meta.favOrder.length,
            ac: !!(__ulTest.meta.courses && __ulTest.meta.courses.paths),
        }),
        iid
    );
    await p2.waitForTimeout(500);
    ok(
        "private extension back",
        await p2.evaluate(() => __ulTest.EXT.list.some(x => x.manifest.id === "sample-private" && x.private))
    );
    ok(
        "round trip",
        r.n > 1000 &&
            r.key === "TMDBSECRET" &&
            r.cover.startsWith("data:image/png") &&
            r.av.startsWith("data:image/png") &&
            r.modes > 5,
        JSON.stringify(r)
    );
    ok("no page errors", !e1.length && !e2.length, [...e1, ...e2].slice(0, 3).join(" / "));
    // an older export still comes in (set UL_OLD_EXPORT to one, e.g. a format-1 or format-2 zip of yours)
    if (process.env.UL_OLD_EXPORT) {
        const [, p3] = await mk();
        await p3.setInputFiles("#file-import", process.env.UL_OLD_EXPORT);
        await p3.waitForSelector('[data-act="import-replace"]'); /* only sealed keys ask for a passphrase */
        if (await p3.$("#imp-keypass")) await p3.fill("#imp-keypass", process.env.UL_OLD_PASS || "");
        await p3.click('[data-act="import-replace"]');
        await p3.waitForFunction(() => !__ulTest.ui.modal, null, { timeout: 120000 });
        await p3.waitForTimeout(800);
        const r3 = await p3.evaluate(() => ({ n: __ulTest.items.size, modes: __ulTest.meta.modes.length }));
        ok("older export imports", r3.n > 0 && r3.modes > 5, JSON.stringify(r3));
    }
    const man = execSync(
        `python3 -c "import zipfile,json;z=zipfile.ZipFile('${ENV.OUT}/v2.zip');m=json.loads(z.read('manifest.json'));i=json.loads(z.read('images/index.json'));print(m['format'],'files' in m,type(list(i.values())[0]).__name__)"`
    )
        .toString()
        .trim();
    ok("manifest format 3, lean index", man === "3 False str", man);
    await browser.close();
})();
