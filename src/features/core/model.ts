// src/features/core/model.ts
// ─────────────────────────────────────────────────────────────────
//  The data model, as types
//
//  What an entry in your library looks like, what else you keep (meta), and where you are in the app (ui). core/core.ts
//  makes these objects and migrateItem() fills in an entry's defaults. Fields that only a few parts use, or that only
//  older libraries carry, are left to the index signatures: reading one gives `unknown`, which has to be checked before
//  it's used. Watch & read's own state (what's playing, the show open, your media and reading servers) is at the end.
// ─────────────────────────────────────────────────────────────────

export type Medium =
    | "anime"
    | "manga"
    | "manhwa"
    | "novel"
    | "book"
    | "comic"
    | "film"
    | "tv"
    | "game"
    | "album"
    | (string & {}); // modes and extensions can add their own

/** where you are with something: on it again, finished, on it now, want to, dropped, paused */
export type Status = "redo" | "done" | "active" | "want" | "dnf" | "paused";

/** how a medium is read, watched, played or listened to: decides the verbs */
export type MediumGroup = "read" | "watch" | "play" | "listen";

/** one medium's definition (core.ts MEDIA) */
export interface MediumDef {
    name: string;
    one: string; // the word for one of them
    g: string; // its glyph
    code: string;
    group: MediumGroup;
    unit: [one: string, many: string, short: string]; // what progress counts: page, chapter, episode…
    steps: number[]; // the progress buttons' steps
    color: string;
}

/** a link from one entry to another (stored on both) */
export interface ItemLink {
    id: string;
    type: string; // LINK_TYPES: adaptation, sequel…
    note?: string;
    [field: string]: unknown;
}

/** an entry's ids at the catalogues it came from */
export interface ItemExt {
    anilist?: number;
    mal?: number;
    imdb?: string;
    tmdb?: number | string;
    tmdbType?: string;
    rawg?: number | string;
    tvmaze?: number | string;
    olKey?: string;
    wikidata?: string; // Q…
    igdb?: number | string;
    [source: string]: unknown;
}

/** one thing in your library */
export interface Item {
    id?: string;
    medium: Medium;
    title: string;
    status: Status;
    creator: string; // author, studio, director, developer
    kind?: string; // a medium's own kinds: "TV", "Movie", "Novel", "Academic"…
    year?: number | null;
    rating?: number; // out of 10, one decimal
    scale?: string; // its own score scale, when it isn't the one in Settings
    scores: Record<string, number | undefined>; // the catalogues' own scores, by site ("anilist", "mal"…)
    prog: number; // episodes, chapters, pages… done
    total?: number | null;
    runtime?: number | null; // minutes an episode, a film or a track takes
    repeat?: number; // times watched or read again
    fav?: number; // favourite; meta.favOrder holds the order
    tags: string[];
    genres: string[];
    themes?: string[]; // what a source called a genre that isn't one of the official genres
    cover?: string | null; // a link, or "@images/covers/<id>.jpg" inside an export (null: you removed it)
    alt: { en?: string; romaji?: string; native?: string; original?: string };
    titleLang?: string; // which of its titles it shows, when not the one in Settings
    ext: ItemExt;
    links: ItemLink[];
    rel: RelatedWork[];
    log: LogEntry[];
    quotes: { text: string; page?: string; date: string; [field: string]: unknown }[]; // lines you saved
    journal: { text: string; date: string; [field: string]: unknown }[]; // your journal or diary entries
    copy: string; // "none", "physical", "digital"…
    subject?: string; // the Learning Centre's subject, for academic books
    shelf?: string; // a book's older shelf (fiction, nonfiction, academic)
    notes?: string;
    addedAt: string; // ISO dates
    startedAt?: string | null;
    finishedAt?: string | null;
    droppedAt?: string | null;
    lastAt?: string;
    modeHome?: string; // the mode you moved it to
    partOf?: string; // the series an anime season belongs to
    sealed?: boolean; // always in the private collection
    // the shelf and the reading order
    season?: string | number;
    series?: string;
    franchise?: string;
    seriesNo?: number | string | null; // its number in its series
    chrono?: number | string | null; // its place in story order
    trackIndex?: number; // a Learning Centre book's place in its pathway
    order?: number;
    format?: string; // a book's length: Short, Long, Series, Textbook
    vol?: number;
    vols?: number | null;
    // what's coming: the next episode or chapter, and whether it's still coming out
    airing?: { at: number; ep?: number; season?: number } | null;
    airStatus?: string;
    // how it looks
    coverData?: string | null; // a picture of your own, as a data: address
    color?: string | null;
    coverColor?: string | null;
    banner?: string;
    // your scores and rankings
    crit?: Record<string, number | undefined>; // by criterion
    critAvg?: boolean; // the score is the criteria's average
    elo?: number;
    h2h?: number; // times picked between two
    welo?: number; // the same for the backlog
    wh2h?: number;
    favRank?: number;
    toBuy?: boolean;
    platform?: string;
    about?: string; // its synopsis
    why?: string;
    lane?: string;
    source?: string; // where it was added from
    // several entries kept as one (core/parts.ts): the one you keep lists its parts, each part points back
    parts?: string[];
    volsOwned?: number[]; // the volumes you own (manga, manhwa, light novels)
    dims?: { h?: number; w?: number; d?: number }; // a book's printed size in cm, when Open Library knows it
    platforms?: string[]; // a game's platforms, as the catalogue lists them
    coverPicked?: boolean;
    volCover?: string;
    artSeen?: { cover: string; label: string; wide?: boolean }[]; // the pictures last found for it
    artAt?: string;
    spineArt?: string | null; // a spine you chose (null: cut from the cover)
    spinePicked?: boolean;
    favWhy?: string; // why it's a favourite
    favArt?: string; // the picture it has on Favourites
    favArtData?: string;
    cw?: string; // a content note
    bySeason?: boolean; // scored season by season
    seasons?: { n?: number; eps?: string | number; status?: string; rating?: string | number; note?: string }[];
    private?: boolean;
    hidden?: boolean;
    staff?: string[]; // the original creators (AniList's staff)
    reads?: { startedAt?: string | null; finishedAt?: string | null; [field: string]: unknown }[]; // earlier times through
    completion?: string; // a game: how far you mean to go (story, extras, full, endless)
    olSubjects?: string[]; // a book's subjects on Open Library (Discover reads your interests from them)
    epsSeen?: string[]; // a show's episodes ticked off ("1x3": season 1, episode 3)
    castPicked?: boolean; // its cast is from the title you chose
    [field: string]: unknown;
}

