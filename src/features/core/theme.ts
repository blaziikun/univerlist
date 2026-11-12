// src/features/core/theme.ts
// ─────────────────────────────────────────────────────────────────
//  Themes: one per mode, every value adjustable
// ─────────────────────────────────────────────────────────────────

import { APP_NAME, clone, curMode, isRecord, meta } from "./core";
import { builtinOn } from "../extensions/builtins";
import type { Mode, ResolvedTheme, Theme } from "./model";

export type { Theme } from "./model";
/** each font offered: its weights, and the family it falls back to */
export const FONTS: Record<string, [weights: number[], fallback: string]> = {
    Inter: [[300, 400, 500, 600, 700], "sans-serif"],
    "Space Grotesk": [[300, 400, 500, 600, 700], "sans-serif"],
    "IBM Plex Sans": [[300, 400, 500, 600, 700], "sans-serif"],
    "DM Sans": [[400, 500, 600, 700], "sans-serif"],
    Manrope: [[300, 400, 500, 600, 700, 800], "sans-serif"],
    Sora: [[300, 400, 500, 600, 700], "sans-serif"],
    Outfit: [[300, 400, 500, 600, 700], "sans-serif"],
    "Libre Franklin": [[300, 400, 500, 600, 700], "sans-serif"],
    "Bricolage Grotesque": [[300, 400, 500, 600, 700, 800], "sans-serif"],
    Syne: [[400, 500, 600, 700, 800], "sans-serif"],
    Rajdhani: [[400, 500, 600, 700], "sans-serif"],
    "Chakra Petch": [[400, 500, 600, 700], "sans-serif"],
    Orbitron: [[400, 500, 600, 700, 800], "sans-serif"],
    "Bebas Neue": [[400], "sans-serif"],
    Oswald: [[300, 400, 500, 600, 700], "sans-serif"],
    "M PLUS Rounded 1c": [[400, 500, 700, 800], "sans-serif"],
    "Zen Kaku Gothic New": [[400, 500, 700, 900], "sans-serif"],
    Newsreader: [[400, 500, 600, 700], "serif"],
    Fraunces: [[300, 400, 500, 600, 700, 800], "serif"],
    "Playfair Display": [[400, 500, 600, 700, 800], "serif"],
    "Cormorant Garamond": [[400, 500, 600, 700], "serif"],
    "EB Garamond": [[400, 500, 600, 700, 800], "serif"],
    Lora: [[400, 500, 600, 700], "serif"],
    "Libre Baskerville": [[400, 700], "serif"],
    "DM Serif Display": [[400], "serif"],
    "Shippori Mincho": [[400, 500, 600, 700, 800], "serif"],
    "IBM Plex Mono": [[400, 500, 600], "monospace"],
    "JetBrains Mono": [[400, 500, 600, 700], "monospace"],
    Overpass: [[300, 400, 500, 600, 700, 800], "sans-serif"],
    Archivo: [[400, 500, 600, 700, 800], "sans-serif"],
    Spectral: [[300, 400, 500, 600, 700], "serif"],
    System: [[400, 500, 600, 700], "system-ui"],
};
export const fontStack = (f: string) =>
    f === "System"
        ? `system-ui, -apple-system, "Segoe UI", sans-serif`
        : `"${f}", ${FONTS[f] ? FONTS[f][1] : "sans-serif"}`;
