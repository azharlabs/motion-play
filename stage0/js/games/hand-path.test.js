import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distanceToPath, HandPaths } from "./common.js";
import { VIEW, hand, noHand, signals } from "./test-support.js";

const at = (x, y) => ({ x, y });

describe("Distance to a swept path", () => {
  it("measures from the line, not from its ends", () => {
    // A point beside the middle of a long horizontal sweep.
    assert.equal(distanceToPath(at(0, 0), at(100, 0), 50, 10), 10);
  });

  it("does not credit a point beyond either end", () => {
    assert.equal(distanceToPath(at(0, 0), at(100, 0), 130, 0), 30);
    assert.equal(distanceToPath(at(0, 0), at(100, 0), -30, 0), 30);
  });

  it("falls back to plain distance when the hand did not move", () => {
    assert.equal(distanceToPath(at(40, 40), at(40, 40), 40, 70), 30);
  });
});

describe("Tracking where the hands have been", () => {
  const seen = (paths, side) => paths.find((p) => p.side === side);

  it("sweeps nothing the first time it sees a hand", () => {
    const paths = new HandPaths();
    const [left] = paths.update(VIEW, signals({ hands: { left: hand(0.3, 0.4) } }), 100);
    assert.deepEqual(left.from, left.to);
  });

  it("joins this frame to the last one", () => {
    const paths = new HandPaths();
    paths.update(VIEW, signals({ hands: { left: hand(0.2, 0.5) } }), 100);
    const [left] = paths.update(VIEW, signals({ hands: { left: hand(0.8, 0.5) } }), 116);
    assert.equal(left.from.x, VIEW.poseX(0.2));
    assert.equal(left.to.x, VIEW.poseX(0.8));
  });

  it("hands over the reading itself, for games that need the speed", () => {
    const paths = new HandPaths();
    const [left] = paths.update(VIEW, signals({ hands: { left: hand(0.2, 0.5, 4) } }), 100);
    assert.equal(left.hand.speed, 4);
  });

  it("leaves out a hand the camera has lost", () => {
    const paths = new HandPaths();
    const out = paths.update(VIEW, signals({ hands: { left: hand(0.2, 0.5), right: noHand } }), 100);
    assert.equal(out.length, 1);
    assert.equal(seen(out, "right"), undefined);
  });

  /*
   * The guards below are what stop a swept test from being a cheat. A line
   * drawn from wherever a hand was last seen minutes ago would cross half the
   * screen and take everything on it with it.
   */
  it("does not draw a line across the gap while a hand was missing", () => {
    const paths = new HandPaths();
    paths.update(VIEW, signals({ hands: { left: hand(0.1, 0.1) } }), 100);
    paths.update(VIEW, signals({ hands: { left: noHand } }), 116);
    const [left] = paths.update(VIEW, signals({ hands: { left: hand(0.9, 0.9) } }), 132);
    assert.deepEqual(left.from, left.to);
  });

  it("does not draw a line across a pause", () => {
    const paths = new HandPaths();
    paths.update(VIEW, signals({ hands: { left: hand(0.1, 0.1) } }), 100);
    const [left] = paths.update(VIEW, signals({ hands: { left: hand(0.9, 0.9) } }), 5000);
    assert.deepEqual(left.from, left.to);
  });

  it("forgets everything when a game resets it", () => {
    const paths = new HandPaths();
    paths.update(VIEW, signals({ hands: { left: hand(0.1, 0.1) } }), 100);
    paths.reset();
    const [left] = paths.update(VIEW, signals({ hands: { left: hand(0.9, 0.9) } }), 116);
    assert.deepEqual(left.from, left.to);
  });
});
