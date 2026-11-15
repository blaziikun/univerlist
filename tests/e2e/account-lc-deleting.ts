// Deleting in the Learning Centre, across two devices that sync: a course, a book in a course and a programme deleted
// on one device are gone from the other after both sync, and stay gone, even when the other device had changes of its
// own (so the two copies are merged rather than one simply replacing the other).
// What it once got wrong: merging joined both devices' courses by id, so a course deleted on one came back from the other.
// Needs the site's test build (pnpm build:e2e; pnpm test:e2e makes it); skips without it.
import fs from "node:fs";
import path from "node:path";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { startSyncServer, newDevice, makeAccount, type Device } from "./sync-server.ts";
import { ok } from "./helpers.ts";
if (!fs.existsSync(path.join(ENV.SITE, "index.html"))) {
    console.log("skip  needs the site's test build (pnpm build:e2e)");
    process.exit(0);
}
(async () => {
    const srv = await startSyncServer(8796),
        BASE = srv.base;
    const b = await chromium.launch(ENV.launch);
    // what each device has: its courses, the books in the first, the programmes, and a library entry made there
    const has = (d: Device) =>
        d.ev(() => {
            const L = __ulTest.LCS(),
                M = L.find(c => c.id === "lc-maths");
            return {
                courses: L.map(c => c.id).sort(),
                books: M ? M.books.map(b => b.id).sort() : [],
                progs: L.flatMap(c => c.progs.map(p => p.id)).sort(),
                items: [...__ulTest.items.values()].map(x => x.title).sort(),
            };
        });
    const syncTwice = (d: Device) =>
        d.ev(async () => {
            await __ulTest.syncNow();
            await __ulTest.syncNow();
        });

    const A = await newDevice(b, BASE);
    await A.ev(() => {
        const C = __ulTest.ACS();
        C.courses.push(
            {
                id: "lc-maths",
                name: "Mathematics",
                fields: {},
                topics: [{ id: "t1", name: "Analysis", area: "Analysis" }],
                books: [
                    { id: "k1", t: "Calculus", a: "Michael Spivak", topic: "t1", lvl: 1, st: "done" },
                    {
                        id: "k2",
                        t: "Understanding Analysis",
                        a: "Stephen Abbott",
                        topic: "t1",
                        lvl: 2,
                        st: "todo",
                        after: [{ k: "k1", s: "done" }],
                    },
                    {
                        id: "k3",
                        t: "Principles of Mathematical Analysis",
                        a: "Walter Rudin",
                        topic: "t1",
                        lvl: 2,
                        st: "todo",
                        after: [{ k: "k2", s: "done" }],
                    },
                ],
                progs: [
                    { id: "pg1", uni: "MIT", name: "Course 18", modules: [{ name: "Real Analysis", books: [] }] },
                    { id: "pg2", uni: "Cambridge", name: "Tripos", modules: [] },
                ],
            },
            { id: "lc-aero", name: "Aerospace engineering", fields: {}, topics: [], books: [], progs: [] }
        );
        C.def = "lc-maths";
        __ulTest.markDirty();
    });
    const CODE = await makeAccount(A, "Tester");

    // the second device signs in and brings the library in
    const { credentials } = await A.cdp.send("WebAuthn.getCredentials", { authenticatorId: A.authenticatorId });
    const B = await newDevice(b, BASE);
    await B.cdp.send("WebAuthn.addCredential", { authenticatorId: B.authenticatorId, credential: credentials[0] });
    await B.ev(() => __ulTest.goSettings("account"));
    await B.p.waitForSelector('.acct button:has-text("Sign in with a passkey")');
    await B.p.click('.acct button:has-text("Sign in with a passkey")');
    await B.p.waitForSelector('.acct input[aria-label="Recovery code"]', { timeout: 15000 });
    await B.p.fill('.acct input[aria-label="Recovery code"]', CODE);
    await B.p.click('.acct button:has-text("Unlock")');
    await B.p.waitForFunction(() => __ulTest.LCS().length === 2, null, { timeout: 20000 }).catch(() => {});
    const b0 = await has(B);
    ok(
        "both devices have both courses",
        b0.courses.join() === "lc-aero,lc-maths" && b0.books.join() === "k1,k2,k3" && b0.progs.join() === "pg1,pg2",
        JSON.stringify(b0)
    );

    // device A deletes a course (from its page), a book in a course and a programme (in Curricula)
    await A.ev(() => {
        __ulTest.closeSettings();
        __ulTest.setMode("academic");
        __ulTest.ui.learnSub = "lc-aero";
        __ulTest.goTab("learn");
    });
    await A.p.click(".lcmore summary");
    await A.p.click('[data-act="learn-del"]');
    await A.p.click('[data-act="learn-del-yes"]');
    await A.ev(() => {
        __ulTest.ui.learnSub = "lc-maths";
        __ulTest.goTab("learn");
    });
    await A.p.click('.lcb[data-k="k2"]');
    await A.p.waitForSelector(".pwmodal");
    await A.p.click(".pwmodal summary");
    await A.p.click('[data-act="pw-rm"]');
    await A.p.click('[data-act="pw-rm-yes"]');
    await A.ev(() => __ulTest.goTab("curricula"));
    await A.p.click('[data-act="uni-del"][data-k="pg2"]');
    const a1 = await has(A);
    ok(
        "deleted on this device: the course, the book (and what waited on it lets go), the programme",
        a1.courses.join() === "lc-maths" && a1.books.join() === "k1,k3" && a1.progs.join() === "pg1",
        JSON.stringify(a1)
    );
    await syncTwice(A);

    // device B changed something of its own meanwhile, so the two copies are merged
    await B.ev(() => {
        __ulTest.addItem({ medium: "book", title: "Made on B", status: "want" });
        __ulTest.lcAddBook(__ulTest.lcSub("lc-maths")!, {
            t: "Linear Algebra Done Right",
            a: "Sheldon Axler",
            topic: "t1",
            lvl: 2,
        });
        __ulTest.markDirty();
    });
    await syncTwice(B);
    const b1 = await has(B);
    ok(
        "after syncing, the other device has lost them too, and kept what it added itself",
        b1.courses.join() === "lc-maths" &&
            !b1.books.includes("k2") &&
            b1.books.includes("k1") &&
            b1.books.length === 3 &&
            b1.progs.join() === "pg1" &&
            b1.items.includes("Made on B"),
        JSON.stringify(b1)
    );
    ok(
        "…and the book that waited on the deleted one no longer does",
        await B.ev(
            () => !(__ulTest.lcSub("lc-maths")!.books.find(b => b.id === "k3")!.after || []).some(c => c.k === "k2")
        )
    );

    // and they stay gone: A brings B's changes in, both sync again
    await syncTwice(A);
    await A.ev(() => __ulTest.addItem({ medium: "film", title: "Made on A", status: "done" }));
    await syncTwice(A);
    await syncTwice(B);
    await syncTwice(A);
    const [a2, b2] = [await has(A), await has(B)];
    ok(
        "they stay gone on both, after more syncs both ways, and each has the other's additions",
        a2.courses.join() === "lc-maths" &&
            b2.courses.join() === "lc-maths" &&
            a2.books.join() === b2.books.join() &&
            !a2.books.includes("k2") &&
            a2.books.length === 3 &&
            a2.progs.join() === "pg1" &&
            b2.progs.join() === "pg1" &&
            a2.items.includes("Made on B") &&
            b2.items.includes("Made on A"),
        JSON.stringify({ a2, b2 })
    );
    const errs = [...A.errs, ...B.errs];
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
    srv.stop();
    setTimeout(() => process.exit(0), 500);
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
