// src/features/watch-read/player/view.ts
// ─────────────────────────────────────────────────────────────────
//  What the player shows, worked out for its components (player/*.svelte)
//
//  The player (#cinema) draws what these work out from W.player, your player settings (PS) and how you've laid out
//  the page (WP): the top bar, the stage, the controls, the blocks beside or under it, and its panels. They're asked
//  for when the older code asks the player to draw (renderPlayer, playerRedraw and the smaller asks in watch.ts),
//  never on a timer or while it plays.
// ─────────────────────────────────────────────────────────────────

import { cleanTitle, meta, numOf } from "../../core/core";
import type { PlayerFrame, WatchPlayer, WatchSeason, WatchSource } from "../../core/model";
import { isOwnSource, NOT_OWN_SOURCE } from "../own-sources";
import { ssList } from "../series";
import { LIBS } from "../medialibs";
import { SUB_LANGS } from "../stream";
import { epAbout, epName } from "../episodes";
import { epWatched, loadPos, posKey, PS, seasonItem, srvDesc, W, WP, WP_NAMES } from "../watch";

/** the address that plays a source: a file's own blob: address, a converted stream from where you are, or its link */
function playingURL(p: WatchPlayer): string {
    const src: WatchSource = p.srcs[p.k] || {},
        refused = !!src.url && !src.file && !isOwnSource(src); // the last check, right before anything plays (own-sources.ts)
    if (refused) return "";
    if (src.file) return (src.obj = src.obj || URL.createObjectURL(src.file));
    if (src.how === "converted" && p.offset && src.url)
        return src.url + (src.url.includes("?") ? "&" : "?") + "t=" + p.offset;
    return src.url || "";
}
const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/;
const isHLS = (u: string | undefined) => /\.m3u8(\?|$)/i.test(u || "");
/** the speeds the player offers */
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** how a new video is set up (renderPlayer): its address, whether the player's own controls are on it (everything but
 *  YouTube's own player), whether it starts by itself */
export function frameOf(p: WatchPlayer): PlayerFrame {
    const o = PS(),
        src: WatchSource = p.srcs[p.k] || {},
        url = playingURL(p),
        yt = url ? YT.exec(url) : null;
    return {
        url,
        yt: yt ? yt[1] : "",
        custom: !!(url && !yt),
        // waiting until it won't stop before it starts (a source that says how much has arrived)
        autoplay: !(src.info && o.startMode === "smooth" && p.hold !== false),
    };
}
/** everything the player's frame shows: what plays, the layout, the words, which parts are there */
export function playerView() {
    const p = W.player;
    if (!p) return null;
    const o = PS(),
        f = p.frame || frameOf(p),
        si = p.si ?? 0,
        hasNext =
            (p.e != null && W.seasons.length && (W.seasons[si].eps || []).some(x => x.e === (p.e ?? 0) + 1)) ||
            !!W.seasons[si + 1],
        sh = W.show,
        bItem = seasonItem(p.listSi ?? p.si),
        name = p.film ? "" : epName(si, p.e) || p.epTitle || "",
        epTag =
            p.e != null && !p.film
                ? (W.seasons.length > 1 ? `${W.seasons[si]?.label || "S" + (si + 1)} · ` : "") + `Episode ${p.e}`
                : "";
    return {
        p,
        o,
        f,
        src: p.srcs[p.k] || {},
        url: f.url,
        hls: isHLS(f.url),
        hasNext: !!hasNext && p.e != null,
        cinema: (o.layout || "docked") === "cinema",
        showName: cleanTitle(p.show || p.title || ""),
        epTag,
        epName: name,
        epLine: epTag + (name ? " — " + name : ""),
        card: bItem ? bItem.id : "",
        canAdd: !bItem && !!sh?.title,
    };
}
export type PlayerView = NonNullable<ReturnType<typeof playerView>>;

/** the one server button at the top: how many there are, whether one's playing, whether more are still being looked for */
export function srvButtonView(p: WatchPlayer) {
    const n = (p.srcs || []).length;
    return {
        open: !!p.srcOpen,
        n,
        looking: (p.looking || 0) > 0,
        title: n
            ? `Servers: ${n} for this ${p.film ? "film" : "episode"}, playing ${srvDesc(p.srcs[p.k] || {})}`
            : "Servers",
    };
}
/** the list of servers for this episode (SourcesPanel.svelte), with what your media servers said about this show
 *  ("On Living room (6 episodes)", or why not) and a way to pick the right title on them by hand */
