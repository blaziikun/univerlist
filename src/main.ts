// src/main.ts
// ─────────────────────────────────────────────────────────────────
//  Main: what starts once the classic scripts are running
//
//  The app's classic scripts (the .js files in src/features, joined in order.json's order) start first. This module
//  adds what sits around them: bundled fonts (so it looks right offline), offline install and updates, and asks the
//  browser to keep the data.
// ─────────────────────────────────────────────────────────────────

import { addBundledFonts } from "./features/look/fonts";
import "./features/core/install.svelte";
import { mount } from "svelte";
import { hasPage, hidePage, showPage } from "./features/core/pages";
import { myBackdrops } from "./features/backdrops/backdrop";
import { startBackdrops } from "./features/backdrops/backdrop-layer";
import { registerSW } from "virtual:pwa-register";
import UpdateToast from "./features/update/UpdateToast.svelte";
import { startAuto, state as syncState, syncNow } from "./features/account/sync";
import { takeLink } from "./features/account/account-state.svelte";
import { nudgeToSync } from "./features/account/nudge";
import { albumDetails, searchAlbums } from "./features/music/musicbrainz";

addBundledFonts();

// The library lives in this browser only: ask it not to clear it when space runs low.
navigator.storage?.persist?.().catch(() => {});

// Hosted: works offline after the first visit, and says when a new version is ready.
// The one-file build (opened from disk) and `pnpm dev` have nothing to install, so this does nothing there.
if (import.meta.env.PROD && location.protocol.startsWith("http"))
    mount(UpdateToast, { target: document.body, props: { register: registerSW } });

// Backdrops you made (Settings › Backdrops): drawn behind the page when a theme uses one. Nothing runs otherwise. What's kept
// is checked once here, and again whenever backdrops arrive from a backup or another device (applyParts).
window.ulBackdrops = { clean: myBackdrops };
if (Array.isArray(meta.settings.backdrops)) {
    const clean = myBackdrops(meta.settings.backdrops);
    if (JSON.stringify(clean) !== JSON.stringify(meta.settings.backdrops)) {
        meta.settings.backdrops = clean;
        markDirty();
    }
}
startBackdrops();
// The pages Svelte draws (Settings, the guide: core/pages.ts): the page code asks for one when you open it, and lets it
// go when you leave. If the app opened on one before this ran, it's drawn now.
window.ulPages = { show: showPage, hide: hidePage };
if (typeof ui !== "undefined" && hasPage(ui.page)) renderMain();
window.ulSync = { now: () => syncNow().then(() => {}) };
// Music: the classic scripts' search and details reach MusicBrainz through this (sources.js, search.js)
window.ulMusic = { searchAlbums, albumDetails };
// Adaptive streams (.m3u8, from Jellyfin or Plex) outside Safari: hls.js, a part of this site's own files, loaded the
// first time one plays (watch.js, attachHLS). It's never fetched from anywhere else, so the site's script rule holds
window.ulHls = () => import("hls.js").then(m => m.default);

// Opened by scanning an "Sign in on another device" code: Account & sync offers to sign this device in. The app's own start-up does the
// rest when it finishes (events.js, ulJoining); if it already has, it happens here.
if (takeLink()) {
    window.ulJoining = true;
    if (window.ulBooted) {
        if (ui.modal) closeModal();
        goSettings("account");
    }
}
// not signed in yet, on the website, with a few things added: once, suggest putting the library on their phone too
if (location.protocol.startsWith("http") && !syncState().on) nudgeToSync();
if (location.protocol.startsWith("http") && syncState().on && typeof builtinOn === "function" && builtinOn("account"))
    startAuto();
