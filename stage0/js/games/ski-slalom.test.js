import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, SKIER_Y } from "./ski-slalom.js";
import { VIEW, fxSpy, signals } from "./test-support.js";

function hold(game, lean, ms = 1200, from = 0) {
  let now = from;
  for (let t = 0; t < ms; t += 33) {
    now += 33;
    game.tick(0.033, signals({ lean }), now, VIEW);
  }
  return now;
}

describe("Ski Slalom feedback", () => {
  it("chimes and throws spray through a clean gate", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.x = 0.5;
    g.spawnAt = 999;
    g.gates = [{ id: 1, y: SKIER_Y, center: 0.5, width: 0.3, judged: false }];
    g.tick(0.033, signals(), 33, VIEW);
    assert.equal(fx.played("chime"), true);
    assert.ok(g.particles.length > 0);
  });

  it("sounds the wipeout when a gate is missed", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.x = 0.1;
    g.spawnAt = 999;
    g.gates = [{ id: 1, y: SKIER_Y, center: 0.9, width: 0.2, judged: false }];
    g.tick(0.033, signals(), 33, VIEW);
    assert.equal(fx.played("crash"), true);
  });
});

describe("Ski Slalom steering", () => {
  it("starts down the middle", () => {
    const g = createGame();
    g.start(0);
    g.gates = [];
    g.spawnAt = 999;
    g.tick(0.033, signals(), 33, VIEW);
    assert.ok(Math.abs(g.x - 0.5) < 0.02);
  });

  it("carves right on a right lean", () => {
    const g = createGame();
    g.start(0);
    g.gates = [];
    g.spawnAt = 999;
    hold(g, 1);
    assert.ok(g.x > 0.75, `only reached ${g.x}`);
  });

  it("carves left on a left lean", () => {
    const g = createGame();
    g.start(0);
    g.gates = [];
    g.spawnAt = 999;
    hold(g, -1);
    assert.ok(g.x < 0.25, `only reached ${g.x}`);
  });

  it("steers proportionally, not just to the extremes", () => {
    const g = createGame();
    g.start(0);
    g.gates = [];
    g.spawnAt = 999;
    hold(g, 0.4);
    assert.ok(g.x > 0.55 && g.x < 0.72, `half a lean put the skier at ${g.x}`);
  });

  it("stays on screen at full lean", () => {
    const g = createGame();
    g.start(0);
    g.gates = [];
    g.spawnAt = 999;
    hold(g, 1);
    assert.ok(g.x <= 0.93, `skied off the edge to ${g.x}`);
  });
});

describe("Ski Slalom gates", () => {
  it("scores for passing inside the flags", () => {
    const g = createGame();
    g.start(0);
    g.x = 0.5;
    g.spawnAt = 999;
    g.gates = [{ id: 1, y: SKIER_Y, center: 0.5, width: 0.3, judged: false }];
    const ev = g.tick(0.016, signals(), 16, VIEW);
    assert.equal(ev.passed, 1);
  });

  it("costs a life for going outside them", () => {
    const g = createGame();
    g.start(0);
    g.x = 0.9;
    g.spawnAt = 999;
    g.gates = [{ id: 1, y: SKIER_Y, center: 0.3, width: 0.2, judged: false }];
    const ev = g.tick(0.016, signals(), 16, VIEW);
    assert.equal(ev.missed, 1);
    assert.equal(g.lives, 2);
  });

  it("judges each gate exactly once", () => {
    const g = createGame();
    g.start(0);
    g.x = 0.9;
    g.spawnAt = 999;
    g.gates = [{ id: 1, y: SKIER_Y, center: 0.3, width: 0.2, judged: false }];
    g.tick(0.016, signals(), 16, VIEW);
    g.tick(0.016, signals(), 32, VIEW);
    assert.equal(g.lives, 2);
  });

  it("keeps both flags on screen however narrow the gate gets", () => {
    const g = createGame({ roundMs: 20_000 });
    g.start(0);
    let now = 0;
    for (let i = 0; i < 600; i += 1) {
      now += 33;
      g.lives = 3;
      g.over = false;
      g.tick(0.033, signals(), now, VIEW);
      for (const gate of g.gates) {
        assert.ok(gate.center - gate.width / 2 > 0.02, `left flag off screen: ${gate.center}`);
        assert.ok(gate.center + gate.width / 2 < 0.98, `right flag off screen: ${gate.center}`);
      }
    }
  });

  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    assert.equal(g.tick(0.016, signals(), 1000, VIEW).over, true);
  });
});
