import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MotionEngine } from "./motion-events.js";
import { IDX } from "./landmarks.js";

/**
 * Builds a body centred on `hipY` with a torso of `torso` (shoulder-to-hip).
 * A smaller torso simulates a player standing further from the camera.
 */
function body({ hipY, torso, legs = 0.35, vis = 0.95 }) {
  const shoulderY = hipY - torso;
  const ankleY = hipY + legs;
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: hipY, visibility: vis }));
  lm[IDX.NOSE] = { x: 0.5, y: shoulderY - torso * 0.45, visibility: vis };
  lm[IDX.LEFT_SHOULDER] = { x: 0.42, y: shoulderY, visibility: vis };
  lm[IDX.RIGHT_SHOULDER] = { x: 0.58, y: shoulderY, visibility: vis };
  lm[IDX.LEFT_HIP] = { x: 0.45, y: hipY, visibility: vis };
  lm[IDX.RIGHT_HIP] = { x: 0.55, y: hipY, visibility: vis };
  lm[IDX.LEFT_ANKLE] = { x: 0.45, y: ankleY, visibility: vis };
  lm[IDX.RIGHT_ANKLE] = { x: 0.55, y: ankleY, visibility: vis };
  return lm;
}

function calibrate(engine, pose, t0 = 0) {
  engine.startCalibration(t0);
  let last;
  for (let t = t0; t <= t0 + 1700; t += 33) last = engine.update(pose, t);
  return last;
}

describe("MotionEngine calibration", () => {
  it("captures floor, standing pose and torso scale", () => {
    const engine = new MotionEngine();
    const last = calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    assert.equal(last.calibrated, true);
    assert.ok(Math.abs(last.debug.floorY - 0.9) < 0.01);
    assert.ok(Math.abs(last.debug.standingHipY - 0.55) < 0.01);
    assert.ok(Math.abs(last.debug.torso - 0.22) < 0.01);
  });
});

