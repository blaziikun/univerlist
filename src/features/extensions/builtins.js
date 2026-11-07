// src/features/extensions/builtins.js
// ─────────────────────────────────────────────────────────────────
//  Built-in extensions: parts of the app you can switch off, listed beside the extensions you add
//
//  UniverList is your library first; the rest grows on top of it. Watch & read is the first of these: switched off,
//  nothing of it shows or runs (no menu entry, no Watch or Read buttons on cards, no W key, no player) and the app
//  stays lean; your progress, saved links and servers are kept for when you switch it back on. Extensions that play or
//  read (your own files on another machine, say) plug into it through the extension system: watch.sources, read.sources
//  and series servers.
// ─────────────────────────────────────────────────────────────────

const BUILTINS = [
    {
        id: "account",
        name: "Account & sync",
        jobs: [],
        desc: "Sign in with a passkey and keep your library in step between your devices: sign in on a new one and it's all there. It's encrypted on your device before it goes anywhere, and only your devices (and your recovery code) can unlock it: the server can't read it. Add your phone by scanning a code.",
    },
    {
        id: "watch-read",
        name: "Watch & read",
        jobs: ["watch.sources", "read.sources"],
        desc: "A player and a reader inside UniverList: episodes and films from your files, your servers (Jellyfin, Plex, Emby, Komga, Kavita, OPDS, shared folders) and extensions; manga, manhwa, comics and books in a reader you set up your way. Watching and reading update your library as you go.",
    },
    {
        id: "learning-centre",
        name: "Learning Centre",
        jobs: [],
        desc: "A mode for what you're learning (after Games, like any mode): Courses (academic ones and interests), each one place for everything: your level and how much you've finished, what to read in what order (knowing what each book needs first), and its years, modules, topics, marks and what it takes to graduate; and Curricula (what different universities teach, topic by topic, with the books they set). It starts empty; fetch modules and reading lists from universities' own pages. Switched off, your academic books show under Literature.",
    },
    {
        id: "backdrops",
        name: "Backdrop builder (beta)",
        jobs: [],
        off: true,
        desc: "Make your own moving background for any theme: drifting shapes and particles (dots, stars, petals, rain…) over a sky of two colours or a picture of your own, playing as you change it. Share one as a small file, or open one someone made (it's checked first: a backdrop is only shapes, colours and a picture). It's drawn on your device and follows your motion setting. Off until you switch it on; switched off, themes using one of yours show their usual backdrop.",
    },
];
// on unless you switched it off; any marked off: true stay off until you switch them on
function builtinOn(id) {
    const B = meta.settings.builtins || {};
    return id in B ? B[id] !== false : !(BUILTINS.find(b => b.id === id) || {}).off;
}
function stageOn() {
    return builtinOn("watch-read");
}
function stageOffNote() {
    toast("Watch & read is switched off", { label: "Switch it on", fn: () => builtinSet("watch-read", true) });
}
function builtinSet(id, on) {
    meta.settings.builtins = { ...(meta.settings.builtins || {}), [id]: !!on };
    markDirty();
    if (id === "learning-centre" && !on && ui.mode === "academic") {
        ui.mode = "universal";
        ui.tab = tabOnEnter("universal");
    }
    if (id === "backdrops") applyTheme(); // a theme on one of your backdrops switches to (or back from) its usual one
    if (id === "watch-read" && !on) {
        if (W.player) {
            W.player = null;
            renderPlayer();
        }
        if (typeof RD !== "undefined" && (RD.pages || RD.chapters)) {
            readerDrop();
            renderReader();
        }
        if (ui.page === "watch" || ui.page === "read") ui.page = "profile";
        if (ui.settingsFrom && /^(watch|read)$/.test(ui.settingsFrom.page || ""))
            ui.settingsFrom = { page: "profile", y: 0 };
    }
    render();
    toast(
        `${(BUILTINS.find(b => b.id === id) || {}).name || id} ${on ? "is on" : "is off; everything of yours in it is kept"}`
    );
}
// Settings › Extensions › Built in (sections/Extensions.svelte draws it): its switches
document.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset && t.dataset.builtin) {
        builtinSet(t.dataset.builtin, t.checked);
        if (ui.page === "settings") renderMain();
    }
});
