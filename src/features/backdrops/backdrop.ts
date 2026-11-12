// src/features/backdrops/backdrop.ts
// ─────────────────────────────────────────────────────────────────
//  Backdrops: what a backdrop you make is, and the check every backdrop goes through
//
//  A backdrop is the living layer behind the page. The built-in ones are CSS (look/ambience.ts); the ones you make here
//  are plain data, drawn by engine.ts: a sky (two colours, or the theme's background), an optional picture that slowly
//  drifts, and up to four layers of moving shapes (dots, stars, petals, rain…).
//
//  It's only data: no CSS, no HTML, no code. So a backdrop file someone shares can't do anything but draw shapes, and
//  cleanBackdrop() below is the one door every backdrop comes through (a file you open, your synced library, this device's
//  storage): anything unknown is dropped, every number is clamped to its range, and a picture must be a real image.
// ─────────────────────────────────────────────────────────────────

export const SHAPES = ["dot", "star", "heart", "square", "triangle", "ring", "petal", "streak"] as const;
export type Shape = (typeof SHAPES)[number];
export const MOTIONS = ["still", "pan", "zoom"] as const;

export interface Layer {
    shape: Shape;
    color: string; // "#rrggbb", or "accent" for the theme's accent colour
    count: number; // how many: 1 to 300
    size: number; // in pixels: 1 to 60
    speed: number; // 0 (still) to 3
    angle: number; // the way they drift, in degrees: 90 is down, 270 is up
    wobble: number; // 0 to 1: how much they sway off their line
    twinkle: number; // 0 to 1: how much they fade in and out
    opacity: number; // 0.05 to 1
    depth: number; // 0 to 1: how far they move when you scroll or point (Alive), and how blurred far ones look
}
interface Picture {
    src: string; // a data: URL (a JPEG made on your device: see picture.ts), so it travels with the backdrop
    opacity: number; // 0 to 1
    blur: number; // 0 to 20 pixels
    motion: (typeof MOTIONS)[number];
}
export interface Backdrop {
    id: string;
    name: string;
    sky: [string, string] | null; // top and bottom colours; null shows the theme's own background
    picture: Picture | null;
    layers: Layer[];
}

export const MAX_LAYERS = 4,
    MAX_BACKDROPS = 12,
    MAX_PICTURE = 700_000; // characters of data: URL (about 500 KB): pictures are made smaller than this on your device
/** the file format, so another app (or a later UniverList) knows what it's looking at */
const FILE_KIND = "univerlist-backdrop",
    FILE_V = 1;

const clamp = (v: unknown, a: number, b: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d;
};
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);
/** a short id made of letters and digits, so it's safe anywhere (it ends up in the theme as "mine:<id>") */
export const newId = () => Math.random().toString(36).slice(2, 10);
const cleanId = (v: unknown) => (typeof v === "string" && /^[a-z0-9]{4,16}$/.test(v) ? v : newId());

export function cleanLayer(o: unknown): Layer {
    const l = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
    return {
        shape: oneOf(SHAPES, l.shape, "dot"),
        color: l.color === "accent" ? "accent" : hex(l.color, "#ffffff"),
        count: Math.round(clamp(l.count, 1, 300, 60)),
        size: clamp(l.size, 1, 60, 3),
        speed: clamp(l.speed, 0, 3, 0.5),
        angle: clamp(l.angle, 0, 360, 90),
        wobble: clamp(l.wobble, 0, 1, 0.3),
        twinkle: clamp(l.twinkle, 0, 1, 0),
        opacity: clamp(l.opacity, 0.05, 1, 0.7),
        depth: clamp(l.depth, 0, 1, 0.5),
    };
}
function cleanPicture(o: unknown): Picture | null {
    if (!o || typeof o !== "object") return null;
    const p = o as Record<string, unknown>;
    // only a picture inside the backdrop itself: never a link (that would tell another site whenever you open the app)
    if (
        typeof p.src !== "string" ||
        p.src.length > MAX_PICTURE ||
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.src)
    )
        return null;
    return {
        src: p.src,
        opacity: clamp(p.opacity, 0, 1, 0.6),
        blur: clamp(p.blur, 0, 20, 0),
        motion: oneOf(MOTIONS, p.motion, "pan"),
    };
}
/** any backdrop, from anywhere, made safe and complete */
export function cleanBackdrop(o: unknown): Backdrop {
    const w = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
    const sky =
        Array.isArray(w.sky) && w.sky.length === 2
            ? ([hex(w.sky[0], "#0b0d18"), hex(w.sky[1], "#1a1030")] as [string, string])
            : null;
    const name =
        typeof w.name === "string"
            ? w.name
                  .replace(/[\p{Cc}<>]/gu, "")
                  .trim()
                  .slice(0, 40)
            : "";
    return {
        id: cleanId(w.id),
        name: name || "My backdrop",
        sky,
        picture: cleanPicture(w.picture),
        layers: (Array.isArray(w.layers) ? w.layers : []).slice(0, MAX_LAYERS).map(cleanLayer),
    };
}
/** the backdrops you've made, as kept in your settings (synced and exported with them): each one checked, one per id, at
 * most MAX_BACKDROPS (and no more than a hundred looked at, however long a list someone hands over) */
