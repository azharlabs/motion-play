/** BlazePose / MediaPipe Pose Landmarker indices. */
export const IDX = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

const HAND_PARTS = {
  left: { wrist: IDX.LEFT_WRIST, knuckles: [IDX.LEFT_INDEX, IDX.LEFT_PINKY] },
  right: { wrist: IDX.RIGHT_WRIST, knuckles: [IDX.RIGHT_INDEX, IDX.RIGHT_PINKY] },
};

const confidence = (p) => Math.max(p?.visibility ?? 0, p?.presence ?? 0);

/**
 * The middle of a hand, rather than the wrist.
 *
 * Games ask you to hit things with your hand, but the wrist landmark sits at
 * the base of it — about half a hand behind where you are aiming, and further
 * still with the arm extended, which is exactly the position a punch or a
 * slice ends in. Averaging the wrist with the knuckles moves the point onto
 * the hand and, because it is three readings instead of one, steadies it too.
 *
 * Falls back to the wrist alone when the fingers cannot be seen, which is
 * common at a distance or against a busy background.
 */
export function handPoint(landmarks, side, minVis = 0.35) {
  const parts = HAND_PARTS[side];
  const wrist = parts && landmarks?.[parts.wrist];
  if (!wrist || confidence(wrist) < minVis) return null;

  let sx = 0;
  let sy = 0;
  let sz = 0;
  let n = 0;
  for (const i of parts.knuckles) {
    const p = landmarks[i];
    if (!p || confidence(p) < minVis) continue;
    sx += p.x;
    sy += p.y;
    sz += p.z ?? 0;
    n += 1;
  }
  if (!n) return wrist;

  return {
    x: (wrist.x + sx / n) / 2,
    y: (wrist.y + sy / n) / 2,
    // Depth, so a punch thrown at the camera is not invisible. Smaller is
    // nearer, on roughly the same scale as x.
    z: ((wrist.z ?? 0) + sz / n) / 2,
    visibility: confidence(wrist),
  };
}

export const HIP_INDICES = [IDX.LEFT_HIP, IDX.RIGHT_HIP];
export const SHOULDER_INDICES = [IDX.LEFT_SHOULDER, IDX.RIGHT_SHOULDER];
export const ANKLE_INDICES = [IDX.LEFT_ANKLE, IDX.RIGHT_ANKLE];

/**
 * Average landmark Y for indices that meet minVis.
 * Image space: 0 = top, 1 = bottom.
 * @returns {number|null}
 */
export function averageVisibleY(landmarks, indices, minVis = 0.5) {
  if (!landmarks || !indices?.length) return null;
  let sum = 0;
  let n = 0;
  for (const i of indices) {
    const p = landmarks[i];
    if (!p) continue;
    const vis = Math.max(p.visibility ?? 0, p.presence ?? 0);
    const score = p.visibility == null && p.presence == null ? 1 : vis;
    if (score < minVis) continue;
    sum += p.y;
    n += 1;
  }
  if (n === 0) return null;
  return sum / n;
}

export function ema(previous, next, alpha) {
  if (previous == null) return next;
  return previous * (1 - alpha) + next * alpha;
}

/** Mean confidence across the given landmarks, used for framing feedback. */
export function visibilityScore(landmarks, indices) {
  if (!landmarks?.length) return 0;
  let sum = 0;
  let n = 0;
  for (const i of indices) {
    const p = landmarks[i];
    if (!p) continue;
    sum += Math.max(p.visibility ?? 0, p.presence ?? 0);
    n += 1;
  }
  return n ? sum / n : 0;
}
