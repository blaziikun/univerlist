// src/features/core/core.js
// ─────────────────────────────────────────────────────────────────
//  Core: the media model, modes, storage, privacy, history and sync
// ─────────────────────────────────────────────────────────────────
"use strict";

const APP_V = 9;
// medium → definition. group: read/watch/play decides the verbs.
const MEDIA = {
    book: {
        name: "Books",
        one: "book",
        g: "¶",
        code: "BK",
        group: "read",
        unit: ["page", "pages", "p."],
        steps: [10, 25],
        color: "#c9a24a",
    },
    manga: {
        name: "Manga",
        one: "manga",
        g: "◧",
        code: "MNG",
        group: "read",
        unit: ["chapter", "chapters", "ch."],
        steps: [1, 5],
        color: "#e06c6c",
    },
    manhwa: {
        name: "Manhwa",
        one: "manhwa",
        g: "◨",
        code: "MHW",
        group: "read",
        unit: ["chapter", "chapters", "ch."],
        steps: [1, 5],
        color: "#e58ac0",
    },
    novel: {
        name: "Light novels",
        one: "light novel",
        g: "§",
        code: "LN",
        group: "read",
        unit: ["chapter", "chapters", "ch."],
        steps: [1, 3],
        color: "#b394ee",
    },
    comic: {
        name: "Western comics",
        one: "comic",
        g: "▦",
        code: "CMX",
        group: "read",
        unit: ["issue", "issues", "#"],
        steps: [1, 3],
        color: "#ef9850",
    },
    anime: {
        name: "Anime",
        one: "anime",
        g: "◉",
        code: "ANI",
        group: "watch",
        unit: ["episode", "episodes", "ep."],
        steps: [1, 3],
        color: "#5ea8f2",
    },
    tv: {
        name: "TV",
        one: "show",
        g: "▭",
        code: "TV",
        group: "watch",
        unit: ["episode", "episodes", "ep."],
        steps: [1, 2],
        color: "#4fc3b3",
    },
    film: {
        name: "Film",
        one: "film",
        g: "⊚",
        code: "FLM",
        group: "watch",
        unit: ["minute", "minutes", "min"],
        steps: [],
        color: "#e5675a",
    },
    game: {
        name: "Games",
        one: "game",
        g: "◆",
        code: "GAM",
        group: "play",
        unit: ["hour", "hours", "h"],
        steps: [1, 2],
        color: "#6cc56f",
    },
    // music: albums (and EPs, singles, live albums…), from MusicBrainz (src/features/music)
    album: {
        name: "Music",
        one: "album",
        g: "♫",
        code: "MUS",
        group: "listen",
        unit: ["track", "tracks", "tr."],
        steps: [1, 3],
        color: "#d98fd0",
    },
};
const MEDIA_KEYS = Object.keys(MEDIA);
// the type of each medium: what a mode's shelves can split on
// which types always stay in the private collection is your choice; that list is kept encrypted inside the collection itself
const sealedKinds = () => (vault.prefs && vault.prefs.kinds) || {};
const isSealed = b => !!b.sealed || (sealedKinds()[b.medium] || []).includes(b.kind);
const kindsOf = medium => [
    ...new Set([
        ...(KINDS[medium] || []),
        ...(ui.private ? sealedKinds()[medium] || [] : []),
        ...(typeof libKinds === "function" ? libKinds(medium) : []),
    ]),
];
const KINDS = {
    book: ["Novel", "Non-fiction", "Academic", "Poetry", "Short stories", "Graphic memoir", "Play"],
    manga: ["Manga", "One-shot", "Doujin"],
    manhwa: ["Manhwa", "Manhua", "Webtoon"],
    novel: ["Light novel", "Web novel"],
    comic: ["Western comic", "Graphic novel", "Webcomic"],
    anime: ["TV", "Movie", "OVA", "ONA", "Special", "Short"],
    tv: [
        "Live action",
        "Western animation",
        "Stop-motion",
        "K-drama",
        "C-drama",
        "J-drama",
        "Miniseries",
        "Documentary",
        "Reality",
    ],
    film: ["Hollywood", "Bollywood", "Indian cinema", "World cinema", "Animated", "Anime film", "Documentary", "Short"],
    game: ["Console & PC", "Mobile", "Browser", "Visual novel", "Tabletop"],
    album: ["Album", "EP", "Single", "Live", "Compilation", "Soundtrack", "Mixtape"],
};
// the five big families everything rolls up into
const CATS = [
    ["books", "Books", ["book", "novel"]],
    ["comics", "Comics", ["manga", "manhwa", "comic"]],
    ["tv", "TV", ["anime", "tv"]],
    ["film", "Film", ["film"]],
    ["games", "Games", ["game"]],
    ["music", "Music", ["album"]],
];
const catOf = b =>
    b.medium === "anime" && b.kind === "Movie" ? "film" : (CATS.find(c => c[2].includes(b.medium)) || CATS[0])[0];
// ── modes: lenses over the library. Each has its own media, shelves, theme and profile. ──
// Film & TV's shelves: films, series, and K, C and J dramas, which show once you have one (dramas are TV, not a mode of their own)
function DRAMA_SHELVES() {
    return [
        { name: "Films", match: ["film", "!film:Anime film"] },
        { name: "Series", match: ["tv", "!tv:K-drama", "!tv:C-drama", "!tv:J-drama"] },
        ...["K-drama", "C-drama", "J-drama"].map(k => ({ name: k, match: ["tv:" + k], ifAny: true })),
    ];
}
const DEFAULT_MODES = [
    {
        id: "universal",
        name: "Hub",
        g: "✦",
        match: ["*", "!book:Academic", "!game", "!album"],
        theme: "galaxy",
        view: "cover",
        group: "status",
        sort: "rank",
        vz: { grid: { z: 1, gap: 0.7, titles: true }, cover: { z: 1.15, gap: 0.4, titles: false } },
        shelves: [
            { name: "Culture", match: ["anime", "film:Anime film", "manga", "manhwa", "novel"] },
            { name: "Literature", match: ["book", "comic"] },
            { name: "Film", match: ["film", "!film:Anime film"] },
            { name: "TV", match: ["tv"] },
        ],
    },
    {
        id: "animanga",
        name: "Culture",
        g: "◉",
        match: ["anime", "film:Anime film", "manga", "manhwa", "novel"],
        theme: "arghnime",
        view: "grid",
        group: "kind",
        sort: "rank",
        gsort: { "status:done": "rank" },
        vz: { grid: { z: 1.3, gap: 1, titles: true } },
        extra: ["seasonal"],
        shelves: [
            { name: "Anime", match: ["anime", "film:Anime film"] },
            { name: "Manga", match: ["manga"] },
            { name: "Manhwa & manhua", match: ["manhwa"] },
            { name: "Light novels", match: ["novel"] },
        ],
    },
    {
        id: "novels",
        name: "Literature",
        g: "¶",
        match: ["book", "!book:Academic", "comic"],
        theme: "leather",
        view: "spine",
        group: "status",
        extra: ["series", "quotes"],
        shelves: [
            { name: "Books", match: ["book"] },
            { name: "Comics", match: ["comic"] },
        ],
    },
    {
        id: "screen",
        name: "Film & TV",
        g: "⊚",
        dramas2: true,
        match: ["film", "!film:Anime film", "tv"],
        theme: "anilist",
        view: "cover",
        group: "status",
        sort: "rank",
        extra: ["diary"],
        shelves: DRAMA_SHELVES(),
    },
    {
        id: "games",
        name: "Games",
        g: "◆",
        match: ["game"],
        theme: "neon",
        view: "cover",
        group: "status",
        extra: ["playing"],
        shelves: "kind",
    },
    {
        id: "academic",
        name: "Learning Centre",
        g: "∫",
        space: "learning-centre",
        match: ["book:Academic"],
        theme: "library",
        view: "list",
        group: "status",
        extra: ["learn", "curricula"],
        offTabs: ["overview"],
        tabsV17: true,
        lc1: true,
        lc2: true,
        shelves: "subject",
        blocks: [
            { k: "summary", w: 12 },
            { k: "learn", w: 12 },
            { k: "paths", w: 8 },
            { k: "progress", w: 4 },
            { k: "recent", w: 8 },
            { k: "shelves", w: 12 },
        ],
    },
    {
        id: "music",
        name: "Music",
        g: "♫",
        match: ["album"],
        theme: "noir",
        view: "grid",
        group: "status",
        sort: "rank",
        shelves: "kind",
        // the usual overview, minus Characters: albums have songs, not characters
        blocks: [
            { k: "summary", w: 12 },
            { k: "favs", w: 8, rows: 3 },
            { k: "health", w: 4 },
            { k: "lists", w: 8 },
            { k: "genres", w: 4 },
            { k: "nextup", w: 4 },
        ],
    },
];
// the private collection's own mode: its name and look are stored encrypted with it
const SEALED_BASE = {
    id: "sealed",
    name: "Private",
    g: "◐",
    match: ["*"],
    sealedOnly: true,
    theme: "noir",
    view: "cover",
    group: "status",
    shelves: "medium",
    profile: {},
};
const SEALED_MODE = { ...SEALED_BASE };
const SHELF_AUTO = [
    ["kind", "Split by type"],
    ["subject", "Split by subject"],
    ["genre", "Split by genre"],
    ["medium", "Split by medium"],
    ["none", "One shelf"],
];
const patOk = (b, p) => {
    if (p === "*") return true;
    const [m, k] = p.split(":");
    return b.medium === m && (k === undefined || (b.kind || "") === k);
};
function matchPats(b, pats) {
    const pos = pats.filter(p => !p.startsWith("!")),
        neg = pats.filter(p => p.startsWith("!")).map(p => p.slice(1));
    return (!pos.length || pos.some(p => patOk(b, p))) && !neg.some(p => patOk(b, p));
}
const modeById = id => {
    const m = id === SEALED_MODE.id && ui.private ? SEALED_MODE : meta.modes.find(x => x.id === id);
    return m && !spaceOff(m) ? m : meta.modes[0];
};
const isSpace = m => !!(m && m.space);
// every mode you can go to, in your order: an extension's mode (the Learning Centre) only while it's switched on
const allModes = () => {
    const M = meta.modes.filter(m => !spaceOff(m) && !m.hidden);
    return ui.private ? [...M, SEALED_MODE] : M;
};
// the spaces that are switched on (official built-in extensions with a library of their own)
const spaceModes = () => meta.modes.filter(m => isSpace(m) && typeof builtinOn === "function" && builtinOn(m.space));
const spaceOff = m => isSpace(m) && typeof builtinOn === "function" && !builtinOn(m.space);
const curMode = () => modeById(ui.mode);
const lcOff = () => typeof builtinOn === "function" && !builtinOn("learning-centre");
const modePats = mode => {
    const P = mode.match || ["*"];
    return lcOff() && !isSpace(mode) ? P.filter(p => p !== "!book:Academic") : P;
};
const inMode = (b, mode = curMode()) =>
    (mode.sealedOnly ? isSealed(b) : !isSealed(b)) &&
    !spaceOff(mode) &&
    (b.modeHome && !mode.sealedOnly ? homeShows(b, mode) : matchPats(b, modePats(mode)));
