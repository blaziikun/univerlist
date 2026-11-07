// src/features/library/profile-handlers.js
// ─────────────────────────────────────────────────────────────────
//  Your profile and the private collection: what its buttons do
//
//  Name, picture and banner, and the private collection's passphrase. core/actions.js calls profileClick() for every
//  button with a data-act; it returns true when the button is one of these. e is the click, t the button, k and id its
//  data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function profileClick(e, t, act, k, id, m) {
    switch (act) {
        // private vault
        case "vault-create": {
            const a = $("#vp1").value,
                b = $("#vp2").value;
            if (a.length < PASSPHRASE_MIN) {
                toast(PASSPHRASE_HINT);
                return true;
            }
            if (a !== b) {
                toast("Those don't match.");
                return true;
            }
            t.disabled = true;
            await vaultCreate(a);
            toast("Private list created. It's unlocked until you lock it or close UniverList.");
            render();
            return true;
        }
        case "vault-unlock": {
            const p = $("#vpu").value;
            if (!p) return true;
            t.disabled = true;
            t.textContent = "Unlocking…";
            try {
                await vaultUnlock(p);
                ui.vaultErr = "";
                if (m && m.kind === "unlock") closeModal();
                ui.private = true;
                sweepSealed();
                resetSub();
                ui.page = "profile";
                render();
                toast(`Opened your private collection: ${plural(vault.ids.size, "entry", "entries")}`);
            } catch (err) {
                const msg = err.message === "wrong" ? "That passphrase didn't work." : "Couldn't unlock.";
                if (m && m.kind === "unlock") {
                    m.err = msg;
                    renderOverlay(true);
                } else {
                    ui.vaultErr = msg;
                    render();
                }
            }
            return true;
        }
        case "vault-lock":
            await lockVault();
            toast("Locked");
            return true;
        case "vault-pass":
            openModal("vaultpass");
            return true;
        case "vault-pass-save": {
            const a = $("#vn1").value,
                b = $("#vn2").value;
            if (a.length < PASSPHRASE_MIN) {
                toast(PASSPHRASE_HINT);
                return true;
            }
            if (a !== b) {
                toast("Those don't match.");
                return true;
            }
            await vaultChangePass(a);
            closeModal();
            toast("Passphrase changed");
            return true;
        }
        // profile
        case "profile-edit": {
            const o = modeById(k || ui.mode),
                own =
                    o.id !== "universal" &&
                    ["name", "avatar", "avatarData", "banner", "bannerData", "bio"].some(x => (o.profile || {})[x]);
            openModal("profile-edit", {
                origin: o.id,
                mode: own ? o.id : "universal",
                scope: own || o.id === "universal" ? (o.id === "universal" ? "all" : "mode") : "all",
            });
            return true;
        }
        case "pe-scope": {
            const origin = modeById(m.origin || m.mode);
            m.origin = origin.id;
            m.scope = k;
            if (k === "all") {
                const own = origin.profile || {};
                if (["name", "avatar", "avatarData", "banner", "bannerData", "bio"].some(x => own[x])) {
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
        case "pe-save": {
            const mode = modeById(m.mode),
                bio = $("#pe-bio").value.trim();
            const av = $("#pe-avatar").value.trim(),
                uni = mode.id === "universal";
            const nm = $("#pe-name").value.trim();
            if (uni) changeMeta("Edit profile", "profile", p => ({ ...p, name: nm, avatar: av, bio }));
            else {
                if (!meta.profile.name && nm) meta.profile.name = nm;
                mode.profile = {
                    ...(mode.profile || {}),
                    name: nm && nm !== meta.profile.name ? nm : "",
                    bio,
                    avatar: av,
                };
                modeChanged();
            }
            closeModal();
            render();
            return true;
        }
        case "pe-banner":
        case "pe-banner-link":
        case "pe-banner-clear": {
            const mode = modeById(m.mode),
                url =
                    act === "pe-banner"
                        ? t.dataset.url
                        : act === "pe-banner-link"
                          ? $("#pe-banner-url").value.trim()
                          : "";
            if (act === "pe-banner-link" && !/^https?:\/\//.test(url)) {
                toast("Paste a link that starts with https://");
                return true;
            }
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
            pendingCover = "banner";
            $("#file-cover").click();
            return true;
        case "pe-avatar-upload":
            pendingCover = "avatar";
            $("#file-cover").click();
            return true;
        case "pe-avatar-clear": {
            const mode = modeById(m.mode);
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
            const mode = modeById(m.mode);
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
