# MotionPlay

Camera motion-tracking games where your body is the controller.

MotionPlay is evolving from a collection of camera mini-games into an active-play platform for kids. The game experience provides the fun, while the shared motion layer detects physical actions, records activity locally, and explains the movement focus of each session in safe, non-medical language.

## Active-play catalogue

The controller library lists **44 playable cards**, covering every package already in the tree:

| Section | Cards | Packages |
|---|---|---|
| Motion games | 15 sticky embeds | 9 shells in `stage0/external-games/` (some shells are reused with a different skin and title) |
| Classic arcade | 14 vendored HTML5 games | 14 folders in `stage0/vendor-arcade/` |
| Classic canvas | 15 original engines | 15 modules in `stage0/js/games/` |

That is 14 + 9 + 15 = **38 packages**, and 44 cards because six motion titles share a shell with a sibling. Delight titles stay first. Asteroid Blaster, Underrun, and the previously hidden motion titles (Jump Island, Dance Copycat, Space Defender, Treasure Catch, Animal Adventure, Balance Bridge, Adventure Climber) are on the grid. Classic canvas cards use a distinct “(Classic)” title and launch `index.html?legacy=1&game=<id>&from=controller`. Quit on that page returns to the library. Embed and arcade cards keep the controller Pause/Exit sheet.

Vendored arcade attribution and licenses live in `stage0/vendor-arcade/ATTRIBUTION.md`. Arcade and motion cards embed with absolute `/vendor-arcade/...` and `/external-games/...` paths and the same pose→key bridge.

The stable internal Stage 0 game IDs are temporarily retained so existing personal bests, activity history, artwork, tests and lazy-loaded engine modules remain compatible during the migration.

## Primary path: controller → preview → sticky embeds

The default Stage 0 entry (`/`) redirects to `stage0/controller.html`: **mascot + logo, 44-title library, GIF/canvas howto preview, then Play**. Play opens the same controller shell with `?card=<id>` (or `play.html?card=<id>`) for motion and arcade titles, embedding a mini-game under `stage0/external-games/` or `stage0/vendor-arcade/` driven by the pose → key/pose bridge (same-origin iframe). Classic canvas cards leave the controller only after preview, on Play, and open the original canvas engine. No profile dropdown.

Action families covered by dedicated embeds (remaining cards reuse the closest family with a distinct skin/title):

- Runner: `jump-runner`, `lane-runner`
- Racer: `kart-racer`
- Swipe / reach: `fruit-swipe`, `reach-pop`
- Punch: `punch-pad`
- Hold: `hold-pose`
- Raise: `raise-flap`
- Squat / lean platformer: `squat-island`

Classic canvas engines are on the controller grid under **Classic canvas**. `index.html?legacy=1` still opens the older skill browser directly. A card opened from the library adds `&game=<id>&from=controller`; Quit and All games return to `controller.html`. Camera permission is requested on that page’s Play button so the prompt stays tied to a tap.

Play chrome (`controller.html` / `play.html`) and embed shells share MotionPlay CSS tokens (teal / orange, Nunito, cards, buttons) via `css/play-chrome.css` and `external-games/_shared/shell.css`.

## External game controller mode

MotionPlay can also act only as the motion engine while an existing browser game supplies the visuals and gameplay.

From the primary controller hub, pick a sticky title (preview first, or pass `?card=` to skip to play), calibrate the camera, and MotionPlay converts pose signals into a standard control stream. Same-origin games receive keys through the iframe bridge. The companion Chrome/Edge extension in `companion/chrome-extension/` remains a secondary path that relays the same stream into another tab the player explicitly arms.

Current profiles:

- Runner: lean left/right -> arrow left/right, physical jump -> up, crouch -> down.
- Racer: lean -> steering, player in frame -> acceleration, crouch -> brake.
- Platformer: lean -> movement, physical jump -> space, crouch -> down.

A normal web page cannot safely inject controls into an unrelated browser tab; the extension crosses that boundary. Same-origin iframes do not need it.

A reference racing target is `jakesgordon/javascript-racer`, an MIT-licensed browser racing game that already accepts arrow/WASD controls. The adapter is deliberately generic so other keyboard-driven runner and racing games can use the same MotionPlay motion engine without putting their game code into the core pose stack.

Some games may reject synthetic keyboard events or run inside protected/sandboxed frames. Those will need the planned native virtual-gamepad companion rather than the browser relay.

## Motion and activity analytics

Each game reports countable physical actions through the shared game interface. The current movement vocabulary includes:

- jumps
- ducks
- squats
- punches
- reaches
- arm swipes
- lean or weight-shift changes
- arm raises
- held poses
- knee drives

Finished rounds are stored locally with the game, local day, active duration, score, level and per-action counts. The analytics layer can aggregate today's rounds, active time, total movements, movement-by-movement counts, games played, streaks and activity-focus time.

Activity-focus labels include active play, coordination, upper-body movement, lower-body movement, balance, reaction, postural control, cross-body movement, reach and mobility, and motor planning. These labels describe what the game asks the player to practise. They are not medical or therapeutic claims.

## Stage 0

The web prototype is driven by MediaPipe Pose Landmarker and is installable to a phone's home screen. Camera frames never leave the device.

```bash
npm test
npm start
npm run check:ui   # headless layout + overlay check, needs the server running
```

`check:ui` drives the real page in headless Chrome with the camera and pose modules stubbed, so it can verify things Node tests cannot see: that the camera panel has a real size, and that the skeleton overlay actually paints. Pass `--shot out.png` to save a screenshot.

`npm start` uses Python's `http.server`, so the `serve` package is not required.

Then open http://localhost:5173. More details are in [stage0/README.md](stage0/README.md).

## Testing it on a phone

A phone will not open its camera for a page served over plain `http` unless that page is `localhost`, so a laptop on the same Wi-Fi is not enough. Real-device testing needs a real HTTPS address.

```bash
npm run share    # throwaway public HTTPS address, alive while it runs
npm run deploy   # permanent Cloudflare Pages deployment
```

`share` tunnels the local server through Cloudflare and prints an address to open on the phone. It is useful for quick tests and stops when the process stops.

`deploy` uploads `stage0/` to Cloudflare Pages. There is no build step because the folder itself is the site.

Installed on a home screen, MotionPlay runs full screen without the browser address bar. On iOS use Share -> Add to Home Screen. Android provides an install option when supported.

Testers can report feedback from inside the app. Reports include the pose model, delegate and frame rate alongside the comment, which helps distinguish tracking or performance problems from game-logic problems. The destination is configured in `stage0/js/feedback-form.js`.

### Behind a company proxy

`npm` and anything it downloads may fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Windows trusts the proxy's root certificate but Node ships its own certificate list. Node 22.15+ can use the system store:

```bash
$env:NODE_OPTIONS = "--use-system-ca"   # PowerShell
```

`share` and `deploy` already set this for the tools they run.

## Physics

Rigid-body simulation runs on [planck.js](https://piqnt.com/planck.js/) 1.5.0, a JavaScript port of Box2D. It is vendored at `stage0/vendor/planck.mjs` rather than installed because the prototype is served as plain ES modules with no bundler and the same file has to load in the browser and in `node --test`.

To update it:

```bash
curl -o stage0/vendor/planck.mjs https://cdn.jsdelivr.net/npm/planck@1.5.0/dist/planck.mjs
```

`stage0/js/physics.js` is the only module that talks to planck; it converts between the game's pixels-above-ground and Box2D's metres.

- [Design spec](docs/superpowers/specs/2026-09-04-motionplay-stage0-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-04-motionplay-stage0.md)