export function myBackdrops(list: unknown): Backdrop[] {
    const seen = new Set<string>(),
        out: Backdrop[] = [];
    for (const raw of (Array.isArray(list) ? list : []).slice(0, 100)) {
        if (out.length >= MAX_BACKDROPS) break;
        const w = cleanBackdrop(raw);
        if (seen.has(w.id)) continue;
        seen.add(w.id);
        out.push(w);
    }
    return out;
}

// ── sharing as a file ──
export function toFile(w: Backdrop): string {
    return JSON.stringify({ kind: FILE_KIND, v: FILE_V, backdrop: { ...w, id: undefined } }, null, 1);
}
/** a backdrop from a file someone gave you. It gets a new id, so it never replaces one of yours */
export function fromFile(text: string): Backdrop {
    let o: Record<string, unknown>;
    try {
        o = JSON.parse(text);
    } catch {
        throw new Error("That isn't a backdrop file.");
    }
    // files from before 1.0 called a backdrop a "world"
    const body = o && (o.kind === FILE_KIND ? o.backdrop : o.kind === "univerlist-world" ? o.world : null);
    if (!body) throw new Error("That isn't a backdrop file.");
    if (Number(o.v) > FILE_V)
        throw new Error("That backdrop was made with a newer UniverList. Update the app to open it.");
    return cleanBackdrop({ ...(body as object), id: newId() });
}

// ── somewhere to start ──
const L = (p: Partial<Layer>) => cleanLayer(p);
export const STARTERS: { name: string; make: () => Omit<Backdrop, "id"> }[] = [
    {
        name: "Fireflies",
        make: () => ({
            name: "Fireflies",
            sky: ["#05080a", "#0c1a12"],
            picture: null,
            layers: [
                L({
                    shape: "dot",
                    color: "#e9f58a",
                    count: 70,
                    size: 3,
                    speed: 0.25,
                    angle: 270,
                    wobble: 0.8,
                    twinkle: 0.9,
                    opacity: 0.9,
                    depth: 0.6,
                }),
            ],
        }),
    },
    {
        name: "Snowfall",
        make: () => ({
            name: "Snowfall",
            sky: ["#0b1220", "#26344d"],
            picture: null,
            layers: [
                L({
                    shape: "dot",
                    color: "#ffffff",
                    count: 120,
                    size: 2,
                    speed: 0.5,
                    angle: 95,
                    wobble: 0.4,
                    opacity: 0.6,
                    depth: 0.2,
                }),
                L({
                    shape: "dot",
                    color: "#ffffff",
                    count: 40,
                    size: 4,
                    speed: 1,
                    angle: 100,
                    wobble: 0.5,
                    opacity: 0.85,
                    depth: 0.9,
                }),
            ],
        }),
    },
    {
        name: "Petals",
        make: () => ({
            name: "Petals",
            sky: null,
            picture: null,
            layers: [
                L({
                    shape: "petal",
                    color: "#f4a7c0",
                    count: 36,
                    size: 9,
                    speed: 0.6,
                    angle: 115,
                    wobble: 0.7,
                    opacity: 0.75,
                    depth: 0.7,
                }),
            ],
        }),
    },
    {
        name: "Starfield",
        make: () => ({
            name: "Starfield",
            sky: ["#02030a", "#0a0820"],
            picture: null,
            layers: [
                L({
                    shape: "dot",
                    color: "#ffffff",
                    count: 220,
                    size: 1.2,
                    speed: 0.05,
                    angle: 180,
                    wobble: 0,
                    twinkle: 0.7,
                    opacity: 0.8,
                    depth: 0.1,
                }),
                L({
                    shape: "star",
                    color: "accent",
                    count: 14,
                    size: 7,
                    speed: 0.08,
                    angle: 180,
                    twinkle: 0.9,
                    opacity: 0.9,
                    depth: 0.5,
                }),
            ],
        }),
    },
    { name: "Blank", make: () => ({ name: "My backdrop", sky: null, picture: null, layers: [] }) },
];
