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
├── main.ts            starts what sits around the classic scripts: fonts, offline install, updates, Account & sync
├── features/          one folder per feature, everything about it side by side
│   ├── order.json     the order the classic scripts are joined in
│   ├── core/          the data model and store, modes, the page shell, navigation, search, keys, the click router
│   ├── library/       the library views, the item card, characters and people, lists and rankings, stats blocks
│   ├── sources/       AniList, TMDB, IGDB, Open Library… and the artwork they bring
│   ├── import-export/ imports, backups, the export format, the Download everything dialog
│   ├── insights/      Discover, the seasonal chart, Pick for me, your taste
│   ├── learning-centre/ courses, pathways, curricula
│   ├── watch-read/    the player, the reader, your servers; the own-sources rule
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
tests/                 unit/ (Vitest), e2e/ (Playwright, one file per area), fixtures/ (invented data only)
```

---

## Two kinds of code, side by side

Most of the app is **classic scripts**: plain JavaScript files that share one global scope, joined in the order of
`src/features/order.json` into one script. That's what lets the whole app run from a single file on disk. **New code is
Svelte 5 and TypeScript**, in the same feature folder: `src/features/account/` is the pattern to copy (one component per
screen, the steps in `account-state.svelte.ts`, typed API calls).

**Buttons.** Every button in classic markup says what it does in `data-act` (`data-act="season-add"`). One click
listener (`core/events.js`) finds the button and hands it to `actOn()` in `core/actions.js`, which sends a few by prefix
(`tl-` to tier lists, `ss-` to a series' servers, `ext-` to extensions…) and asks each area's `handlers.js` in turn. Each
handler is a `switch` on the name that returns true once it has dealt with it. A unit test (`tests/unit/buttons.test.js`)
fails if a button's name is handled nowhere, or by two areas.

**Svelte reads the classic state through the store** (`core/store.svelte.ts`): `store.items`, `store.meta`, `store.ui`,
typed by `core/model.ts`. The classic code still owns those objects and changes them in place, so the store keeps one
version number per part, which the classic code bumps after every change (`stateChanged`, called from `markDirty`,
`render` and the library's own `set` and `delete`). Because objects change in place, a component keeps a *copy* in a
`$derived` (`$derived({ ...store.meta.settings })`), never the object itself, or a change wouldn't show.
`core/globals.d.ts` lists the classic globals TypeScript may use.

**Whole pages** drawn by Svelte are listed in `core/pages.ts`: the shell hands the page to Svelte instead of drawing it,
and takes it back when you leave.

**Rewriting a feature in Svelte:** write its components beside its scripts, using the same data; switch the app to them;
delete the scripts and their lines in `order.json`. The app works and deploys at every step, and the export format
doesn't change, so backups keep working. It happens a feature at a time rather than all at once because each rewrite can
then be checked against the browser tests that already cover it.

---

## Adding a feature, in six steps

1. **A folder** in `src/features/<feature>/`, named for what it is to a person (`music`, not `media-adapter`).
2. **The data** it keeps goes in `core/model.ts` first. If it's stored, the export carries it
   ([data-format.md](data-format.md)), and an older export still opens.
3. **The screens** as Svelte components, using the store; styles in the component.
4. **Its buttons**, if it adds any to classic markup: a `<feature>/handlers.js` with one `switch`, added to `CLICK_AREAS`
   in `core/actions.js` and to `order.json`.
5. **A switch** in Settings › Extensions › Built-in if people might not want it (`extensions/builtins.js`).
6. **Tests**: a unit test for its logic, a browser test for what people do with it (`tests/e2e/<feature>.cjs`), and the
   accessibility sweep (`tests/e2e/a11y.cjs`) gets its page or dialog. Then the guide (`settings/guide.js`) says what it
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
  (`watch-read/own-sources.js`). Every way an address comes in goes through that one check.
- **No keys or personal data in the repo.** People's keys live in their browser and, sealed with their passphrase, in
  their exports. Secret server keys live only in the Worker. Test data is invented.
- **By feature, not by file type.** Everything about one feature sits in one folder.
- **Only what's open is in memory.** Dialogs, builders and pages are drawn when they open and dropped when they close;
  a book's pages are let go when you close it; the library draws shelves as you scroll to them.
- **Nothing runs in a tab you aren't looking at.** The backdrop stops drawing, sync waits until you're back, and an
  older tab never saves its copy over a newer one's (`core/core.js`, open in more than one tab).
- **Measured, not guessed.** `pnpm test:stress` builds a 10,000-item library and fails if memory or page size goes past
  its budget, or if going round the app leaves anything behind (`tests/stress/memory.cjs`).
