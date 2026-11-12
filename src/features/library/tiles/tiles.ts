// src/features/library/tiles/tiles.ts
// ─────────────────────────────────────────────────────────────────
//  Tiles: what a cover, a library card, a cover tile and a spine show, worked out once
//
//  Each tile is a component (Cover, Card, CoverTile, Spine, FavTile, CharTile, ListCard beside this file), and every
//  screen draws them: what each shows is worked out here (coverLook…), once.
//  Spines are sized from the real object (cm), so a shelf looks like a shelf: books use their printed size when Open
//  Library knows it, games the case for the platform you play on.
// ─────────────────────────────────────────────────────────────────

import { cleanTitle, coverCache, firstAuthor, fmtScore, hash, MEDIA, meta, scaleOf, titleOf } from "../../core/core";
import { coverPalette, pct, spineColour, viewOpts } from "../../core/views";
import { kindShown } from "../../core/types";
import { partsOf, partsScore } from "../../core/parts";
import { modeTheme } from "../../core/theme";
import { coverSrc } from "../../sources/covers";
import type { Entry, Item, ItemDraft } from "../../core/model";

/** a cover, or a made-up one when there's no picture */
export function coverLook(b: ItemDraft) {
    const src = coverSrc(b),
        [c1, c2] = coverPalette(b),
        m = MEDIA[b.medium || ""] || MEDIA.book;
    return {
        src,
        medium: b.medium,
        style: `--c1:${c1};--c2:${c2}`,
        title: titleOf(b),
        /** the line at the foot: the author of a book, the medium and year of anything else */
        foot: b.medium === "book" ? firstAuthor(b.creator) : m.code + (b.year ? " · " + b.year : ""),
    };
}
/** a picture that didn't load: one more try through the image proxy (its site is remembered, so banners and spines
 *  use the proxy too), or "" to give up and show the made-up cover */
export function coverRetry(src: string): string {
    if (/^https:/.test(src) && !/wsrv\.nl/.test(src) && meta.settings.imageProxy !== false) {
        coverCache.learn(src);
        return coverCache.proxied(src);
    }
    return "";
}

/** your score on a tile, or the average of its parts' scores */
export function scoreLook(b: Item): { text: string; avg: boolean } | null {
    const r = b.rating || (b.parts ? partsScore(b) : 0);
    return r ? { text: fmtScore(r, b.rating ? scaleOf(b) : undefined), avg: !b.rating } : null;
}
/** how many parts a combined entry holds (0: it isn't combined) */
export const partsCount = (b: Item) => {
    const n = partsOf(b).length;
    return n ? n + 1 : 0;
};
/** the progress bar's width, while it's in progress */
export const progLook = (b: Item) => ((b.status === "active" || b.status === "redo") && b.total ? pct(b) : null);
export const heartTitle = (b: Item) => (b.fav ? "Favourite · click to remove" : "Add to favourites");

/** the line under a library card's title: the author of something you read, otherwise its type and year */
export const cardSub = (b: Entry) =>
    ["book", "novel", "manga", "manhwa", "comic"].includes(b.medium)
        ? b.creator || ""
        : [kindShown(b) || MEDIA[b.medium].one, b.year].filter(Boolean).join(" · ");
/** a cover tile's own style: its game box shape, the colour behind it, and its true size */
export function tileStyle(b: Entry) {
    const bx = boxAttr(b);
    return `${bx.st}${b.coverColor && b.coverColor !== "none" ? "--cc:" + b.coverColor + ";" : ""}--ts:${(spineDims(b)[0] / 19).toFixed(3)}`;
}

