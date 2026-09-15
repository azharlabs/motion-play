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

1. Stand so your **whole body** is in frame.
2. Hold still ~1.5 s while it measures your floor line, standing height and torso length.
3. **Jump** over stone walls. **Duck** under hanging branches.
4. Three lives, brief invulnerability after a hit, and the pace ramps up as the round goes on.
5. Clear five in a row for combo bonus points.

Round length (1/3/5 min) is selectable on the start screen.

Backup keys: `Arrow Up` jump, `Arrow Down` duck, `D` skeleton overlay.

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
| `js/camera.js` | `getUserMedia` and capture caps |
| `js/pose.js` | MediaPipe Pose Landmarker setup, frame downscale |
| `js/filters.js` | 1-Euro filter and median |
| `js/landmarks.js` | Landmark indices and confidence helpers |
| `js/motion-events.js` | Calibration and the jump/duck event layer |
| `js/game.js` | Obstacles, lives, combo, difficulty ramp |
| `js/mascot.js` | Pip the fox, drawn procedurally |
| `js/render.js` | Parallax scene, particles, HUD |
| `js/overlay.js` | Debug skeleton and threshold lines |
| `js/main.js` | Screen flow and the main loop |

## Tests

```bash
npm test
```

## What to record on a phone

- Device and browser
- Average pose FPS from the rest screen after ~5 minutes
- Whether jump/duck felt late
- Heat and any throttling

## Controller-first sticky title

Default entry redirects to `controller.html`, which embeds `external-games/lane-runner/` (MotionPlay-built, arrow-key 3-lane runner) and drives it from pose via the runner profile. Open `index.html?legacy=1` for the older 15-game arcade.
