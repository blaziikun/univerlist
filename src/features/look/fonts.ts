// src/features/look/fonts.ts
// ─────────────────────────────────────────────────────────────────
//  The fonts the built-in themes use, bundled with the app: they work offline, and no visitor's browser asks Google
//  for them. Each weight is registered here and downloaded only when the page first uses it (woff2 only: every browser
//  the app supports reads it). A font you pick yourself from the longer list in Appearance is fetched from Google Fonts
//  instead; loadFont in core/theme.js skips these, and BUNDLED_FONTS there names the same families.
// ─────────────────────────────────────────────────────────────────

import inter300 from "@fontsource/inter/files/inter-latin-300-normal.woff2?url";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";
import inter500 from "@fontsource/inter/files/inter-latin-500-normal.woff2?url";
import inter600 from "@fontsource/inter/files/inter-latin-600-normal.woff2?url";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff2?url";
import spaceGrotesk300 from "@fontsource/space-grotesk/files/space-grotesk-latin-300-normal.woff2?url";
import spaceGrotesk400 from "@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2?url";
import spaceGrotesk500 from "@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2?url";
import spaceGrotesk600 from "@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2?url";
import spaceGrotesk700 from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2?url";
import iBMPlexMono400 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url";
import iBMPlexMono500 from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url";
import iBMPlexSans300 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-300-normal.woff2?url";
import iBMPlexSans400 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url";
import iBMPlexSans500 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?url";
import iBMPlexSans600 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url";
import iBMPlexSans700 from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2?url";
import dMSans400 from "@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2?url";
import dMSans500 from "@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff2?url";
import dMSans600 from "@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff2?url";
import dMSans700 from "@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2?url";
import sora300 from "@fontsource/sora/files/sora-latin-300-normal.woff2?url";
import sora400 from "@fontsource/sora/files/sora-latin-400-normal.woff2?url";
import sora500 from "@fontsource/sora/files/sora-latin-500-normal.woff2?url";
import sora600 from "@fontsource/sora/files/sora-latin-600-normal.woff2?url";
import sora700 from "@fontsource/sora/files/sora-latin-700-normal.woff2?url";
import chakraPetch400 from "@fontsource/chakra-petch/files/chakra-petch-latin-400-normal.woff2?url";
import chakraPetch500 from "@fontsource/chakra-petch/files/chakra-petch-latin-500-normal.woff2?url";
import chakraPetch600 from "@fontsource/chakra-petch/files/chakra-petch-latin-600-normal.woff2?url";
import chakraPetch700 from "@fontsource/chakra-petch/files/chakra-petch-latin-700-normal.woff2?url";
import zenKakuGothicNew400 from "@fontsource/zen-kaku-gothic-new/files/zen-kaku-gothic-new-latin-400-normal.woff2?url";
import zenKakuGothicNew500 from "@fontsource/zen-kaku-gothic-new/files/zen-kaku-gothic-new-latin-500-normal.woff2?url";
import zenKakuGothicNew700 from "@fontsource/zen-kaku-gothic-new/files/zen-kaku-gothic-new-latin-700-normal.woff2?url";
import zenKakuGothicNew900 from "@fontsource/zen-kaku-gothic-new/files/zen-kaku-gothic-new-latin-900-normal.woff2?url";
import newsreader400 from "@fontsource/newsreader/files/newsreader-latin-400-normal.woff2?url";
import newsreader500 from "@fontsource/newsreader/files/newsreader-latin-500-normal.woff2?url";
import newsreader600 from "@fontsource/newsreader/files/newsreader-latin-600-normal.woff2?url";
import newsreader700 from "@fontsource/newsreader/files/newsreader-latin-700-normal.woff2?url";
import fraunces300 from "@fontsource/fraunces/files/fraunces-latin-300-normal.woff2?url";
import fraunces400 from "@fontsource/fraunces/files/fraunces-latin-400-normal.woff2?url";
import fraunces500 from "@fontsource/fraunces/files/fraunces-latin-500-normal.woff2?url";
import fraunces600 from "@fontsource/fraunces/files/fraunces-latin-600-normal.woff2?url";
import fraunces700 from "@fontsource/fraunces/files/fraunces-latin-700-normal.woff2?url";
import fraunces800 from "@fontsource/fraunces/files/fraunces-latin-800-normal.woff2?url";
import lora400 from "@fontsource/lora/files/lora-latin-400-normal.woff2?url";
import lora500 from "@fontsource/lora/files/lora-latin-500-normal.woff2?url";
import lora600 from "@fontsource/lora/files/lora-latin-600-normal.woff2?url";
import lora700 from "@fontsource/lora/files/lora-latin-700-normal.woff2?url";
import libreBaskerville400 from "@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff2?url";
import libreBaskerville700 from "@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff2?url";
import shipporiMincho400 from "@fontsource/shippori-mincho/files/shippori-mincho-latin-400-normal.woff2?url";
import shipporiMincho500 from "@fontsource/shippori-mincho/files/shippori-mincho-latin-500-normal.woff2?url";
import shipporiMincho600 from "@fontsource/shippori-mincho/files/shippori-mincho-latin-600-normal.woff2?url";
import shipporiMincho700 from "@fontsource/shippori-mincho/files/shippori-mincho-latin-700-normal.woff2?url";
import shipporiMincho800 from "@fontsource/shippori-mincho/files/shippori-mincho-latin-800-normal.woff2?url";
import overpass300 from "@fontsource/overpass/files/overpass-latin-300-normal.woff2?url";
import overpass400 from "@fontsource/overpass/files/overpass-latin-400-normal.woff2?url";
import overpass500 from "@fontsource/overpass/files/overpass-latin-500-normal.woff2?url";
import overpass600 from "@fontsource/overpass/files/overpass-latin-600-normal.woff2?url";
import overpass700 from "@fontsource/overpass/files/overpass-latin-700-normal.woff2?url";
import overpass800 from "@fontsource/overpass/files/overpass-latin-800-normal.woff2?url";

