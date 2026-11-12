# Defending UniverList

*Every part a person touches, as I'd defend it at a whiteboard: how it works, why it beat the alternative, what breaks
it, and where it gives. This page changes in the same commit as the code it describes.*

Citations point at a file and a name inside it. App code is relative to `src/features/`; `worker/`, `public/`, `tools/`,
`tests/`, `wrangler.jsonc`, `vite.config.ts` and `src/styles/` are from the repo root. How the folders fit together is in
[architecture.md](architecture.md), and why each tool won is in [decisions.md](decisions.md); I don't repeat them here.

---

## 1. The library: items, modes, shelves, views

**How it works.** Everything I keep is two objects. `items` is a `Map` from a stable id to one entry, and `meta` holds
everything that isn't an entry: lists, favourites, modes, settings, profile (`core/core.ts`, `items`, `meta`; the shapes
are typed in `core/model.ts`). An id is made once, from the medium and the title, and lists, favourites and links point at
it (`core/core.ts`, `newId`). A mode is a lens, not a container: a list of patterns such as `"anime"`,
`"film:Anime film"` or `"!game"`, matched against each entry's medium and kind (`core/core.ts`, `matchPats`,
`DEFAULT_MODES`). Shelves are the same patterns one level down (`shelvesOf`). Cover, Grid, Spine and List are four ways
of drawing one filtered, grouped and sorted list (`library/library.ts`, `VIEW_LIST`, `libraryView`; the page is
`library/page/LibraryPage.svelte`).

**Why this, not that.** A mode could have owned its entries, like a folder. Then moving a film between modes would be a
copy, and two copies drift. Patterns keep one entry and many views of it; "Lives in" is a single field that overrides the
patterns for one entry (`core/core.ts`, `homeShows`). Stats, taste and rankings are worked out from scores every time and
never saved, so they can't disagree with the entries.

**What if…** The library holds thousands of entries: the visible library and each mode's slice are computed once per
change and cached against a version number that every write bumps (`core/views.ts`, `viewKey`, `all`, `modeItems`;
`core/core.ts`, `ITEMS_VER`). Past 300 entries the page draws, in each group, only the rows within a window's height of
the screen, and an empty block as tall as the rest stands in above and below; the rows are the page's own, read from
the shelf as laid out, and measured once drawn (`library/page/rows.ts`, `VIRTUAL_FROM`; `shelf.svelte.ts`, `update`). An entry arrives with a medium or status the app doesn't know: it's turned
into a book or "want" as it's read in (`core/core.ts`, `migrateItem`).

**The data.** A `Map` makes lookup, add and delete by id cheap, which is what cards, lists and links do all day. It makes
"everything in Culture, finished, sorted by score" a full pass: filter, group and sort over every entry, once per change.
The stress test builds 10,000 entries and fails if drawing the library takes 330 ms or more, if the JavaScript heap
reaches 60,000,000 bytes, or if 9,000 page elements are drawn, before you scroll or after (`tests/stress/memory.ts`,
`BUDGET`).

**Where it fails.** Any change throws the whole cache away, so a burst of background edits (covers arriving) means a full
recompute on the next draw. Rows not drawn yet are as tall as the first row drawn, until they're drawn: jump to the far
end of a long shelf and its height settles as you go. Find in page and a screen reader's list reach only the rows near
the screen. A long table keeps, out of sight, the few rows that decide its columns' widths (the widest texts and longest
words, `library/page/columns.ts`), so its columns stay as wide as with every row drawn. If libraries outgrow the stress
test, I'd keep each mode's slice updated by the change itself.

---

## 2. Adding and searching

**How it works.** Search waits until you've stopped typing for 420 ms, needs two characters and a connection, then asks
every column at once (`core/search.ts`, the `input` listener). Each column has its own clock: "still looking…" after
4 s, and "slow · try again" if nothing came after 12 s (`gsCol`). What each column asks (`GS_WEB`):

- Culture: AniList, 16 results (`alSearchAny`).
- Literature: Open Library and Google Books side by side.
- Film & TV: TMDB for both, when you have a key or the site lends one; otherwise TVmaze for series, and Wikidata merged
  with Apple's iTunes catalogue for films (`sources/sources.ts`, `filmSearchKeyless`).
- Games: IGDB when it's on, falling back to RAWG with your key, then Wikidata; plus the Internet Archive's software
  collections, with duplicate titles dropped (`sources/box-art.ts`, `archiveGames`).
- Music: MusicBrainz, one request a second (`music/musicbrainz.ts`).

What you already have is marked by matching catalogue ids first, then medium and title (`core/search.ts`,
`renderSearch`). ＋ adds the result with your default status through the same `addItem` everything else uses
(`core/core.ts`, `addItem`), and the cover search starts straight after.

**Why this, not that.** One combined search would wait for the slowest catalogue. Separate columns mean a slow source
only slows its own column. The keyless sources come first in every chain because the app has to work for someone with no
keys at all, from a file on disk.

**What if…** A catalogue is down: only its column is affected. Typing again aborts the previous round
(`GS.ctl.abort()`). Every request has its own timeout too, 20 s, or 30 s for Wikidata's query service, and a 429 becomes
a rate error rather than a crash (`sources/sources.ts`, `getJSON`). AniList is asked at most once every 2,150 ms, its
allowance while it's in degraded mode (`AL.gap`). Offline, the web isn't asked, but your own library is still searched
(`core/search.ts`, `gsLocal`). Adult titles are filtered unless you're in the private collection (`alSearchAny`).

**The data.** Every source answers in one shape: title, medium, year, cover, and `ext` ids at the catalogues. Those ids
are what mark duplicates now and refresh details later.

**Where it fails.** A catalogue that answers with an error, rather than slowly, shows "Nothing here", the same as a real
empty result: `gsCol` only marks timeouts. With TMDB on, a TMDB failure doesn't fall back to TVmaze in search. I'd mark
errors separately and fall back to the keyless source.

---

## 3. Catalogues without keys: the site lends TMDB and IGDB

**How it works.** The Worker runs only for `/api/*` (`wrangler.jsonc`, `run_worker_first`). `/api/status` says which
keys this site lends (`worker/proxy.ts`, the `status` route), and with no key of your own the app asks `/api/tmdb` and
`/api/igdb` (`sources/proxy.ts`, `loadSiteShares`; `sources/sources.ts`, `tmdb`; `sources/igdb.ts`, `igdbQ`). For those
two (`LENT`), the Worker:

- answers only the site's own pages: `Sec-Fetch-Site: same-origin` or a matching `Origin`, otherwise 403 (`proxy`);
- makes only the lookups the app makes: TMDB paths must match `TMDB_PATHS`, and only four query parameters with known
  values pass (`TMDB_PARAMS`); IGDB takes three endpoints (`IGDB_ENDPOINTS`) and a body of at most 16,384 bytes
  (`MAX_BODY`, `smallBody`);
