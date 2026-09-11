import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hand, noHand, signals, run, VIEW } from "./test-support.js";
import { createGame as squatRush } from "./squat-rush.js";
import { createGame as punchOut } from "./punch-out.js";
import { createGame as fruitSlice } from "./fruit-slice.js";
import { createGame as laneRunner } from "./lane-runner.js";
import { createGame as skiSlalom } from "./ski-slalom.js";
import { createGame as skyFlap } from "./sky-flap.js";

/**
 * These check the movement counting itself, not the plumbing: that a body
 * doing the thing produces a number, and a body doing nothing does not.
 */

const started = (make, opts = {}) => {
  const g = make(opts);
  g.start(0);
  return g;
};

/** Hold one posture, then another, as a person actually would. */
function alternate(game, a, b, cycles, msEach = 400) {
  let now = 0;
  for (let i = 0; i < cycles; i += 1) {
    ({ now } = run(game, a, { ms: msEach, from: now }));
    ({ now } = run(game, b, { ms: msEach, from: now }));
  }
  return now;
}

describe("Squat Rush counts squats", () => {
  it("counts one per time you go down", () => {
    const g = started(squatRush);
    alternate(g, signals({ crouch: 0.9 }), signals({ crouch: 0 }), 3);
    assert.equal(g.summary().actions.squat, 3);
  });

  it("counts nothing while you stand there", () => {
    const g = started(squatRush);
    run(g, signals({ crouch: 0 }), { ms: 4000 });
    assert.equal(g.summary().actions.squat ?? 0, 0);
  });

  it("does not count the same squat twice for holding it", () => {
    const g = started(squatRush);
    run(g, signals({ crouch: 0.9 }), { ms: 5000 });
    assert.equal(g.summary().actions.squat, 1);
  });
});

describe("Punch Out counts punches", () => {
  const fast = (speed) => signals({ hands: { left: hand(0.3, 0.4, speed) } });

  it("counts a fast hand as a punch", () => {
    const g = started(punchOut);
    alternate(g, fast(4), fast(0), 3, 200);
    assert.equal(g.summary().actions.punch, 3);
  });

  it("counts a punch that missed the pad", () => {
    const g = started(punchOut, { hitRadius: 0.001 });
    alternate(g, fast(4), fast(0), 2, 200);
    assert.equal(g.summary().actions.punch, 2, "the swing still happened");
  });

  it("ignores a hand drifting slowly", () => {
    const g = started(punchOut);
    run(g, fast(0.4), { ms: 3000 });
    assert.equal(g.summary().actions.punch ?? 0, 0);
  });
});

describe("Fruit Slice counts swipes", () => {
  const swing = (speed) => signals({ hands: { right: hand(0.5, 0.5, speed) } });

  it("counts each swing of the arm", () => {
    const g = started(fruitSlice);
    alternate(g, swing(5), swing(0), 4, 200);
    assert.equal(g.summary().actions.swipe, 4);
  });

  it("counts swings through empty air", () => {
    const g = started(fruitSlice, { spawnEvery: 999 });
    alternate(g, swing(5), swing(0), 2, 200);
    assert.equal(g.summary().actions.swipe, 2);
  });

  it("counts both arms", () => {
    const g = started(fruitSlice);
    const both = (speed) =>
      signals({ hands: { left: hand(0.3, 0.5, speed), right: hand(0.7, 0.5, speed) } });
    alternate(g, both(5), both(0), 2, 200);
    assert.equal(g.summary().actions.swipe, 4);
  });

  it("ignores a hand that is barely moving", () => {
    const g = started(fruitSlice);
    run(g, swing(0.3), { ms: 3000 });
    assert.equal(g.summary().actions.swipe ?? 0, 0);
  });
});

describe("Lane Runner counts weight shifts", () => {
  it("counts a lean each time you change lane", () => {
    const g = started(laneRunner);
    alternate(g, signals({ lean: -1 }), signals({ lean: 1 }), 2, 500);
    // left, back through middle, right, middle, left, middle, right
    assert.ok(g.summary().actions.lean >= 4, `only ${g.summary().actions.lean}`);
  });

  it("counts nothing while you run straight", () => {
    const g = started(laneRunner);
    run(g, signals({ lean: 0 }), { ms: 4000 });
    assert.equal(g.summary().actions.lean ?? 0, 0);
  });
});

describe("Ski Slalom counts carves", () => {
  it("counts a carve to each side", () => {
    const g = started(skiSlalom);
    alternate(g, signals({ lean: -1 }), signals({ lean: 1 }), 2, 400);
    assert.ok(g.summary().actions.lean >= 3, `only ${g.summary().actions.lean}`);
  });

  it("does not count holding one lean forever", () => {
    const g = started(skiSlalom);
    run(g, signals({ lean: 1 }), { ms: 6000 });
    assert.equal(g.summary().actions.lean, 1);
  });
});

describe("Sky Flap counts arm raises", () => {
  const arms = (y) => signals({ hands: { left: hand(0.4, y), right: hand(0.6, y) } });

  it("counts a raise each time the hands go up", () => {
    const g = started(skyFlap);
    alternate(g, arms(0.1), arms(0.9), 3, 300);
    assert.equal(g.summary().actions.raise, 3);
  });

  it("counts nothing with the arms left hanging", () => {
    const g = started(skyFlap);
    run(g, arms(0.9), { ms: 4000 });
    assert.equal(g.summary().actions.raise ?? 0, 0);
  });

  it("ignores frames where the hands are not visible", () => {
    const g = started(skyFlap);
    run(g, signals({ hands: { left: noHand, right: noHand } }), { ms: 3000, view: VIEW });
    assert.equal(g.summary().actions.raise ?? 0, 0);
  });
});
