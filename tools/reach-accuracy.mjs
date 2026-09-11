/**
 * Does the game see the thing your hand just went through?
 *
 * Punch Out stops the hand on the pad and holds it there, so it is forgiving
 * by construction and tools/hit-margin.mjs says so. Balloon Pop and Fruit
 * Slice are the opposite: you swat and you carry on, and Fruit Slice will not
 * even look at a blade that is moving slowly. So the faster you play them the
 * way they ask to be played, the further the hand travels between two pose
 * readings — and if the game only ever asks "is the hand on it right now", the
 * answer on every single frame can be no while the hand went straight through.
 *
 * This drives the real games through the real signal pipeline at the rates the
 * app actually runs — frames at 60, pose wherever the phone can manage, hands
 * carried forward by the age of the reading — and reports what gets through.
 *
 * The pose rate is the one to watch. It is not a detail of the machine: it is
 * how often the game is allowed to know anything at all, and every number
 * here falls apart as it drops.
 *
 *   node tools/reach-accuracy.mjs
 */
import { MotionSignals, leadHands } from "../stage0/js/signals.js";
import { IDX, handPoint } from "../stage0/js/landmarks.js";
import { poseMapping } from "../stage0/js/framing.js";
import { createGame as createBalloonPop } from "../stage0/js/games/balloon-pop.js";
import { createGame as createFruitSlice } from "../stage0/js/games/fruit-slice.js";

const RENDER_FPS = 60;
const RENDER_STEP = 1000 / RENDER_FPS;

/** A phone showing a 3:4 camera frame cropped to fill it, as the games do. */
const VIEW = {
  w: 390,
  h: 844,
  ...poseMapping(390, 844, { videoW: 480, videoH: 640, cropped: true }),
};
/**
 * Pose units per screen pixel. Across and down are not the same number: the
 * crop throws away the sides of the frame, so a step sideways in pose units
 * covers about 1.6 times the pixels a step down does.
 */
const PER_PX = 1 / (VIEW.poseX(1) - VIEW.poseX(0));
const PER_PY = 1 / (VIEW.poseY(1) - VIEW.poseY(0));

const W = 0.2;
const fx = { cue: () => true };

/** A player who is in shot but not moving, for letting a game settle. */
const IDLE = {
  inFrame: true,
  calibrated: true,
  hands: { left: { visible: false }, right: { visible: false } },
};

let seed = 1234;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

/**
 * A body with one hand put where we want it.
 *
 * `x`/`y` are display coordinates — mirrored, the way the games see them —
 * because that is the space the targets are in. Landmarks are raw, so it goes
 * back through the mirror on the way in.
 */
function bodyWith(side, x, y, noise, handVis = 0.95) {
  // A clean body must not draw from the noise sequence, or measuring the truth
  // would change the wobble the run under test sees.
  const n = () => (noise ? rand() * 2 * noise : 0);
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  const put = (i, px, py, vis = 0.95) => {
    pts[i] = { x: px + n(), y: py + n(), visibility: vis };
  };
  put(IDX.NOSE, 0.5, 0.2);
  put(IDX.LEFT_SHOULDER, 0.5 + W / 2, 0.32);
  put(IDX.RIGHT_SHOULDER, 0.5 - W / 2, 0.32);
  put(IDX.LEFT_HIP, 0.57, 0.56);
  put(IDX.RIGHT_HIP, 0.43, 0.56);
  put(IDX.LEFT_ANKLE, 0.57, 0.92);
  put(IDX.RIGHT_ANKLE, 0.43, 0.92);

  const raw = 1 - x;
  const idle = side === "left" ? [0.62, 0.56] : [0.38, 0.56];
  for (const [name, [hx, hy]] of [
    [side, [raw, y]],
    [side === "left" ? "right" : "left", idle],
  ]) {
    const w = name === "left" ? IDX.LEFT_WRIST : IDX.RIGHT_WRIST;
    const ix = name === "left" ? IDX.LEFT_INDEX : IDX.RIGHT_INDEX;
    const pk = name === "left" ? IDX.LEFT_PINKY : IDX.RIGHT_PINKY;
    // Only the working hand blurs; the idle one is easy to see all along.
    const vis = name === side ? handVis : 0.95;
    put(w, hx, hy, vis);
    put(ix, hx, hy - 0.02, vis);
    put(pk, hx + 0.015, hy - 0.015, vis);
  }
  return pts;
}

/**
 * The app's loop: pose on its own slower clock, frames at 60, and every frame
 * the hands carried forward by however old the last reading is.
 */
class Rig {
  constructor({ noise = 0.007, side = "left", filter, lead = true, poseFps = 30 } = {}) {
    this.noise = noise;
    this.side = side;
    this.lead = lead;
    this.signals = new MotionSignals({
      mode: "upper",
      ...(filter ? { handFilter: filter } : {}),
    });
    this.signals.startCalibration(0);
    this.t = 0;
    this.poseAt = 0;
    this.posePeriod = 1000 / poseFps;
    this.state = null;
    this.hold(2200, 0.38, 0.56);
  }