export function sourcesView(p: WatchPlayer) {
    const bad = p.failed || [];
    return {
        what: p.film ? "film" : "episode",
        looking: (p.looking || 0) > 0,
        lib:
            LIBS().length && W.libNote
                ? { note: W.libNote, miss: W.libMiss, pick: W.libMiss ? "Pick it…" : "Not the right one?" }
                : null,
        rows: p.srcs.map((x, i) => ({
            i,
            on: i === p.k,
            bad: bad.includes(i),
            name: x.name || "",
            how: [
                x.how === "adaptive"
                    ? "Adaptive stream"
                    : x.how === "converted"
                      ? "Converted for this browser"
                      : x.how === "original"
                        ? "Original file"
                        : x.file
                          ? "From this computer"
                          : "Link",
                x.owner ? "from " + x.owner : "",
            ]
                .filter(Boolean)
                .join(" · "),
        })),
    };
}
/** nothing to play yet (CinStage.svelte): the note, still looking, and the ways to add it */
export function emptyView(p: WatchPlayer) {
    const cur = p.srcs[p.k],
        n = ssList().length;
    return {
        loading: !!p.loading,
        note: cur && cur.url && !isOwnSource(cur) ? NOT_OWN_SOURCE : W.libNote || "Nothing to play yet.",
        looking: (p.looking || 0) > 0,
        film: !!p.film,
        s: String(p.si),
        k: String(p.e ?? 1),
        servers: "Servers for this show" + (n ? " · " + n : ""),
    };
}
/** the subtitles' panel (SubsPanel.svelte): Off, the tracks that came with this source, and a file you loaded */
export function ccView(p: WatchPlayer) {
    return { list: p.subList || [], cur: p.subPick || "", file: !!p.subs };
}

/** the blocks under the player and beside it (CinBlocks.svelte): the seasons with their episodes, and the description */
export function blocksView(p: WatchPlayer) {
    const wp = WP(),
        sh = W.show,
        si = p.si ?? 0,
        li = p.listSi ?? si,
        S: WatchSeason = W.seasons[li] || { n: 1, label: "", eps: [] },
        P = loadPos(),
        eps = S.eps || [],
        name = epName(si, p.e) || p.epTitle || "",
        about = epAbout(si, p.e);
    const parts = {
        about:
            sh?.about || about
                ? {
                      ep: !p.film && p.e != null ? `Episode ${p.e}` + (name ? `: ${name}` : "") : "",
                      epAbout: p.film ? "" : about,
                      show: (sh?.about || "").slice(0, 900),
                  }
                : null,
        eps:
            p.film || sh?.medium === "film" || p.single
                ? null
                : {
                      // the header: the episode playing, by name, and where it is in its season (episode 3 of 12)
                      name,
                      at: li === si && p.e != null ? `${p.e}/${eps.length || S.total || "?"}` : `${eps.length || "?"}`,
                      seasons:
                          W.seasons.length > 1
                              ? W.seasons.map((x, i) => ({ i, title: x.title || x.label, on: i === li }))
                              : null,
                      kind: wp.eps,
                      loading: !!S.loading,
                      li,
                      list: eps.map(e => {
                          const seen = epWatched(li, e.e),
                              pos = numOf(P[posKey(li, e.e)]);
                          return {
                              e: e.e,
                              seen,
                              on: li === si && e.e === p.e,
                              part: !!pos && !seen,
                              img: (wp.thumbs && (e.image || W.libImg.get(li + ":" + e.e))) || "",
                              tip: e.title && !/^Episode \d+$/i.test(e.title) ? `${e.e}. ${e.title}` : "Episode " + e.e,
                              title: e.title && !/^Episode \d+$/i.test(e.title) ? e.title : "Episode " + e.e,
                              about: wp.desc && e.about ? e.about.replace(/<[^>]+>/g, "").slice(0, 150) : "",
                          };
                      }),
                  },
    };
    const at = (where: string) =>
        wp.order.filter(
            (k): k is "about" | "eps" => (k === "about" || k === "eps") && wp.place[k] === where && !!parts[k]
        );
    return { parts, main: at("main"), side: at("side"), left: at("left") };
}
export type BlocksView = ReturnType<typeof blocksView>;

/** the page's own settings (PageOpts.svelte): the episodes as numbers or detailed rows, and where each block goes */
export function pageOptsView() {
    const p = WP();
    return {
        eps: p.eps,
        thumbs: p.thumbs,
        desc: p.desc,
        blocks: p.order.map((k, i) => ({
            k,
            name: WP_NAMES[k] || k,
            place: p.place[k] || "main",
            first: i === 0,
            last: i === p.order.length - 1,
        })),
        sequels: meta.settings.seasonsMode === "separate" ? "separate" : "together",
    };
}
/** the subtitle languages to pick from (SubsPanel.svelte) */
export const SUB_CHOICES: [string, string][] = [["off", "Off unless I pick them"], ...SUB_LANGS];
