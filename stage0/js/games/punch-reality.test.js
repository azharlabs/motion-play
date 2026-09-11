import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MotionSignals } from "../signals.js";
import { IDX } from "../landmarks.js";
import { createGame as createPunchOut } from "./punch-out.js";
import { createGame as createFruitSlice } from "./fruit-slice.js";
import { VIEW, fxSpy } from "./test-support.js";

/**
 * Can a real punch actually land, and a real swipe actually cut?
 *
 * The other game tests hand the games a tidy signal object with the speed
 * already set. These drive a body through the actual filter chain instead, so
 * the position and the speed the game sees are the ones a player's movement
 * really produces — lag, smoothing and sampling included. That is where a hit
 * gets lost: a punch is over in about a sixth of a second, and the game only
 * gets to look at it a handful of times on the way through.
 */

const FPS = 30;
const STEP = 1000 / FPS;
const W = 0.2;

/**
 * A standing body with one hand placed where we say, in raw camera space.
 * The fingers are placed too, since the hand point averages them in.
 */
function bodyWith(side, hx, hy, hz = 0) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
  const put = (i, x, y, z = 0) => {
    pts[i] = { x, y, z, visibility: 0.95 };
  };
  put(IDX.NOSE, 0.5, 0.2);
  put(IDX.LEFT_SHOULDER, 0.5 + W / 2, 0.32);
  put(IDX.RIGHT_SHOULDER, 0.5 - W / 2, 0.32);
  put(IDX.LEFT_HIP, 0.57, 0.56);
  put(IDX.RIGHT_HIP, 0.43, 0.56);
  put(IDX.LEFT_ANKLE, 0.57, 0.92);
  put(IDX.RIGHT_ANKLE, 0.43, 0.92);

  // The idle hand stays down by the hip.
  const idle = side === "left" ? [0.62, 0.56] : [0.38, 0.56];
  const other = side === "left" ? "right" : "left";
  for (const [name, [x, y]] of [
    [side, [hx, hy]],
    [other, idle],
  ]) {
    const w = name === "left" ? IDX.LEFT_WRIST : IDX.RIGHT_WRIST;
    const idx = name === "left" ? IDX.LEFT_INDEX : IDX.RIGHT_INDEX;
    const pinky = name === "left" ? IDX.LEFT_PINKY : IDX.RIGHT_PINKY;
    const z = name === side ? hz : 0;
    put(w, x, y, z);
    // Knuckles sit a little beyond the wrist, as they do on a real arm.
    put(idx, x, y - 0.02, z);
    put(pinky, x + 0.015, y - 0.015, z);
  }
  return pts;
}

/** Calibrate on a still body and return the live signal source. */
function ready(side) {
  const s = new MotionSignals({ mode: "upper" });
  s.startCalibration(0);
  let t = 0;
  const idle = side === "left" ? [0.62, 0.56] : [0.38, 0.56];
  for (; t <= 2000; t += STEP) s.update(bodyWith(side, idle[0], idle[1]), t);
  return { s, t, idle };
}

/**
 * Move a hand from `from` to `to` over `ms`, feeding every frame to the game.
 * `settle` holds the hand at the end, which is what a punch that stops on the
 * pad looks like.
 */
function swing(game, s, side, { from, to, ms, settle = 200, t0, view = VIEW }) {
  let t = t0;
  const totals = { landed: 0, sliced: 0 };
  const frames = Math.max(1, Math.round(ms / STEP));
  const seen = [];

  for (let i = 1; i <= frames; i += 1) {
    t += STEP;
    // Ease out, the way an arm decelerates as it arrives.
    const p = i / frames;
    const eased = 1 - (1 - p) * (1 - p);
    const x = from[0] + (to[0] - from[0]) * eased;
    const y = from[1] + (to[1] - from[1]) * eased;
    const state = s.update(bodyWith(side, x, y), t);
    seen.push(state.hands[side].speed);
    const r = game.tick(STEP / 1000, state, t, view);
    totals.landed += r.landed ?? 0;
    totals.sliced += r.sliced ?? 0;
  }

  for (let e = 0; e < settle; e += STEP) {
    t += STEP;
    const state = s.update(bodyWith(side, to[0], to[1]), t);
    const r = game.tick(STEP / 1000, state, t, view);
    totals.landed += r.landed ?? 0;
    totals.sliced += r.sliced ?? 0;
  }

  return { ...totals, peakSpeed: Math.max(...seen), t };
}

describe("A real punch lands", () => {
  /** Light a pad and report it, so the test aims at whatever the game chose. */
  function litPad(game, s, side, idle, t0) {
    let t = t0;
    for (let i = 0; i < 60 && !game.active; i += 1) {
      t += STEP;
      game.tick(STEP / 1000, s.update(bodyWith(side, idle[0], idle[1]), t), t, VIEW);
    }
    return { pad: game.active?.pad, t };
  }

  it("registers a punch thrown at the lit pad", () => {
    // Try every pad: which one lights is random, and a game that only scores
    // on some of them is still broken.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const game = createPunchOut({ fx: fxSpy() });
      game.start(0);
      // Aim with the hand the pad belongs to.
      let side = "left";
      let { s, t, idle } = ready(side);
      let { pad, t: t2 } = litPad(game, s, side, idle, t);
      if (!pad) continue;
      if (pad.side !== side) {
        side = pad.side;
        ({ s, t, idle } = ready(side));
        ({ pad, t: t2 } = litPad(game, s, side, idle, t));
        if (!pad) continue;
      }

      // The pad sits at pose (pad.x, pad.y) in display space; mirror it back
      // into the raw camera space the landmarks live in.
      const target = [1 - pad.x, pad.y];
      const out = swing(game, s, side, {
        from: idle,
        to: target,
        ms: 170,
        t0: t2,
      });

      assert.ok(
        out.landed > 0,
        `punch at the ${pad.id} pad did not register (peak speed ${out.peakSpeed.toFixed(1)})`,
      );
    }
  });
});