describe("MotionEngine jump", () => {
  it("fires when the hips rise past the calibrated threshold", () => {
    const engine = new MotionEngine();
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    let jumped = false;
    for (let t = 1800; t <= 1950 && !jumped; t += 33) {
      jumped = engine.update(body({ hipY: 0.45, torso: 0.22 }), t).jump;
    }
    assert.equal(jumped, true);
  });

  it("does not fire from ordinary standing sway", () => {
    const engine = new MotionEngine();
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    let jumped = false;
    for (let t = 1800; t <= 2600; t += 33) {
      const wobble = 0.55 + Math.sin(t / 120) * 0.008;
      if (engine.update(body({ hipY: wobble, torso: 0.22 }), t).jump) jumped = true;
    }
    assert.equal(jumped, false);
  });

  it("detects the same jump when the player stands further away", () => {
    const near = new MotionEngine();
    const far = new MotionEngine();
    calibrate(near, body({ hipY: 0.55, torso: 0.24, legs: 0.36 }));
    calibrate(far, body({ hipY: 0.55, torso: 0.12, legs: 0.18 }));

    // Both rise by the same fraction of their own torso length.
    let nearJump = false;
    let farJump = false;
    for (let t = 1800; t <= 1950; t += 33) {
      if (near.update(body({ hipY: 0.55 - 0.24 * 0.4, torso: 0.24, legs: 0.36 }), t).jump) {
        nearJump = true;
      }
      if (far.update(body({ hipY: 0.55 - 0.12 * 0.4, torso: 0.12, legs: 0.18 }), t).jump) {
        farJump = true;
      }
    }
    assert.equal(nearJump, true);
    assert.equal(farJump, true, "far player jump must not be missed");
  });

  it("respects the cooldown so one hop is one jump", () => {
    const engine = new MotionEngine({ jumpCooldownMs: 300 });
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    let count = 0;
    for (let t = 1800; t <= 2000; t += 33) {
      if (engine.update(body({ hipY: 0.44, torso: 0.22 }), t).jump) count += 1;
    }
    assert.equal(count, 1);
  });

  it("fires once even when the hips stay high, instead of repeating", () => {
    const engine = new MotionEngine();
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    let count = 0;
    for (let t = 1800; t <= 3000; t += 33) {
      if (engine.update(body({ hipY: 0.44, torso: 0.22 }), t).jump) count += 1;
    }
    assert.equal(count, 1, "a held-high pose must not machine-gun jumps");
  });

  it("re-arms only after the player comes back down", () => {
    const engine = new MotionEngine();
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    let count = 0;
    const hop = (from, to) => {
      for (let i = 0; i < 6; i += 1) {
        count += engine.update(body({ hipY: to, torso: 0.22 }), from + i * 33).jump ? 1 : 0;
      }
    };
    hop(1800, 0.44);
    hop(2100, 0.55);
    hop(2400, 0.44);
    assert.equal(count, 2, "two hops with a landing between them");
  });

  it("does not fire on the way down", () => {
    const engine = new MotionEngine();
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    // Start already at the top so the only motion is downward.
    for (let t = 1800; t <= 1900; t += 33) engine.update(body({ hipY: 0.40, torso: 0.22 }), t);
    let count = 0;
    for (let t = 1933; t <= 2200; t += 33) {
      const hipY = 0.4 + (t - 1933) / 267 * 0.14;
      if (engine.update(body({ hipY, torso: 0.22 }), t).jump) count += 1;
    }
    assert.equal(count, 0, "descending through the line must not trigger a jump");
  });

  it("recovers when calibration was captured in the wrong stance", () => {
    // Calibrated while crouched, so standing looks like a permanent jump.
    const engine = new MotionEngine({ stuckRecoveryMs: 1200 });
    calibrate(engine, body({ hipY: 0.7, torso: 0.14 }));

    let count = 0;
    for (let t = 1800; t <= 4500; t += 33) {
      if (engine.update(body({ hipY: 0.55, torso: 0.22 }), t).jump) count += 1;
    }
    assert.ok(count <= 2, `baseline should self-correct, got ${count} jumps`);

    // And a real jump still works afterwards.
    let later = false;
    for (let t = 4600; t <= 4800; t += 33) {
      if (engine.update(body({ hipY: 0.44, torso: 0.22 }), t).jump) later = true;
    }
    assert.equal(later, true, "a genuine jump must still register after recovery");
  });
});

describe("MotionEngine duck", () => {
  it("holds through hysteresis instead of flickering at the boundary", () => {
    const engine = new MotionEngine();
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));

    let state = false;
    for (let t = 1800; t <= 2000; t += 33) {
      state = engine.update(body({ hipY: 0.72, torso: 0.14 }), t).ducking;
    }
    assert.equal(state, true, "deep crouch should duck");

    // Settle between the exit and enter thresholds: must stay ducked.
    for (let t = 2033; t <= 2400; t += 33) {
      state = engine.update(body({ hipY: 0.56, torso: 0.168 }), t).ducking;
    }
    assert.equal(state, true, "should not flicker off near the boundary");

    for (let t = 2433; t <= 2800; t += 33) {
      state = engine.update(body({ hipY: 0.55, torso: 0.22 }), t).ducking;
    }
    assert.equal(state, false, "standing up should clear duck");
  });
});

describe("MotionEngine tracking loss", () => {
  it("rides out a single dropped frame", () => {
    const engine = new MotionEngine();
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    const dropped = engine.update([], 1800);
    assert.equal(dropped.inFrame, true, "one bad frame should not blank the player");
  });

  it("reports out of frame once tracking is lost for longer than the grace window", () => {
    const engine = new MotionEngine({ trackingGraceMs: 250 });
    calibrate(engine, body({ hipY: 0.55, torso: 0.22 }));
    let state;
    for (let t = 1800; t <= 2300; t += 50) state = engine.update([], t);
    assert.equal(state.inFrame, false);
    assert.equal(state.jump, false);
    assert.equal(state.ducking, false);
  });
});
