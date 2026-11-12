# Architecture

*How UniverList fits together: the boxes, the rules between them, and how to add something. Why each tool was chosen is
in [decisions.md](decisions.md).*

---

## The shape

```
Your browser
 ├── the app (the same files for everyone, from the site or from one index.html on disk)
 ├── your library ── IndexedDB, in this browser only ──▶ profile-export_<name>_<date>.zip when you move or back it up
 ├── extensions you installed ── sandboxed; one can talk to a companion program on your own machine
 └── online, only for extra details:
       AniList, TMDB, TVmaze, Open Library…   called straight from the browser
       IGDB, SteamGridDB, Comic Vine…         through /api, the Worker that keeps their secret keys

Cloudflare
 ├── the site's files ── free, unlimited, cached at the edge
 └── the Worker (worker/) ── /api: the catalogue proxy (stores nothing) and Account & sync (D1 + R2, encrypted blobs)
```

**Your library has no online database.** The proxy adds a key to a request and passes the answer back. The one exception
is optional: Account & sync keeps your library in the cloud, encrypted on your device first with a key the server never
sees.

---

## The folders

```
src/
├── main.ts            starts the app: the app's modules first (features/core/start.ts), then fonts, offline
│                      install, updates, the Svelte pages, Account & sync
├── features/          one folder per feature, everything about it side by side
│   ├── core/          the data model and store, modes, the page shell, navigation, search, keys, the click router
│   ├── library/       the library page (page/, Svelte), the item card (card/, Svelte), the tiles both are made of
│   │                  (tiles/), Add (add/), the entry form (entry/), the score (score/), the list and people dialogs
│   │                  (lists/, people/), the overview's blocks and their grid (blocks/, Svelte), Stats (stats/,
│   │                  Svelte), tier lists (tiers/, Svelte), Adjust a picture (frame/, Svelte), characters and people,
│   │                  lists and rankings
│   ├── sources/       AniList, TMDB, IGDB, Open Library… and the artwork they bring
│   ├── import-export/ imports, backups, the export format, the Download everything dialog
│   ├── insights/      Insights and each mode's own pages (pages/, Svelte), Discover (discover/), Pick for me
│   │                  (pick/), your taste
│   ├── learning-centre/ courses, pathways, curricula; its pages (pages/, Svelte) and dialogs (dialogs/, Svelte)
│   ├── watch-read/    the Watch and Read pages (page/, Svelte), the player (player/, Svelte), the reader (reader/,
│   │                  Svelte), your servers, a show's servers (dialogs/, Svelte); the own-sources rule
│   ├── extensions/    built-in parts you can switch off, and extensions you add
│   ├── settings/      Settings (one Svelte component per section) and the guide
│   ├── look/          the backdrops behind each theme, the bundled fonts
│   ├── backdrops/     the Backdrop builder
│   ├── music/         albums, from MusicBrainz
│   ├── account/       Account & sync
│   └── update/        the "new version" notice
└── styles/            tokens, reset, and the style layers (each refines the one before)
worker/                the Worker: the proxy, Account & sync, the database's migrations
extensions/            the official extensions
tests/                 unit/ (Vitest), e2e/ (Playwright, one file per area), stress/, fixtures/ (invented data
                       only); all TypeScript, typed by tests/tsconfig.json (the page's test hook: tests/hook.d.ts)
tools/                 the identity guard, packing the extensions, the icons, the check that no build people get has
                       the test hook; TypeScript, run by Node as they are
```

---

## Two kinds of code, side by side

The app's source is all **strict TypeScript and Svelte**: there are no JavaScript files in `src/`. Most of it is **the
older modules** (`src/features/<feature>/*.ts`), which draw the page as HTML strings and import what they use from each
other. They began as one shared script, so they still import each other in one big circle, and the order
they load in says little. So as it loads, a file only declares its functions and tables. What it does at start-up
(listeners, timers, the dialogs and blocks it adds, and last of all the app itself, in `core/events.ts`) is in its
`init…()` function, and `core/start.ts` runs those once, in a fixed order. A new start-up step goes in its file's
`init…()`, never at the top of the file. **New code is Svelte 5 and TypeScript**, in the same feature folder:
`src/features/account/` is the pattern to copy (one component per screen, the steps in `account-state.svelte.ts`, typed
API calls).

