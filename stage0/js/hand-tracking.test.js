import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MotionSignals, leadHands } from "./signals.js";
import { IDX } from "./landmarks.js";

/**
 * How closely the reported hand follows the real one.
 *
 * The hand games live or die on this: Balloon Pop and Goalkeeper need the
 * reported position to be where the hand actually is, and Punch Out and Fruit
 * Slice need a fast movement to register as fast while it is still happening.
 * Both are measured here against a synthetic hand moving at a known speed, so
 * a regression in the smoothing shows up as a number rather than as a feeling.
 */

const SHOULDER_W = 0.2;

/** A body with one wrist placed exactly where we say. */
function poseWithHand(x, y) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  const put = (i, px, py) => {
    pts[i] = { x: px, y: py, visibility: 0.95 };
  };
  put(IDX.NOSE, 0.5, 0.2);
  put(IDX.LEFT_SHOULDER, 0.5 + SHOULDER_W / 2, 0.32);
  put(IDX.RIGHT_SHOULDER, 0.5 - SHOULDER_W / 2, 0.32);
  put(IDX.LEFT_HIP, 0.57, 0.56);
  put(IDX.RIGHT_HIP, 0.43, 0.56);
  put(IDX.LEFT_ANKLE, 0.57, 0.92);
  put(IDX.RIGHT_ANKLE, 0.43, 0.92);
  // Knuckles sit with the wrist, so these tests measure the smoothing rather
  // than the offset between the wrist and the middle of the hand.
  for (const i of [IDX.LEFT_WRIST, IDX.LEFT_INDEX, IDX.LEFT_PINKY]) put(i, x, y);
  for (const i of [IDX.RIGHT_WRIST, IDX.RIGHT_INDEX, IDX.RIGHT_PINKY]) put(i, 0.43, 0.56);
  return pts;
}

/** Settle calibration with the hand parked, then return the signal object. */
function ready(fps = 30) {
  const s = new MotionSignals({ mode: "upper" });
  s.startCalibration(0);
  const step = 1000 / fps;
  for (let t = 0; t <= 2000; t += step) s.update(poseWithHand(0.5, 0.5), t);
  return { s, step, from: 2000 };
}

/**
 * Sweep the hand sideways at a steady speed and report how far behind the
 * reported position ends up, in fractions of the screen.
 */
function sweepLag({ fps = 30, speed = 1.2, ms = 500 } = {}) {
  const { s, step, from } = ready(fps);
  let t = from;
  let truth = 0.5;
  let state = null;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    t += step;
    truth += speed * (step / 1000);
    state = s.update(poseWithHand(truth, 0.5), t);
  }
  // Wrists are mirrored into display space, so compare against the mirror.
  return Math.abs(state.hands.left.x - (1 - truth));
}

/** Throw a punch lasting `ms` and report the peak speed the games would see. */
function punchPeak({ fps = 30, distance = 0.3, ms = 150 } = {}) {
  const { s, step, from } = ready(fps);
  let t = from;
  let peak = 0;
  const frames = Math.max(1, Math.round(ms / step));
  for (let i = 1; i <= frames; i += 1) {
    t += step;
    const state = s.update(poseWithHand(0.5 + (distance * i) / frames, 0.5), t);
    peak = Math.max(peak, state.hands.left.speed);
  }
  return peak;
}

/** What that punch's speed truly is, in the units the games threshold on. */
const trueSpeed = (distance, ms) => distance / (ms / 1000) / SHOULDER_W;

describe("Hand position keeps up with the hand", () => {
  it("stays close while sweeping at a normal reaching speed", () => {
    const lag = sweepLag({ speed: 1.2 });
    // A balloon is about 5% of the screen across. Well inside that, or you are
    // reaching for what you can see and missing it.
    assert.ok(lag < 0.025, `reported hand was ${(lag * 100).toFixed(1)}% of the screen behind`);
  });

  it("stays close during a fast swipe", () => {
    const lag = sweepLag({ speed: 2.5 });
    assert.ok(lag < 0.035, `reported hand was ${(lag * 100).toFixed(1)}% of the screen behind`);
  });

  it("does not fall apart when the camera is only managing 15fps", () => {
    const lag = sweepLag({ fps: 15, speed: 1.2 });
    assert.ok(lag < 0.035, `reported hand was ${(lag * 100).toFixed(1)}% of the screen behind`);
  });

  it("sits still when the hand sits still", () => {
    const { s, step, from } = ready();
    let t = from;
    let worst = 0;
    for (let i = 0; i < 60; i += 1) {
      t += step;
      // A tenth of a percent of jitter, which is about what pose gives you.
      const state = s.update(poseWithHand(0.5 + (i % 2 ? 0.001 : -0.001), 0.5), t);
      worst = Math.max(worst, Math.abs(state.hands.left.x - 0.5));
    }
    assert.ok(worst < 0.004, `jitter of ${(worst * 100).toFixed(2)}% got through`);
  });
});