- keeps each answer at the edge for a day, keyed by the sorted path, or by the SHA-256 of an IGDB body (`once`, `DAY`);
- counts only new lookups: 30 a minute per address (`SHARED_RL`) and 180 a minute per catalogue for everyone
  (`SHARED_ALL`), on top of 60 `/api` requests a minute per address (`API_RL`) (`wrangler.jsonc`, `ratelimits`);
- counts an IPv6 address by its first four groups, so a whole /64 is one asker (`worker/proxy.ts`, `addressKey`).

The keys are added inside the Worker and never sent back. IGDB's Twitch token is kept in memory and renewed 600 s
before it expires, or once after a 401 (`igdbAccess`, `askIgdb`).

**Why this, not that.** Asking every visitor for keys means nobody has film posters or game covers. Only TMDB and IGDB
are lent; the reasons RAWG, Comic Vine, ScreenScraper and Hardcover aren't are in [decisions.md](decisions.md). Every
other catalogue route (`OWN`) inside the site needs the proxy password, which the app sends as an `X-Pass` header so it
never sits in an address (`sources/proxy.ts`, `pxHeaders`), and the Worker compares it, like the ScreenScraper
picture signatures, in a way that takes the same time wherever it differs (`same`). The same file runs as anyone's own
Worker (its default
export), and the app offers its source to copy (`sources/proxy.ts`, `UNIVERLIST_WORKER`, which imports the file as text).

**What if…** A script pretends to be the site: it can forge `Origin`, so that check is courtesy, and the limits are the
real guard (the comment at the top of `worker/proxy.ts`). Traffic spikes: repeats come from the cache, and new lookups
past the limits get 429 with `Retry-After: 60` (`once`). A hostile path: every segment must be a plain name, dot-names
refused (`proxy`, "bad path"). The catalogue errors: the answer is passed on with `no-store`, so a bad one isn't kept
(`pass`). The proxy throws: the visitor sees "something went wrong" and nothing more (`worker/index.ts`).

**The data.** Nothing of mine: the edge cache (`caches.default`) keyed by address, and the rate-limit counters.

**Where it fails.** The edge cache lives per data centre, so "once for everyone" is once per location. The per-catalogue
total protects the keys at a price: a flood uses up that minute's new lookups for real visitors too. IPv6 addresses are
written out in full before the /64 is taken, so `2001:db8::5` and
`2001:db8:0:0:1::` count as one asker (`addressKey`, tested).

---

## 4. Covers and pictures

**How it works.** A cover is a link on the entry (`cover`) or a picture you uploaded, kept as a `data:` address
(`coverData`) (`sources/covers.ts`, `coverSrc`). Background work fills missing covers, one entry every 220 ms: books from
Open Library, then Apple Books, then Wikipedia; everything else refreshed from its own catalogue, games upgraded to box
art (`fetchArt`, `fetchBookCover`, `autoCovers`). Then, unless "Keep a copy on this device" is off (`offlineAuto`), each
cover is downloaded once into IndexedDB's `covers` store under its link (`core/core.ts`, `coverCache.fetch`), and its
main colour is read from a 24×36 sample for the spines (`dominantColor`). At start every cached cover gets an object
address, and `coverCache.src` uses that before the network (`coverCache.load`, `src`).

Some sites won't share pictures with other pages. When a cover fails to load it's tried again through wsrv.nl, a free
image proxy, and the host is remembered (`core/events.ts`, the image `error` listener; `core/core.ts`,
`coverCache.learn`). When downloading for offline, a host that failed 3 times goes through the proxy (`hostFails`). The
switch is `imageProxy`, on by default (`DEFAULT_SETTINGS`).

**Why this, not that.** Entries keep links, not bytes, so the library stays small enough to save and sync often; the
bytes sit in their own store, read only to draw. Proxying images through my Worker would turn every cover into a billed
request; wsrv.nl costs nothing, and the trade (it sees the picture's address and the visitor's IP address) is on the
privacy page and can be switched off.

**What if…** Offline, or 5 failures in a row: the artwork pass stops and says so, with "Try again" (`auto.offline`,
`renderAutoStatus`). A host answers with something that isn't a picture: only `image/*` of at least 1,200 bytes is kept,
and only `https:` links are fetched (`coverCache.fetch`). Everything is refused: after 60 failures the cache stops asking
for the rest of the session (`blocked`). Storage is full: the write fails quietly and the cover still shows from its
link.

**The data.** Link to blob. Cheap: a cover shows at once, offline. Expensive: nothing is ever evicted.

**Where it fails.** The cache has no size limit and no clean-up: a cover whose link changed leaves the old picture
behind, and the same picture under two links is stored twice. I'd key pictures by a hash of their bytes and prune any no
entry points at.

---

## 5. Saving

**How it works.** `markDirty(id)` notes one entry, `markDirty()` notes `meta`, and a save runs at most every 300 ms
(`core/core.ts`, `markDirty`, `scheduleSave`). `flushSave` writes only the dirty entries, in one IndexedDB transaction,
then the whole `meta` object (`flushSave`). It also runs when the tab is hidden and on `pagehide`. Where things are:

- the library: database `stacks`, stores `items`, `meta` and `covers` (`openDB`);
- keys you typed: `meta/keys` there and `stacks-keys` in localStorage (`saveKeys`);
- the sync key: its own database, `ul-account` (`account/crypto.ts`, `keepKey`);
- extensions: `univerlist-extensions` (`extensions/extensions.ts`, `extDB`).

**Open in two tabs.** Each save writes its time to localStorage (`univerlist-saved-at`). A tab that sees another tab
saved since it loaded is behind: it still saves its own entries, but never writes its older `meta` over the newer one,
offers "Bring them in", and reloads as soon as you come back to it (`noteSave`, `otherTabSaved`, the `storage` and
`visibilitychange` listeners).

**Keeping it.** The app asks the browser to keep the data at start (`main.ts`, `navigator.storage.persist`), and
Settings › Data says whether it promised (`settings/sections/Data.svelte`). The space-used line is two numbers: the
library's own size as JSON, and everything this site stores, from `navigator.storage.estimate()`
(`settings/sections/General.svelte`). On Chrome and Edge you can also keep a library file or a folder you pick, written
2.5 s or 3 s after a save (`core/core.ts`, `fileSync`; `import-export/packs.ts`, `folderSync`).

**Why this, not that.** A throttle, not a debounce: background work marks things all the time, and a debounce would
never fire (the comment on `scheduleSave`). One row per entry means a new score writes one entry, not the library.
IndexedDB over localStorage because it holds pictures and far more data and doesn't block the page.