// bundled with the app (look/fonts.ts); any other font is fetched from Google Fonts only once a theme of yours uses it
const BUNDLED_FONTS = new Set([
    "Inter",
    "Space Grotesk",
    "IBM Plex Mono",
    "IBM Plex Sans",
    "DM Sans",
    "Sora",
    "Chakra Petch",
    "Zen Kaku Gothic New",
    "Newsreader",
    "Fraunces",
    "Lora",
    "Libre Baskerville",
    "Shippori Mincho",
    "Overpass",
]);
const loadedFonts = new Set<string>();
function loadFont(f: string) {
    if (!FONTS[f] || f === "System" || BUNDLED_FONTS.has(f) || loadedFonts.has(f)) return;
    loadedFonts.add(f);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.dataset.font = f;
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@${FONTS[f][0].join(";")}&display=swap`;
    document.head.append(l);
}
const nearestW = (f: string, w: number) => {
    const ws = (FONTS[f] || FONTS.Inter)[0];
    return ws.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), ws[0]);
};
// each theme belongs to a backdrop: the living layer behind the page (stars drifting, a projector beam, lamplight…)
export const BACKDROPS: [string, string][] = [
    ["auto", "Match the background"],
    ["cosmos", "Deep space"],
    ["cinema", "Picture house"],
    ["study", "Reading room"],
    ["library", "Old library"],
    ["arcade", "Arcade"],
    ["night", "City night"],
    ["ink", "Ink & paper"],
    ["noir", "Rain"],
    ["blossom", "Falling petals"],
    ["none", "Still"],
];
// backdrops you made (Settings › Backdrops, src/features/backdrops) are "mine:<id>", while the Backdrop builder is on. They're
// cleaned whenever they arrive (backdrops/backdrop.ts myBackdrops, from main.ts and applyParts); this only reads ids and names.
export const myBackdropChoices = (): [string, string][] => {
    if (!builtinOn("backdrops")) return [];
    const seen = new Set<string>();
    return (Array.isArray(meta.settings.backdrops) ? meta.settings.backdrops : [])
        .filter(
            (w): w is Record<string, unknown> & { id: string } =>
                isRecord(w) &&
                typeof w.id === "string" &&
                /^[a-z0-9]{4,16}$/.test(w.id) &&
                !seen.has(w.id) &&
                !!seen.add(w.id)
        )
        .slice(0, 12)
        .map(w => ["mine:" + w.id, String(w.name || "My backdrop").slice(0, 40) + " (yours)"]);
};
const BACKDROP_BY_BG: Record<string, string> = {
    galaxy: "cosmos",
    paper: "study",
    grid: "library",
    dots: "ink",
    vignette: "noir",
    grain: "cinema",
    neon: "arcade",
    plain: "night",
};
export const BG_STYLES: [string, string][] = [
    ["galaxy", "Galaxy"],
    ["paper", "Paper"],
    ["grid", "Grid paper"],
    ["dots", "Halftone"],
    ["vignette", "Spotlight"],
    ["grain", "Film grain"],
    ["neon", "Neon grid"],
    ["plain", "Plain"],
];
const THEME_BASE = {
    bg: "#0b0c10",
    panel: "#111318",
    text: "#e8e5dd",
    muted: "#8b8c95",
    accent: "#c9a24a",
    hi: "#7aa7f0",
    bgStyle: "grid",
    bgAmt: 0.6,
    fHead: "Newsreader",
    fUi: "IBM Plex Sans",
    wHead: 500,
    wUi: 400,
    fs: 14,
    fsTitle: 30,
    ls: 0,
    tt: "none",
    radius: 12,
    cover: 128,
    gap: 16,
    spine: "cover",
    glow: 0,
    logo: "two",
};
// starting themes, each built for what its mode holds. They live in one shared library: edit one and every mode using it changes.
export const THEME_PRESETS: Record<string, Theme> = {
    galaxy: {
        name: "Galaxy",
        backdrop: "cosmos",
        bg: "#04050a",
        panel: "#0b0d14",
        text: "#eceef4",
        muted: "#8b8f9c",
        accent: "#f2f3f7",
        hi: "#b9c0d6",
        bgStyle: "galaxy",
        bgAmt: 0.9,
        fHead: "Space Grotesk",
        fUi: "Inter",
        wHead: 500,
        wUi: 400,
        radius: 12,
        ls: -0.01,
        glow: 0.35,
    },
    anilist: {
        name: "AniList night",
        backdrop: "night",
        bg: "#070d17",
        panel: "#0f1927",
        text: "#d6e1ee",
        muted: "#8597ad",
        accent: "#3fc1ff",
        hi: "#7ee0ff",
        bgStyle: "plain",
        bgAmt: 0,
        fHead: "Overpass",
        fUi: "Overpass",
        wHead: 700,
        wUi: 400,
        radius: 4,
        fs: 13.5,
        glow: 0.15,
    },
    leather: {
        name: "Leather & paper",
        backdrop: "study",
        bg: "#160e09",
        panel: "#20150d",
        text: "#f1e4cc",
        muted: "#ae9879",
        accent: "#d0915a",
        hi: "#f0d9ae",
        bgStyle: "paper",
        bgAmt: 0.75,
        fHead: "Fraunces",
        fUi: "Lora",
        wHead: 600,
        fsTitle: 36,
        radius: 4,
    },
    projector: {
        name: "Projector",
        backdrop: "cinema",
        bg: "#0d0c0a",
        panel: "#171512",
        text: "#f1ebdd",
        muted: "#a39a86",
        accent: "#f0b429",
        hi: "#ff8a3d",
        bgStyle: "grain",
        bgAmt: 0.8,
        fHead: "Zen Kaku Gothic New",
        fUi: "DM Sans",
        wHead: 400,
        fsTitle: 46,
        ls: 0.04,
        radius: 2,
    },
    arghnime: {
        name: "Arghnime",
        backdrop: "ink",
        bg: "#1e0702",
        panel: "#37120b",
        text: "#f1ebdd",
        muted: "#d79785",
        accent: "#ff3e3f",
        hi: "#ff0c3f",
        bgStyle: "grain",
        bgAmt: 0.8,
        fHead: "Zen Kaku Gothic New",
        fUi: "DM Sans",
        wHead: 400,
        wUi: 400,
        fs: 14,
        fsTitle: 46,
        ls: 0.04,
        tt: "none",
        radius: 2,
        glow: 0,
    },
    blossom: {
        name: "Blossom",
        backdrop: "blossom",
        bg: "#130c12",
        panel: "#1e141c",
        text: "#f6ebf0",
        muted: "#b9a0ad",
        accent: "#ff86ac",
        hi: "#ffd3b0",
        bgStyle: "vignette",
        bgAmt: 0.7,
        fHead: "Shippori Mincho",
        fUi: "DM Sans",
        wHead: 600,
        wUi: 400,
        fs: 14,
        fsTitle: 38,
        ls: 0.01,
        radius: 10,
        glow: 0.25,
    },
    neon: {
        name: "Neon arcade",
        backdrop: "arcade",
        bg: "#0a0613",
        panel: "#140d24",
        text: "#efe9ff",
        muted: "#9c90c2",
        accent: "#a26bff",
        hi: "#ff4fa3",
        bgStyle: "neon",
        bgAmt: 0.55,
        fHead: "Chakra Petch",
        fUi: "Sora",
        wHead: 700,
        tt: "uppercase",
        ls: 0.04,
        radius: 4,
        glow: 0.55,
    },
    noir: {
        name: "Noir",
        backdrop: "noir",
        bg: "#0c0809",
        panel: "#170f11",
        text: "#f0e4e6",
        muted: "#a08a8e",
        accent: "#e0566e",
        hi: "#ff9db0",
        bgStyle: "vignette",
        bgAmt: 0.7,
        fHead: "Fraunces",
        fUi: "Inter",
        wHead: 500,
        radius: 10,
        glow: 0.3,
        hidden: true,
    },
    library: {
        name: "Library green",
        backdrop: "library",
        bg: "#0a120e",
        panel: "#101b15",
        text: "#e4ece4",
        muted: "#8aa194",
        accent: "#d4ad55",
        hi: "#6fcf97",
        bgStyle: "grid",
        bgAmt: 0.9,
        fHead: "Libre Baskerville",
        fUi: "IBM Plex Sans",
        wHead: 700,
        fs: 13.5,
        radius: 3,
    },
};
const themeById = (id: string): Theme | null => (meta.themes && meta.themes[id]) || THEME_PRESETS[id] || null;
export const themesUsing = (id: string): Mode[] => meta.modes.filter(m => m.theme === id);
export const validHex = (h: unknown): boolean => /^#[0-9a-f]{6}$/i.test(String(h || ""));
const hexRGB = (h: string): [number, number, number] => {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
};
const rgbHex = (a: number[]) =>
    "#" +
    a
        .map(v =>
            Math.max(0, Math.min(255, Math.round(v)))
                .toString(16)
                .padStart(2, "0")
        )
        .join("");
const mixHex = (a: string, b: string, t: number) => {
    const x = hexRGB(a),
        y = hexRGB(b);
    return rgbHex(x.map((v, i) => v + (y[i] - v) * t));
};
const lumHex = (h: string) => {
    const [r, g, b] = hexRGB(h);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
// text on a coloured button: whichever of near-black or white is easier to read on it (WCAG contrast, not a guess)
const contrastOf = (a: string, b: string) => {
    const lum = (h: string) => {
        const [r, g, b] = hexRGB(h).map(v => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const textOn = (h: string) => (contrastOf(h, "#111111") > contrastOf(h, "#ffffff") ? "#111111" : "#ffffff");
const alpha = (h: string, a: number) => {
    const [r, g, b] = hexRGB(h);
    return `rgba(${r},${g},${b},${a})`;
};
type Colour = "bg" | "panel" | "text" | "muted" | "accent" | "hi";
type Measure = "fs" | "fsTitle" | "radius" | "cover" | "gap" | "bgAmt" | "glow" | "ls";
/** a theme (its id, or one kept by an older version as an object) with every value filled in and checked */
export function resolveTheme(t: unknown): ResolvedTheme {
    const id = typeof t === "string" ? t : (isRecord(t) && typeof t.preset === "string" && t.preset) || "galaxy",
        base = themeById(id) || themeById("galaxy") || THEME_PRESETS.galaxy;
    // the theme over its preset over the base, as kept: each value is checked below before it's used
    const mix: Record<string, unknown> = { ...THEME_BASE, ...base, ...(isRecord(t) ? t : {}), id };
    const colour = (k: Colour) => {
        const v = mix[k];
        return typeof v === "string" && validHex(v) ? v : base[k] || THEME_BASE[k];
    };
    const font = (k: "fHead" | "fUi") => {
        const v = mix[k];
        return typeof v === "string" && FONTS[v] ? v : THEME_BASE[k];
    };
    const num = (k: Measure, a: number, b: number) => {
        const v = Number(mix[k]);
        return Math.max(a, Math.min(b, Number.isFinite(v) ? v : THEME_BASE[k]));
    };
    const word = (k: "tt" | "bgStyle" | "spine" | "logo") => {
        const v = mix[k];
        return typeof v === "string" ? v : THEME_BASE[k];
    };
    const fHead = font("fHead"),
        fUi = font("fUi"),
        tt = word("tt"),
        bgStyle = word("bgStyle");
    const out: ResolvedTheme = {
        ...mix,
        id,
        name: typeof mix.name === "string" ? mix.name : undefined,
        backdrop: typeof mix.backdrop === "string" ? mix.backdrop : "",
        bg: colour("bg"),
        panel: colour("panel"),
        text: colour("text"),
        muted: colour("muted"),
        accent: colour("accent"),
        hi: colour("hi"),
        fHead,
        fUi,
        fs: num("fs", 11, 18),
        fsTitle: num("fsTitle", 18, 56),
        radius: num("radius", 0, 24),
        cover: num("cover", 84, 220),
        gap: num("gap", 6, 32),
        bgAmt: num("bgAmt", 0, 1),
        glow: num("glow", 0, 1),
        ls: num("ls", -0.06, 0.2),
        wHead: nearestW(fHead, Number(mix.wHead) || 500),
        wUi: nearestW(fUi, Number(mix.wUi) || 400),
        tt: ["none", "uppercase", "lowercase", "capitalize"].includes(tt) ? tt : "none",
        bgStyle: BG_STYLES.some(([k]) => k === bgStyle) ? bgStyle : "grid",
        spine: word("spine"),
        logo: word("logo"),
    };
    // copies of a preset keep its backdrop; anything else takes the backdrop its background suggests
    // (one of your backdrops counts only while the Backdrop builder is on: off, the theme falls back to its usual one)
    const known = [...BACKDROPS, ...myBackdropChoices()],
        ok = (w: unknown) => w !== "auto" && known.some(([k]) => k === w);
    if (!ok(out.backdrop)) {
        const p = Object.values(THEME_PRESETS).find(x => x.name === out.name && x.backdrop);
        out.backdrop =
            (ok(base.backdrop) && base.name === out.name
                ? base.backdrop
                : p
                  ? p.backdrop
                  : BACKDROP_BY_BG[out.bgStyle]) || "none";
    }
    return out;
}
export const modeTheme = (mode: Mode = curMode()) => resolveTheme(mode.theme);
export function applyTheme(T: ResolvedTheme = modeTheme()) {
    const r = document.documentElement,
        st = r.style,
        set = (k: string, v: string | number) => st.setProperty(k, String(v)),
        light = lumHex(T.bg) > 0.5;
    const accentInk = light
        ? mixHex(T.accent, "#000000", lumHex(T.accent) > 0.55 ? 0.35 : 0)
        : mixHex(T.accent, "#ffffff", lumHex(T.accent) < 0.45 ? 0.3 : 0);
    set("--bg", T.bg);
    set("--panel", T.panel);
    set("--panel2", mixHex(T.panel, T.text, light ? 0.035 : 0.045));
    set("--panel3", mixHex(T.panel, T.text, light ? 0.08 : 0.1));
    set("--line", alpha(T.text, light ? 0.1 : 0.075));
    set("--line2", alpha(T.text, light ? 0.18 : 0.14));
    set("--text", T.text);
    set("--muted", T.muted);
    set("--faint", mixHex(T.muted, T.bg, 0.42));
    set("--accent", T.accent);
    set("--accent-ink", accentInk);
    set("--on-accent", textOn(T.accent));
    set("--hi", T.hi);
    set("--grid", alpha(T.text, light ? 0.05 : 0.03));
    set("--ledge", mixHex(T.accent, T.bg, 0.7));
    set("--good", light ? "#257a4a" : "#5fc58a");
    set("--warn", light ? "#b14a2a" : "#e0896a");
    set("--info", light ? "#2f5fb8" : "#7aa7f0");
    set("--stamp-red", light ? "#b23b26" : "#d0604a");
    set("--stamp-blue", light ? "#2f5fb8" : "#6b93e0");
    set("--stamp-green", light ? "#257a4a" : "#4fae7c");
    set("--scrim", light ? "rgba(20,22,30,.35)" : "rgba(4,5,8,.66)");
    set("--shadow", light ? "0 18px 48px rgba(20,22,30,.18)" : "0 18px 48px rgba(0,0,0,.5)");
    loadFont(T.fHead);
    loadFont(T.fUi);
    set("--f-head", fontStack(T.fHead));
    set("--f-ui", fontStack(T.fUi));
    set("--w-head", T.wHead);
    set("--w-ui", T.wUi);
    set("--fs", T.fs + "px");
    set("--fs-title", T.fsTitle + "px");
    set("--ls-head", T.ls + "em");
    set("--tt-head", T.tt);
    set("--r", T.radius + "px");
    set("--r-sm", Math.round(T.radius * 0.6) + "px");
    set("--cover", T.cover + "px");
    set("--gap", T.gap + "px");
    set("--bg-amt", T.bgAmt);
    set("--glow", T.glow);
    set("--glow-c", alpha(T.accent, 0.35 * T.glow));
    r.dataset.bg = T.bgStyle;
    r.dataset.backdrop = T.backdrop;
    r.dataset.light = light ? "1" : "";
    r.dataset.spine = T.spine;
    st.colorScheme = light ? "light" : "dark";
    document.body && (document.body.style.background = T.bg);
    const tc = document.querySelector('meta[name="theme-color"]');
    if (tc instanceof HTMLMetaElement) tc.content = T.bg;
}
/** the logo: the app's name in the style you chose; "two" splits it in two colours where a new word starts
 *  (shell/Logo.svelte draws it) */
export function logoLook(): { style: string; parts: string[] } {
    const n = meta.settings.appName || APP_NAME,
        style = meta.settings.logo || "two";
    if (style === "two") {
        let i = -1;
        for (let k = n.length - 1; k > 0; k--) {
            if (/\p{Lu}/u.test(n[k]) && n[k - 1] !== " ") {
                i = k;
                break;
            }
        }
        if (i < 0) {
            const sp = n.indexOf(" ");
            i = sp > 0 ? sp : Math.ceil(n.length / 2);
        }
        return { style, parts: [n.slice(0, i), n.slice(i)] };
    }
    return { style, parts: [n] };
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initTheme() {
    meta.themes = clone(THEME_PRESETS);
}
