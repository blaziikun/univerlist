# Security: seventy common holes in web apps, checked

*Each item on the list, checked against UniverList: the site, its Worker (`/api`, with Account & sync under
`/api/sync`), the one-file build and extensions. ✅ dealt with, and how it's kept that way · ➖ doesn't apply, and why ·
⚠️ a trade-off, said plainly.*

| # | Hole | | Here |
|---|---|---|---|
| 1 | Exposed database credentials | ✅ | There are none to expose: the Worker reaches D1 and R2 through bindings, not passwords. The database id in `wrangler.jsonc` is only a name; nothing can be done with it without your Cloudflare login |
| 2 | Public .env files | ✅ | Local secrets live in `.dev.vars`, which is git-ignored and never in `dist/` (only `public/` and the build go there) |
| 3 | Hardcoded API keys | ✅ | None in the code. Server keys are Worker secrets; people's own keys stay in their own browser. The keys the site lends (TMDB, IGDB) are added inside the Worker and never sent back: tested |
| 4 | Weak or missing authentication | ✅ | Passkeys (WebAuthn) with user verification, checked on the server by `@simplewebauthn/server`; no passwords exist to guess. `account.ts` signs up and in with real (virtual) passkeys. **Confirm it's you:** deleting the account, a new recovery code, adding or removing a passkey, and letting a passkey unlock your library all need the passkey or the recovery code within the last 5 minutes (signing in with either counts), so a device that got in another way (a QR code someone else scanned) can't lock you out or keep itself a way back in. What such a device *can* do is save over your library; the cloud then still has your last three versions, the newest one more than a day old, and the oldest from the last day, which becomes that day-old copy as it ages (five at most), so even someone who saves every hour always has a copy at least a day old. `sync.test.ts` and `account-link.ts` check it. |
| 5 | No authorization checks | ✅ | Every Account & sync route after sign-in needs a valid session; `sync.test.ts` checks each one refuses without |
| 6 | Users able to access other users' data | ✅ | No route takes an account id: every query uses the session's own. `sync.test.ts` has a second account try to read, change and revoke the first's |
| 7 | Open database read/write permissions | ✅ | D1 and R2 can only be reached through the Worker's bindings; nothing is public |
| 8 | Misconfigured Firebase / Supabase / S3 buckets | ✅ | The R2 bucket has no public access (don't switch on its r2.dev address: nothing needs it) |
| 9 | Admin routes left unprotected | ➖ | There are no admin routes. `/api/status` only says which sources are set up, never a key |
| 10 | Debug pages exposed in production | ✅ | None in the build. Test pages and fixtures never go into `dist/` |
| 11 | Build logs leaking secrets | ✅ | CI passes the Cloudflare token as a secret (masked in logs); nothing prints keys |
| 12 | Verbose errors leaking stack traces | ✅ | The Worker answers "something went wrong" and nothing more: 400 for a request it can't read, a JSON 503 with the security headers when its database or storage fails (`sync()`, `route()`, `worker/index.ts`); tested in `sync.test.ts` |
| 13 | Leaked GitHub repos or commit history | ✅ | CI runs Gitleaks (a fixed release, checked against its fingerprint) over every commit on every push, and the identity guard (`tools/guard.ts`) fails on any private word in any file, any earlier version of a file, the files inside a zip, a picture's metadata, or a commit's author, committer or message. Both run on every push to main and ran clean before the first commit. Exports and backups are git-ignored |
| 14 | Secrets in frontend JavaScript | ✅ | The built files were scanned for key and token patterns: none |
| 15 | Client-side-only security checks | ✅ | Every rule for accounts (who you are, which data, sizes, versions, limits) is enforced on the server; the app's checks are only for nicer messages |
| 16 | Missing input validation | ✅ | The Worker checks every body: sizes (64 KB JSON, 20 MB data, 2 KB key), types, versions, names; the proxy allows plain path names only. In the app, a shared backdrop file (Backdrop builder) goes through one check, `cleanBackdrop()` (`backdrops/backdrop.ts`): only known fields, every number clamped, a picture only as an inline JPEG/PNG/WebP (never a link, which would tell another site when you open the app, and never SVG, which can carry script); `tests/unit/backdrops.test.ts` tries the bad ones |
| 17 | SQL injection | ✅ | Every query is prepared with bound values; the only names put into SQL are a fixed list in the code |
| 18 | NoSQL injection | ➖ | No NoSQL store. Imported JSON is data only, with `__proto__` keys dropped |
| 19 | Cross-site scripting (XSS) | ✅ | Everything shown is escaped; links from data only ever open `http(s)`; and the site's policy runs no inline script. `xss.ts` fills every field with attacks and visits every page; `csp.ts` checks an injected script doesn't run |
| 20 | Cross-site request forgery (CSRF) | ✅ | SameSite=Strict cookies, plus every change needs the app's own header and this site's Origin; tested both ways |
| 21 | Insecure file uploads | ✅ | Imports are read in your own browser, as data. A zip is unpacked with hard limits checked while it unpacks (60,000 files, 512 MB a file, 2 GB in all), so a "zip bomb" stops early instead of filling memory; a picture's kind is read from its first bytes, never trusted from its name, and only PNG, JPEG, GIF, WebP and AVIF are kept (never SVG, which can carry script), 8 MB each at most; `import-limits.ts` tries them. The only upload is the sync blob: size-capped, stored as opaque bytes, never run or served to anyone else |
| 22 | Path traversal | ✅ | R2 keys are built from the server's own ids; proxy paths allow plain names only (encoded slashes, dot-names and odd bytes refused); tested |
| 23 | Server-side request forgery (SSRF) | ✅ | The proxy only calls fixed API hosts; `/page` reaches university and reading-list sites only, following redirects itself and checking every hop (five at most), reads at most 6 MB, and hands the page back as plain text inside a sandbox, so nothing fetched can run or show as a page of this site; ScreenScraper pictures only through links the proxy signed itself, and only pictures come back; tested |
| 24 | Broken password reset flows | ➖ | No passwords, so nothing to reset. Up to ten passkeys and one recovery code per account. Another device signs in with a QR code from one that's signed in (one use, ten minutes, the key's secret only after the `#`; no passkey made). The device that opens a code first sees whose account it's for, and when it already has a library or is signed in, nothing of it goes to that account until you tick that the account is yours (`account-link.ts` checks "Not now" sends nothing). Lost passkey: the recovery code signs in (the server keeps only the hash of a key derived from it, separately from the one that unlocks) and a new passkey replaces the old one. Lose both and every device, and the cloud copy can't be opened, by design |
| 25 | Weak session management | ✅ | 256-bit random tokens; only their hash is stored; 30 days; you can see and sign out every device; signing out deletes the session |
| 26 | JWT secrets weak, leaked or reused | ➖ | No JWTs: sessions are random tokens checked against the database |
| 27 | Overly permissive CORS | ✅ | Account & sync offers no CORS at all (same site only). The catalogue proxy is open (`*`) on purpose: it holds no user data and sends no cookies |
| 28 | Rate limits missing (login, signup, APIs, AI) | ✅ | Sign-in and sign-up: 10 a minute per address; `/api`: 60 (an IPv6 address counts by its whole /64 block, so one connection can't pose as millions). Lookups on the site's own TMDB and IGDB keys refuse other websites, make only the lookups the app makes, come from a shared one-day cache, and are capped at 30 new ones a minute per address and 180 a minute per Cloudflare location (Cloudflare counts rate limits in each of its locations, and roughly), so even a script pretending to be the site can't run the keys past their limits. Your other keys answer only with the proxy password, which travels in a header, never an address; Hardcover's can only read. Cost limits that keep R2 (the only part that can bill) inside its free tier however many accounts there are: the whole site's R2 writes, reads and stored bytes are counted each month in D1 and stop at 90% of the free amounts (`BUDGET`, `budget()` in `worker/sync.ts`; past it, syncing waits for the 1st and every library stays whole on its devices); per account 300 saves and 1,000 reads a day (`DAILY`), so one account can't use up everyone's month; at most 1,000 accounts unless `MAX_USERS` says otherwise. All tested in `sync.test.ts`. Accounts that never turned sync on are cleared after a day, and accounts that never saved a library after a week, so bots can't hold the places; each account's activity list keeps its latest 200 entries. Signed-in steps that write (turning sync on, a new recovery code, QR codes, passkey and confirm requests) count toward each account's daily allowance and stop with it (`DAILY_STEPS`); signing other devices out and cancelling a QR code count too but always work, writing nothing more once the day is used up (`DAILY_ALWAYS`), so someone holding your session can't stop you shutting them out. ⚠️ Someone determined could still make many accounts, or use up the month's share: new sign-ups then get "no new accounts right now", or syncing waits for the 1st. Nothing breaks and nothing bills, and every library stays whole on its devices. ⚠️ Cloudflare's free plan counts 100,000 Worker requests a day for the **whole Cloudflare account**: a busy day here can stop other sites' Workers on the same account until midnight UTC (their static pages are unaffected). |
| 29 | Public test or staging environments | ✅ | None. The browser tests run the site on the test machine only (`wrangler dev --local`, throwaway data) |
| 30 | Default credentials left unchanged | ✅ | None exist. Companions only listen on 127.0.0.1, and refuse to start when shared (PUBLIC_URL set) without passwords you choose |
| 31 | Webhooks without signature verification | ➖ | No webhooks |
| 32 | Payment checks only on the frontend | ➖ | No payments. The support link goes to GitHub Sponsors, which handles payment itself |
| 33 | Insecure direct object references (IDOR) | ✅ | Same as 6: nothing reachable by naming an id. Older versions are looked up under your own account only |
| 34 | API endpoints trusting user-controlled IDs or roles | ✅ | No roles; ids from requests are ignored for whose data it is |
| 35 | Logs with tokens, emails, passwords, private data | ✅ | Nothing personal is logged. The audit list keeps "Chrome on Mac", never addresses. No emails are collected at all |
| 36 | Source maps exposed in production | ✅ | None built (checked) |
| 37 | Dependency vulnerabilities | ✅ | `pnpm audit --prod`: none (SimpleWebAuthn moved to 14 for this). CI stops on any serious one. A few low/moderate remain in build-only tools that never reach the site |
| 38 | Outdated packages | ✅ | Dependabot opens a pull request weekly for packages and Actions; CI tests each |
| 39 | Prompt injection in AI features | ➖ | No such features |
| 40 | AI tools/actions reaching data without checks | ➖ | No such tools or actions |
| 41 | Excessive database permissions for the app user | ✅ | The Worker's bindings reach one database and one bucket, nothing else in your account |
| 42 | No audit logs | ✅ | Every account has its own list: created, signed in, passkeys added and removed, devices signed out, passphrase changed |
| 43 | No monitoring or alerting | ⚠️ | Worker observability is on (errors and request counts in the Cloudflare dashboard). Alerts are one setting away: Cloudflare › Notifications › "Workers" (e-mail when errors spike); it can't be switched on from the code |
| 44 | No backup or restore plan | ✅ | Your library: "Download everything" any time, and the cloud keeps your last three versions, plus the newest one from more than a day ago and the oldest from the last day, which ages into it ("Go back to this"). The accounts database: D1 Time Travel restores any minute of the last 30 days (`wrangler d1 time-travel restore`) |
| 45 | Publicly exposed internal dashboards | ➖ | None. Cloudflare's dashboard is behind your Cloudflare login (turn on two-factor there) |
| 46 | Missing security headers | ✅ | Content-Security-Policy, HSTS, X-Frame-Options, nosniff, Referrer-Policy, COOP, CORP, Permissions-Policy on the site and the Worker; tested under the real headers |
| 47 | Cookies missing HttpOnly, Secure or SameSite | ✅ | The one cookie is `__Host-`, HttpOnly, Secure, SameSite=Strict, Path=/; tested in the browser |
| 48 | Unencrypted sensitive data | ✅ | The synced library is encrypted end to end (AES-256-GCM). Its key is stored only sealed: per passkey, by a key made with HKDF-SHA256 from the passkey's own PRF secret, which is taken out of the passkey's answer before anything is sent (`account-passkey-unlock.ts` checks no request carries it); and by your recovery code (PBKDF2-SHA256, 600,000 rounds); for ten minutes while you add a device, by a secret that exists only in the QR code (after the `#`, never sent: `account-link.ts` checks). Every box names the key it seals (a fingerprint), and the server holds each account to one key: turning sync on is one all-or-nothing request, so two devices doing it at once can't leave two keys; each upload has its own file, so two saving at once can't overwrite each other (both tested). The private collection is sealed on the device too, with its own passphrase, and so are backups' private parts. ⚠️ A list made inside the private collection keeps its name and notes unsealed, on the device and in a backup that includes the collection (the things in it are sealed); in the cloud it's still encrypted end to end like everything else. ⚠️ On each signed-in device the key is kept in that browser (so it can sync by itself and add devices), readable only by the site's own scripts, like the library itself; API keys you type are kept the same way. In backups, an extension's secret settings (a companion password) are never written in the clear: they're sealed with your keys by the backup passphrase, or left out (`ext-secrets.ts`). |
| 49 | Poor tenant isolation | ✅ | Every row and blob belongs to one account and every query is scoped to the session's account; tested with two accounts |
| 50 | Shipping code nobody checked | ✅ | Nothing ships unchecked: Biome and Knip, type checks, unit tests (the Worker's sync on a real SQLite, the proxy, the store, every button's handler), and over 40 browser test files including this list's attacks and an accessibility sweep. Security-critical parts use reviewed libraries (SimpleWebAuthn, the browser's WebCrypto), not home-made crypto |

