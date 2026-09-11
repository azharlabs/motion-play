import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, POSES } from "./pose-match.js";
import { VIEW, fxSpy, hand, noHand, signals } from "./test-support.js";

const SHOULDER = { x: 0.5, y: 0.35, width: 0.2 };

/** Signals with the wrists placed exactly on a pose's target offsets. */
function posing(target, { drift = 0, shoulder = SHOULDER } = {}) {
  const place = (t) =>
    hand(shoulder.x + (t.dx + drift) * shoulder.width, shoulder.y + t.dy * shoulder.width);
  return signals({
    shoulder,
    hands: { left: place(target.left), right: place(target.right) },
  });
}

function hold(game, s, ms, from = 0) {
  let now = from;
  let last = null;
  for (let t = 0; t < ms; t += 33) {
    now += 33;
    last = game.tick(0.033, s, now, VIEW);
  }
  return { last, now };
}

describe("Pose Match feedback", () => {
  it("confirms the shape is right before the hold has finished", () => {
    const fx = fxSpy();
    const g = createGame({ fx, holdMs: 700 });
    g.start(0);
    hold(g, posing(g.target), 200);
    assert.equal(g.score, 0, "not locked in yet");
    assert.equal(fx.played("chime"), true, "you should hear that you found it");
  });

  it("locks in with a chord and a burst", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    hold(g, posing(g.target), 900);
    assert.equal(fx.played("lock"), true);
    assert.ok(g.particles.length > 0);
  });

  it("does not re-announce the shape on every frame you hold it", () => {
    const fx = fxSpy();
    const g = createGame({ fx, holdMs: 5000 });
    g.start(0);
    hold(g, posing(g.target), 900);
    assert.equal(fx.cues.filter((c) => c === "chime").length, 1);
  });
});

describe("Pose Match scoring", () => {
  it("scores once you hold the right shape", () => {
    const g = createGame();
    g.start(0);
    hold(g, posing(g.target), 900);
    assert.equal(g.score, 1);
  });

  it("does not score for a shape held too briefly", () => {
    const g = createGame({ holdMs: 700 });
    g.start(0);
    hold(g, posing(g.target), 200);
    assert.equal(g.score, 0);
  });

  it("does not score the wrong shape", () => {
    const g = createGame();
    g.start(0);
    hold(g, posing(g.target, { drift: 2.5 }), 1500);
    assert.equal(g.score, 0);
  });

  it("moves on to a different pose after a match", () => {
    const g = createGame();
    g.start(0);
    const first = g.target.name;
    hold(g, posing(g.target), 900);
    assert.notEqual(g.target.name, first);
  });

  it("forgives a brief wobble mid-hold", () => {
    const g = createGame({ holdMs: 700 });
    g.start(0);
    const good = posing(g.target);
    const { now } = hold(g, good, 500);
    const wobbled = hold(g, posing(g.target, { drift: 3 }), 66, now);
    hold(g, good, 400, wobbled.now);
    assert.equal(g.score, 1, "one bad frame should not reset the hold");
  });
});

describe("Pose Match timing", () => {
  it("costs a life when the pose times out", () => {
    const g = createGame({ timeLimitMs: 300, fastestLimitMs: 300 });
    g.start(0);
    // The expiry lands on one tick partway through, so check the game state
    // rather than the final tick's result.
    hold(g, signals(), 400);
    assert.equal(g.missed, 1);
    assert.equal(g.lives, 2);
  });

  it("ends the round when the last life goes", () => {
    const g = createGame({ lives: 1, timeLimitMs: 300, fastestLimitMs: 300 });
    g.start(0);
    const { last } = hold(g, signals(), 500);
    assert.equal(last.over, true);
  });

  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    assert.equal(g.tick(0.016, signals(), 1000, VIEW).over, true);
  });
});

describe("Pose Match geometry", () => {
  it("reads the same pose near and far from the camera", () => {
    const target = POSES[0];
    const near = posing(target, { shoulder: { x: 0.5, y: 0.35, width: 0.32 } });
    const far = posing(target, { shoulder: { x: 0.4, y: 0.3, width: 0.12 } });
    const g = createGame();
    const errNear = g.constructor.error(g.constructor.offsets(near), target);
    const errFar = g.constructor.error(g.constructor.offsets(far), target);
    assert.ok(errNear < 0.01 && errFar < 0.01, `near ${errNear}, far ${errFar}`);
  });

  it("gives up when a wrist is not tracked", () => {
    const g = createGame();
    const s = signals({ hands: { left: noHand, right: hand(0.6, 0.4) } });
    assert.equal(g.constructor.offsets(s), null);
  });

  it("gives up when the shoulders are not readable", () => {
    const g = createGame();
    const s = signals({ shoulder: null, hands: { left: hand(0.3, 0.4), right: hand(0.7, 0.4) } });
    assert.equal(g.constructor.offsets(s), null);
  });

  it("keeps every pose reachable within arm's length", () => {
    for (const pose of POSES) {
      for (const side of ["left", "right"]) {
        const reach = Math.hypot(pose[side].dx, pose[side].dy);
        assert.ok(reach < 2.1, `${pose.name} ${side} wrist is ${reach} shoulder widths out`);
      }
    }
  });
});