const BUNDLED: [string, Record<number, string>][] = [
    ["Inter", { 300: inter300, 400: inter400, 500: inter500, 600: inter600, 700: inter700 }],
    [
        "Space Grotesk",
        {
            300: spaceGrotesk300,
            400: spaceGrotesk400,
            500: spaceGrotesk500,
            600: spaceGrotesk600,
            700: spaceGrotesk700,
        },
    ],
    ["IBM Plex Mono", { 400: iBMPlexMono400, 500: iBMPlexMono500 }],
    [
        "IBM Plex Sans",
        { 300: iBMPlexSans300, 400: iBMPlexSans400, 500: iBMPlexSans500, 600: iBMPlexSans600, 700: iBMPlexSans700 },
    ],
    ["DM Sans", { 400: dMSans400, 500: dMSans500, 600: dMSans600, 700: dMSans700 }],
    ["Sora", { 300: sora300, 400: sora400, 500: sora500, 600: sora600, 700: sora700 }],
    ["Chakra Petch", { 400: chakraPetch400, 500: chakraPetch500, 600: chakraPetch600, 700: chakraPetch700 }],
    [
        "Zen Kaku Gothic New",
        { 400: zenKakuGothicNew400, 500: zenKakuGothicNew500, 700: zenKakuGothicNew700, 900: zenKakuGothicNew900 },
    ],
    ["Newsreader", { 400: newsreader400, 500: newsreader500, 600: newsreader600, 700: newsreader700 }],
    [
        "Fraunces",
        { 300: fraunces300, 400: fraunces400, 500: fraunces500, 600: fraunces600, 700: fraunces700, 800: fraunces800 },
    ],
    ["Lora", { 400: lora400, 500: lora500, 600: lora600, 700: lora700 }],
    ["Libre Baskerville", { 400: libreBaskerville400, 700: libreBaskerville700 }],
    [
        "Shippori Mincho",
        {
            400: shipporiMincho400,
            500: shipporiMincho500,
            600: shipporiMincho600,
            700: shipporiMincho700,
            800: shipporiMincho800,
        },
    ],
    [
        "Overpass",
        { 300: overpass300, 400: overpass400, 500: overpass500, 600: overpass600, 700: overpass700, 800: overpass800 },
    ],
];

/** Registers every bundled weight with the page; nothing downloads until text uses it. */
export function addBundledFonts(): void {
    for (const [family, weights] of BUNDLED)
        for (const [weight, url] of Object.entries(weights))
            document.fonts.add(new FontFace(family, `url(${url}) format("woff2")`, { weight, display: "swap" }));
}
