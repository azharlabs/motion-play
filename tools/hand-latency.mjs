/**
 * Print how far the reported hand trails the real one, and how much of a
 * punch's speed survives the smoothing, at each tracking rate.
 *
 *   node tools/hand-latency.mjs
 */
import { MotionSignals } from "../stage0/js/signals.js";
import { IDX } from "../stage0/js/landmarks.js";

const SHOULDER_W = 0.2;

function poseWithHand(x, y) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  const put = (i, px, py) => {
    pts[i] = { x: px, y: py, visibility: 0.95 };
  };
  put(IDX.NOSE, 0.5, 0.2);
  put(IDX.LEFT_SHOULDER, 0.5 + SHOULDER_W / 2, 0.32);
  put(IDX.RIGHT_SHOULDER, 0.5 - SHOULDER_W / 2, 0.32);
  put(IDX.LEFT_HIP, 0.57, 0.56);
  put(IDX.RIGHT_HIP, 0.43, 0.56);
  put(IDX.LEFT_ANKLE, 0.57, 0.92);
  put(IDX.RIGHT_ANKLE, 0.43, 0.92);
  for (const i of [IDX.LEFT_WRIST, IDX.LEFT_INDEX, IDX.LEFT_PINKY]) put(i, x, y);
  for (const i of [IDX.RIGHT_WRIST, IDX.RIGHT_INDEX, IDX.RIGHT_PINKY]) put(i, 0.43, 0.56);
  return pts;
}

/**
 * Pose noise on the wrist, as a fraction of the frame. BlazePose lite at a
 * 320px inference width wobbles by roughly this much even on a still hand.
 */
const NOISE = 0.007;

// Deterministic, so two runs of the sweep can be compared.
let seed = 12345;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

const noisy = (v, noise) => v + rand() * 2 * noise;

function ready(fps, filter, noise = 0) {
  seed = 12345;
  const s = new MotionSignals({ mode: "upper", handFilter: filter });
  s.startCalibration(0);
  const step = 1000 / fps;
  for (let t = 0; t <= 2000; t += step) s.update(poseWithHand(noisy(0.5, noise), 0.5), t);
  return { s, step, from: 2000 };
}

/** Mean distance between the reported hand and the real one during a sweep. */
function sweepLag(fps, speed, filter, noise = 0, ms = 600) {
  const { s, step, from } = ready(fps, filter, noise);
  let t = from;
  let truth = 0.5;
  let total = 0;
  let n = 0;
  for (let e = 0; e < ms; e += step) {
    t += step;
    truth += speed * (step / 1000);
    const state = s.update(poseWithHand(noisy(truth, noise), 0.5), t);
    // Skip the first few frames: that is the filter spinning up, not lag.
    if (e > 100) {
      total += Math.abs(state.hands.left.x - (1 - truth));
      n += 1;
    }
  }
  return total / Math.max(1, n);
}

function punchPeak(fps, distance, ms, filter, noise = 0) {
  const { s, step, from } = ready(fps, filter, noise);
  let t = from;
  let peak = 0;
  const frames = Math.max(1, Math.round(ms / step));
  for (let i = 1; i <= frames; i += 1) {
    t += step;
    const state = s.update(poseWithHand(noisy(0.5 + (distance * i) / frames, noise), 0.5), t);
    peak = Math.max(peak, state.hands.left.speed);
  }
  return peak;
}

/** Worst wobble the player sees on a hand they are holding still. */
function jitter(fps, filter, noise = NOISE) {
  const { s, step, from } = ready(fps, filter, noise);
  let t = from;
  let worst = 0;
  let fastest = 0;
  for (let i = 0; i < 90; i += 1) {
    t += step;
    const state = s.update(poseWithHand(noisy(0.5, noise), 0.5), t);
    worst = Math.max(worst, Math.abs(state.hands.left.x - 0.5));
    fastest = Math.max(fastest, state.hands.left.speed);
  }
  return { worst, fastest };
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const real = 0.3 / 0.15 / SHOULDER_W;

/**
 * With detection on a worker the answer describes a frame that is already one
 * detection old by the time it can be drawn. Measure the whole path, delay
 * included, and see whether leading the hand by its own velocity pays it back.
 */
function pipelineLag(fps, filter, { delayMs = 0, lead = 0, speed = 1.2, ms = 600 } = {}) {
  const { s, step, from } = ready(fps, filter, NOISE);
  let t = from;
  let truth = 0.5;
  let total = 0;
  let n = 0;
  const frames = [];
  for (let e = 0; e < ms; e += step) {
    t += step;
    truth += speed * (step / 1000);
    frames.push({ at: t, x: truth });
    // Feed the filter the frame from `delayMs` ago, as the worker would.
    const due = frames.find((f) => t - f.at >= delayMs);
    if (!due) continue;
    frames.splice(0, frames.indexOf(due) + 1);
    const state = s.update(poseWithHand(noisy(due.x, NOISE), 0.5), due.at);
    if (e > 150) {
      const h = state.hands.left;
      // Where the game would draw the hand, having led it forward.
      const shown = h.x + (h.vx ?? 0) * lead;
      total += Math.abs(shown - (1 - truth));
      n += 1;
    }
  }
  return total / Math.max(1, n);
}

const CANDIDATES = [
  { name: "before (1.6/0.9/1)", minCutoff: 1.6, beta: 0.9, dCutoff: 1 },
  { name: "3 / 1.5 / 6", minCutoff: 3, beta: 1.5, dCutoff: 6 },
  { name: "5 / 2.5 / 6", minCutoff: 5, beta: 2.5, dCutoff: 6 },
  { name: "8 / 3 / 8", minCutoff: 8, beta: 3, dCutoff: 8 },
  { name: "14 / 4 / 10", minCutoff: 14, beta: 4, dCutoff: 10 },
];

console.log(`wrist noise ${pct(NOISE)}, punch true speed ${real.toFixed(1)}\n`);
for (const fps of [30, 20, 15]) {
  console.log(`--- tracking at ${fps}fps ---`);
  console.log("filter                reach lag  swipe lag  punch  still-wobble  still-speed");
  for (const c of CANDIDATES) {
    const still = jitter(fps, c);
    console.log(
      [
        c.name.padEnd(21),
        pct(sweepLag(fps, 1.2, c, NOISE)).padEnd(10),
        pct(sweepLag(fps, 2.5, c, NOISE)).padEnd(10),
        punchPeak(fps, 0.3, 150, c, NOISE).toFixed(1).padEnd(6),
        pct(still.worst).padEnd(13),
        still.fastest.toFixed(2),
      ].join(" "),
    );
  }
  console.log("");
}

const CHOSEN = { minCutoff: 8, beta: 3, dCutoff: 8 };
console.log("--- whole path at 30fps, detection on a worker one frame behind ---");
console.log("delay  lead   reach lag");
for (const delayMs of [0, 33]) {
  for (const lead of [0, 0.02, 0.033, 0.05]) {
    console.log(
      [
        `${delayMs}ms`.padEnd(6),
        `${Math.round(lead * 1000)}ms`.padEnd(6),
        pct(pipelineLag(30, CHOSEN, { delayMs, lead })),
      ].join(" "),
    );
  }
}
