import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./jump-the-wall.js";
import { fxSpy } from "./test-support.js";

/**
 * Levels for this game live in the adapter rather than the shared base class,
 * because the side-scroller underneath predates both.
 */
function started(opts = {}) {
  const g = createGame({ clearsPerLevel: 3, maxLevel: 4, ...opts });
  g.start(0);
  return g;
}

const STILL = { jump: false, ducking: false };

/** Credit cleared obstacles and run the frame that notices them. */
function clearObstacles(g, total, now = 100) {
  g.game.cleared = total;
  g.tick(0.016, STILL, now);
}

describe("Jump the Wall levels", () => {
  it("starts on level one", () => {
    assert.equal(started().hud().level, 1);
  });

  it("moves up once enough obstacles are behind you", () => {
    const g = started();
    clearObstacles(g, 2);
    assert.equal(g.hud().level, 1, "not there yet");
    clearObstacles(g, 3);
    assert.equal(g.hud().level, 2);
  });

  it("stops climbing at the top level", () => {
    const g = started();
    clearObstacles(g, 400);
    assert.equal(g.hud().level, 4);
  });

  it("runs the field faster at higher levels", () => {
    const g = started();
    const base = g.game.currentSpeed(0);
    clearObstacles(g, 6);
    assert.equal(g.hud().level, 3);
    assert.ok(g.game.currentSpeed(0) > base, "level three should outpace level one");
  });

  it("caps the speed bonus once the levels stop", () => {
    const g = started();
    clearObstacles(g, 9);
    const top = g.game.currentSpeed(0);
    clearObstacles(g, 90);
    assert.equal(g.game.currentSpeed(0), top);
  });

  it("announces a level up", () => {
    const fx = fxSpy();
    const g = started({ fx });
    clearObstacles(g, 3);
    assert.equal(fx.played("go"), true);
    assert.ok(g.levelFlash > 0, "the shell needs a flash to draw the banner");
  });

  it("says nothing when the level has not changed", () => {
    const fx = fxSpy();
    const g = started({ fx });
    clearObstacles(g, 1);
    assert.equal(fx.played("go"), false);
  });

  it("fades the level banner", () => {
    const g = started();
    clearObstacles(g, 3);
    for (let i = 0; i < 200; i += 1) g.tick(0.033, STILL, 200 + i * 33);
    assert.equal(g.levelFlash, 0);
  });

  it("goes back to level one for the next round", () => {
    const g = started();
    clearObstacles(g, 9);
    g.start(1000);
    assert.equal(g.hud().level, 1);
    assert.equal(g.game.levelBoost, 0, "the speed bonus has to reset too");
  });

  it("reports the level to the results screen", () => {
    const g = started();
    clearObstacles(g, 6);
    assert.equal(g.summary().level, 3);
  });
});
