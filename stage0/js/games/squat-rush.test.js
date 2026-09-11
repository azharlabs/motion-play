import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./squat-rush.js";
import { VIEW, fxSpy, signals } from "./test-support.js";

/** Hold a crouch depth long enough for the smoothing to settle. */
function hold(game, crouch, ms = 500, from = 0) {
  let now = from;
  for (let t = 0; t < ms; t += 33) {
    now += 33;
    game.tick(0.033, signals({ crouch }), now, VIEW);
  }
  return now;
}

/** One full down-and-up. */
function rep(game, from = 0, depth = 0.8) {
  const bottom = hold(game, depth, 500, from);
  return hold(game, 0.02, 700, bottom);
}

describe("Squat Rush reps", () => {
  it("counts a full down-and-up", () => {
    const g = createGame();
    g.start(0);
    rep(g);
    assert.equal(g.score, 1);
  });

  it("counts several reps in a row", () => {
    const g = createGame();
    g.start(0);
    let now = 0;
    for (let i = 0; i < 4; i += 1) now = rep(g, now);
    assert.equal(g.score, 4);
  });

  it("does not count a shallow dip", () => {
    const g = createGame();
    g.start(0);
    const bottom = hold(g, 0.3, 500);
    hold(g, 0.02, 700, bottom);
    assert.equal(g.score, 0, "half a squat is not a rep");
  });

  it("does not count going down without standing back up", () => {
    const g = createGame();
    g.start(0);
    hold(g, 0.85, 1500);
    assert.equal(g.score, 0);
  });

  it("does not double count bouncing at the bottom", () => {
    const g = createGame();
    g.start(0);
    let now = hold(g, 0.85, 400);
    now = hold(g, 0.6, 300, now);
    now = hold(g, 0.85, 300, now);
    hold(g, 0.02, 700, now);
    assert.equal(g.score, 1);
  });

  it("ignores reps while the player is out of frame", () => {
    const g = createGame();
    g.start(0);
    let now = 0;
    for (let t = 0; t < 1500; t += 33) {
      now += 33;
      g.tick(0.033, signals({ inFrame: false, crouch: t < 700 ? 0.9 : 0 }), now, VIEW);
    }
    assert.equal(g.score, 0);
  });
});

describe("Squat Rush feedback", () => {
  it("confirms the bottom of the squat before the rep is finished", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    hold(g, 0.85, 500);
    assert.equal(g.score, 0, "still down, so no rep yet");
    assert.equal(fx.played("tick"), true, "you cannot see the meter head-down");
  });

  it("rings the rep when you stand back up", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    rep(g);
    assert.equal(fx.played("rep"), true);
    assert.ok(g.particles.length > 0);
  });
});

describe("Squat Rush round", () => {
  it("runs without lives, so the clock is the only pressure", () => {
    const g = createGame();
    g.start(0);
    assert.equal(g.hud().maxLives, 0);
    assert.equal(g.hud().lives, 0);
  });

  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    assert.equal(g.tick(0.016, signals(), 1000, VIEW).over, true);
  });

  it("reports the rep count as the score", () => {
    const g = createGame();
    g.start(0);
    let now = 0;
    for (let i = 0; i < 3; i += 1) now = rep(g, now);
    assert.equal(g.summary().cleared, 3);
  });
});
