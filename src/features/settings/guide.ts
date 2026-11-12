// src/features/settings/guide.ts
// ─────────────────────────────────────────────────────────────────
//  The guide: everything in one document, written like a setup guide (and downloadable as Markdown)
// ─────────────────────────────────────────────────────────────────

import { esc, markDirty, meta, slug } from "../core/core";

export const GUIDE_MD = `# UniverList Guide

> Everything the app does, where it lives, and how to set it up. Tick off the start list as you go.

---

## Getting Started

- [ ] Add your name and picture (Edit profile, under the banner)
- [ ] Bring in what you already track: drop an export file, or paste an AniList or Letterboxd profile link into [Data, sources & keys](act:go-settings:io)
- [ ] Optional: your own free keys (TMDB, OMDb, RAWG, or your own proxy) in [Data, sources & keys](act:go-settings:data). On univerlist.sayel.dev, films, TV and games already come with full details without them
- [ ] Pick a theme for each mode in [Modes](act:go-settings:modes)
- [ ] Download a backup once you're set up ([Data, sources & keys](act:go-settings:io))
- [ ] Make an account and put your library on your phone too ([Account & sync](act:go-settings:account))

---

## How It's Laid Out

\`\`\`
UniverList
├── Modes            ← lenses over one library, each with its own theme, shelves and tabs
│   ├── Hub          ← everything except Games (and academic books, while the Learning Centre is on)
│   ├── Culture      ← anime, manga, manhwa, light novels
│   ├── Literature   ← books and comics
│   ├── Film & TV    ← films and series; K, C and J-drama shelves appear once you have one
│   ├── Games
│   ├── Learning Centre ← your courses, each with its pathway, and curricula (official extension)
│   └── Music        ← albums
├── Watch & read     ← play and read your own files and servers (official extension)
├── Private          ← a separate, encrypted collection behind a passphrase
├── Account & sync   ← one passkey and a recovery code; your library on all your devices (official extension)
└── Settings         ← General · Account & sync · Library · Appearance · Backdrops (beta) · Modes · Data, sources & keys ·
                       Private collection · Extensions · Keybinds · Tags · Advanced
\`\`\`

Each mode starts with the core tabs (Overview, Library, Favourites, Stats, Lists, Insights) plus its own: This season (Culture), Series and Quotes (Literature), Diary (Film & TV), Playing (Games), Courses and Curricula (Learning Centre).

- **⋯ at the end of the tabs** edits them for that mode: tick to add or remove, drag (or ↑ ↓) to reorder, and ★ the one it should open on. You can also drag tabs along the bar itself, or right-click one to hide it.
- Each mode **remembers its tab**: leave Culture on Stats, visit Literature, come back, and it's still on Stats (unless you'd rather it always opens on its ★ tab: Settings › General).
- **Refreshing** the page brings you back to exactly where you were: the mode, the tab, any card you had open, and how far down you'd scrolled.

---

## Adding Things

1. Press **N** or **/** (or the magnifier). Search opens in the middle of the screen and dims the page.
2. Results come in four columns: Culture, Literature, Film & TV, Games. What you already have is marked with a dot.
3. **＋ adds it straight away** with your default status (Planned, In progress or Finished: pick it at the top of the search). The search stays open for the next one.
4. **Click a result** (or Enter) to fill in details first: status, score, ownership, cover.
5. Each column says *still looking…* if a source is slow, and *try again* if it gave up. Nothing waits forever.

| Key | In search |
| --- | --- |
| ↑ ↓ | Move between results |
| Enter | Open the highlighted one |
| ✕ | Clear what you typed (a second press closes) |
| Esc | Close |

---

## The Library

\`\`\`
[ Cover | Grid | Spine | List ]                    [Filter] [Group] [Sort] [⋯] [Select]
   ↑ how it looks                                     ↑ what you see and in what order
\`\`\`

- **Views**: Cover (art only), Grid (art and details), Spine (a real shelf: heights and widths from the actual object), List (a table with genre and score).
- **⋯** holds size and spacing, titles on or off, *true size* covers (a DS case is shorter than a Wii case), the default view, and Rank or arrange by dragging.
- **Filter** has Basic (status, type, genre, score) and Advanced (themes, years, ownership, and rules such as "Crowd score at least 80" or "Finished after 2025-01-01", matching all or any).
- **Group** by status, shelf, type or genre. **Sort** applies to every group.
- Scores sit quietly on the top left of each cover.

### Selecting and moving

| Do this | To |
| --- | --- |
| Drag a box over covers | Select them |
| Shift-click | Select a range |
| Ctrl / ⌘-click | Add or remove one |
| Drag the selection onto a group's heading | Move them there (status, or type) |
| Drag one cover onto another | Combine them into one entry |

### Combining seasons, sequels and volumes

Drag *Little Busters! Refrain* onto *Little Busters!* (or use **Combine** in the selection bar). One entry stays in your lists; each part keeps its own score, dates and progress, and the cover shows how many parts it holds. Split any part back out from the card (Synopsis → Parts). Manga, manhwa and light novels can **split into volumes**, each with its own Apple Books cover where one exists.

### Types and genres

- **Types** can be renamed or folded together (Settings › Library › Types). By default ONA and OVA sit with anime series, which are called *Anime*.
- **Genres** are only the official list for each kind of thing (AniList for anime and manga, TMDB for film and TV, IGDB for games, the standard book genres). Everything else a source calls a genre becomes a **theme**, filterable in Advanced.
- Anything can **live in another mode**: right-click → *Lives in*, or the card's More section, or the selection bar.

---

## Each Card

- **Status, score, Watch or Read, favourite, Up next, lists and ownership** down the side; on phones and tablets the cover and title come first, then the actions, then the story.
- **Tabs**: Synopsis (with Parts), Characters, Cast, Connections, Art, and a Journal, Diary or Log.
- **Characters** show the character's own picture; for live action the actor appears as a small inset, and the full actor photos live under Cast.
- **Art → Adjust framing** crops and repositions any cover; **Use the original** puts the source's cover back.
- **More** (bottom of the side) keeps its place when you delete or hide something, and lets you pick the title language for just this card (English, Romaji, Native, Original).

---

## Pictures

| What | Where | Notes |
| --- | --- | --- |
| Profile picture and banner | Edit profile | *Same everywhere* by default; switch to *Only in this mode* to give a mode its own. **Adjust** crops and repositions. Banners upload at up to 3200px. |
| Covers | Card → Art | Search every source, upload, paste, or adjust framing. |
| Character pictures | Character page | Keep as many as you like (GIFs too) and switch; the original always stays. Click the picture to view them full size (← → to flip). |

---

## Overview and Stats

- Blocks you **arrange** (drag), resize, rename and redraw as bars, columns, a donut or a list. Adding or moving a block keeps your place on the page.
- New blocks: **Time by type**, **Genres by your score**, **Themes by your score**, **You vs the crowd** and **Your own stat**: pick what to measure (how many, finished, hours, your average, the crowd's average, you vs the crowd), what to split it by (type, medium, genre, theme, status, year, decade, year finished, creator, your tags, shelf) and whether to count finished only.

---

## Insights

**How you finish** comes first: the share of what you start that you finish, by genre, theme and type (against your overall rate), where you tend to drop off, how long things take you from start to finish, and what has waited longest.

Under that, **Your taste, read closely**: what lifts your scores and what sinks them, the nuance inside your main genres (which themes your best share, and which your weakest lean on), close cousins you scored far apart, and the mixes that keep turning up among your favourites. *Find more* asks AniList for the best-rated things carrying that exact mix. Below that: other parts of things you loved, fans-also-liked, TMDB, RAWG and forum recommendations.

---

## Watch & Read

\`\`\`
UniverList [Watch | Read]                      ← the switch only shows on these pages
┌───────────────────────────────────────────────┐
│ Search anime, shows and films…                │ ← answers as you type; ↑ ↓ and Enter
└───────────────────────────────────────────────┘
 All · Anime · TV · Film        ☐ Covers   Servers   Upload files
 ▸ Continue watching
\`\`\`

1. Type to search (a plain list by default; tick **Covers** for art). Search looks up shows, anime and films in the catalogues (TVmaze, AniList, TMDB) for their seasons and episodes; it never looks for videos.
   What plays is always your own: files you open, your media servers, links on your own network (this computer, your home network, Tailscale), servers you've added, and YouTube. An address anywhere else is refused.
2. Pick anything (a search result, something you're watching, a card's Watch button) and you land on its **player page**: the player, then a section called **Episodes**. If the next episode is on your servers or in a file or link you added, it starts playing; otherwise the player shows where to add it.
3. **Seasons** are named by their release (Little Busters!, Little Busters! Refrain; Bungo Stray Dogs 1 to 5), including seasons you haven't added yet: AniList's sequel chain fills them in.
4. **⋯** at the top right customises the page as blocks: put the description, seasons and episodes **under** the player or at the **side** (or off), in any order, and choose which buttons sit under the player and in what order, like a browser toolbar. The page is plain black by default (pick any theme instead under ⋯ or Settings › Appearance › Watch & read). The top shows just the show's name; every button sits under the player: previous and next, jump, subtitles, speed, picture-in-picture, full screen, cinema mode, lights and player settings. With nothing to play yet, the player stays empty with the ways to add a file.
5. **⋯** customises the rest: Episodes as **Numbers** or **Detailed**, the show's description, the order of the sections, episodes beside or below the player, sequels together or separate, and the look. An anime's seasons are a dropdown of their full names; a TV show keeps its numbered seasons.
6. **W** opens Watch & read from anywhere, and pressing it again takes you back.
7. Search shows one result per show: the anime and TV listings of the same series (One Piece on AniList and on TVmaze) are merged.
8. In Read, picking something shows just that title: open its file or its chapters on your servers, nothing else.

| Player | Key |
| --- | --- |
| Play / pause | Space or K |
| Jump back / forward | ← → |
| Volume | ↑ ↓ |
| Cinema mode (hide the episode list) | T |
| Lights off | L |
| True full screen | F |
| Next / previous episode | N / P |
| Skip intro | S |
| Subtitles | C |

**Servers**: Jellyfin, Emby, Plex, Komga, Kavita, Calibre-web, any OPDS catalogue, or a shared folder (yours or a friend's). Episodes and chapters are matched by name; if one copy won't play, the next is tried. **Upload files** plays or reads files from this computer without copying them anywhere.

---

## The Learning Centre (an official extension)

A mode like the others (after Games, with its own shortcut), switched on or off in **Settings › Extensions › Built in**. Switched off, your academic books show under Literature, and everything you made in it is kept. It starts empty: everything in it is yours.

- **Courses**: what you're learning, a degree subject or any interest, kept apart as Academic and Interests. Each course is one page: its fields and your level in each (Foundations, Undergraduate, Master's, PhD, Research) with a goal, and its pathway. One subject is one course: maths stays maths, whatever level you're at.
- **Its pathway**: a reading order that knows what each book needs first ("once Rudin is underway", "once part I of Artin is done"), and programmes with stages (years, terms) → modules (code, credits, core or option, status, mark, term) → topics to tick off → readings in order. See one as **Modules**, a **Map**, by **Stages** or by **Threads**. A programme adds up topics covered, credits done and a credit-weighted mark, and can be compared with another programme's topics.
- **Curricula**: what different programmes teach in one course, topic by topic. Merged: every topic once, which programmes teach it (★ compulsory, ● offered) and every book they set, most-set first; click one to make it your book. Side by side: each programme's modules with their books. Add programmes by pasting a module list or fetching it from a university's page; make a pathway from your picks.
- **Fetch from a link**: a programme page brings its modules in by year; a reading list (Talis Aspire, Leganto, or the module's own page) brings its books in order. You check and edit a table before anything is saved. If a page can't be fetched, paste its text instead.

---

## Music

Albums are a kind of thing in your library, with their own mode (after the Learning Centre). Search finds them on MusicBrainz, free and with no key: adding one brings its artist, year, cover (from the Cover Art Archive), tracks and length. The words fit too: Listened, Plan to listen, Artist, and music's own parts to rate.

---

## Themes and backdrops

Every theme has a **backdrop** behind it: drifting stars (Galaxy), a projector beam with dust (Projector), lamplight (Leather), a desk lamp (Library), an arcade grid (Neon), an aurora (AniList), a red sun over ink (Arghnime), rain (Noir), falling petals (Blossom). Pick a theme's backdrop, and how much it moves (Still, Calm, Alive), under Settings › Appearance › **Backdrop and ambience**. Your system's reduce-motion setting always wins.

**Make your own** with the **Backdrop builder (beta)**: switch it on in Settings › Extensions › Built in, then Settings › Backdrops. Start from Fireflies, Snowfall, Petals, Starfield or a blank one, and change it while it plays behind the page: a sky of two colours (or the theme's own), a picture of yours that slowly pans or breathes, and up to four layers of moving shapes (dots, stars, hearts, petals, rain…) with their own colour, number, size, speed, direction, sway and twinkle. **Use it** puts it behind the theme you're on. **Save as file** gives you a small .ulbackdrop file to share; **Open a backdrop file** takes one in, checked first: a backdrop is only shapes, colours and a picture, so it can't do anything else.

---

## Where Details Come From

| For | Free, no key | With a free key (on univerlist.sayel.dev, TMDB and IGDB come without one) | With your own proxy (one free Worker, below) |
| --- | --- | --- | --- |
| Anime, manga, manhwa, light novels | AniList (details, art, characters, seasons, sync) · MyAnimeList through Jikan (MAL scores) | — | — |
| Books | Open Library (editions, covers, sizes) · Apple Books · Google Books · Wikipedia | — | Hardcover (edition covers) |
| Comics | Open Library · Google Books | — | Comic Vine (every issue's cover) |
| TV | TVmaze (episodes, cast, airing) · Wikidata | TMDB (posters, casts) · OMDb (IMDb, RT critics) | — |
| Film | Wikidata + Wikipedia · Apple's iTunes catalogue (posters) | TMDB · OMDb | — |
| Games | Wikidata · Wikipedia box art · App Store icons | RAWG (covers, time to beat) | IGDB (what Backloggd uses) · SteamGridDB (every cover people have made) · TheGamesDB (the real box per platform) · ScreenScraper (box per region, back, 3D box and the spine) |

- **Credits:** every catalogue is named where its details show. This product uses the TMDB API but is not endorsed or certified by TMDB. Game details from RAWG and IGDB link back to them. UniverList isn't affiliated with any of these.
- **UniverList by sayel.** The code is open source under the GNU AGPL-3.0: [univerlist.sayel.dev/source](https://univerlist.sayel.dev/source). A changed copy keeps the line "Based on UniverList by sayel".
- **AniList or MyAnimeList?** Both. AniList is the main source because it has a proper public API (details, pictures, relations, seasons, list sync); MyAnimeList, through Jikan, adds its score. If you track on MAL, export your list there (Profile → Export) and drop the file into Import.
- **Your proxy** is a free Cloudflare Worker you own. Those databases only answer servers, and their keys must stay secret, so the keys live inside the Worker (never in this app or your backups). Set-up and the script: Settings › Data, sources & keys › Your own keys › Your proxy. Add only the keys you want; the app uses whichever are there.
- **Real spines**: with ScreenScraper set up, Settings › Data, sources & keys › Your games › **Find real spines** puts the actual spine scan on each game's shelf. Other things keep spines cut from the cover.
- **LaunchBox** (no key): download its whole database (Metadata.zip) and choose it under Settings › Data, sources & keys › Your games. Each game gets the real box for your platform as its cover (unless you picked one), the real spine on the shelf, and every box it has (other platforms, regions, back, 3D) in its Art. A slim copy stays in this browser, so games you add afterwards get theirs by themselves (a new browser or device needs the zip once).
- **Spines you choose**: any card › Art › **Upload a spine…**, or press **Spine** under any picture found. **Cut it from the cover instead** goes back to the automatic one. Your choice is never replaced.
- **Art is kept**: everything a "See all artwork" search finds is saved on the card, so it's there instantly next time and travels in your backups.
- **Not used**: sites with spines and 3D boxes but no public API; MobyGames, ISBNdb and TheTVDB are paid; MangaDex has every volume's cover but is a scanlation site and asks to be reached only through a server, so it's left out.

---

## Shelves: Where the Sizes Come From

| Thing | Height | Thickness |
| --- | --- | --- |
| Books | Printed size when Open Library knows it, else by format (paperback, hardback, textbook) | From the page count |
| Manga / manhwa / light novels | 17.6 / 21 / 18.5 cm tankōbon | About 1.6 cm a volume |
| Games | The case for your platform (Switch 17 cm, Wii 19 cm, DS 13.6 cm…) | The case's depth |
| Films and series | A DVD or Blu-ray case | One case, or a box set for long shows |

Spines are cut from the cover, except games with a real spine from ScreenScraper (see above). In Cover and Grid views, game boxes keep their real shape: a DS box nearly square, a Switch case narrow, a PSP case narrower still (turn it off in the view's ⋯ menu).

---

## Account & sync (an official extension)

Make an account once and your library is on every device you sign in on, kept in step by itself, deletions too.

1. Settings › **Account & sync** › make an account with a **passkey** (your face, fingerprint or screen lock). That's one passkey for the account.
2. Save the **recovery code** it shows you, once: download it, copy it, or write it down. It's the way back if you lose your passkey.
3. On another device, press **Sign in on another device** and scan the code with your phone's camera (or open its link on another computer). The library arrives, and no new passkey is made.

- Your library is **encrypted on your device** before it goes anywhere; only your devices and your recovery code can open it, not the server.
- Changes sync about 20 seconds after you stop making them (at most every two minutes while you keep going), when you come back to the app, and when you go online.
- **Lost your passkey?** Sign in with the recovery code, then set up a new passkey. Lost both? The cloud copy can't be opened by anyone; your own backups still work.
- **On a borrowed computer:** More › *Sign out and remove my library from this browser* leaves nothing of yours behind.
- No email, no password, and nothing about what you do in the app is kept. Exactly what is kept is on the site's *Privacy and terms* page (privacy.html, linked when you make an account).

---

## Backups and Privacy

- **This device** (Settings › General): how much space your library takes, and **Install**, which gives UniverList its own window and icon and makes the browser less likely to clear it. Settings › Data says whether the browser has promised to keep it.
- Open in **two tabs**? The older one never saves over what the newer one changed; it picks the changes up when you go back to it.
- Everything lives in this browser. **Download everything** saves *profile-export_‹name›_‹date›.zip*; drop it onto any copy of index.html to bring it all back, or pick just some parts.

\`\`\`
profile-export_<name>_<date>.zip
├── library/<medium>.json     everything you've added
├── collections/              favourites, lists (tier lists too)
├── personal/                 profile, preferences, themes
├── academic.json             the Learning Centre: every course, its pathway and opportunities
├── extensions/<id>/          public extensions
├── private/                  sealed: keys, private extensions, collection
├── images/<kind>/<id>        every picture, named after what it belongs to
└── readable/                 spreadsheets and stats, if you ask for them
\`\`\`

- **Pictures:** ones you uploaded live only in images/ (the data points to them); ones from links are downloaded too, and the link is kept as the way back.
- **Keys** are never inside index.html. In a backup they're only saved encrypted, with a passphrase you type when exporting (and again when importing). Key fields are hidden until you press 👁.
- The **private collection** is encrypted with your passphrase; which types go there is your choice and is stored encrypted too.

## Extensions

Extra abilities you add in **Settings › Extensions**: drop in a .zip (a folder with extension.json), a single .json or a .js file.

- Each runs sealed off from the app: it only gets what its permissions say (its own settings, its companion, offering sources for episodes), never your library or keys.
- Switch any on or off; **Private** keeps one out of every backup except ones sealed with your backup passphrase.
- A **companion** is a small program on your own computer that does what a web page can't (reading your video folders, converting .mkv). Its status shows beside the extension.
- *Your own video files* (local-media-player.zip) is the first one: start its companion with your folders and every episode or film you have on disk shows up as a source on the player page.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| A game shows a screenshot instead of box art | Card → Art → pick *Box art (Wikipedia)* or *Steam cover*. With an IGDB key every game gets Backloggd's covers. |
| A book has no cover | Card → Art → See all artwork (Open Library, Google Books and Apple Books) |
| A search column says *slow · try again* | That source didn't answer in time; press it to retry |
| Characters look like the actors | Characters show their own pictures where Wikidata or Wikipedia has one; actors are under Cast |
| The library feels slow | It shouldn't: lists are worked out once per change. If it is, tell me what you clicked |
| Something moved to the wrong mode | Right-click → Lives in → Where its type puts it |

---

## Quick Reference: Keys

| Key | Does |
| --- | --- |
| N or / | Search and add |
| \\ | Sidebar |
| ⇧1–⇧8 | Jump to a mode |
| S | Select in the library |
| 1–4 | Cover, Grid, Spine, List |
| P | Pick for me |

All keys can be changed in [Keyboard](act:go-settings:keys).

---

- Last updated: October 2026`;
// a small Markdown renderer: headings, quotes, rules, lists, checklists, tables, code blocks, bold, italics, code and action links
function mdInline(s: string) {
    return esc(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(
            /\[([^\]]+)\]\(act:([\w-]+)(?::([\w-]+))?\)/g,
            (_, t: string, a: string, k: string | undefined) =>
                `<button class="linkbtn" data-act="${a}" data-k="${k || ""}">${t}</button>`
        )
        .replace(
            /\[([^\]]+)\]\((https?:[^)]+)\)/g,
            (_, t: string, u: string) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`
        );
}
export function mdRender(md: string): string {
    const L = md.split("\n"),
        out: string[] = [];
    let i = 0,
        ck = 0;
    const checks = meta.settings.guideChecks || {};
    while (i < L.length) {
        const l = L[i];
        if (/^```/.test(l)) {
            const b: string[] = [];
            i++;
            while (i < L.length && !/^```/.test(L[i])) b.push(L[i++]);
            i++;
            out.push(`<pre class="mdcode">${esc(b.join("\n"))}</pre>`);
            continue;
        }
        if (/^---\s*$/.test(l)) {
            out.push("<hr>");
            i++;
            continue;
        }
        const h = /^(#{1,3})\s+(.*)$/.exec(l);
        if (h) {
            const n = h[1].length,
                id = slug(h[2]);
            out.push(`<h${n} id="g-${id}">${mdInline(h[2])}</h${n}>`);
            i++;
            continue;
        }
        if (/^>\s?/.test(l)) {
            const b: string[] = [];
            while (i < L.length && /^>\s?/.test(L[i])) b.push(L[i++].replace(/^>\s?/, ""));
            out.push(`<blockquote>${mdInline(b.join(" "))}</blockquote>`);
            continue;
        }
        if (/^\|/.test(l)) {
            const rows: string[] = [];
            while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
            const cells = (r: string) =>
                r
                    .replace(/^\||\|$/g, "")
                    .split("|")
                    .map(c => c.trim());
            out.push(
                `<div class="mdtable"><table><thead><tr>${cells(rows[0])
                    .map(c => `<th>${mdInline(c)}</th>`)
                    .join("")}</tr></thead><tbody>${rows
                    .slice(2)
                    .map(
                        r =>
                            `<tr>${cells(r)
                                .map(c => `<td>${mdInline(c)}</td>`)
                                .join("")}</tr>`
                    )
                    .join("")}</tbody></table></div>`
            );
            continue;
        }
        if (/^\s*(- |\d+\. )/.test(l)) {
            const ord = /^\s*\d+\. /.test(l),
                items: string[] = [];
            while (i < L.length && /^\s*(- |\d+\. )/.test(L[i])) items.push(L[i++].replace(/^\s*(- |\d+\. )/, ""));
            out.push(
                `<${ord ? "ol" : "ul"}>${items
                    .map(t => {
                        const c = /^\[( |x)\]\s+(.*)$/.exec(t);
                        if (!c) return `<li>${mdInline(t)}</li>`;
                        const k = "c" + ck++,
                            on = checks[k] ?? c[1] === "x";
                        return `<li class="mdcheck${on ? " on" : ""}"><label><input type="checkbox" data-guidecheck="${k}" ${on ? "checked" : ""}> <span>${mdInline(c[2])}</span></label></li>`;
                    })
                    .join("")}</${ord ? "ol" : "ul"}>`
            );
            continue;
        }
        if (!l.trim()) {
            i++;
            continue;
        }
        const p: string[] = [];
        while (i < L.length && L[i].trim() && !/^(#|>|\||```|---|\s*- |\s*\d+\. )/.test(L[i])) p.push(L[i++]);
        out.push(`<p>${mdInline(p.join(" "))}</p>`);
    }
    return out.join("\n");
}
export function guideDownload() {
    const md = GUIDE_MD.replace(/\[([^\]]+)\]\(act:[^)]+\)/g, "$1"),
        a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = "UniverList Guide.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initGuide() {
    // the page itself is settings/Guide.svelte
    document.addEventListener("change", e => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || !t.dataset.guidecheck) return;
        meta.settings.guideChecks = { ...(meta.settings.guideChecks || {}), [t.dataset.guidecheck]: t.checked };
        markDirty();
        t.closest("li")?.classList.toggle("on", t.checked);
    });
    document.addEventListener("click", e => {
        const a = e.target instanceof Element ? e.target.closest('.gtoc a[href^="#g-"]') : null;
        if (!a) return;
        e.preventDefault();
        const el = document.getElementById((a.getAttribute("href") || "").slice(1));
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 80, behavior: "smooth" });
    });
}
