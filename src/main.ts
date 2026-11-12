// src/main.ts
// ─────────────────────────────────────────────────────────────────
//  Main: where the app starts
//
//  The app's own modules start first, in their fixed order (features/core/start.ts). This module adds what sits around
//  them: bundled fonts (so it looks right offline), offline install and updates, the pages and dialogs Svelte draws,
//  and asks the browser to keep the data.
// ─────────────────────────────────────────────────────────────────

import "./features/core/start";
import { addBundledFonts } from "./features/look/fonts";
import "./features/core/install.svelte";
import { mount } from "svelte";
import { hasPage, hidePage, showPage } from "./features/core/pages";
import { myBackdrops } from "./features/backdrops/backdrop";
import { startBackdrops } from "./features/backdrops/backdrop-layer";
import { registerSW } from "virtual:pwa-register";
import UpdateToast from "./features/update/UpdateToast.svelte";
import { startAuto, state as syncState } from "./features/account/sync";
import { takeLink } from "./features/account/account-state.svelte";
import { nudgeToSync } from "./features/account/nudge";
import { DONATE_URL, markDirty, meta, safeUrl, ui } from "./features/core/core";
import { renderMain, useSveltePages, useSvelteShell } from "./features/core/shell";
import TopBar from "./features/core/shell/TopBar.svelte";
import Side from "./features/core/shell/Side.svelte";
import Search from "./features/core/shell/Search.svelte";
import SpineTip from "./features/library/tiles/SpineTip.svelte";
import DonateLink from "./features/settings/parts/DonateLink.svelte";
import { closeModal, renderOverlay, useSvelteDialogs } from "./features/core/modals";
import { dropDialog, drawDialog, hasDialog, isDrawn } from "./features/core/dialogs";
import { drawMenu, dropMenu, menuCatchUp, menuShown } from "./features/core/menus";
import { useSvelteMenus } from "./features/core/keys";
import { goSettings } from "./features/core/navigation";
import { isBooted, joinOnStart } from "./features/core/events";
import { builtinOn } from "./features/extensions/builtins";
import { useSveltePlayer } from "./features/watch-read/watch";
import { useSvelteReader } from "./features/watch-read/read";
import { playerSurface, readerSurface } from "./features/watch-read/surfaces";

addBundledFonts();

// The library lives in this browser only: ask it not to clear it when space runs low.
navigator.storage?.persist?.().catch(() => {});

// Hosted: works offline after the first visit, and says when a new version is ready.
// The one-file build (opened from disk) and `pnpm dev` have nothing to install, so this does nothing there.
if (import.meta.env.PROD && location.protocol.startsWith("http"))
    mount(UpdateToast, { target: document.body, props: { register: registerSW } });

// Backdrops you made (Settings › Backdrops): drawn behind the page when a theme uses one. Nothing runs otherwise. What's kept
// is checked once here, and again whenever backdrops arrive from a backup or another device (applyParts).
if (Array.isArray(meta.settings.backdrops)) {
    const clean = myBackdrops(meta.settings.backdrops);
    if (JSON.stringify(clean) !== JSON.stringify(meta.settings.backdrops)) {
        meta.settings.backdrops = clean;
        markDirty();
    }
}
startBackdrops();
// The shell (the top bar, the sidebar, the search box: core/shell/): each is mounted where it goes the first time the
// page code draws it, and draws again when asked
useSvelteShell({
    top: target => mount(TopBar, { target }),
    side: target => mount(Side, { target }),
    search: target => {
        target.dataset.svelte = "";
        mount(Search, { target });
    },
});
// …and the card that shows over a spine you point at
mount(SpineTip, { target: document.body });
// …and the small support link in the corner of every page
if (safeUrl(DONATE_URL)) {
    const foot = document.createElement("div");
    foot.id = "donatefoot";
    document.body.append(foot);
    mount(DonateLink, { target: foot, props: { cls: "donatefoot" } });
}
// The pages Svelte draws (a mode's page with its tabs, Settings, the guide: core/pages.ts): the page code asks for one
// when you open it, and lets it go when you leave. If the app opened on one before this ran, it's drawn now.
useSveltePages({ show: showPage, hide: hidePage });
if (hasPage(ui.page)) renderMain();
// …and the dialogs it draws (the item card: core/dialogs.ts), the same way
useSvelteDialogs({ has: hasDialog, isDrawn, draw: drawDialog, drop: dropDialog });
if (ui.modal && hasDialog(ui.modal.kind)) renderOverlay();
// …and the right-click menus (core/menus.ts)
useSvelteMenus({ draw: drawMenu, catchUp: menuCatchUp, shown: menuShown, drop: dropMenu });
useSveltePlayer(playerSurface);
useSvelteReader(readerSurface);

// Opened by scanning an "Sign in on another device" code: Account & sync offers to sign this device in. The app's own start-up does the
// rest when it finishes (events.ts, joinOnStart); if it already has, it happens here.
if (takeLink()) {
    joinOnStart();
    if (isBooted()) {
        if (ui.modal) closeModal();
        goSettings("account");
    }
}
// not signed in yet, on the website, with a few things added: once, suggest putting the library on their phone too
if (location.protocol.startsWith("http") && !syncState().on) nudgeToSync();
if (location.protocol.startsWith("http") && syncState().on && builtinOn("account")) startAuto();
