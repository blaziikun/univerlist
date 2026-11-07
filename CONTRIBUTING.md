# Contributing

Thanks for wanting to help. Bug reports, ideas and small, focused pull requests are all welcome.

## Where it's going

UniverList is one library for everything you watch, read and play, and it stays:

- **yours:** everything lives in your browser and leaves as one file; an account is optional and end-to-end encrypted;
- **simple first:** open it and add things, with nothing to sign up for, while every advanced part (keys, proxies,
  extensions, themes, the export format) stays one step away for the people who want it;
- **free to run:** no tracking, no ads, nothing that needs a paid service.

Good fits: new sources of details and covers, better matching, more ways to bring a library in, accessibility, speed.
Personal tools that only some people want usually make better [extensions](docs/extensions.md) than core features.

## How to help

- **A bug:** open an issue with what you did, what you expected and what happened. If it involves your library, say
  which kind of entry; please don't attach a real export, since it can hold your keys.
- **An idea:** start a discussion (or an "idea" issue) before building something big, so we can agree on the shape first.
- **A first change:** issues labelled *good first issue* are small and self-contained.
- **A change:** read [docs/architecture.md](docs/architecture.md) first (the docs map is [docs/README.md](docs/README.md)).
  Keep to the folder of the feature you're changing, and match the files around it
  (`pnpm exec biome format --write` sorts out the formatting).
- **Before opening a pull request:** `pnpm test` passes. A fix comes with a test that failed before it; a new feature
  with a browser test and its page or dialog in the accessibility sweep.
- **Not wanted:** analytics or trackers, anything that needs a paid service, and new dependencies without a reason
  written in [docs/decisions.md](docs/decisions.md).
- **Security problems** go to [SECURITY.md](SECURITY.md), not an issue.

This is a spare-time project, so replies can take a week or two.

By contributing you agree your work is released under the GNU AGPL-3.0 with the additional terms in [LICENSE](LICENSE),
like the rest of the project. Extensions you write and publish yourself can use any licence.