/** a work AniList relates to an entry (a sequel, a source, a spin-off) */
export interface RelatedWork {
    id: number;
    title: string;
    medium: string;
    kind?: string;
    type?: string; // LINK_TYPES: adaptation, sequel…
    label?: string; // how it's related
    year?: number;
    cover?: string;
    [field: string]: unknown;
}

/** a character or cast member a catalogue lists for a title (AniList, TMDB, TVmaze, IGDB, Wikidata) */
export interface CastMember {
    src?: string; // the catalogue: "anilist", "tmdb"…
    name: string; // the character (or, for a crew list, empty)
    va?: string; // who plays or voices them
    image?: string;
    vaImage?: string;
    role?: string; // Main, Supporting, Background, Cast
    alId?: number;
    native?: string;
    fans?: number;
    [field: string]: unknown;
}

/** an entry with its id, as the library's lists hand them round */
export type Entry = Item & { id: string };

/** a session in an entry's log: progress from and to, on a day */
export interface LogEntry {
    date: string;
    from?: number;
    to?: number;
    min?: number;
    [field: string]: unknown;
}

/** something a catalogue found, before it's in your library: an entry's fields as far as the catalogue knows them */
export interface Candidate {
    title: string;
    medium?: Medium;
    kind?: string;
    year?: number | null;
    creator?: string;
    cover?: string;
    total?: number | null;
    ext?: ItemExt;
    src?: string; // the catalogue it came from
    flag?: boolean; // marked adult by the catalogue
    genres?: string[];
    scores?: Record<string, number | undefined>; // the catalogues' own scores
    airing?: Item["airing"];
    airStatus?: string;
    about?: string;
    // what some catalogues add
    alt?: Item["alt"];
    banner?: string;
    color?: string | null;
    runtime?: number | null;
    vols?: number | null;
    themes?: string[];
    platforms?: string[];
    popularity?: number; // how many people have it there: breaks ties between titles alike
    season?: string; // an anime's season ("Spring 2024")
    series?: string;
    rel?: RelatedWork[];
    creatorPeople?: string[]; // AniList: who wrote and drew it
    boxart?: string; // a game's real box, preferred over its cover
    author?: string; // a book's authors
    pages?: number | null;
    olKey?: string; // Open Library's work ("/works/OL…W")
    subjects?: string[];
    editions?: number;
    lang?: string; // its original language, as TMDB gives it
    country?: string;
    desc?: string; // Wikidata's one-line description
    filmKind?: string;
    cast?: CastMember[];
    [field: string]: unknown;
}

/** a new entry before it's added: what an import or a search brings, filled in by migrateItem() */
export type ItemDraft = Partial<Item> & { title: string; medium?: Medium };

/** a shelf of a mode: what it holds, by medium and kind patterns */
export interface ShelfDef {
    name: string;
    match: string[];
    ifAny?: boolean; // shown only once you have something on it
    [field: string]: unknown;
}

/** a block on an overview or stats page, and how wide it is (of 12) */
export interface BlockSpec {
    k: string;
    w: number;
    rows?: number;
    n?: number; // how many it shows
    type?: string; // how it's drawn: bars, cols, donut, list
    title?: string; // its own title
    nonum?: boolean; // favourites without their numbers
    metric?: string; // a stat you built: what it measures, what it's split by, finished only
    by?: string;
    fin?: boolean;
    min?: number;
    [field: string]: unknown;
}

/** a mode's own profile (Settings › Modes) */
export interface ModeProfile {
    name?: string;
    bio?: string;
    banner?: string;
    bannerData?: string;
    noBanner?: boolean;
    avatar?: string;
    avatarData?: string;
    [field: string]: unknown;
}

