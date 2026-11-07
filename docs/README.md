# UniverList's docs

*Start here. Each page covers one thing in full; this page shows how they fit together.*

```
README.md ─────────── what it is, running it, hosting it (in short)
│
├── docs/architecture.md   how the code fits together: the folders, the two kinds of code, the rules,
│   │                      adding a feature in six steps
│   ├── docs/decisions.md  why each tool and library was chosen, and what it was weighed against
│   ├── docs/defence.md    every part a person touches: how it works, why, what breaks it, where it gives
│   ├── docs/data-format.md   the export zip, file by file (the one format that must never break)
│   └── docs/extensions.md    writing an extension: the manifest, permissions, what it may offer
│
├── docs/hosting.md   running your own copy: setting it up, every Cloudflare and GitHub setting, why it stays free
│   └── docs/security.md   fifty common holes in web apps, each checked against UniverList
│
├── CONTRIBUTING.md   helping: bugs, ideas, pull requests, where the app is going
├── SECURITY.md       reporting a security problem privately
├── THIRD-PARTY.md    fonts, libraries and catalogues, with their licences
└── LICENSE           GNU AGPL-3.0, with a permission for extensions and the credit line
```

**Inside the app**, Settings › What's in here is the guide for people using it: every feature, where details come from,
and the keyboard shortcuts. It lives in `src/features/settings/guide.js`.

**Where to look for…**

| You want to… | Read |
| --- | --- |
| Use it | [univerlist.sayel.dev](https://univerlist.sayel.dev), then the guide in Settings |
| Run it on your computer | [README](../README.md#run-it) |
| Host your own copy | [hosting.md](hosting.md) |
| Change or add something | [architecture.md](architecture.md), then [CONTRIBUTING](../CONTRIBUTING.md) |
| Know why it's built this way | [decisions.md](decisions.md) |
| Know how a part works and where it breaks | [defence.md](defence.md) |
| Read or write its backups | [data-format.md](data-format.md) |
| Write an extension | [extensions.md](extensions.md), and the two official ones in `extensions/` |
| Check how it's protected | [security.md](security.md) |
