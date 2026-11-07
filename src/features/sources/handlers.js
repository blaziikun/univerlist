// src/features/sources/handlers.js
// ─────────────────────────────────────────────────────────────────
//  Sources: what its buttons do
//
//  AniList sync, airing times, and the background lookups you can pause. core/actions.js calls sourcesClick() for every
//  button with a data-act; it returns true when the button is one of these. e is the click, t the button, k and id its
//  data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function sourcesClick(e, t, act, k, id, m) {
    switch (act) {
        case "al-unlink":
            meta.settings.anilistUser = "";
            meta.settings.autoSync = false;
            meta.profile = { ...meta.profile, anilist: null };
            markDirty();
            renderMain();
            toast("Unlinked. Everything AniList brought in stays.");
            return true;
        case "al-open":
            openModal("anilist");
            return true;
        case "al-sync": {
            const u = $("#al-user") || $("#set-al");
            if (u && u.value.trim()) meta.settings.anilistUser = u.value.trim();
            markDirty();
            if (!m || m.kind !== "anilist") openModal("anilist");
            runAniListSync();
            return true;
        }
        case "al-stop":
            if (alSync.ctl) alSync.ctl.abort();
            return true;
        case "airing-refresh":
            toast("Checking for new episodes…");
            await refreshAiring(true);
            toast("Up to date");
            return true;
        case "scores-stop":
            scoreQ.stop();
            return true;
        case "auto-pause":
            auto.paused = true;
            renderAutoStatus();
            return true;
        case "auto-resume":
            auto.paused = false;
            auto.offline = false;
            autoCovers();
            return true;
    }
    return false;
}