export interface Mode {
    id: string;
    name: string;
    g?: string; // its glyph
    match?: string[]; // which media and kinds it shows: "anime", "book:Academic", "!tv:K-drama"…
    space?: string; // a built-in it belongs to ("learning-centre")
    theme?: string; // an id in meta.themes or THEME_PRESETS
    view?: string;
    group?: string;
    sort?: string;
    gsort?: Record<string, string>; // the sort within one group ("status:done": "rank")
    vz?: Record<string, { z?: number; gap?: number; titles?: boolean; split?: boolean; true?: boolean }>; // each view's zoom and spacing
    shelves?: ShelfDef[] | string; // shelves of its own, or what to split by ("kind", "subject"…)
    extra?: string[]; // its extra tabs
    offTabs?: string[];
    blocks?: BlockSpec[] | null; // its overview's blocks (null: the shared or default layout)
    statBlocks?: BlockSpec[] | null; // its stats page's blocks
    profile?: ModeProfile;
    tabs?: string[] | null; // its tabs, in order (the tab editor); null: the usual ones
    homeTab?: string; // the tab it opens on
    sealedOnly?: boolean; // the private collection's own mode
    hidden?: boolean;
    [field: string]: unknown;
}

/** a theme as it's kept (meta.themes, THEME_PRESETS): any value left out comes from the base */
export interface Theme {
    name?: string;
    backdrop?: string;
    hidden?: boolean; // a preset not offered in the list
    bg?: string;
    panel?: string;
    text?: string;
    muted?: string;
    accent?: string;
    hi?: string;
    bgStyle?: string;
    bgAmt?: number;
    fHead?: string;
    fUi?: string;
    wHead?: number;
    wUi?: number;
    fs?: number;
    fsTitle?: number;
    ls?: number;
    tt?: string;
    radius?: number;
    cover?: number;
    gap?: number;
    spine?: string;
    glow?: number;
    logo?: string;
    [field: string]: unknown;
}

/** a theme with every value filled in and checked (theme.ts resolveTheme) */
export interface ResolvedTheme extends Theme {
    id: string;
    backdrop: string;
    bg: string;
    panel: string;
    text: string;
    muted: string;
    accent: string;
    hi: string;
    bgStyle: string;
    bgAmt: number;
    fHead: string;
    fUi: string;
    wHead: number;
    wUi: number;
    fs: number;
    fsTitle: number;
    ls: number;
    tt: string;
    radius: number;
    cover: number;
    gap: number;
    spine: string;
    glow: number;
}

/** the Learning Centre (meta.courses): your courses, the pathway through each, and the programmes you compare */
export interface Courses {
    v: 2;
    subjects: Course[];
    paths: Pathway[];
    curricula?: Record<string, Curriculum>; // by course
}
/** a course: what you're learning, a degree subject or an interest */
export interface Course {
    id: string;
    name: string;
    g?: string; // its symbol
    kind?: string; // "sci" (Academic) or "arts" (Interests)
    fields: Record<string, { lvl: number; at?: string; [field: string]: unknown }>; // your level in each field (LEVELS)
    order?: string[]; // the fields, in order
    goal?: number; // the level you're aiming for
    hidden?: boolean;
    sources?: { id: string; kind: string; name: string; url?: string; note?: string }[]; // the best places to learn it
    opps?: { id: string; t: string; when?: string; url?: string; done?: boolean; note?: string }[]; // yours only
    [field: string]: unknown;
}
/** a reading waits until another is underway ("start"), done ("done"), or one of its parts is done ("part", p) */
export interface PathCond {
    k: string;
    s: string;
    p?: number;
}
/** a reading on a pathway: its title and author as the list gave them, and the entry it is in your library */
export interface PathBook {
    id: string;
    t: string;
    a?: string;
    year?: string | number;
    isbn?: string;
    mod?: string; // its module
    th?: string; // its thread (its module's name by default)
    st?: string; // todo, reading, done, skip
    note?: string;
    after?: PathCond[];
    lib?: string;
    parts?: { t: string; done?: boolean }[];
    ref?: boolean; // for reference only
    opt?: boolean;
    free?: boolean; // free online
    top?: boolean; // crème de la crème
    self?: boolean; // best for self-study
    where?: string; // the topic it was picked for
    _dupe?: string; // its label when two share a surname (worked out as it's drawn)
    [field: string]: unknown;
}
/** a topic a module covers, and the topics it waits on */
export interface PathTopic {
    t: string;
    done?: boolean;
    after?: string[];
}
/** a module of a programme: in a stage, with its topics and the modules it waits on */
export interface PathModule {
    id: string;
    stage: string;
    code?: string;
    name: string;
    credits?: string | number;
    core?: boolean;
    status?: string; // planned, taking, done, dropped
    grade?: string | number;
    term?: string;
    topics?: PathTopic[];
    after?: string[];
    [field: string]: unknown;
}
/** a course's pathway: its readings, in stages and modules */
export interface Pathway {
    id: string;
    name: string;
    sub: string; // its course
    uni?: string;
    programme?: string;
    url?: string;
    about?: string;
    method?: string;
    goals?: { id: string; t: string; date?: string; done?: boolean }[]; // milestones
    view?: string;
    threads?: string[];
    stages?: { id: string; name: string; spec?: boolean }[];
    modules?: PathModule[];
    books: PathBook[];
    at?: string;
    merged?: Record<string, unknown>[]; // the pathways that were joined into this one
    req?: Record<string, number | undefined>; // what it takes to graduate: options, credits
    [field: string]: unknown;
}
/** what different programmes teach in one course (Curricula) */
export interface Curriculum {
    topics: { id: string; name: string; area?: string }[];
    books: Record<string, [title: string, author: string]>; // by key
    progs: CurProgramme[];
    chosen: Record<string, string>; // your book for each topic
    extra: Record<string, [key: string, title: string, author: string][]>; // books you added, by topic
    hide: string[]; // programmes left out of the comparison
}
/** a programme compared in Curricula: its modules, each teaching some topics and setting some books */
export interface CurProgramme {
    id: string;
    uni: string;
    name: string;
    kind?: string; // "mine", "specialist"
    why?: string;
    url?: string;
    modules: { name: string; core?: boolean; topics?: string[]; books?: (string | string[])[] }[];
    [field: string]: unknown;
}

