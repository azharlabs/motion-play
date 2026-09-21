# Vendored arcade attribution

Honest licensing for every title under `stage0/vendor-arcade/`.
Only permissive sources were vendored. Mega-packs were cherry-picked (not dumped wholesale).

## Shared

| Path | Source | License |
|------|--------|---------|
| `_shared/key-bridge.js` | MotionPlay (same as `external-games/_shared/key-bridge.js`) | Project |
| `_shared/arcade-shell.css` | MotionPlay | Project |
| `_shared/galaxy-lib/*` | [oceanm42/galaxy-zone-arcade](https://github.com/oceanm42/galaxy-zone-arcade) `arcades/2026-03/js/lib` | MIT |

## Titles

| Folder | Title | Upstream | License | Notes |
|--------|-------|----------|---------|-------|
| `snake/` | Snake | [Sai-Uttej-R/GameBox](https://github.com/Sai-Uttej-R/GameBox) `snake/` | MIT | Vanilla canvas |
| `breakout/` | Breakout | [Sai-Uttej-R/GameBox](https://github.com/Sai-Uttej-R/GameBox) `breakout/` | MIT | Vanilla canvas |
| `flappy-bird/` | Flappy Bird | [Sai-Uttej-R/GameBox](https://github.com/Sai-Uttej-R/GameBox) `flappy-bird/` | MIT | Vanilla canvas |
| `whack-a-mole/` | Whack-a-Mole | [Sai-Uttej-R/GameBox](https://github.com/Sai-Uttej-R/GameBox) `whack-a-mole/` | MIT | Vanilla / pointer |
| `tetris/` | Tetris | [jakesgordon/javascript-tetris](https://github.com/jakesgordon/javascript-tetris) | MIT | Classic keyboard tetris |
| `invaders/` | Andromeda Invaders | [susam/invaders](https://github.com/susam/invaders) | MIT | Single-file invaders |
| `asteroids/` | HTML5 Asteroids | [dmcinnes/HTML5-Asteroids](https://github.com/dmcinnes/HTML5-Asteroids) | MIT | Incl. jQuery 1.4.1 (bundled upstream) |
| `game-2048/` | 2048 | [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048) | MIT | Slide puzzle |
| `racer/` | OutRun-style Racer | [jakesgordon/javascript-racer](https://github.com/jakesgordon/javascript-racer) | MIT | `v4.final` + images; **music not vendored** |
| `pac-chase/` | Pac-Chase | [oceanm42/galaxy-zone-arcade](https://github.com/oceanm42/galaxy-zone-arcade) `games/pac-chase` | MIT | Pac-Man-style |
| `road-hopper/` | Road Hopper | galaxy-zone-arcade `games/road-hopper` | MIT | Frogger-style |
| `space-defenders/` | Space Defenders | galaxy-zone-arcade `games/space-defenders` | MIT | Invaders-style |
| `asteroid-blaster/` | Asteroid Blaster | galaxy-zone-arcade `games/asteroid-blaster` | MIT | Asteroids-style |
| `underrun/` | UNDERRUN | [phoboslab/underrun](https://github.com/phoboslab/underrun) | MIT | Source + `m/` assets (debug entry) |

## Packs surveyed but not wholesale-vendored

| Pack | Why skipped / how used |
|------|------------------------|
| **LittleJSArcade** (MIT) | Games need shared LittleJS `templates/` engine loader — skipped for zero-build simplicity this batch |
| **forinda/canvas-games** (MIT) | TypeScript / Vite build — not zero-build vanilla |
| **KoRifCan/Classic-Games** | No LICENSE file found — skipped for honesty |
| **juliensimon/browser-games** | “Fan recreations… educational” — no clear permissive grant |
| **sausi-7/games** (MIT) | Huge (~700MB); arcade subset mostly Phaser — cherry-pick deferred |
| **ZLostTK/JavaScript-Games** | License restricts to non-commercial — skipped |
| **sovereign-arcade / NEBULA** | Explicitly out of scope |

## MotionPlay wrappers

Each title’s `index.html` was adapted for Vercel `trailingSlash=false`:
root-absolute `/vendor-arcade/...` asset URLs, `<base href>`, and the MotionPlay
`key-bridge` so the controller Pause/Exit + pose→key bridge keep working.
