// src/features/account/nudge.ts
// ─────────────────────────────────────────────────────────────────
//  Account: a nudge, once, to put the library on your other devices too
//
//  Someone who has added a few things and isn't signed in gets one small toast offering to sync. Said once per browser,
//  and never again once they've signed in or dismissed it.
// ─────────────────────────────────────────────────────────────────

import { changeListeners, items, toast } from "../core/core";
import { goSettings } from "../core/navigation";

const SAID = "ul-sync-nudged";

export function nudgeToSync() {
    try {
        if (localStorage.getItem(SAID)) return;
    } catch {
        return; // no storage here (private mode): better to say nothing than to say it every time
    }
    const listener = () => {
        if (items.size < 5) return;
        changeListeners.splice(changeListeners.indexOf(listener), 1);
        try {
            localStorage.setItem(SAID, "1");
        } catch {}
        setTimeout(
            () =>
                toast("Want your library on your phone too?", {
                    label: "Set up sync",
                    fn: () => goSettings("account"),
                }),
            1500
        );
    };
    changeListeners.push(listener);
}
