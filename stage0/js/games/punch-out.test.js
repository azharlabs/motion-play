import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame, PADS } from "./punch-out.js";
import { VIEW, croppedView, fxSpy, hand, signals } from "./test-support.js";

const leftPad = PADS.find((p) => p.side === "left");

/** The pose coordinate that appears at a given point on screen. */
const poseAt = (view, px, py) => ({
  x: (px - view.poseX(0)) / (view.poseX(1) - view.poseX(0)),
  y: (py - view.poseY(0)) / (view.poseY(1) - view.poseY(0)),
});

/** Light a known pad so the test does not depend on the shuffle. */
function light(game, pad = leftPad, left = 2) {
  game.active = { pad, left, total: 2 };
  game.restTimer = 999;
  return game.active;
}

/*
 * On a phone the camera picture is cropped to fill the screen, so a pose
 * coordinate and a screen position are not the same number. Punching is judged
 * against a pad the player can see, so it has to be judged in what they see.
 */
describe("Punch Out against the cropped camera picture", () => {
  const view = croppedView();
  // The outermost pad, where the crop pulls the two spaces furthest apart.
  const outer = PADS.find((p) => p.id === "left-low");

  const punchAt = (view, at) => {
    const g = createGame();
    g.start(0);
    light(g, outer);
    return g.tick(0.016, signals({ hands: { left: hand(at.x, at.y, 4) } }), 16, view);
  };

  it("lands a punch thrown at where the pad appears", () => {
    const seen = poseAt(view, outer.x * view.w, outer.y * view.h);
    assert.equal(punchAt(view, seen).landed > 0, true, "punching the pad you can see should score");
  });

  it("is not fooled by a hand that only matches the raw camera numbers", () => {
    // Where the old, stretched maths wanted the hand: well off to one side of
    // the pad once the picture is cropped.
    assert.equal(punchAt(view, outer).landed, 0, "that spot is nowhere near the pad on screen");
  });

  it("still works when nothing is cropped", () => {
    assert.equal(punchAt(VIEW, outer).landed > 0, true);
  });
});

describe("Punch Out feedback", () => {
  it("thumps and sparks on a landed punch", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    light(g);
    g.tick(0.016, signals({ hands: { left: hand(leftPad.x, leftPad.y, 4) } }), 16, VIEW);
    assert.equal(fx.played("thud"), true);
    assert.ok(g.particles.length > 0);
  });

  it("clicks when a new pad lights, before you have looked at it", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    g.restTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    assert.ok(g.active, "a pad should be live");
    assert.equal(fx.played("tick"), true);
  });

  it("sounds the miss when the window closes", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    light(g, leftPad, 0.01);
    g.tick(0.05, signals(), 50, VIEW);
    assert.equal(fx.played("crash"), true);
  });
});

describe("Punch Out landing", () => {
  it("lands a fast punch from the matching hand", () => {
    const g = createGame();
    g.start(0);
    light(g);
    const punch = hand(leftPad.x, leftPad.y, 4);
    const ev = g.tick(0.016, signals({ hands: { left: punch } }), 16, VIEW);
    assert.equal(ev.landed, 1);
    assert.equal(g.active, null, "the pad should go dark once hit");
  });

  it("lands a punch that was already past the pad by the next reading", () => {
    const g = createGame();
    g.start(0);
    light(g);
    g.tick(0.016, signals({ hands: { left: hand(leftPad.x, leftPad.y + 0.3, 4) } }), 16, VIEW);
    const ev = g.tick(
      0.016,
      signals({ hands: { left: hand(leftPad.x, leftPad.y - 0.3, 4) } }),
      32,
      VIEW,
    );
    assert.equal(ev.landed, 1);
  });

  it("ignores the wrong hand on the pad", () => {
    const g = createGame();
    g.start(0);
    light(g);
    const punch = hand(leftPad.x, leftPad.y, 4);
    const ev = g.tick(0.016, signals({ hands: { right: punch } }), 16, VIEW);
    assert.equal(ev.landed, 0, "left pad must want the left hand");
  });

  it("ignores a hand resting on the pad", () => {
    const g = createGame();
    g.start(0);
    light(g);
    const resting = hand(leftPad.x, leftPad.y, 0.1);
    const ev = g.tick(0.016, signals({ hands: { left: resting } }), 16, VIEW);
    assert.equal(ev.landed, 0);
  });

  it("ignores a fast hand that misses the pad", () => {
    const g = createGame();
    g.start(0);
    light(g);
    const wild = hand(0.5, 0.95, 6);
    const ev = g.tick(0.016, signals({ hands: { left: wild } }), 16, VIEW);
    assert.equal(ev.landed, 0);
  });
});

describe("Punch Out misses", () => {
  it("costs a life when the pad times out", () => {
    const g = createGame();
    g.start(0);
    light(g, leftPad, 0.02);
    const ev = g.tick(0.033, signals(), 33, VIEW);
    assert.equal(ev.missed, 1);
    assert.equal(g.lives, 2);
  });

  it("ends the round when the last life goes", () => {
    const g = createGame({ lives: 1 });
    g.start(0);
    light(g, leftPad, 0.02);
    assert.equal(g.tick(0.033, signals(), 33, VIEW).over, true);
  });
});

describe("Punch Out pacing", () => {
  it("never lights the same pad twice running", () => {
    const g = createGame();
    g.start(0);
    const sequence = [];
    let now = 0;
    for (let i = 0; i < 3000; i += 1) {
      now += 33;
      g.lives = 3;
      g.over = false;
      g.tick(0.033, signals(), now, VIEW);
      const id = g.active?.pad.id;
      if (id && id !== sequence.at(-1)) sequence.push(id);
    }

    assert.ok(sequence.length > 10, `only saw ${sequence.length} pads light up`);
    for (let i = 1; i < sequence.length; i += 1) {
      assert.notEqual(sequence[i], sequence[i - 1], `pad ${sequence[i]} lit twice running`);
    }
  });

  it("uses every pad over a long round", () => {
    const g = createGame();
    g.start(0);
    const seen = new Set();
    let now = 0;
    for (let i = 0; i < 4000; i += 1) {
      now += 33;
      g.lives = 3;
      g.over = false;
      g.tick(0.033, signals(), now, VIEW);
      if (g.active) seen.add(g.active.pad.id);
    }
    assert.equal(seen.size, PADS.length, `only saw ${[...seen].join(", ")}`);
  });

  it("shortens the window as you climb the levels", () => {
    const g = createGame();
    g.start(0);
    g.restTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    const early = g.active.total;

    g.level = g.maxLevel;
    g.active = null;
    g.restTimer = 0;
    g.tick(0.016, signals(), 2000, VIEW);
    assert.ok(g.active.total < early, `top level ${g.active.total}s vs level one ${early}s`);
  });

  it("leaves the window alone for a player who is not landing punches", () => {
    const g = createGame({ roundMs: 10_000 });
    g.start(0);
    g.restTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    const early = g.active.total;

    g.active = null;
    g.restTimer = 0;
    g.tick(0.016, signals(), 9000, VIEW);
    assert.equal(g.active.total, early);
  });

  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    assert.equal(g.tick(0.016, signals(), 1000, VIEW).over, true);
  });
});
