# MotionPlay Stage 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable web Jump the Wall prototype: camera → MediaPipe Pose Landmarker (lite) → jump/duck events → Canvas game, with FPS overlay, calibration, and 2–5 minute rounds.

**Architecture:** Pure JS `MotionEngine` converts 33 image-space landmarks into semantic `jump` (pulse) and `ducking` (hold) events. A separate Canvas game never reads landmarks. Camera + MediaPipe run in the page loop; debug overlay is optional.

**Tech Stack:** Static HTML/CSS/ES modules, `@mediapipe/tasks-vision` (CDN), HTML5 Canvas 2D, Node `node:test` for motion/game unit tests.

---

## File map

| File | Responsibility |
|------|----------------|
| `package.json` | `npm test`, `npm start` |
| `stage0/js/landmarks.js` | BlazePose index constants + landmark helpers |
| `stage0/js/motion-events.js` | Calibration, EMA, jump/duck |
| `stage0/js/game.js` | Obstacle spawn, collision, score, round timer |
| `stage0/js/camera.js` | `getUserMedia` front camera |
| `stage0/js/pose.js` | Pose Landmarker lite VIDEO mode |
| `stage0/js/overlay.js` | Skeleton, floor line, duck threshold |
| `stage0/js/main.js` | Screen flow + rAF loop |
| `stage0/css/app.css` | Kid/family UI |
| `stage0/index.html` | Shell |
| `stage0/README.md` | How to run / measure |
| `stage0/js/motion-events.test.js` | MotionEngine tests |
| `stage0/js/game.test.js` | Collision/score tests |

Image-space Y: **0 = top, 1 = bottom**. Jump = hips move **up** (Y decreases). Duck = shoulders move **down** (Y increases).

Landmark indices: shoulders 11/12, hips 23/24, ankles 27/28. Visibility gate default `0.5`.

---

### Task 1: Package + landmark helpers

**Files:**
- Create: `package.json`
- Create: `stage0/js/landmarks.js`
- Create: `stage0/js/landmarks.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { averageVisibleY, IDX } from "./landmarks.js";

describe("averageVisibleY", () => {
  it("averages Y of visible landmarks", () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0 }));
    lm[IDX.LEFT_HIP] = { x: 0.4, y: 0.60, visibility: 0.9 };
    lm[IDX.RIGHT_HIP] = { x: 0.6, y: 0.64, visibility: 0.9 };
    assert.equal(averageVisibleY(lm, [IDX.LEFT_HIP, IDX.RIGHT_HIP], 0.5), 0.62);
  });

  it("returns null when all points are below visibility", () => {
    const lm = [{ x: 0, y: 0.5, visibility: 0.1 }];
    assert.equal(averageVisibleY(lm, [0], 0.5), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test stage0/js/landmarks.test.js`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

`landmarks.js` exports `IDX` and `averageVisibleY(landmarks, indices, minVis)`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (only if the user asked for commits)

---

### Task 2: MotionEngine

**Files:**
- Create: `stage0/js/motion-events.js`
- Create: `stage0/js/motion-events.test.js`

**Behavior:**
- `startCalibration(nowMs)` then `update(landmarks, nowMs)` for 1500 ms while in-frame; averages ankle Y (fallback hip Y) as `floorY`, shoulder Y as `standingShoulderY`, hip Y as `standingHipY`.
- EMA alpha default `0.35` on hip/shoulder/ankle Y.
- `jump` pulse when `standingHipY - smoothedHipY >= jumpThreshold` (default `0.06`) and `now - lastJump >= 400`.
- `ducking` while `smoothedShoulderY >= standingShoulderY + 0.30 * (floorY - standingShoulderY)` (shoulders dropped ~30% of standing torso span ≈ 70% remaining height).
- Ignore frame (`inFrame: false`) if hips or shoulders missing.

- [ ] **Step 1: Failing tests** covering calibration, jump cooldown, duck hold, out-of-frame.

- [ ] **Step 2: Implement `MotionEngine`**

- [ ] **Step 3: Tests PASS**

---

### Task 3: Jump the Wall game logic (no Canvas)

**Files:**
- Create: `stage0/js/game.js`
- Create: `stage0/js/game.test.js`

**Behavior:**
- Player hitboxes: standing tall, jumping (raised, still tall), ducking (short).
- `tall` obstacle collides unless `jumping`; `low` collides unless `ducking`.
- Score +1 when obstacle passes player without collision.
- Round length default 180_000 ms; `over` when elapsed ≥ duration or on hit (optional hit = rest immediately).
- Spec: hit ends the run and goes to rest (clear feedback for kids).

- [ ] Tests for jump-clears-tall, duck-clears-low, standing-hits-tall, standing-hits-low, score on pass, round timeout.

---

### Task 4: Camera, pose, overlay, UI

**Files:**
- Create remaining `stage0/` assets
- Modify: `README.md` (root) with run instructions

**Camera:** facingMode `user`, ideal 640×480.

**Pose:** `@mediapipe/tasks-vision@0.10.21` WASM + lite `.task` from Google storage, `runningMode: "VIDEO"`, `numPoses: 1`, GPU delegate with CPU fallback.

**UI screens:** start → calibrate → play → rest (score, avg FPS, play again). Debug toggle. Calibration copy: “Step back until your whole body is visible.”

**Privacy:** no upload; models load from CDN/Google storage (required for inference weights). Camera frames stay in-browser.

---

### Task 5: Verify

- [ ] `npm test` all green
- [ ] `npm start` → open `http://localhost:5173` → camera permission → play one round
- [ ] Keyboard fallback `ArrowUp` / `ArrowDown` for CI/demo without a body in frame (does not replace pose as primary input)

---

## Spec coverage

| Spec section | Task |
|--------------|------|
| Capture / front cam / 256px | Task 4 camera.js |
| Pose lite on-device | Task 4 pose.js |
| Jump / duck / EMA / gate / cooldown | Task 2 |
| Jump the Wall loop / UI / rounds | Tasks 3–4 |
| FPS overlay / debug skeleton | Task 4 overlay + HUD |
| No cloud of camera | Task 4 (no upload) |
| Tests listed in spec §7 | Task 5 + README checklist |
