// src/features/watch-read/player/view.ts
// ─────────────────────────────────────────────────────────────────
//  What the player shows, worked out for its components (player/*.svelte)
//
//  The player (#cinema) draws what these work out from W.player, your player settings (PS) and how you've arranged
//  the page (WP): the header or top bar, the stage, each button under or on the video, the blocks beside or under it,
//  and its panels. They're asked for when the older code asks the player to draw (renderPlayer, playerRedraw and the
//  smaller asks in watch.ts), never on a timer or while it plays.
// ─────────────────────────────────────────────────────────────────

import { cleanTitle, meta, numOf } from "../../core/core";
import type { PlayerFrame, WatchPlayer, WatchSeason, WatchSource } from "../../core/model";
import { isOwnSource, NOT_OWN_SOURCE } from "../own-sources";
import { LOOK, spotOf, customControls } from "../player";
import { ssList } from "../series";
import { SUB_LANGS } from "../stream";
import { epWatched, loadPos, posKey, PS, seasonItem, srvDesc, toolName, W, WP, WP_NAMES } from "../watch";

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

/** how a new video is set up (renderPlayer): its address, the layout, whose controls, whether it starts by itself */
export function frameOf(p: WatchPlayer): PlayerFrame {
    const o = PS(),
        src: WatchSource = p.srcs[p.k] || {},
        url = playingURL(p),
        yt = url ? YT.exec(url) : null;
    return {
        url,
        yt: yt ? yt[1] : "",
        lay: !url ? "docked" : o.layout || "docked",
        custom: !!(customControls() && url && !yt),
        controls: !customControls(),
        // waiting until it won't stop before it starts (a source that says how much has arrived)
        autoplay: !(src.info && o.startMode === "smooth" && p.hold !== false),
    };
}
/** everything the player's frame shows: what plays, the layout, the buttons' words, which parts are there */
export function playerView() {
    const p = W.player;
    if (!p) return null;
    const o = PS(),
        wp = WP(),
        f = p.frame || frameOf(p),
        si = p.si ?? 0,
        hasNext =
            (p.e != null && W.seasons.length && (W.seasons[si].eps || []).some(x => x.e === (p.e ?? 0) + 1)) ||
            !!W.seasons[si + 1],
        sh = W.show,
        bItem = seasonItem(p.listSi ?? p.si),
        epTag =
            p.e != null && !p.film
                ? (W.seasons.length > 1 ? `${W.seasons[si]?.label || "S" + (si + 1)} · ` : "") + `Episode ${p.e}`
                : "";
    return {
        p,
        o,
        wp,
        f,
        src: p.srcs[p.k] || {},
        url: f.url,
        hls: isHLS(f.url),
        hasNext: !!hasNext,
        showName: cleanTitle(p.show || p.title || ""),
        epTag,
        epLine: epTag + (p.epTitle ? " — " + p.epTitle : ""),
        card: bItem ? bItem.id : "",
        canAdd: !bItem && !!sh?.title,
    };
}
export type PlayerView = NonNullable<ReturnType<typeof playerView>>;