// a thing you moved lives in its new mode, and in catch-all modes like Hub (unless Hub leaves that mode's kind out); nowhere else
function homeShows(b, mode) {
    const home = meta.modes.find(x => x.id === b.modeHome);
    if (!home) return matchPats(b, mode.match || ["*"]);
    if (home.id === mode.id) return true;
    if (!(mode.match || []).includes("*")) return false;
    return (home.match || [])
        .filter(p => !p.startsWith("!") && p !== "*")
        .some(p => {
            const [m, k] = p.split(":");
            return matchPats({ medium: m, kind: k || "" }, mode.match);
        });
}
// shelves of a mode, resolved against what's actually in it
function shelvesOf(mode = curMode()) {
    if (Array.isArray(mode.shelves)) {
        const S = mode.shelves.map((s, i) => ({
            key: "s" + i,
            name: s.name,
            test: b => matchPats(b, s.match),
            ifAny: s.ifAny,
        }));
        if (!S.some(s => s.ifAny)) return S;
        const has = new Set();
        for (const b of items.values())
            if (!b.hidden && !!b.private === !!ui.private && inMode(b, mode))
                for (const s of S) if (s.ifAny && !has.has(s.key) && s.test(b)) has.add(s.key);
        return S.filter(s => !s.ifAny || has.has(s.key));
    }
    const by = mode.shelves || "kind",
        seen = new Map();
    for (const b of items.values()) {
        if (!inMode(b, mode) || b.hidden || !!b.private !== !!ui.private) continue;
        const vals =
            by === "subject"
                ? [b.subject || "Other"]
                : by === "genre"
                  ? [(b.genres || [])[0] || "No genre"]
                  : by === "medium"
                    ? [MEDIA[b.medium].name]
                    : by === "none"
                      ? []
                      : [b.kind || MEDIA[b.medium].name];
        for (const v of vals) seen.set(v, (seen.get(v) || 0) + 1);
    }
    const key = b =>
        by === "subject"
            ? b.subject || "Other"
            : by === "genre"
              ? (b.genres || [])[0] || "No genre"
              : by === "medium"
                ? MEDIA[b.medium].name
                : b.kind || MEDIA[b.medium].name;
    const order =
        by === "subject"
            ? (a, b) => subjIndex(a) - subjIndex(b) || a.localeCompare(b)
            : (a, b) => seen.get(b) - seen.get(a) || a.localeCompare(b);
    return [...seen.keys()].sort(order).map(v => ({ key: "a:" + v, name: v, test: b => key(b) === v }));
}
const subjIndex = s => {
    const i = Object.keys(SUBJECTS).indexOf(s);
    return i < 0 ? 900 : i;
};
const shelfOfItem = (b, mode = curMode()) => shelvesOf(mode).find(s => s.test(b));
// standard book genres (what Goodreads, StoryGraph and libraries use), mapped from Open Library subjects and Google Books categories
const BOOK_GENRES = [
    ["Fantasy", /fantasy|magic|wizard|dragons?\b|sword and sorcery/],
    ["Science Fiction", /science fiction|sci-fi|space opera|cyberpunk|time travel|robots?\b|aliens?\b/],
    ["Dystopian", /dystopi|post-apocalyp/],
    ["Mystery", /myster|detective|whodunit|sleuth/],
    ["Thriller", /thriller|suspense|espionage|spy/],
    ["Crime", /\bcrime\b|murder|heist|criminals?\b/],
    ["Horror", /horror|ghost|haunted|vampire|zombie/],
    ["Romance", /romance|love stor/],
    ["Historical Fiction", /historical fiction|history.*fiction|fiction.*histor/],
    ["Literary Fiction", /literary fiction|literary\b|psychological fiction/],
    ["Contemporary", /contemporary|family life|domestic fiction/],
    ["Young Adult", /young adult|juvenile fiction|teen/],
    ["Classics", /classic/],
    ["Adventure", /adventure/],
    ["Humor", /humou?r|comedy|satire/],
    ["Magical Realism", /magic(al)? realism/],
    ["Mythology", /mytholog|myths?\b|legends?\b|folklore/],
    ["Paranormal", /paranormal|supernatural/],
    ["Short Stories", /short stories/],
    ["Poetry", /poetry|poems/],
    ["Graphic Novels", /graphic novel|comic/],
    ["Biography", /biograph/],
    ["Memoir", /memoir|autobiograph/],
    ["History", /^history|\bhistory\b(?!.*fiction)/],
    ["Philosophy", /philosoph|ethics|metaphysic|existential/],
    ["Psychology", /psycholog/],
    ["Science", /\bscience\b(?! fiction)|physics|biology|chemistry|astronom|cosmolog/],
    ["Mathematics", /mathemat|algebra|calculus|geometry|number theory/],
    ["Self Help", /self-help|self help|personal development/],
    ["Religion", /religio|theolog|christian|islam|buddhis|spiritual/],
    ["Politics", /politic|government/],
    ["Economics", /econom|finance|investing/],
    ["Business", /business|management/],
    ["Technology", /computer|technology|programming|software/],
    ["Nature", /nature|animals|ecology/],
    ["True Crime", /true crime/],
    ["Essays", /essays/],
    ["Art", /\bart\b|painting/],
    ["Music", /music/],
    ["Travel", /travel/],
    ["Sports", /sports?\b/],
];
function mapGenres(subjects) {
    const text = (subjects || []).map(x => String(x).toLowerCase());
    const out = [];
    for (const [g, re] of BOOK_GENRES) if (text.some(t => re.test(t))) out.push(g);
    return out.slice(0, 6);
}
const STATUS = ["redo", "done", "active", "want", "dnf", "paused"];
const STATUS_WORDS = {
    read: {
        redo: "Re-reading",
        want: "Plan to read",
        active: "Reading",
        done: "Read",
        paused: "Paused",
        dnf: "Dropped",
    },
    watch: {
        redo: "Rewatching",
        want: "Plan to watch",
        active: "Watching",
        done: "Watched",
        paused: "Paused",
        dnf: "Dropped",
    },
    play: {
        redo: "Replaying",
        want: "Plan to play",
        active: "Playing",
        done: "Played",
        paused: "Paused",
        dnf: "Dropped",
    },
    listen: {
        redo: "On repeat",
        want: "Plan to listen",
        active: "Listening",
        done: "Listened",
        paused: "Paused",
        dnf: "Dropped",
    },
    any: {
        redo: "Revisiting",
        want: "Planned",
        active: "In progress",
        done: "Finished",
        paused: "Paused",
        dnf: "Dropped",
    },
};
const statusWord = (s, medium) => (STATUS_WORDS[medium ? MEDIA[medium].group : "any"] || STATUS_WORDS.any)[s] || s;
const verbOf = medium =>
    ({
        read: ["Start reading", "Read again"],
        watch: ["Start watching", "Watch again"],
        play: ["Start playing", "Play again"],
        listen: ["Start listening", "Listen again"],
    })[MEDIA[medium].group];
const COPY = [
    ["none", "Don't own"],
    ["physical", "Physical"],
    ["digital", "Digital"],
    ["both", "Physical + digital"],
];
const copyWords = medium =>
    ({
        anime: ["DVD / Blu-ray", "Digital"],
        tv: ["DVD / Blu-ray", "Digital"],
        film: ["DVD / Blu-ray", "Digital"],
        game: ["Disc or cartridge", "Digital"],
        album: ["Vinyl, CD or cassette", "Digital"],
        book: ["Physical copy", "Ebook or audiobook"],
    })[medium] || ["Physical", "Digital"];
const LANES = [
    ["train", "Train"],
    ["home", "Home"],
];
const FORMATS = ["Short", "Long", "Series", "Textbook"];
const SUBJECTS = {
    Mathematics: ["∑", "MATH"],
    Aerospace: ["✈", "AERO"],
    Astrophysics: ["◉", "ASTR"],
    "Computer science": ["⌨", "COMP"],
    Electronics: ["⚡", "ELEC"],
    "Self & Identity": ["◐", "SELF"],
    "Mind & Consciousness": ["◌", "MIND"],
    "Theology & God": ["✶", "THEO"],
    "Ethics & Free Will": ["⚖", "ETHC"],
    Existential: ["∞", "EXST"],
    "Love & Attraction": ["♡", "LOVE"],
    "Intelligence & Nature": ["❋", "NATR"],
    "Understanding People": ["☍", "PEOP"],
    "Bittersweet truth": ["❦", "BIT"],
    "Mind games": ["♞", "MND"],
    "Crews and heists": ["⚿", "CRW"],
    "Slow burn": ["✧", "SLW"],
    "The performed self": ["◑", "PRF"],
    "Genius and identity": ["∴", "GEN"],
    "Born or made": ["⚘", "BRN"],
    "Loops and second chances": ["↻", "LOP"],
    "Grind and rise": ["▲", "GRD"],
    "Living through one": ["☉", "ONE"],
    Mystery: ["⌕", "MYS"],
    "Other worlds": ["✺", "WLD"],
    "Bonds and creatures": ["♧", "BND"],
    "Set aside": ["×", "SET"],
};
const SUBJECT_ORDER = Object.keys(SUBJECTS);
const FICTION_LANES = [
    "Bittersweet truth",
    "Mind games",
    "Crews and heists",
    "Slow burn",
    "The performed self",
    "Genius and identity",
    "Born or made",
    "Loops and second chances",
    "Grind and rise",
    "Living through one",
    "Mystery",
    "Other worlds",
    "Bonds and creatures",
    "Set aside",
];
const TAG_COLORS = [
    "#d9a441",
    "#5fb4e8",
    "#e26d5a",
    "#62c38c",
    "#b18ae8",
    "#e888b8",
    "#7fd1c7",
    "#d3c257",
    "#8e9bb3",
    "#f0955a",
];
const LINK_TYPES = [
    ["adaptation", "Adaptation of / adapted as"],
    ["sequel", "Sequel"],
    ["prequel", "Prequel"],
    ["side", "Side story or spin-off"],
    ["world", "Same world or franchise"],
    ["similar", "Feels similar"],
    ["creator", "Same creator"],
    ["custom", "Other"],
];
const LINK_NAME = Object.fromEntries(LINK_TYPES);
const FRANCHISE_TYPES = new Set(["adaptation", "sequel", "prequel", "side", "world"]);
const TIER_DEFAULT = [
    ["S", "#e5675a"],
    ["A", "#ef9850"],
    ["B", "#d3c257"],
    ["C", "#6cc56f"],
    ["D", "#5ea8f2"],
    ["F", "#8e9bb3"],
];

// ── utils ──
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s =>
    String(s ?? "").replace(
        /[&<>"']/g,
        c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
const slug = s =>
    String(s)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "item";
const norm = s =>
    String(s ?? "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
const cleanTitle = t =>
    String(t)
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s+(trilogy|duology)$/i, "")
        .replace(/—.*$/, "")
        .replace(/:\s.*$/, "")
        .trim();
// the title that identifies a work: subtitles count ("Legends: Arceus" isn't "Legends: Z-A"), bracketed notes don't
const idTitle = t => norm(String(t || "").replace(/\s*\([^)]*\)/g, ""));
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const nowISO = () => new Date().toISOString();
function hash(s) {
    let h = 0;
    for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h);
}
// the app's name; where "Support UniverList" goes (GitHub Sponsors: no fees on personal sponsorships; a copy can set its
// own under Settings › Advanced)
const APP_NAME = "UniverList",
    DONATE_URL = "https://univerlist.sayel.dev/sponsor", // public/_redirects says where these go
    // the AGPL asks that everyone using a hosted copy can get its code: a copy you change and host points this at yours
    SOURCE_URL = "https://univerlist.sayel.dev/source";
