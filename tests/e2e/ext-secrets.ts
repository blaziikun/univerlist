// An extension's secret settings (here the video-files extension's companion password) are never written into a backup
// in the clear, come back with the backup passphrase, and leave nothing behind when it's removed. An extension reaches
// no web address it doesn't list. And a retired extension: a copy added before is deleted when the app starts, and an
// old backup's copy isn't brought back.
import fs from "node:fs";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { setup } from "./mocks.ts";
import { ok, evaluator } from "./helpers.ts";
import type { ExtRecord } from "../../src/features/extensions/extensions";
const ID = "local-media-player";
// the retired extension as it was saved on a device that had added it (its id is the one the clean-up recognises,
// EXT_RETIRED in extensions.ts)
const RETIRED = "ai-assistant";
const retired = {
    manifest: {
        id: RETIRED,
        name: "Retired extension",
        version: "1.0.0",
        author: "UniverList",
        main: "main.js",
        permissions: ["storage", "net"],
        hosts: ["api.example.com"],
    },
    files: { "main.js": "" },
    on: true,
    data: { settings: { key: "sk-old" } },
    at: "2026-11-01T00:00:00Z",
} as unknown as ExtRecord; // cast: as an older version saved it (no settings list)
(async () => {
    const b = await chromium.launch(ENV.launch),
        c = await b.newContext();
    await setup(c);
    const p = await c.newPage();
    const errs: string[] = [];
    p.on("pageerror", e => errs.push(e.message));
    const ev = evaluator(p);
    await p.goto(ENV.APP);
    await p.waitForTimeout(800);
    await p.fill("#wl-name", "T");
    await p.click('[data-act="welcome-done"]');
    ok("nothing of it runs until it's added", await ev(id => !__ulTest.extGet(id) && !__ulTest.EXT.frames.has(id), ID));
    const zip = fs.readFileSync(ENV.EXT(ID)).toString("base64");
    await ev(
        z =>
            __ulTest.extInstall(
                new File([Uint8Array.from(atob(z), ch => ch.charCodeAt(0))], "x.zip", { type: "application/zip" })
            ),
        zip
    );
    await p.waitForTimeout(1200);
    await ev(id => {
        const x = __ulTest.extGet(id);
        x!.data = { ...(x!.data || {}), settings: { token: "pw-test-123" } };
        return __ulTest.extSave(x!);
    }, ID);
    ok("added, it runs", await ev(id => __ulTest.EXT.frames.has(id), ID));
    ok(
        "it can't reach a web address it doesn't list",
        await ev(async id => {
            try {
                await __ulTest.extNetFetch(__ulTest.extGet(id)!, { url: "https://evil.example/x" });
                return false;
            } catch (e) {
                return /isn't one of/.test(String(e));
            }
        }, ID)
    );
    // ----- its secret in a backup: never in the clear; sealed with a backup passphrase, and back on import -----
    const B = await ev(async id => {
        const plain = await __ulTest.v2Files({}),
            sealed = await __ulTest.v2Files({ keysPass: "backup-pass" });
        const has = (r: typeof plain) =>
            r.files.some(f => typeof f.data === "string" && f.data.includes("pw-test-123"));
        const keys = (sealed.files.find(f => f.name === "private/keys.json") || {}).data;
        const x = __ulTest.extGet(id);
        x!.data.settings!.token = "";
        await __ulTest.extSave(x!);
        const box = document.createElement("input");
        box.id = "imp-keypass";
        box.value = "backup-pass";
        document.body.append(box);
        await __ulTest.applyParts({ keys: { __locked: JSON.parse(String(keys)) } }, { keys: true }, "merge");
        box.remove();
        return {
            plain: has(plain),
            sealed: has(sealed),
            sealedFile: !!keys,
            back: __ulTest.extGet(id)!.data.settings!.token,
        };
    }, ID);
    ok("its password is in no backup in the clear, passphrase or not", !B.plain && !B.sealed, JSON.stringify(B));
    ok(
        "…with a backup passphrase it's sealed beside your keys, and comes back on import",
        B.sealedFile && B.back === "pw-test-123",
        JSON.stringify(B)
    );
    // ----- the retired extension -----
    ok(
        "the retired extension isn't offered any more",
        await ev(id => {
            __ulTest.goSettings("ext");
            return !document.querySelector(`[data-act="ext-official"][data-k="${id}"]`);
        }, RETIRED)
    );
    await ev(() => {
        __ulTest
            .ACS()
            .subjects.push({ id: "s-m", name: "Mathematics", fields: { Analysis: { lvl: 0 } }, order: ["Analysis"] });
        __ulTest.setMode("academic");
        __ulTest.ui.learnSub = "s-m";
        __ulTest.goTab("learn");
    });
    await p.waitForTimeout(200);
    ok(
        "…and the Learning Centre looks things up by itself",
        await ev(() => /Look it up/.test(document.body.textContent))
    );
    await ev(
        async r =>
            __ulTest.tx(
                "x",
                "readwrite",
                s => {
                    s.put(r, r.manifest.id);
                },
                await __ulTest.extDB()
            ),
        retired
    );
    await p.reload();
    await p.waitForTimeout(1500);
    if (await p.$("#wl-name")) {
        await p.fill("#wl-name", "T");
        await p.click('[data-act="welcome-done"]');
    }
    ok(
        "a copy added before is deleted when the app starts, its saved key with it",
        await ev(
            async id =>
                !__ulTest.extGet(id) && !(await __ulTest.idbAll("x", await __ulTest.extDB())).some(([k]) => k === id),
            RETIRED
        )
    );
    ok("…the rest stay", await ev(id => !!__ulTest.extGet(id), ID));
    await ev(r => __ulTest.extRestore([r]), retired);
    await p.waitForTimeout(300);
    ok(
        "an old backup's copy isn't brought back",
        await ev(
            async id =>
                !__ulTest.extGet(id) && !(await __ulTest.idbAll("x", await __ulTest.extDB())).some(([k]) => k === id),
            RETIRED
        )
    );
    await ev(r => __ulTest.extRestore([{ ...r, manifest: { ...r.manifest, author: "someone" } }]), retired);
    await p.waitForTimeout(300);
    ok("someone else's extension that shares the name is left alone", await ev(id => !!__ulTest.extGet(id), RETIRED));
    // ----- removing one leaves nothing -----
    await ev(() => {
        __ulTest.goSettings("ext");
    });
    await p.waitForTimeout(100);
    await p.click(`[data-act="ext-remove"][data-k="${ID}"]`);
    await p.waitForTimeout(400);
    ok(
        "removed: nothing left of it",
        await ev(
            async id =>
                !__ulTest.extGet(id) &&
                !__ulTest.EXT.frames.has(id) &&
                !document.querySelector(`iframe[title="extension ${id}"]`) &&
                !(await __ulTest.idbAll("x", await __ulTest.extDB())).some(([k]) => k === id),
            ID
        )
    );
    ok("no page errors", !errs.length, errs.join(" | "));
    await b.close();
})();