/** a row of a tier list */
export interface TierRow {
    name?: string;
    label?: string;
    color?: string;
    ids: string[];
    [field: string]: unknown;
}

/** a character or person pulled into a tier list from a title's cast (List.ents) */
export interface TierPulled {
    name: string;
    image?: string;
    sub?: string;
}

/** a list you made: a plain or ordered list, or a tier list (kind "tier") */
export interface List {
    id: string;
    name: string;
    kind?: string;
    ids: string[];
    rows?: TierRow[];
    what?: string; // a tier list's entries: "items", "chars" or "people" (library/tiers.ts TIER_WHAT)
    onlyDone?: boolean; // a tier list offers only what's finished or scored
    scores?: boolean; // a tier list shows scores
    size?: string; // a tier list's tile size: s, m, l
    skip?: string[]; // quick rank: the ones skipped, which wait at the end
    poolSide?: boolean; // the unplaced ones beside the board
    tiersWas?: TierRow[]; // a ranked list's tiers from before it was ranked
    notes?: Record<string, string>;
    chars?: boolean; // a tier list of characters
    numbered?: boolean;
    desc?: string; // what the list is for
    layout?: string; // a tier list shown as tiers or as one ranking ("rank")
    ents?: Record<string, TierPulled>; // a tier list's entries that aren't in your library
    mode?: string;
    private?: boolean;
    created?: string;
    [field: string]: unknown;
}

/** a tier list from before they were lists (meta.tiers): moved into meta.lists by migrateV8 */
export interface OldTier {
    id: string;
    name: string;
    kind?: string;
    mode?: string;
    onlyDone?: boolean;
    rows: TierRow[];
    created?: string;
    [field: string]: unknown;
}

/** a favourite character */
export interface FavChar {
    id: string;
    name: string;
    image?: string;
    alImage?: string;
    alId?: number;
    rank?: number;
    tags?: string[];
    va?: string; // voiced or played by
    age?: string;
    native?: string;
    why?: string;
    about?: string;
    src?: string;
    images?: string[]; // pictures from links you added
    uploads?: string[]; // pictures you uploaded
    imageData?: string;
    media?: { id?: string | null; alId?: number; title?: string; medium?: string; [field: string]: unknown }[]; // where they're from (id: null when it isn't in your library)
    group?: string; // the group you put them in (connect.ts CHAR_GROUPS)
    gender?: string;
    [field: string]: unknown;
}

/** a favourite creator, studio or actor */
export interface FavPerson {
    id?: string;
    name: string;
    image?: string;
    imageData?: string;
    roles?: string[];
    role?: string; // an older version kept one
    credits?: { id: string; role: string }[];
    fav?: boolean;
    why?: string;
    [field: string]: unknown;
}

/** a library view you saved: its filters and layout */
export interface SavedView {
    id: string;
    name: string;
    state: { mode?: string; medium?: string | null; view?: string | null; [field: string]: unknown };
    [field: string]: unknown;
}

/** the private collection, sealed with your passphrase (meta.vault) */
export interface VaultBox {
    salt: string;
    iv: string;
    ct: string;
    n: number;
    created?: string;
    sealedAt?: string;
}

/** how the app is laid out: the side panel, the tabs, how favourites and characters show */
export interface Layout {
    side: {
        open: boolean;
        pinned: boolean;
        pos: string;
        width: number;
        text: string;
        closed?: string[]; // its sections you folded
        hide?: string[]; // its sections you turned off
        allTags?: boolean;
        startOpen?: boolean; // pinned open when the app starts
    };
    tabs: { k: string; on: boolean }[];
    favView: string;
    favSplit: string;
    charSplit: string;
    charView: string;
    peopleView: string;
    uniExclude: string[];
    shared: { blocks: BlockSpec[]; statBlocks?: BlockSpec[] }; // block layouts every mode without its own uses
    lastMode?: string;
    favNums?: boolean; // Favourites shows each one's place
    [field: string]: unknown;
}

