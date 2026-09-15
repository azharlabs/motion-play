# Stage 0

**Primary path:** `/` → `controller.html` (mascot + logo, 15 sticky titles, howto GIF/canvas preview, Play) → `?card=<id>` sticky embed session. No profile dropdown.

**Legacy arcade** (original Stage 0 canvas engines under `js/games/`): `index.html?legacy=1` only — not linked from the primary UI.

**Play session:** `controller.html?card=<id>` or `play.html?card=<id>` — camera + iframe chrome themed with MotionPlay tokens (`css/play-chrome.css`).

# MotionPlay Stage 0 — Jump the Wall

Web prototype: **front camera → Google MediaPipe Pose Landmarker (BlazePose lite) → jump/duck events → canvas game.**

Camera frames never leave the browser. Only the model weights are fetched (Google model host + jsDelivr).

## Run

From the repo root:

```bash
npm start
```

Open [http://localhost:5173](http://localhost:5173) and allow the camera.

**Phone:** `getUserMedia` needs a secure context, so anything other than `localhost` requires HTTPS (a tunnel works).

## Play

1. Open the controller home, pick a title, and read the how-to (GIF/canvas preview).
2. Press **Play**, then **Start** on the play chrome — stand so your body is in frame.
3. Move according to the title’s hint (lean, jump, reach, punch, hold, …).

Backup keys still work inside many embeds: arrow keys / space.

## How detection works

Everything is measured **relative to your own torso length**, so the same jump reads the same whether you stand close to the camera or across the room.

| Signal | Rule |
|--------|------|
| Jump | Hips rise ≥ 22% of torso above the calibrated standing line, or ≥ 12% with strong upward velocity. 300 ms cooldown. |
| Duck | Shoulders drop ≥ 35% of torso to enter, must return above 20% to exit (hysteresis stops flicker). |
| Smoothing | 1-Euro filter — heavy smoothing when still, light when moving fast, so fast motion is not delayed. |
| Tracking loss | A 300 ms grace window rides out dropped frames before showing "Step back". |
| Drift | The standing baseline slowly follows you if you settle into a new stance. |

Tuning knobs live in the `MotionEngine` constructor in `js/motion-events.js`.

## Performance

- Frames are downscaled to **320 px wide** before inference (still above the 256 px MediaPipe recommends).
- Camera is capped at 640×480 / ~24 FPS.
- GPU delegate with automatic CPU fallback; the HUD chip shows which one is active.
- The FPS chip shows pose FPS and milliseconds per inference.

Healthy: **GPU, 15–35 ms**. If it says CPU with 80 ms+, the browser is not using the GPU.

## Files

| File | Responsibility |
|------|----------------|
| `controller.html` | Primary hub + play shell for sticky titles |
| `play.html` | Deep-link play shell (same chrome) |
| `css/play-chrome.css` | Shared MotionPlay chrome tokens |
| `js/external/catalog.js` | Maps registry card ids → embed slug + profile |
| `js/camera.js` | `getUserMedia` and capture caps |
| `js/pose.js` | MediaPipe Pose Landmarker setup, frame downscale |
| `js/filters.js` | 1-Euro filter and median |
| `js/landmarks.js` | Landmark indices and confidence helpers |
| `js/motion-events.js` | Calibration and the jump/duck event layer |
| `js/game.js` | Obstacles, lives, combo, difficulty ramp |
| `js/mascot.js` | Pip the fox, drawn procedurally |
| `js/render.js` | Parallax scene, particles, HUD |
| `js/overlay.js` | Debug skeleton and threshold lines |
| `js/main.js` | Legacy arcade screen flow and main loop |

## Tests

```bash
npm test
```

## Controller-first sticky titles

`/` → `controller.html` (15 sticky titles). Play chrome embeds `external-games/<slug>/` and drives them from pose. Open `index.html?legacy=1` for the older 15-game canvas arcade.
