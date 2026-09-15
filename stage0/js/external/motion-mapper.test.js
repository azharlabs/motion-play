import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExternalMotionMapper } from "./motion-mapper.js";

describe("ExternalMotionMapper", () => {
  it("maps runner lean to lane keys with hysteresis", () => {
    const mapper = new ExternalMotionMapper("runner");
    let out = mapper.update({ inFrame: true, lean: -0.5 });
    assert.equal(out.controls.ArrowLeft, true);
    assert.equal(out.actions.lean, 1);

    out = mapper.update({ inFrame: true, lean: -0.25 });
    assert.equal(out.controls.ArrowLeft, true, "stays left until returning through exit threshold");

    out = mapper.update({ inFrame: true, lean: 0 });
    assert.equal(out.controls.ArrowLeft, false);
  });

  it("counts one jump pulse instead of one jump per frame", () => {
    const mapper = new ExternalMotionMapper("runner");
    mapper.update({ inFrame: true, jump: true });
    mapper.update({ inFrame: true, jump: true });
    assert.equal(mapper.actions.jump, 1);
    mapper.update({ inFrame: true, jump: false });
    mapper.update({ inFrame: true, jump: true });
    assert.equal(mapper.actions.jump, 2);
  });

  it("keeps acceleration held in racer mode while player is visible", () => {
    const mapper = new ExternalMotionMapper("racer");
    assert.equal(mapper.update({ inFrame: true, lean: 0 }).controls.ArrowUp, true);
    assert.equal(mapper.update({ inFrame: false, lean: 0 }).controls.ArrowUp, false);
  });

  it("releases every held key on stop", () => {
    const mapper = new ExternalMotionMapper("racer");
    mapper.update({ inFrame: true, lean: 0.6 });
    const released = mapper.releaseAll();
    assert.ok(released.some((event) => event.key === "ArrowRight" && event.pressed === false));
    assert.ok(released.some((event) => event.key === "ArrowUp" && event.pressed === false));
  });
});
