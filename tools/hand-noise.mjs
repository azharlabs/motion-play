/**
 * Does a still hand look like it is punching?
 *
 * Punch Out and Fruit Slice both fire on hand speed crossing a threshold, so
 * any noise the filter lets through arrives as a phantom punch or a slice at
 * thin air. The wrist noise a pose model actually produces depends heavily on
 * the model and the light, so sweep a range of it and see where the speed
 * signal stops being trustworthy.
 *
 *   node tools/hand-noise.mjs
 */
import { MotionSignals } from "../stage0/js/signals.js";
import { IDX } from "../stage0/js/landmarks.js";

const W = 0.2;

// The thresholds the two games use, from their sources.
const PUNCH = 1.9;
const SLICE = 2.2;

let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff - 0.5;
};

function poseWithHand(x, y) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  const put = (i, px, py) => {
    pts[i] = { x: px, y: py, visibility: 0.95 };
  };
  put(IDX.NOSE, 0.5, 0.2);
  put(IDX.LEFT_SHOULDER, 0.5 + W / 2, 0.32);
  put(IDX.RIGHT_SHOULDER, 0.5 - W / 2, 0.32);
  put(IDX.LEFT_HIP, 0.57, 0.56);
  put(IDX.RIGHT_HIP, 0.43, 0.56);
  put(IDX.LEFT_ANKLE, 0.57, 0.92);
  put(IDX.RIGHT_ANKLE, 0.43, 0.92);
  put(IDX.LEFT_WRIST, x, y);
  put(IDX.RIGHT_WRIST, 0.43, 0.56);
  return pts;
}

/** Hold a hand still under `noise` and report the worst speed reported. */
function stillHand(filter, noise, fps = 30, seconds = 20) {
  seed = 7;
  const s = new MotionSignals({ mode: "upper", handFilter: filter });
  s.startCalibration(0);
  const step = 1000 / fps;
  let t = 0;
  for (; t <= 2000; t += step) s.update(poseWithHand(0.5, 0.5), t);

  let worst = 0;
  let overPunch = 0;
  let overSlice = 0;
  let n = 0;
  for (let e = 0; e < seconds * 1000; e += step) {
    t += step;
    const st = s.update(poseWithHand(0.5 + rand() * 2 * noise, 0.5 + rand() * 2 * noise), t);
    const sp = st.hands.left.speed;
    worst = Math.max(worst, sp);
    if (sp > PUNCH) overPunch += 1;
    if (sp > SLICE) overSlice += 1;
    n += 1;
  }
  // Rep detectors fire on a rising edge, so a crossing is roughly a false hit.
  return { worst, punchesPerMin: (overPunch / n) * fps * 60, slicesPerMin: (overSlice / n) * fps * 60 };
}

const NOW = { minCutoff: 8, beta: 3, dCutoff: 8 };
const BEFORE = { minCutoff: 1.6, beta: 0.9, dCutoff: 1 };
const MIDDLE = { minCutoff: 6, beta: 2.5, dCutoff: 4 };

console.log("worst speed reported by a hand that is not moving");
console.log(`(punch fires above ${PUNCH}, slice above ${SLICE})\n`);
console.log("noise   filter            worst   phantom punches/min");
for (const noise of [0.007, 0.012, 0.02, 0.03]) {
  for (const [name, f] of [
    ["before", BEFORE],
    ["now (8/3/8)", NOW],
    ["middle (6/2.5/4)", MIDDLE],
  ]) {
    const r = stillHand(f, noise);
    console.log(
      [
        `${(noise * 100).toFixed(1)}%`.padEnd(7),
        name.padEnd(17),
        r.worst.toFixed(2).padEnd(7),
        r.punchesPerMin > 0 ? r.punchesPerMin.toFixed(0) : "—",
      ].join(" "),
    );
  }
  console.log("");
}
