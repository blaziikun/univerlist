// src/features/account/sync.ts
// ─────────────────────────────────────────────────────────────────
//  Account: keeping this device and the cloud copy in step
//
//  Your library goes up as one encrypted blob; the server only sees its size and version number.
//    - nothing changed anywhere: nothing happens
//    - only this device changed: it goes up
//    - only the cloud copy changed (another device): it replaces what's here
//    - both changed: the two are merged (each side's additions and edits kept), and the result goes up
//  Deletions: this device remembers which entries the cloud copy had when they last matched ("the base"). When merging,
//  an entry in the base that one side no longer has was deleted there, so it's deleted from the result too, instead of
//  being brought back. (Deleted on one side while changed on the other: the deletion wins, and Undo brings it back.)
//
//  Saved first: the point where this device and the cloud copy last matched (its version, and "the base") is written
//  down only once the library itself is safely saved on this device (inSync below). Otherwise, closing the app a moment
//  after a sync brought entries in could leave them unsaved here while the sync point said they were, and the next sync
//  would take them for deleted here and delete them everywhere.
//
//  When: soon after you change something (a burst of edits is one sync, at most one every couple of minutes, which
//  keeps well inside the server's daily allowance), whenever you come back to the app, when you go online, when you
//  leave it, and every five minutes while it's open.
// ─────────────────────────────────────────────────────────────────

import { store } from "../core/store.svelte";
import { api, SyncError } from "./api";
import { keptKey, openData, sealData } from "./crypto";
import { APP_V, change, changeListeners, flushSave } from "../core/core";
import { render } from "../core/navigation";
import { builtinOn } from "../extensions/builtins";
import { applyParts, packParts } from "../import-export/packs";

const LS = "ul-sync",
    BASE = "ul-sync-base";
type State = { on?: boolean; version: number; hash: string; at: number; name?: string };
export const state = (): State => {
    try {
        return { version: 0, hash: "", at: 0, ...JSON.parse(localStorage.getItem(LS) || "{}") };
    } catch {
        return { version: 0, hash: "", at: 0 };
    }
};
export const saveState = (s: Partial<State>) => {
    try {
        localStorage.setItem(LS, JSON.stringify({ ...state(), ...s }));
    } catch {
        /* private mode */
    }
};
export const forget = () => {
    try {
        localStorage.removeItem(LS);
        localStorage.removeItem(BASE);
    } catch {
        /* nothing kept */
    }
};

// ── the base: which entries both sides had when they last matched ──
function base(): string[] {
    try {
        return JSON.parse(localStorage.getItem(BASE) || "[]");
    } catch {
        return [];
    }
}
function saveBase(library: Record<string, unknown>) {
    try {
        localStorage.setItem(BASE, JSON.stringify(Object.keys(library)));
    } catch {
        /* private mode: deletions just won't follow across */
    }
}

type Parts = Record<string, unknown> & { library: Record<string, unknown> };
/** this device's library, in the shape an import takes (one flat library, the Learning Centre whole) */
function local(): Parts {
    const p = packParts();
    return {
        ...p,
        library: Object.assign({}, ...Object.values(p.library || {})),
        academic: store.meta.courses ?? p.academic,
    };
}
/** JSON with every object's keys in order, so the same library always reads the same (entries come back from this
 * browser's storage in a different order than they were added) */
function steady(o: unknown): string {
    return JSON.stringify(o, (_, v) =>
        v && typeof v === "object" && !Array.isArray(v)
            ? Object.fromEntries(
                  Object.keys(v)
                      .sort()
                      .map(k => [k, (v as Record<string, unknown>)[k]])
              )
            : v
    );
}
async function hashOf(o: unknown): Promise<string> {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(steady(o)));
    return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}
