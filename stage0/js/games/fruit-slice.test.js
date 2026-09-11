import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "./fruit-slice.js";
import { VIEW, croppedView, fxSpy, hand, noHand, signals } from "./test-support.js";

/** Park a single item in the middle of the screen with no others in play. */
function only(game, over = {}) {
  game.items = [
    {
      id: 1,
      bomb: false,
      kind: { name: "apple", skin: "#ef4444", flesh: "#fee2e2", size: 1 },
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      spin: 0,
      angle: 0,
      size: 1,
      sliced: 0,
      counted: false,
      ...over,
    },
  ];
  game.spawnTimer = 999;
  return game.items[0];
}

describe("Fruit Slice feedback", () => {
  it("sprays juice the colour of the flesh when it cuts", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    const item = only(g);
    g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5, 4) } }), 16, VIEW);
    assert.equal(fx.played("slice"), true);
    assert.ok(g.particles.length > 0);
    assert.equal(g.particles[0].color, item.kind.flesh);
  });

  it("goes bang on a bomb", () => {
    const fx = fxSpy();
    const g = createGame({ fx });
    g.start(0);
    only(g, { bomb: true });
    g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5, 4) } }), 16, VIEW);
    assert.equal(fx.played("crash"), true);
    assert.equal(fx.played("slice"), false, "a bomb is not a score");
  });
});

describe("Fruit Slice slicing", () => {
  it("slices fruit a fast hand passes through", () => {
    const g = createGame();
    g.start(0);
    only(g);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5, 4) } }), 16, VIEW);
    assert.equal(ev.sliced, 1);
    assert.equal(g.score, 1);
  });

  /*
   * The game asks for a fast hand and then, on the old point test, punished
   * one: the quicker the swipe, the further it travelled between two camera
   * readings, and the better its chances of stepping clean over the fruit.
   */
  it("slices fruit the blade crossed between readings", () => {
    const g = createGame();
    g.start(0);
    only(g);
    g.tick(0.016, signals({ hands: { left: hand(0.15, 0.5, 4) } }), 16, VIEW);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.85, 0.5, 4) } }), 32, VIEW);
    assert.equal(ev.sliced, 1);
  });

  it("spares fruit the blade crossed well clear of", () => {
    const g = createGame();
    g.start(0);
    only(g, { y: 0.1 });
    g.tick(0.016, signals({ hands: { left: hand(0.15, 0.6, 4) } }), 16, VIEW);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.85, 0.6, 4) } }), 32, VIEW);
    assert.equal(ev.sliced, 0);
  });

  it("does not cut a line across the screen after a pause", () => {
    const g = createGame();
    g.start(0);
    only(g);
    g.tick(0.016, signals({ hands: { left: hand(0.05, 0.5, 4) } }), 16, VIEW);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.95, 0.5, 4) } }), 4000, VIEW);
    assert.equal(ev.sliced, 0);
  });

  it("ignores a hand resting on the fruit", () => {
    const g = createGame();
    g.start(0);
    only(g);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5, 0.2) } }), 16, VIEW);
    assert.equal(ev.sliced, 0, "a still hand must not farm points");
    assert.equal(g.score, 0);
  });

  it("ignores a fast hand nowhere near the fruit", () => {
    const g = createGame();
    g.start(0);
    only(g);
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.05, 0.95, 6) } }), 16, VIEW);
    assert.equal(ev.sliced, 0);
  });

  it("ignores a hand that is not being tracked", () => {
    const g = createGame();
    g.start(0);
    only(g);
    const ghost = { ...hand(0.5, 0.5, 6), visible: false };
    const ev = g.tick(0.016, signals({ hands: { left: ghost, right: noHand } }), 16, VIEW);
    assert.equal(ev.sliced, 0);
  });
});

describe("Fruit Slice hazards", () => {
  it("costs a life for slicing a bomb", () => {
    const g = createGame();
    g.start(0);
    only(g, { bomb: true });
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5, 5) } }), 16, VIEW);
    assert.equal(ev.bomb, true);
    assert.equal(g.lives, 2);
    assert.equal(g.score, 0);
  });

  it("costs a life for letting fruit fall past", () => {
    const g = createGame();
    g.start(0);
    only(g, { y: 1.19, vy: 0.5 });
    const ev = g.tick(0.05, signals(), 50, VIEW);
    assert.equal(ev.dropped, 1);
    assert.equal(g.lives, 2);
  });

  it("does not punish a bomb you let fall", () => {
    const g = createGame();
    g.start(0);
    only(g, { bomb: true, y: 1.19, vy: 0.5 });
    const ev = g.tick(0.05, signals(), 50, VIEW);
    assert.equal(ev.dropped, 0);
    assert.equal(g.lives, 3);
  });

  it("ends the round when the last life goes", () => {
    const g = createGame({ lives: 1 });
    g.start(0);
    only(g, { bomb: true });
    const ev = g.tick(0.016, signals({ hands: { left: hand(0.5, 0.5, 5) } }), 16, VIEW);
    assert.equal(ev.over, true);
  });
});

