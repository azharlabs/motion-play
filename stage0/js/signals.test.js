import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MotionSignals } from "./signals.js";
import { IDX } from "./landmarks.js";

/**
 * Build a landmark array. Coordinates are raw image space (not mirrored),
 * matching what MediaPipe hands back.
 */
function body({
  centerX = 0.5,
  shoulderW = 0.2,
  shoulderY = 0.32,
  hipY = 0.56,
  ankleY = 0.92,
  leftWrist = null,
  rightWrist = null,
  hips = true,
} = {}) {
  const pts = Array.from({ length: 33 }, () => ({ x: centerX, y: 0.5, visibility: 0.95 }));
  const put = (i, x, y, v = 0.95) => {
    pts[i] = { x, y, visibility: v };
  };
  put(IDX.NOSE, centerX, shoulderY - 0.12);
  put(IDX.LEFT_SHOULDER, centerX + shoulderW / 2, shoulderY);
  put(IDX.RIGHT_SHOULDER, centerX - shoulderW / 2, shoulderY);
  put(IDX.LEFT_HIP, centerX + shoulderW / 3, hipY, hips ? 0.95 : 0.05);
  put(IDX.RIGHT_HIP, centerX - shoulderW / 3, hipY, hips ? 0.95 : 0.05);
  put(IDX.LEFT_ANKLE, centerX + shoulderW / 3, ankleY, hips ? 0.95 : 0.05);
  put(IDX.RIGHT_ANKLE, centerX - shoulderW / 3, ankleY, hips ? 0.95 : 0.05);
  // Wrists default to resting by the hips.
  const lw = leftWrist ?? { x: centerX + shoulderW * 0.7, y: hipY };
  const rw = rightWrist ?? { x: centerX - shoulderW * 0.7, y: hipY };
  // Knuckles travel with the wrist, as a hand does.
  for (const i of [IDX.LEFT_WRIST, IDX.LEFT_INDEX, IDX.LEFT_PINKY]) put(i, lw.x, lw.y);
  for (const i of [IDX.RIGHT_WRIST, IDX.RIGHT_INDEX, IDX.RIGHT_PINKY]) put(i, rw.x, rw.y);
  return pts;
}

function calibrate(signals, pose = body(), ms = 2000) {
  signals.startCalibration(0);
  let last = null;
  for (let t = 0; t <= ms; t += 33) last = signals.update(pose, t);
  return last;
}

describe("MotionSignals framing", () => {
  it("calibrates a full-body player", () => {
    const s = new MotionSignals({ mode: "full" });
    const state = calibrate(s);
    assert.equal(state.calibrated, true);
    assert.equal(state.inFrame, true);
  });

  it("treats a player with no legs in shot as out of frame in full mode", () => {
    const s = new MotionSignals({ mode: "full" });
    calibrate(s);
    let state;
    for (let t = 2100; t < 2800; t += 33) state = s.update(body({ hips: false }), t);
    assert.equal(state.inFrame, false);
  });

  it("accepts the same player in upper mode, where legs are not needed", () => {
    const s = new MotionSignals({ mode: "upper" });
    const state = calibrate(s, body({ hips: false }));
    assert.equal(state.calibrated, true);
    assert.equal(state.inFrame, true);
  });

  it("rides out a single dropped frame", () => {
    const s = new MotionSignals({ mode: "upper" });
    calibrate(s);
    const dropped = s.update([], 2100);
    assert.equal(dropped.inFrame, true, "one bad frame should not drop tracking");
  });
});

describe("MotionSignals lean", () => {
  it("reads zero when standing where you calibrated", () => {
    const s = new MotionSignals({ mode: "full" });
    const state = calibrate(s);
    assert.ok(Math.abs(state.lean) < 0.05, `lean was ${state.lean}`);
  });

  it("goes positive when you move to your right", () => {
    const s = new MotionSignals({ mode: "full" });
    calibrate(s);
    // The player's right is a smaller raw x, which mirrors to a larger screen x.
    let state;
    for (let t = 2100; t < 2600; t += 33) {
      state = s.update(body({ centerX: 0.4 }), t);
    }
    assert.ok(state.lean > 0.4, `expected a clear right lean, got ${state.lean}`);
  });

  it("goes negative when you move to your left", () => {
    const s = new MotionSignals({ mode: "full" });
    calibrate(s);
    let state;
    for (let t = 2100; t < 2600; t += 33) {
      state = s.update(body({ centerX: 0.6 }), t);
    }
    assert.ok(state.lean < -0.4, `expected a clear left lean, got ${state.lean}`);
  });

  it("reads the same lean whether you stand near or far", () => {
    const near = new MotionSignals({ mode: "full" });
    calibrate(near, body({ shoulderW: 0.3 }));
    const far = new MotionSignals({ mode: "full" });
    calibrate(far, body({ shoulderW: 0.15 }));

    let n, f;
    for (let t = 2100; t < 2600; t += 33) {
      // Same lean expressed as a fraction of each body's own shoulder width.
      n = near.update(body({ shoulderW: 0.3, centerX: 0.5 - 0.3 * 0.5 }), t);
      f = far.update(body({ shoulderW: 0.15, centerX: 0.5 - 0.15 * 0.5 }), t);
    }
    assert.ok(Math.abs(n.lean - f.lean) < 0.12, `near ${n.lean} vs far ${f.lean}`);
  });
});