// a link made from data (an import, a catalogue, an extension, a shared pack) only ever opens a web page: never javascript:, data: or file:
// JSON from a file you import: a "__proto__" key in it is dropped, never turned into anything
const safeJSON = t => JSON.parse(t, (k, v) => (k === "__proto__" ? undefined : v));
const safeUrl = u => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
// dates as you chose them (Settings › General): 1 Nov 2026, Nov 1, 2026 or 2026-11-01
const fmtDate = iso => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const f = (meta.settings || {}).dateFmt;
    return f === "iso"
        ? d.toISOString().slice(0, 10)
        : d.toLocaleDateString(f === "mdy" ? "en-US" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const firstAuthor = a =>
    String(a || "")
        .split(/&|,| and /)[0]
        .trim();
const surname = a => norm(firstAuthor(a)).split(" ").pop();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const fmtHours = min => {
    const h = min / 60;
    return h >= 48 ? (h / 24).toFixed(1) + " days" : h >= 1 ? Math.round(h) + " h" : Math.round(min) + " min";
};
const fuzzy = d => (d && d.year ? new Date(Date.UTC(d.year, (d.month || 1) - 1, d.day || 1, 12)).toISOString() : null);
const stripMd = s =>
    String(s || "")
        .replace(/~!.*?!~/gs, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
let toastTimer;
function toast(msg, action) {
    $$(".toast").forEach(t => t.remove());
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="linkbtn">${esc(action.label)}</button>` : ""}`;
    if (action)
        t.querySelector("button").onclick = () => {
            t.remove();
            action.fn();
        };
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), action ? 6000 : 2800);
}

// ── state ──
const items = new Map();
var ITEMS_VER = 0; // bumped on every change, so the library slices can be cached
const DEFAULT_TABS = ["overview", "library", "favourites", "stats", "lists", "discover", "rank"];
const DEFAULT_LAYOUT = {
    side: { open: false, pinned: false, pos: "left", width: 190, text: "m" },
    tabs: DEFAULT_TABS.map(k => ({ k, on: k !== "rank" })),
    favView: "grid",
    favSplit: "together",
    charSplit: "together",
    charView: "grid",
    peopleView: "grid",
    uniExclude: [],
    shared: {
        blocks: [
            { k: "summary", w: 12 },
            { k: "favs", w: 8, rows: 3 },
            { k: "health", w: 4 },
            { k: "chars", w: 8, rows: 2 },
            { k: "genres", w: 4 },
            { k: "lists", w: 8 },
            { k: "nextup", w: 4 },
        ],
    },
};
const DEFAULT_SETTINGS = {
    appName: "UniverList",
    logo: "accent",
    startMode: "universal",
    theme: "",
    accent: "brass",
    density: "comfortable",
    defaultView: "spine",
    lastBackup: null,
    remindAfter: null,
    welcomed: false,
    fileName: "",
    titleLang: "en",
    region: "GB",
    hideFlagged: true,
    anilistUser: "",
    autoSync: false,
    imageProxy: true,
    ratingScale: "10d",
    advanced: false,
    keys: {},
    criteria: null,
    offlineAuto: true,
    features: {},
    speeds: { page: 1.6, chapter: 6, manhwa: 5, novel: 25, issue: 12 },
};
const meta = {
    tags: {},
    views: [],
    queue: [],
    dismissed: [],
    interests: { syncedAt: null, subjects: {}, seeds: [] },
    chars: [], // favourite characters
    people: [], // favourite creators, studios, actors
    tiers: [], // tier lists
    profile: { name: "", bio: "", avatar: "", avatarData: "", banner: "", bannerData: "", anilist: null },
    modes: clone(DEFAULT_MODES),
    lists: [], // custom and ordered lists (reading orders)
    favOrder: [], // one master favourites order; every mode shows its slice of it
    orders: {}, // shelf look: how each mode's shelf is arranged, by cover: { modeId: [ids] }
    myOrder: {}, // my order: ranking and watch order, used within each status group: { modeId: [ids] }
    themes: null, // the theme library, shared by every mode (filled from the presets)
    courses: { v: 2, subjects: [], paths: [] }, // the Learning Centre: your subjects and paths (stages → modules → readings)
    vault: null, // private entries, encrypted with your passphrase
    settings: clone(DEFAULT_SETTINGS),
    layout: clone(DEFAULT_LAYOUT),
    savedAt: null,
};
let KEYS = { tmdb: "", omdb: "", rawg: "", igdb: "" }; // keys live in this browser and in your backups (data/keys.json), never inside the app file
const ui = {
    page: "profile",
    mode: "universal",
    tab: "overview",
    shelfKey: null,
    medium: null,
    shelf: null,
    subject: null,
    tag: null,
    kind: null,
    genre: null,
    view: null,
    status: "all",
    copy: "any",
    sort: "",
    group: "",
    q: "",
    selecting: false,
    sel: new Set(),
    modal: null,
    sideOpen: false,
    viewId: null,
    profileTab: "overview",
    filt: {},
    hiddenView: false,
};

// ── telling the Svelte parts what changed ──
// src/features/core/store.svelte.ts listens here, so a component redraws when what it shows changes. Nothing else needs
// to call this: markDirty() (every saved change), the library's own set/delete/clear (views.js) and render() call it.
const changeListeners = [];
function stateChanged(part) {
    for (const f of changeListeners) f(part);
}

