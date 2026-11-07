# Decisions

*Every tool UniverList is built with, what it was weighed against, and why it won. A dependency has to remove more than
it adds: when one is added or swapped, its line here changes in the same commit.*

---

## The app

| Part | Chosen | Why, for this app | Weighed against |
| --- | --- | --- | --- |
| Licence | **GNU AGPL-3.0 only**, with a permission for extensions and a credit line (section 7 terms in `LICENSE`) | Anyone can use, change and host it, but a changed copy that others use has to share its changes, so nobody can close it into a paid product. Extensions can use any licence. Moving to a more permissive licence later stays possible while the code is mine; going the other way couldn't be undone for versions already out | MIT (allows closed, paid copies), Apache-2.0 (the same, plus patents), GPL-3.0 (doesn't reach copies run as a website), MPL-2.0 (made for libraries) |
| Language | **TypeScript** for new code; the classic scripts stay JavaScript until their feature is rewritten | A large, long-lived data model. Types catch wrong field names and shapes that drift between modules before anything runs | JavaScript with JSDoc types |
| Interface | **Svelte 5** | The hardest bugs came from redrawing whole parts of the page on every change: search losing the cursor, a dialog losing what you typed, focus jumping. Svelte updates only what changed, and compiles to small plain JavaScript | SolidJS: as fast, smaller ecosystem. React: more code for the same thing (memoising to stop re-renders) and a bigger runtime; its UI kits matter little for an app with its own design |
| No server framework | — | Next.js and similar are built around rendering on a server. UniverList has no server for your library and must run from one file on disk | — |
| Styling | **SCSS**, with **CSS custom properties** for everything a theme changes | Themes, including ones people make, change colours and fonts while the app runs, which only custom properties can do. SCSS adds nesting and partials at build time | Tailwind: fixed at build time, which fights user-made themes, and it buries the design in class lists |
| Motion | **CSS** transitions and keyframes (`transform` and `opacity` only), Svelte's `transition:` and `animate:flip`; one `<canvas>` for backdrops people build | Covers everything the app does, costs nothing to download, and respects reduced motion | Motion (motion.dev), if a sequence ever needs timelines or springs |
| Fonts | **Fontsource**, bundled: the built-in themes' fonts, woff2 only, registered in `look/fonts.ts`, downloaded the first time a theme uses them and then kept for offline use (the service worker's `on-first-use` cache) | They work offline and no visitor's browser asks Google for them. A font someone picks from the longer list comes from Google Fonts, and the privacy page says so | Google Fonts for everything: no build size, but every visitor's address goes to Google |
| Your library | **IndexedDB**, in the browser | The only browser storage that holds this much; survives restarts, works offline, and the app asks the browser to keep it (`navigator.storage.persist`) | SQLite in WebAssembly: real SQL, about 1 MB more to download, for queries this app doesn't need |
| Backups | **The export zip** (format 3, [data-format.md](data-format.md)), written and read in the browser by a small zip reader and writer of my own (`import-export/importers.js`): stored, not compressed, since pictures already are; reading is capped against zip bombs | Works offline both ways, and needs no library for a few hundred lines; fflate is only used by the tests to build zips | JSZip, fflate in the app: more code shipped for compression the pictures don't need |
| Video | The browser's **`<video>`** | MP4 and WebM play natively. For other containers, the local media player's companion rewraps them as MP4 while they play (ffmpeg, on your own machine) | — |
| Build | **Vite** | Instant reload while working, and two outputs from one source: the website and the one-file build (`vite-plugin-singlefile`) | — |
| Offline and install | **vite-plugin-pwa** (Workbox) | After the first visit the site opens with no internet, and it can be installed | — |

## Accounts and the server

| Part | Chosen | Why | Weighed against |
| --- | --- | --- | --- |
| Hosting | **Cloudflare Workers with static assets** | Requests for the site's files are free and unlimited, `/api` runs in the same deploy at the same address, and the free plan allows any use | Netlify: separate functions and limits. Vercel: its free plan is non-commercial only and caps bandwidth |
| Server code | **One Worker** (`worker/`), plain JavaScript with `// @ts-check` | Small: it hides catalogue keys that must stay secret, and runs Account & sync | — |
| Sign-in | **Passkeys**, checked with **SimpleWebAuthn**, plus a recovery code | No passwords to leak, guess or reset. SimpleWebAuthn is reviewed and widely used, so there's no home-made WebAuthn parsing | Email and password; magic links (both need an email address, which the app never asks for) |
| Sync storage | **D1** (accounts, sessions) and **R2** (the encrypted library) | Both free at this size, and the Worker caps use so they stay free whatever anyone does ([hosting.md](hosting.md)) | — |
| Encryption | The browser's **WebCrypto** (AES-256-GCM, passkey PRF) | Built into every browser, nothing to download, nothing home-made | libsodium in WebAssembly |
| QR codes | **uqr** | Tiny, no dependencies, draws an SVG | qrcode (larger) |
| Catalogue keys | **The site lends its own TMDB and IGDB keys** through `/api`, cached for a day and limited per address | Films, TV and games then work for every visitor with nothing to sign up for. Only those two: RAWG's free plan is 20,000 lookups a month and personal, Comic Vine's terms are strict, and ScreenScraper and Hardcover keys belong to one person's account | Asking every visitor for keys (nobody does it) |
| Bot protection | **None beyond passkeys and limits** | Signing up needs a passkey, accounts are capped, and empty ones are cleared after a week. A CAPTCHA would add a third-party script to every page | Cloudflare Turnstile |

## Tools

| Part | Chosen | Why | Weighed against |
| --- | --- | --- | --- |
| Packages | **pnpm** | Fast, strict about what each package may use, one lockfile | npm |
| Format and lint | **Biome** (pinned) | One tool and one config for both | ESLint plus Prettier |
| Unused code | **Knip** (pinned) | Finds unused files, exports and packages | — |
| Types | **svelte-check** | Checks TypeScript and Svelte components together | — |
| Unit tests | **Vitest** | Shares Vite's setup; runs in milliseconds | Jest |
| Browser tests | **Playwright** | Whole flows in a real browser, including passkeys (a virtual authenticator) and the site under its real headers | Cypress |
| Dialogs and menus | **My own overlay** (`core/modals.js`): `role="dialog"`, `aria-modal`, focus moved in and given back, Escape to close | Every dialog is still drawn by the classic scripts, so a Svelte component library couldn't reach them yet, and its own markup and styles would change the look. The browser tests check focus and axe checks the markup. Revisit as each part moves to Svelte | Bits UI, Melt UI |
| Accessibility | **axe-core**, in the browser tests | Checks every page and the main dialogs against WCAG 2.1 AA on every change. Used only in tests (MPL-2.0), never shipped | Lighthouse (one page at a time) |
| Deploys | **GitHub Actions** | The steps live in the repo: check, test, build, and deploy only if all of it passes | Cloudflare's own Git builds |
