import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JumpGame, OB_WALL } from "./game.js";
import { GameRenderer } from "./render.js";

/** A 2D context stand-in that records nothing but tolerates every call. */
function stubCtx() {
  const gradient = { addColorStop() {} };
  const handler = {
    get(target, prop) {
      if (prop === "canvas") return { width: 960, height: 540 };
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => gradient;
      }
      if (prop === "measureText") return () => ({ width: 40 });
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set() {
      return true;
    },
  };
  return new Proxy({}, handler);
}

describe("renderer", () => {
  it("draws a full round without touching removed game fields", () => {
    const ctx = stubCtx();
    const game = new JumpGame({ width: 960, roundMs: 20_000 });
    game.start(0);
    const r = new GameRenderer();

    let now = 0;
    let drew = 0;
    for (let i = 0; i < 700; i += 1) {
      now += 33;
      const wall = game.obstacles.find((o) => o.type === OB_WALL && o.x < 300 && o.x > 240);
      const ev = game.tick(0.033, { inFrame: true, jump: Boolean(wall), ducking: false }, now);
      if (ev.scored) r.onScore(ev.scored, now);
      if (ev.hit) r.onHit();
      r.draw(ctx, game, { inFrame: true, quality: 0.9 }, now, 0.033);
      drew += 1;
      if (game.over) break;
    }
    assert.ok(drew > 100, `only drew ${drew} frames`);
  });

  it("renders while the player is out of frame", () => {
    const ctx = stubCtx();
    const game = new JumpGame({ width: 960, roundMs: 20_000 });
    game.start(0);
    const r = new GameRenderer();
    for (let i = 0; i < 60; i += 1) {
      game.tick(0.033, { inFrame: false }, i * 33);
      r.draw(ctx, game, { inFrame: false, quality: 0 }, i * 33, 0.033, "Step back");
    }
  });
});
