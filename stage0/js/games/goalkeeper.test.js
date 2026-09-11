import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./goalkeeper.js";
import { VIEW, fxSpy, hand, signals } from "./test-support.js";

/** A single shot already at the point of arrival. */
function shot(game, { x = 0.5, y = 0.4, age = 1, flight = 1 } = {}) {
  game.shots = [{ id: 1, x, y, born: null, flight, age, settled: false }];
  game.spawnTimer = 999;
  return game.shots[0];
}

describe("Goalkeeper feedback", () => {
  it("thumps on a save", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    shot(g, { x: 0.3, y: 0.4 });
    g.tick(0.016, signals({ hands: { left: hand(0.3, 0.4) } }), 16, VIEW);
    assert.equal(fx.played("thud"), true);
    assert.ok(g.particles.length > 0, "expected a puff off the glove");
  });

  it("sounds the strike so you can move before you spot the ball", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    assert.equal(fx.played("tick"), true);
  });
});

describe("Goalkeeper saves", () => {
  it("saves when a hand is on the ball as it lands", () => {
    const g = createGame();
    g.start(0);
    shot(g, { x: 0.3, y: 0.4 });
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.3, 0.4) } }), 16, VIEW);
    assert.equal(ev.saved, 1);
    assert.equal(g.lives, 3);
  });

  /*
   * The ball arrives on one frame and the answer is settled there and then, so
   * a dive only counted if a camera reading happened to catch the hand mid
   * flight. The hand that swept through the ball a fifteenth of a second
   * earlier was a save by any human account.
   */
  it("saves a ball the diving hand swept through", () => {
    const g = createGame();
    g.start(0);
    shot(g, { x: 0.3, y: 0.4, age: 0.5 });
    g.tick(0.016, signals({ hands: { left: hand(0.3, 0.1) } }), 16, VIEW);
    const ev = g.tick(0.5, signals({ hands: { left: hand(0.3, 0.7) } }), 32, VIEW);
    assert.equal(ev.saved, 1);
  });

  it("concedes when both hands are elsewhere", () => {
    const g = createGame();
    g.start(0);
    shot(g, { x: 0.3, y: 0.4 });
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.9, 0.9) } }), 16, VIEW);
    assert.equal(ev.conceded, 1);
    assert.equal(g.lives, 2);
  });

  it("accepts either hand", () => {
    const g = createGame();
    g.start(0);
    shot(g, { x: 0.7, y: 0.4 });
    const ev = g.tick(0.016, signals({ hands: { right: hand(0.7, 0.4) } }), 16, VIEW);
    assert.equal(ev.saved, 1);
  });

  it("does not judge the shot before it arrives", () => {
    const g = createGame();
    g.start(0);
    const s = shot(g, { age: 0.1, flight: 1.5 });
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.9, 0.9) } }), 16, VIEW);
    assert.equal(ev.conceded, 0);
    assert.equal(s.settled, false);
  });

  it("judges each shot exactly once", () => {
    const g = createGame();
    g.start(0);
    shot(g, { x: 0.5, y: 0.4 });
    const s = signals({ hands: { left: hand(0.9, 0.9) } });
    g.tick(0.016, s, 16, VIEW);
    const second = g.tick(0.016, s, 32, VIEW);
    assert.equal(second.conceded, 0);
    assert.equal(g.lives, 2);
  });

  it("ends the round when the last life goes", () => {
    const g = createGame({ lives: 1 });
    g.start(0);
    shot(g);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.95, 0.95) } }), 16, VIEW);
    assert.equal(ev.over, true);
  });
});

describe("Goalkeeper pacing", () => {
  it("aims every shot somewhere reachable on screen", () => {
    const g = createGame();
    g.start(0);
    let now = 0;
    for (let i = 0; i < 900; i += 1) {
      now += 33;
      g.lives = 3;
      g.over = false;
      g.tick(0.033, signals(), now, VIEW);
      for (const s of g.shots) {
        assert.ok(s.x > 0.1 && s.x < 0.9, `shot off screen at x=${s.x}`);
        assert.ok(s.y > 0.15 && s.y < 0.75, `shot off screen at y=${s.y}`);
      }
    }
  });

  it("speeds shots up as you climb the levels", () => {
    const g = createGame();
    g.start(0);
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    const early = g.shots.at(-1).flight;

    g.level = g.maxLevel;
    g.shots = [];
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 2000, VIEW);
    const late = g.shots.at(-1).flight;
    assert.ok(late < early, `top level (${late}s) should beat level one (${early}s)`);
  });

  it("does not get harder just because time passed", () => {
    const g = createGame({ roundMs: 10_000 });
    g.start(0);
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    const early = g.shots.at(-1).flight;

    g.shots = [];
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 9000, VIEW);
    assert.equal(g.shots.at(-1).flight, early, "a player who has not scored is not pushed");
  });

  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    assert.equal(g.tick(0.016, signals(), 1000, VIEW).over, true);
  });
});