**What if…** IndexedDB won't open: the whole snapshot goes to localStorage (`stacks-v3`) instead (`boot`, `flushSave`).
A write fails (the disk is full): a toast says to export a backup. The browser crashes: anything changed in the last
300 ms may not have been written. localStorage is blocked: `lastSaved` returns nothing, so two tabs can't see each
other.

**The data.** Entries are cheap to save one at a time. `meta` is written whole on every change to it, and it carries
uploaded profile pictures and banners as `data:` addresses (banners made up to 3,200 px: `core/events.ts`,
`fileToJpeg`), so a bigger profile makes every settings change dearer.

**Where it fails.** A failed write puts what didn't save back in the queue and tries again, waiting longer each time up
to a minute, until one works (`flushSave`, `saveFailures`); while it fails, the work is only in memory, so closing the
tab then loses it. A tab that's behind still writes whole entries, so if both tabs edited the same entry, the older
tab's copy can land last. I'd give each entry a version so a stale write is refused.

---

## 6. Undo

**How it works.** Every change a person makes goes through `change(label, ids, fn)`: it clones each entry before and
after, compares them, and records only what really changed, along with any `meta` parts named (`core/core.ts`, `change`,
`changeMeta`, `record`). Undo puts the "before" copies back, redo the "after" ones, and the toast offers Redo
(`applyEntries`, `undo`, `redo`). The keys are Ctrl/⌘+Z, and Ctrl/⌘+Shift+Z or Ctrl/⌘+Y (`core/keys.ts`).

**Why this, not that.** Snapshots of the touched entries instead of an inverse for every action: nothing extra to write
per feature, and anything that goes through `change` is undoable. The cost is memory, and it's bounded.

**What if…** History holds 150 steps (`record`). Reloading clears it: it lives in memory only. Background work uses
`quietPatch`, which isn't recorded, so undo never fights covers arriving. Locking the private collection, or making an
entry private, empties history, so undo can't bring a private entry back into view (`vaultLock`;
`library/item-actions.ts`, `makePrivate`). Deletions that arrive from another device are one step, "Removed on another
device", so they can be undone too (`account/sync.ts`, `mergeIn`).

**The data.** An array of steps, each with full clones. Applying one is cheap. A replace-import of 10,000 entries holds
two clones of each until it falls off the end.

**Where it fails.** Undo restores whole entries, so it also rolls back a background change made since (a cover found),
and big imports cost memory for as long as they're in history. I'd store field-level differences instead of copies.

---

## 7. Import and export

**How it works.** Download everything writes format 3, laid out in [data-format.md](data-format.md)
(`import-export/export-zip.ts`, `EXPORT_FORMAT`, `v2Files`). The zip is plain (stored) and written by my own code
(`import-export/importers.ts`, `zipFiles`); deflated entries are read with the browser's `DecompressionStream`
(`inflate`). Keys go in only sealed with a passphrase you type: AES-GCM, PBKDF2-SHA256, 310,000 rounds (`keysEncrypt`).
Pictures from links are taken from the cover cache or downloaded, and `images/index.json` maps each back to its link.

Reading starts from the bytes, not the name: `PK` is a zip, `1f 8b` is gzip, anything else is text
(`import-export/importers.ts`, `readImportFile`). Inside a zip: a UniverList export, Letterboxd's
`watched`/`diary`/`ratings` CSVs (`letterboxdZip`), or else the first XML (a MyAnimeList export, `malXML`), JSON or CSV.
A CSV is read by Papa Parse, loaded only then, which works out the separator (commas, semicolons, tabs) and
keeps a column whose name is used twice (`core/core.ts`, `parseCSV`); one the app doesn't recognise goes through a column
mapping (`guessMapping`, `mapRows`). A CSV you download puts a `'` before any cell a spreadsheet would run as a formula
(`csvCell`). A zip entry with a password or compression other than deflate is refused with a reason (`unzip`). Smart import looks each row up online with two
workers, pausing 700 ms after AniList rows and 150 ms after others, tolerates typos by comparing word fragments, and
shows unmatched rows before anything is created (`import-export/smartimport.ts`, `smartMatch`). Each part can be merged
or replaced on its own (`import-export/packs.ts`, `applyParts`).

**Why this, not that.** A stored zip because pictures are already compressed and every system opens one (the comment
on `zipFiles`). My own reader because the point where it stops unpacking is mine to choose.

**What if…** The file is hostile:

- a zip bomb: at most 60,000 entries, 512 MiB per entry and 2,048 MiB in all, and unpacking stops the moment it passes
  (`ZIP_LIMITS`, `inflate`, `unzip`); a Mac's hidden copies (`__MACOSX/`, `._name`) are skipped;
- a "picture" that isn't one: its type comes from its first bytes (PNG, JPEG, GIF, WebP, AVIF), it must be at most
  8 MiB, and anything else is dropped (`import-export/export-zip.ts`, `pictureType`, `MAX_IMPORTED_PICTURE`); an SVG is
  refused, since it can carry a script and a picture brought in can end up as a blob address in this app's origin;
- JSON with a `__proto__` key: dropped while parsing (`core/core.ts`, `safeJSON`);
- a zip whose directory points past its end (a download cut short) is refused as damaged (`unzip`); a date that isn't
  one is left out of that row rather than stopping the import (`isoOf`);
- parts of the wrong shape: each is checked as it comes in, before anything changes (`import-export/packs.ts`,
  `applyParts`): lists, characters and modes need an id, a setting or a layout value of another kind than the app's
  own is dropped (`likeOurs`), tags need a colour, and a Learning Centre is rebuilt from what's valid in it
  (`learning-centre/learning.ts`, `lcConvertOld`);
- links in data: only `http(s)` ever opens (`safeUrl`); every entry is forced into a known shape (`migrateItem`).

**Migrations.** Format 1 is recognised first, because its `data/library/` would otherwise look like format 3's
`library/` (`isV1`, `isV2`). Data left in the browser by an older app, Reading Room, is found and brought across as books
(`core/core.ts`, `migrateReadingRoom`). Each later change to the model is a step, `migrateV5` to `migrateV10`, run on
load and after an import, each guarded by a flag so it runs once (`loadFromSnapshot`, `applyParts`).

**Where it fails.** The whole file is read into memory, and every unpacked entry is held at once (`readImportFile`,
`unzip`), so a large export needs that much memory in one tab. The writer has no ZIP64: past 65,535 files or 0xfffffff0
bytes it refuses rather than write a broken file (`zipFiles`). The reader treats any method other than deflate as
stored. I'd stream both ways and add ZIP64.

---

## 8. Account & sync

