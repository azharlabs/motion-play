import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./balloon-pop.js";
import { VIEW, fxSpy } from "./test-support.js";

const hand = (x, y) => ({ x, y, vx: 0, vy: 0, speed: 0, visible: true });
const none = { x: null, y: null, vx: 0, vy: 0, speed: 0, visible: false };

function signals(over = {}) {
  return { inFrame: true, hands: { left: none, right: none }, ...over };
}

/** Put one balloon at a known spot with no others in play. */
function only(game, x, y) {
  game.balloons = [
    {
      id: 99,
      x,
      y,
      drift: 0,
      wobble: 0,
      size: 1,
      speed: 0,
      color: "#f00",
      shine: "#fbb",
      popping: 0,
    },
  ];
  game.spawnTimer = 999;
  return game.balloons[0];
}

describe("Balloon Pop scoring", () => {
  it("pops a balloon a hand is touching", () => {
    const g = createGame();
    g.start(0);
    only(g, 0.5, 0.5);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5), right: none } }), 16, VIEW);
    assert.equal(ev.popped, 1);
    assert.equal(g.score, 1);
    assert.equal(g.combo, 1);
  });

  it("leaves a balloon alone when the hand is nowhere near", () => {
    const g = createGame();
    g.start(0);
    only(g, 0.2, 0.2);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.9, 0.9), right: none } }), 16, VIEW);
    assert.equal(ev.popped, 0);
    assert.equal(g.score, 0);
  });

  it("ignores a hand that is not being tracked", () => {
    const g = createGame();
    g.start(0);
    only(g, 0.5, 0.5);
    const ev = g.tick(
      0.016,
      signals({ hands: { left: { ...hand(0.5, 0.5), visible: false }, right: none } }),
      16,
      VIEW,
    );
    assert.equal(ev.popped, 0);
  });

  /*
   * The camera finds the hands maybe fifteen times a second while the game
   * draws sixty, so a hand moving at any speed worth calling a swat is never
   * caught on the balloon: it is short of it in one reading and past it in the
   * next. What the player felt was a clean hit.
   */
  it("pops a balloon the hand went straight through between readings", () => {
    const g = createGame();
    g.start(0);
    only(g, 0.5, 0.5);
    g.tick(0.016, signals({ hands: { left: hand(0.2, 0.5), right: none } }), 16, VIEW);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.8, 0.5), right: none } }), 32, VIEW);
    assert.equal(ev.popped, 1);
  });

  it("leaves a balloon the hand swept past to one side", () => {
    const g = createGame();
    g.start(0);
    only(g, 0.5, 0.15);
    g.tick(0.016, signals({ hands: { left: hand(0.2, 0.6), right: none } }), 16, VIEW);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.8, 0.6), right: none } }), 32, VIEW);
    assert.equal(ev.popped, 0);
  });

  it("does not sweep the screen when a hand comes back after a pause", () => {
    const g = createGame();
    g.start(0);
    only(g, 0.5, 0.5);
    g.tick(0.016, signals({ hands: { left: hand(0.05, 0.5), right: none } }), 16, VIEW);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.95, 0.5), right: none } }), 4000, VIEW);
    assert.equal(ev.popped, 0);
  });

  it("does not sweep the screen after tracking is lost and regained", () => {
    const g = createGame();
    g.start(0);
    only(g, 0.5, 0.5);
    g.tick(0.016, signals({ hands: { left: hand(0.05, 0.5), right: none } }), 16, VIEW);
    g.tick(0.016, signals({ inFrame: false }), 32, VIEW);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.95, 0.5), right: none } }), 48, VIEW);
    assert.equal(ev.popped, 0);
  });

  it("pays a bonus once a combo is running", () => {
    const g = createGame();
    g.start(0);
    g.combo = 5;
    only(g, 0.5, 0.5);
    g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5), right: none } }), 16, VIEW);
    assert.ok(g.score > 1, `expected a bonus, got ${g.score}`);
  });
});

describe("Balloon Pop lives", () => {
  it("costs a life when a balloon escapes off the top", () => {
    const g = createGame();
    g.start(0);
    const b = only(g, 0.5, -0.11);
    b.speed = 1;
    const ev = g.tick(0.05, signals(), 50, VIEW);
    assert.equal(ev.missed, 1);
    assert.equal(g.lives, 2);
    assert.equal(g.combo, 0);
  });

  it("ends the round when the last life goes", () => {
    const g = createGame({ lives: 1 });
    g.start(0);
    const b = only(g, 0.5, -0.11);
    b.speed = 1;
    const ev = g.tick(0.05, signals(), 50, VIEW);
    assert.equal(ev.over, true);
    assert.equal(g.over, true);
  });

  it("resets the combo on a miss", () => {
    const g = createGame();
    g.start(0);
    g.combo = 4;
    const b = only(g, 0.5, -0.11);
    b.speed = 1;
    g.tick(0.05, signals(), 50, VIEW);
    assert.equal(g.combo, 0);
  });
});

describe("Balloon Pop feedback", () => {
  it("pops out loud and throws confetti", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    only(g, 0.5, 0.5);
    g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5), right: none } }), 16, VIEW);
    assert.equal(fx.played("pop"), true);
    assert.ok(g.particles.length > 0, "expected sparks where the balloon was");
  });

  it("sounds the loss when one gets away", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    only(g, 0.5, -0.11).speed = 1;
    g.tick(0.05, signals(), 50, VIEW);
    assert.equal(fx.played("crash"), true);
  });
});

describe("Balloon Pop pacing", () => {
  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    const ev = g.tick(0.016, signals(), 1000, VIEW);
    assert.equal(ev.over, true);
  });

  it("freezes while the player is out of frame", () => {
    const g = createGame();
    g.start(0);
    const b = only(g, 0.5, 0.5);
    b.speed = 1;
    g.tick(0.5, signals({ inFrame: false }), 500, VIEW);
    assert.equal(b.y, 0.5, "balloons should not drift while tracking is lost");
  });

  it("keeps spawning balloons inside the frame", () => {
    const g = createGame();
    g.start(0);
    let now = 0;
    for (let i = 0; i < 600; i += 1) {
      now += 33;
      g.tick(0.033, signals(), now, VIEW);
      g.lives = 3; // ignore misses, we only care about placement here
      g.over = false;
    }
    assert.ok(g.balloons.length > 0, "expected balloons in play");
    for (const b of g.balloons) {
      assert.ok(b.x > 0.02 && b.x < 0.98, `balloon drifted to x=${b.x}`);
    }
  });
});
