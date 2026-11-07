// src/features/backdrops/engine.ts
// ─────────────────────────────────────────────────────────────────
//  Backdrops: drawing one
//
//  One <canvas> behind the page. Each layer's shape is drawn once onto a small sprite, and every frame just stamps the
//  sprites where they've drifted to, which keeps even 300 shapes cheap.
//    Calm: about 30 frames a second. Alive: 60, and the layers shift with scroll and the pointer, near ones more.
//    Still (or your system's reduce-motion): one frame, then nothing runs. A hidden tab draws nothing.
//  The canvas is drawn at no more than 1.5× the screen's pixels: it's a soft background, and that halves the work on
//  sharp phone screens.
// ─────────────────────────────────────────────────────────────────

import type { Layer, Shape, Backdrop } from "./backdrop";

type Bit = { x: number; y: number; r: number; phase: number; spin: number }; // r: 0.5 to 1, this shape's share of the size
type Live = { layer: Layer; sprite: HTMLCanvasElement; bits: Bit[] };
type Look = { level: "off" | "calm" | "alive"; accent: string; x: number; y: number; scroll: number };

function path(c: CanvasRenderingContext2D, shape: Shape, s: number) {
    const h = s / 2;
    c.beginPath();
    if (shape === "dot") c.arc(h, h, h * 0.9, 0, Math.PI * 2);
    else if (shape === "ring") c.arc(h, h, h * 0.75, 0, Math.PI * 2);
    else if (shape === "square") c.rect(s * 0.15, s * 0.15, s * 0.7, s * 0.7);
    else if (shape === "triangle") {
        c.moveTo(h, s * 0.08);
        c.lineTo(s * 0.92, s * 0.85);
        c.lineTo(s * 0.08, s * 0.85);
    } else if (shape === "star")
        for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI) / 5 - Math.PI / 2,
                r = i % 2 ? h * 0.4 : h * 0.95;
            c.lineTo(h + r * Math.cos(a), h + r * Math.sin(a));
        }
    else if (shape === "heart") {
        c.moveTo(h, s * 0.85);
        c.bezierCurveTo(s * -0.1, s * 0.45, s * 0.25, s * 0.02, h, s * 0.3);
        c.bezierCurveTo(s * 0.75, s * 0.02, s * 1.1, s * 0.45, h, s * 0.85);
    } else if (shape === "petal") c.ellipse(h, h, h * 0.45, h * 0.9, 0.5, 0, Math.PI * 2);
    else if (shape === "streak") c.rect(h - Math.max(0.6, s * 0.04), 0, Math.max(1.2, s * 0.08), s);
    c.closePath();
}
/** one shape, drawn once, with a soft glow; stamped many times a frame */
function sprite(l: Layer, accent: string, dpr: number): HTMLCanvasElement {
    const s = Math.ceil(l.size * 2 * dpr) + 4,
        cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const c = cv.getContext("2d")!,
        col = l.color === "accent" ? accent : l.color,
        pad = 2;
    c.translate(pad, pad);
    c.shadowColor = col;
    c.shadowBlur = l.shape === "dot" || l.shape === "star" ? s * 0.25 : 0;
    path(c, l.shape, s - pad * 2);
    if (l.shape === "ring") {
        c.strokeStyle = col;
        c.lineWidth = Math.max(1, s * 0.08);
        c.stroke();
    } else {
        c.fillStyle = col;
        c.fill();
    }
    return cv;
}

// a picture bigger than this on a side is left out: decoding and drawing it would be too heavy (a small file can still
// hold a huge flat image). Pictures made here are 1600 px at most (picture.ts).
const MAX_SIDE = 4096,
    ZOOM_MAX = 1.14; // the most a picture is zoomed in (it breathes between 1.02 and 1.14)

export class Painter {
    private c: CanvasRenderingContext2D;
    private live: Live[] = [];
    private img: HTMLImageElement | null = null;
    private pic: HTMLCanvasElement | null = null; // the picture made ready at screen size, blurred once (not every frame)
    private w = 0;
    private h = 0;
    private dpr = 1;
    private raf = 0;
    private last = 0;
    private t = 0;
    private backdrop: Backdrop | null = null;
    look: Look = { level: "calm", accent: "#d4ad55", x: 0, y: 0, scroll: 0 };