**How it works.** Sign-in is a passkey, checked on the server with SimpleWebAuthn: a resident key, user verification
required, ES256 or RS256, no attestation (`worker/sync.ts`, `/register/options`). Challenges are single-use and last
5 minutes (`takeChallenge`, `LIMITS.challengeMin`). A session is 32 random bytes in a `__Host-` cookie (HttpOnly,
Secure, SameSite=Strict); the server keeps only its SHA-256, and it lasts 30 days from last use, renewed at most hourly
(`startSession`, `session`, `RENEW_AFTER`). Every change needs `X-UL-Sync: 1` and this site's `Origin` (`route`).

**The encryption.** A random AES-256-GCM sync key (`account/crypto.ts`, `newSyncKey`). The library is turned into JSON,
gzipped, and encrypted; the upload is a 12-byte IV followed by the ciphertext (`sealData`). The key leaves the device
only sealed, in boxes:

- per passkey: a key made with HKDF-SHA256 from the passkey's PRF secret, which is taken out of the passkey's answer
  before it's sent (`account/passkey-unlock.ts`, `passkeyKek`, `takeSecret`);
- the recovery code: 15 random bytes as 24 Crockford base32 characters (`account/recovery-code.ts`,
  `newRecoveryCode`), stretched with PBKDF2-SHA256, 600,000 rounds (`account/crypto.ts`, `ITER`); signing in with it
  uses a separate derivation, 100,000 rounds with its own salt, and the server keeps only a hash of that
  (`signInKey`; `worker/sync.ts`, `/recover`);
- a device link: `#link=<token>.<secret>`, where the 32-byte secret sits after the `#` and never reaches the server;
  one use, 10 minutes (`account/link-device.ts`; `worker/sync.ts`, `/link/join`, `LIMITS.linkMin`). Anyone can send
  a link, and using one merges this browser's library into that account, so the page first names the account
  (`/link/peek`, which changes nothing) and, where this browser already has a library or is signed in, waits for you to
  tick that the account is yours; unticked, "Not now" leaves everything as it was (`account/JoinLink.svelte`,
  `checkLink`, `joinWithLink`; `tests/e2e/account-link.ts`).

Every box names its key (`kid`, the first 16 bytes of a SHA-256 of it), and the server holds an account to one key
(`sameKey`). On a device you've unlocked, the key is kept in IndexedDB so it can sync by itself.

