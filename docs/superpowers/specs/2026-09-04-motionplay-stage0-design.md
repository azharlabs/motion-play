# MotionPlay — Stage 0 Design Spec

**Date:** 2026-09-04  
**Status:** Approved in brainstorming  
**Scope:** Web prototype only — prove camera → pose → jump/duck → gameplay on a real device.

## 1. Purpose

MotionPlay is a cross-platform camera motion-tracking game app. Long-term architecture (from technology research):

- **Native pose pipeline** (MediaPipe / ML Kit BlazePose) emitting a normalized skeleton stream
- **Shared motion-event layer** (jump, duck, wave, pose-match, etc.)
- **Unity game layer** where mini-games subscribe to events

**Stage 0** validates the hardest assumption cheaply: a single RGB camera can drive fun, stable jump/duck gameplay at ~24–30 FPS on a mid-range phone, on-device, with kid/family-friendly UX.

## 2. Goals & success criteria

| Criterion | Target |
|-----------|--------|
| Detection FPS | Sustained ≥24–30 FPS on mid-range phone browser |
| Session length | Playable for ≥5 minutes without tab crash or severe throttling |
| Latency | Jump/duck feels responsive (subjective; measure frame-to-event delay in debug) |
| Privacy | No cloud upload of camera frames or pose data |
| Audience | Kid/family-first UI; forgiving detection thresholds |

## 3. Non-goals (Stage 0)

- Other mini-games (9 remaining v1 concepts)
- Unity, native iOS/Android apps, app store builds
- User accounts, leaderboards, calorie tracking
- ARKit premium 91-joint path
- Multiplayer / two people in one camera frame
- Cloud inference or video upload

