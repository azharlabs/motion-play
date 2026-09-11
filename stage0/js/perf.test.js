import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PerfGovernor, SCALES } from "./perf.js";

/** Feed the governor a run of frames all taking the same time. */
function run(gov, ms, frames) {
  let changes = 0;
  for (let i = 0; i < frames; i += 1) if (gov.frame(ms)) changes += 1;
  return changes;
}

describe("PerfGovernor render scale", () => {
  it("starts at the best looking scale", () => {
    assert.equal(new PerfGovernor().scale, SCALES[0]);
  });

  it("leaves a device holding 60fps alone", () => {
    const gov = new PerfGovernor();
    assert.equal(run(gov, 16.7, 300), 0);
    assert.equal(gov.scale, SCALES[0]);
  });

  it("drops the scale on a device that cannot keep up", () => {
    const gov = new PerfGovernor({ sampleSize: 10 });
    gov.frame(40);
    assert.equal(gov.scale, SCALES[0], "one slow frame is not evidence");
    run(gov, 40, 10);
    assert.ok(gov.scale < SCALES[0], `still at ${gov.scale}`);
  });

  it("keeps dropping while it is still too slow, then stops at the floor", () => {
    const gov = new PerfGovernor({ sampleSize: 10 });
    run(gov, 60, 500);
    assert.equal(gov.scale, SCALES[SCALES.length - 1]);
  });

  it("climbs back up once the device has room to spare", () => {
    const gov = new PerfGovernor({ sampleSize: 10, patience: 3 });
    run(gov, 40, 10);
    const dropped = gov.scale;
    run(gov, 10, 30); // three good windows, which is the patience setting
    assert.ok(gov.scale > dropped, `stuck at ${gov.scale}`);
  });

  it("waits for several good windows before climbing, so it cannot flap", () => {
    const gov = new PerfGovernor({ sampleSize: 10, patience: 3 });
    run(gov, 40, 10);
    const dropped = gov.scale;
    run(gov, 10, 10);
    assert.equal(gov.scale, dropped, "one good window is not enough");
  });

  it("reports a change exactly when the canvas needs resizing", () => {
    const gov = new PerfGovernor({ sampleSize: 10 });
    assert.equal(run(gov, 40, 9), 0);
    assert.equal(gov.frame(40), true);
  });

  it("ignores a backgrounded tab", () => {
    const gov = new PerfGovernor({ sampleSize: 5 });
    run(gov, 5000, 50);
    assert.equal(gov.scale, SCALES[0], "a hidden tab is not a slow device");
  });
});

describe("PerfGovernor pose reporting", () => {
  it("reports what detection is costing", () => {
    const gov = new PerfGovernor();
    for (let i = 0; i < 60; i += 1) gov.poseCost(18);
    assert.ok(Math.abs(gov.report().avgInferMs - 18) < 1, `${gov.report().avgInferMs}`);
  });

  it("is not swayed by a single slow detection", () => {
    const gov = new PerfGovernor();
    for (let i = 0; i < 40; i += 1) gov.poseCost(4);
    gov.poseCost(60);
    assert.ok(gov.avgInferMs < 10, `one hitch moved the average to ${gov.avgInferMs}`);
  });

  it("never throttles the tracking, whatever detection costs", () => {
    const gov = new PerfGovernor();
    for (let i = 0; i < 200; i += 1) gov.poseCost(80);
    // Hand games depend on every camera frame being looked at.
    assert.equal(gov.inferEvery, undefined, "there must be no thinning dial to reach for");
  });
});
