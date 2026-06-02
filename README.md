# Mirror Dock

[![Live demo](https://img.shields.io/badge/demo-GitHub%20Pages-0969da)](https://bte808.github.io/fun-20260602-a-mirror-dock/)
![Runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-2ea44f)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Mirror Dock is a no-dependency daily browser puzzle. Rotate a handful of slash/backslash mirrors, fire the beam, and try to dock five generated boards before your pulse bank runs out.

Live demo: <https://bte808.github.io/fun-20260602-a-mirror-dock/>

![Mirror Dock preview](docs/preview.svg)

## What it can do

- Generates five deterministic daily 6x6 beam puzzles from the Asia/Shanghai date.
- Loads any valid Challenge date and copies a fixed-date link for replayable routes.
- Lets players rotate mirrors, fire the beam, see the path, and advance dock by dock.
- Tracks pulse bank, shots, score, grade, daily best score, and a copyable share result.
- Works as a static site with no login, API key, build step, framework, or asset download.
- Includes a browser smoke test that completes the daily run on desktop and `390x844` mobile.

## Why it is fun

The board is tiny, but each click has immediate consequences. A wrong mirror spills the beam or traps it in a loop; a correct route lights up the dock and moves you to the next board. It is short enough to play in one tab break and deterministic enough for people to compare the same daily route.

## Why it may be worth starring

- It is easy to understand from the screenshot and playable within seconds.
- The daily seed, Challenge date links, score, grade, and share text make it naturally replayable and link-friendly.
- The implementation is compact, readable, and dependency-free, so it is useful as a reference for polished static browser toys.
- The project ships with validation scripts, mobile checks, README positioning, license, topics-ready metadata, and GitHub Pages support.

## 2026-06-02 Maintenance Update

This pass adds a **Challenge date** control with **Load**, **Today**, and **Copy link** actions. The game still opens on the Asia/Shanghai daily route, but a player can now load a specific date and share a URL that recreates the same five dock boards.

This makes the toy better for friends, classes, or small team breaks because one person can send a fixed puzzle route without needing accounts, leaderboards, or a backend. It also makes the repo more worth starring as a complete static-game reference: daily play, fixed challenge links, local best scores, generated boards, mobile smoke tests, and no runtime dependencies.

## Core loop

1. Start the run.
2. Rotate mirrors on the 6x6 dock board.
3. Fire the beam and read the path feedback.
4. Land five docks for the best grade, or recover before pulses hit zero.
5. Use **Challenge date** when you want a replayable route.
6. Copy the result or fixed-date link and compare the route.

## Run locally

```bash
npm run serve
```

Then open:

```text
http://localhost:5222
```

For a fixed daily route while testing:

```text
http://localhost:5222/index.html?date=2026-06-02
```

## Validation

```bash
npm run check
npm run verify:browser
```

`npm run check` validates the generated puzzle set, scoring, share text, required files, README sections, and mobile CSS hook.

`npm run verify:browser` launches a local Chrome/CDP smoke test, loads the page, interacts with the board, solves all five docks through the public smoke hook, verifies the final result panel, and checks that a `390x844` viewport has no horizontal overflow.

## Inspiration sources

This project only borrows the broad product shape of short, playful browser-native experiences:

- [Hacker News Show HN](https://news.ycombinator.com/show), where recent posts included tiny games and browser-native visual experiments.
- [GitHub Trending JavaScript](https://github.com/trending/javascript?since=daily), used as a pulse check for small web projects people are actively exploring.
- [Product Hunt Games](https://www.producthunt.com/topics/games), used as a reminder that instantly legible, low-friction fun tends to be more shareable.

No external code, copy, design file, or copyrighted asset was reused.

## Future ideas

- Add a weekly leaderboard file format for self-hosted groups.
- Add optional hard mode with hidden decoy mirrors.
- Export the daily board as an image for easier sharing.
- Add a puzzle editor that emits a URL-safe seed.

## License

MIT
