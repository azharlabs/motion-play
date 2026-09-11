import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { averageVisibleY, IDX } from "./landmarks.js";

describe("averageVisibleY", () => {
  it("averages Y of visible landmarks", () => {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0 }));
    lm[IDX.LEFT_HIP] = { x: 0.4, y: 0.6, visibility: 0.9 };
    lm[IDX.RIGHT_HIP] = { x: 0.6, y: 0.64, visibility: 0.9 };
    assert.equal(averageVisibleY(lm, [IDX.LEFT_HIP, IDX.RIGHT_HIP], 0.5), 0.62);
  });

  it("returns null when all points are below visibility", () => {
    const lm = [{ x: 0, y: 0.5, visibility: 0.1 }];
    assert.equal(averageVisibleY(lm, [0], 0.5), null);
  });

  it("accepts presence when visibility is missing", () => {
    const lm = [{ x: 0, y: 0.4, presence: 0.9 }];
    assert.equal(averageVisibleY(lm, [0], 0.5), 0.4);
  });
});