describe("A jab thrown at the camera counts", () => {
  /**
   * A straight punch forward. The hand barely crosses the picture — it only
   * drifts towards the pad — but depth drops sharply as it comes at the lens,
   * which is the whole of the movement.
   */
  it("registers a punch that comes almost straight forward", () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      // A long fuse on the pad: this is about whether the jab reads as a
      // punch, not about beating the clock.
      const game = createPunchOut({ fx: fxSpy(), holdMs: 8000, fastestHoldMs: 8000 });
      game.start(0);
      const side = "left";
      let { s, t, idle } = ready(side);

      let pad = null;
      for (let i = 0; i < 120 && !pad; i += 1) {
        t += STEP;
        game.tick(STEP / 1000, s.update(bodyWith(side, idle[0], idle[1]), t), t, VIEW);
        if (game.active?.pad?.side === side) pad = game.active.pad;
      }
      if (!pad) continue;

      // Bring the guard up slowly enough that raising it is not itself a
      // punch, then let the arm go still.
      const target = [1 - pad.x, pad.y];
      const glide = Math.round(1800 / STEP);
      for (let i = 1; i <= glide; i += 1) {
        t += STEP;
        const p = i / glide;
        const st = s.update(
          bodyWith(side, idle[0] + (target[0] - idle[0]) * p, idle[1] + (target[1] - idle[1]) * p),
          t,
        );
        game.tick(STEP / 1000, st, t, VIEW);
      }
      for (let e = 0; e < 300; e += STEP) {
        t += STEP;
        game.tick(STEP / 1000, s.update(bodyWith(side, target[0], target[1]), t), t, VIEW);
      }
      assert.ok(game.active, "the pad went out before the jab was thrown");

      const frames = Math.round(150 / STEP);
      let landed = 0;
      let peakAcross = 0;
      for (let i = 1; i <= frames; i += 1) {
        t += STEP;
        const p = i / frames;
        const eased = 1 - (1 - p) * (1 - p);
        // Barely a flicker across the picture; half a body-width towards it.
        const x = target[0] + 0.01 * eased;
        const y = target[1] - 0.01 * eased;
        const z = -0.1 * eased;
        const st = s.update(bodyWith(side, x, y, z), t);
        peakAcross = Math.max(peakAcross, st.hands[side].speed);
        landed += game.tick(STEP / 1000, st, t, VIEW).landed ?? 0;
      }
      for (let e = 0; e < 200; e += STEP) {
        t += STEP;
        const st = s.update(bodyWith(side, target[0] + 0.01, target[1] - 0.01, -0.1), t);
        landed += game.tick(STEP / 1000, st, t, VIEW).landed ?? 0;
      }
      assert.ok(
        peakAcross < 1.9,
        `this jab was supposed to be invisible sideways, but read ${peakAcross.toFixed(1)} across`,
      );
      assert.ok(landed > 0, `a straight jab at the ${pad.id} pad did not register`);
    }
  });

  it("does not call a hand drifting backwards a punch", () => {
    const side = "right";
    const { s, t } = ready(side);
    let now = t;
    let worst = 0;
    // Hand retreating from the camera, which is the end of a punch, not one.
    for (let i = 1; i <= 12; i += 1) {
      now += STEP;
      const st = s.update(bodyWith(side, 0.38, 0.56, 0.01 * i), now);
      worst = Math.max(worst, st.hands[side].push);
    }
    assert.ok(worst < 1.9, `a retreating hand read as a punch of ${worst.toFixed(1)}`);
  });
});

describe("A real swipe cuts", () => {
  it("slices fruit the hand passes through", () => {
    const side = "right";
    const { s, t, idle } = ready(side);
    const game = createFruitSlice({ fx: fxSpy() });
    game.start(0);

    // Put one piece of fruit in a known place, hanging in the air.
    let now = t;
    game.tick(STEP / 1000, s.update(bodyWith(side, idle[0], idle[1]), now), now, VIEW);
    game.items = [
      {
        kind: { name: "melon", skin: "#4ade80", flesh: "#fca5a5", size: 1.15 },
        bomb: false,
        x: 0.5,
        y: 0.4,
        vx: 0,
        vy: 0,
        spin: 0,
        angle: 0,
        size: 1.15,
        sliced: 0,
        counted: false,
      },
    ];

    // Swipe straight through the middle of it, fast, and keep going — which is
    // what slicing actually looks like.
    const out = swing(game, s, side, {
      from: [0.75, 0.4],
      to: [0.25, 0.4],
      ms: 200,
      settle: 0,
      t0: now,
    });

    assert.ok(
      out.sliced > 0,
      `swipe through the fruit did not cut it (peak speed ${out.peakSpeed.toFixed(1)})`,
    );
  });
});