describe("MotionSignals hands", () => {
  it("mirrors the wrists so your right hand is on the right of the screen", () => {
    const s = new MotionSignals({ mode: "upper" });
    const state = calibrate(
      s,
      body({
        // Player's right wrist raised: small raw x.
        rightWrist: { x: 0.2, y: 0.3 },
        leftWrist: { x: 0.8, y: 0.3 },
      }),
    );
    assert.ok(state.hands.right.x > 0.6, `right hand at ${state.hands.right.x}`);
    assert.ok(state.hands.left.x < 0.4, `left hand at ${state.hands.left.x}`);
  });

  /*
   * A hand that stops being reported has usually just moved too fast to
   * photograph, and that happens mid-swing — so it is held briefly rather than
   * dropped, or the games lose the hit at the moment of contact.
   */
  it("holds on to a hand that blurs out of tracking for a moment", () => {
    const s = new MotionSignals({ mode: "upper" });
    calibrate(s);
    const lost = body();
    for (const i of [IDX.LEFT_WRIST, IDX.LEFT_INDEX, IDX.LEFT_PINKY]) {
      lost[i] = { x: 0.8, y: 0.3, visibility: 0.05 };
    }
    const state = s.update(lost, 2060);
    assert.equal(state.hands.left.visible, true);
    assert.equal(state.hands.right.visible, true);
  });

  it("keeps the speed of a hand it is holding, so a swing still reads as one", () => {
    const s = new MotionSignals({ mode: "upper" });
    calibrate(s);
    let moving = null;
    for (let t = 2000, x = 0.3; t < 2200; t += 33, x += 0.05) {
      moving = s.update(body({ leftWrist: { x, y: 0.35 } }), t);
    }
    const swinging = moving.hands.left.speed;
    assert.ok(swinging > 1, `expected a swing, got ${swinging}`);

    const lost = body();
    for (const i of [IDX.LEFT_WRIST, IDX.LEFT_INDEX, IDX.LEFT_PINKY]) {
      lost[i] = { x: 0.8, y: 0.35, visibility: 0.05 };
    }
    const held = s.update(lost, 2233);
    assert.equal(held.hands.left.speed, swinging);
  });

  it("lets go of a hand that stays out of tracking", () => {
    const s = new MotionSignals({ mode: "upper" });
    calibrate(s);
    const lost = body();
    for (const i of [IDX.LEFT_WRIST, IDX.LEFT_INDEX, IDX.LEFT_PINKY]) {
      lost[i] = { x: 0.8, y: 0.3, visibility: 0.05 };
    }
    let state = null;
    for (let t = 2033; t <= 2600; t += 33) state = s.update(lost, t);
    assert.equal(state.hands.left.visible, false);
    assert.equal(state.hands.right.visible, true);
  });

  it("registers speed for a fast swipe and near zero when still", () => {
    const s = new MotionSignals({ mode: "upper" });
    calibrate(s);

    // Let the filter settle after the hand moves into position.
    let still;
    for (let t = 2100; t < 3600; t += 33) {
      still = s.update(body({ rightWrist: { x: 0.3, y: 0.4 } }), t);
    }
    assert.ok(still.hands.right.speed < 1, `still hand moving at ${still.hands.right.speed}`);

    let swiped;
    for (let i = 0; i < 6; i += 1) {
      const x = 0.3 + i * 0.08;
      swiped = s.update(body({ rightWrist: { x, y: 0.4 } }), 3600 + i * 33);
    }
    assert.ok(swiped.hands.right.speed > 3, `swipe read only ${swiped.hands.right.speed}`);
  });
});

describe("MotionSignals crouch", () => {
  it("rises towards 1 as you squat and returns to 0 standing", () => {
    const s = new MotionSignals({ mode: "full" });
    calibrate(s);

    let low;
    for (let t = 2100; t < 2800; t += 33) {
      low = s.update(body({ shoulderY: 0.44, hipY: 0.62 }), t);
    }
    assert.ok(low.crouch > 0.2, `crouch only reached ${low.crouch}`);

    let up;
    for (let t = 2800; t < 3600; t += 33) up = s.update(body(), t);
    assert.ok(up.crouch < 0.1, `crouch stuck at ${up.crouch}`);
  });
});