describe("Fruit Slice pacing", () => {
  it("ends when the clock runs out", () => {
    const g = createGame({ roundMs: 1000 });
    g.start(0);
    const ev = g.tick(0.016, signals(), 1000, VIEW);
    assert.equal(ev.over, true);
  });

  it("freezes while the player is out of frame", () => {
    const g = createGame();
    g.start(0);
    const item = only(g, { vy: 1 });
    g.tick(0.5, signals({ inFrame: false }), 500, VIEW);
    assert.equal(item.y, 0.5);
  });

  it("throws fruit that arcs up and comes back down", () => {
    const g = createGame();
    g.start(0);
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    assert.ok(g.items.length > 0, "expected a spawn");
    for (const item of g.items) {
      assert.ok(item.vy < 0, "fruit should be launched upward");
      assert.ok(item.x > 0.1 && item.x < 0.9, `spawned off screen at ${item.x}`);
    }
  });
});

describe("Fruit Slice pace", () => {
  /** The first fruit thrown once the game is sitting at `level`. */
  const thrownAt = (level) => {
    const g = createGame();
    g.start(0);
    g.level = level;
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    return g.items[0];
  };

  it("floats the first fruit up slowly and speeds it up with the levels", () => {
    const early = thrownAt(1);
    const late = thrownAt(8);
    assert.ok(
      late.gravity > early.gravity * 1.5,
      `level 8 gravity ${late.gravity} is not well above level 1's ${early.gravity}`,
    );
  });

  it("keeps sending it to the same height, however hard the level", () => {
    // Only the time to react changes. Fruit that peaked lower as it sped up
    // would be out of reach exactly when it got hard to hit.
    for (const level of [1, 4, 8]) {
      const item = thrownAt(level);
      // Height climbed before gravity cancels the launch: v^2 / 2g.
      const peak = item.y - (item.vy * item.vy) / (2 * item.gravity);
      assert.ok(
        peak > 0.2 && peak < 0.42,
        `level ${level} peaks at ${peak}, away from the hands`,
      );
    }
  });

  it("finishes an arc under the gravity it was thrown with", () => {
    // Levelling up mid-flight must not bend a fruit already in the air.
    const g = createGame();
    g.start(0);
    g.spawnTimer = 0;
    g.tick(0.016, signals(), 16, VIEW);
    const item = g.items[0];
    const was = item.gravity;
    g.level = 8;
    g.spawnTimer = 999;
    g.tick(0.05, signals(), 66, VIEW);
    assert.equal(item.gravity, was);
  });
});

/**
 * Throw one fruit and follow it to the top of its arc.
 *
 * The game is restarted whenever it ends, because nobody is playing in a test
 * and a round of dropped fruit is a short one.
 */
function arcs(count, fps = 60) {
  const dt = 1 / fps;
  const g = createGame();
  g.start(0);
  const s = signals();
  const flying = new Map();
  const done = [];
  let now = 0;
  for (let i = 0; i < 60000 && done.length < count; i += 1) {
    if (g.over) g.start(now);
    g.tick(dt, s, (now += dt * 1000), VIEW);
    for (const item of g.items) {
      if (item.sliced > 0) continue;
      const f = flying.get(item.id) ?? { top: item.y, air: 0, rose: false };
      f.top = Math.min(f.top, item.y);
      f.air += dt;
      if (item.y < 1.05) f.rose = true;
      flying.set(item.id, f);
    }
    for (const [id, f] of flying) {
      const item = g.items.find((it) => it.id === id);
      if (!item) {
        flying.delete(id); // the round reset under it; not an arc we saw out
        continue;
      }
      if (!f.rose || item.y < 1.12) continue;
      done.push(f);
      flying.delete(id);
    }
  }
  return done;
}

/** One fruit, placed by hand, with an id the game will not hand out itself. */
const fruitAt = (y) => ({
  id: 9001,
  kind: { name: "plum", skin: "#a855f7", flesh: "#f5d0fe", size: 0.85 },
  bomb: false,
  x: 0.5,
  y,
  vx: 0,
  vy: 0,
  spin: 0,
  angle: 0,
  size: 1,
  sliced: 0,
  counted: false,
});

