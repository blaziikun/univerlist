# Third-party software and data

UniverList's own code is GNU AGPL-3.0 ([LICENSE](LICENSE)). These parts are other people's work, used under their licences.

## Shipped with the app

| What | Licence |
| --- | --- |
| Fonts, via Fontsource: Inter, Space Grotesk, IBM Plex Sans, IBM Plex Mono, DM Sans, Sora, Chakra Petch, Zen Kaku Gothic New, Newsreader, Fraunces, Lora, Libre Baskerville, Shippori Mincho, Overpass | SIL Open Font License 1.1 |
| Svelte | MIT |
| SimpleWebAuthn (browser and server) | MIT |
| uqr (QR codes) | MIT |
| hls.js (adaptive streams from your own media server, outside Safari; loaded only when one plays) | Apache-2.0 ([full text](https://www.apache.org/licenses/LICENSE-2.0)) |
| Workbox (offline support) | MIT |

## Used only to build and test (never shipped)

fflate (the identity guard's zip reading), Vite, vite-plugin-pwa, vite-plugin-singlefile, Sass, TypeScript, svelte-check, Biome, Knip, Vitest, happy-dom, Playwright,
esbuild and Wrangler (MIT, Apache-2.0 or ISC), and axe-core (MPL-2.0).

## Data from catalogues

Covers and details are fetched while the app runs, from each catalogue's own service, and are never bundled. Each is
credited where its data is shown and in the guide (Settings › What's in here). Among them: AniList, TMDB (this product
uses the TMDB API but is not endorsed or certified by TMDB), TVmaze, Open Library, Wikidata and Wikipedia, MusicBrainz and
the Cover Art Archive, IGDB, RAWG, SteamGridDB and Comic Vine. UniverList isn't affiliated with any of them.