**What the server holds.** D1 `ACCOUNTS`: users (name, version, size, `kid`, boxes, the recovery hash, today's counts),
passkeys' public keys, session hashes, challenges, a device link while it lasts, and an audit list trimmed to 200
(`worker/migrations/`, `AUDIT_KEEP`). R2 `LIBRARIES`: the encrypted library, the last 3 versions plus the newest one from over a day ago (so a burst of bad
saves can't push every good copy out) and the oldest from the last day (which ages into it), each its own file
`u/<account>/<version>-<random>` (`PUT /data`, `LIMITS.keep`).

**Conflicts.** `PUT /data` needs `If-Match` with the version it replaces. It writes its own file, then compare-and-sets
the version; the loser's file is deleted and it gets 409 (`PUT /data`). The client then merges and tries again, up to 3
rounds (`account/sync.ts`, `syncNow`). The merge is three-way on entry ids: "the base", the ids both sides had when they
last matched, kept in localStorage; an entry in the base that one side no longer has was deleted there and stays deleted
(`mergeIn`). The base is written only after the library is saved here (`inSync`). It syncs 20 s after the last change,
uploads at most every 120 s, on coming back after 30 s away, on going online, on leaving, and every 5 minutes while
visible (`startAuto`).

**Caps that keep it free.** The whole site's R2 writes, reads and bytes stored this month, counted in D1 and stopped at
90% of the free amounts, each counted in the one `UPDATE` that spends it (`BUDGET`, `budget`, `storedBytes`). 1,000
accounts, checked again inside the insert itself (`MAX_USERS`, `/register/verify`);
20 MiB per upload; 300 writes and 1,000 reads per account per day, counted in a single `UPDATE` so two devices can't both
slip past (`DAILY`, `spend`); 10 passkeys; 64 KB JSON bodies, refused while they're still arriving (`body`); sign-in and
sign-up 10 a minute per address (`AUTH_RL`).
Accounts that never turned sync on are cleared after a day, and those that never saved a library after a week
(`clearAbandoned`). The worst-case arithmetic is in [hosting.md](hosting.md). The limit of that: someone with many
passkeys can still hold places, or use up the month's share. New sign-ups then get "no new accounts right now", or
syncing waits for the 1st; nothing breaks, nothing bills, every library stays whole on its devices. And the Worker's
100,000 requests a day are counted for the whole Cloudflare account, so a busy day here can pause other Workers on it.

**Why this, not that.** Passkeys, because there's no password to leak and no email to collect; WebCrypto, because
it's built in ([decisions.md](decisions.md)). One sealed blob, not rows per entry: the server can't read entries anyway,
and one R2 object per save keeps the billable operations countable.

**What if…** The network drops: the next sync runs when the browser says it's online. The server is lost: every device
still has the library; the cloud is a copy. A passkey is lost: the recovery code signs in and unlocks. Everything is
lost: nobody can open the cloud copy, by design. A session is stolen: deleting the account, a new recovery code, adding
or removing a passkey and letting a passkey unlock the library all still need a passkey or the code in the last 5
minutes (`FRESH`, `LIMITS.freshMin`). What it can do is save over the library; the cloud keeps the last three versions,
the newest one more than a day old, and the oldest one from the last day, which ages into the day-old copy (`PUT /data`,
five at most), so an hour of junk uploads can't push the good copy out, however often you save. A borrowed computer:
"Sign out and remove my library" deletes every IndexedDB database of the site and both storages
(`account/account-state.svelte.ts`, `clearThisBrowser`).

**Where it fails.** The merge is per entry, and within an entry the incoming copy wins field by field
(`import-export/packs.ts`, `applyParts`, `{ ...b, ...inc }`), so one entry edited on two devices keeps the other device's
edit. Settings take the incoming side; lists merge by id with this side winning. Every sync uploads the whole library,
so cost grows with the library, not the change. The kept key is extractable (so it can be sealed for a new passkey or a
QR code: `thisDevicesKey`), which means the page's Content-Security-Policy is what guards it. I'd move to per-entry
encrypted records with their own versions.

---

## 9. The private collection

**How it works.** A passphrase of at least 10 characters (`PASSPHRASE_MIN`; ones set before keep working) makes an
AES-GCM key with PBKDF2-SHA256, 310,000 rounds and a
random 16-byte salt (`core/core.ts`, `vaultKey`, `vaultCreate`; `library/profile-handlers.ts`). Private entries never
reach the `items` store: `flushSave` deletes them there, and every snapshot leaves them out (`publicItems`). They live as
one sealed blob in `meta.vault`, sealed again whenever a private entry changes (`vaultSeal`). Making something private
gives it an anonymous id, `x-` and random digits, and rewrites every reference to it (`library/item-actions.ts`,
`makePrivate`; `core/core.ts`, `rekeyItem`, `anonId`). Which types go private, and the private mode's view, are sealed
too (`SEALED_KEEP`). Locking drops the entries from memory and empties undo (`vaultLock`); an optional timer locks it a
chosen number of minutes after the tab is hidden (`library/item-actions.ts`, `vaultAuto`).

**Why this, not that.** A passphrase of its own, not the account: it works offline, without an account, from one file,
and even a device holding the sync key can't read it. Anonymous ids because a normal id is made from the title
(`newId`), and keeping it would say what the entry is.

**What if…** A wrong passphrase: AES-GCM refuses, and the app says so. A forgotten one: there's no way back, by design.
A backup or a sync carries the sealed blob as it is. Two tabs: sealing skips the `meta` write while the tab is behind
(`vaultSeal`).

**The data.** One blob: unlocking and every change cost work in proportion to the whole collection. Fine for a private
shelf; not for thousands.

**Where it fails.** Lists made inside the private collection are stored in `meta.lists` with `private: true` in plain
JSON, in the browser and in an export's `private/collection.json` (`import-export/packs.ts`, `packParts`), so their names
and notes aren't encrypted (the entries in them are anonymous ids). Its passphrase has a floor of ten characters (`PASSPHRASE_MIN`), which is still
only as good as the passphrase you pick, and it may sit in a backup. Sync doesn't merge two collections: the incoming one is applied only where there's none
(`applyParts`). I'd move private lists into the sealed blob.

---

## 10. Extensions

**How it works.** An extension is a manifest and files, from a zip, a `.json` or a `.js` (`extensions/extensions.ts`,
`extParse`). The manifest is checked: an id of the right form, the main script present, permissions cut to the known
list (`EXT_PERMS`), setting keys of the right form, labels at most 120 characters (`extFromParts`). Each runs in a hidden
`<iframe sandbox="allow-scripts">` (`extStart`). On the site its page is `ext-host.html`, which takes the code by message
and runs it; it's the only page whose policy allows inline script, and only the app may frame it (`public/ext-host.html`;
`public/_headers`). From disk it runs from `srcdoc`. Without `allow-same-origin` the frame has an opaque origin: none of
the app's storage, cookies or page.

The app answers messages only from that frame, and checks a permission for each request: `provide`, `storage.get/set`,
`companion.url`, `net.fetch` (`extOnMessage`). Its storage is its own keys only: `settings` (your settings for it, the
companion's address among them) and `series` (the servers you gave a series) are kept by the app beside it, and
`storage.get/set` refuse them (`EXT_RESERVED`). An answer to the app's call counts only from the frame of the extension
the call went to (`extCall` keeps which one), so one extension can't answer for another. `net.fetch` is `https:` only, to hosts the manifest lists, with
cookie, host, origin and referer headers dropped, no credentials, a body of at most 1,000,000 characters, an answer cut at
2,000,000, and 90 s (`extNetFetch`). When the app asks an extension for something, it waits 8 s, or 95 s for an episode's
sources, then gives up (`extCall`, `extAddSources`). The full permission list and API are in
[extensions.md](extensions.md).

**What one can never do.** Read the library, keys or another extension's data (it only gets what a call hands it);
touch the page; be asked for a job its permissions don't name; or get anything played that isn't yours (section 11).

**Why this, not that.** Running in the page would hand an extension everything. A Web Worker shares the page's origin,
so it could open IndexedDB. An opaque-origin frame is a wall the browser enforces, and messages are a small surface to
check.

**What if…** One is slow or silent: it's given up on, and each is asked on its own so it holds nobody else up
(`extEach`). One throws: the error comes back as a refused call. A manifest asks for more: unknown permissions are
dropped. Its secret settings (a companion password) go into backups only sealed with your passphrase
(`import-export/packs.ts`, `keysForBackup`). Removing one deletes its record. An official extension that was retired is
deleted at start, its saved settings with it, and an old backup's copy isn't brought back (`EXT_RETIRED`,
`extMigrateIds`, `extRestore`; `tests/e2e/ext-secrets.ts`).

**Where it fails.** An extension's own code can reach its companion and nothing else: before its code runs, its frame
gets a policy of its own whose `connect-src` is the companion's address or `'none'`, with every other kind of request
refused, on the site and from disk alike (`extPolicy`; `public/ext-host.html`; tested in `tests/e2e/csp.ts`). So the
title you're watching can only go where you sent it. What's left is the companion itself: it's another program, and
what it does with what it's given is up to whoever wrote it. Changing the companion's address restarts the extension, so
the policy follows. A companion address counts only if you typed it, or if the manifest's points at your own computer
or network (`extCompanionURL`, `isOwnNetwork`), and only for an extension with the companion permission, so an
extension can't name a server of its author's and call it a companion (`tests/unit/extensions-messages.test.ts`). Extensions brought in from a backup whose code differs from what's here arrive switched off, with a note
(`extRestore`). What a policy can't stop: a browser may still look up a name (DNS prefetch) or, in some browsers, open a
WebRTC connection, which `connect-src` doesn't cover everywhere; both would need code written to leak on purpose, and
are why an extension you don't trust shouldn't be installed at all.

---

## 11. Watch & read

**How it works.** Watch looks up shows in catalogues (TVmaze, AniList, TMDB) for seasons and episodes, never for videos
(`watch-read/own-sources.ts`, the header). What plays comes from your servers, Jellyfin, Emby, Plex or a shared folder
(`watch-read/medialibs.ts`, `LIB_TYPES`); links you added to a series (`watch-read/series.ts`); files you open; and
extensions (`extensions/extensions.ts`, `extAddSources`). The player is `<video>`; `.m3u8` plays natively where the
browser can, otherwise through hls.js, which is part of the site and loaded the first time a stream plays
(`watch-read/watch.ts`, `attachHLS`); YouTube plays in a `youtube-nocookie`
frame, the one outside page the site's `frame-src` allows (`public/_headers`; `tests/e2e/csp.ts` finds every embed in
the source and checks it loads under the real headers).

The reader takes CBZ or ZIP (pages unzipped by the import reader and sorted by number), EPUB (chapters in spine order,
read as XHTML or, if not well-formed, as HTML; pictures, style sheets and fonts given local addresses by their path in the
book, `url(...)` in styles included; each chapter in a frame sandboxed with no scripts, carrying a policy that lets it
load only those addresses), PDF (the browser's
own viewer) and a folder of images (`watch-read/read.ts`, `readStart`, `epubChapters`). Reading servers are Komga, Kavita
and OPDS (`watch-read/medialibs.ts`, `LIB_SETS`; `watch-read/readlibs.ts`). Every page picture gets an address made here,
and closing the book lets them all go (`readerDrop`).

What servers, catalogues, companions and files say is someone else's data: every field of a server's JSON, a folder's
listing, an OPDS page, an extension's chapters and a companion's progress report is checked before it's used, and
anything that isn't what it should be is left out (`medialibs.ts`, `readlibs.ts`, `stream.ts`). Answers can come late:
each lookup checks that the show or book it was for is still the one open, and drops what it found if not, so episodes,
seasons or chapters of something you've left never land on what you opened next (`libMatchShow`, `alMoreSeasons`,
`watchOpen`, `readMatch`).

