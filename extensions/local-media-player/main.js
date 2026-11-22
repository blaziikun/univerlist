// extensions/local-media-player/main.js
// ─────────────────────────────────────────────────────────────────
//  Your own video files: asks the companion on your computer for the file of each episode
//
//  The app calls "watch.sources" whenever an episode or film opens, with:
//    { title, seasonTitle, medium, year, ids, season, seasons, episode, film }
//  and plays whatever comes back: [{ name, url, how }]. Nothing else of yours is visible here.
// ─────────────────────────────────────────────────────────────────
univerlist.provide("watch.sources", async ctx => {
    const s = await univerlist.settings();
    const q = new URLSearchParams({
        title: ctx.title,
        alt: ctx.seasonTitle || "",
        season: String(ctx.season || 1),
        episode: ctx.episode == null ? "" : String(ctx.episode),
        film: ctx.film ? "1" : "",
        year: ctx.year || "",
        token: s.token || "",
    });
    try {
        const r = await univerlist.companion.get("/find?" + q);
        return r.sources || [];
    } catch (_) {
        return [];
    } // companion not running: nothing to add
});