// ── game boxes: the front of the box, in its real shape ──
export const GAME_CASE: [platform: RegExp, height: number, depth: number, label: string][] = [
    [/PlayStation 5|PS5|PlayStation 4|PS4/i, 17, 1.25, "PS"],
    [/PlayStation 3|PS3/i, 17, 1.4, "PS3"],
    [/PlayStation 2|PS2/i, 19, 1.4, "PS2"],
    [/PS Vita|PlayStation Vita/i, 13.5, 1, "Vita"],
    [/PSP/i, 17.8, 1.4, "PSP"],
    [/^PlayStation$|PS1|PSX/i, 14.2, 1, "PS1"],
    [/Switch/i, 17, 1.1, "Switch"],
    [/Wii U/i, 19, 1.4, "Wii U"],
    [/Wii/i, 19, 1.4, "Wii"],
    [/GameCube/i, 19, 1.4, "GC"],
    [/3DS/i, 13.6, 1.5, "3DS"],
    [/\bDS\b|Nintendo DS/i, 13.6, 1.5, "DS"],
    [/Game Boy/i, 12.5, 3, "GB"],
    [/Xbox/i, 19, 1.4, "Xbox"],
    [/PC|Windows|macOS|Linux|Steam/i, 19, 1.4, "PC"],
    [/iOS|Android|Mobile/i, 14, 0.8, "Mobile"],
];
// the front of the box, width ÷ height: a Switch case is narrow, a DS case nearly square, an American SNES box lies on its side
const GAME_BOX: [platform: RegExp, aspect: number][] = [
    [/PlayStation 5|PS5|PlayStation 4|PS4|PlayStation 3|PS3|Xbox One|Xbox Series|Wii U/i, 0.79],
    [/PS Vita|PlayStation Vita/i, 0.78],
    [/PSP/i, 0.58],
    [/Switch/i, 0.62],
    [/3DS|\bDS\b|Nintendo DS/i, 0.91],
    [/^PlayStation$|PS1|PSX/i, 1.12],
    [/Game Boy|GBA/i, 0.96],
    [/Super Nintendo|SNES|Nintendo 64|N64/i, 1.38],
    [/\bNES\b|Nintendo Entertainment/i, 0.73],
    [/Wii|GameCube|Xbox|PlayStation 2|PS2|Mega Drive|Genesis|Dreamcast|Saturn/i, 0.71],
    [/PC|Windows|macOS|Mac|Linux|Steam/i, 0.71],
    [/iOS|Android|Mobile/i, 1],
];
export const gameAspect = (b: Item) => {
    const p = b.platform || (b.platforms || [])[0] || "";
    return GAME_BOX.find(([re]) => re.test(p))?.[1] ?? 0.71;
};
export const boxShapes = () => meta.settings.gameBoxes !== false;
export const boxAttr = (b: Item) =>
    b.medium === "game" && boxShapes() ? { cls: " gbox", st: `--ar:${gameAspect(b)};` } : { cls: "", st: "" };
/** a game's case for the platform you play it on: [height, depth, label] after the pattern (no pattern: none matched) */
export function gameCase(b: Item): [platform: RegExp | null, height: number, depth: number, label: string] {
    const p = b.platform || (b.platforms || [])[0] || "";
    return GAME_CASE.find(([re]) => re.test(p)) || [null, 19, 1.4, p ? p.slice(0, 6) : "Game"];
}

// ── spines ──
const CM = 8,
    THICK = 1.7;
