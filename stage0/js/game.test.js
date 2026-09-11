import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JumpGame, OB_WALL, OB_BRANCH, OB_SHAPE } from "./game.js";

const idle = { jump: false, ducking: false, inFrame: true };

function makeGame(opts = {}) {
  const game = new JumpGame({
    width: 960,
    playerX: 140,
    baseSpeed: 400,
    roundMs: 180_000,
    ...opts,
  });
  game.start(0);
  return game;
}

/** Drop an obstacle into the live physics world, the way #spawn would. */
function place(game, type, x) {
  const id = game.nextId++;
  game.physics.addObstacle(id, type, x, game.currentSpeed());
  const ob = {
    id,
    type,
    x,
    width: OB_SHAPE[type].width,
    scored: false,
    resolved: false,
    seed: 0.5,
  };
  game.obstacles.push(ob);
  return ob;
}

/** An x where the obstacle sits entirely behind the player. */
function pastPlayer(game, type) {
  return game.playerX - OB_SHAPE[type].width - 5;
}

describe("JumpGame scoring", () => {
  it("scores and builds a combo when obstacles are cleared", () => {
    const game = makeGame();
    place(game, OB_WALL, pastPlayer(game, OB_WALL));
    game.tick(0.016, idle, 0);
    assert.equal(game.score, 1);
    assert.equal(game.combo, 1);
  });

  it("awards bonus points once a combo is running", () => {
    const game = makeGame();
    game.combo = 5;
    place(game, OB_WALL, pastPlayer(game, OB_WALL));
    game.tick(0.016, idle, 0);
    assert.ok(game.score > 1, `combo should add bonus, got ${game.score}`);
  });

  it("does not score an obstacle that was hit", () => {
    const game = makeGame();
    place(game, OB_WALL, game.playerX);
    game.tick(0.016, idle, 0);
    for (let t = 100; t < 1500; t += 33) game.tick(0.033, idle, t);
    assert.equal(game.score, 0);
  });
});

describe("JumpGame lives", () => {
  it("costs a life on a hit instead of ending immediately", () => {
    const game = makeGame({ lives: 3 });
    place(game, OB_WALL, game.playerX);
    const ev = game.tick(0.016, idle, 0);
    assert.equal(ev.hit, true);
    assert.equal(game.lives, 2);
    assert.equal(game.over, false);
  });

  it("resets the combo on a hit", () => {
    const game = makeGame({ lives: 3 });
    game.combo = 7;
    place(game, OB_WALL, game.playerX);
    game.tick(0.016, idle, 0);
    assert.equal(game.combo, 0);
  });

  it("grants brief invulnerability so one wall cannot drain every life", () => {
    const game = makeGame({ lives: 3, invulnerableMs: 1200 });
    place(game, OB_WALL, game.playerX);
    place(game, OB_BRANCH, game.playerX);
    game.tick(0.016, idle, 0);
    game.tick(0.016, idle, 100);
    game.tick(0.016, idle, 200);
    assert.equal(game.lives, 2);
  });

  it("ends the round when the last life is gone", () => {
    const game = makeGame({ lives: 1 });
    place(game, OB_WALL, game.playerX);
    const ev = game.tick(0.016, idle, 0);
    assert.equal(ev.hit, true);
    assert.equal(game.over, true);
  });
});

describe("JumpGame pacing", () => {
  it("ends the round when time expires", () => {
    const game = makeGame({ roundMs: 1000 });
    const ev = game.tick(0.016, idle, 1000);
    assert.equal(ev.timeout, true);
    assert.equal(game.over, true);
  });

  it("speeds up as the round goes on, up to a cap", () => {
    const game = makeGame({ baseSpeed: 300, maxSpeed: 480, rampPerSecond: 6 });
    assert.equal(game.currentSpeed(0), 300);
    assert.equal(game.currentSpeed(10_000), 360);
    assert.equal(game.currentSpeed(600_000), 480);
  });

  it("never spawns two obstacles on top of each other", () => {
    const game = makeGame();
    let now = 0;
    for (let i = 0; i < 400; i += 1) {
      now += 33;
      game.tick(0.033, idle, now);
    }
    const sorted = [...game.obstacles].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
      assert.ok(gap > 120, `obstacles too close: gap ${gap}`);
    }
  });

  it("pauses the world while the player is out of frame", () => {
    const game = makeGame();
    place(game, OB_WALL, 600);
    game.tick(0.5, { jump: false, ducking: false, inFrame: false }, 0);
    assert.ok(Math.abs(game.obstacles[0].x - 600) < 1, `drifted to ${game.obstacles[0].x}`);
  });
});

describe("fairness", () => {
  it("a player reacting at a human distance can clear a full round untouched", () => {
    // Reacts when an obstacle is still 300px out, plus 150ms of pose latency.
    const game = new JumpGame({ width: 960, roundMs: 60_000 });
    game.start(0);

    const LATENCY_MS = 150;
    const pending = [];
    let now = 0;
    let jumpAt = -1;

    for (let step = 0; step < 1800; step += 1) {
      now += 33;
      for (const ob of game.obstacles) {
        // Commit roughly half a second before contact, like a real player.
        const gap = ob.x - (game.playerX + game.playerWidth);
        const timeToContact = (gap / game.currentSpeed()) * 1000;
        if (!ob.reacted && timeToContact < 500 && gap > 0) {
          ob.reacted = true;
          pending.push({ at: now + LATENCY_MS, ob });
        }
      }
      while (pending.length && pending[0].at <= now) {
        const { ob } = pending.shift();
        if (ob.type === OB_WALL) jumpAt = now;
        else ob.crouching = true;
      }
      // A crouch is held until the branch is visibly behind you.
      const ducking = game.obstacles.some(
        (ob) => ob.crouching && ob.x + ob.width > game.playerX - 20,
      );
      const motion = { inFrame: true, jump: jumpAt === now, ducking };
      const ev = game.tick(0.033, motion, now);
      assert.equal(ev.hit, false, `hit at ${now}ms with ${game.lives} lives left`);
      if (game.over) break;
    }

    assert.equal(game.lives, 3);
    assert.ok(game.score > 10, `expected a real score, got ${game.score}`);
  });

  it("keeps obstacles answerable even at top speed", () => {
    const game = new JumpGame({ width: 960, baseSpeed: 520, maxSpeed: 520, roundMs: 30_000 });
    game.start(0);
    const pending = [];
    let now = 0;
    let jumpAt = -1;

    for (let step = 0; step < 900; step += 1) {
      now += 33;
      for (const ob of game.obstacles) {
        const gap = ob.x - (game.playerX + game.playerWidth);
        if (!ob.reacted && (gap / game.currentSpeed()) * 1000 < 500 && gap > 0) {
          ob.reacted = true;
          pending.push({ at: now + 150, ob });
        }
      }
      while (pending.length && pending[0].at <= now) {
        const { ob } = pending.shift();
        if (ob.type === OB_WALL) jumpAt = now;
        else ob.crouching = true;
      }
      const ducking = game.obstacles.some(
        (ob) => ob.crouching && ob.x + ob.width > game.playerX - 20,
      );
      const ev = game.tick(0.033, { inFrame: true, jump: jumpAt === now, ducking }, now);
      assert.equal(ev.hit, false, `unavoidable hit at ${now}ms`);
      if (game.over) break;
    }
    assert.equal(game.lives, 3);
  });
});
