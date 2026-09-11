import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IDX, handPoint } from "./landmarks.js";

/** A body where only the hand landmarks matter. */
function withHand(parts) {
  const pts = Array.from({ length: 33 }, () => null);
  for (const [idx, p] of Object.entries(parts)) pts[idx] = p;
  return pts;
}

const at = (x, y, visibility = 0.9) => ({ x, y, visibility });

describe("Finding the hand rather than the wrist", () => {
  it("sits between the wrist and the knuckles", () => {
    const pts = withHand({
      [IDX.LEFT_WRIST]: at(0.5, 0.5),
      [IDX.LEFT_INDEX]: at(0.6, 0.5),
      [IDX.LEFT_PINKY]: at(0.6, 0.5),
    });
    const p = handPoint(pts, "left");
    assert.ok(Math.abs(p.x - 0.55) < 1e-9, `expected 0.55, got ${p.x}`);
  });

  it("moves the point out towards where you are aiming", () => {
    // An arm punched out to the side: the knuckles lead the wrist.
    const pts = withHand({
      [IDX.RIGHT_WRIST]: at(0.8, 0.4),
      [IDX.RIGHT_INDEX]: at(0.88, 0.4),
      [IDX.RIGHT_PINKY]: at(0.86, 0.42),
    });
    const p = handPoint(pts, "right");
    assert.ok(p.x > 0.8, "the hand is further out than the wrist");
    assert.ok(p.x < 0.88, "but not out at the fingertips");
  });

  it("steadies the reading by averaging three landmarks", () => {
    // The knuckles disagree in opposite directions, as noise does.
    const pts = withHand({
      [IDX.LEFT_WRIST]: at(0.5, 0.5),
      [IDX.LEFT_INDEX]: at(0.56, 0.5),
      [IDX.LEFT_PINKY]: at(0.44, 0.5),
    });
    assert.ok(Math.abs(handPoint(pts, "left").x - 0.5) < 1e-9, "the noise should cancel");
  });

  it("falls back to the wrist when the fingers cannot be seen", () => {
    const pts = withHand({
      [IDX.LEFT_WRIST]: at(0.5, 0.5),
      [IDX.LEFT_INDEX]: at(0.6, 0.5, 0.05),
      [IDX.LEFT_PINKY]: at(0.6, 0.5, 0.05),
    });
    assert.equal(handPoint(pts, "left").x, 0.5);
  });

  it("uses one knuckle if that is all there is", () => {
    const pts = withHand({
      [IDX.LEFT_WRIST]: at(0.5, 0.5),
      [IDX.LEFT_INDEX]: at(0.6, 0.5),
      [IDX.LEFT_PINKY]: at(0.6, 0.5, 0.05),
    });
    assert.ok(Math.abs(handPoint(pts, "left").x - 0.55) < 1e-9);
  });

  it("reports nothing when the wrist itself is not visible", () => {
    const pts = withHand({
      [IDX.LEFT_WRIST]: at(0.5, 0.5, 0.05),
      [IDX.LEFT_INDEX]: at(0.6, 0.5),
    });
    assert.equal(handPoint(pts, "left"), null);
  });

  it("copes with no landmarks at all", () => {
    assert.equal(handPoint(null, "left"), null);
    assert.equal(handPoint([], "nonsense"), null);
  });
});