// ── IndexedDB ──
const DB_NAME = "stacks";
let idb = null;
function openDB(name = DB_NAME, version = 1, stores = ["items", "meta", "covers"]) {
    return new Promise((res, rej) => {
        let req;
        try {
            req = indexedDB.open(name, version);
        } catch (e) {
            return rej(e);
        }
        req.onupgradeneeded = () => {
            const d = req.result;
            for (const s of stores) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}
function tx(store, mode, fn, db = idb) {
    return new Promise((res, rej) => {
        if (!db) return rej(new Error("no-db"));
        const t = db.transaction(store, mode),
            s = t.objectStore(store);
        let out;
        Promise.resolve(fn(s)).then(v => {
            out = v;
        });
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
    });
}
const reqP = r =>
    new Promise((res, rej) => {
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
const idbAll = (store, db) =>
    tx(
        store,
        "readonly",
        s =>
            Promise.all([reqP(s.getAllKeys()), reqP(s.getAll())]).then(([keys, vals]) =>
                keys.map((k, i) => [k, vals[i]])
            ),
        db
    );
const idbGet = (store, key, db) => tx(store, "readonly", s => reqP(s.get(key)), db);
const idbPut = (store, key, val) =>
    tx(store, "readwrite", s => {
        s.put(val, key);
    });
const idbDel = (store, key) =>
    tx(store, "readwrite", s => {
        s.delete(key);
    });

// ── item model ──
const unitOf = it => (MEDIA[it.medium] ? MEDIA[it.medium].unit : ["unit", "units", ""]);
function minutesPerUnit(it) {
    const sp = meta.settings.speeds || DEFAULT_SETTINGS.speeds;
    switch (it.medium) {
        case "book":
            return sp.page;
        case "manga":
            return sp.chapter;
        case "manhwa":
            return sp.manhwa;
        case "novel":
            return sp.novel;
        case "comic":
            return sp.issue;
        case "anime":
            return it.runtime || 24;
        case "tv":
            return it.runtime || 45;
        case "film":
            return 1;
        case "game":
            return 60;
        case "album":
            return it.runtime || 4; // minutes per track (MusicBrainz gives the real average)
        default:
            return 10;
    }
}
// minutes spent on an item: progress × length, plus re-reads/re-watches
function minutesSpent(it) {
    if (it.medium === "film") return it.status === "done" ? (it.runtime || 115) * (1 + (it.repeat || 0)) : it.prog || 0;
    const done = it.status === "done" && it.total ? it.total : it.prog || 0;
    return done * minutesPerUnit(it) + (it.repeat || 0) * (it.total || 0) * minutesPerUnit(it);
}
function titleOf(it) {
    const a = it.alt || {},
        L = it.titleLang || meta.settings.titleLang;
    if (L === "original") return a.original || a.native || it.title;
    if (L === "romaji") return a.romaji || it.title;
    if (L === "native") return a.native || a.romaji || it.title;
    return a.en || it.title;
}
// fields from older versions, recognised by fingerprint and renamed
function renameOld(o, map) {
    for (const k of Object.keys(o)) {
        const to = map[hash(k)];
        if (to) {
            if (o[k]) o[to] = o[k];
            delete o[k];
        }
    }
    return o;
}
function migrateItem(b) {
    b = { ...b };
    renameOld(b, { 92676538: "flag", 1929091532: "sealed" });
    if (!b.medium) b.medium = "book";
    if (!MEDIA[b.medium]) b.medium = "book";
    // Reading Room v1/v2 book fields
    if (b.medium === "book") {
        if (b.status === "owned") {
            b.status = "want";
            if (!b.copy) b.copy = "physical";
        }
        if (b.status === "reading") b.status = "active";
        if (b.status === "finished") b.status = "done";
        if (b.page != null && b.prog == null) {
            b.prog = b.page;
            delete b.page;
        }
        if (b.pages != null && b.total == null) {
            b.total = b.pages;
        }
        if (b.author != null && b.creator == null) b.creator = b.author;
        if (b.readCount > 1 && b.repeat == null) b.repeat = b.readCount - 1;
        if (b.rating && !b.ratingV3) {
            b.rating = Math.min(10, b.rating * 2);
        }
        if (!b.shelf) b.shelf = "other";
    }
    b.ratingV3 = true;
    if (!b.v4) {
        if (b.medium === "book" && !b.kind)
            b.kind =
                b.shelf === "academic"
                    ? "Academic"
                    : b.shelf === "nonfiction"
                      ? "Non-fiction"
                      : b.shelf === "fiction"
                        ? "Novel"
                        : "";
        // a fiction lane stored as a subject becomes a tag and a detail line, not a genre
        if (b.medium === "book" && b.shelf === "fiction" && b.subject && FICTION_LANES.includes(b.subject)) {
            b.vibe = b.subject;
            b.tags = [...new Set([...(b.tags || []), b.subject])];
            b.subject = "";
        }
        if (b.medium === "tv")
            b.kind = { Series: "Live action", Animation: "Western animation" }[b.kind] || b.kind || "Live action";
        if (b.medium === "film" && b.kind === "Feature") b.kind = "";
        b.v4 = true;
    }
    if (b.medium === "book" && b.kind)
        b.shelf = b.kind === "Academic" ? "academic" : b.kind === "Non-fiction" ? "nonfiction" : "fiction";
    if (b.status === "passed") {
        b.status = "dnf";
        if (!b.droppedAt) b.droppedAt = b.lastAt || b.addedAt || null;
    }
    if (!STATUS.includes(b.status)) b.status = "want";
    if (!b.copy) b.copy = "none";
    for (const k of ["tags", "quotes", "journal", "log", "genres", "links", "rel"]) if (!Array.isArray(b[k])) b[k] = [];
    if (!b.ext) b.ext = {};
    if (!b.scores) b.scores = {};
    if (!b.alt) b.alt = {};
    if (b.coverUrl && !b.cover) {
        b.cover = b.coverUrl;
    }
    delete b.coverUrl;
    if (b.olKey && !b.ext.olKey) b.ext.olKey = b.olKey;
    if (b.prog == null) b.prog = 0;
    if (!b.addedAt) b.addedAt = nowISO();
    if (b.creator == null) b.creator = b.author || "";
    // olympiad and quant are focuses inside maths, cyber part of computer science: tags you filter on, not subjects
    {
        const SM = {
            Olympiad: ["Mathematics", "Olympiad"],
            "Quant finance": ["Mathematics", "Quant"],
            "CS & Cyber": ["Computer science", ""],
        }[b.subject];
        if (SM) {
            b.subject = SM[0];
            if (SM[1]) b.tags = [...new Set([...(b.tags || []), SM[1]])];
        }
    }
    {
        const sp = typeof splitGenres === "function" ? splitGenres(b) : null;
        if (sp) Object.assign(b, sp);
    }
    return b;
}
function loadFromSnapshot(data, { replace = true } = {}) {
    if (replace) items.clear();
    const src = data.items || data.books || {};
    for (const [id, b] of Object.entries(src)) if (b && b.title) items.set(id, migrateItem(b));
    const m = data.meta || {};
    if (data.profile && data.profile.dismissed) meta.dismissed = data.profile.dismissed;
    for (const k of [
        "tags",
        "dismissed",
        "chars",
        "people",
        "tiers",
        "lists",
        "favOrder",
        "orders",
        "myOrder",
        "courses",
    ])
        if (m[k]) meta[k] = m[k];
    if (m.themes) meta.themes = m.settings && m.settings.v7 ? { ...m.themes } : { ...publicPresets(), ...m.themes };
    if (m.vault) meta.vault = m.vault;
    if (m.modes && m.modes.length) {
        meta.modes = m.modes;
        if (!meta.modes.some(x => x.id === "universal")) meta.modes.unshift(clone(DEFAULT_MODES[0]));
    }
    if (m.layout)
        meta.layout = {
            ...clone(DEFAULT_LAYOUT),
            ...m.layout,
            side: { ...DEFAULT_LAYOUT.side, ...(m.layout.side || {}) },
            tabs: [
                ...(m.layout.tabs || []).filter(t => DEFAULT_TABS.includes(t.k)),
                ...DEFAULT_LAYOUT.tabs.filter(t => !(m.layout.tabs || []).some(x => x.k === t.k)),
            ],
        };
    if (m.queue) meta.queue = m.queue;
    if (m.views)
        meta.views = m.views.map(v =>
            v.state && !v.state.medium && data.books
                ? {
                      ...v,
                      state: {
                          ...v.state,
                          medium: "book",
                          view: v.state.view === "spines" ? "shelf" : v.state.view === "covers" ? "grid" : v.state.view,
                      },
                  }
                : v
        );
    if (m.interests) meta.interests = m.interests;
    if (m.profile) meta.profile = { ...meta.profile, ...m.profile };
    if (m.settings && !m.settings.v7) m.settings.v7 = false;
    if (m.settings && !m.settings.v8) m.settings.v8 = false;
    if (m.settings && !m.settings.v9) m.settings.v9 = false;
    if (m.settings)
        meta.settings = {
            ...meta.settings,
            ...m.settings,
            speeds: { ...DEFAULT_SETTINGS.speeds, ...(m.settings.speeds || {}) },
            fileName: meta.settings.fileName,
            defaultView:
                { spines: "shelf", covers: "grid" }[m.settings.defaultView] || m.settings.defaultView || "shelf",
        };
    meta.queue = meta.queue.filter(id => items.has(id) || String(id).startsWith("x-"));
    // lane tags and the favourites order for anything from before
    if (!meta.favOrder.length) {
        meta.favOrder = [...items.entries()]
            .filter(([, b]) => b.fav)
            .sort((a, b) => a[1].fav - b[1].fav || mediumIdx(a[1].medium) - mediumIdx(b[1].medium))
            .map(([id]) => id);
    }
    meta.favOrder = meta.favOrder.filter(id => items.has(id) || String(id).startsWith("x-"));
    migrateV5();
    migrateV6();
    migrateV7();
    migrateV8();
    migrateV9();
    migrateV10();
    migratePaths();
}
// reading pathways arrive as a tab next to Courses, once (also after importing an older export)
// Dramas are TV (they once had a mode of their own)
function migrateDramas() {
    // Dramas are TV: the Dramas mode goes (nothing in it is touched), and Film & TV gets K, C and J-drama shelves that show once you have one. Once, remembered on the mode.
    const sc = meta.modes.find(x => x.id === "screen");
    if (!sc || sc.dramas2) return;
    const dr = meta.modes.find(x => x.id === "dramas");
    if (dr) {
        meta.modes = meta.modes.filter(x => x !== dr);
        for (const b of items.values()) if (b.modeHome === "dramas") delete b.modeHome;
        if (ui.mode === "dramas") ui.mode = "screen";
    }
    sc.match = (sc.match || []).filter(p => !/^!tv:[KCJ]-drama$/.test(p));
    if (!sc.match.includes("tv") && !sc.match.includes("*")) sc.match.push("tv");
    if (Array.isArray(sc.shelves)) {
        const S = sc.shelves.map(s =>
            s.match && s.match.length === 1 && s.match[0] === "tv"
                ? { ...s, match: ["tv", "!tv:K-drama", "!tv:C-drama", "!tv:J-drama"] }
                : s
        );
        for (const k of ["K-drama", "C-drama", "J-drama"])
            if (!S.some(s => (s.match || []).includes("tv:" + k))) S.push({ name: k, match: ["tv:" + k], ifAny: true });
        sc.shelves = S;
    }
    delete sc.dramasSplit;
    delete sc.dramasPlaced;
    sc.dramas2 = true;
    meta.settings.dramas1 = true;
}
// The Learning Centre: once an Academic mode, now an official extension with its own space (below the line in the menus, switched
// on and off in Settings › Extensions › Built in). A new library starts it empty; what an older one holds (programmes, pathways,
// levels) is turned into today's subjects and paths, once (lcConvertOld). Anything that doesn't fit is kept as it was, unseen.
function migrateName() {
    if (!meta.settings.appName || meta.settings.appName === "Univerlist") meta.settings.appName = APP_NAME;
}
function migrateLearning() {
    let ac = meta.modes.find(x => x.id === "academic");
    if (!ac) {
        ac = clone(DEFAULT_MODES.find(x => x.id === "academic"));
        meta.modes.push(ac);
    }
    if (!ac.lc1) {
        Object.assign(ac, {
            space: "learning-centre",
            lc1: true,
            name: ac.name === "Academic" ? "Learning Centre" : ac.name,
        });
        ac.extra = ["learn", "paths", ...(ac.extra || []).filter(x => !["learn", "paths", "courses"].includes(x))];
        if (Array.isArray(ac.blocks)) ac.blocks = ac.blocks.filter(x => x.k !== "courses");
        meta.courses = typeof lcConvertOld === "function" ? lcConvertOld(meta.courses) : lcEmpty();
        if (ui.tab === "courses") ui.tab = "paths";
    }
    ac.space = "learning-centre";
    if (!ac.lc2) {
        ac.extra = [...new Set([...(ac.extra || []).filter(x => x !== "courses"), "learn", "paths", "curricula"])];
        ac.lc2 = true;
    }
    // pathways now open inside their course: the tabs are Library, Courses, Curricula
    if (!ac.lc3) {
        ac.extra = [
            "learn",
            "curricula",
            ...(ac.extra || []).filter(x => !["learn", "paths", "curricula", "courses"].includes(x)),
        ];
        ac.lc3 = true;
        if (!ac.sort || ac.sort === "rank") ac.sort = "order";
        if (ui.tab === "paths") ui.tab = "learn";
    }
    if (!meta.courses || meta.courses.v !== 2)
        meta.courses = typeof lcConvertOld === "function" ? lcConvertOld(meta.courses) : lcEmpty(); // an old backup's academic part
    if (typeof lcOnePerCourse === "function") lcOnePerCourse(meta.courses); // one pathway per course, nothing dropped
}
const lcEmpty = () => ({ v: 2, subjects: [], paths: [], curricula: {} });
// Music arrives: a Music mode after the Learning Centre (so the modes you know keep their place and shortcut), and the Hub leaves albums to it (as it does games). Once, remembered.
function migrateMusic() {
    if (meta.settings.music1) return;
    if (!meta.modes.some(m => m.id === "music")) {
        let at = meta.modes.findIndex(m => m.id === "academic");
        if (at < 0) at = meta.modes.findIndex(m => m.id === "games");
        meta.modes.splice(at < 0 ? meta.modes.length : at + 1, 0, clone(DEFAULT_MODES.find(m => m.id === "music")));
    }
    const hub = meta.modes.find(m => m.id === "universal");
    if (hub && !(hub.match || []).includes("!album")) hub.match = [...(hub.match || ["*"]), "!album"];
    meta.settings.music1 = true;
    metaDirty = true;
}
function migratePaths() {
    migrateDramas();
    migrateMusic();
    migrateLearning();
    migrateName();
    // a built-in theme you already have your own copy of (same name), and that no mode uses, isn't listed twice
    for (const [id, pre] of Object.entries(THEME_PRESETS))
        if (
            meta.themes &&
            meta.themes[id] &&
            !meta.modes.some(x => x.theme === id) &&
            Object.entries(meta.themes).some(([k, t]) => k !== id && !THEME_PRESETS[k] && t && t.name === pre.name)
        )
            delete meta.themes[id];
}
// libraries saved before the modes were reorganised: TV and Film leave anime to Animanga, modes take the current
// order, themes become one shared library, tabs slim down
function migrateV5() {
    if (meta.settings.v5) return;
    const order = DEFAULT_MODES.map(m => m.id),
        old = meta.modes;
    meta.modes = [
        ...DEFAULT_MODES.map(d => {
            const o = old.find(x => x.id === d.id) || {};
            let theme = d.theme;
            if (o.theme && typeof o.theme === "object" && Object.keys(o.theme).some(k => k !== "preset")) {
                const tid = "t-" + d.id;
                meta.themes[tid] = {
                    ...(meta.themes[o.theme.preset] || {}),
                    ...o.theme,
                    name: (o.name || d.name) + " (yours)",
                };
                delete meta.themes[tid].preset;
                theme = tid;
            }
            return { ...clone(d), name: o.name || d.name, g: o.g || d.g, profile: o.profile || {}, theme };
        }),
        ...old
            .filter(x => !order.includes(x.id))
            .map(x => ({
                ...x,
                theme: typeof x.theme === "object" ? (x.theme && x.theme.preset) || "stacks" : x.theme,
            })),
    ];
    meta.layout.tabs = clone(DEFAULT_LAYOUT.tabs);
    for (const k of ["favSplit", "charSplit", "uniExclude"])
        if (meta.layout[k] == null) meta.layout[k] = clone(DEFAULT_LAYOUT[k]);
    meta.settings.v5 = true;
    metaDirty = true;
}
// libraries that still asked about AniList on load: they stop asking
function migrateV6() {
    if (meta.settings.v6) return;
    meta.settings.autoSync = false;
    meta.settings.welcomed3 = true;
    if (meta.settings.imageProxy == null) meta.settings.imageProxy = true;
    const p = meta.profile;
    if (!p.avatar && !p.avatarData && p.anilist && p.anilist.avatar) p.avatar = p.anilist.avatar;
    if (!p.banner && !p.bannerData && p.anilist && p.anilist.banner) p.banner = p.anilist.banner;
    if (meta.layout.favSplit === "type") meta.layout.favSplit = "shelf";
    meta.myOrder = meta.myOrder || {};
    meta.settings.v6 = true;
    metaDirty = true;
}
// libraries saved before the current modes (Hub, Culture, Literature, Film & TV, Games, Academic): Dropped replaces
// "Not for me", and fewer, tidier defaults
const DEFAULT_CRITERIA = {
    anime: ["Story", "Characters", "Animation", "Music & sound", "Enjoyment"],
    manga: ["Story", "Characters", "Art", "Enjoyment"],
    manhwa: ["Story", "Characters", "Art", "Enjoyment"],
    novel: ["Story", "Characters", "Writing", "Worldbuilding", "Enjoyment"],
    book: ["Story", "Characters", "Writing", "Worldbuilding", "Enjoyment"],
    comic: ["Story", "Art", "Characters", "Enjoyment"],
    tv: ["Story", "Characters", "Acting", "Atmosphere", "Enjoyment"],
    film: ["Story", "Acting", "Direction", "Atmosphere", "Music & sound", "Enjoyment"],
    game: ["Gameplay", "Story", "World", "Art & sound", "Enjoyment"],
    album: ["Songs", "Production", "Lyrics", "Flow", "Enjoyment"],
};
const publicPresets = () => Object.fromEntries(Object.entries(clone(THEME_PRESETS)).filter(([, t]) => !t.hidden));
const SORT_OLD = { rating: "rank", mine: "rank", finished: "ended" };
function migrateV7() {
    if (meta.settings.v7) return;
    meta.themes = meta.themes || {};
    const old = meta.modes,
        pick = id => old.find(x => x.id === id) || {},
        keep = (o, d) => ({
            ...clone(d),
            profile: o.profile || {},
            vz: o.vz
                ? Object.fromEntries(
                      Object.entries(o.vz).map(([k, v]) => [{ faceout: "cover", shelf: "spine" }[k] || k, v])
                  )
                : undefined,
            gsort: o.gsort
                ? Object.fromEntries(Object.entries(o.gsort).map(([k, v]) => [k, SORT_OLD[v] || v]))
                : undefined,
            sort: SORT_OLD[o.sort] || o.sort,
            group: o.group || d.group,
            view: { faceout: "cover", grid: "grid", shelf: "spine", list: "list" }[o.view] || d.view,
        });
    const D = Object.fromEntries(DEFAULT_MODES.map(d => [d.id, d]));
    // the mode layout changes once; later imports leave your modes alone
    if (!old.some(x => x.id === "screen") || old.some(x => x.id === "film" || x.id === "tv")) {
        const withTheme = (o, d) => ({
            ...keep(o, d),
            theme:
                o.theme && typeof o.theme === "string" && meta.themes[o.theme] && o.theme !== "broadcast"
                    ? o.theme
                    : d.theme,
        });
        meta.modes = [
            withTheme(pick("universal"), D.universal),
            withTheme(pick("animanga"), D.animanga),
            withTheme(pick("novels"), D.novels),
            withTheme(old.find(x => x.id === "film") || pick("tv"), D.screen),
            withTheme(pick("games"), D.games),
            withTheme(pick("academic"), D.academic),
            ...old.filter(
                x => !["universal", "animanga", "novels", "film", "tv", "screen", "games", "academic"].includes(x.id)
            ),
        ];
    }
    for (const k of ["film", "tv"]) {
        if ((meta.orders || {})[k] && !(meta.orders || {}).screen) meta.orders.screen = meta.orders[k];
        if ((meta.myOrder || {})[k] && !(meta.myOrder || {}).screen) meta.myOrder.screen = meta.myOrder[k];
    }
    if (["film", "tv"].includes(ui.mode)) ui.mode = "screen";
    for (const x of meta.modes)
        if (!meta.themes[x.theme] && !THEME_PRESETS[x.theme])
            x.theme = (DEFAULT_MODES.find(d => d.id === x.id) || DEFAULT_MODES[0]).theme;
    if (["film", "tv"].includes(meta.settings.startMode)) meta.settings.startMode = "screen";
    // the themes from before stay if you changed them or a mode uses them; untouched extras go
    for (const [id, t] of Object.entries(meta.themes || {}))
        if (
            !meta.modes.some(m => m.theme === id) &&
            !THEME_PRESETS[id] &&
            ["cream", "broadcast", "stacks", "daylight", "mono", "ink", "cinema", "gold"].includes(id)
        )
            delete meta.themes[id];
    for (const [id, t] of Object.entries(publicPresets())) if (!meta.themes[id]) meta.themes[id] = t;
    // lane tags the app added by itself go: you didn't choose them
    for (const t of [...FICTION_LANES, "Serializd", "Backloggd", "Letterboxd"]) delete meta.tags[t];
    for (const [id, b] of items) {
        let ch = false;
        const x = { ...b };
        if (x.status === "passed") {
            x.status = "dnf";
            ch = true;
        }
        if (x.status === "dnf" && !x.droppedAt) {
            x.droppedAt = x.lastAt || x.finishedAt || x.addedAt || null;
            ch = true;
        }
        const preTags = [...FICTION_LANES, "Serializd", "Backloggd", "Letterboxd"];
        if ((x.tags || []).some(t => preTags.includes(t))) {
            x.tags = x.tags.filter(t => !preTags.includes(t));
            ch = true;
        }
        if (x.medium === "film" && x.creator && !x.ext.tmdb && !x.creatorFixed) {
            x.creatorFix = true;
            ch = true;
        }
        if (x.vibe) {
            delete x.vibe;
            ch = true;
        }
        if (ch) {
            items.set(id, x);
            dirty.add(id);
        }
    }
    if (!(meta.layout.tabs || []).some(t => t.k === "discover"))
        meta.layout.tabs = [...DEFAULT_TABS.map(k => ({ k, on: k !== "rank" }))];
    if (meta.layout.favSplit === "type") meta.layout.favSplit = "shelf";
    const s = meta.settings;
    if (!s.ratingScale) s.ratingScale = "10d";
    s.keys = s.keys || {};
    s.features = s.features || {};
    if (s.startMode !== "last" && !meta.modes.some(m => m.id === s.startMode)) s.startMode = "universal";
    if (s.defaultView === "shelf") s.defaultView = "spine";
    if (s.defaultView === "faceout") s.defaultView = "cover";
    delete s.letterboxdUser;
    delete s.serializdUser;
    s.v7 = true;
    metaDirty = true;
}
// libraries saved before games had their own space outside Hub, modes their own names for you, and layouts could be
// shared by every mode
function migrateV9() {
    const s = meta.settings;
    if (s.v9) return;
    renameOld(s, { 54475916: "unsealOnce", 825511320: "hideFlagged" });
    if (meta.layout && meta.layout.lastMode && hash(meta.layout.lastMode) === 1019717458)
        meta.layout.lastMode = "sealed";
    s.v9 = true;
    metaDirty = true;
}
// before 1.0 a theme's moving background was its "world", and so was a course's kind (Academic or Interests). Cheap, so
// it runs on every load and after every import, whichever parts an older backup brings
function migrateV10() {
    const s = meta.settings;
    let changed = false;
    if (Array.isArray(s.worlds)) {
        const have = new Set((s.backdrops || []).map(w => w && w.id));
        s.backdrops = [...(s.backdrops || []), ...s.worlds.filter(w => w && !have.has(w.id))];
        changed = true;
    }
    if ("worlds" in s) delete s.worlds;
    if (s.builtins && "worlds" in s.builtins) {
        if (!("backdrops" in s.builtins)) s.builtins.backdrops = s.builtins.worlds;
        delete s.builtins.worlds;
        changed = true;
    }
    const rename = (o, to) => {
        if (!o || typeof o !== "object" || !("world" in o)) return;
        if (o[to] === undefined) o[to] = o.world;
        delete o.world;
        changed = true;
    };
    for (const T of Object.values(meta.themes || {})) rename(T, "backdrop");
    for (const S of (meta.courses && meta.courses.subjects) || []) rename(S, "kind");
    if (changed) metaDirty = true;
}
function migrateV8() {
    if (meta.settings.v8) return;
    const hub = meta.modes.find(m => m.id === "universal");
    if (hub) {
        if (!(hub.match || []).includes("!game")) hub.match = [...(hub.match || ["*"]), "!game"];
        if (Array.isArray(hub.shelves))
            hub.shelves = hub.shelves.filter(s => !(s.match.length === 1 && s.match[0] === "game"));
    }
    // tier lists now live in Lists
    for (const t of meta.tiers || [])
        if (!meta.lists.some(l => l.id === t.id))
            meta.lists.push({
                id: t.id,
                name: t.name,
                kind: "tier",
                chars: t.kind === "chars",
                mode: t.mode || "",
                onlyDone: !!t.onlyDone,
                scores: true,
                rows: t.rows,
                ids: t.kind === "chars" ? [] : t.rows.flatMap(r => r.ids),
                notes: {},
                created: t.created || nowISO(),
            });
    meta.tiers = [];
    meta.settings.unsealOnce = true;
    meta.settings.v8 = true;
    metaDirty = true;
}
// scores: stored out of 10, shown the way you like
const SCALES = [
    ["10d", "10-point, decimals"],
    ["100", "100-point"],
    ["5", "5 stars"],
    ["10", "10-point"],
];
function fmtScore(r, scale = meta.settings.ratingScale || "10d") {
    if (!r) return "";
    if (scale === "100") return String(Math.round(r * 10));
    if (scale === "5") {
        const v = Math.round(r) / 2;
        return "★".repeat(Math.floor(v)) + (v % 1 ? "½" : "");
    }
    if (scale === "10") return String(Math.round(r));
    return (+r).toFixed(r % 1 ? 1 : 0);
}
// a title can have its own scale (one film you'd rather give stars): it's shown that way, and stored out of 10 like every other,
// so rankings and stats compare them all (4½ stars is 9/10)
const scaleOf = b => (b && b.scale) || meta.settings.ratingScale || "10d";
const scoreMax = (sc = meta.settings.ratingScale) => ({ 100: 100, 5: 5 })[sc] || 10;
function parseScore(v, sc = meta.settings.ratingScale) {
    const n = parseFloat(String(v).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(10, Math.round((sc === "100" ? n / 10 : sc === "5" ? n * 2 : n) * 10) / 10);
}
const mediumIdx = m => MEDIA_KEYS.indexOf(m);
// private entries never leave memory unencrypted: they're left out of the browser store, backups and library files
const publicItems = () => Object.fromEntries([...items.entries()].filter(([id]) => !vault.ids.has(id)));
function snapshot() {
    const m = clone(meta);
    return { app: "univerlist", v: APP_V, savedAt: nowISO(), meta: m, items: publicItems() };
}

// ── persistence ──
let storage = "idb";
const dirty = new Set();
let metaDirty = false,
    saveTimer = null,
    saveFailures = 0; // saves in a row that failed (flushSave)
function markDirty(id) {
    if (id) dirty.add(id);
    else metaDirty = true;
    ITEMS_VER++;
    stateChanged(id ? "items" : "meta");
    scheduleSave();
}
// throttle, not debounce: background work marks things dirty constantly, and a debounce would never fire
function scheduleSave() {
    if (!saveTimer)
        saveTimer = setTimeout(() => {
            saveTimer = null;
            flushSave();
        }, 300);
}
addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
    else if (otherTabSaved()) location.reload(); // back to this tab after changing things in another: pick them up
});
addEventListener("pagehide", () => flushSave());

// ── open in more than one tab ──
// Each save notes its time here. A tab that sees another tab saved since it loaded is behind: it never writes its older
// copy of your lists and settings over the newer one (single items still save), and it picks up the changes as soon as
// you come back to it, or straight away if you say so.
const SAVED_KEY = "univerlist-saved-at";
const lastSaved = () => {
    try {
        return localStorage.getItem(SAVED_KEY) || "";
    } catch (_) {
        return "";
    }
};
let mySave = lastSaved();
const otherTabSaved = () => lastSaved() !== mySave;
function noteSave(at) {
    mySave = at;
    try {
        localStorage.setItem(SAVED_KEY, at);
    } catch (_) {}
}
addEventListener("storage", e => {
    if (e.key !== SAVED_KEY || e.newValue === mySave || document.visibilityState === "hidden") return;
    toast("You changed things in another tab", { label: "Bring them in", fn: () => location.reload() });
});
async function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const ids = [...dirty];
    dirty.clear();
    const doMeta = metaDirty || ids.length;
    metaDirty = false;
    meta.savedAt = nowISO();
    const behind = otherTabSaved();
    try {
        if (storage === "idb") {
            if (ids.length)
                await tx("items", "readwrite", s => {
                    for (const id of ids) {
                        // a tab that's behind can't seal the private collection (that writes its older settings), so it
                        // leaves a private entry as it is on disk rather than take it out of one place without putting it
                        // in the other: nothing is lost, and the change waits for the newer tab's to come in
                        if (behind && vault.ids.has(id)) continue;
                        const b = items.get(id);
                        b && !vault.ids.has(id) ? s.put(b, id) : s.delete(id);
                    }
                });
            if (ids.some(id => vault.ids.has(id)) || vault.sealDue) {
                vault.sealDue = false;
                await vaultSeal();
            }
            if (doMeta && !behind) await idbPut("meta", "meta", clone(meta));
        } else if (storage === "local" && !behind) {
            localStorage.setItem("stacks-v3", JSON.stringify(snapshot()));
        }
        if (!behind && doMeta) noteSave(meta.savedAt);
    } catch (e) {
        console.error(e);
        // nothing is lost from memory: what didn't save goes back in the queue, and it tries again, less often each time
        // (a full disk, a database the browser closed), until a save works
        for (const id of ids) dirty.add(id);
        if (doMeta) metaDirty = true;
        saveFailures++;
        if (saveFailures === 1)
            toast(
                "Couldn't save to this browser (is the disk full?). Trying again; Download everything keeps a copy meanwhile."
            );
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, Math.min(60e3, 2000 * 2 ** saveFailures));
        return;
    }
    if (saveFailures) toast("Saved again");
    saveFailures = 0;
    fileSync.schedule();
    if (typeof folderSync !== "undefined") folderSync.schedule();
}
function saveKeys() {
    try {
        if (storage === "idb") idbPut("meta", "keys", { ...KEYS });
        localStorage.setItem("stacks-keys", JSON.stringify(KEYS));
    } catch (_) {}
}
// a passphrase you set (the private collection, a backup's keys): long enough that guessing it is hopeless even with the
// encrypted file in hand. Ones set before stay as they are
const PASSPHRASE_MIN = 10,
    PASSPHRASE_HINT = "Use at least 10 characters: a few words you'll remember is easiest.";
// ── the private vault: AES-GCM with a key derived from your passphrase (PBKDF2, 310,000 rounds) ──
const vault = { key: null, ids: new Set(), sealDue: false, prefs: null };
const SEALED_KEEP = [
    "name",
    "g",
    "theme",
    "view",
    "group",
    "shelves",
    "sort",
    "gsort",
    "vz",
    "blocks",
    "statBlocks",
    "profile",
    "match",
];
// earlier versions kept a fixed list of types here; this recognises them (by fingerprint only) the first time the collection opens
const OLD_SEALED = new Set([418232143, 2080001291, 230331144, 547190752, 728921303, 1673704043, 478201632]);
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function vaultKey(pass, salt) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}
const vaultReady = () => !!(window.crypto && crypto.subtle);
async function vaultCreate(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    vault.key = await vaultKey(pass, salt);
    vault.ids.clear();
    vault.prefs = { kinds: {}, links: [] };
    meta.vault = { salt: b64(salt), iv: "", ct: "", n: 0, created: nowISO() };
    await vaultSeal();
    markDirty();
}
async function vaultSeal() {
    if (!vault.key || !meta.vault) return;
    const data = {
        items: Object.fromEntries([...vault.ids].filter(id => items.has(id)).map(id => [id, items.get(id)])),
        prefs: {
            ...(vault.prefs || {}),
            mode: Object.fromEntries(
                SEALED_KEEP.filter(k => SEALED_MODE[k] !== undefined).map(k => [k, SEALED_MODE[k]])
            ),
        },
    };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        vault.key,
        new TextEncoder().encode(JSON.stringify(data))
    );
    meta.vault = { ...meta.vault, iv: b64(iv), ct: b64(ct), n: Object.keys(data.items).length, sealedAt: nowISO() };
    if (storage === "idb" && !otherTabSaved()) await idbPut("meta", "meta", clone(meta)).catch(() => {});
}
async function vaultUnlock(pass) {
    const v = meta.vault;
    if (!v) throw new Error("no-vault");
    const key = await vaultKey(pass, unb64(v.salt));
    let data = { items: {} };
    if (v.ct) {
        try {
            const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(v.iv) }, key, unb64(v.ct));
            data = JSON.parse(new TextDecoder().decode(pt));
        } catch (_) {
            throw new Error("wrong");
        }
    }
    vault.key = key;
    for (const [id, b] of Object.entries(data.items || {})) {
        items.set(id, migrateItem({ ...b, private: true }));
        vault.ids.add(id);
    }
    vault.prefs = { kinds: {}, links: [], ...(data.prefs || {}) };
    Object.assign(SEALED_MODE, SEALED_BASE, vault.prefs.mode || {});
    if (!data.prefs) {
        // first open since the list moved in here: keep whatever types you already had private
        for (const id of vault.ids) {
            const b = items.get(id);
            if (!b || !b.kind) continue;
            if (OLD_SEALED.has(hash(b.medium + ":" + b.kind.toLowerCase()))) {
                const L = (vault.prefs.kinds[b.medium] = vault.prefs.kinds[b.medium] || []);
                if (!L.includes(b.kind)) L.push(b.kind);
            }
        }
        vault.sealDue = true;
    }
}
function vaultLock() {
    for (const id of vault.ids) items.delete(id);
    vault.ids.clear();
    vault.key = null;
    vault.prefs = null;
    for (const k of Object.keys(SEALED_MODE)) delete SEALED_MODE[k];
    Object.assign(SEALED_MODE, SEALED_BASE);
    history.length = 0;
    future.length = 0; // undo could otherwise bring private entries back into view
}
async function vaultChangePass(pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    vault.key = await vaultKey(pass, salt);
    meta.vault = { ...meta.vault, salt: b64(salt) };
    await vaultSeal();
}
// give an item a new id everywhere it's referenced (private entries get anonymous ids, so nothing reveals the title)
function rekeyItem(oldId, newIdv) {
    const b = items.get(oldId);
    if (!b) return;
    items.delete(oldId);
    items.set(newIdv, b);
    markDirty(oldId);
    markDirty(newIdv);
    const sw = x => (x === oldId ? newIdv : x);
    for (const [id, x] of items)
        if ((x.links || []).some(l => l.id === oldId)) {
            quietPatch(id, { links: x.links.map(l => (l.id === oldId ? { ...l, id: newIdv } : l)) });
        }
    meta.queue = meta.queue.map(sw);
    meta.favOrder = meta.favOrder.map(sw);
    meta.lists = meta.lists.map(l => ({
        ...l,
        ids: l.ids.map(sw),
        ...(l.rows ? { rows: l.rows.map(r => ({ ...r, ids: r.ids.map(sw) })) } : {}),
    }));
    meta.tiers = meta.tiers.map(t => ({ ...t, rows: t.rows.map(r => ({ ...r, ids: r.ids.map(sw) })) }));
    meta.chars = meta.chars.map(c => ({
        ...c,
        media: (c.media || []).map(m => (m.id === oldId ? { ...m, id: newIdv } : m)),
    }));
    markDirty();
}
// Reading Room (v1/v2) data from this browser comes across as the Books section.
async function migrateReadingRoom() {
    let rr = null,
        covers = [];
    try {
        const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: "reading-room" }];
        if (dbs.some(d => d.name === "reading-room")) {
            const old = await openDB("reading-room", 1, ["books", "meta", "covers"]);
            const m = await idbGet("meta", "meta", old);
            if (m) {
                const rows = await idbAll("books", old);
                rr = { books: Object.fromEntries(rows), meta: m };
                covers = await idbAll("covers", old).catch(() => []);
            }
            old.close();
        }
    } catch (e) {
        console.warn("reading room migration", e);
    }
    if (!rr) {
        try {
            rr =
                JSON.parse(localStorage.getItem("reading-room-v2") || "null") ||
                JSON.parse(localStorage.getItem("reading-room-v1") || "null");
        } catch (_) {}
    }
    return rr && rr.books && Object.keys(rr.books).length ? { rr, covers } : null;
}
let migratedFrom = "",
    bootFresh = false;
