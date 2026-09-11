/**
 * How forgiving are the punch and slice games, really?
 *
 * A clean, dead-centre punch registers. A player does not throw those: they
 * aim a bit off, they punch faster than a test does, and the pose readings
 * wobble. This sweeps those three and reports how often a hit is actually
 * awarded, so "the hand games are inaccurate" becomes a number.
 *
 *   node tools/hit-margin.mjs
 */
import { MotionSignals } from "../stage0/js/signals.js";
import { IDX } from "../stage0/js/landmarks.js";
import { createGame as createPunchOut } from "../stage0/js/games/punch-out.js";
import { poseMapping } from "../stage0/js/framing.js";

const FPS = 30;
const STEP = 1000 / FPS;
const W = 0.2;
const VIEW = { w: 390, h: 844, ...poseMapping(390, 844) };

let seed = 99;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

const fx = { cue: () => true };

function bodyWith(side, hx, hy, noise = 0, handVis = 0.95) {
  const n = () => rand() * 2 * noise;
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  const put = (i, x, y, vis = 0.95) => {
    pts[i] = { x: x + n(), y: y + n(), visibility: vis };
  };
  put(IDX.NOSE, 0.5, 0.2);
  put(IDX.LEFT_SHOULDER, 0.5 + W / 2, 0.32);
  put(IDX.RIGHT_SHOULDER, 0.5 - W / 2, 0.32);
  put(IDX.LEFT_HIP, 0.57, 0.56);
  put(IDX.RIGHT_HIP, 0.43, 0.56);
  put(IDX.LEFT_ANKLE, 0.57, 0.92);
  put(IDX.RIGHT_ANKLE, 0.43, 0.92);

  const idle = side === "left" ? [0.62, 0.56] : [0.38, 0.56];
  const other = side === "left" ? "right" : "left";
  for (const [name, [x, y]] of [
    [side, [hx, hy]],
    [other, idle],
  ]) {
    const w = name === "left" ? IDX.LEFT_WRIST : IDX.RIGHT_WRIST;
    const idx = name === "left" ? IDX.LEFT_INDEX : IDX.RIGHT_INDEX;
    const pk = name === "left" ? IDX.LEFT_PINKY : IDX.RIGHT_PINKY;
    // Only the punching hand loses confidence; the idle one is easy to see.
    const vis = name === side ? handVis : 0.95;
    put(w, x, y, vis);
    put(idx, x, y - 0.02, vis);
    put(pk, x + 0.015, y - 0.015, vis);
  }
  return pts;
}

function ready(side, noise) {
  const s = new MotionSignals({ mode: "upper" });
  s.startCalibration(0);
  let t = 0;
  const idle = side === "left" ? [0.62, 0.56] : [0.38, 0.56];
  for (; t <= 2000; t += STEP) s.update(bodyWith(side, idle[0], idle[1], noise), t);
  return { s, t, idle };
}

/**
 * One punch at the lit pad, thrown `ms` long, missing the centre by `off`
 * (as a fraction of the screen), through readings wobbling by `noise`.
 * `through` punches past the pad instead of stopping on it.
 */
function attempt({ ms, off, noise, through, blind = 0 }) {
  const side = Math.random() < 0.5 ? "left" : "right";
  const game = createPunchOut({ fx });
  game.start(0);
  let { s, t, idle } = ready(side, noise);

  // Wait for a pad on this hand's side to light.
  let pad = null;
  for (let i = 0; i < 120; i += 1) {
    t += STEP;
    game.tick(STEP / 1000, s.update(bodyWith(side, idle[0], idle[1], noise), t), t, VIEW);
    if (game.active?.pad?.side === side) {
      pad = game.active.pad;
      break;
    }
    // Not our side: let it time out and try again.
  }
  if (!pad) return null;

  // Aim off by `off` in a random direction, in display space, then mirror
  // back into the raw camera space the landmarks live in.
  const a = Math.random() * Math.PI * 2;
  const aimX = pad.x + Math.cos(a) * off;
  const aimY = pad.y + Math.sin(a) * off;
  const target = [1 - aimX, aimY];
  // Punching through carries the hand past the pad and back out.
  const past = [target[0] - (target[0] - idle[0]) * -0.35, target[1]];

  let landed = 0;
  const frames = Math.max(1, Math.round(ms / STEP));
  for (let i = 1; i <= frames; i += 1) {
    t += STEP;
    const p = i / frames;
    const eased = through ? p : 1 - (1 - p) * (1 - p);
    const to = through ? past : target;
    const x = idle[0] + (to[0] - idle[0]) * eased;
    const y = idle[1] + (to[1] - idle[1]) * eased;
    // The fastest part of the swing is where a blurred hand stops being
    // recognised, so confidence collapses through the middle of the throw.
    const vis = blind && p > 0.35 && p < 0.35 + blind ? 0.1 : 0.95;
    const st = s.update(bodyWith(side, x, y, noise, vis), t);
    landed += game.tick(STEP / 1000, st, t, VIEW).landed ?? 0;
  }
  // Retract or hold.
  for (let e = 0; e < 250; e += STEP) {
    t += STEP;
    const st = s.update(bodyWith(side, target[0], target[1], noise), t);
    landed += game.tick(STEP / 1000, st, t, VIEW).landed ?? 0;
  }
  return landed > 0;
}

function rate(opts, tries = 220) {
  let hit = 0;
  let n = 0;
  for (let i = 0; i < tries; i += 1) {
    const r = attempt(opts);
    if (r === null) continue;
    n += 1;
    if (r) hit += 1;
  }
  return n ? Math.round((hit / n) * 100) : -1;
}

console.log("punches landed, out of every 100 thrown at the lit pad\n");
console.log("aim off   150ms punch   250ms punch   150ms punching through");
for (const off of [0, 0.02, 0.04, 0.06]) {
  console.log(
    [
      `${(off * 100).toFixed(0)}%`.padEnd(9),
      `${rate({ ms: 150, off, noise: 0.007, through: false })}%`.padEnd(13),
      `${rate({ ms: 250, off, noise: 0.007, through: false })}%`.padEnd(13),
      `${rate({ ms: 150, off, noise: 0.007, through: true })}%`,
    ].join(" "),
  );
}

console.log("\nsame punch, but the hand blurs and the model loses confidence mid-throw");
console.log("blind for   punches landed");
for (const blind of [0, 0.1, 0.2, 0.35, 0.5]) {
  const frames = Math.round((blind * 150) / STEP);
  console.log(
    [
      `${frames} frame${frames === 1 ? "" : "s"}`.padEnd(11),
      `${rate({ ms: 150, off: 0.02, noise: 0.007, through: false, blind })}%`,
    ].join(" "),
  );
}