**Buttons.** Every button in the older code's markup says what it does in `data-act` (`data-act="season-add"`). One click
listener (`core/events.ts`) finds the button and hands it to `actOn()` in `core/actions.ts`, which sends a few by prefix
(`tl-` to tier lists, `ss-` to a series' servers, `ext-` to extensions…) and asks each area's `handlers.ts` in turn. Each
handler is a `switch` on the name that returns true once it has dealt with it. A unit test (`tests/unit/buttons.test.ts`)
fails if a button's name is handled nowhere, or by two areas.

**Svelte reads the older code's state through the store** (`core/store.svelte.ts`): `store.items`, `store.meta`,
`store.ui`, typed by `core/model.ts`. The older code still owns those objects and changes them in place, so the store
keeps one version number per part, which the older code bumps after every change (`stateChanged`, called from
`markDirty`, `render` and the library's own `set` and `delete`). Because objects change in place, a component keeps a
*copy* in a `$derived` (`$derived({ ...store.meta.settings })`), never the object itself, or a change wouldn't show.
The shapes of the library, its settings, the open dialog and Watch & read's state (what's playing, the show open, your
servers) are in `core/model.ts`, and every module is typed against it. Anything from outside (JSON, storage, a message,
a catalogue's answer, a media or reading server, a file you open) arrives as `unknown` and is checked by a small guard
(`isRecord`, `isStatus`, `asSnapshot`, `at`, `fieldsOf`, `textOf` in `core/core.ts`) before it's used. Files you import
are read as hostile: every part of one is checked as it's brought in (`import-export/packs.ts`, `applyParts`), a
Learning Centre from a file is checked by `learning-centre/learning.ts` (`lcConvertOld`), and a book or comic you open
by `watch-read/read.ts` (`readStart`, `epubChapters`).

**The test hook** (`core/test-hook.ts`) is for the tests, and only in the builds they run. The browser tests and
extensions' own test suites call the older code inside `page.evaluate` through one object, `window.__ulTest`
(`__ulTest.extGet`, `__ulTest.items`, `__ulTest.goSettings`…), each name read live from its module (two, `extCall` and
`renderMain`, can be replaced with a stand-in), plus `booted` (the start-up has finished: the tests wait for it) and
`syncNow()` (for the account tests). Its type is what the tests see (`tests/hook.d.ts`), so a test calling a name the
app no longer has fails `pnpm check`. `core/start.ts` installs it only when `__UL_TEST_HOOK__` is true, which Vite sets
in the test builds alone (`pnpm build:e2e`; the modes `e2e` and `file-e2e` in `vite.config.ts`): in the site and the
one-file build the call and the module are left out, and `tools/no-test-hook.ts` fails either build if any of it is
there ([decisions.md](decisions.md)). Nothing in the app reads the hook, and the app puts nothing of its own on
`window`: whether the start-up has finished is `isBooted()` in `core/events.ts`. A name a test needs goes in the hook's
list; a name no test uses any more comes out of it.

**Whole pages** drawn by Svelte are listed in `core/pages.ts`: the shell hands the page to Svelte instead of drawing it,
and takes it back when you leave. A mode's page is one of them (`profile`, `core/shell/ProfilePage.svelte`): the profile
header and the tab you're on, each tab listed by its name in `TABS` there (`library`, `stats`, Insights and the pages a
mode has for what it's for, `discover`, `seasonal`…). `main.ts` gives them to the shell (`useSveltePages` in
`core/shell.ts`), so the shell doesn't import the Svelte pages that import it. **The shell** itself (the top bar, the
sidebar, the search box: `core/shell/`) is handed over the same way (`useSvelteShell`), and mounted where it goes the
first time it's drawn. **Dialogs** are all drawn by Svelte: they're listed in `core/dialogs.ts` and handed to the overlay
the same way (`useSvelteDialogs` in `core/modals.ts`). **Menus** (every right-click menu, and the small menus a button
opens: a block's settings, the tab editor, an episode's link) are listed in `core/menus.ts` and handed to the menu box
(`useSvelteMenus` in `core/keys.ts`). **The player and the reader**, which cover the page, are mounted on `<body>` when
they open and unmounted when they close (`watch-read/surfaces.ts`, handed over as `useSveltePlayer` and
`useSvelteReader`). Every page is drawn by Svelte now (below, what's still an HTML string).

**Rewriting a feature in Svelte:** write its components beside its older files, using the same data; switch the app to
them; delete the old files, with their `init…()` calls in `core/start.ts`. The app works and deploys at every step, and the export format
doesn't change, so backups keep working. It happens a feature at a time rather than all at once because each rewrite can
then be checked against the browser tests that already cover it.

---

## Moving a screen to Svelte

The item card (`library/card/`) was the first screen drawn as HTML strings to move, then the library page
(`library/page/`), then most dialogs and the right-click menus, then the small dialogs and menus, Insights with the pages
each mode has for what it's for (`insights/pages/`), Discover (`insights/discover/`) and the Learning Centre's dialogs
(`learning-centre/dialogs/`), then the Learning Centre's pages (`learning-centre/pages/`), the overview and its blocks
(`library/blocks/`), Stats with Year in review (`library/stats/`), tier lists (`library/tiers/`) and the last two
dialogs (Adjust a picture, `library/frame/`; a show's servers, `watch-read/dialogs/`), then Connections (Favourites,
`library/favourites/`; the Lists tab, `library/lists/`; Compare, Franchises and People, `library/connections/`), the Rank
tab (`library/rank/`), the shell (the top bar, the sidebar, the profile header with its tabs and mode menu, the search
box: `core/shell/`), and last Watch & read (the Watch and Read pages, `watch-read/page/`; the player,
`watch-read/player/`; the reader, `watch-read/reader/`) with the pieces of Settings that were still HTML (the line about
background work, a mode's grid of media and types, the types, Your games with LaunchBox's panel, the proxy's sources:
`settings/parts/`, `settings/sections/data/`); Settings and the guide were written in Svelte from the start. What's left
as HTML strings, on purpose: the book page the reader writes for an EPUB chapter (`epubChapters`, `rdBookCSS` in
`watch-read/read.ts`: it's a document of its own in a sandboxed frame, not part of the page), the guide's text (written
in Markdown, `settings/Guide.svelte`), the QR code's SVG (`account/LinkQr.svelte`), the import note with its link (text
the app writes, `ui.impNote`), and the icons (below).

**Where it lives.** A folder beside the feature's older files, named for what it is: `library/card/`. One root component
(`ItemCard.svelte`), and one component per part a person would name: the side, each tab, Edit details. Not one file for
the whole screen, and not one per button. What it works out stays in plain TypeScript next to it (`library/item.ts`:
which tabs, the facts, the pace), so the components only show it. The markup is the old markup tag for tag, with the same
classes, ids and `data-*` attributes, so the styles and the browser tests apply unchanged. Before and after screenshots of
the screen are compared pixel by pixel; anything but anti-aliasing is a mistake.

**How it's mounted.** A page goes in `core/pages.ts` (and `SVELTE_PAGES` in `core/shell.ts`) by its name; a mode's tab
is a line in `TABS` there, and a part of a tab that's a screen of its own is drawn by the tab (the Lists tab draws an
open tier list, `tiers/TierListPage.svelte`, in place of its lists). `main.ts` hands the list to the older code
(`useSveltePages`, `useSvelteDialogs`), so `shell.ts` and `modals.ts` never import a component. `renderMain()` mounts the
page in `<main>` the first time; after that it only asks it to catch up. Catching up is immediate (the store's
`flush()`), so older code that calls `render()` and then reads the page, as the browser tests do, finds it drawn
(asked from inside a Svelte update, say by a `change` event a removed box sends, it waits for that update instead). A
mode's page (`core/shell/ProfilePage.svelte`) draws the profile header and the tab in its frame (`.tabbody`), afresh
when you move to another tab (`{#key}`), as the shell did. The element a page or dialog is mounted in is marked
`data-svelte` (and so is a tab's frame): older code that reaches into the page from outside (a cover arriving,
`updateItemTiles`; a picture that won't load, the `error` listener in `core/events.ts`) leaves what's inside it to the
component, which gets the same news through the store. For a dialog,
`renderOverlay()` still draws the frame (the scrim, the box with `role="dialog"` and `aria-modal`), keeps the page behind
`inert`, moves focus in and gives it back; it mounts the component in the box the first time, and after that only asks it
to catch up. Another dialog of the same kind opened in its place (a new `ui.modal`) is mounted afresh, as one drawn as
HTML starts afresh. `closeModal()` unmounts it, so nothing stays in memory after it closes. A **right-click menu** is the
same in small: `core/keys.ts` still owns the one menu box (`#ctx`: placing it inside the window, closing it on a click
elsewhere, Escape or a scroll away), and mounts the menu's component in it with what it's about (`{ k }`: an entry's id,
a list's…); `closeCtx()` unmounts it. A menu a button opens is placed at the button (`openMenu(kind, k, x, y)`); one with boxes to
fill in rather than choices to pick (a block's settings, the tab editor, an episode's link) is given a `label`, and the
box is then a small `role="dialog"` named by it rather than a `role="menu"`. A mode's tab draws the hidden-entries note
at its own top (`core/page/HiddenNote.svelte`), as the shell did above every tab drawn as HTML.

**How it gets state.** Through the store (`core/store.svelte.ts`), never from the older objects alone: reading
`store.items`, `store.meta` or `store.ui` is what makes it redraw. The root component makes one `$derived` copy of what it
shows (the card: the entry, cloned, and the dialog's state from `ui.modal`, with its lists copied), because the older
code changes those objects in place. Children get that copy as typed props (`Entry`, `Modal` from `core/model.ts`).
A dialog's own state (its tab, what's unfolded, what's loading) stays on `ui.modal`, where the older code and the tests
can still set it; the component changes it with `store.dialog({ tab })`. Older code that sets it in place and calls
`renderOverlay()`, or bumps `stateChanged("ui")`, is drawn too. Things you're typing are the component's own `$state`, and so is what only it needs to remember (Pick for me's Shuffle,
an Edit section left open). A box that shows something saved follows it when it changes from outside (Remove picture
empties the picture's link) and keeps what's typed otherwise. A fold (`<details>`) the older code opened by redrawing is
`bind:open` to the component's own state, opened by the dialog's state when that asks: a plain `open={…}` would shut it
again on the next update. Work that runs on after a click (a Discover search, a Learning Centre fetch) writes to the
dialog it was started from, and redraws only while that's still the one open (`if (ui.modal === m) renderOverlay()`):
the older modules can't import the store, as it would start before `core.ts` has.
Since nothing is redrawn wholesale any more, a component clears its own boxes after it uses them (a menu goes back to its
first line once used: the library's bar for what you've selected), and wraps its body in `{#key id}` where the old redraw
used to start afresh (the card, when ← or → moves to another entry). What a component shows from outside its props
(your settings, the theme, titles in your language, pictures kept for offline) has to be read where the store sees it:
a function that reads `meta.settings` inside a template or `$derived` doesn't make it redraw. Read through
`store.meta` and copy, or, for a piece drawn hundreds of times, call one watcher at the top of its `$derived` (the
tiles' `tilesWatch()`, `library/tiles/watch.ts`).
A page that works a lot out from your whole library (the overview's blocks, a course, Curricula, Stats, Insights and
the pages beside it, Connections, Rank) reads
`store.itemsByFrame` instead of `store.items`, and so do the tiles: entries change in the background one at a time
(covers arriving, a sync), and a burst of hundreds would otherwise work the page out hundreds of times (40 seconds for
300 covers on the stress test's library, against a third of a second for the HTML page). It brings changes to your
entries at most once a frame; reading `store.ui` beside it keeps a redraw that's asked for (`render()`) immediate.
A page that copies what it shows (a course and its pathway, a Curricula, a tier list) copies it whole each time
(`clone`), and saves to the real thing found by its id (`lcPath`, `lcSub`, `curS`).
**The shell** (`core/shell/`: the top bar, the sidebar, the search box, and the profile header's mode menu) is the
exception: it draws when the older code asks it to (`renderSide()`, `renderTop()`, `renderSideStatus()`, the search's
progress), exactly as often as its HTML was redrawn, and not on every change to your library, so a burst of covers
doesn't recount the sidebar once a frame. Asking bumps a number in `core/shell/shell-state.svelte.ts` that only the
shell's components read (`shellChanged()`, `searchChanged()`; pages aren't woken by it), and draws at once. That module
imports nothing of the app's, so the older modules can use it. The top bar's busy light, which background work reports
often, is a little `$state` of its own there (`busy`, set by `updateBusy()`), so only the light redraws. What each part
shows is worked out in plain TypeScript beside the older code (`sideView`, `topView`, `profileView` in `core/shell.ts`;
`searchView` in `core/search.ts`, which also keeps the rows in order for ↑ ↓ and Enter, `GS.rows`).
**Watch & read** work the same way, for the same reason: their state is in plain objects the older code changes in place
(`W`, `RD`, the servers' lists), and they draw when they're asked to, as often as their HTML was redrawn, never on a
change to your library. `watch-read/stage-state.svelte.ts` keeps a number per part (`stageChanged("page")` for the
pages, `"res"` for a search's results alone, `"video"` for a new `<video>`, `"player"`, `"side"`, `"srv"`, `"subs"`,
`"mark"`, `"look"` for parts of the player, `"reader"` and `"rdlive"` for the reader), and each component reads only its
own. The older functions keep their names and ask: `renderPlayer()` (a new video), `playerRedraw()` (the player around
it), `srvRefresh()`, `subRefresh()`, `renderReader()`. Background work Settings › Data reports on (artwork, crowd
scores, an AniList sync, reading LaunchBox's database) asks the same way, through `sources/work-state.svelte.ts`
(`renderAutoStatus()`, `renderAlStatus()`): only its line in Settings draws again for each step.

**What stays imperative, and why: the video and the reader's pages.** Svelte draws the player once per video and
never on `timeupdate`. What changes while it plays is written straight to the elements by code the components attach
(`{@attach}`), kept in one place each:
- `watch-read/player/video.ts` (`videoRig`): the `<video>` itself. Its source, HLS, where to start, the resume chip and
  Up next, keeping the place when the page around it changes. A `<video>` that Svelte recreated would start again from
  the beginning (and reload the stream), so the player's `{#key}` is the video's own news (`stageNews.video`), and
  nothing else replaces it: the settings, the servers, the Watched tick, moving a button or the cinema's episode list
  draw around it. What a video was made with (its address, custom controls or the browser's, autoplay) is kept on it
  (`W.player.frame`); a change that needs another video asks for one (`playerRedraw()` compares).
- `watch-read/player.ts` (`pcPart`, `pcBind`, `pcDraw`): the custom controls' play button, time, scrub bar and volume.
  Each registers its element; the video's own events (`timeupdate`, `progress`, `play`, `pause`, `seeking`…,
  `volumechange`) write them.
  Drawing them through state would redraw the bar four times a second.
- The overlay over the video (buffering, the slow-start card, the resume chip, Up next, an error) is a small `$state`
  class (`player/overlay.svelte.ts`), written by the stream code (`stream.ts`, `streamAttach`): it changes on network
  events, not on frames.
- The reader (`reader/Reader.svelte`) is drawn on `renderReader()`; turning a page is a page change, not a redraw of
  the strip. A long strip's images stay the same elements when it draws again (keyed by page; the browser loads them
  lazily as they come near, three around where you are eagerly), and where you are as you scroll is its own news (`"rdlive"`, from `rdTrack`). An EPUB chapter is a document in a
  sandboxed frame (its CSP, XHTML parsing, links and `url()`s rewritten as before, `read.ts`), set as one string.
- Keys for the player and the reader are the component's own `<svelte:document onkeydowncapture>`, calling the same
  functions (`playerKey`, `readerKey`), so every key does what it did, and they go when the player or reader does.

**How actions are wired.** Saving goes through the save functions the older code uses (`patch`, `change`, `setStatus`,
`logProgress`, `addTagTo`…), so undo, the dirty marks and every cache stay right. Then:
- *Fields* (inputs, selects, text areas, folds) are handled in the component (`onchange`, `onkeydown`, `ontoggle`,
  `bind:value`). The global listeners that matched them by id in `core/actions.ts` and `core/events.ts` are deleted.
- *Buttons that need what only the component holds* (what's typed into it, which tab or fold is open) are handled in the
  component with `onclick`. They keep their `data-act` name so the tests, keybinds and Enter shortcuts can still press
  them, and their `case` is deleted from the `handlers.ts` (the router finds no handler and leaves them alone).
- *Buttons that change your library* and *buttons other screens draw too* keep going through `data-act` and the area's
  `handlers.ts`, so a name means the same thing everywhere. They move when the last older screen using them does.
- A box with a `data-act` the component handles (`onchange`: Pick for me's "Only things I own") counts as its own too.
- `tests/unit/buttons.test.ts` checks all three: every `data-act` is handled somewhere, by one area, and never by a
  component *and* a handlers file.
- Listeners for the whole page that only the screen needs (the library's and a tier list's dragging, the box you drag
  over covers, a tier list's keys, Rank's ← → ↓, the search box's keys and presses, the sidebar's edge and peeking, a
  tab dragged along the bar) move into the component as `<svelte:document>` and `<svelte:window>` handlers, so
  they go when the screen does. Dragging rows or tiles into another place (a list's rows, Up next and the overview's
  Next up, favourites, characters) is one small class, `library/lists/reorder.svelte.ts`: the page hands it its drag
  events and draws the marks it keeps; the shared drag code in `core/events.ts` is gone. One that has to run before the app's own document listeners, as the older capture-phase
  one did, is the capture form (`ondragstartcapture`, `onkeydowncapture`), and stops the event the same way. What
  they change is the component's `$state` (the drop marks, the covers inside the box), never a class set from outside
  on an element Svelte draws: Svelte would set it back.
- Pieces still shared with older screens stay HTML strings and are embedded with `{@html}`, rather than being written
  twice. They move when their last string-drawn user does: the medium's dot and the pills beside a title became
  `library/tiles/` (`MediumDot`, `StatusPill`, `CopyPill`, `MyScore`, `CrowdPill`, from `mdotLook`, `statusPillLook`…
  in `core/views.ts`) when Connections and the spine's hover card moved; the card's score widget became
  `library/score/ScoreWidget.svelte` when the right-click menu moved, and the entry form `library/entry/EntryFields.svelte`
  when Add did. A piece used in several places says what it does through callbacks (the score's `pick` and `typed`), so
  each place keeps its own way of saving, and keeps its buttons' `data-act` names (`rate`, `crit`, `ctx-rate`).
- What a dialog's handlers changed in place on `ui.modal` before calling `renderOverlay()` still draws (the store is told
  to catch up), so a button that stays in a `handlers.ts` file can go on doing that; a component changes it with
  `store.dialog()`, given the dialog it meant (`store.dialog(change, live)`) when the change comes after a wait, so an
  answer that arrives after the dialog closed is dropped.

**Shared dialog pieces.** `core/dialog/`: `DialogHead` (the title and Close, `head()` before), `Pic` (a picture from
outside: one that won't load is tried once more through the image proxy, as the older code's `error` listener does for
pictures outside `[data-svelte]`), and `caretAtStart` (a text box focused as the dialog opens starts with the caret at
the top, as one drawn as HTML did; Svelte sets the text afterwards, which puts the caret and the box's scroll at the end).
Whitespace is markup too: a space between inline pieces that the string had is written `{" "}` where Svelte would trim
it (the edge of an `{#if}`), and the screenshots catch any that's lost. So are text runs: a sentence the string wrote as
one run of text between links is one text node there, and the same words split over several `{…}` and `{#if}` pieces
are laid out a hair differently (Your taste's lines). Such a sentence is worked out in TypeScript as pieces with the
plain words joined (`nuanceLine`, `pairLine` in `insights/taste.ts`), and drawn piece by piece. A run of white space
the string had around a part it might leave out (`${a ? "…" : ""}` between two line breaks) is one text node there; in
Svelte, white space on both sides of an `{#if}` is two, so the `{" "}` goes inside the `{#if}`, after what it draws, and
no line break is left between such blocks. Svelte drops white space between the elements of an `<svg>` (write it
`{" "}` there too), and can't put text in a `<tbody>`: that one space is the only difference the DOM comparison is left
with (Stats › Compare's tables), and it lays nothing out.

**Lists and keys.** A `{#each}` is keyed only by something that can't repeat: what comes from outside (a backup's
subjects, a mode's tabs, genres listed twice) can, and a repeated key stops the page. A row with a box the component
doesn't set itself (a tick drawn ticked) is keyed by its place too, or a row reused for the next one keeps the tick
taken off the one before (the tab editor).

**Shared pieces: the tiles.** A piece that a moved screen draws many of becomes a component as soon as that screen moves,
even while older screens still draw it: covers, library cards, cover tiles and spines are `library/tiles/` (`Cover`,
`Card`, `CoverTile`, `Spine`), used by the library page and the item card. What a tile shows is worked out once, in
`library/tiles/tiles.ts` (`coverLook`, `cardSub`, `tileStyle`, `spineLook`…), and both the component and the older
screens' strings drew from it, tag for tag the same. Only the markup was written twice, and it couldn't show different
things. A string went when its last older user moved (the spine's with the library page; the library card's, the cover
tile's, a favourite's tile, a character's card and a list's card with Connections; `coverHTML`, the last, with Watch &
read).

**Icons.** The app's icons are fixed SVG written here (`ICON` in `core/shell.ts`). They're shown by one component,
`core/Icon.svelte` (`<Icon name="search" />`), the only place they're put into the page; `name` is typed as a key of
`ICON`, so nothing else can be inserted through it. Nowhere else does `{@html}` take an icon.

**Long lists.** A screen that can list your whole library draws only what's near the window once there's a lot of it
(the library page, past 300 entries, `VIRTUAL_FROM`: `library/page/rows.ts`, `shelf.svelte.ts`). It keeps the old
layout: each group's shelf is still one CSS grid, wrapping row or table, the rows near the window are drawn in it, and
an empty block as tall as the rest stands in above and below. The rows are the page's own: a grid's columns are read
from the shelf as laid out, wrapping tiles break where the browser would break them, and each row's height is measured
once drawn. A table also holds, out of sight (`visibility: collapse`: no height, but it counts for the widths), the few rows
that decide its columns' widths (`columns.ts`), and the block above a table's rows carries the border its rows share. So
what's on screen is laid out exactly as if everything were drawn, and markup, classes and the browser
tests' selectors don't change. The blocks are kept out of the browser's scroll anchoring (`overflow-anchor: none`), or
drawing rows above one would move the page by all the rows it stands for. What a list does with all of it (select all,
Shift-click ranges, ← and → on the card, dragging into place) works from the data, never from what's drawn.

**Shared pieces: the overview's blocks.** A mode's page and its block on the overview (This season, Series, Diary,
Playing) show the same things: both are components, the block beside the page (`insights/pages/…Mini.svelte`), drawn
from one function in plain TypeScript (`seasonGroups`, `seriesGroups`, `diaryEvents`, `gameLook` in
`insights/mode-pages.ts`).

**Blocks.** The overview and Stats are one block system: what each block is (its name, width, what can be set) is a
line in `BLOCKS` (`library/blocks.ts`) or `STAT_BLOCKS` (`statblocks.ts`), and `library/blocks/BlockGrid.svelte` draws a
mode's layout of them, with arranging, adding, the layout's source, the masonry packing and the rows of covers. A block
is drawn by its component, listed by key in `blocks/views.ts` (the overview's) or `stats/views.ts`; a block that's a
chart of rows has no component of its own, and says what it shows instead (`chart`: its rows, how numbers are written,
a line above it), drawn by `ChartBlock.svelte` as bars, columns, a donut or a list. A new block is a line in the
registry and, unless it's a chart, a component and a line in the views list. Every bar chart in the app is
`blocks/Bars.svelte` (rates of finishing included), worked out by `blocks/charts.ts`.

**What to delete.** The screen's HTML-string functions (`TAB_BODY` and the string dialogs' `MODALS` are gone: every tab
and dialog is Svelte now), with their `init…()`
call in `core/start.ts` if nothing else is left in it; the `case`s and id-matching listeners the component took over;
the screen's helpers that only it used (from `core/modals.ts`, `core/parts.ts`…) and their names in
`core/test-hook.ts` (and the browser tests that call them); manual redraws after a change the store already carries (`renderOverlay()`, the library's
`renderBulk()`, a `renderMain()` after `markDirty()` that changed only what's saved: one that changed `ui` stays); the screen's `afterRenderHooks` and document listeners; an HTML string no older screen uses any more.
Keep the `data-act` names. Then `pnpm lint` (Knip finds what's left unused), `pnpm check`, the unit, browser and stress
tests, and the screenshots.

---

## Adding a feature, in six steps

1. **A folder** in `src/features/<feature>/`, named for what it is to a person (`music`, not `media-adapter`).
2. **The data** it keeps goes in `core/model.ts` first. If it's stored, the export carries it
   ([data-format.md](data-format.md)), and an older export still opens.
3. **The screens** as Svelte components, using the store; styles in the component.
4. **Its buttons**, if it adds any to the older code's markup: a `<feature>/handlers.ts` with one `switch`, added to
   `CLICK_AREAS` in `core/actions.ts`.
5. **A switch** in Settings › Extensions › Built-in if people might not want it (`extensions/builtins.ts`).
6. **Tests**: a unit test for its logic, a browser test for what people do with it (`tests/e2e/<feature>.ts`), and the
   accessibility sweep (`tests/e2e/a11y.ts`) gets its page or dialog. Then the guide (`settings/guide.ts`) says what it
   does.

---

## Rules

- **Store what can't be worked out.** Stats, taste and rankings are computed from your scores, never saved.
- **Every item has a stable id**; pictures, lists and favourites point at it.
- **The export is the contract.** The interface, the stack, even the language can change; the export format changes only
  with a migration and a test that loads the older format.
- **Anything from outside is checked before it's used:** imports, backups, extension manifests, catalogue answers, URLs.
  Text from data is escaped wherever it's shown, and links from data open only `http(s)`.
- **Watch plays only your own sources**: files on the device, your own network, servers you added, YouTube
  (`watch-read/own-sources.ts`). Every way an address comes in goes through that one check.
- **No keys or personal data in the repo.** People's keys live in their browser and, sealed with their passphrase, in
  their exports. Secret server keys live only in the Worker. Test data is invented.
- **By feature, not by file type.** Everything about one feature sits in one folder.
- **Only what's open is in memory.** Dialogs, builders and pages are drawn when they open and dropped when they close;
  a book's pages are let go when you close it; a big library draws only the rows near the window.
- **Nothing runs in a tab you aren't looking at.** The backdrop stops drawing, sync waits until you're back, and an
  older tab never saves its copy over a newer one's (`core/core.ts`, open in more than one tab).
- **Measured, not guessed.** `pnpm test:stress` builds a 10,000-item library and fails if memory or page size goes past
  its budget, or if going round the app leaves anything behind (`tests/stress/memory.ts`); Insights and the pages beside
it are timed on the same 10,000 (`tests/stress/insights.ts`), and so are the overview with every block, a burst of 300
changes arriving, and the Learning Centre with 40 long courses and a 20-programme curriculum (`tests/stress/overview.ts`),
and so are the shell (the whole app drawn again, the sidebar, a key typed in the search box), Connections and Rank, and
a burst of 300 changes with Insights or Favourites open (`tests/stress/shell.ts`).