async function boot() {
    try {
        idb = await openDB();
    } catch (e) {
        storage = "local";
    }
    let loaded = false;
    if (storage === "idb") {
        try {
            const m = await idbGet("meta", "meta");
            if (m) {
                for (const [id, b] of await idbAll("items")) items.set(id, migrateItem(b));
                loadFromSnapshot({ meta: m, items: {} }, { replace: false });
                meta.savedAt = m.savedAt;
                loaded = true;
            }
            const k = await idbGet("meta", "keys");
            if (k) KEYS = { ...KEYS, ...k };
        } catch (e) {
            console.error(e);
            storage = "local";
        }
    }
    if (!loaded) {
        bootFresh = true;
        let local = null;
        try {
            local = JSON.parse(localStorage.getItem("stacks-v3") || "null");
        } catch (_) {}
        if (local && local.items) {
            loadFromSnapshot(local);
        } else {
            const mig = await migrateReadingRoom();
            if (mig) {
                loadFromSnapshot(mig.rr);
                migratedFrom = "Reading Room";
                for (const [url, blob] of mig.covers) {
                    try {
                        await idbPut("covers", url, blob);
                    } catch (_) {}
                }
            } else {
                loadFromSnapshot({ items: {}, meta: {} });
                meta.settings.v9 = true;
                meta.settings.v8 = true;
                meta.settings.v7 = true;
                meta.settings.v6 = true;
                meta.settings.v5 = true;
                meta.themes = publicPresets();
                meta.settings.fresh = true;
                meta.settings.welcomed3 = false;
            }
        }
        for (const id of items.keys()) dirty.add(id);
        metaDirty = true;
        await flushSave();
    }
    try {
        const k = JSON.parse(localStorage.getItem("stacks-keys") || "null");
        if (k) KEYS = { ...KEYS, ...k };
    } catch (_) {}
    await coverCache.load();
}