  /** Advance one frame with the hand at a display position; returns the state. */
  frame(x, y, handVis = 0.95) {
    this.t += RENDER_STEP;
    if (this.t - this.poseAt >= this.posePeriod) {
      this.poseAt = this.t;
      this.state = this.signals.update(bodyWith(this.side, x, y, this.noise, handVis), this.t);
    }
    if (this.lead === false) return this.state;
    return leadHands(this.state, this.t - this.poseAt);
  }

  hold(ms, x, y) {
    let out = this.state;
    for (let e = 0; e < ms; e += RENDER_STEP) out = this.frame(x, y);
    return out;
  }
}

/** Where the game thinks the hand is, in screen pixels. */
const seenAt = (state, side) => {
  const h = state?.hands?.[side];
  if (!h?.visible || h.x == null) return null;
  return { x: VIEW.poseX(h.x), y: VIEW.poseY(h.y) };
};

/**
 * Where the hand really is, in the same pixels.
 *
 * Measured through handPoint on a clean body rather than from the commanded
 * position, because the middle of a hand is deliberately not the wrist: taking
 * the wrist as truth would score that whole offset as error.
 */
const trulyAt = (side, x, y) => {
  const p = handPoint(bodyWith(side, x, y, 0), side);
  return { x: VIEW.poseX(1 - p.x), y: VIEW.poseY(p.y) };
};

/* ---------------- how well is the hand tracked at all ---------------- */

function tracking({ noise, filter, lead = true, poseFps = 30 }) {
  const rig = new Rig({ noise, filter, lead, poseFps });

  // Still: everything reported is wobble.
  const truth = trulyAt("left", 0.5, 0.5);
  const still = [];
  for (let e = 0; e < 3000; e += RENDER_STEP) {
    const at = seenAt(rig.frame(0.5, 0.5), "left");
    if (at) still.push(Math.hypot(at.x - truth.x, at.y - truth.y));
  }
  still.sort((a, b) => a - b);

  /*
   * Moving steadily across: everything reported behind is lag. The run has to
   * stay well inside the frame, because leadHands clamps to it and a hand
   * pinned against the edge would be scored as hopelessly behind.
   */
  const pxPerSec = 900;
  const lag = [];
  let x = 0.15;
  const settle = 150;
  for (let e = 0; x < 0.85; e += RENDER_STEP) {
    x += pxPerSec * PER_PX * (RENDER_STEP / 1000);
    const at = seenAt(rig.frame(x, 0.5), "left");
    if (at && e > settle) lag.push(trulyAt("left", x, 0.5).x - at.x);
  }

  const mid = (a) => (a.length ? a[Math.floor(a.length * 0.5)] : 0);
  const p95 = (a) => (a.length ? a[Math.floor(a.length * 0.95)] : 0);
  return {
    jitter: mid(still),
    worst: p95(still),
    lag: lag.reduce((s, v) => s + v, 0) / Math.max(1, lag.length),
  };
}

/* ---------------- can you actually hit anything ---------------- */

/**
 * Swat straight through a target at `pxPerSec`, missing its centre by `offPx`,
 * and say whether the game noticed. The hand carries on past it, because that
 * is what a hand does.
 */
function swipeThrough({
  make,
  place,
  pxPerSec,
  offPx,
  noise,
  filter,
  poseFps,
  phase = 0,
  blurFor = 0,
}) {
  const rig = new Rig({ noise, filter, poseFps });
  /*
   * Slide the pose clock under the swipe.
   *
   * Nothing lines a real swipe up with the camera shutter, so the gap between
   * the hand crossing the target and the next reading is anybody's guess.
   * Leave it fixed and every run of a given speed comes out the same, which
   * reads as a solid 100% or a solid 0% and hides the truth in between.
   */
  rig.poseAt = rig.t - phase * rig.posePeriod;
  const game = make();
  game.start(0);
  const target = place(game);

  // Across the screen through the target, perpendicular to the offset.
  const at = (p) => ({
    x: target.x + (p - 0.5) * 520 * PER_PX,
    y: target.y + offPx * PER_PY,
  });

  const seconds = 520 / pxPerSec;
  const frames = Math.max(2, Math.round((seconds * 1000) / RENDER_STEP));
  let hit = 0;
  for (let i = 0; i <= frames; i += 1) {
    const q = i / frames;
    const p = at(q);
    /*
     * The fastest part of a swipe is the part that blurs, and it is right over
     * the target — precisely where the model is most likely to lose the hand.
     */
    const blurred = blurFor > 0 && Math.abs(q - 0.5) < blurFor / 2;
    const state = rig.frame(p.x, p.y, blurred ? 0.1 : 0.95);
    const r = game.tick(RENDER_STEP / 1000, state, rig.t, VIEW) ?? {};
    hit += (r.popped ?? 0) + (r.sliced ?? 0);
    // Fruit is falling all the while, and a target drifting into the blade
    // would be scored as a hit the hand had nothing to do with.
    target.hold?.(game);
  }
  return hit > 0;
}

