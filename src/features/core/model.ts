// src/features/core/model.ts
// ─────────────────────────────────────────────────────────────────
//  The data model, as types
//
//  What an entry in your library looks like, what else you keep (meta), and where you are in the app (ui). These
//  describe the objects the classic scripts already use (core/core.js makes them and migrateItem() fills in the
//  defaults), so new TypeScript and Svelte code gets names and shapes checked before anything runs. Fields that only a
//  few parts use are left to the index signature until those parts are rewritten.
// ─────────────────────────────────────────────────────────────────

type Medium =
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
type Status = "redo" | "done" | "active" | "want" | "dnf" | "paused";

/** one thing in your library */
export interface Item {
    id?: string;
    medium: Medium;
    title: string;
    status: Status;
    creator: string; // author, studio, director, developer
    kind?: string; // a medium's own kinds: "TV", "Movie", "Novel", "Academic"…
    year?: number;
    rating?: number; // out of 10, one decimal
    scores: Record<string, number>; // by criterion ("Story", "Art"…)
    prog: number; // episodes, chapters, pages… done
    total?: number;
    repeat?: number; // times watched or read again
    fav?: number; // favourite; meta.favOrder holds the order
    tags: string[];
    genres: string[];
    cover?: string; // a link, or "@images/covers/<id>.jpg" inside an export
    alt: { en?: string; romaji?: string; native?: string; original?: string };
    ext: Record<string, unknown>; // ids at the catalogues it came from (anilist, tmdb, olKey…)
    links: unknown[];
    rel: unknown[];
    log: unknown[];
    quotes: unknown[];
    journal: unknown[];
    copy: string; // "none", "physical", "digital"…
    subject?: string; // the Learning Centre's subject, for academic books
    addedAt: string; // ISO dates
    startedAt?: string;
    finishedAt?: string;
    lastAt?: string;
    private?: boolean;
    hidden?: boolean;
    [field: string]: unknown;
}

export interface Mode {
    id: string;
    name: string;
    match?: string[]; // which media and kinds it shows: "anime", "book:Academic", "!tv:K-drama"…
    space?: string; // a built-in it belongs to ("learning-centre")
    [field: string]: unknown;
}

/** the Learning Centre (meta.courses): your subjects and their paths */
interface Courses {
    v: 2;
    subjects: unknown[];
    paths: unknown[];
    curricula?: Record<string, unknown>;
}

/** everything you keep that isn't a library entry */
export interface Meta {
    tags: Record<string, { color: string }>;
    views: unknown[];
    queue: string[]; // Up next
    dismissed: string[];
    chars: unknown[]; // favourite characters
    people: unknown[]; // favourite creators, studios, actors
    tiers: unknown[];
    profile: {
        name: string;
        bio: string;
        avatar: string;
        avatarData: string;
        banner: string;
        bannerData: string;
        anilist: unknown;
    };
    modes: Mode[];
    lists: unknown[];
    favOrder: string[];
    orders: Record<string, string[]>;
    myOrder: Record<string, string[]>;
    themes: Record<string, unknown> | null;
    courses: Courses;
    vault: unknown;
    settings: { appName: string; builtins?: Record<string, boolean>; [setting: string]: unknown };
    layout: Record<string, unknown>;
    savedAt: string | null;
}

/** where you are: page, mode, tab, filters, the open dialog. Not saved */
export interface Ui {
    page: string;
    mode: string;
    tab: string;
    medium: Medium | null;
    status: string;
    q: string;
    modal: { kind: string; [field: string]: unknown } | null;
    sel: Set<string>;
    [field: string]: unknown;
}

/** the parts of the state that change separately, so a component redraws only for what it shows */
export type Part = "items" | "meta" | "ui";