// ── history ──
const history = [],
    future = [];
function record(label, entries) {
    if (!entries.length) return;
    history.push({ label, entries, at: Date.now() });
    if (history.length > 150) history.shift();
    future.length = 0;
}
function applyEntries(entries, side) {
    for (const e of entries) {
        const v = e[side];
        if (e.kind === "meta") {
            meta[e.key] = clone(v);
            markDirty();
            continue;
        }
        if (v == null) items.delete(e.id);
        else items.set(e.id, clone(v));
        markDirty(e.id);
    }
}
function undo() {
    const h = history.pop();
    if (!h) return toast("Nothing to undo");
    applyEntries(h.entries, "before");
    future.push(h);
    afterChange();
    toast("Undid: " + h.label, { label: "Redo", fn: redo });
}
function redo() {
    const h = future.pop();
    if (!h) return toast("Nothing to redo");
    applyEntries(h.entries, "after");
    history.push(h);
    afterChange();
    toast("Redid: " + h.label);
}
function change(label, ids, fn, { metaKeys = [], metaBefore: mb = null } = {}) {
    const entries = [];
    const metaBefore = mb ? Object.entries(mb) : metaKeys.map(k => [k, clone(meta[k])]);
    for (const id of [].concat(ids)) {
        const before = clone(items.get(id) ?? null);
        const next = fn(before ? clone(before) : null, id);
        if (next === undefined) continue;
        if (JSON.stringify(next) === JSON.stringify(before)) continue;
        if (next == null) items.delete(id);
        else items.set(id, next);
        entries.push({ id, before, after: clone(next) });
        markDirty(id);
    }
    for (const [k, before] of metaBefore)
        if (JSON.stringify(before) !== JSON.stringify(meta[k])) {
            entries.push({ kind: "meta", key: k, before, after: clone(meta[k]) });
            markDirty();
        }
    record(label, entries);
    afterChange();
    return entries.length;
}
const patch = (id, p, label = "Edit") => change(label, id, b => (b ? { ...b, ...p } : undefined));
function changeMeta(label, key, fn) {
    const before = clone(meta[key]);
    const after = fn(clone(before));
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    meta[key] = after;
    record(label, [{ kind: "meta", key, before, after: clone(after) }]);
    markDirty();
    afterChange();
}
function quietPatch(id, p) {
    const b = items.get(id);
    if (!b) return;
    items.set(id, { ...b, ...p });
    markDirty(id);
}
const anonId = () => "x-" + crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 14);
function newId(title, medium) {
    const base = (medium && medium !== "book" ? medium + "-" : "") + slug(title);
    let id = base,
        i = 2;
    while (items.has(id)) id = base + "-" + i++;
    return id;
}
function addItem(data, label) {
    const id = newId(data.title, data.medium);
    change(label || "Add " + data.title, id, () =>
        migrateItem({ status: "want", copy: "none", rating: 0, notes: "", addedAt: nowISO(), source: "you", ...data })
    );
    if (data.medium === "anime" && !data.partOf && typeof queueSeasonCombine === "function") queueSeasonCombine(id);
    for (const f of itemAddedHooks) f(id, data);
    return id;
}
// features that want to know when something is added (sources/lbimport.js)
const itemAddedHooks = [];
const onItemAdded = f => itemAddedHooks.push(f);
let afterChange = () => {};

