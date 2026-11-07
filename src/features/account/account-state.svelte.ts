// src/features/account/account-state.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  Account: what Settings › Account & sync shows, and everything you can do there
//
//  The components (Account.svelte and the parts it shows) only display `acct` and call these actions; all the steps
//  live here, so each one reads top to bottom. The keys:
//    sync key       random, encrypts your library (crypto.ts). Kept on each device you've signed in on.
//    passkey box    the sync key sealed by a passkey's secret: signing in with that passkey unlocks your library
//    recovery box   the sync key sealed by your recovery code (recovery-code.ts): the way back if every device is lost
//    link box       the sync key sealed for one QR code, for ten minutes: how another device signs in (link-device.ts)
//  One account has one passkey and one recovery code, and that's all. The usual journey: make an account (your passkey,
//  and a recovery code to save), then "Sign in on another device": scan the code with your phone, or open its link on
//  another computer, and that device is signed in with your library, no new passkey. Each device then syncs by itself.
//  Lost your passkey? The recovery code signs you in, and you set up a new passkey in place of the old one.
// ─────────────────────────────────────────────────────────────────

import { browserSupportsWebAuthn, sendSignal } from "@simplewebauthn/browser";
import { api, SyncError, type Me } from "./api";
import {
    keepKey,
    keptKey,
    keptKeyId,
    keyId,
    newSyncKey,
    openData,
    openWithPassphrase,
    sealWithPassphrase,
} from "./crypto";
import { type LinkBox, linkFromUrl, linkUrl, openLinkBox, qrSvg, sealForLink } from "./link-device";
import {
    confirmWithPasskey,
    createPasskey,
    openWithPasskey,
    sealWithPasskey,
    usePasskey,
    type Secret,
} from "./passkey-unlock";
import { newRecoveryCode, signInKey, tidyCode } from "./recovery-code";
import { forget, saveState, startAuto, syncNow } from "./sync";

type View = "loading" | "nosite" | "noserver" | "out" | "setup" | "locked" | "ready";
export type History = {
    audit: { at: number; kind: string; detail: string }[];
    versions: { version: number; size: number; at: string }[];
};

export const acct = $state({
    view: "loading" as View,
    me: null as Me | null,
    busy: "", // what's happening, while it happens
    error: "",
    note: "", // what just happened
    code: "", // a new recovery code, shown until you say you've saved it
    joining: false, // this page was opened from a QR code: offer to add this device
    qr: null as { url: string; svg: string; expires: number } | null, // the code this device is showing
    newPasskey: false, // signed in with the recovery code: offer a new passkey in place of the lost one
});

// The secret from the passkey you just signed in (or up) with, in memory only, until it's used.
let fresh: Secret | null = null;
// The QR link this page was opened from, in memory only (it's taken out of the address straight away).
let link: { token: string; secret: Uint8Array } | null = null;

/** this page was opened by scanning an "Sign in on another device" code: remember it, and say so (main.ts calls this first) */
export function takeLink(): boolean {
    link = linkFromUrl();
    acct.joining = !!link;
    return !!link;
}

/** what a sync did, in plain words */
const said = (r: string) =>
    ({
        "in step": "Everything's in step.",
        sent: "Your library is saved.",
        "brought in": "Your library is here, with the changes from your other devices.",
        busy: "Another device is syncing right now; this one will catch up in a moment.",
    })[r] || r;

/** run one action: show it's busy, and turn whatever goes wrong into a sentence */
async function act(label: string, fn: () => Promise<void>) {
    acct.busy = label;
    acct.error = acct.note = "";
    try {
        await fn();
    } catch (e) {
        const err = e as Error;
        acct.error = err?.name === "NotAllowedError" ? "The passkey prompt was closed." : err?.message || String(e);
    } finally {
        acct.busy = "";
    }
}
const me = () => acct.me as Me; // only called once signed in