describe("Fruit Slice arcs", () => {
  it("throws the fruit up to where the player's hands are", () => {
    /*
     * The whole game is reaching out and swiping, so the fruit has to come to
     * the player. Standing in front of a phone the shoulders sit around 0.35
     * of the way down the picture and the hands work in a band either side of
     * that; an arc peaking below it is one you have to stoop for, and no
     * amount of swipe detection makes that fun.
     */
    const tops = arcs(80).map((f) => f.top);
    const worst = Math.max(...tops);
    const best = Math.min(...tops);
    assert.ok(worst < 0.55, `the lowest arc only reached ${worst.toFixed(3)}`);
    assert.ok(best > 0.1, `an arc went up to ${best.toFixed(3)}, off the top`);
  });

  it("climbs into the hands whichever way the phone is held", () => {
    /*
     * The arc is placed in screen fractions, but the hands arrive through the
     * camera picture, and on a landscape phone that picture is cropped hard:
     * a hand at shoulder height lands near the top of the screen rather than a
     * third of the way down. So the check that matters is not where the fruit
     * is on the glass, it is what the player has to do with their arms to meet
     * it - and that has to stay somewhere between raising them and resting
     * them, in either orientation.
     */
    const lowest = Math.max(...arcs(40).map((f) => f.top));
    for (const [held, view] of [
      ["upright", croppedView(390, 844, 480, 640)],
      ["on its side", croppedView(844, 390, 480, 640)],
    ]) {
      // poseY is a straight line, so two samples are enough to run it backwards.
      const a = view.poseY(0.2) / view.h;
      const b = view.poseY(0.6) / view.h;
      const asPose = (y) => 0.2 + ((y - a) * 0.4) / (b - a);
      const reach = asPose(lowest);
      assert.ok(
        reach < 0.55,
        `held ${held}, the weakest throw only asks for a hand at ${reach.toFixed(2)}, ` +
          `below where they rest`,
      );
    }
  });

  it("leaves the fruit up there long enough to be hit", () => {
    const air = arcs(40).map((f) => f.air);
    const shortest = Math.min(...air);
    assert.ok(shortest > 1.2, `a fruit was only in play for ${shortest.toFixed(2)}s`);
  });

  it("throws the same arc whatever the frame rate", () => {
    // The same throw, not merely a similar one: every fruit the game spawns
    // gets a slightly different launch, so comparing what it happened to
    // throw at two frame rates measures the dice and not the physics.
    const peak = (fps) => {
      const g = createGame();
      g.start(0);
      const s = signals();
      g.tick(1 / fps, s, 1000 / fps, VIEW);
      g.items = [{ ...fruitAt(1.12), vy: -2 }];
      let now = 1000 / fps;
      let top = 1.12;
      for (let i = 0; i < Math.round(2 * fps); i += 1) {
        g.spawnTimer = 999;
        g.tick(1 / fps, s, (now += 1000 / fps), VIEW);
        const item = g.items.find((it) => it.id === 9001);
        if (!item) break;
        top = Math.min(top, item.y);
      }
      return top;
    };
    const slow = peak(30);
    const fast = peak(120);
    // Tight, because the arc is solved rather than approximated: all that is
    // left is which side of the peak the frames happen to land on.
    assert.ok(
      Math.abs(slow - fast) < 0.002,
      `the same throw peaks at ${slow.toFixed(4)} at 30fps but ${fast.toFixed(4)} at 120fps`,
    );
  });

  it("drops the two halves on the same curve the whole fruit was on", () => {
    // Cutting a fruit changes what it looks like, not what gravity does to it.
    const fall = (sliced) => {
      const g = createGame();
      g.start(0);
      const s = signals();
      g.tick(1 / 60, s, 16, VIEW);
      g.items = [{ ...fruitAt(0.6), vy: -0.5, sliced: sliced ? 0.01 : 0 }];
      let now = 16;
      for (let i = 0; i < 20; i += 1) {
        g.spawnTimer = 999;
        g.tick(1 / 60, s, (now += 1000 / 60), VIEW);
      }
      return g.items.find((it) => it.id === 9001).y;
    };
    assert.ok(
      Math.abs(fall(false) - fall(true)) < 1e-12,
      `a whole fruit fell to ${fall(false)} but a half to ${fall(true)}`,
    );
  });
});