/** a key you can rebind (Settings › Keybinds): action id → keys */
export type KeyBindings = Record<string, string[] | string>; // an older version kept one key as a string

/** Settings: what you chose. Features not yet in TypeScript keep theirs in the index signature */
export interface Settings {
    appName: string;
    logo: string;
    startMode: string;
    theme: string;
    accent: string;
    density: string;
    defaultView: string;
    lastBackup: string | null;
    remindAfter: string | null;
    welcomed: boolean;
    fileName: string;
    titleLang: string;
    region: string;
    hideFlagged: boolean;
    anilistUser: string;
    autoSync: boolean;
    imageProxy: boolean;
    ratingScale: string;
    advanced: boolean;
    keys: KeyBindings;
    criteria: Record<string, string[] | undefined> | null; // by medium: the criteria scores are given in
    offlineAuto: boolean;
    features: Record<string, unknown>;
    speeds: { page: number; chapter: number; manhwa: number; novel: number; issue: number };
    dateFmt?: string;
    ambience?: string; // the backdrop's movement: calm, alive or off
    backupKeys?: boolean;
    showLinks?: boolean;
    vaultAuto?: number;
    alSyncedAt?: string;
    guideChecks?: Record<string, boolean>; // the guide's checklists, as you ticked them
    lastTabs?: Record<string, string>; // the tab each mode was last on
    modeOpens?: string; // a mode opens on its own tab ("home") or the last one
    gameBoxes?: boolean;
    quickStatus?: string; // what search's ＋ adds things as
    seasonsMode?: string; // "separate": anime sequels each on their own
    autoCombine?: boolean; // new seasons join their show
    seasons?: Record<string, boolean>; // by medium: scored season by season
    stageLast?: string; // Watch & read: the side you were last on
    watchOrder?: string; // "story": series sorted in story order, not release order
    welcomed3?: boolean; // the welcome has been seen
    unsealOnce?: boolean;
    autoFetch?: boolean;
    airing?: boolean;
    player?: Record<string, unknown>; // the player's settings (watch-read/watch.ts PS)
    servers?: { pattern?: string; on?: boolean; [field: string]: unknown }[]; // your media servers
    kindMerge?: Record<string, Record<string, string>>; // by medium: a kind shown as another
    kindLabel?: Record<string, Record<string, string>>; // by medium: a kind's own name
    builtins?: Record<string, boolean>;
    backdrops?: unknown[]; // yours, from the Backdrop builder (checked by backdrops/backdrop.ts)
    srvPref?: Record<string, { who?: string; ext?: string; [field: string]: unknown }>; // your usual server, by show
    [setting: string]: unknown;
}

/** everything you keep that isn't a library entry */
export interface Meta {
    tags: Record<string, { color: string }>;
    views: SavedView[];
    queue: string[]; // Up next
    dismissed: string[];
    interests: {
        syncedAt: string | null;
        subjects: Record<string, { name: string; w: number }[]>; // by shelf: your books' subjects, weighted
        seeds: string[]; // the books they were read from
    };
    chars: FavChar[]; // favourite characters
    people: FavPerson[]; // favourite creators, studios, actors
    tiers: OldTier[];
    profile: {
        name: string;
        bio: string;
        avatar: string;
        avatarData: string;
        banner: string;
        bannerData: string;
        anilist: {
            avatar?: string;
            banner?: string;
            url?: string;
            name?: string;
            syncedAt?: string;
            [field: string]: unknown;
        } | null;
        [field: string]: unknown;
    };
    modes: Mode[];
    lists: List[];
    favOrder: string[];
    orders: Record<string, string[]>;
    myOrder: Record<string, string[]>;
    themes: Record<string, Theme> | null;
    courses: Courses;
    vault: VaultBox | null;
    settings: Settings;
    layout: Layout;
    savedAt: string | null;
    watchSplit?: unknown[]; // Watch: shows you split apart
    watchGroups?: Record<string, { name?: string; [field: string]: unknown }>; // Watch: shows you put together
    watchMap?: Record<string, Record<string, unknown>>; // Watch: by show, the title you picked on each media server
    readMap?: Record<string, Record<string, unknown>>; // Read: by entry, the series you picked on each reading server
}

/** a rule of the library's advanced filter: a field, a test and a value */
export interface Rule {
    f?: string;
    op?: string;
    v?: string;
}
/** the library's filters (library.ts FILT_EMPTY has them all off) */
export interface Filter {
    kinds: string[];
    genres: string[];
    themes: string[];
    tags: string[];
    modes: string[];
    seasons: string[];
    own: string;
    smin: string;
    smax: string;
    ymin: string;
    ymax: string;
    fav: boolean;
    unscored: boolean;
    started: string;
    rules: Rule[];
    any: boolean; // any rule, rather than all of them
    [field: string]: unknown;
}

/** what a file you chose to import holds, before it's brought in */
export interface ImportPreview {
    kind: string; // "bundle" (an export), "custom" (a CSV to match), or the site it's from
    name: string;
    parts?: Record<string, unknown>; // an export's parts
    savedAt?: string;
    items?: { title?: unknown; medium?: unknown; [field: string]: unknown }[]; // a list's entries
    lists?: unknown[];
    match?: number; // how many are already in your library
    columns?: string[]; // a CSV's columns, and its rows
    rows?: Record<string, string>[];
    [field: string]: unknown;
}

