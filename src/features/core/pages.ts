// src/features/core/pages.ts
// ─────────────────────────────────────────────────────────────────
//  The pages drawn by Svelte
//
//  The older page code (core/shell.ts renderMain) asks for one of these when you open it, and lets it go when you
//  leave. While it's open, the page draws itself and keeps up with the store; renderMain only asks it to catch up
//  (at once, so code that redraws and then reads the page finds it drawn).
//  A page is named as ui.page names it, and gets all of <main>. A mode's page ("profile") is its profile header and
//  the tab you're on (shell/ProfilePage.svelte), each tab listed here by its name (TABS).
//  A new page is one line here, and its name in SVELTE_PAGES in shell.ts; a new tab is one line in TABS.
//  The element a page is drawn in is marked data-svelte, so the older code that reaches into the page (a cover
//  arriving, a picture that won't load) leaves it to the page.
// ─────────────────────────────────────────────────────────────────

import { type Component, flushSync, mount, unmount } from "svelte";
import Guide from "../settings/Guide.svelte";
import Settings from "../settings/Settings.svelte";
import LibraryPage from "../library/page/LibraryPage.svelte";
import OverviewPage from "../library/blocks/OverviewPage.svelte";
import StatsPage from "../library/stats/StatsPage.svelte";
import FavouritesPage from "../library/favourites/FavouritesPage.svelte";
import ListsPage from "../library/lists/ListsPage.svelte";
import RankPage from "../library/rank/RankPage.svelte";
import DiaryPage from "../insights/pages/DiaryPage.svelte";
import InsightsPage from "../insights/pages/InsightsPage.svelte";
import PlayingPage from "../insights/pages/PlayingPage.svelte";
import QuotesPage from "../insights/pages/QuotesPage.svelte";
import SeasonalPage from "../insights/pages/SeasonalPage.svelte";
import SeriesPage from "../insights/pages/SeriesPage.svelte";
import LearnPage from "../learning-centre/pages/LearnPage.svelte";
import CurriculaPage from "../learning-centre/pages/CurriculaPage.svelte";
import ProfilePage from "./shell/ProfilePage.svelte";
import WatchPage from "../watch-read/page/WatchPage.svelte";
import ReadPage from "../watch-read/page/ReadPage.svelte";
import { store } from "./store.svelte";

const PAGES: Record<string, Component> = {
    settings: Settings,
    features: Guide, // "What's in here": the guide
    watch: WatchPage, // Watch & read: the player opens over it (watch-read/player/)
    read: ReadPage, // …and the reader over this (watch-read/reader/)
};
// a mode's tabs, by name
const TABS: Record<string, Component> = {
    overview: OverviewPage,
    library: LibraryPage,
    favourites: FavouritesPage,
    stats: StatsPage,
    lists: ListsPage, // and a tier list open there (tiers/TierListPage.svelte)
    discover: InsightsPage,
    rank: RankPage,
    seasonal: SeasonalPage,
    series: SeriesPage,
    quotes: QuotesPage,
    diary: DiaryPage,
    playing: PlayingPage,
    learn: LearnPage,
    paths: LearnPage, // the old Pathways tab, in libraries that still have it: pathways are inside their course now
    curricula: CurriculaPage,
};

let shown: { name: string; target: HTMLElement; app: ReturnType<typeof mount> } | null = null;

export const hasPage = (name: string) => name === "profile" || Object.hasOwn(PAGES, name);
export function showPage(name: string, target: HTMLElement) {
    if (shown?.name === name && shown.target === target) {
        store.flush("ui");
        return;
    }
    hidePage();
    target.innerHTML = "";
    target.dataset.svelte = "";
    // a mode's page is the profile header, and the tab you're on (TABS)
    shown = {
        name,
        target,
        app:
            name === "profile" ? mount(ProfilePage, { target, props: { tabs: TABS } }) : mount(PAGES[name], { target }),
    };
    flushSync();
}
export function hidePage() {
    if (!shown) return;
    const s = shown;
    shown = null;
    unmount(s.app);
    delete s.target.dataset.svelte;
}
