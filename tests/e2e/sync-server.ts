// ============ for the account tests: the site and its Worker running here, with Account & sync switched on ============
// wrangler dev --local, with a throwaway database and bucket (wrangler.test.jsonc), and browser "devices" that each have
// their own passkey authenticator (Chrome's virtual one, driven over CDP).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import ENV from "./env.ts";
import { evaluator } from "./helpers.ts";
import type { Browser } from "playwright";
const CFG = path.join(import.meta.dirname, "wrangler.test.jsonc"),
    WR = path.join(ENV.ROOT, "node_modules/.bin/wrangler");
// all offline: no request details fetched from Cloudflare, no usage reports
const WENV = { ...process.env, CI: "1", CLOUDFLARE_CF_FETCH_ENABLED: "false", WRANGLER_SEND_METRICS: "false" };

/** start the site on this port; resolves once it's ready. log() is everything the server printed (to check what it saw) */
async function startSyncServer(port: number) {
    const state = fs.mkdtempSync(path.join(os.tmpdir(), "ul-acct-"));
    execFileSync(WR, ["d1", "migrations", "apply", "ACCOUNTS", "--local", "--config", CFG, "--persist-to", state], {
        stdio: "ignore",
        env: WENV,
    });
    // its own process group, so stopping it also stops the workerd it starts (otherwise that keeps the port)
    const dev = spawn(
        WR,
        ["dev", "--local", "--config", CFG, "--persist-to", state, "--port", String(port), "--ip", "127.0.0.1"],
        { env: WENV, stdio: ["ignore", "pipe", "pipe"], detached: true }
    );
    const kill = (sig: NodeJS.Signals) => {
        try {
            process.kill(-dev.pid!, sig);
        } catch (_) {}
    };
    process.on("exit", () => kill("SIGKILL")); // and when the test ends, however it ends
    let log = "";
    dev.stdout.on("data", d => {
        log += d;
    });
    dev.stderr.on("data", d => {
        log += d;
    });
    for (let i = 0; i < 120 && !/Ready on/.test(log); i++) await new Promise(r => setTimeout(r, 250));
    if (!/Ready on/.test(log)) {
        kill("SIGKILL");
        throw new Error("wrangler dev didn't start | " + log.slice(-400));
    }
    return { base: `http://localhost:${port}`, log: () => log, stop: () => kill("SIGTERM") };
}

/** a new "device": its own browser storage and its own passkey authenticator. prf: whether its passkeys can unlock.
 *  secrets: an array that collects every PRF secret a passkey hands this page (base64), to check none is ever sent.
 *  url: open this instead of the site's front page (a QR code's link, say) */
async function newDevice(
    browser: Browser,
    base: string,
    { prf = false, secrets = null, url = "" }: { prf?: boolean; secrets?: string[] | null; url?: string } = {}
) {
    const c = await browser.newContext(),
        errs: string[] = [];
    if (secrets) {
        await c.exposeBinding("__ulSawSecret", (_src, b64: string) => {
            secrets.push(b64);
        });
        await c.addInitScript(() => {
            const get = PublicKeyCredential.prototype.getClientExtensionResults;
            PublicKeyCredential.prototype.getClientExtensionResults = function (this: PublicKeyCredential) {
                const r = get.call(this),
                    first = r && r.prf && r.prf.results && r.prf.results.first;
                if (first)
                    window.__ulSawSecret(
                        btoa(
                            String.fromCharCode(
                                ...(ArrayBuffer.isView(first)
                                    ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
                                    : new Uint8Array(first))
                            )
                        )
                    );
                return r;
            };
        });
    }
    const p = await c.newPage();
    p.on("pageerror", e => errs.push(e.message));
    const cdp = await c.newCDPSession(p);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
            protocol: "ctap2",
            transport: "internal",
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
            hasPrf: prf,
        },
    });
    // started: the welcome screen (a new browser) is up by then, if it's going to be
    await p.goto(url || base + "/");
    await p.waitForFunction(() => window.__ulTest?.booted, null, { timeout: 30000 });
    if (await p.$("#wl-name")) {
        await p.fill("#wl-name", "Me");
        await p.click('[data-act="welcome-done"]');
    }
    return { c, p, cdp, authenticatorId, errs, ev: evaluator(p) };
}

/** make an account on this device and turn sync on: returns the recovery code it shows (after "saving" it) */
async function makeAccount(d: Device, name: string) {
    await d.ev(() => __ulTest.goSettings("account"));
    await d.p.waitForSelector('.acct input[aria-label="Your name"]', { timeout: 15000 });
    await d.p.fill('.acct input[aria-label="Your name"]', name);
    await d.p.click('.acct button:has-text("Create an account")');
    await d.p.waitForSelector('.acct button:has-text("Start syncing")', { timeout: 15000 });
    await d.p.click('.acct button:has-text("Start syncing")');
    await d.p.waitForSelector(".acct .code", { timeout: 20000 });
    if (process.env.SHOTS) await d.p.screenshot({ path: ENV.OUT + "/acct-code.png" });
    const code = (await d.p.textContent(".acct .code"))!.trim();
    await d.p.check('.acct input[type="checkbox"]');
    await d.p.click('.acct button:has-text("Done")');
    await d.p.waitForSelector('.acct button:has-text("Sync now")', { timeout: 15000 });
    return code;
}
/** wait until check() (async, run here) says yes, asking every 100 ms: a real condition, never a fixed time. Gives up
 *  after ms, and says whether it came true */
async function until(check: () => unknown, ms = 20000) {
    const end = Date.now() + ms;
    for (;;) {
        if (await check()) return true;
        if (Date.now() > end) return false;
        await new Promise(r => setTimeout(r, 100));
    }
}
/** a "new device": everything of the site wiped from this browser (the passkey stays, as it would in a real keychain) */
async function wipe(d: Device, base: string) {
    await d.cdp.send("Storage.clearDataForOrigin", { origin: base, storageTypes: "all" });
    await d.c.clearCookies();
}

/** one browser "device" (newDevice) */
type Device = Awaited<ReturnType<typeof newDevice>>;

export { startSyncServer, newDevice, makeAccount, wipe, until, type Device };