/** where you are: on the site or not, signed in or not, sync set up or not, this device unlocked or not */
export async function load() {
    acct.error = "";
    if (!location.protocol.startsWith("http")) return void (acct.view = "nosite");
    if (!browserSupportsWebAuthn()) {
        acct.error = "This browser can't use passkeys.";
        return void (acct.view = "nosite");
    }
    try {
        acct.me = await api.me();
    } catch (e) {
        acct.me = null;
        if (e instanceof SyncError && e.status === 501) return void (acct.view = "noserver");
        if (e instanceof SyncError && e.status === 401) await keepKey(null); // signed out (or the session ended): forget the key
        if (!(e instanceof SyncError)) acct.error = "Can't reach the server right now.";
        return void (acct.view = "out");
    }
    saveState({ on: true, name: me().name });
    // a key kept here is used only if it's this account's (a device can hold one from an account it was signed out of)
    const key = await keptKey(),
        kid = await keptKeyId();
    const ours = !!key && !!me().has_key && (!me().kid || !kid || kid === me().kid);
    if (key && !ours) await keepKey(null);
    acct.view = !me().has_key ? "setup" : ours ? "ready" : "locked";
    if (acct.view === "ready") startAuto();
    tidyPasswordManager();
}

/** tell this browser's password manager which of your passkeys still count, so it can hide or delete the rest (ones
 * you removed here). Browsers that can't do this just ignore it */
function tidyPasswordManager() {
    sendSignal({
        signalName: "allAcceptedCredentials",
        rpID: me().rp_id,
        userID: me().user_handle,
        allAcceptedCredentialIDs: me().passkeys.map(p => p.id),
    }).catch(() => {});
}

/** signed in just now: nothing from whoever was signed in here before is used */
async function startFresh() {
    forget();
    await keepKey(null);
}

/** the sync key is open: check it really opens the cloud copy, keep it on this device, and bring your library in */
async function unlocked(syncKey: CryptoKey) {
    const d = await api.getData();
    if (d.data) await openData(syncKey, d.data); // throws if it doesn't: nothing is kept
    await keepKey(syncKey);
    saveState({ version: 0, hash: "" }); // as if this device had never synced: the cloud copy comes in, merged with what's here
    await load();
    acct.note = said(await syncNow());
    acct.me = await api.me(); // with what that sync saved
}

/** let this passkey unlock the library from now on (it gave us its secret, and the sync key is open) */
async function giveBox(got: Secret | null, syncKey: CryptoKey): Promise<boolean> {
    if (!got?.secret) return false;
    await api.passkeyBox(got.id, await sealWithPasskey(syncKey, got.secret));
    return true;
}

/** the sync key, opened by any of your passkeys that has a box (one passkey prompt) */
async function keyFromAPasskey(): Promise<CryptoKey> {
    const unlocking = me().passkeys.filter(p => p.box);
    if (!unlocking.length) throw new Error("None of your passkeys unlocks your library yet: use your recovery code.");
    const got = await confirmWithPasskey(
        me().rp_id,
        unlocking.map(p => p.id)
    );
    const box = unlocking.find(p => p.id === got.id)?.box;
    if (!box || !got.secret) throw new Error("That passkey can't unlock your library in this browser.");
    return openWithPasskey(box, got.secret);
}

/** the sync key, as this device holds it. Devices unlocked by older versions kept it in a form that can't be passed
 * on, so for those, one passkey prompt opens it again */
async function thisDevicesKey(): Promise<CryptoKey> {
    const key = await keptKey();
    if (key?.extractable) return key;
    const again = await keyFromAPasskey();
    await keepKey(again); // kept the new way from now on
    return again;
}