/** a dialog that's open: its kind, and whatever that kind keeps while it's open */
export interface Modal {
    kind: string;
    id?: string; // the entry, character or list it's about
    back?: Modal | null; // the dialog to go back to when this one closes
    ctl?: AbortController; // stops what it's waiting for
    editing?: boolean;
    tab?: string;
    error?: string;
    busy?: boolean | string; // waiting for something (or which thing: "art", "adapt")
    status?: string;
    step?: string; // where a dialog with steps is (Add: "search", then "review")
    i?: number; // the entry it's on, of several
    q?: string; // what's been searched for
    medium?: string;
    ikind?: string;
    private?: boolean;
    draft?: ItemDraft; // Add: the entry so far
    results?: unknown[] | null; // what a search found: catalogue results in Add, characters in Add a character…
    from?: string | null; // the entry a character is being added from
    view?: number | null; // the picture being viewed, of a character's
    mode?: string;
    cover?: string;
    coverData?: string;
    art?: { cover: string; label: string; wide?: boolean }[] | null; // the pictures the catalogues have for it
    artSaved?: string | null;
    adapt?: { title: string; medium: string; dir?: string; desc?: string; [field: string]: unknown }[] | null;
    seq?: string[] | null; // an entry's card: the entries ← and → step through
    refreshing?: boolean; // an entry's card: Refresh is asking the catalogues
    refreshNote?: string; // …and what it found
    castPick?: { q: string; busy: boolean; res: CastPick[] } | null; // choosing the title a cast list is from
    eps?: Episode[] | null; // a show's episodes, from TVmaze
    season?: number | null; // …and the season shown
    critOpen?: boolean; // scoring in detail
    partsOpen?: boolean;
    confirmDelete?: boolean;
    time?: string; // Pick for me: how much time you have
    media?: string[];
    own?: boolean;
    shuffle?: boolean;
    name?: string;
    title?: string;
    type?: string;
    what?: string;
    purpose?: string;
    origin?: string; // the mode a profile dialog was opened from
    scope?: string;
    ids?: string[]; // the entries it's for
    added?: Set<string>;
    filter?: (b: Entry) => boolean; // which entries it offers
    text?: string; // Paste a list: what you pasted
    tag?: string;
    err?: string;
    preview?: ImportPreview; // Import: what the file holds
    map?: Record<string, string>; // the CSV matcher: field → column
    scale?: string; // the CSV matcher: what its scores are out of
    sel?: Record<string, boolean> | Set<string> | Set<number>; // Import: the parts ticked; Pick: the entries; a cast list: the people, by place
    extHow?: string;
    keypass?: string;
    // Refresh artwork & scores: how far it's got
    running?: boolean;
    total?: number;
    done?: number;
    found?: number | string; // …how many were updated; Fetch from a link: what it found ("modules", "readings")
    current?: string;
    finished?: boolean;
    // Choose covers: the entries in turn, and the pictures found for each
    queue?: string[];
    cands?: Record<string, { cover: string; label: string; wide?: boolean }[] | null>; // null: still looking
    moreOpen?: boolean;
    seed?: string;
    picked?: number;
    cast?: CastMember[] | null; // an entry's characters and cast, once loaded (null: not yet)
    lid?: string; // the list a "pick an entry" dialog adds to
    med?: string; // …and the medium it shows
    dest?: string; // a cast list: the list it goes into
    // Adjust a picture: what it is, what it's for, its frame's shape, and where it's moved and zoomed to
    src?: string;
    ar?: number;
    x?: number;
    y?: number;
    z?: number;
    gif?: boolean;
    // Discover: where to look, what to start from, and what turned up (results holds the main list)
    shelf?: string;
    source?: string;
    target?: string | FrameTarget; // Discover: the medium shown ("any"…); Adjust a picture: what it's for
    off?: Set<string>; // subjects left out
    offAwards?: Set<string>; // awards left out
    local?: Recommendation[]; // other versions from AniList's relations
    wd?: Recommendation[]; // …and from Wikidata
    warn?: string;
    note?: string;
    syncing?: boolean; // reading your books' subjects from Open Library
    syncDone?: number;
    syncTotal?: number;
    [field: string]: unknown;
}