**The own-sources rule.** `isOwnSource` allows a file you opened, a `blob:` made here, YouTube, and `http(s)` to your own
network: a host is a number, an IPv6 address or a name, and each is checked only against its own list (private IPv4
ranges and Tailscale's; `::1`, private and link-local IPv6; `localhost`, `.local`, `.lan`, `.home.arpa`, `.internal`,
`.ts.net`), so `10.example.com` is a name, not a private address (`isOwnNetwork`) or to the host of a server you added
or a switched-on extension's companion (`watch-read/own-sources.ts`). Every
way an address comes in goes through it, and the player checks once more right before anything plays
(`watch-read/watch.ts`, "the last check").

**Why this, not that.** UniverList tracks and plays what you own. A player that takes any address, plus extensions that
offer sources, is a front end for other people's videos. One check at every door, and again at the player, means that
can't be bolted on. `<video>` because MP4 and WebM play natively ([decisions.md](decisions.md)).

**What if…** The site is https and your server is plain http: the browser refuses mixed content, and the app says so
and suggests the server's https address or the one-file build (`watch-read/medialibs.ts`, `libReach`). A hostile EPUB:
its scripts can't run in the sandboxed frame, and its pictures and fonts from the web (a tracking pixel) are blocked by the
policy at the top of each chapter (`EPUB_CSP`; `tests/e2e/reader-epub.ts`). Long chapters: in scroll mode only pages
fewer than 3 away from you load eagerly, and the page you're on is worked out from where pages stand, loaded or not, so
jumping past pages that never load doesn't hold your place back (`renderReader`). A zip with no pictures or an EPUB whose
reading order leads nowhere is refused with a note, never opened empty or logged as read; a place saved from an earlier,
longer file with the same name is held to this one's length; one broken link in an EPUB's manifest (a stray `%`) leaves
the rest of the book readable; a folder listing with a `%` in a file's name still lists everything; and a catalogue that
says a chapter has a billion pages gets at most 5,000 addresses (`MAX_PAGES`). `tests/unit/reader-files.test.ts` and
`tests/unit/watch-read-servers.test.ts` try each one. The stress tests: a 40-page comic opened and closed three times leaves no page addresses
behind (`tests/stress/memory.ts`); a 300-page chapter opens in under 2 s, and as one strip fewer than 60 of its 300
pages load at first (`tests/stress/reader-big.ts`).

**Where it fails.** A server you add yourself counts as yours, whatever it serves: the rule stops the app from finding or
offering other people's videos, not you from typing an address. A `.ts.net` name can be made public (Tailscale Funnel),
so it's trusted as "your network" on Tailscale's word.

---

## 12. Insights

**How it works.** Stats and the Overview's blocks are computed from entries when they're drawn; nothing is stored.
"Your taste" takes your scores, marks the top quarter as high and the bottom 30 % as low, and measures how each genre
and theme lifts or sinks them (`insights/taste.ts`, `tasteModel`); "Find more" then asks AniList for that exact mix.
Discover is recommendations from the web, never from a model: Open Library's subjects, Reddit, Hacker News through
Algolia, Stack Exchange, and Wikidata's award winners (`insights/discover.ts`). Pick for me takes what's
planned, active or paused, filtered by the time you have, the media and "only things I own", and ranks it: active +3,
paused +1, a place in Up next, your head-to-head ranking of things you want, a favourite, the crowd's score, owning it,
and up to 2 more at random only if you press Shuffle (`insights/pick/pick.ts`). The seasonal chart is AniList's
season, kept for 6 hours in sessionStorage (`insights/mode-pages.ts`, `loadSeason`).

**Why this, not that.** Computed, not stored, so a stat can't drift from the entries it counts. Web sources, not a
model, so each suggestion links to somewhere you can check, with no key and no cost. Pick for me gives the same answer
twice unless you ask it not to, and can say why ("It's #2 in Up next").

**What if…** Offline: stats and Pick for me work; Discover and the season can't fetch, and say so. A source is rate
limited: AniList is spaced (section 2), the season isn't fetched again within 6 hours in that tab.

**The data.** Nothing new is kept, except the season list for the session.

**Where it fails.** Taste on a handful of scores is noise: quartiles of five numbers mean little. Discover depends on
public endpoints with their own limits, and caches nothing. I'd cache Discover the way the season is cached.

---

## 13. The Learning Centre

**How it works.** A built-in extension, on unless you switch it off (`extensions/builtins.ts`, `BUILTINS`). It keeps
`meta.courses`, `{ v: 2, subjects, paths, curricula }` (`core/model.ts`, `Courses`). A path is stages, then modules,
then readings in order, and a reading can wait for another ("once Rudin is underway") (`learning-centre/learning.ts`,
the header). Fetching from a link tries the page directly for 10 s, then this site's `/api/page`, then your own proxy,
20 s each (`learning-centre/learning-import.ts`, `lcGet`, `lcVia`). Talis Aspire lists are read from their JSON;
anything else is parsed with `DOMParser` from headings, tables and lists, and shown in a table you edit before anything
is saved (`lcRead`, `lcGuess`). Switched off, academic books show under Literature and nothing is deleted
(`core/core.ts`, `modePats`).

`/api/page` answers only the site's own pages (`Sec-Fetch-Site` or `Origin`; or with the password). It takes `http(s)`
only, a host that matches the university and reading-list patterns, checked again after
redirects, `text`, `json` or `xml` only, at most 6,000,000 bytes; it hands the page back as `text/plain` with the real
type in `X-Page-Type`, kept for an hour (`worker/proxy.ts`, `page`, `PAGE_HOSTS`, `MAX_PAGE`).

**Why this, not that.** Most university pages don't allow other sites to read them, so a proxy is needed; an open one
would be a free anonymiser and a way into other servers, hence the allow-list. Plain text, plus the `sandbox` policy on
every `/api` answer (`worker/index.ts`, `SEC`), means nothing fetched can run or render as a page of this site.
`DOMParser` builds a document without running its scripts.

**What if…** The page needs a sign-in or won't come: paste its text instead. It's huge: 413. It redirects elsewhere:
403, "it led somewhere else". It's hostile: it's text, parsed, never run.