// ── confirm it's you ──
// Deleting the account, a new recovery code, and replacing or removing a passkey need your passkey (or the recovery
// code) in the last few minutes, not only being signed in: the server says "confirm it's you first" (403) otherwise.
// Signing in with your passkey or the code counts; a device signed in by a QR code is asked for the passkey.
let recoveredWith = ""; // the key made from the recovery code you signed in with, in memory only (never saved)
async function confirmItsYou() {
    if (recoveredWith) {
        const ok = await api.confirmCode(recoveredWith).then(
            () => true,
            () => false
        );
        if (ok) return;
        recoveredWith = "";
    }
    const o = await api.confirmOptions();
    const { response } = await usePasskey(o.options).catch(() => {
        throw new Error(
            "This needs your passkey, to make sure it's you. (Lost it? Sign in with your recovery code instead.)"
        );
    });
    await api.confirmPasskey(o.id, response);
}
/** run a step that needs "confirm it's you": if the server asks, confirm (one passkey prompt) and try once more */
async function confirmed<T>(step: () => Promise<T>): Promise<T> {
    try {
        return await step();
    } catch (e) {
        if (!(e instanceof SyncError && e.status === 403 && /confirm it's you/.test(e.message))) throw e;
        await confirmItsYou();
        return step();
    }
}

/** a new recovery code for this sync key: its box and its sign-in key go to the server, the code is shown here */
async function makeRecoveryCode(syncKey: CryptoKey) {
    const code = newRecoveryCode();
    return { code, box: await sealWithPassphrase(syncKey, code), auth: await signInKey(code) };
}

// ── signing up and in ──
export const signUp = (name: string) =>
    act("Making your account…", async () => {
        const o = await api.registerOptions(name.trim() || "Me");
        const { response, got } = await createPasskey(o.options);
        await api.registerVerify(o.id, response);
        await startFresh();
        fresh = got;
        await load(); // → "setup"
    });

export const signIn = () =>
    act("Signing in…", async () => {
        const o = await api.loginOptions();
        const { response, got } = await usePasskey(o.options);
        const r = await api.loginVerify(o.id, response).catch(e => {
            // a passkey this site no longer knows (you removed it): ask the password manager to forget it too
            if (e instanceof SyncError && e.status === 401)
                sendSignal({
                    signalName: "unknownCredential",
                    rpID: location.hostname,
                    credentialID: response.id,
                }).catch(() => {});
            throw e;
        });
        await startFresh();
        // the usual way: this passkey has a box, and its secret opens it. Your library loads, nothing else to type.
        if (r.box && got.secret) {
            const key = await openWithPasskey(r.box, got.secret).catch(() => null);
            if (key)
                return unlocked(key).catch(async e => {
                    await load(); // signed in, whatever went wrong: show where you are
                    throw e;
                });
        }
        fresh = got; // otherwise the recovery code opens it, and then this passkey gets a box for next time
        await load(); // → "locked", or "setup" if sync was never set up
    });

// ── turning sync on (once per account) ──
/** a new sync key, sealed for the passkey you're using (if it can) and by a new recovery code, which is then shown */
export const startSyncing = () =>
    act("Setting up sync…", async () => {
        // the passkey said it can unlock but hasn't given its secret yet (or this page was reloaded): one prompt to ask it.
        // If it can't, that's fine: this device keeps the key, and the recovery code or a QR code brings other devices in.
        if (!fresh || (fresh.can && !fresh.secret))
            fresh = await confirmWithPasskey(me().rp_id, fresh ? [fresh.id] : me().passkeys.map(p => p.id)).catch(
                () => fresh
            );
        const key = await newSyncKey(),
            { code, box, auth } = await makeRecoveryCode(key);
        const passkey = fresh?.secret ? { id: fresh.id, box: await sealWithPasskey(key, fresh.secret) } : null;
        // the key and its first boxes in one go: if another device turned sync on a moment ago, this is refused
        try {
            await api.setup(await keyId(key), passkey, box, auth);
        } catch (e) {
            if (!(e instanceof SyncError && e.status === 409)) throw e;
            await load(); // → "locked": the other device's key is the one
            throw new Error("Sync was just turned on from another device: unlock with that instead.");
        }
        fresh = null;
        await unlocked(key);
        acct.code = code;
    });

/** you've saved the recovery code: it's not shown again */
export function codeSaved() {
    acct.code = "";
}

// ── unlocking on a new device (only when signing in didn't do it already) ──
export const unlockWithCode = (typed: string) =>
    act("Unlocking…", async () => {
        const box = me().pass_box;
        if (!box) throw new Error("This account has no recovery code: use a passkey that unlocks it.");
        // the code as typed (an older account's own passphrase), or tidied (spaces, small letters, O for 0)
        const key = await openWithPassphrase(box, typed).catch(() => openWithPassphrase(box, tidyCode(typed)));
        await unlocked(key);
        if (await giveBox(fresh, key)) {
            acct.me = await api.me();
            acct.note += " The passkey you signed in with will unlock it by itself from now on.";
        }
        fresh = null;
    });

export const unlockWithPasskey = () =>
    act("Waiting for your passkey…", async () => {
        const key = await keyFromAPasskey();
        await unlocked(key);
        if (await giveBox(fresh, key)) acct.me = await api.me();
        fresh = null;
    });

/** lost your passkey: the recovery code signs you in and unlocks your library; then a new passkey can take the old one's place */
export const signInWithCode = (typed: string) =>
    act("Signing in…", async () => {
        const auth = await signInKey(typed);
        await api.recover(auth);
        await startFresh();
        recoveredWith = auth; // so setting up your new passkey can confirm it's you without the old one
        await load();
        const box = me().pass_box;
        if (!box) throw new Error("This account has no recovery code.");
        await unlocked(await openWithPassphrase(box, tidyCode(typed)));
        acct.newPasskey = true;
    });

// ── signing another device in with a QR code: on the device you're using ──
let watching = 0;
export const showQr = () =>
    act("Making a code…", async () => {
        const { box, secret } = await sealForLink(await thisDevicesKey());
        const { token, expires } = await api.linkStart(box as LinkBox);
        const url = linkUrl(token, secret);
        acct.qr = { url, svg: qrSvg(url), expires };
        // wait for the other device to use it, then say so
        clearInterval(watching);
        watching = window.setInterval(async () => {
            if (!acct.qr) return clearInterval(watching);
            const s = await api.linkState().catch(() => null);
            if (s?.used) {
                clearInterval(watching);
                acct.qr = null;
                acct.me = await api.me();
                acct.note = "Your other device is signed in: it has your library and keeps in step by itself.";
            } else if (s && !s.live) {
                clearInterval(watching);
                acct.qr = null;
                acct.note = "That code expired. Make a new one when you're ready.";
            }
        }, 3000);
    });
export async function hideQr() {
    clearInterval(watching);
    acct.qr = null;
    await api.linkCancel().catch(() => {});
}

// ── …and on the device that scanned it (or opened its link): signed in, no passkey made ──
export const joinWithLink = () =>
    act("Signing this device in…", async () => {
        if (!link) return;
        const { token, secret } = link;
        const r = await api.linkJoin(token);
        link = null;
        acct.joining = false;
        await startFresh();
        await unlocked(await openLinkBox(r.linkBox as LinkBox, secret));
    });
export function notJoining() {
    link = null;
    acct.joining = false;
}

// ── your passkey: one, and only ever replaced ──
/** a new passkey on this device takes the place of every other one (lost, or you're moving to a new phone) */
export const replacePasskey = () =>
    act("Setting up your new passkey…", async () => {
        const key = await thisDevicesKey(),
            o = await confirmed(() => api.passkeyOptions());
        const { response, got } = await createPasskey(o.options).catch(e => {
            // this device can already use your passkey (it synced here): nothing to replace
            if ((e as Error)?.name === "InvalidStateError")
                throw new Error("This device already has your passkey: nothing to replace.");
            throw e;
        });
        await api.passkeyVerify(o.id, response);
        let secret = got;
        if (got.can && !got.secret) secret = await confirmWithPasskey(me().rp_id, [got.id]).catch(() => got);
        await giveBox(secret, key);
        acct.me = await api.me();
        for (const p of me().passkeys) if (p.id !== response.id) await confirmed(() => api.passkeyRemove(p.id));
        acct.me = await api.me();
        acct.newPasskey = false;
        recoveredWith = "";
        tidyPasswordManager();
        acct.note = "Your new passkey is the one now; the old one no longer works.";
    });

/** you have more than one passkey (from before it was one per account): keep this one, remove the rest */
export const keepOnlyPasskey = (id: string) =>
    act("Removing the others…", async () => {
        for (const p of me().passkeys) if (p.id !== id) await confirmed(() => api.passkeyRemove(p.id));
        acct.me = await api.me();
        tidyPasswordManager();
        acct.note = "Done: one passkey. Your password manager may take a moment to drop the others.";
    });

/** a passkey that only signs you in gets a box, so it unlocks your library on a new device too */
export const letPasskeyUnlock = () =>
    act("Waiting for your passkey…", async () => {
        const key = await thisDevicesKey();
        const got = await confirmWithPasskey(
            me().rp_id,
            me()
                .passkeys.filter(p => !p.box)
                .map(p => p.id)
        );
        if (!(await giveBox(got, key)))
            throw new Error("That passkey can't unlock your library in this browser; it still signs you in.");
        acct.me = await api.me();
        acct.note = "Done: that passkey unlocks your library now.";
    });

/** a new recovery code; the old one (or an older account's passphrase) stops working */
export const replaceRecoveryCode = () =>
    act("Making a new recovery code…", async () => {
        const { code, box, auth } = await makeRecoveryCode(await thisDevicesKey());
        await confirmed(() => api.putKey(box, auth));
        acct.me = await api.me();
        acct.code = code;
    });

// ── syncing, devices, history ──
export const syncHere = () =>
    act("Syncing…", async () => {
        acct.note = said(await syncNow());
        acct.me = await api.me();
    });

export const revoke = (id?: string) =>
    act("Signing out…", async () => {
        await api.revoke(id ? { id } : { others: true });
        acct.me = await api.me();
    });

export async function history(): Promise<History> {
    const [audit, versions] = await Promise.all([api.audit(), api.versions()]);
    return { audit, versions };
}

export const restore = (v: number) =>
    act("Restoring…", async () => {
        const key = await keptKey();
        if (!key) return;
        const parts = await openData(key, await api.getVersion(v));
        await applyParts(parts, Object.fromEntries(Object.keys(parts).map(k => [k, true])), "replace", APP_V);
        render();
        saveState({ hash: "" });
        acct.note = `Back to version ${v}. ` + said(await syncNow());
    });

// ── leaving ──
async function forgetHere() {
    recoveredWith = "";
    await keepKey(null);
    forget();
    fresh = null;
    acct.me = null;
    acct.qr = null;
    acct.view = "out";
}
export const signOut = () =>
    act("Signing out…", async () => {
        await api.logout().catch(() => {});
        await forgetHere();
    });

/** sign out, and leave nothing of yours in this browser: for a computer that isn't yours. Your library stays in your
 * account (and on your other devices); this browser goes back to a fresh start */
export const signOutAndClear = () =>
    act("Signing out and clearing this browser…", async () => {
        await api.logout().catch(() => {});
        await clearThisBrowser();
        location.reload();
    });
async function clearThisBrowser() {
    storage = "none"; // the app saves when a page closes (core.js flushSave): not any more
    const known = ["stacks", "ul-account"]; // your library and settings (core.js), and the kept sync key (crypto.ts)
    const all = (await indexedDB.databases?.().catch(() => [])) || [];
    for (const name of new Set([...known, ...all.map(d => d.name || "").filter(Boolean)]))
        await new Promise(done => {
            // a database the page still has open is deleted as it closes (the reload below): don't wait for that
            const r = indexedDB.deleteDatabase(name);
            r.onsuccess = r.onerror = r.onblocked = () => done(null);
        });
    localStorage.clear();
    sessionStorage.clear();
}

export const deleteAccount = (typed: string) =>
    act("Deleting…", async () => {
        if (typed !== "DELETE") throw new Error("Type DELETE first.");
        await confirmed(() => api.deleteAccount());
        await forgetHere();
        acct.note = "Your account and everything in the cloud are gone. Your library here is untouched.";
    });