async function bringIn(parts: Record<string, unknown>, how: "merge" | "replace") {
    const sel = Object.fromEntries(Object.keys(parts).map(k => [k, true]));
    await applyParts(parts, sel, how, APP_V);
    render();
}
/** merge the cloud copy into this device's, with deletions on either side kept deleted (see the top of this file) */
async function mergeIn(remote: Parts, mine: Parts) {
    const was = base(),
        there = remote.library || {},
        here = mine.library;
    const goneHere = was.filter(id => !(id in here) && id in there),
        goneThere = was.filter(id => !(id in there) && id in here);
    for (const id of goneHere) delete there[id]; // deleted on this device: don't bring it back
    await bringIn(remote, "merge");
    if (goneThere.length) change(`Removed on another device (${goneThere.length})`, goneThere, () => null);
}

/** this device and the cloud copy match at this version: save the library here first, then write that down */
async function inSync(version: number, mine: Parts, hash: string) {
    await flushSave();
    saveState({ version, hash, at: Date.now() });
    saveBase(mine.library);
}

let running: Promise<string> | null = null;
/** one sync, now. Returns what happened, in words. */
export function syncNow(): Promise<string> {
    return (running ||= (async () => {
        try {
            const key = await keptKey();
            if (!key) return "locked";
            for (let attempt = 0; attempt < 3; attempt++) {
                const st = state(),
                    me = await api.me();
                let mine = local(),
                    h = await hashOf(mine);
                // changed here since the last sync? (a device that has never synced counts as changed if it holds anything)
                let changedHere = st.version ? h !== st.hash : Object.keys(mine.library).length > 0;
                if (me.version > st.version) {
                    const remote = await api.getData();
                    if (remote.data) {
                        const parts = (await openData(key, remote.data)) as Parts;
                        // you may have changed something while that downloaded: look again, right before bringing it in, so a
                        // change made just now is merged with it instead of replaced by it
                        const latest = local();
                        if (!changedHere && (await hashOf(latest)) !== h) {
                            changedHere = true;
                            mine = latest;
                        }
                        if (changedHere) await mergeIn(parts, mine);
                        else await bringIn(parts, "replace");
                    }
                    mine = local();
                    h = await hashOf(mine);
                    if (!changedHere) {
                        await inSync(remote.version, mine, h);
                        return "brought in";
                    }
                    saveState({ version: remote.version }); // merged: what's here now goes up next
                } else if (!changedHere && me.version) return "in step";
                try {
                    const r = await api.putData(await sealData(key, mine), state().version);
                    await inSync(r.version, mine, h);
                    return "sent";
                } catch (e) {
                    if (e instanceof SyncError && e.status === 409) continue;
                    throw e;
                }
            }
            return "busy";
        } finally {
            running = null;
        }
    })());
}

// ── on its own ──
const SOON = 20e3, // after the last change of a burst
    GAP = 120e3, // at most this often because of changes (300 saves a day is the server's allowance)
    BACK = 30e3; // coming back to the app syncs if the last sync is older than this
let started = false,
    soon = 0,
    lastPush = 0;
export function startAuto() {
    if (started || !state().on) return;
    started = true;
    const go = () => {
        if (builtinOn("account") && state().on) syncNow().catch(() => {});
    };
    // you changed something: sync once things go quiet, and not more often than GAP
    changeListeners.push(part => {
        if (part === "ui") return;
        clearTimeout(soon);
        const wait = Math.max(SOON, lastPush + GAP - Date.now());
        soon = window.setTimeout(async () => {
            if (!builtinOn("account") || !state().on) return;
            // only an actual upload counts toward the spacing (bringing in another device's changes doesn't)
            if ((await syncNow().catch(() => "")) === "sent") lastPush = Date.now();
        }, wait);
    });
    setTimeout(go, 3000); // the app just opened
    // every 5 minutes while you're looking at it; a tab in the background asks nothing (coming back catches up)
    setInterval(() => {
        if (!document.hidden) go();
    }, 5 * 60e3);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden")
            go(); // leaving: send what's new
        else if (Date.now() - state().at > BACK) go(); // back again: bring in what changed elsewhere
    });
    addEventListener("online", go);
}
