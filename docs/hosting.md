# Hosting it safely

*The settings outside the code: Cloudflare and GitHub. The code already does its part (headers, rate limits, cost caps,
[security.md](security.md)); these make sure nothing around it undoes that. Checked against both dashboards in November 2026.*

---

## Setting it up

1. **A Cloudflare account** (free). Add your domain and switch its nameservers to Cloudflare's.
2. In `wrangler.jsonc`, `routes` names this site's domain: put yours in its place.
   In `public/_redirects`, point `/source`, `/issues`, `/report` and `/sponsor` at your own repository: the app and its
   pages link only to those, so moving the code later means changing that one file. If you've changed the code, also
   point `SOURCE_URL` and `DONATE_URL` (top of `src/features/core/core.ts`) at your own site: the licence asks that
   people using your copy can get *your* source from it.
3. `npx wrangler login`, then add the keys you use as secrets (`npx wrangler secret put TMDB_KEY` and so on; the full
   list is at the top of `worker/proxy.ts`). **TMDB_KEY and CLIENT_ID + CLIENT_SECRET (IGDB) are lent to everyone using
   your site**, so visitors need no keys of their own; the rest (SteamGridDB, Comic Vine…) are yours alone, and on the
   site they answer only with `PASS`, so set it if you add any of them. It never gets in the way of the site's own
   pages. For
   `pnpm preview`, copy `.dev.vars.example` to `.dev.vars`.
4. `pnpm deploy`. The site is live.
5. **Deploys on every push:** in the repository's Settings › Environments, make `production` (limited to `main`) and add
   `CLOUDFLARE_API_TOKEN` (see below) and `CLOUDFLARE_ACCOUNT_ID`. Every push to `main` is then checked, tested, and
   deployed only if everything passes.
6. Only for your own extra keys: in the app, Settings › Data, sources & keys › Your proxy →
   `https://<your-domain>/api?pass=<PASS>` (the app sends it as an `X-Pass` header, so it isn't left in logs).
7. **Account & sync (optional):** two places to keep things, named by what they hold.
   - `npx wrangler d1 create univerlist-accounts`: the database of accounts, passkeys and sign-ins. Put its
     `database_id` in `wrangler.jsonc` and remove the `//` from the two lines there.
   - `npx wrangler r2 bucket create univerlist-libraries`: each account's library, encrypted on its own device
     (R2 needs a card on file).
   - `npx wrangler d1 migrations apply ACCOUNTS --remote`, then deploy. Set the repository variable `SYNC_ON` to
     `true`, so later deploys apply new tables themselves. When Wrangler offers to add the bindings itself, answer
     No: its names won't match the code's (`ACCOUNTS`, `LIBRARIES`).
8. **Rate limits:** `/api` takes at most 60 requests a minute from one address, and new lookups on the keys you lend
   at most 30 a minute per address and 180 a minute in total (`ratelimits` in `wrangler.jsonc`; free). Repeat lookups
   come from Cloudflare's cache for a day.
9. Then the settings below.

---

## What can cost money, and what can't

| Part | Free plan | Past it |
| --- | --- | --- |
| The site's files (everything but `/api`) | Free and unlimited, bots included | Nothing |
| The Worker (`/api`) | 100,000 requests a day | Refused (429) until midnight UTC. Never billed on the free plan |
| D1 (accounts) | 5 million reads, 100,000 writes a day, 5 GB | Refused until midnight UTC. Never billed |
| **R2 (the synced libraries)** | 10 GB, 1 million writes, 10 million reads a month | **Billed**: it's the only part with a card on file |

So R2 is the one to guard, and the Worker does, in two ways:

- **The month's budget** (`BUDGET` in `worker/sync.ts`): the whole site's R2 writes, reads and stored bytes are counted
  in D1, and stop at 90% of the free amounts (900,000 writes, 9 million reads, 9 GB). Past it, syncing waits for the 1st;
  every library stays whole on its devices. This holds however many accounts there are.
- **Each account's share:** at most 4 versions of 20 MB (the last 3, and one from over a day ago), 300 saves and 1,000
  reads a day, so one account can't use up everyone's month.

`MAX_USERS` (1,000) only keeps the number sensible. A library is usually well under 1 MB, so 1,000 accounts keep about
4 GB with their versions, and save far less than the budget allows.

**The Worker's 100,000 requests a day are for the whole Cloudflare account, not this site.** A busy day here (many
people searching films and games, or big imports) can stop other Workers on the same account (a contact form, say)
until midnight UTC. Their static pages carry on. Put a site whose Worker matters on its own free account, or move to
the Workers paid plan ($5 a month, 10 million requests) if this one outgrows the free one.

**Apply new migrations before deploying a Worker that needs them** (`npx wrangler d1 migrations apply ACCOUNTS
--remote`, then `npx wrangler deploy`). CI does it in that order.