## Who can do what

Every route is in `worker/index.ts`, `worker/proxy.ts` and `worker/sync.ts`; `sync.test.ts` and `proxy.test.ts` try each
row from the wrong side. "Recently confirmed" means a passkey or the recovery code in the last 5 minutes (`FRESH`).

| What | Anyone | This site's pages | Signed in | Recently confirmed | With your proxy password |
| --- | :-: | :-: | :-: | :-: | :-: |
| The site's files (pages, scripts, pictures) | ✅ | | | | |
| `/api/status` (which sources are set up) | ✅ | | | | |
| Film, TV and game lookups on the site's TMDB and IGDB keys | | ✅ | | | ✅ |
| Your other keys (SteamGridDB, Comic Vine, Hardcover…) | | | | | ✅ |
| `/api/page` (a university page as plain text) | | ✅, its own pages only | | | ✅ |
| Sign up, sign in, join with a QR code | ✅ (10 a minute per address) | | | | |
| Your library, its versions, your devices and activity | | | ✅ yours only | | |
| Save the library, make a QR code, rename, sign devices out | | | ✅ yours only | | |
| Add or remove a passkey, let a passkey unlock the library | | | | ✅ | |
| A new recovery code, delete the account | | | | ✅ | |
| Anyone else's account, by any route | ❌ | ❌ | ❌ | ❌ | ❌ |