const balloon = () => ({
  make: () => createBalloonPop({ fx }),
  place: (game) => {
    game.balloons = [
      {
        id: 1,
        x: 0.5,
        y: 0.5,
        drift: 0,
        wobble: 0,
        size: 1,
        speed: 0,
        color: "#ff5d8f",
        shine: "#ff9ebb",
        popping: 0,
      },
    ];
    game.spawnTimer = 999;
    return { x: 0.5, y: 0.5 };
  },
});

const fruit = () => ({
  make: () => createFruitSlice({ fx }),
  place: (game) => {
    /*
     * Let the game spawn its own fruit and then move one where we want it, so
     * the fixture cannot go stale or miss a field. It bites: leave out `vx`
     * and the fruit drifts to NaN, every distance test comes back NaN, and
     * `NaN > reach` is false — so every blade in the world "hits" it.
     */
    game.spawnTimer = 0;
    game.tick(1 / 60, IDLE, 0, VIEW);
    const item = game.items[0];
    item.x = 0.5;
    item.y = 0.5;
    item.vx = 0;
    item.vy = 0;
    item.size = 1;
    item.bomb = false;
    game.items = [item];
    game.spawnTimer = 999;
    return {
      x: 0.5,
      y: 0.5,
      hold: (g) => {
        const item = g.items?.[0];
        if (item && item.sliced === 0) {
          item.y = 0.5;
          item.vy = 0;
        }
      },
    };
  },
});

function rate(kind, opts, tries = 60) {
  let hit = 0;
  for (let i = 0; i < tries; i += 1) {
    seed = 1234 + i * 7919;
    if (swipeThrough({ ...kind(), ...opts, phase: i / tries })) hit += 1;
  }
  return Math.round((hit / tries) * 100);
}

/* ---------------- report ---------------- */

const NOISE = 0.007;

console.log("where the game thinks a hand is, on a 390x844 phone");
console.log("(the hand is moving at 900 px/s, an unhurried reach)\n");
console.log("pose   lead   still (px)   worst (px)   behind while moving (px)");
for (const poseFps of [30, 20, 15, 12, 10]) {
  for (const lead of [true, false]) {
    const t = tracking({ noise: NOISE, poseFps, lead });
    console.log(
      [
        `${poseFps}`.padEnd(6),
        (lead ? "on" : "off").padEnd(6),
        t.jitter.toFixed(1).padEnd(12),
        t.worst.toFixed(1).padEnd(12),
        t.lag.toFixed(1),
      ].join(" "),
    );
  }
}

console.log("\n\nswatting straight through the target, out of every 100 tries");
console.log("(a brisk swipe on a phone is somewhere around 1200-2400 px/s)\n");

for (const poseFps of [30, 20, 15, 12, 10]) {
  console.log(`pose running at ${poseFps} a second`);
  console.log("  hand speed    balloon popped   fruit sliced");
  for (const pxPerSec of [800, 1200, 1800, 2400, 3200]) {
    console.log(
      [
        `  ${pxPerSec} px/s`.padEnd(15),
        `${rate(balloon, { pxPerSec, offPx: 0, noise: NOISE, poseFps })}%`.padEnd(16),
        `${rate(fruit, { pxPerSec, offPx: 0, noise: NOISE, poseFps })}%`,
      ].join(" "),
    );
  }
  console.log("");
}

console.log("the same swipe at 1800 px/s and 15 fps, but the hand blurs as it crosses");
console.log("blurred for   balloon popped   fruit sliced");
for (const blurFor of [0, 0.1, 0.2, 0.35, 0.5]) {
  const ms = Math.round((blurFor * 520 * 1000) / 1800);
  console.log(
    [
      `${ms} ms`.padEnd(13),
      `${rate(balloon, { pxPerSec: 1800, offPx: 0, noise: NOISE, poseFps: 15, blurFor })}%`.padEnd(
        16,
      ),
      `${rate(fruit, { pxPerSec: 1800, offPx: 0, noise: NOISE, poseFps: 15, blurFor })}%`,
    ].join(" "),
  );
}

console.log("\nsame swipe at 1800 px/s and 15 fps, but aimed off the centre");
console.log("aim off      balloon popped   fruit sliced");
for (const offPx of [0, 10, 20, 30, 40, 60, 120]) {
  console.log(
    [
      `${offPx} px`.padEnd(12),
      `${rate(balloon, { pxPerSec: 1800, offPx, noise: NOISE, poseFps: 15 })}%`.padEnd(16),
      `${rate(fruit, { pxPerSec: 1800, offPx, noise: NOISE, poseFps: 15 })}%`,
    ].join(" "),
  );
}
