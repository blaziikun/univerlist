// src/features/library/profile-handlers.ts
// ─────────────────────────────────────────────────────────────────
//  Your profile and the private collection: what its buttons do
//
//  Name, picture and banner, and the private collection's passphrase. core/actions.ts calls profileClick() for every
//  button with a data-act; it returns true when the button is one of these. e is the click, t the button, k and id its
//  data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import { $, changeMeta, clone, modeById, PASSPHRASE_HINT, PASSPHRASE_MIN, toast, ui, vaultCreate } from "../core/core";
import { openModal, renderOverlay } from "../core/modals";
import { render } from "../core/navigation";
import { lockVault } from "./item-actions";
import { modeChanged } from "../settings/handlers";
import { setPendingCover } from "../core/events";
import type { ActEl } from "../core/core";
import type { Modal } from "../core/model";

// a field's value
const val = (sel: string) => $<HTMLInputElement | HTMLTextAreaElement>(sel)?.value ?? "";
// a button that waits while its work is done
const busy = (t: ActEl, label?: string) => {
    if (!(t instanceof HTMLButtonElement)) return;
    t.disabled = true;
    if (label) t.textContent = label;
};
const PROFILE_FIELDS = ["name", "avatar", "avatarData", "banner", "bannerData", "bio"];
export async function profileClick(
    _e: Event,
    t: ActEl,
    act: string,
    key: string | undefined,
    _id: string | undefined,
    m: Modal | null
): Promise<boolean> {
    const k = key ?? "";
    switch (act) {
        // private vault
        case "vault-create": {
            const a = val("#vp1"),
                b = val("#vp2");
            if (a.length < PASSPHRASE_MIN) {
                toast(PASSPHRASE_HINT);
                return true;
            }
            if (a !== b) {
                toast("Those don't match.");
                return true;
            }
            busy(t);
            await vaultCreate(a);
            toast("Private list created. It's unlocked until you lock it or close UniverList.");
            render();
            return true;
        }
        case "vault-lock":
            await lockVault();
            toast("Locked");
            return true;
        case "vault-pass":
            openModal("vaultpass");
            return true;
        // profile
        case "profile-edit": {
            const o = modeById(k || ui.mode),
                own = o.id !== "universal" && PROFILE_FIELDS.some(x => (o.profile || {})[x]);
            openModal("profile-edit", {
                origin: o.id,
                mode: own ? o.id : "universal",
                scope: own || o.id === "universal" ? (o.id === "universal" ? "all" : "mode") : "all",
            });
            return true;
        }
        case "pe-scope": {
            if (!m) return true;
            const origin = modeById(m.origin || m.mode || "");
            m.origin = origin.id;
            m.scope = k;
            if (k === "all") {
                const own = origin.profile || {};
                if (PROFILE_FIELDS.some(x => own[x])) {
                    const before = clone(own);
                    origin.profile = {};
                    modeChanged();
                    toast(`${origin.name} now uses your main profile`, {
                        label: "Undo",
                        fn: () => {
                            origin.profile = before;
                            modeChanged();
                            render();
                        },
                    });
                }
                m.mode = "universal";
            } else m.mode = origin.id;
            renderOverlay();
            render();
            return true;
        }
        case "pe-banner":
        case "pe-banner-clear": {
            const mode = modeById(m?.mode || ""),
                url = act === "pe-banner" ? t.dataset.url || "" : "";
            if (mode.id === "universal")
                changeMeta("Change banner", "profile", p => ({ ...p, banner: url, bannerData: "" }));
            else {
                mode.profile = { ...(mode.profile || {}), banner: url, bannerData: "", noBanner: undefined };
                modeChanged();
                renderOverlay();
            }
            return true;
        }
        case "pe-banner-upload":
            setPendingCover("banner");
            $("#file-cover")?.click();
            return true;
        case "pe-avatar-upload":
            setPendingCover("avatar");
            $("#file-cover")?.click();
            return true;
        case "pe-avatar-clear": {
            const mode = modeById(m?.mode || "");
            if (mode.id === "universal")
                changeMeta("Remove picture", "profile", p => ({
                    ...p,
                    avatarData: "",
                    avatar: "",
                    anilist: p.anilist ? { ...p.anilist, avatar: "" } : p.anilist,
                }));
            else {
                mode.profile = { ...(mode.profile || {}), avatarData: "", avatar: "" };
                modeChanged();
            }
            renderOverlay();
            return true;
        }
        case "pe-banner-none": {
            const mode = modeById(m?.mode || "");
            if (mode.id === "universal")
                changeMeta("Remove banner", "profile", p => ({
                    ...p,
                    banner: "",
                    bannerData: "",
                    anilist: p.anilist ? { ...p.anilist, banner: "" } : p.anilist,
                }));
            else {
                mode.profile = { ...(mode.profile || {}), banner: "", bannerData: "", noBanner: true };
                modeChanged();
            }
            renderOverlay();
            return true;
        }
    }
    return false;
}