// ── link helpers (cross-links are stored on both items) ──
function linkItems(a, b, type, note = "") {
    if (a === b || !items.has(a) || !items.has(b)) return;
    change("Link " + titleOf(items.get(a)) + " ↔ " + titleOf(items.get(b)), [a, b], (x, id) => {
        const other = id === a ? b : a;
        const links = (x.links || []).filter(l => l.id !== other);
        links.push({ id: other, type, note });
        return { ...x, links };
    });
}
function unlinkItems(a, b) {
    change("Remove link", [a, b], (x, id) => ({
        ...x,
        links: (x.links || []).filter(l => l.id !== (id === a ? b : a)),
    }));
}

// ── cover cache ──
const coverCache = {
    urls: new Map(),
    blocked: false,
    failures: 0,
    hostFails: {},
    async load() {
        if (storage !== "idb") return;
        try {
            for (const [k, blob] of await idbAll("covers")) this.urls.set(k, URL.createObjectURL(blob));
        } catch (_) {}
    },
    // sites whose pictures wouldn't load directly here are shown through the image proxy instead (learned as you browse)
    noDirect: (() => {
        try {
            return new Set(JSON.parse(localStorage.getItem("univerlist-proxy-hosts") || "[]"));
        } catch (_) {
            return new Set();
        }
    })(),
    proxied: u => "https://wsrv.nl/?url=" + encodeURIComponent(u),
    src(url) {
        const c = this.urls.get(url);
        if (c) return c;
        if (url && /^https:/.test(url) && meta.settings.imageProxy !== false) {
            try {
                if (this.noDirect.has(new URL(url).host)) return this.proxied(url);
            } catch (_) {}
        }
        return url;
    },
    learn(url) {
        try {
            const h = new URL(url).host;
            if (this.noDirect.has(h)) return false;
            this.noDirect.add(h);
            localStorage.setItem("univerlist-proxy-hosts", JSON.stringify([...this.noDirect]));
            return true;
        } catch (_) {
            return false;
        }
    },
    // keep a copy of a picture for offline use. Sites that refuse to share pictures with pages go through an image proxy (wsrv.nl) if allowed.
    async fetch(url, signal) {
        if (storage !== "idb" || this.urls.has(url) || !/^https:/.test(url)) return null;
        const host = new URL(url).host,
            viaProxy = this.hostFails[host] >= 3;
        if (viaProxy && !meta.settings.imageProxy) return null;
        let blob = null;
        const get = async u => {
            const r = await fetch(u, { signal, mode: "cors" });
            if (!r.ok) return null;
            const b = await r.blob();
            // a picture, by its bytes (the server's word for its type isn't enough), and never an SVG: a blob address in
            // this app's origin must not be able to hold a script
            const kind = b.size >= 1200 ? pictureType(new Uint8Array(await b.slice(0, 256).arrayBuffer())) : null;
            return kind ? new Blob([b], { type: "image/" + kind }) : null;
        };
        try {
            blob = await get(viaProxy ? "https://wsrv.nl/?url=" + encodeURIComponent(url) + "&n=-1" : url);
        } catch (e) {
            if (e.name === "AbortError") throw e;
        }
        if (!blob && !viaProxy) {
            this.hostFails[host] = (this.hostFails[host] || 0) + 1;
            if (meta.settings.imageProxy)
                try {
                    blob = await get("https://wsrv.nl/?url=" + encodeURIComponent(url) + "&n=-1");
                } catch (e) {
                    if (e.name === "AbortError") throw e;
                }
        }
        if (!blob) {
            if (++this.failures > 60) this.blocked = true;
            return null;
        }
        try {
            await idbPut("covers", url, blob);
        } catch (_) {}
        this.urls.set(url, URL.createObjectURL(blob));
        return blob;
    },
};
async function dominantColor(blob) {
    try {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement("canvas");
        c.width = 24;
        c.height = 36;
        const g = c.getContext("2d");
        g.drawImage(bmp, 0, 0, 24, 36);
        const d = g.getImageData(0, 0, 24, 36).data;
        let r = 0,
            gg = 0,
            b = 0,
            n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
            if (l < 18 || l > 238) continue;
            r += d[i];
            gg += d[i + 1];
            b += d[i + 2];
            n++;
        }
        if (!n) return null;
        return (
            "#" +
            [r, gg, b]
                .map(v =>
                    Math.round(v / n)
                        .toString(16)
                        .padStart(2, "0")
                )
                .join("")
        );
    } catch (_) {
        return null;
    }
}

// ── folder file ──
const fileSync = {
    handle: null,
    state: "off",
    timer: null,
    lastSaved: null,
    supported: "showSaveFilePicker" in window,
    async init() {
        if (!this.supported || storage !== "idb") return;
        try {
            this.handle = await idbGet("meta", "fileHandle");
        } catch (_) {}
        if (!this.handle) return;
        meta.settings.fileName = this.handle.name;
        const p = await this.handle.queryPermission({ mode: "readwrite" }).catch(() => "denied");
        if (p === "granted") await this.pull();
        else this.state = "reconnect";
    },
    async connect(create) {
        try {
            const h = create
                ? await window.showSaveFilePicker({
                      suggestedName: "univerlist-library.json",
                      types: [{ description: "UniverList library", accept: { "application/json": [".json"] } }],
                  })
                : (
                      await window.showOpenFilePicker({
                          types: [{ description: "UniverList library", accept: { "application/json": [".json"] } }],
                      })
                  )[0];
            this.handle = h;
            await idbPut("meta", "fileHandle", h);
            meta.settings.fileName = h.name;
            if (create) await this.push();
            else await this.pull(true);
            this.state = "on";
            markDirty();
            return true;
        } catch (e) {
            if (e.name !== "AbortError") toast("Couldn't use that file: " + e.message);
            return false;
        }
    },
    async reconnect() {
        if (!this.handle) return;
        const p = await this.handle.requestPermission({ mode: "readwrite" }).catch(() => "denied");
        if (p === "granted") {
            await this.pull();
            afterChange();
        } else toast("Permission wasn't given, so the file isn't being updated.");
    },
    async disconnect() {
        this.handle = null;
        this.state = "off";
        meta.settings.fileName = "";
        try {
            await idbDel("meta", "fileHandle");
        } catch (_) {}
        markDirty();
    },
    async pull(force) {
        try {
            const f = await this.handle.getFile();
            const txt = await f.text();
            this.state = "on";
            if (!txt.trim()) return this.push();
            const data = JSON.parse(txt);
            if (!data.items && !data.books) throw new Error("not a library file");
            if (vault.ids.size) for (const id of vault.ids) data.items && delete data.items[id];
            const fileNewer = !meta.savedAt || (data.savedAt && data.savedAt > meta.savedAt);
            if (force || fileNewer) {
                for (const id of items.keys()) dirty.add(id);
                loadFromSnapshot(data);
                for (const id of items.keys()) dirty.add(id);
                metaDirty = true;
                await flushSave();
                toast(`Loaded your library from ${this.handle.name}`);
            } else this.schedule();
        } catch (e) {
            this.state = "error";
            toast("Couldn't read your library file: " + e.message);
        }
    },
    async push() {
        if (!this.handle || this.state === "reconnect") return;
        try {
            const w = await this.handle.createWritable();
            await w.write(JSON.stringify(snapshot(), null, 1));
            await w.close();
            this.lastSaved = nowISO();
            this.state = "on";
            renderSideStatus();
        } catch (e) {
            this.state = e.name === "NotAllowedError" ? "reconnect" : "error";
            renderSideStatus();
        }
    },
    schedule() {
        if (!this.handle || this.state !== "on") return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.push(), 2500);
    },
};