**Where it fails.** The allow-list is patterns: a name that starts with "universi" under a country's ending passes, so
someone could register one. It still only answers the site's own pages, as plain text, at most 60 a minute per address.
The parsing is heuristics (`LC_CODE`, `LC_STAGE`), which is why the table you check exists. I'd move to a curated list
of university domains if the patterns were ever abused.

---

## 14. Themes, backdrops and fonts

**How it works.** A theme is a set of CSS custom properties applied while the app runs (`core/theme.ts`, `applyTheme`).
Each theme's built-in backdrop is CSS layers keyed by `html[data-backdrop]`, moving only with `transform` and `opacity`;
Still, Calm or Alive, where Alive follows scroll and the pointer through properties updated once per frame
(`look/ambience.ts`, `ambApply`, `ambTick`). Backdrops you make (the builder is off by default:
`extensions/builtins.ts`) are drawn on one canvas: each layer's shape is drawn once onto a small sprite, and each frame
stamps the sprites where they've drifted to; Alive draws when 15 ms have passed, Calm 31 ms, at no more than 1.5× the
screen's pixels (`backdrops/engine.ts`, `tick`, `size`). A backdrop is data only: unknown fields dropped, numbers clamped,
at most 4 layers of 300 shapes, 12 backdrops, a picture as a `data:` address of at most 700,000 characters
(`backdrops/backdrop.ts`, `MAX_LAYERS`, `MAX_BACKDROPS`, `MAX_PICTURE`); a picture over 4,096 px a side isn't drawn
(`backdrops/engine.ts`, `MAX_SIDE`). The bundled fonts are registered as `FontFace`s and fetched by the page only when
text uses them (`look/fonts.ts`, `addBundledFonts`); a font from the longer list comes from Google Fonts
(`core/theme.ts`, `loadFont`).

**Why canvas.** Three hundred moving shapes as page elements means layout work and memory for each; one canvas is one
element whatever it draws. The built-ins stay CSS, so Calm and Still need no script per frame. Custom properties because
user-made themes change while the app runs ([decisions.md](decisions.md)).

**What if…** The tab is hidden: the canvas loop stops (`backdrops/backdrop-layer.ts`, the `visibilitychange` listener),
and the CSS layers pause (`look/ambience.ts`, `data-hidden-tab`; `src/styles/layers/_backdrops.scss`). Reduced motion is
set: the level is forced to off, and every animation and transition is cut to 0.01 ms (`ambApply`;
`src/styles/layers/_screens.scss`, `data-motion="off"`). A shared backdrop file is hostile: it can only be shapes,
colours and a picture (the check in `backdrops/backdrop.ts`).

**Where it fails.** The bundled fonts are Latin subsets only (the `-latin-` files in `look/fonts.ts`), so Japanese text
in a theme set in Zen Kaku Gothic New or Shippori Mincho falls back to a system font. On the hosted site the service
worker keeps a font only once a theme has used it (`vite.config.ts`, the `on-first-use` cache), so offline, a theme
you've never opened shows a system font until you're back online. A font from the longer list tells Google your IP
address (the privacy page says so). I'd ship the Japanese subsets for those two families.

---

## 15. Offline, installing and updates

**How it works.** The service worker precaches the app itself, every `html`, `js`, `css`, `svg` and `png` file of the
build up to 6 MiB each, except the stream player; fonts and hls.js are kept the first time they're used, in the
`on-first-use` cache (`vite.config.ts`, `workbox`). Page loads fall back to the cached app, except `/api/`,
`/extensions/` and
the four redirect paths, which always go to the network (`navigateFallbackDenylist`). Updates wait to be accepted
(`registerType: "prompt"`): a new version shows "A new version of UniverList is ready" with Reload and Later, and the
first install shows "Saved for offline use" for 6 s (`update/UpdateToast.svelte`). This only runs in a production build
over http(s) (`main.ts`). `sw.js` is served `no-cache`, so the browser always checks for a new one (`public/_headers`).
Install keeps the browser's offer for the button in Settings; Safari and Firefox are told how from their own menus
(`core/install.svelte.ts`; `settings/sections/General.svelte`). The one-file build has no service worker at all
(`vite.config.ts`, `noServiceWorker`).

**Why this, not that.** Precache, so the app opens with no network at all after one visit. A prompt, not an automatic
reload, so a new version never swaps in under a half-typed dialog.

**What if…** Offline: the app opens, covers come from the IndexedDB cache (section 4), lookups fail with their own
messages, and sync waits for the browser's `online` event. The browser clears site data: the cached app and the library
go together, which is what Download everything is for.

**The data.** Cache Storage holds only the app's files. Catalogue answers aren't in it (no runtime caching is
configured); the browser's own HTTP cache keeps `/api` answers for a day because of their `Cache-Control`
(`worker/proxy.ts`, `pass`). Built files carry a hash in their name and are cached for a year as immutable
(`public/_headers`).

**Where it fails.** Card details looked up online aren't available offline unless they were saved onto the entry.
"Later" keeps the old version running until every tab closes. I'd add a runtime cache for catalogue answers.

---

## 16. The Worker and hosting

**How it works.** One Worker. Cloudflare serves `dist/` straight from its assets layer, and the code runs only for
`/api/*` (`wrangler.jsonc`, `assets`, `run_worker_first`). `/api` takes GET, POST and OPTIONS, `/api/sync` GET, POST
and PUT, and anything else is 405 (`worker/index.ts`). Every `/api` answer gets `nosniff`, a policy of
`default-src 'none'; frame-ancestors 'none'; sandbox`, HSTS, `no-referrer` and a resource policy (`SEC`, `secure`). The
site's files get a policy with `script-src 'self'` and no inline script, `object-src 'none'`, `frame-ancestors 'none'`,
`base-uri 'self'`, plus `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin` and a Permissions-Policy
that turns off camera, microphone, location, payment and USB (`public/_headers`). Styles allow inline (themes set them
while running) and Google Fonts; pictures, media and connections allow `http:` and `https:` because catalogues and your
own servers live there. `public/_redirects` sends `/source`, `/issues`, `/report` and `/sponsor` to the repository with
a 302, so moving the code changes one file, and a browser doesn't keep the old target. There's no `workers.dev` address
and no preview addresses (`wrangler.jsonc`, `workers_dev`, `preview_urls`). The full list of holes checked is in
[security.md](security.md).

**Why Cloudflare Workers.** Requests for static files never start the Worker, and on this plan they're free and
unlimited; `/api` is in the same deploy at the same address, so sync needs no CORS at all ([decisions.md](decisions.md)).

**What costs money.** Only R2. Worker requests and D1 are refused past their free daily limits, never billed; R2 bills,
so the caps in section 8 keep the worst case inside its free tier, and [hosting.md](hosting.md) does the sum.