No route takes an account id: whose data it is always comes from the session. There are no admin routes.

## Twenty more holes, checked

| # | Hole | | Here |
|---|---|---|---|
| 51 | A framework's middleware header that skips its own checks | ➖ | No such framework on the server: one Worker, routes written out by hand |
| 52 | The `.git` folder served with the site | ✅ | Only the built `dist/` folder is served (checked: no `.git`, no hidden files) |
| 53 | Public storage buckets | ✅ | Same as 8: R2 is private and libraries are encrypted before they leave the browser |
| 54 | Prices or amounts taken from the browser | ➖ | No payments |
| 55 | Credential stuffing | ✅ | No passwords: passkeys, or a 256-bit recovery code, 10 tries a minute per address. The proxy password is yours to make long and random (the guide says how) |
| 56 | An open database | ✅ | Same as 7: D1 has no address of its own |
| 57 | A third-party script taken over (the polyfill.io kind) | ✅ | No script comes from anywhere else: everything is bundled, and the Content-Security-Policy allows the site's own scripts only |
| 58 | SMS or email pumping | ➖ | The site sends no texts and no email |
| 59 | Prompt injection | ➖ | As 39: nothing of the kind |
| 60 | A weak JWT secret | ➖ | No JWTs (26) |
| 61 | Race conditions | ✅ | The account cap, saving (compare-and-set on the version), each account's daily allowance, the month's budget and the passkey limit are each checked inside the one statement that changes them; QR codes work once. Each has a test |
| 62 | Account pre-hijacking | ➖ | No emails or usernames to claim before their owner: an account is its passkeys |
| 63 | Subdomain takeover | ✅ | DNS for sayel.dev holds only records in use (checked, 9 November 2026). Delete a record in the same sitting as the thing it points at |
| 64 | SSRF | ✅ | Same as 23: fixed hosts, private addresses refused, every redirect checked |
| 65 | Path traversal | ✅ | Same as 22, and each catalogue has its own list of allowed paths and parameters |
| 66 | Reset-link poisoning through the Host header | ✅ | No reset links. The Worker answers only on its own domain (`workers_dev` and preview addresses are off), so a forged host can't reach it |
| 67 | Source maps | ✅ | Same as 36 |
| 68 | Clickjacking | ✅ | `frame-ancestors 'none'` and `X-Frame-Options: DENY` on every page and every `/api` answer |
| 69 | Open redirects | ✅ | The only redirects are four fixed ones in `public/_redirects`; nothing takes an address to send you to |
| 70 | User enumeration | ✅ | A wrong recovery code gets one answer whatever account it might be; names aren't unique and don't sign anyone in; passkey ids are random |

**Before Account & sync goes live:** create the database and bucket (README › Host your own copy), turn on two-factor for
your Cloudflare and GitHub logins, and set a Cloudflare notification for Worker errors.