Cloudflare has no hard spending cap, only alerts: **Manage account › Billing › Billable usage › budget alert**, set to
$1, so you'd hear about anything at all.

## Cloudflare: Security and Speed settings

| Setting | Set to | Why |
| --- | --- | --- |
| Bot Fight Mode | **Off** | It injects scripts the site's CSP refuses, and challenges `fetch()` calls to `/api`, which can't answer a challenge. WAF rules can't exempt paths from it |
| Block AI bots / AI Crawl Control | Your choice | Safe either way (a rule at the edge, nothing injected). Blocking "Training" crawlers also blocks Google's and Bing's |
| Managed robots.txt | Your choice | Only asks crawlers; `public/robots.txt` already keeps them off `/api` |
| AI Labyrinth | **Off** | Rewrites your pages |
| Browser Integrity Check | On (the default) | Turns away requests with no or fake browser headers; real browsers pass |
| Under Attack mode | Off | Only during an actual attack: it breaks `/api` calls while on |
| Email Address Obfuscation | **Off** | Injects a script; the site shows no email addresses |
| Rocket Loader, automatic Web Analytics | **Off** | Both inject scripts the CSP refuses |
| SSL/TLS | Full (strict), Always Use HTTPS, minimum TLS 1.2 | |

**Saying no to the bot questions when you added the domain was right.** They're all about AI crawlers, which cost you
nothing here (the files they read are free) and you can switch on later.

## Cloudflare: WAF rules (free plan: 5 custom rules, 1 rate-limiting rule)

The Free Managed Ruleset is on by default. Add, under **Security › WAF › Custom rules**:

1. **Block scanners**: `(http.request.uri.path contains "/wp-") or (http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or ends_with(http.request.uri.path, ".php")` → Block.
2. **Only reads outside the API**: `not starts_with(http.request.uri.path, "/api/") and not http.request.method in {"GET" "HEAD"}` → Block.
3. **Only the normal ports**: `not cf.edge.server_port in {80 443}` → Block. Scanners try Cloudflare's other ports (8443, 2083, 8080…) looking for admin panels; nothing here uses them.
4. **Rate limit sign-ups and sign-ins** (Rate limiting rules): path starts with `/api/sync/`, more than 30 requests in 10 seconds from one address → Block. The Worker's own limits stay the real ones; this stops a flood before it reaches the Worker.

Never use *Challenge* on `/api`: the app calls it with `fetch()`, which can't solve one.

## Cloudflare: your login and the API token

- Two-factor on your Cloudflare login (a passkey or security key).
- **Notifications**: Workers errors, and the budget alert above.
- The `CLOUDFLARE_API_TOKEN` for GitHub: **My Profile › API Tokens › Create Token › "Edit Cloudflare Workers"** template,
  then add **Account › D1 › Edit** (for the account tables), set *Account Resources* to your one account and *Zone
  Resources* to `sayel.dev` only, and give it an expiry date. Replace it when it expires.
- Leave the R2 bucket's public `r2.dev` address off.

## GitHub

- **Settings › Code security**: secret scanning and push protection on, Dependabot alerts and security updates on,
  private vulnerability reporting on (`SECURITY.md` points people to it).
- **Settings › Rules › Rulesets**, for `main`: block force pushes and deletion. Don't require pull requests or status
  checks while you push straight to `main`: the deploy already waits for every test to pass.
- **Settings › Actions › General**: "Require approval for all external contributors"; workflow permissions *Read*;
  don't let Actions approve pull requests; require actions to be pinned to a full commit SHA (ci.yml already is).
- **Settings › Environments › production**: deployment branches *main* only (and, if you like, your own approval for each deploy).
  Move the two Cloudflare secrets into this environment so nothing else can see them.
- **Settings › Secrets and variables › Variables**: `SYNC_ON` = `true` once the D1 database exists, so deploys apply new
  account tables by themselves.
- **Settings › Secrets and variables › Actions › Secrets**: `PRIVATE_WORDS`, a repository secret: one word or phrase
  per line that would lead back to you (your name and its parts, personal email addresses). The identity guard
  (`tools/guard.ts`) fails every push that has one in a file, a picture's metadata or a commit's author, and never
  prints the words. On your own machine it reads `~/.config/sayel/private-words` instead (`pnpm guard`).
- **Settings › Actions › General › Allowed actions**: GitHub's own plus `pnpm/action-setup`, the only other action
  `ci.yml` uses (the secret scanner is a fixed release checked against its fingerprint, not an action).
- **Your account › Emails**: "Keep my email addresses private" and "Block command line pushes that expose my email";
  commit as your `@users.noreply.github.com` address (`git config --global user.email`).
- Two-factor with a passkey or security key.