function spineDims(b: Item): [height: number, width: number] {
    const m = b.medium,
        h0 = (hash(b.title) % 10) / 10 - 0.5;
    if (m === "book") {
        if (b.dims && b.dims.h)
            return [b.dims.h, Math.min(6, b.dims.d || Math.max(0.8, (b.total || 300) * 0.0062 + 0.25))];
        const pages = Math.min(
                900,
                b.total || (b.format === "Short" ? 260 : b.format === "Long" || b.format === "Textbook" ? 520 : 360)
            ),
            h =
                b.kind === "Academic" || b.format === "Textbook"
                    ? 24.5
                    : b.kind === "Poetry"
                      ? 20
                      : pages > 650
                        ? 23.5
                        : b.format === "Short"
                          ? 19.6
                          : 21;
        return [h + h0 * 0.8, Math.min(5.5, Math.max(0.8, pages * 0.0062 + 0.25))];
    }
    if (m === "novel") return [18.5 + h0 * 0.4, Math.max(1, (b.vols || 1) * 1.7)];
    if (m === "manga") return [17.6, b.vols ? Math.min(14, b.vols * 1.6) : 1.6];
    if (m === "manhwa") return [21, b.vols ? Math.min(14, b.vols * 1.5) : 1.5];
    if (m === "comic") return [25.8 + h0 * 0.6, Math.max(1, (b.total || 6) * 0.25 + 0.4)];
    if (m === "game") {
        const c = gameCase(b);
        return [c[1], c[2]];
    }
    // films and series: a DVD case, a Blu-ray case, or a box set for a long show
    const blu = b.copy === "physical" && /blu/i.test(b.format || ""),
        h = blu ? 17 : 19;
    if (m === "film" || b.kind === "Movie") return [h, 1.4];
    const seasons = (b.seasons || []).length || Math.max(1, Math.ceil((b.total || 12) / (m === "anime" ? 12 : 10)));
    return [h, Math.min(9, 1.4 * seasons)];
}
/** a spine's size on the shelf in pixels, before the size slider (--z) */
export function spineSize(b: Item, vol?: number): [width: number, height: number] {
    let [hcm, wcm] = spineDims(b);
    if (vol) wcm = b.medium === "manhwa" ? 1.5 : b.medium === "novel" ? 1.7 : 1.6;
    return [Math.max(10, Math.round(wcm * CM * THICK)), Math.round(hcm * CM)];
}
/** a spine: its colours, size, picture and label. vol: one volume of a series standing on its own */
export function spineLook(b: Entry, call: string, vol?: number) {
    const [bg, fg] = spineColour(b),
        m = b.medium,
        real = !vol && b.spineArt ? coverCache.src(b.spineArt) : "",
        src = real || (modeTheme().spine === "cover" ? coverSrc(b) : "");
    const [w, h] = spineSize(b, vol);
    const lbl = vol
        ? String(vol)
        : m === "game"
          ? gameCase(b)[3]
          : m === "book"
            ? call.replace(/^FIC /, "").replace(/^NF /, "").replace(" ", "\n")
            : b.vols
              ? b.vols + "\nvol"
              : MEDIA[m].code;
    const text = (!src || viewOpts().titles) && !real;
    return {
        cls: `spine sp-${m}${w >= 40 ? " wide" : ""}${src ? " has-art" : ""}`,
        style: `--sp:${bg};--sp-fg:${src ? "#fff" : fg};width:calc(${w}px * var(--z, 1));height:calc(${h}px * var(--z, 1))`,
        // a spine that shows its title is named by what it shows; one that's only a picture gets a name
        label: text && !vol ? undefined : titleOf(b) + (vol ? " volume " + vol : ""),
        art: src
            ? {
                  real: !!real,
                  style: `background-image:url('${src.replace(/'/g, "%27")}');--bp:${vol ? ((vol * 17) % 80) + 10 : (hash(b.id) % 70) + 15}%`,
              }
            : null,
        dot: b.status === "active" || b.status === "redo" ? "var(--good)" : "",
        /** the title, author and label printed on it, when it shows them */
        print: text && !vol ? { title: cleanTitle(titleOf(b)), author: firstAuthor(b.creator), lbl } : null,
    };
}
/** the volumes a series stands as on the shelf: the ones you own, or every volume (none: it stands as one spine) */
export function volumesOf(b: Entry, split: boolean): number[] {
    if (!split || !["manga", "manhwa", "novel"].includes(b.medium) || !(b.vols || (b.volsOwned || []).length))
        return [];
    return b.volsOwned?.length
        ? b.volsOwned.slice().sort((x, y) => x - y)
        : Array.from({ length: Math.min(80, b.vols || 0) }, (_, i) => i + 1);
}