**What if…** A spike on the files: free. On `/api`: 60 a minute per address, then the Worker's daily allowance, after
which it answers 429 until midnight UTC ([hosting.md](hosting.md)). D1 or R2 isn't set up: `/api/sync` says "sync isn't
set up on this site" (501) and everything else works (`worker/sync.ts`, `sync`). Anything throws: "something went
wrong".

**Where it fails.** Nothing in the code can raise an alert; that's a dashboard setting ([security.md](security.md), 43).
Each unauthenticated `/login/options` writes a challenge row: limited per address, but enough addresses
could spend D1's free daily writes and stop sign-ins for everyone until midnight UTC (the Cloudflare rate-limiting rule
on `/api/sync/`, in [hosting.md](hosting.md), is the first line there). I'd keep login challenges in a signed cookie
rather than the database.

---

## 17. Speed and memory

**The budgets.** `tests/stress/memory.ts`, with 10,000 entries that all have covers:

- drawing the library takes under 330 ms, from another tab and again in place;
- the JavaScript heap stays under 60,000,000 bytes, and the page under 9,000 elements before you scroll and after
  scrolling a long way (`BUDGET`);
- four more rounds of the app (pages, ten cards opened and closed, settings) add under 6,000,000 bytes, and no more than
  5 % more elements or listeners (`BUDGET.growth`);
- a 40-page comic opened and closed three times keeps none of its pages.

`tests/stress/library-load.ts`, with a real export: the library under 400 ms, Watch's home under 150 ms, Read's home
and Settings under 300 ms each; a 367-episode show opens with every episode listed in under 1.5 s; 8 s of playing redraws
the page at most once, with no task blocking it for over 100 ms; eight quick "next"s land on episode 9.
`tests/stress/reader-big.ts`: a 300-page chapter opens in under 2 s, 50 page turns take under 1 s, and so do 30
two-page turns.

**How it works.** Cached slices of the library (section 1), and a big library drawn only near the window
(`library/page/rows.ts`). A burst of changes reaches Svelte as one update, once the code making them finishes
(`core/store.svelte.ts`, `changed`, `publish`). Countdowns tick in place every 30 s without redrawing the page
(`core/events.ts`). A closed book's pages are let go (`watch-read/read.ts`, `readerDrop`). Nothing runs in a hidden tab:
the backdrop stops (section 14), the five-minute sync skips (`account/sync.ts`, `startAuto`), and the save is flushed as
you leave (`core/core.ts`).

**Why this, not that.** Measured, not guessed: each budget is a test that fails, so a slower change shows up as a
failure, not a feeling. The stress tests are their own script, `pnpm test:stress`, separate from `pnpm test`
(`package.json`).

**Where it fails.** Every number is from Playwright's Chromium on the machine running the test (`tests/e2e/env.ts`);
there's no budget for a slow phone. The app is one bundle with every feature in it (the older modules all import each
other, `core/start.ts`), parsed in full at every start, even for features switched off. I'd split the bundle by feature
as each one moves to Svelte, and run the stress tests under CPU throttling.

---

## 18. Privacy

**What is collected.** Nothing. No analytics, no ads, no tracking. The Worker logs errors and request counts, nothing
personal (`wrangler.jsonc`, `observability`). The account's device list says "Chrome on Mac" and no more
(`worker/sync.ts`, `device`). What the server keeps for an account is in section 8, and in plain words on
[the privacy page](../public/privacy.html).

**What leaves the device, and to whom.**

- Lookups go from your browser straight to each catalogue, which sees your IP address and what you looked up: AniList,
  Open Library, Google Books, Apple's catalogues, TVmaze, Wikidata and Wikipedia, MusicBrainz and the Cover Art Archive,
  the Internet Archive (`sources/`, `music/musicbrainz.ts`).
- TMDB and IGDB, when lent, are asked by the Worker: they see the Worker, not you, and the cache keeps answers, never who
  asked (section 3).
- Covers from sites that refuse pages go through wsrv.nl, unless you switch it off (section 4).
- A font from the longer list comes from Google Fonts (section 14).
- Discover asks Reddit, Hacker News through Algolia, Stack Exchange, Wikidata and Open Library (section 12).
- YouTube plays through `youtube-nocookie.com` (`watch-read/watch.ts`).
- Your own proxy and servers are yours. Extension requests through the app carry no cookies and no referrer
  (`extensions/extensions.ts`, `extNetFetch`).

**Why this, not that.** No server for the library is the privacy model: there's nothing of yours for me to collect. The
site sends `strict-origin-when-cross-origin` as its referrer policy, `/api` sends `no-referrer` (`public/_headers`;
`worker/index.ts`, `SEC`).

**What if…** You want everything out: Download everything. You want the cloud copy gone: deleting the account removes
every R2 version and every row in one go (`worker/sync.ts`, `POST /delete`).

**Where it fails.** The privacy page names the main catalogues but not every host (Discover's sources aren't listed). I'd
list every host on the privacy page, generated from the code.

---

## 19. Accessibility

**How it works.** The browser tests run axe-core against WCAG 2.0, 2.1 and 2.2, A and AA (2.2 adds the 24 px target
size, which every control meets: `src/styles/layers/_base.scss`), on the welcome screen, every tab,
Watch and Read, every Settings section, the library in each mode's own theme, eleven dialogs, three pages at 390 px wide
(with nothing scrolling sideways), and the privacy page (`tests/e2e/a11y.ts`, `TAGS`). "Skip to content" is the first
thing Tab reaches and moves focus to the page (`index.html`; the same test). Dialogs are `role="dialog"` with
`aria-modal`, the rest of the page is `inert` while one is open, so Tab stays inside it (`core/modals.ts`, `syncInert`),
and focus goes back to whatever opened them (`lastFocus`); the test checks both with an item card. Text on a coloured button is near-black or white, whichever has the higher WCAG contrast ratio
(`core/theme.ts`, `textOn`). Toasts are `role="status"` (`core/core.ts`, `toast`). Reduced motion always wins
(section 14).

**Why this, not that.** axe in the tests rather than Lighthouse, because it covers every page and dialog on every
change, and one overlay of my own because the dialogs are still drawn by the older code
([decisions.md](decisions.md)).

**What if…** Someone builds a theme with poor contrast: the sweep only checks the built-in themes, so theirs isn't
checked. A part is dragged: reordering has Move up and Move down, but not on every list yet (the privacy page).

**Where it fails.** Small secondary text, the counts and dates beside a title, is lighter than the 4.5:1 the rest of the
text meets; the privacy page says so, and the test doesn't hold it to that. Some catalogue pictures have only their title
as a description. I'd raise the muted colour in each theme until it passes.
