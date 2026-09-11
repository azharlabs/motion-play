import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, BIRD_X } from "./sky-flap.js";
import { VIEW, fxSpy, hand, noHand, signals } from "./test-support.js";

const hands = (y) => ({ left: hand(0.35, y), right: hand(0.65, y) });

function hold(game, s, ms = 1200, from = 0) {
  let now = from;
  for (let t = 0; t < ms; t += 33) {
    now += 33;
    game.tick(0.033, s, now, VIEW);
  }
  return now;
}

describe("Sky Flap feedback", () => {
  it("chimes for a pipe threaded cleanly", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.birdY = 0.5;
    g.spawnAt = 999;
    g.pipes = [{ id: 1, x: BIRD_X - 0.07, center: 0.5, gap: 0.34, passed: false }];
    g.tick(0.033, signals({ hands: hands(0.45) }), 33, VIEW);
    assert.equal(fx.played("chime"), true);
  });

  it("crashes into a pipe out loud", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.birdY = 0.5;
    g.spawnAt = 999;
    g.pipes = [{ id: 1, x: BIRD_X, center: 0.05, gap: 0.1, passed: false }];
    g.tick(0.033, signals({ hands: hands(0.45) }), 33, VIEW);
    assert.equal(fx.played("crash"), true);
  });
});

describe("Sky Flap control", () => {
  it("climbs when you raise your hands", () => {
    const g = createGame();
    g.start(0);
    g.pipes = [];
    g.spawnAt = 999;
    hold(g, signals({ hands: hands(0.18) }));
    assert.ok(g.birdY < 0.3, `bird only reached ${g.birdY}`);
  });

  it("drops when you lower your hands", () => {
    const g = createGame();
    g.start(0);
    g.pipes = [];
    g.spawnAt = 999;
    hold(g, signals({ hands: hands(0.72) }));
    assert.ok(g.birdY > 0.7, `bird only fell to ${g.birdY}`);
  });

  it("glides rather than snapping to your hands", () => {
    const g = createGame();
    g.start(0);
    g.pipes = [];
    g.spawnAt = 999;
    g.tick(0.033, signals({ hands: hands(0.18) }), 33, VIEW);
    assert.ok(g.birdY > 0.35, `bird teleported to ${g.birdY}`);
  });

  it("holds its height when both hands are lost", () => {
    const g = createGame();
    g.start(0);
    g.pipes = [];
    g.spawnAt = 999;
    const now = hold(g, signals({ hands: hands(0.2) }));
    const before = g.birdY;
    hold(g, signals({ hands: { left: noHand, right: noHand } }), 600, now);
    assert.ok(Math.abs(g.birdY - before) < 0.05, "bird should not lurch when tracking drops");
  });

  it("reports no target when neither hand is visible", () => {
    const s = signals({ hands: { left: noHand, right: noHand } });
    const g = createGame();
    assert.equal(g.constructor.handTarget(s, 0.72, 0.18), null);
  });
});

describe("Sky Flap pipes", () => {
  it("scores for passing through the gap", () => {
    const g = createGame();
    g.start(0);
    g.birdY = 0.5;
    g.targetY = 0.5;
    g.spawnAt = 999;
    g.pipes = [{ id: 1, x: BIRD_X - 0.07, center: 0.5, gap: 0.34, passed: false }];
    const ev = g.tick(0.016, signals({ hands: hands(0.45) }), 16, VIEW);
    assert.equal(ev.passed, 1);
  });

  it("costs a life for flying into a pipe", () => {
    const g = createGame();
    g.start(0);
    g.birdY = 0.9;
    g.targetY = 0.9;
    g.spawnAt = 999;
    g.pipes = [{ id: 1, x: BIRD_X, center: 0.3, gap: 0.24, passed: false }];
    const ev = g.tick(0.016, signals({ hands: hands(0.72) }), 16, VIEW);
    assert.equal(ev.hit, true);
    assert.equal(g.lives, 2);
  });

  it("does not charge twice for the same pipe", () => {
    const g = createGame();
    g.start(0);
    g.birdY = 0.9;
    g.targetY = 0.9;
    g.spawnAt = 999;
    g.pipes = [{ id: 1, x: BIRD_X, center: 0.3, gap: 0.24, passed: false }];
    const s = signals({ hands: hands(0.72) });
    g.tick(0.016, s, 16, VIEW);
    g.tick(0.016, s, 32, VIEW);
    assert.equal(g.lives, 2);
  });

  it("always leaves the gap fully on screen", () => {
    const g = createGame();
    g.start(0);
    let now = 0;
    for (let i = 0; i < 3000; i += 1) {
      now += 33;
      g.lives = 3;
      g.over = false;
      g.tick(0.033, signals({ hands: hands(0.45) }), now, VIEW);
      for (const p of g.pipes) {
        assert.ok(p.center - p.gap / 2 > 0.01, `gap runs off the top: ${p.center}`);
        assert.ok(p.center + p.gap / 2 < 0.99, `gap runs off the bottom: ${p.center}`);
      }
    }
  });

  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    assert.equal(g.tick(0.016, signals(), 1000, VIEW).over, true);
  });
});
