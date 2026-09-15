# MotionPlay

Camera motion-tracking games where your body is the controller.

MotionPlay is evolving from a collection of camera mini-games into an active-play platform for kids. The game experience provides the fun, while the shared motion layer detects physical actions, records activity locally, and explains the movement focus of each session in safe, non-medical language.

## Active-play catalogue

The current product catalogue contains 15 experiences built on the existing Stage 0 motion engines while dedicated mechanics and visuals are progressively upgraded:

1. Motion Runner
2. Fruit Slice
3. Kart Racer
4. Goalkeeper Hero
5. Boxing Challenge
6. Dance Copycat
7. Jump Island
8. Balloon Pop Adventure
9. Ninja Dodge
10. Animal Adventure
11. Space Defender
12. Treasure Catch
13. Balance Bridge
14. Adventure Climber
15. Simon Says Motion

The stable internal Stage 0 game IDs are temporarily retained so existing personal bests, activity history, artwork, tests and lazy-loaded engine modules remain compatible during the migration.

## External game controller mode

MotionPlay can also act only as the motion engine while an existing browser game supplies the visuals and gameplay.

Open `stage0/controller.html`, choose a profile, calibrate the camera, and MotionPlay converts pose signals into a standard control stream. The companion Chrome/Edge extension in `companion/chrome-extension/` relays that stream into a game tab that the player explicitly arms.

Current profiles:

- Runner: lean left/right -> arrow left/right, physical jump -> up, crouch -> down.
- Racer: lean -> steering, player in frame -> acceleration, crouch -> brake.
- Platformer: lean -> movement, physical jump -> space, crouch -> down.

This architecture exists because a normal web page cannot safely inject controls into an unrelated browser tab. The extension crosses that browser boundary while keeping MediaPipe and movement analytics inside MotionPlay.

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
