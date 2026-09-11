import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OneEuroFilter, median } from "./filters.js";

describe("median", () => {
  it("returns the middle value of an odd-length list", () => {
    assert.equal(median([0.9, 0.1, 0.5]), 0.5);
  });

  it("averages the two middle values of an even-length list", () => {
    assert.equal(median([0.2, 0.4, 0.6, 0.8]), 0.5);
  });

  it("ignores outliers that a mean would follow", () => {
    assert.equal(median([0.5, 0.5, 0.5, 9]), 0.5);
  });
});

describe("OneEuroFilter", () => {
  it("passes the first sample through unchanged", () => {
    const f = new OneEuroFilter();
    assert.equal(f.filter(0.42, 0), 0.42);
  });

  it("converges to a constant input", () => {
    const f = new OneEuroFilter();
    let out = f.filter(0, 0);
    for (let t = 33; t < 2000; t += 33) out = f.filter(0.8, t);
    assert.ok(Math.abs(out - 0.8) < 0.01, `expected ~0.8, got ${out}`);
  });

  it("tracks a fast step with less lag than a no-speed-adaptation filter", () => {
    const fast = new OneEuroFilter({ minCutoff: 1.0, beta: 0.7 });
    const slow = new OneEuroFilter({ minCutoff: 1.0, beta: 0 });
    fast.filter(0, 0);
    slow.filter(0, 0);
    let fastOut = 0;
    let slowOut = 0;
    for (let t = 33; t <= 132; t += 33) {
      fastOut = fast.filter(1, t);
      slowOut = slow.filter(1, t);
    }
    assert.ok(
      fastOut > slowOut,
      `speed adaptation should lead: fast=${fastOut} slow=${slowOut}`
    );
  });
});