describe("Making up for how old a reading is", () => {
  const moving = () => ({
    hands: {
      left: { x: 0.4, y: 0.5, vx: 1.2, vy: 0, visible: true },
      right: { x: 0.6, y: 0.5, vx: 0, vy: 0, visible: false },
    },
  });

  it("leaves a fresh reading alone", () => {
    assert.equal(leadHands(moving(), 0).hands.left.x, 0.4);
  });

  it("carries a moving hand forward by the age of the reading", () => {
    // Moving at 1.2 per second, 50ms stale, so 0.06 further along.
    assert.ok(Math.abs(leadHands(moving(), 50).hands.left.x - 0.46) < 1e-9);
  });

  it("refuses to guess too far ahead on a very stale reading", () => {
    const far = leadHands(moving(), 500).hands.left.x;
    assert.ok(far < 0.48, `extrapolated all the way to ${far}`);
  });

  it("leaves a hand it cannot see alone", () => {
    assert.equal(leadHands(moving(), 50).hands.right.x, 0.6);
  });

  it("keeps the hand on the screen", () => {
    const state = { hands: { left: { x: 0.98, y: 0.5, vx: 9, vy: 0, visible: true } } };
    assert.equal(leadHands(state, 60).hands.left.x, 1);
  });

  it("cancels the delay a worker adds", () => {
    // A hand really at 0.5, read 33ms ago when it was at 0.46, moving at 1.2.
    const stale = { hands: { left: { x: 0.46, y: 0.5, vx: 1.2, vy: 0, visible: true } } };
    const shown = leadHands(stale, 33).hands.left.x;
    assert.ok(Math.abs(shown - 0.5) < 0.005, `showed ${shown.toFixed(3)} instead of 0.5`);
  });
});

describe("A fast movement reads as fast", () => {
  it("reports most of a punch's real speed while it is happening", () => {
    const real = trueSpeed(0.3, 150);
    const seen = punchPeak({ distance: 0.3, ms: 150 });
    assert.ok(seen > real * 0.85, `punch was ${real.toFixed(1)} but read as ${seen.toFixed(1)}`);
  });

  it("reads a punch honestly even when tracking is slow", () => {
    const real = trueSpeed(0.3, 150);
    const seen = punchPeak({ fps: 15, distance: 0.3, ms: 150 });
    assert.ok(seen > real * 0.8, `punch was ${real.toFixed(1)} but read as ${seen.toFixed(1)}`);
  });

  it("clears the punch threshold the games actually use", () => {
    assert.ok(punchPeak({ distance: 0.3, ms: 150 }) > 1.9, "Punch Out would not register it");
  });

  it("clears the slice threshold on a quick swipe", () => {
    assert.ok(punchPeak({ distance: 0.35, ms: 180 }) > 2.2, "Fruit Slice would not register it");
  });

  it("still registers a punch at 15fps", () => {
    assert.ok(punchPeak({ fps: 15, distance: 0.3, ms: 150 }) > 1.9, "too slow to see a punch");
  });

  it("does not call a resting hand fast", () => {
    const { s, step, from } = ready();
    let t = from;
    let worst = 0;
    for (let i = 0; i < 60; i += 1) {
      t += step;
      const state = s.update(poseWithHand(0.5 + (i % 2 ? 0.002 : -0.002), 0.5), t);
      worst = Math.max(worst, state.hands.left.speed);
    }
    assert.ok(worst < 1.9, `a still hand read as ${worst.toFixed(2)} and would throw punches`);
  });
});
