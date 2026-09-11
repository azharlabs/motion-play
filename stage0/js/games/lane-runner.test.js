import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, PLAYER_Y } from "./lane-runner.js";
import { VIEW, fxSpy } from "./test-support.js";

const signals = (over = {}) => ({ inFrame: true, lean: 0, hands: {}, ...over });

/** Hold a lean steady for a while so the lane easing can settle. */
function hold(game, lean, ms = 600, from = 0) {
  let now = from;
  for (let t = 0; t < ms; t += 33) {
    now += 33;
    game.tick(0.033, signals({ lean }), now);
  }
  return now;
}

describe("Lane Runner steering", () => {
  it("starts in the middle lane", () => {
    const g = createGame();
    g.start(0);
    g.tick(0.033, signals(), 33);
    assert.equal(g.lane, 1);
  });

  it("moves to the right lane on a clear right lean", () => {
    const g = createGame();
    g.start(0);
    hold(g, 0.8);
    assert.equal(g.lane, 2);
  });

  it("moves to the left lane on a clear left lean", () => {
    const g = createGame();
    g.start(0);
    hold(g, -0.8);
    assert.equal(g.lane, 0);
  });

  it("holds the lane through a small wobble at the edge", () => {
    const g = createGame({ enterLean: 0.34, exitLean: 0.2 });
    g.start(0);
    let now = hold(g, 0.5);
    assert.equal(g.lane, 2);
    // Drift back to just inside the enter threshold but outside the exit one.
    now = hold(g, 0.28, 400, now);
    assert.equal(g.lane, 2, "should not flicker back on a small wobble");
    hold(g, 0.05, 400, now);
    assert.equal(g.lane, 1, "but a real return to centre should switch back");
  });

  it("eases between lanes rather than teleporting", () => {
    const g = createGame();
    g.start(0);
    g.tick(0.033, signals({ lean: 0.9 }), 33);
    assert.equal(g.lane, 2);
    assert.ok(g.laneX < 1.5, `laneX jumped straight to ${g.laneX}`);
  });
});

describe("Lane Runner collisions", () => {
  it("collects a coin in the player's lane", () => {
    const g = createGame();
    g.start(0);
    g.things = [{ id: 1, kind: "coin", lane: 1, y: PLAYER_Y, done: false }];
    g.spawnTimer = 999;
    const ev = g.tick(0.016, signals(), 16);
    assert.equal(ev.coin, 1);
    assert.equal(g.score, 1);
  });

  it("misses a coin in another lane", () => {
    const g = createGame();
    g.start(0);
    g.things = [{ id: 1, kind: "coin", lane: 0, y: PLAYER_Y, done: false }];
    g.spawnTimer = 999;
    const ev = g.tick(0.016, signals(), 16);
    assert.equal(ev.coin, 0);
  });

  it("costs a life for a barrel in the player's lane", () => {
    const g = createGame();
    g.start(0);
    g.things = [{ id: 1, kind: "barrel", lane: 1, y: PLAYER_Y, done: false }];
    g.spawnTimer = 999;
    const ev = g.tick(0.016, signals(), 16);
    assert.equal(ev.hit, true);
    assert.equal(g.lives, 2);
  });

  it("grants brief invulnerability so one crash is not fatal", () => {
    const g = createGame({ lives: 3, invulnerableMs: 1100 });
    g.start(0);
    g.things = [
      { id: 1, kind: "barrel", lane: 1, y: PLAYER_Y, done: false },
      { id: 2, kind: "barrel", lane: 1, y: PLAYER_Y + 0.005, done: false },
    ];
    g.spawnTimer = 999;
    g.tick(0.016, signals(), 16);
    assert.equal(g.lives, 2, "the second barrel should not also land");
  });
});

describe("Lane Runner feedback", () => {
  it("chimes on a coin and sparks over the lane it was in", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.things = [{ id: 1, kind: "coin", lane: 0, y: PLAYER_Y, done: false }];
    g.spawnTimer = 999;
    g.lane = 0;
    g.laneX = 0;
    g.tick(0.016, signals({ lean: -0.9 }), 16, VIEW);
    assert.equal(fx.played("coin"), true);
    const spark = g.particles[0];
    const laneX = g.laneCenter(VIEW, 0) / VIEW.w;
    assert.ok(Math.abs(spark.x - laneX) < 0.02, `sparks at ${spark.x}, lane at ${laneX}`);
  });

  it("crashes out loud into a barrel", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.things = [{ id: 1, kind: "barrel", lane: 1, y: PLAYER_Y, done: false }];
    g.spawnTimer = 999;
    g.tick(0.016, signals(), 16, VIEW);
    assert.equal(fx.played("crash"), true);
  });
});

describe("Lane Runner difficulty", () => {
  it("speeds up as you climb the levels", () => {
    const g = createGame();
    g.start(0);
    g.tick(0.016, signals(), 16, VIEW);
    const opening = g.speed();
    g.level = g.maxLevel;
    assert.ok(g.speed() > opening * 1.3, `${opening} then ${g.speed()}`);
  });

  it("holds its pace for a player who is not scoring", () => {
    const g = createGame({ roundMs: 10_000 });
    g.start(0);
    g.tick(0.016, signals(), 16, VIEW);
    const opening = g.speed();
    g.tick(0.016, signals(), 9_000, VIEW);
    assert.equal(g.speed(), opening, "the clock alone must not raise difficulty");
  });

  it("keeps the early levels gentler than a straight line would", () => {
    const g = createGame();
    g.start(0);
    // Level two of eight: a linear ramp would already be a seventh harder.
    g.level = 2;
    assert.ok(g.ramp() < 1 / 7, `ramp was ${g.ramp()} at level two`);
  });
});

describe("Lane Runner fairness", () => {
  it("always leaves at least one lane open", () => {
    const g = createGame();
    g.start(0);
    let now = 0;
    for (let i = 0; i < 2000; i += 1) {
      now += 33;
      g.lives = 3;
      g.over = false;
      g.tick(0.033, signals(), now);

      // Group barrels by the row they were spawned into.
      const rows = new Map();
      for (const t of g.things) {
        if (t.kind !== "barrel") continue;
        const key = t.y.toFixed(3);
        rows.set(key, (rows.get(key) ?? 0) + 1);
      }
      for (const [row, count] of rows) {
        assert.ok(count < 3, `all three lanes blocked at row ${row}`);
      }
    }
  });

  it("freezes while the player is out of frame", () => {
    const g = createGame();
    g.start(0);
    g.things = [{ id: 1, kind: "coin", lane: 1, y: 0.2, done: false }];
    g.spawnTimer = 999;
    g.tick(0.5, signals({ inFrame: false }), 500);
    assert.equal(g.things[0].y, 0.2);
  });

  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    const ev = g.tick(0.016, signals(), 1000);
    assert.equal(ev.over, true);
  });
});