/** the server strip at the top (ServerStrip.svelte): an icon that lists them, Server 1 2 3…, still looking, + */
export function srvStripView(p: WatchPlayer) {
    const bad = p.failed || [];
    return {
        open: !!p.srcOpen,
        list: (p.srcs || []).map((x, i) => ({
            i,
            on: i === p.k,
            bad: bad.includes(i),
            title: `Server ${i + 1}: ${srvDesc(x)}${bad.includes(i) ? " (didn't play)" : ""}`,
        })),
        looking: (p.looking || 0) > 0,
    };
}
/** the list of servers for this episode (SourcesPanel.svelte) */
export function sourcesView(p: WatchPlayer) {
    const bad = p.failed || [];
    return {
        what: p.film ? "film" : "episode",
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
/** the subtitles that came with this source (Tool.svelte's picker): Off, then each */
export const subPickView = (p: WatchPlayer) => ({ list: p.subList || [], cur: p.subPick || "" });

/** the blocks beside the player and under it (CinBlocks.svelte): description, seasons, episodes, in your order */
export function blocksView(p: WatchPlayer) {
    const wp = WP(),
        sh = W.show,
        li = p.listSi ?? p.si ?? 0,
        S: WatchSeason = W.seasons[li] || { n: 1, label: "", eps: [] },
        P = loadPos(),
        eps = S.eps || [];
    const parts = {
        about: wp.about && sh?.about ? sh.about.slice(0, 700) : "",
        seasons:
            W.seasons.length < 2
                ? null
                : {
                      select: sh?.medium === "anime" || !!sh?.groupId,
                      li,
                      list: W.seasons.map((x, i) => ({ i, title: x.title || x.label, label: x.label, on: i === li })),
                  },
        eps:
            p.film || sh?.medium === "film"
                ? null
                : {
                      count: `${eps.filter(e => epWatched(li, e.e)).length}/${eps.length || "?"}`,
                      kind: wp.eps,
                      loading: !!S.loading,
                      li,
                      list: eps.map(e => {
                          const seen = epWatched(li, e.e),
                              pos = numOf(P[posKey(li, e.e)]);
                          return {
                              e: e.e,
                              seen,
                              on: li === p.si && e.e === p.e,
                              part: !!pos && !seen,
                              img: (wp.thumbs && (e.image || W.libImg.get(li + ":" + e.e))) || "",
                              tip: e.title || "Episode " + e.e,
                              title: e.title && !/^Episode \d+$/i.test(e.title) ? e.title : "Episode " + e.e,
                              about: wp.desc && e.about ? e.about.replace(/<[^>]+>/g, "").slice(0, 150) : "",
                          };
                      }),
                  },
    };
    const at = (where: string) =>
        wp.order.filter(
            (k): k is "about" | "seasons" | "eps" =>
                (k !== "about" || wp.about) &&
                wp.place[k] === where &&
                (k === "about" || k === "seasons" || k === "eps") &&
                !!parts[k]
        );
    return { parts, side: at("side"), main: at("main") };
}
export type BlocksView = ReturnType<typeof blocksView>;

/** "Customise this page" (PageOpts.svelte): the episode list, the blocks, sequels, and every button's place */
export function pageOptsView() {
    const p = WP();
    return {
        eps: p.eps,
        thumbs: p.thumbs,
        desc: p.desc,
        blocks: p.order.map((k, i) => ({
            k,
            name: WP_NAMES[k] || k,
            place: k === "about" && !p.about ? "off" : p.place[k],
            first: i === 0,
            last: i === p.order.length - 1,
        })),
        sequels: meta.settings.seasonsMode === "separate" ? "separate" : "together",
        tools: p.tools.map((k, i) => ({
            k,
            name: toolName(k) || "",
            spot: spotOf(p, k),
            first: i === 0,
            last: i === p.tools.length - 1,
        })),
    };
}
/** the edit bar (EditBar.svelte): the look's sliders, and the buttons hidden */
export function editView() {
    const wp = WP();
    return {
        look: LOOK(),
        hidden: wp.tools.filter(k => spotOf(wp, k) === "off").map(k => ({ k, name: toolName(k) || k })),
    };
}
/** the subtitle languages to pick from in the player's settings (PlayerOpts.svelte) */
export const SUB_CHOICES: [string, string][] = [["off", "Off unless I pick them"], ...SUB_LANGS];
/** whether a button has anything to show in the player as it is (while arranging, one that hasn't shows its name) */
export function toolHas(v: PlayerView, k: string): boolean {
    const p = v.p,
        url = !!v.url;
    switch (k) {
        case "prev":
            return p.e != null && !p.film;
        case "back":
        case "fwd":
        case "subs":
        case "speed":
        case "pip":
        case "full":
        case "play":
        case "time":
        case "vol":
            return url;
        case "skip":
            return url && !!v.o.skip;
        case "ep":
        case "gap":
        case "cinema":
        case "lights":
        case "settings":
            return true;
        case "mark":
            return p.e != null;
        case "next":
            return p.e != null && v.hasNext;
    }
    return false;
}
/** the buttons in one place: on the video, under it, or (with the browser's own controls) all of them in the bar */
export function toolsAt(v: PlayerView, where: "video" | "under" | "bar"): string[] {
    const wp = v.wp;
    return where === "bar" ? wp.tools.filter(k => !wp.off.includes(k)) : wp.tools.filter(k => spotOf(wp, k) === where);
}
