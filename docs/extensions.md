# Extensions

*An extension adds an ability to UniverList: new places to play or read from, for example. It runs sealed off from the page and only gets what its permissions allow.*

---

## What one is

A folder (or a `.zip` of it) with an `extension.json`, or a single `.json`/`.js` file. Install it in **Settings › Extensions**. On the hosted site, public extensions are also downloadable from `/extensions/<id>.zip`.

```json
{
  "id": "local-media-player",
  "name": "Your own video files",
  "version": "1.0.0",
  "main": "main.js",
  "permissions": ["storage", "companion", "watch.sources"],
  "companion": { "url": "http://127.0.0.1:7878", "health": "/health" },
  "settings": [{ "key": "token", "label": "Companion password", "type": "text", "secret": true }],
  "private": false
}
```

| Permission | Lets it |
| --- | --- |
| `storage` | Keep its own settings and data |
| `companion` | Talk to its companion's address |
| `watch.sources` | Offer playable sources for an episode or film |
| `read.sources` | Offer chapters, volumes or books to read |
| `net` | Reach the web, through the app, at the `https` hosts it lists in `"hosts": [...]` and nowhere else |

An extension's own code can reach only its companion. Its frame gets a security policy of its own before its code
runs (`extPolicy` in `extensions/extensions.ts`): `connect-src` is the companion's address, or nothing, and every other
kind of request is refused. The web (`net`) goes through the app, which checks the host first.

**`"private": true`** keeps an extension out of plain backups: it only goes in sealed with your backup passphrase.

---

## Companions

A companion is a small program on your own machine for what a web page can't do (read your disk, run ffmpeg). It listens on `127.0.0.1` only, takes one password per person (`TOKEN=yours,friend,…`), and the links it hands out follow the address each person used. To reach it from your phone or let friends use it, put it behind Tailscale (see `extensions/local-media-player/README.md`).

Browsers: Chrome asks once whether the site may reach devices on your network. If a browser refuses an HTTPS site talking to `http://127.0.0.1` (Safari can), use the companion's Tailscale `https://` address instead.

---

## The API

```js
univerlist.provide("watch.sources", async ctx => [{ name, url, how }]);
//   ctx: { title, seasonTitle, medium, year, ids, season, seasons, episode, film }
univerlist.settings()              // this extension's settings, from Settings › Extensions
univerlist.storage.get(key) / .set(key, value)   // any key but `settings` and `series`, which the app keeps
univerlist.companion.get(path)     // GET <companion address><path>, as JSON
univerlist.toast(text)
univerlist.file(path)              // another file shipped inside the extension
univerlist.net.fetch({ url, method, headers, body })   // → { status, text }; https, listed hosts only (needs `net`)
```

Permissions in `extension.json` decide which of these it may use: `storage`, `companion`, `watch.sources`, `read.sources`, `net`.

**Where it runs.** On the site, each extension runs in `ext-host.html`: a sandboxed frame with its own (opaque) origin and the
only page whose security policy allows inline code. It can't touch the app, your library or your keys; it only sees the messages
the app sends it. Opened from disk (the one-file build), it runs from a sandboxed `srcdoc` frame instead.

**Removing one** deletes its record (settings, per-series servers) and everything the app remembered about it.


## Watch & read: what an extension can hand it

Watch & read is a **built-in extension** (Settings › Extensions › Built in). Switched off, nothing of it shows or runs, and extensions that offer sources simply aren't asked.

### `watch.sources`
Asked each time an episode or film opens, every extension on its own (a slow one never holds up a quick one; the player says "Still checking your servers…" meanwhile).

Only the person's own sources are played: an address on their own device or network (localhost, private ranges,
`.local`, Tailscale), a server they've added, or the extension's own companion. Anything else an extension offers is
dropped (`src/features/watch-read/own-sources.ts`), so an extension can't turn the player into a way to reach other
people's videos.

```js
univerlist.provide("watch.sources", async ctx => [{
  name: "Home server · Show - 01.mkv",   // what the Servers bar shows on hover; the part before " · " is "who" (remembered per show)
  url: "http://…/stream/…",               // something a <video> can play (or "how": "adaptive" for .m3u8)
  how: "original" | "converted",          // a converted stream can't seek: the player restarts it at ?t=<seconds>
  info: "http://…/info/…",                // optional: { size, downloaded, progress, speed, duration, audio, subs } — the
                                          //   "how much has arrived" badge, "wait until it won't stop", the no-sound check
  subs: [{ label, lang, url }]            // optional: WebVTT tracks (can arrive bit by bit); your language is switched on by itself
}]);
```

`ctx`: `{ title, seasonTitle, medium, year, ids, season, seasons, episode, film, servers: { items, all } }`. `servers.items` are this series' own links the extension keeps; `servers.all` every one it keeps, for every series.

### `read.sources`
Asked when a book, manga, manhwa or comic opens on the Read page. Each chapter or volume:

```js
univerlist.provide("read.sources", async ctx => [{ name, ch, vol, url, type: "cbz" | "epub" | "pdf" } /* or */ , { name, ch, pages: [imageUrl, …] }]);
```

`ctx`: `{ title, alt: [other names], medium, ids, servers: { all } }`.

### Servers for one series
An extension that keeps links per series says which in `extension.json`, by how they start or (with `*`) how they end:

```json
"seriesServers": ["smb:", "*.strm"]
```

Links like these, pasted into a show's **Servers** (+ in the Servers bar), are kept in that extension's own data (sealed in backups when it's private) and arrive as `ctx.servers`.