## 4. Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ Web camera  │───▶│ MediaPipe Pose   │───▶│ Motion events   │───▶│ Jump the Wall    │
│ ~30 FPS     │    │ Landmarker (lite)│    │ jump, duck      │    │ (Canvas 2D)      │
│ front cam   │    │ 33 landmarks     │    │ EMA + floor cal │    │ score, rounds    │
└─────────────┘    └──────────────────┘    └─────────────────┘    └──────────────────┘
```

### 4.1 Capture

- Use `getUserMedia` with front-facing camera (user can flip later).
- Prefer lower resolution while keeping the subject ≥256×256 px (ML Kit guidance).
- Mirror preview for natural interaction.

### 4.2 Pose inference

- **Library:** MediaPipe Tasks — Pose Landmarker (JavaScript), **lite** model.
- **Output:** 33 landmarks per frame with visibility / presence scores and timestamps.
- **On-device only;** no network calls for inference.

### 4.3 Motion-event layer

Games consume **semantic events only**, never raw landmarks. Stage 0 implements two events:

#### `jump` (pulse)

1. During calibration (~1.5 s standing still), record a **floor line** from rolling average of ankle Y (fallback: hip Y if ankles low-confidence).
2. Apply EMA smoothing (~100–150 ms) to hip Y.
3. Emit `jump` when smoothed hip Y rises above floor by a configurable threshold (kid-forgiving default).
4. **Cooldown ~400 ms** after each jump to prevent double-fires.

#### `duck` (hold state)

1. At calibration, record **standing shoulder height** (average shoulder Y).
2. Emit `duck` **true** while shoulders drop below ~70% of standing height.
3. Emit `duck` **false** when shoulders return above threshold.
4. Hold semantics allow staying ducked under long obstacles.

#### Shared rules

- **Confidence gate:** ignore frames where hips or shoulders are below visibility threshold or out of frame.
- **Smoothing:** EMA on hips, shoulders, ankles before rule evaluation.
- **Debug mode:** optional skeleton overlay + floor line + shoulder threshold visualization.

### 4.4 Game — Jump the Wall

- **Loop:** Calibrate → play → score → rest → replay.
- **Obstacles:** tall walls (require jump), low walls (require duck), scrolling toward player.
- **UI:** large score, short instructions, calibration prompt (“step back until your whole body fits”).
- **Rounds:** 2–5 minutes, then rest screen with FPS summary.
- **Visual style:** bright, kid/family-friendly; minimal chrome.

## 5. Tech stack (Stage 0)

| Layer | Choice |
|-------|--------|
| Shell | Static HTML + CSS + JavaScript (no framework) |
| Pose | `@mediapipe/tasks-vision` Pose Landmarker |
| Game | HTML5 Canvas 2D |
| Dev server | Simple static server (e.g. `npx serve` or Python `http.server`) |
| Repo | `MotionPlay` at `~/Projects/MotionPlay` |

**Rationale:** Fastest path to camera + gameplay + FPS measurement. React and Unity deferred to Stage 1.

## 6. File layout (planned)

```
MotionPlay/
├── docs/superpowers/specs/
│   └── 2026-09-04-motionplay-stage0-design.md   # this file
├── stage0/
│   ├── index.html
│   ├── css/
│   ├── js/
│   │   ├── camera.js
│   │   ├── pose.js
│   │   ├── motion-events.js
│   │   └── game.js
│   └── README.md
├── .gitignore
└── README.md
```

## 7. Testing plan

1. **Desktop:** Chrome/Edge with webcam — verify calibration, jump, duck, scoring.
2. **Phone:** Same URL on LAN (HTTPS may be required for camera on mobile) — measure FPS overlay for 5 minutes.
3. **Edge cases:** partial body out of frame, low light, rapid jumps, crouch-and-hold under long obstacle.
4. **Record:** device model, browser, average FPS, subjective latency, thermal notes after 5 min.

## 8. Stage 1 preview (out of scope here)

After Stage 0 passes success criteria:

- Port motion-event API to a Unity-friendly interface (C# events or JSON stream).
- Scaffold Unity project + ML Kit (Android) / MediaPipe (iOS) native plugins.
- Add launcher shell and second mini-game to prove plugin pattern.

## 9. Open decisions (deferred)

- Exact jump threshold and duck ratio (tune during playtesting).
- HTTPS setup for mobile camera (local dev cert vs. tunnel).
- Whether to keep web shell as a PWA for Stage 1 demos.

## 9a. Revisions after first playtest (2026-09-04)

First run on a laptop webcam felt slow and imprecise. Changes made, all still within Stage 0 scope:

**Performance**
- Frames are downscaled to 320 px wide before inference instead of passing the full camera frame.
- Camera capped at 640×480 / ~24 FPS.
- GPU delegate preferred with automatic CPU fallback; the active delegate and per-frame inference time are shown in the HUD.

**Accuracy**
- Replaced the fixed EMA with a **1-Euro filter**, which smooths heavily when still and lightly when moving fast, removing the lag on real jumps.
- All thresholds are now **normalized to the player's torso length**, so detection no longer depends on distance from the camera.
- Jump has a velocity-assisted path (smaller rise + fast upward motion) alongside the absolute rise threshold.
- Duck uses **hysteresis** (enter 0.35, exit 0.20 of torso) instead of a single threshold.
- Calibration uses the **median** rather than the mean, rejecting outlier frames.
- A 300 ms tracking-loss grace window rides out dropped frames; the standing baseline slowly drifts to follow a settled stance.

**Game and presentation**
- Obstacles now make physical sense: ground **walls** are jumped, overhead **branches** are ducked.
- Added Pip the fox mascot (procedural, no image assets), parallax scenery, particles, score popups and screen shake.
- Added 3 lives with brief invulnerability, a combo bonus, a difficulty ramp, a start countdown, selectable round length, and a rank on the rest screen.
- The world pauses while the player is out of frame instead of running on without them.

## 10. References

- Google MediaPipe Pose Landmarker (Tasks API)
- MediaPipe issue #3909 — floor-relative jump detection
- Google Developers Blog — Jump to play (MediaPipe Dino demo)
- User technology research report (2026-09-04) — BlazePose, Nex Active Arcade architecture, thermal constraints
