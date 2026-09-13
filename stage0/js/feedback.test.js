import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CUES, Feedback } from "./feedback.js";

/** A Feedback wired to recorders instead of speakers and a vibration motor. */
function rig(opts = {}) {
  const layers = [];
  const buzzes = [];
  const fb = new Feedback({
    sink: (layer) => layers.push(layer),
    vibrate: (pattern) => buzzes.push(pattern),
    ...opts,
  });
  return { fb, layers, buzzes };
}

describe("Feedback cues", () => {
  it("defines a celebrate cue for level clears", () => {
    assert.ok(CUES.celebrate, "level-clear cheer must exist");
    assert.ok(CUES.celebrate.layers.length >= 3);
  });

  it("plays every layer of a cue", () => {
    const { fb, layers } = rig();
    assert.equal(fb.cue("thud", { now: 0 }), true);
    assert.equal(layers.length, CUES.thud.layers.length);
  });

  it("ignores a cue nobody defined", () => {
    const { fb, layers } = rig();
    assert.equal(fb.cue("nonsense", { now: 0 }), false);
    assert.equal(layers.length, 0);
  });

  it("buzzes with the pattern the cue asks for", () => {
    const { fb, buzzes } = rig();
    fb.cue("crash", { now: 0 });
    assert.deepEqual(buzzes, [CUES.crash.buzz]);
  });

  it("stays silent on a device with no motor", () => {
    const { fb, layers } = rig({ vibrate: null });
    assert.equal(fb.cue("pop", { now: 0 }), true, "sound still plays");
    assert.equal(layers.length > 0, true);
  });

  it("does not buzz for a cue that asks for no buzz", () => {
    const { fb, buzzes } = rig();
    fb.cue("tick", { now: 0 });
    assert.deepEqual(buzzes, []);
  });
});

describe("Feedback muting", () => {
  it("plays nothing at all once muted", () => {
    const { fb, layers, buzzes } = rig({ muted: true });
    assert.equal(fb.cue("pop", { now: 0 }), false);
    assert.equal(layers.length, 0);
    assert.deepEqual(buzzes, []);
  });

  it("toggles back and forth", () => {
    const { fb } = rig();
    assert.equal(fb.toggle(), true);
    assert.equal(fb.toggle(), false);
    assert.equal(fb.cue("pop", { now: 0 }), true);
  });
});

describe("Feedback throttling", () => {
  it("drops a repeat of the same cue inside the gap", () => {
    const { fb, layers } = rig({ gapMs: 40 });
    fb.cue("pop", { now: 0 });
    const before = layers.length;
    assert.equal(fb.cue("pop", { now: 20 }), false);
    assert.equal(layers.length, before, "a frame that pops twice plays once");
  });

  it("lets the same cue through once the gap has passed", () => {
    const { fb } = rig({ gapMs: 40 });
    fb.cue("pop", { now: 0 });
    assert.equal(fb.cue("pop", { now: 41 }), true);
  });

  it("does not let one cue block a different one", () => {
    const { fb } = rig({ gapMs: 40 });
    fb.cue("pop", { now: 0 });
    assert.equal(fb.cue("crash", { now: 1 }), true);
  });

  it("rations vibration harder than sound", () => {
    const { fb, buzzes } = rig({ gapMs: 0, buzzGapMs: 90 });
    fb.cue("pop", { now: 0 });
    fb.cue("thud", { now: 30 });
    fb.cue("slice", { now: 60 });
    assert.equal(buzzes.length, 1, "the motor cannot render three taps that close");
    fb.cue("pop", { now: 200 });
    assert.equal(buzzes.length, 2);
  });
});

describe("Feedback combo pitch", () => {
  it("lifts the pitch as the combo climbs", () => {
    const { fb, layers } = rig({ gapMs: 0 });
    fb.cue("pop", { step: 0, now: 0 });
    fb.cue("pop", { step: 5, now: 100 });
    assert.equal(layers[2].from > layers[0].from, true);
  });

  it("moves a whole octave and no further, so it never turns shrill", () => {
    const { fb, layers } = rig({ gapMs: 0 });
    fb.cue("chime", { step: 12, now: 0 });
    fb.cue("chime", { step: 40, now: 100 });
    assert.equal(layers[1].from, layers[0].from);
    assert.equal(Math.round(layers[0].from / CUES.chime.layers[0].from), 2);
  });

  it("glides to the pitch the cue asked for when it does not slide", () => {
    const { fb, layers } = rig();
    fb.cue("chime", { now: 0 });
    assert.equal(layers[0].to, layers[0].from, "a flat cue must not drift");
  });

  it("scales the volume without touching the pitch", () => {
    const { fb, layers } = rig({ gapMs: 0 });
    fb.cue("pop", { gain: 1, now: 0 });
    fb.cue("pop", { gain: 0.5, now: 100 });
    assert.equal(layers[2].gain, layers[0].gain * 0.5);
    assert.equal(layers[2].from, layers[0].from);
  });
});

describe("Cue catalogue", () => {
  it("gives every cue at least one layer with a real length", () => {
    for (const [name, spec] of Object.entries(CUES)) {
      assert.equal(spec.layers.length > 0, true, `${name} has no layers`);
      for (const layer of spec.layers) {
        assert.equal(layer.dur > 0, true, `${name} has a layer with no length`);
        assert.equal(layer.from > 0, true, `${name} has a layer with no pitch`);
        assert.equal(layer.gain > 0 && layer.gain <= 0.5, true, `${name} is too loud`);
      }
    }
  });

  it("keeps every cue short enough to land before the next one", () => {
    for (const [name, spec] of Object.entries(CUES)) {
      const tail = Math.max(...spec.layers.map((l) => (l.delay ?? 0) + l.dur));
      assert.equal(tail <= 0.8, true, `${name} runs on for ${tail}s`);
    }
  });
});
