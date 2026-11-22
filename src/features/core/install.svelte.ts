// src/features/core/install.svelte.ts
// ─────────────────────────────────────────────────────────────────
//  Install: the browser's offer to install the site as an app
//
//  Chrome, Edge and Android make the offer once, soon after the page opens, so it's kept here until Settings › General
//  asks for it. Safari and Firefox never make one: Settings says how to do it from their menus instead.
// ─────────────────────────────────────────────────────────────────

type InstallOffer = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export const install = $state<{ offer: InstallOffer | null; installed: boolean }>({
    offer: null,
    installed: matchMedia("(display-mode: standalone)").matches,
});

// the browser's own install button (in the address bar) stays: this only keeps the offer for ours
addEventListener("beforeinstallprompt", e => (install.offer = e as InstallOffer));
addEventListener("appinstalled", () => {
    install.offer = null;
    install.installed = true;
});

export async function installNow(): Promise<void> {
    const offer = install.offer;
    if (!offer) return;
    await offer.prompt();
    if ((await offer.userChoice).outcome === "accepted") install.offer = null;
}
