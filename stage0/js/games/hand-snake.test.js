import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./hand-snake.js";
import { VIEW, croppedView, fxSpy, hand, run, signals } from "./test-support.js";

/** Point the snake straight at a hand held in one spot. */
const holding = (x, y, speed = 1.6) => signals({ hands: { right: hand(x, y, speed) } });

/**
 * Curl the body into a complete circle, so the head is sitting on the oldest
 * part of its own tail — which is the only way a snake can bite itself.
 */
function looped(g, view = VIEW) {
  const rx = 60 / view.w;
  const ry = 60 / view.h;
  const steps = 90;
  g.trail = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = -Math.PI / 2 - ((steps - i) / steps) * Math.PI * 2;
    g.trail.push({ x: 0.5 + rx * Math.cos(a), y: 0.5 + ry + ry * Math.sin(a) });
  }
  g.head = { ...g.trail[g.trail.length - 1] };
  g.heading = 0;
  g.length = 3;
}

describe("Hand Snake steering", () => {
  it("turns towards the hand", () => {
    const g = createGame();
    g.start(0);
    g.heading = 0; // travelling right
    // Hand straight below the snake, so the turn has to be downward.
    run(g, holding(0.5, 0.95), { ms: 300, view: VIEW });
    assert.ok(g.heading > 0.2, `barely turned: heading ${g.heading}`);
    assert.ok(g.heading < Math.PI / 2 + 0.3, `overshot: heading ${g.heading}`);
  });

  it("cannot spin round instantly, so the hand has to lead it", () => {
    const g = createGame({ turnRate: 4 });
    g.start(0);
    g.heading = 0;
    // Hand directly behind: a snake that could turn on the spot would be
    // pointing backwards after one frame.
    g.tick(0.016, holding(0.1, 0.5), 16, VIEW);
    assert.ok(Math.abs(g.heading) <= 4 * 0.016 + 1e-9, `turned ${g.heading} in one frame`);
  });

  it("keeps moving at the same speed across the screen and down it", () => {
    // A step that is 30% of the height must also be 30% of the height wide,
    // not 30% of the width, or the snake crawls sideways and races downward.
    const across = createGame();
    across.start(0);
    across.heading = 0;
    across.tick(0.1, signals(), 100, VIEW);
    const dx = (across.head.x - 0.5) * VIEW.w;

    const down = createGame();
    down.start(0);
    down.heading = Math.PI / 2;
    down.tick(0.1, signals(), 100, VIEW);
    const dy = (down.head.y - 0.5) * VIEW.h;

    assert.ok(Math.abs(dx - dy) < 1e-6, `moved ${dx}px across but ${dy}px down`);
  });

  it("follows the hand where the player sees it, not where the crop puts it", () => {
    // Pose space and canvas space disagree on a cropped camera view; the
    // snake has to chase the hand in the picture the player is looking at.
    const view = croppedView();
    const g = createGame();
    g.start(0);
    const target = createGame().constructor.target(holding(0.8, 0.2), view);
    assert.ok(Math.abs(target.x - 0.8) > 1e-9, "expected the crop to move the hand");
    assert.ok(target.x > 0.5 && target.y < 0.5, "hand landed in the wrong quadrant");
  });
});

describe("Hand Snake scoring", () => {
  it("scores and grows when it reaches the apple", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    const grew = g.length;
    g.head = { x: 0.5, y: 0.5 };
    g.apple = { x: 0.5, y: 0.5 };
    const ev = g.tick(0.016, signals(), 16, VIEW);
    assert.ok(ev.eaten > 0, "expected a score");
    assert.ok(g.length > grew, "the snake did not grow");
    assert.equal(fx.played("pop"), true);
  });

  it("puts the next apple somewhere else", () => {
    const g = createGame();
    g.start(0);
    g.head = { x: 0.5, y: 0.5 };
    g.apple = { x: 0.5, y: 0.5 };
    g.tick(0.016, signals(), 16, VIEW);
    assert.ok(
      g.apple.x !== 0.5 || g.apple.y !== 0.5,
      "the apple stayed where it was eaten",
    );
  });

  it("costs a life for running into its own tail", () => {
    const g = createGame();
    g.start(0);
    looped(g);
    const ev = g.tick(0.016, signals(), 16, VIEW);
    assert.equal(ev.bitten, true);
    assert.equal(g.lives, 2);
  });

  it("does not count the neck as a bite", () => {
    const g = createGame();
    g.start(0);
    g.head = { x: 0.5, y: 0.5 };
    g.heading = 0;
    // The body immediately behind the head is always touching it.
    g.trail = [
      { x: 0.494, y: 0.5 },
      { x: 0.497, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ];
    const ev = g.tick(0.016, signals(), 16, VIEW);
    assert.equal(ev.bitten, false);
    assert.equal(g.lives, 3);
  });

  it("gives a moment of grace after a crash rather than biting every frame", () => {
    const g = createGame();
    g.start(0);
    looped(g);
    g.tick(0.016, signals(), 16, VIEW);
    assert.equal(g.lives, 2);
    // Put it straight back into the same crash.
    looped(g);
    g.tick(0.016, signals(), 32, VIEW);
    assert.equal(g.lives, 2, "lost a second life on the very next frame");
  });

  it("cuts the body back after a crash so the round can continue", () => {
    const g = createGame();
    g.start(0);
    looped(g);
    g.tick(0.016, signals(), 16, VIEW);
    assert.ok(g.length < 1, `still ${g.length} long after crashing`);
    assert.ok(g.trail.length <= 2, "the tail it crashed into is still there");
  });
});

describe("Hand Snake movement", () => {
  it("wraps round the edges instead of ending the round there", () => {
    const g = createGame();
    g.start(0);
    g.head = { x: 0.995, y: 0.5 };
    g.heading = 0;
    const ev = run(g, signals(), { ms: 200, view: VIEW }).last;
    assert.equal(ev.over, false);
    assert.ok(g.head.x >= 0 && g.head.x <= 1, `left the screen at ${g.head.x}`);
    assert.ok(g.head.x < 0.5, "expected to come back on the far side");
  });

  it("holds still while the player is out of shot", () => {
    const g = createGame();
    g.start(0);
    const was = { ...g.head };
    run(g, signals({ inFrame: false }), { ms: 500, view: VIEW });
    assert.deepEqual(g.head, was);
  });

  it("counts the arm travelling, not the apples caught", () => {
    const g = createGame();
    g.start(0);
    // Swing the hand back and forth without ever meeting an apple.
    for (let i = 0; i < 6; i += 1) {
      g.tick(0.05, holding(0.3, 0.5, 2.4), i * 100 + 50, VIEW);
      g.tick(0.05, holding(0.3, 0.5, 0.1), i * 100 + 100, VIEW);
    }
    assert.ok(g.summary().actions.reach >= 3, "the reaching went uncounted");
    assert.equal(g.score, 0);
  });

  it("speeds up as the levels come", () => {
    const g = createGame();
    g.start(0);
    const early = g.speed();
    g.level = g.maxLevel;
    assert.ok(g.speed() > early * 1.4, `level ${g.maxLevel} is barely faster`);
  });
});