// ── import / export ──
function download(name, text, type = "application/json") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
    }, 1500);
}
function exportJSON() {
    download("univerlist-" + today() + ".json", JSON.stringify(snapshot(), null, 1));
    meta.settings.lastBackup = nowISO();
    meta.settings.remindAfter = null;
    markDirty();
    afterChange();
    toast("Backup downloaded");
}
function csvCell(v) {
    v = v == null ? "" : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function exportCSV(medium) {
    const cols = [
        "medium",
        "kind",
        "title",
        "creator",
        "year",
        "status",
        "rating",
        "prog",
        "total",
        "startedAt",
        "finishedAt",
        "copy",
        "genres",
        "tags",
        "shelf",
        "subject",
        "notes",
        "anilist",
        "mal",
        "imdb",
        "tmdb",
    ];
    const list = [...items.values()].filter(b => !medium || b.medium === medium);
    const val = (b, c) =>
        c === "tags" || c === "genres"
            ? (b[c] || []).join("; ")
            : ["anilist", "mal", "imdb", "tmdb"].includes(c)
              ? (b.ext || {})[c]
              : b[c];
    download(
        "univerlist-" + (medium || "all") + "-" + today() + ".csv",
        [cols.join(",")].concat(list.map(b => cols.map(c => csvCell(val(b, c))).join(","))).join("\n"),
        "text/csv"
    );
}
function parseCSV(text) {
    const rows = [];
    let row = [],
        cell = "",
        q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else q = false;
            } else cell += c;
        } else if (c === '"') q = true;
        else if (c === ",") {
            row.push(cell);
            cell = "";
        } else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
        } else cell += c;
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    const head = (rows.shift() || []).map(h => h.replace(/^﻿/, "").trim());
    return rows
        .filter(r => r.some(x => x.trim()))
        .map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}
// Goodreads, StoryGraph, Letterboxd, IMDb ratings and Stacks CSVs → items
function fromCSV(rows) {
    if (!rows.length) return { kind: "unknown", items: [] };
    const h = Object.keys(rows[0]);
    const kind = h.includes("Exclusive Shelf")
        ? "Goodreads"
        : h.includes("Read Status")
          ? "StoryGraph"
          : h.includes("Letterboxd URI")
            ? "Letterboxd"
            : h.includes("Const") && h.includes("Title Type")
              ? "IMDb"
              : h.includes("medium") && h.includes("title")
                ? "Stacks CSV"
                : h.includes("title")
                  ? "Reading Room CSV"
                  : "unknown";
    const isbn = v => String(v || "").replace(/[^0-9Xx]/g, "");
    const dt = v => {
        if (!v) return null;
        const d = new Date(v.replace(/\//g, "-"));
        return isNaN(d) ? null : d.toISOString();
    };
    const out = rows
        .map(r => {
            switch (kind) {
                case "Goodreads": {
                    const sh = r["Exclusive Shelf"];
                    return {
                        medium: "book",
                        title: r.Title,
                        creator: r.Author,
                        status: sh === "read" ? "done" : sh === "currently-reading" ? "active" : "want",
                        rating: (parseInt(r["My Rating"], 10) || 0) * 2,
                        isbn: isbn(r.ISBN13 || r.ISBN),
                        total: parseInt(r["Number of Pages"], 10) || null,
                        year: parseInt(r["Original Publication Year"] || r["Year Published"], 10) || null,
                        finishedAt: dt(r["Date Read"]),
                        addedAt: dt(r["Date Added"]) || nowISO(),
                        scores: r["Average Rating"] ? { goodreads: parseFloat(r["Average Rating"]) } : {},
                        tags: (r.Bookshelves || "")
                            .split(",")
                            .map(s => s.trim())
                            .filter(s => s && !["read", "to-read", "currently-reading"].includes(s)),
                        notes: r["My Review"] || "",
                        copy: (parseInt(r["Owned Copies"], 10) || 0) > 0 ? "physical" : "none",
                    };
                }
                case "StoryGraph": {
                    const st = r["Read Status"];
                    return {
                        medium: "book",
                        title: r.Title,
                        creator: (r.Authors || "").split(",")[0].trim(),
                        status:
                            st === "read"
                                ? "done"
                                : st === "currently-reading"
                                  ? "active"
                                  : st === "did-not-finish"
                                    ? "dnf"
                                    : "want",
                        rating: Math.round((parseFloat(r["Star Rating"]) || 0) * 2),
                        isbn: isbn(r["ISBN/UID"]),
                        finishedAt: dt(r["Last Date Read"]),
                        addedAt: dt(r["Date Added"]) || nowISO(),
                        tags: (r.Tags || "")
                            .split(",")
                            .map(s => s.trim())
                            .filter(Boolean),
                        notes: r.Review || "",
                        copy: /yes/i.test(r["Owned?"] || "")
                            ? /digital|ebook|audio/i.test(r.Format || "")
                                ? "digital"
                                : "physical"
                            : "none",
                    };
                }
                case "Letterboxd":
                    return {
                        medium: "film",
                        title: r.Name,
                        year: parseInt(r.Year, 10) || null,
                        status: r["Watched Date"] || r.Date || r.Rating ? "done" : "want",
                        rating: r.Rating ? Math.round(parseFloat(r.Rating) * 2) : 0,
                        finishedAt: dt(r["Watched Date"] || r.Date),
                        notes: r.Review || "",
                        ext: { letterboxd: r["Letterboxd URI"] },
                        tags: (r.Tags || "")
                            .split(",")
                            .map(s => s.trim())
                            .filter(Boolean),
                    };
                case "IMDb": {
                    const tt = (r["Title Type"] || "").toLowerCase();
                    const medium = /series|mini/.test(tt)
                        ? "tv"
                        : /game/.test(tt)
                          ? "game"
                          : /episode/.test(tt)
                            ? null
                            : "film";
                    return (
                        medium && {
                            medium,
                            kind: /mini/.test(tt) ? "Miniseries" : medium === "tv" ? "Live action" : "",
                            title: r.Title,
                            year: parseInt(r.Year, 10) || null,
                            status: r["Your Rating"] ? "done" : "want",
                            rating: parseInt(r["Your Rating"], 10) || 0,
                            finishedAt: dt(r["Date Rated"]),
                            runtime: medium === "film" ? parseInt(r["Runtime (mins)"], 10) || null : null,
                            creator: r.Directors || "",
                            genres: (r.Genres || "")
                                .split(",")
                                .map(s => s.trim())
                                .filter(Boolean),
                            ext: { imdb: r.Const },
                            scores: r["IMDb Rating"] ? { imdb: parseFloat(r["IMDb Rating"]) } : {},
                        }
                    );
                }
                case "Stacks CSV":
                    return {
                        medium: MEDIA[r.medium] ? r.medium : "book",
                        kind: r.kind,
                        title: r.title,
                        creator: r.creator,
                        year: parseInt(r.year, 10) || null,
                        status: STATUS.includes(r.status) ? r.status : "want",
                        rating: parseFloat(r.rating) || 0,
                        prog: parseInt(r.prog, 10) || 0,
                        total: parseInt(r.total, 10) || null,
                        startedAt: r.startedAt || null,
                        finishedAt: r.finishedAt || null,
                        copy: r.copy || "none",
                        genres: (r.genres || "")
                            .split(";")
                            .map(s => s.trim())
                            .filter(Boolean),
                        tags: (r.tags || "")
                            .split(";")
                            .map(s => s.trim())
                            .filter(Boolean),
                        shelf: r.shelf,
                        subject: r.subject,
                        notes: r.notes || "",
                        ext: {
                            anilist: parseInt(r.anilist, 10) || undefined,
                            mal: parseInt(r.mal, 10) || undefined,
                            imdb: r.imdb || undefined,
                            tmdb: r.tmdb || undefined,
                        },
                    };
                default:
                    return {
                        medium: "book",
                        title: r.title,
                        creator: r.author,
                        shelf: r.shelf,
                        subject: r.subject,
                        status: { reading: "active", finished: "done" }[r.status] || r.status,
                        copy: r.copy,
                        rating: (parseInt(r.rating, 10) || 0) * 2,
                        year: parseInt(r.year, 10) || null,
                        total: parseInt(r.pages, 10) || null,
                        tags: (r.tags || "")
                            .split(";")
                            .map(s => s.trim())
                            .filter(Boolean),
                        notes: r.notes || "",
                    };
            }
        })
        .filter(x => x && x.title);
    return { kind, items: out };
}
// The same show can come from two places: AniList files it as anime, TMDB and TVmaze as TV. findExisting only looks inside one medium, so it misses that.
// Same title (or its English / romaji name) and a year within one of each other counts as the same show; a live-action remake years later doesn't.
function findSibling(title, medium, year) {
    const other = medium === "anime" ? "tv" : medium === "tv" ? "anime" : null,
        t = idTitle(title);
    if (!other || !t) return null;
    for (const [id, b] of items) {
        if (b.medium !== other) continue;
        if (![b.title, b.alt && b.alt.en, b.alt && b.alt.romaji].filter(Boolean).some(x => idTitle(x) === t)) continue;
        if (year && b.year && Math.abs(Number(year) - Number(b.year)) > 1) continue;
        return id;
    }
    return null;
}
function findExisting(title, creator, medium, ext) {
    if (ext) {
        for (const [id, b] of items) {
            const e = b.ext || {};
            if (
                (ext.anilist && e.anilist === ext.anilist) ||
                (ext.imdb && e.imdb === ext.imdb) ||
                (ext.tmdb && e.tmdb === ext.tmdb && e.tmdbType === ext.tmdbType) ||
                (ext.rawg && e.rawg === ext.rawg) ||
                (ext.tvmaze && e.tvmaze === ext.tvmaze)
            )
                return id;
        }
    }
    const book = ["book", "comic"].includes(medium),
        key = x => (book ? norm(cleanTitle(x)) : idTitle(x)),
        t = key(title),
        s = surname(creator);
    for (const [id, b] of items) {
        if (medium && b.medium !== medium) continue;
        const titles = [b.title, b.alt && b.alt.en, b.alt && b.alt.romaji].filter(Boolean).map(key);
        if (titles.includes(t) && (!s || !b.creator || surname(b.creator) === s || !book)) return id;
    }
    return null;
}
