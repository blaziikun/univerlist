# Your own video files

*An extension that plays shows and films from folders on your computer, through a small companion program.*

---

## How it fits together

```
Univerlist (the web page)
 └── this extension (sealed off: sees only what it asks for)
       └── asks ──▶ the companion, on your computer (127.0.0.1:7878)
                      └── finds the file for that episode, streams it back
```

The page can't read your disk or start programs by itself, so the companion does the part the browser isn't allowed to do. It only listens on this computer, and only serves files from the folders you give it.

---

## Set up

1. In Univerlist: **Settings › Extensions** → drop `local-media.zip` in.
2. Start the companion with your video folders:

   ```
   node companion/server.mjs "/Users/you/Movies" "/Volumes/Media/Anime"
   ```

   It needs Node 18 or newer (or Deno: `deno run --allow-net --allow-read --allow-run --allow-env companion/server.mjs "…"`).
3. Back in **Settings › Extensions**, the companion shows as **running**.

**Optional**

| Setting | What it does |
| --- | --- |
| `TOKEN=…` before the command | A password (or several, comma-separated, one per person). Put yours in the extension's settings |
| ffmpeg installed | `.mkv` and `.avi` files play too (rewrapped as MP4 while they play) |
| `PORT=…` | Another port. Change the extension's Companion address to match |

---

## Watching from your phone, another computer, or with friends

Run the companion on one always-on machine of yours, and reach it over **Tailscale** (a private network between your devices and people you invite; nothing is opened to the internet).

1. On that machine: install Tailscale and sign in. In the Tailscale admin page, turn on **MagicDNS** and **HTTPS certificates**.
2. Start the companion with one password per person, yours first:

   ```
   TOKEN=yours,alex,sam node server.mjs
   ```

3. Give it an HTTPS address: `tailscale serve --bg 7878` → it answers at `https://<machine>.<your-tailnet>.ts.net`.
4. Friends: in the Tailscale admin page, **Share** that machine with them (they need a free Tailscale account). Send them this extension's zip privately.
5. Everyone sets **Companion address** to the `https://….ts.net` address and **Companion password** to their own one.

The play links the companion hands out follow the address each person used, so they work on every device. To cut someone off, remove their password and restart, or stop sharing the machine.

---

## How files are matched

| Name on disk | Found as |
| --- | --- |
| `Bungo Stray Dogs S02E03.mkv` | season 2, episode 3 |
| `Bungo Stray Dogs 2/03.mkv` | the release "Bungo Stray Dogs 2", episode 3 |
| `Bungo Stray Dogs 2 - 03.mkv` | the same |
| `The Prestige (2006).mp4` | the film, checked against its year |

---

## Have it ready whenever you press play

A web page can't start a program, so keep the companion running in the background. It uses almost nothing while idle.

- **macOS**: save as `~/Library/LaunchAgents/univerlist.companion.plist`, then run `launchctl load ~/Library/LaunchAgents/univerlist.companion.plist`

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0"><dict>
    <key>Label</key><string>univerlist.companion</string>
    <key>ProgramArguments</key><array>
      <string>/opt/homebrew/bin/node</string>
      <string>/path/to/local-media/companion/server.mjs</string>
      <string>/Users/you/Movies</string>
    </array>
    <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  </dict></plist>
  ```

- **Windows**: Task Scheduler → Create Task → Trigger "At log on" → Action `node C:\path\to\server.mjs "D:\Videos"`.
- **Linux**: a systemd user service with `ExecStart=/usr/bin/node /path/to/server.mjs /home/you/Videos`, then `systemctl --user enable --now univerlist-companion`.

---

## The extension API (for writing your own)

```js
univerlist.provide("watch.sources", async ctx => [{ name, url, how }]);
//   ctx: { title, seasonTitle, medium, year, ids, season, seasons, episode, film }
univerlist.settings()              // this extension's settings, from Settings › Extensions
univerlist.storage.get(key) / .set(key, value)
univerlist.companion.get(path)     // GET <companion address><path>, as JSON
univerlist.toast(text)
univerlist.file(path)              // another file shipped inside the extension
```

Permissions in `extension.json` decide which of these it may use: `storage`, `companion`, `watch.sources`, `read.sources`.
