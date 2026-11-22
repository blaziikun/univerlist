// Account & sync, for real: the site and its Worker running here (wrangler dev, a throwaway database and bucket), two
// browsers each with a passkey that can't unlock by itself (no PRF, like some Windows Hello setups), so the recovery
// code is the way in on a second device. account-passkey-unlock.ts is the passkey path; account-link.ts the QR code.
// Needs the site's test build (pnpm build:e2e; pnpm test:e2e makes it); skips without it.
import fs from "node:fs";
import path from "node:path";
import ENV from "./env.ts";
import { chromium } from "playwright";
import { startSyncServer, newDevice, makeAccount, until, type Device } from "./sync-server.ts";
import { ok } from "./helpers.ts";
if (!fs.existsSync(path.join(ENV.SITE, "index.html"))) {
    console.log("skip  needs the site's test build (pnpm build:e2e)");
    process.exit(0);
}
(async () => {
    const srv = await startSyncServer(8799),
        BASE = srv.base;
    const b = await chromium.launch(ENV.launch);
    const sent: string[] = [],
        watch = (d: Device) =>
            d.p.on("request", r => {
                if (r.url().includes("/api/sync")) sent.push(r.postData() || "");
            });

    const A = await newDevice(b, BASE);
    watch(A);
    ok("Account & sync is on by default", await A.ev(() => __ulTest.builtinOn("account")));
    await A.ev(() => {
        __ulTest.addItem({ medium: "anime", title: "Secret Garden Of Tests", status: "done", rating: 9 });
        __ulTest.addItem({ medium: "book", title: "Dune", creator: "Frank Herbert", status: "want" });
    });
    const CODE = await makeAccount(A, "Tester");
    ok(
        "turning sync on gives a recovery code to save (24 characters, easy to read out)",
        /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/.test(CODE),
        CODE
    );
    const cookies = await A.c.cookies(BASE);
    const sc = cookies.find(x => x.name === "__Host-ul_s");
    ok(
        "the session cookie is HttpOnly, Secure, SameSite=Strict",
        !!sc && sc.httpOnly && sc.secure && sc.sameSite === "Strict",
        JSON.stringify(sc && { h: sc.httpOnly, s: sc.secure, ss: sc.sameSite })
    );
    ok("…and no script on the page can read it", await A.ev(() => !/ul_s/.test(document.cookie)));
    const me = await A.ev(async () => (await fetch("api/sync/me")).json());
    ok(
        "the library went up",
        me.version >= 1 && me.size > 28 && me.has_pass === 1,
        JSON.stringify({ v: me.version, s: me.size })
    );
    const raw = await A.ev(async () => {
        const r = await fetch("api/sync/data");
        const u = new Uint8Array(await r.arrayBuffer());
        return { n: u.length, text: new TextDecoder().decode(u) };
    });
    ok(
        "what the server holds is unreadable (no titles, no JSON)",
        raw.n > 28 && !/Secret Garden|Dune|"library"/.test(raw.text)
    );
    const bare = CODE.replace(/-/g, "");
    ok(
        "the recovery code never left the browser",
        !srv.log().includes(bare) && !sent.some(s => s.includes(bare) || s.includes(CODE))
    );

    // a second device: the same passkey (as if synced by a keychain), a fresh library; this passkey can't unlock by itself
    const { credentials } = await A.cdp.send("WebAuthn.getCredentials", { authenticatorId: A.authenticatorId });
    const B = await newDevice(b, BASE);
    watch(B);
    await B.cdp.send("WebAuthn.addCredential", { authenticatorId: B.authenticatorId, credential: credentials[0] });
    await B.ev(() => __ulTest.goSettings("account"));
    await B.p.waitForSelector('.acct button:has-text("Sign in with a passkey")');
    await B.p.click('.acct button:has-text("Sign in with a passkey")');
    await B.p.waitForSelector('.acct input[aria-label="Recovery code"]', { timeout: 15000 });
    await B.p.fill('.acct input[aria-label="Recovery code"]', "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF");
    await B.p.click('.acct button:has-text("Unlock")');
    await B.p
        .waitForFunction(() => /doesn't open it/.test(document.querySelector<HTMLElement>(".acct")!.innerText), null, {
            timeout: 20000,
        })
        .catch(() => {});
    ok(
        "a wrong recovery code doesn't open it",
        await B.ev(
            () =>
                /doesn't open it/.test(document.querySelector<HTMLElement>(".acct")!.innerText) &&
                ![...__ulTest.items.values()].some(x => x.title === "Dune")
        )
    );
    await B.p.fill('.acct input[aria-label="Recovery code"]', bare.toLowerCase().replace(/0/g, "o"));
    await B.p.click('.acct button:has-text("Unlock")');
    await B.p
        .waitForFunction(() => [...__ulTest.items.values()].some(x => x.title === "Dune"), null, { timeout: 20000 })
        .catch(() => {});
    ok(
        "the recovery code opens it on the other device, typed loosely (small letters, no dashes, O for 0)",
        await B.ev(() => {
            const t = [...__ulTest.items.values()].map(x => x.title);
            return t.includes("Dune") && t.includes("Secret Garden Of Tests");
        })
    );
    // a change on B reaches A
    // syncNow() joins a sync already running (an automatic one may have started before the change), so each device
    // syncs again once that one has finished: the second is sure to see the change
    await B.ev(async () => {
        __ulTest.addItem({ medium: "film", title: "Perfect Days", status: "done" });
        await __ulTest.syncNow();
        await __ulTest.syncNow();
    });
    await A.ev(async () => {
        for (let i = 0; i < 3 && ![...__ulTest.items.values()].some(x => x.title === "Perfect Days"); i++)
            await __ulTest.syncNow();
    });
    ok(
        "a change on one device reaches the other",
        await A.ev(() => [...__ulTest.items.values()].some(x => x.title === "Perfect Days"))
    );
    // a device with no passkey at all (yours is lost): the recovery code signs in, and a new passkey takes the old one's place
    const C = await newDevice(b, BASE);
    watch(C);
    await C.ev(() => __ulTest.goSettings("account"));
    await C.p.waitForSelector('.acct button:has-text("Lost your passkey?")');
    await C.p.click('.acct button:has-text("Lost your passkey?")');
    await C.p.fill('.acct input[aria-label="Recovery code to sign in"]', "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF");
    await C.p.click('.acct button:has-text("Sign in with it")');
    // the answer: it says why, and the button can be pressed again
    await C.p
        .waitForFunction(
            () => !!document.querySelector(".acct .acct-err") && !document.querySelector('.acct [role="status"]'),
            null,
            { timeout: 20000 }
        )
        .catch(() => {});
    ok("a wrong recovery code doesn't sign in", (await C.ev(async () => (await fetch("api/sync/me")).status)) === 401);
    await C.p.fill('.acct input[aria-label="Recovery code to sign in"]', CODE.toLowerCase());
    await C.p.click('.acct button:has-text("Sign in with it")');
    await C.p
        .waitForFunction(() => [...__ulTest.items.values()].some(x => x.title === "Perfect Days"), null, {
            timeout: 20000,
        })
        .catch(() => {});
    ok(
        "lost your passkey: the recovery code signs you in and brings the library",
        await C.ev(
            () =>
                [...__ulTest.items.values()].some(x => x.title === "Perfect Days") &&
                [...__ulTest.items.values()].some(x => x.title === "Dune")
        )
    );
    const old = (await C.ev(async () => (await fetch("api/sync/me")).json())).passkeys.map((p: { id: string }) => p.id);
    await C.p.waitForSelector('.acct button:has-text("Set up a new passkey")');
    await C.p.click('.acct button:has-text("Set up a new passkey")');
    const keys = async () =>
        (await C.ev(async () => (await fetch("api/sync/me")).json())).passkeys.map((p: { id: string }) => p.id);
    await until(async () => {
        const k = await keys();
        return k.length === 1 && !old.includes(k[0]);
    });
    const now2 = await keys();
    ok(
        "…then a new passkey takes the old one's place: still exactly one",
        now2.length === 1 && !old.includes(now2[0]),
        JSON.stringify({ old, now2 })
    );
    ok(
        "the recovery code was never sent anywhere",
        !srv.log().includes(bare) &&
            !sent.some(s => s.includes(bare) || s.includes(CODE) || s.includes(CODE.toLowerCase()))
    );

    // signing out elsewhere
    await B.ev(async () =>
        fetch("api/sync/sessions/revoke", {
            method: "POST",
            headers: { "X-UL-Sync": "1", "Content-Type": "application/json" },
            body: JSON.stringify({ others: true }),
        })
    );
    ok(
        '"sign out everywhere else" signs the other device out',
        (await A.ev(async () => (await fetch("api/sync/me")).status)) === 401
    );
    // another site can't act for you, even with your cookie in the browser
    const csrf = await B.ev(
        async () =>
            (
                await fetch("api/sync/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirm: "DELETE" }),
                })
            ).status
    );
    ok("a request without the app's own header is refused", csrf === 403);
    await B.ev(() => __ulTest.goSettings("account"));
    await B.p.waitForSelector('.acct button:has-text("History")');
    await B.p.click('.acct button:has-text("History")');
    await B.p
        .waitForFunction(() => /account created/.test(document.querySelector<HTMLElement>(".acct")!.innerText), null, {
            timeout: 20000,
        })
        .catch(() => {});
    ok(
        "the audit list shows what happened",
        await B.ev(
            () =>
                /account created/.test(document.querySelector<HTMLElement>(".acct")!.innerText) &&
                /signed in/.test(document.querySelector<HTMLElement>(".acct")!.innerText)
        )
    );
    await B.p.fill('.acct input[aria-label="Type DELETE to confirm"]', "DELETE");
    await B.p.click('.acct button:has-text("Delete my account")');
    await until(async () => (await B.ev(async () => (await fetch("api/sync/me")).status)) === 401);
    ok(
        "deleting the account: the cloud copy is gone, this device keeps its library",
        (await B.ev(async () => (await fetch("api/sync/me")).status)) === 401 &&
            (await B.ev(() => [...__ulTest.items.values()].some(x => x.title === "Dune")))
    );
    const errs = [...A.errs, ...B.errs, ...C.errs];
    ok("no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await b.close();
    srv.stop();
    setTimeout(() => process.exit(0), 500);
})().catch(e => {
    console.log("FAIL " + e.message.split("\n")[0]);
    process.exit(1);
});