/** where you are: page, mode, tab, filters, the open dialog. Not saved */
export interface Ui {
    page: string;
    mode: string;
    tab: string;
    shelfKey: string | null;
    medium: Medium | null;
    shelf: string | null;
    subject: string | null;
    tag: string | null;
    kind: string | null;
    genre: string | null;
    view: string | null;
    status: string;
    copy: string;
    sort: string;
    group: string;
    q: string;
    selecting: boolean;
    sel: Set<string>;
    modal: Modal | null;
    sideOpen: boolean;
    viewId: string | null;
    profileTab: string;
    filt: Partial<Filter>;
    hiddenView: boolean;
    private?: boolean; // the private collection is open
    modeMenu?: boolean;
    pop?: string | null; // the small menu that's open
    filterOpen?: boolean;
    filtAdv?: boolean; // the filter shows its advanced conditions
    blocksEdit?: string | boolean | null; // the kind of block page being arranged ("ov", "st")
    blockAdd?: string | boolean | null; // …and the one adding a block
    statsBasis?: string; // Stats counts everything, or only what's finished ("done")
    sortOnce?: string; // the library sorted once this way (Library health › stalled)
    extOpen?: Record<string, boolean>; // Settings › Extensions: the rows unfolded
    arrange?: boolean;
    listId?: string | null;
    franchise?: string | null;
    confirmListDel?: boolean;
    confirmReset?: boolean;
    confirmModeDel?: boolean;
    searchAll?: boolean;
    previewTheme?: string | null;
    statsView?: string;
    setSec?: string; // the Settings section that's open
    setQ?: string; // what Settings is searched for
    settingsFrom?: { page: string; y: number; player?: WatchPlayer | null } | null; // where Settings was opened from
    keyCapture?: string | null; // the shortcut being changed
    seasonQ?: string;
    seasonsOpen?: boolean;
    confirmBulkDelete?: boolean;
    editTheme?: string | null; // the theme open in Appearance
    editMode?: string | null; // the mode open in Settings › Modes
    openShelf?: number | null;
    keyState?: Record<string, string | null>; // each key being checked: "checking", "ok" or what went wrong
    confirmErase?: boolean;
    expPass?: string; // the backup passphrase, while the page is open (never saved)
    exp?: Record<string, unknown>; // the export's choices
    expParts?: Record<string, boolean>; // …the parts left in or out (Download everything)
    expRun?: { running?: boolean; done?: number; total?: number; note?: string } | null; // …and how the packing went
    expAsk?: boolean; // …asking whether to go on without a passphrase
    expSkip?: boolean; // …and the answer: yes, without the private things
    impNote?: string; // Import: why a profile link couldn't be read
    offline?: { running?: boolean; done?: number; total?: number; ctl?: AbortController; note?: string } | null; // saving pictures for offline
    charQ?: string;
    tierQ?: string;
    peopleQ?: string;
    peopleAll?: boolean;
    peopleRole?: string;
    cmpA?: string | null; // Compare: the two entries side by side
    cmpB?: string | null;
    cpScope?: string;
    statsYear?: number;
    rankShelf?: string | null;
    tlMore?: boolean; // a tier list's ⋯ panel is open
    tlPulling?: boolean; // a tier list is pulling in a title's cast
    tquick?: boolean | null; // a tier list's quick rank is open
    season?: { season: string; year: number } | null; // This season: the season shown (null: now)
    seasonOnly?: string; // …everything, only what's new to you, or only what you have
    quoteQ?: string; // Quotes: what they're filtered by
    wrapYear?: number; // Year in review: the year shown
    tasteMore?: Record<number, { busy?: boolean; err?: string; res: Candidate[] }>; // Your taste: each "Find more"
    tasteRes?: Record<string, Candidate>; // …and what it found, by AniList id
    wpOpts?: boolean;
    wpEdit?: boolean; // the player is being arranged ("Edit on the page")
    watchServers?: boolean; // Watch's servers panel is open
    readServers?: boolean; // …and Read's
    libPick?: ServerPick | null; // choosing by hand which title on your media servers a show is
    rlPick?: ServerPick | null; // …and which series on your reading servers a book is
    libTest?: Record<string, "…" | { ok: boolean; t: string }>; // each server's Test: still going, or what it said
    // the Learning Centre: the course and pathway open, the module unfolded, what's compared, Curricula's choices
    learnSub?: string | null;
    pwId?: string | null;
    learnDel?: string | null;
    lcOpen?: string | null;
    lcCmp?: string | null;
    uniSub?: string;
    uniView?: string;
    uniPaste?: boolean;
    uniTopics?: boolean;
    [field: string]: unknown;
}

/** the parts of the state that change separately, so a component redraws only for what it shows */
export type Part = "items" | "meta" | "ui";

/** a title the cast list could be from, when the first one found was the wrong one */
export interface CastPick {
    title: string;
    sub: string;
    tvmaze?: number | string;
    wikidata?: string;
}

/** something Discover found: a title, why it's suggested, and how to add it */
export interface Recommendation {
    title: string;
    medium?: string;
    kind?: string;
    creator?: string;
    author?: string;
    year?: number | null;
    cover?: string;
    pages?: number | null;
    reason?: string;
    verified?: boolean; // matched on Open Library
    threads?: { url: string; label: string }[]; // where people mentioned it
    olKey?: string;
    wikidata?: string;
    qid?: string;
    alId?: number; // an AniList relation: added from AniList
    from?: string; // the entry it was found from
    w?: number;
    add?: ItemDraft | Candidate; // what's added
    added?: boolean;
    dismissed?: boolean;
    [field: string]: unknown;
}

/** a show's episode, as TVmaze lists it */
export interface Episode {
    s: number;
    e: number;
    title: string;
    date: string;
    runtime: number | null;
    image: string;
    about: string;
}

