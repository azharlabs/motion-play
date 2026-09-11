import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BaseGame, drawLevelBanner } from "./common.js";
import { fxSpy } from "./test-support.js";

/** A canvas context that records the text it was asked to draw. */
function recordingCtx() {
  const drawn = [];
  const ctx = new Proxy(
    { drawn },
    {
      get(target, prop) {
        if (prop === "drawn") return drawn;
        if (prop === "fillText") return (text) => drawn.push(text);
        if (prop === "measureText") return () => ({ width: 40 });
        if (!(prop in target)) target[prop] = () => {};
        return target[prop];
      },
      set: () => true,
    },
  );
  return ctx;
}

/** The smallest possible game: just the shared bookkeeping. */
function game(opts = {}) {
  const g = new (class extends BaseGame {})({ clearsPerLevel: 3, maxLevel: 4, ...opts });
  g.reset();
  g.start(0);
  return g;
}

const clear = (g, n) => {
  for (let i = 0; i < n; i += 1) g.award(0.5, 0.5);
};

describe("Levels", () => {
  it("starts everyone on level one", () => {
    assert.equal(game().level, 1);
  });

  it("moves up after the set number of clears", () => {
    const g = game();
    clear(g, 2);
    assert.equal(g.level, 1, "not there yet");
    clear(g, 1);
    assert.equal(g.level, 2);
  });

  it("keeps climbing with a run of clears", () => {
    const g = game();
    clear(g, 6);
    assert.equal(g.level, 3);
  });

  it("stops at the top level however well you play", () => {
    const g = game();
    clear(g, 500);
    assert.equal(g.level, 4);
  });

  it("never drops back down after a mistake", () => {
    const g = game();
    clear(g, 3);
    g.penalise();
    assert.equal(g.level, 2, "a miss costs a life, not your progress");
  });

  it("does not level up on the clock alone", () => {
    const g = game({ roundMs: 10_000 });
    g.beginTick(0.016, 9_000);
    assert.equal(g.level, 1);
  });

  it("resets to level one for the next round", () => {
    const g = game();
    clear(g, 9);
    g.start(1000);
    assert.equal(g.level, 1);
  });
});

describe("Level difficulty", () => {
  it("is at its gentlest on level one and hardest at the top", () => {
    const g = game();
    assert.equal(g.ramp(), 0);
    g.level = g.maxLevel;
    assert.equal(g.ramp(), 1);
  });

  it("rises with every level in between", () => {
    const g = game({ maxLevel: 8 });
    let last = -1;
    for (let level = 1; level <= 8; level += 1) {
      g.level = level;
      assert.ok(g.ramp() > last, `level ${level} was not harder than the one below`);
      last = g.ramp();
    }
  });

  it("tracks how far through the current level you are", () => {
    const g = game();
    assert.equal(g.levelProgress(), 0);
    clear(g, 1);
    assert.ok(Math.abs(g.levelProgress() - 1 / 3) < 1e-9);
    g.level = g.maxLevel;
    assert.equal(g.levelProgress(), 1, "the top level is always full");
  });
});

describe("Level feedback", () => {
  it("announces the level up", () => {
    const fx = fxSpy();
    const g = game({ fx });
    clear(g, 3);
    assert.equal(fx.played("go"), true);
    assert.equal(g.levelFlash > 0, true, "the shell needs a flash to draw");
  });

  it("does not announce a clear that changes nothing", () => {
    const fx = fxSpy();
    const g = game({ fx });
    clear(g, 1);
    assert.equal(fx.played("go"), false);
  });

  it("fades the flash so the banner does not stick", () => {
    const g = game();
    clear(g, 3);
    for (let i = 0; i < 200; i += 1) g.beginTick(0.033, i * 33);
    assert.equal(g.levelFlash, 0);
  });

  it("draws the banner while the flash lasts", () => {
    const ctx = recordingCtx();
    drawLevelBanner(ctx, { w: 390, h: 844 }, 3, 0.6);
    assert.deepEqual(ctx.drawn, ["LEVEL 3"]);
  });

  it("draws nothing once the flash is spent", () => {
    const ctx = recordingCtx();
    drawLevelBanner(ctx, { w: 390, h: 844 }, 3, 0);
    assert.deepEqual(ctx.drawn, [], "a finished banner must not linger");
  });

  it("reports the level to the shell", () => {
    const g = game();
    clear(g, 3);
    assert.equal(g.hud().level, 2);
    assert.equal(g.hud().maxLevel, 4);
    assert.equal(g.summary().level, 2);
  });
});
