# The export: format 3

*Everything personal in UniverList, as one zip: `profile-export_<name>_<date>.zip` (older copies: `defaults-export.zip`, still read). Written and read entirely in the browser, so both work offline. Download everything lists every part, all ticked; a part you untick is simply missing from the zip, and bringing that zip back leaves your own copy of that part as it is.*

```
profile-export_<name>_<date>.zip
├── manifest.json              format, app version, when, counts
├── README.md                  what's where, for people
├── library/<medium>.json      everything you've added, one file per medium
├── collections/
│   ├── favourites.json        order, characters, people
│   └── lists.json             Up next, every list, tier and ranked lists
├── personal/
│   ├── profile.json
│   ├── preferences.json       settings, plus each mode's tabs, views, shelves and blocks
│   └── themes.json
├── academic.json              the Learning Centre: your subjects and paths ({ v: 2, subjects, paths })
├── extensions/<id>/           public extensions you installed, each with a state.json
├── private/
│   ├── keys.json              your keys, sealed with your backup passphrase (AES-256-GCM, PBKDF2 × 310,000)
│   ├── extensions.json        private extensions, sealed the same way
│   └── collection.json        the private collection: sealed with its own passphrase, plus its lists (only if you
│                              chose to include it)
├── images/
│   ├── index.json             each picture → the link it came from
│   └── covers/ banners/ spines/ favourites/ characters/ people/ profile/     named <owner-id>.<ext>
└── readable/                  optional copies for people (lists as CSV, stats); never read back
```

**The rule:** a folder is a kind of thing; a file is one thing you can tick on or off when importing. A file is split further only when it would be too big to open (the library, by medium) or isn't text (pictures).

| Detail | How |
| --- | --- |
| Uploaded pictures | Only in `images/`; the data says `"@images/covers/<id>.jpg"` |
| Pictures from links | Downloaded into `images/` too (when online); the link stays in the data as the way back |
| Keys | Only ever sealed with a passphrase you type when exporting; never in plain text, never in the app's files |
| Private things | Each of the three has its own checkbox, when exporting and when importing |
| Older exports | This build still reads format 1 (`data/…`) and format 2. Import an old one, export again, and you have format 3 |