/** what a picture being adjusted is for: a profile's avatar or banner, an entry's cover, a character, a favourite */
export interface FrameTarget {
    t: string;
    id?: string;
    mode?: string;
}

// ── Watch & read ──

/** a subtitle track that comes with a source (an extension's, or what a companion says it has) */
export interface SubTrack {
    url: string;
    label: string;
    lang: string;
    forced: boolean;
    baseLabel?: string; // its label before a number was added ("English 2")
}
/** somewhere an episode or film can play from: a file of yours, a link, a server, an extension's offer */
export interface WatchSource {
    name?: string;
    url?: string;
    file?: Blob; // a file on this device
    obj?: string; // …and the blob: address made for it
    how?: string; // "original", "adaptive" (a stream) or "converted" (made playable by the server)
    owner?: string; // whose it is: a friend's server, an extension
    ext?: string; // the extension that offered it
    info?: string; // a link that says how much of it has arrived (watch-read/stream.ts)
    subs?: SubTrack[];
}
/** what's playing: where in it, and which of its sources */
export interface WatchPlayer {
    title: string;
    show?: string; // the show's name, for the top of the player
    epTitle?: string;
    film?: boolean;
    single?: boolean; // one file opened on its own, not an episode of anything
    loading?: boolean; // the show is still being looked up
    si?: number; // the season, of W.seasons
    e?: number | null; // the episode
    listSi?: number; // the season the list beside the player shows
    srcs: WatchSource[];
    k: number; // the source playing, of srcs
    failed?: number[]; // the sources that didn't play
    looking?: number; // extensions still finding sources
    marked?: boolean; // ticked as watched
    reached?: boolean; // far enough in to count as watched
    offset?: number; // where a converted stream starts, in seconds (it can't seek, so it starts where you are)
    keepAt?: number; // where to carry on when the player is drawn again
    dur?: number; // the whole length, when the stream itself can't say
    chipShown?: boolean; // "Resumed at…" was shown
    prefDone?: boolean; // your usual server for this show has had its turn
    opts?: boolean; // the player's settings are open
    srcOpen?: boolean; // …the list of servers
    subs?: string; // a subtitle file you loaded (its blob: address)
    subFor?: string; // the source the subtitle list below is for
    subList?: SubTrack[];
    subPick?: string; // the track showing ("" off; not set: not chosen yet)
    subLast?: string; // the track C turns back on
    hold?: boolean; // waiting until it won't stop
    doneAt?: number; // when all of it had arrived
    audioChecked?: boolean;
    release?: () => void; // "Start now"
    holdNow?: () => void; // "Wait"
    holdNo?: () => void; // "Keep going"
    upNextGo?: () => void;
    upNextCancel?: () => void;
    upNextT?: ReturnType<typeof setInterval>;
    frame?: PlayerFrame; // how the video playing now was set up (watch-read/watch.ts renderPlayer)
}
/** how a video was set up when it was drawn: these stay as they were until the player draws a new one */
export interface PlayerFrame {
    url: string; // the address it plays ("" when there's nothing to play)
    yt: string; // a YouTube video's id
    lay: string; // "docked" or "cinema"
    custom: boolean; // the player's own controls on it
    controls: boolean; // the browser's own controls
    autoplay: boolean; // starting by itself (not when waiting until a stream won't stop)
}
/** an episode of the show open on the Watch page */
export interface WatchEpisode {
    e: number;
    s?: number;
    title?: string;
    image?: string;
    about?: string;
    date?: string;
    runtime?: number | null;
}
/** a season of the show open on the Watch page */
export interface WatchSeason {
    n: number;
    label: string;
    title?: string;
    member?: string | null; // its own entry in your library
    eps?: WatchEpisode[];
    loading?: boolean;
    ext?: Record<string, unknown>; // its ids at the catalogues, when it isn't in your library
    total?: number | null;
    year?: number | null;
    season?: string | number; // when it aired (AniList's WINTER, SPRING…)
    notInLib?: boolean;
}
/** the show open on the Watch page: an entry of yours, or what a catalogue found */
export interface WatchShow {
    id?: string | null;
    title: string;
    medium?: string;
    groupId?: string; // several entries watched as one show's seasons (meta.watchGroups)
    year?: number | null;
    creator?: string;
    cover?: string | null;
    banner?: string;
    about?: string;
    runtime?: number | null;
    total?: number | null;
    src?: string;
    ext?: Record<string, unknown>;
    alt?: Item["alt"] & { syn?: string[] }; // syn: other names it goes by
    [field: string]: unknown;
}
/** one of your media or reading servers (Settings › libs and rlibs); its key is in KEYS.libs */
export interface MediaServer {
    id: string;
    type: string; // jellyfin, emby, plex, folder, komga, kavita, opds
    name?: string;
    url?: string;
    on?: boolean;
    from?: string; // the friend who shared it
    [field: string]: unknown;
}
/** choosing by hand which title or series on your servers something is */
export interface ServerPick {
    q: string;
    busy: boolean;
    res: {
        lib: string;
        libName: string;
        title: string;
        ref: string;
        image?: string;
        thumb?: string;
        year?: number | null;
    }[];
}
