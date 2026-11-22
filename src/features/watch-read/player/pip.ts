// src/features/watch-read/player/pip.ts
// ─────────────────────────────────────────────────────────────────
//  Picture-in-picture with the subtitles, in Chrome and Edge, and the video that's playing wherever it is
//
//  Chrome and Edge draw no subtitles in their own picture-in-picture window. Where they offer a window the page can
//  fill instead (Document Picture-in-Picture), I moves the player's stage there (the video, its subtitles, play and
//  the jumps), and back when it closes, still playing; the next episode moves in by itself. Elsewhere I asks for the
//  browser's own picture-in-picture, which in Safari, Firefox and Zen draws the subtitles itself (subtitles.ts).
//  Chrome can also open it by itself when you leave the tab while something plays (its "automatic picture-in-picture",
//  asked through the media session), where the browser allows it.
//  Everything that needs the playing video asks playingVideo(): it's in the player, or in the small window.
// ─────────────────────────────────────────────────────────────────

interface DocPip {
    requestWindow(o?: { width?: number; height?: number }): Promise<Window>;
}
const docPip = (): DocPip | null => (Reflect.get(window, "documentPictureInPicture") as DocPip | undefined) ?? null;

// the small window, the stage in it (null between two episodes), and the mark where the stage goes back to
let open: { win: Window; stage: HTMLElement | null; home: Comment | null } | null = null;
let gone: ReturnType<typeof setTimeout> | undefined;

/** the video playing now: in the player, or in the small window */
export const playingVideo = (): HTMLVideoElement | null =>
    document.querySelector<HTMLVideoElement>("#cinema video") ||
    open?.win.document.querySelector<HTMLVideoElement>(".cin-stage video") ||
    null;

/** the stage goes back where it came from (or, if the player has moved on, nowhere), and the small window closes */
function pipClose() {
    if (!open) return;
    const { win, stage, home } = open;
    open = null;
    clearTimeout(gone);
    if (stage && home?.isConnected) home.replaceWith(stage);
    else home?.remove();
    try {
        win.close();
    } catch (_) {}
}
/** moves a stage into the small window, leaving a mark where it was */
function moveIn(stage: HTMLElement) {
    if (!open) return;
    const home = document.createComment("in picture-in-picture");
    stage.replaceWith(home);
    open.win.document.querySelector(".pip-host")?.append(stage);
    open.stage = stage;
    open.home = home;
}
/** I: the player in a small window of its own, or back */
export async function pipToggle(v: HTMLVideoElement, keys: (e: KeyboardEvent) => void) {
    if (open) return pipClose();
    const D = docPip(),
        stage = v.closest<HTMLElement>(".cin-stage");
    if (!D || !stage) {
        // the browser's own: Safari, Firefox and Zen draw the subtitles in it
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {});
        else {
            const mode: unknown = Reflect.get(v, "webkitSetPresentationMode");
            if (typeof mode === "function") mode.call(v, "picture-in-picture");
        }
        return;
    }
    const ratio = v.videoWidth && v.videoHeight ? v.videoHeight / v.videoWidth : 9 / 16;
    let win: Window;
    try {
        win = await D.requestWindow({ width: 480, height: Math.round(480 * ratio) });
    } catch (_) {
        return;
    }
    const doc = win.document;
    // the page's look: its stylesheets (by address, so fonts and pictures in them still resolve), its theme
    for (const el of document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
        doc.head.append(el.cloneNode(true));
    doc.documentElement.className = document.documentElement.className;
    doc.documentElement.setAttribute("style", document.documentElement.getAttribute("style") || "");
    doc.body.className = document.body.className;
    doc.title = document.title;
    // the player's subtitle settings (size, height, background) are on #cinema: the stage takes them along
    const host = doc.createElement("div");
    host.className = "plr idle pip-host";
    host.setAttribute("style", document.querySelector("#cinema")?.getAttribute("style") || "");
    doc.body.append(host);
    open = { win, stage: null, home: null };
    moveIn(stage);
    // the player's keys work in it too; closing it brings the stage back
    win.addEventListener("keydown", keys);
    win.addEventListener("pagehide", () => {
        if (open?.win !== win) return;
        const { stage: s, home } = open;
        open = null;
        clearTimeout(gone);
        if (s && home?.isConnected) home.replaceWith(s);
        else home?.remove();
    });
}
/** a video's stage is going (another episode, the player closing): the window waits a moment for the next one, and
 *  closes if none comes */
export function pipLetGo(stage: HTMLElement | null) {
    if (!open || !stage || open.stage !== stage) return;
    open.home?.remove();
    open.stage = open.home = null;
    clearTimeout(gone);
    gone = setTimeout(() => {
        if (open && !open.stage) pipClose();
    }, 1500);
}
/** a new video's stage: if the small window is open (the episode before was in it), it moves in */
export function pipTakeIn(v: HTMLVideoElement) {
    const stage = v.closest<HTMLElement>(".cin-stage");
    if (!open || open.stage || !stage) return;
    clearTimeout(gone);
    moveIn(stage);
}
/** Chrome opening it by itself when you leave the tab while something plays (where it allows that): from the time a
 *  video starts until it goes */
export function pipOnLeave(v: HTMLVideoElement, keys: (e: KeyboardEvent) => void, signal: AbortSignal) {
    if (!docPip() || !("mediaSession" in navigator)) return;
    const set = (fn: (() => void) | null) => {
        try {
            navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, fn);
        } catch (_) {
            // a browser that doesn't know the action
        }
    };
    set(() => {
        if (!open) pipToggle(v, keys);
    });
    signal.addEventListener("abort", () => set(null));
}