    constructor(private cv: HTMLCanvasElement) {
        this.c = cv.getContext("2d", { alpha: true })!;
    }
    /** show this backdrop (or none) */
    set(backdrop: Backdrop | null) {
        this.backdrop = backdrop;
        this.img = this.pic = null;
        if (backdrop?.picture) {
            const img = new Image();
            img.onload = () => {
                if (this.backdrop !== backdrop) return; // another backdrop came along while this loaded
                if (img.naturalWidth > MAX_SIDE || img.naturalHeight > MAX_SIDE) return;
                this.img = img;
                this.prep();
                this.frame();
            };
            img.src = backdrop.picture.src;
        }
        this.size(true);
    }
    /** the picture at the size it's drawn (covering the screen at its most zoomed in), with its blur done once */
    private prep() {
        const img = this.img,
            p = this.backdrop?.picture;
        if (!img || !p) return void (this.pic = null);
        const sc = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight) * ZOOM_MAX * this.dpr,
            cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.naturalWidth * sc));
        cv.height = Math.max(1, Math.round(img.naturalHeight * sc));
        const c = cv.getContext("2d")!;
        if (p.blur) c.filter = `blur(${p.blur * this.dpr}px)`;
        c.drawImage(img, 0, 0, cv.width, cv.height);
        this.pic = cv;
    }
    /** the window changed size (or the backdrop did): fit the canvas and scatter the shapes again */
    size(scatter = false) {
        const dpr = Math.min(1.5, devicePixelRatio || 1),
            w = Math.max(1, innerWidth),
            h = Math.max(1, innerHeight);
        if (!scatter && w === this.w && h === this.h && dpr === this.dpr) return;
        Object.assign(this, { w, h, dpr });
        this.cv.width = Math.round(w * dpr);
        this.cv.height = Math.round(h * dpr);
        this.prep();
        this.live = (this.backdrop?.layers || []).map(layer => ({
            layer,
            sprite: sprite(layer, this.look.accent, dpr),
            bits: Array.from({ length: layer.count }, () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                r: 0.5 + Math.random() * 0.5,
                phase: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 0.02,
            })),
        }));
        this.run();
    }
    /** the theme's accent changed: shapes in "accent" are drawn again in it */
    setAccent(accent: string) {
        if (accent === this.look.accent) return;
        this.look.accent = accent;
        for (const l of this.live) l.sprite = sprite(l.layer, accent, this.dpr);
        this.frame();
    }
    /** start or stop the loop to match the motion level and whether the tab is showing */
    run() {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.frame();
        if (this.look.level !== "off" && this.backdrop && !document.hidden) this.raf = requestAnimationFrame(this.tick);
    }
    stop() {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
    }
    private tick = (now: number) => {
        this.raf = requestAnimationFrame(this.tick);
        const gap = this.look.level === "alive" ? 15 : 31; // calm is half the frames: it's slow anyway
        if (now - this.last < gap) return;
        const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
        this.last = now;
        this.t += dt;
        for (const { layer: l, bits } of this.live) {
            const a = (l.angle * Math.PI) / 180,
                v = l.speed * 40;
            for (const b of bits) {
                b.x += Math.cos(a) * v * b.r * dt;
                b.y += Math.sin(a) * v * b.r * dt;
                const m = l.size * 2;
                // off one edge: back in at the other
                if (b.x < -m) b.x += this.w + m * 2;
                else if (b.x > this.w + m) b.x -= this.w + m * 2;
                if (b.y < -m) b.y += this.h + m * 2;
                else if (b.y > this.h + m) b.y -= this.h + m * 2;
            }
        }
        this.frame();
    };
    /** draw the backdrop as it is now */
    frame() {
        const c = this.c,
            t = this.t,
            { w, h, dpr, backdrop, look } = this;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        if (!backdrop) return;
        if (backdrop.sky) {
            const g = c.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, backdrop.sky[0]);
            g.addColorStop(1, backdrop.sky[1]);
            c.fillStyle = g;
            c.fillRect(0, 0, w, h);
        }
        const p = backdrop.picture,
            img = this.pic;
        if (p && img && p.opacity > 0) {
            // cover the screen, with room to drift: a slow pan across, or a slow breath in and out
            const still = look.level === "off",
                zoom = p.motion === "zoom" && !still ? 1.08 + 0.06 * Math.sin(t / 9) : 1.08,
                sc = Math.max(w / img.width, h / img.height) * zoom,
                iw = img.width * sc,
                ih = img.height * sc,
                dx = p.motion === "pan" && !still ? Math.sin(t / 14) * (iw - w) * 0.45 : 0;
            c.globalAlpha = p.opacity;
            c.drawImage(img, (w - iw) / 2 + dx, (h - ih) / 2, iw, ih);
            c.globalAlpha = 1;
        }
        const alive = look.level === "alive";
        for (const { layer: l, sprite: s, bits } of this.live) {
            // Alive: near layers (depth 1) move most with the pointer and scroll
            const px = alive ? -look.x * 40 * l.depth : 0,
                py = alive ? -look.y * 30 * l.depth - ((look.scroll * 0.15 * l.depth) % h) : 0;
            for (const b of bits) {
                const tw = l.twinkle ? 1 - l.twinkle * (0.5 + 0.5 * Math.sin(t * 2 + b.phase)) : 1,
                    sway = l.wobble ? Math.sin(t * 0.8 + b.phase) * l.wobble * l.size * 2 : 0,
                    size = l.size * 2 * b.r;
                c.globalAlpha = l.opacity * tw * (0.55 + 0.45 * b.r);
                let x = b.x + sway + px,
                    y = b.y + py;
                if (y < -size) y += h + size;
                const turn =
                    l.shape === "petal" || l.shape === "square" || l.shape === "triangle" || l.shape === "heart";
                if (turn) {
                    c.save();
                    c.translate(x, y);
                    c.rotate(b.phase + t * b.spin * 30 * l.speed);
                    c.drawImage(s, -size / 2, -size / 2, size, size);
                    c.restore();
                } else {
                    if (l.shape === "streak") {
                        // rain and the like point the way they fall
                        c.save();
                        c.translate(x, y);
                        c.rotate(((l.angle - 90) * Math.PI) / 180);
                        c.drawImage(s, -size / 2, -size / 2, size, size);
                        c.restore();
                        continue;
                    }
                    x -= size / 2;
                    y -= size / 2;
                    c.drawImage(s, x, y, size, size);
                }
            }
        }
        c.globalAlpha = 1;
    }
}
