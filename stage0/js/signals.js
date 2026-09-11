import { IDX, HIP_INDICES, SHOULDER_INDICES, handPoint, visibilityScore } from "./landmarks.js";
import { OneEuroFilter, median } from "./filters.js";
import { MotionEngine } from "./motion-events.js";

/**
 * The shared control surface for every mini-game.
 *
 * Everything here is reported in **display space**: x is mirrored so the feed
 * behaves like a mirror (raise your right hand, it appears on the right of the
 * screen) and y runs 0 at the top to 1 at the bottom. Games can therefore draw
 * straight onto the camera image without any further conversion.
 *
 * Two framing modes:
 *  - "full" needs hips and shoulders, and unlocks jump / duck / lean.
 *  - "upper" only needs shoulders, so it works at a desk with a phone propped
 *    up and your legs out of shot.
 */

const confidence = (p) => Math.max(p?.visibility ?? 0, p?.presence ?? 0);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * How long to go on believing in a hand the model has stopped reporting.
 *
 * A hand does not vanish and rematerialise in a tenth of a second. What
 * happens is that the fastest part of a swing smears across the sensor, the
 * model's confidence in the wrist collapses, and the hand drops out of the
 * game — in the middle of the throw, which is the one moment it was needed.
 * Every game then sees no hand at all: the balloon it went through survives,
 * the fruit is untouched, the pad is unhit.
 *
 * So a hand that disappears is held where it was last seen, keeping the
 * velocity it had, for about two readings' worth of time. Long enough to carry
 * a swing through the blur, short enough that a hand genuinely put down is not
 * left hanging in the air.
 */
const HAND_HOLD_MS = 140;

/** A smoothed, mirrored point with velocity, used for wrists. */
class TrackedPoint {
  constructor({ minCutoff, beta, dCutoff, holdMs = HAND_HOLD_MS }) {
    this.fx = new OneEuroFilter({ minCutoff, beta, dCutoff });
    this.fy = new OneEuroFilter({ minCutoff, beta, dCutoff });
    this.fz = new OneEuroFilter({ minCutoff, beta, dCutoff });
    this.holdMs = holdMs;
    this.x = null;
    this.y = null;
    this.z = null;
    this.visible = false;
    this.seenAt = null;
  }

  update(point, now, minVis) {
    if (!point || confidence(point) < minVis) {
      /*
       * Deliberately does not touch the filters. Feeding them a stand-in
       * would drag the velocity towards zero, and velocity is what tells
       * Punch Out and Fruit Slice that a swing is happening — so bridging the
       * blur would cost the very hit it was meant to save.
       */
      const held = this.seenAt != null && now - this.seenAt <= this.holdMs;
      this.visible = held && this.x != null;
      return;
    }
    this.seenAt = now;
    this.x = this.fx.filter(1 - point.x, now);
    this.y = this.fy.filter(point.y, now);
    this.z = this.fz.filter(point.z ?? 0, now);
    this.visible = true;
  }

  snapshot(scale) {
    const vx = this.fx.velocity() ?? 0;
    const vy = this.fy.velocity() ?? 0;
    const vz = this.fz.velocity() ?? 0;
    return {
      x: this.x,
      y: this.y,
      vx,
      vy,
      // Normalised by body scale so a swipe reads the same at any distance.
      speed: Math.hypot(vx, vy) / (scale || 1),
      /*
       * How fast the hand is coming at the camera.
       *
       * A jab thrown straight forward barely moves across the picture, so on
       * `speed` alone the most natural punch there is reads as no punch at
       * all. Depth shrinks as the hand nears the lens, so the sign is flipped
       * to make an approach positive, and it is scaled by the body the same
       * way, to keep it honest at any distance.
       */
      push: -vz / (scale || 1),
      visible: this.visible,
    };
  }
}

/**
 * Never extrapolate further than this. Beyond a couple of frames the guess is
 * doing more work than the measurement, and a hand that overshoots on every
 * change of direction is worse than one that trails slightly.
 */
const MAX_LEAD_MS = 60;

/**
 * Move the hands forward by how old the reading is.
 *
 * A pose reading always describes the past: the frame has to be captured,
 * detected and then drawn. With detection on a worker that is a frame or so,
 * enough that a reaching hand is drawn a finger's width behind where it really
 * is. Each hand already carries its own velocity, so carrying it forward by
 * exactly the age of the reading puts it back where it belongs — and when the
 * reading is fresh, the age is nearly zero and this does nothing.
 */
export function leadHands(state, ageMs) {
  if (!state?.hands || !(ageMs > 0)) return state;
  const lead = Math.min(ageMs, MAX_LEAD_MS) / 1000;
  const move = (h) => {
    if (!h?.visible || h.x == null || h.y == null) return h;
    return { ...h, x: clamp(h.x + h.vx * lead, 0, 1), y: clamp(h.y + h.vy * lead, 0, 1) };
  };
  return { ...state, hands: { left: move(state.hands.left), right: move(state.hands.right) } };
}

export class MotionSignals {
  constructor(opts = {}) {
    this.mode = opts.mode ?? "full";
    this.minVis = opts.minVis ?? 0.35;
    this.calibrateMs = opts.calibrateMs ?? (this.mode === "upper" ? 900 : 1500);
    this.trackingGraceMs = opts.trackingGraceMs ?? 300;
    /*
     * Wrist smoothing. Every bit of smoothing is paid for in latency, and a
     * hand that lags is a hand that misses what it is reaching for, so these
     * are tuned to sit just above the pose noise rather than well above it.
     * See tools/hand-latency.mjs for the measurements behind the numbers.
     */
    this.handFilter = {
      minCutoff: 8,
      beta: 3,
      // The derivative feeds punch and slice detection, so it cannot be
      // lowpassed at 1Hz: a punch is over in about a sixth of a second.
      dCutoff: 8,
      holdMs: opts.handHoldMs ?? HAND_HOLD_MS,
      ...(opts.handFilter ?? {}),
    };
    this.engine = new MotionEngine({ minVis: this.minVis, ...(opts.engine ?? {}) });
    this.reset();
  }

  reset() {
    this.engine.reset();
    this.left = new TrackedPoint(this.handFilter);
    this.right = new TrackedPoint(this.handFilter);
    this.centerX = new OneEuroFilter({ minCutoff: 1.0, beta: 0.4 });
    this.widthFilter = new OneEuroFilter({ minCutoff: 0.6, beta: 0.2 });

    this.calibrating = false;
    this.calibrated = false;
    this.calibStart = 0;
    this.samples = [];

    this.baseCenterX = null;
    this.baseWidth = null;
    this.lastGoodAt = null;
    this.last = null;
  }

  startCalibration(now) {
    this.reset();
    this.calibrating = true;
    this.calibStart = now;
    this.engine.startCalibration(now);
  }

  recalibrate(now) {
    this.calibrating = true;
    this.calibrated = false;
    this.calibStart = now;
    this.samples = [];
    this.engine.recalibrate(now);
  }

  /** Shoulder width works as a distance-independent ruler in both modes. */
  #shoulders(landmarks) {
    const l = landmarks?.[IDX.LEFT_SHOULDER];
    const r = landmarks?.[IDX.RIGHT_SHOULDER];
    if (!l || !r) return null;
    if (confidence(l) < this.minVis || confidence(r) < this.minVis) return null;
    const lx = 1 - l.x;
    const rx = 1 - r.x;
    return {
      centerX: (lx + rx) / 2,
      centerY: (l.y + r.y) / 2,
      width: Math.abs(lx - rx),
    };
  }

  #hipsVisible(landmarks) {
    return HIP_INDICES.every((i) => landmarks?.[i] && confidence(landmarks[i]) >= this.minVis);
  }

  update(landmarks, now) {
    this.landmarks = landmarks ?? null;
    // The pose engine owns jump and duck; it is only meaningful full-body.
    const engineState = this.engine.update(landmarks ?? [], now);

    const sh = this.#shoulders(landmarks);
    const framed = this.mode === "upper" ? Boolean(sh) : Boolean(sh) && this.#hipsVisible(landmarks);

    if (!framed) {
      const inGrace = this.lastGoodAt != null && now - this.lastGoodAt <= this.trackingGraceMs;
      if (inGrace && this.last) return { ...this.last, jump: false, fresh: false };
      return this.#emit({ inFrame: false, engineState });
    }

    this.lastGoodAt = now;
    const centerX = this.centerX.filter(sh.centerX, now);
    const width = this.widthFilter.filter(sh.width, now);

    this.left.update(handPoint(landmarks, "left", this.minVis), now, this.minVis);
    this.right.update(handPoint(landmarks, "right", this.minVis), now, this.minVis);

    if (this.calibrating) return this.#collect(centerX, width, now, engineState);

    return this.#emit({ inFrame: true, centerX, width, sh, engineState });
  }

  #collect(centerX, width, now, engineState) {
    this.samples.push({ centerX, width });
    const elapsed = now - this.calibStart;
    const enough = this.samples.length >= 6;
    // Full-body games also wait for the floor line the pose engine measures.
    const engineReady = this.mode === "upper" || engineState.calibrated;

    if (elapsed >= this.calibrateMs && enough && engineReady) {
      this.baseCenterX = median(this.samples.map((s) => s.centerX));
      this.baseWidth = Math.max(0.05, median(this.samples.map((s) => s.width)));
      this.calibrated = true;
      this.calibrating = false;
    }

    return this.#emit({
      inFrame: true,
      centerX,
      width,
      engineState,
      progress: Math.min(1, elapsed / this.calibrateMs),
    });
  }

  #emit({ inFrame, centerX = null, width = null, sh = null, engineState, progress } = {}) {
    const scale = width ?? this.baseWidth ?? 0.2;
    const ready = this.calibrated && inFrame;

    // Leaning is measured in shoulder-widths, so it is distance independent.
    const lean =
      ready && this.baseCenterX != null
        ? clamp((centerX - this.baseCenterX) / (this.baseWidth * 0.85), -1, 1)
        : 0;

    const crouch = ready ? clamp(engineState.dropRatio / 0.45, 0, 1) : 0;
    const lift = ready ? clamp(engineState.riseRatio / 0.35, -1, 1) : 0;

    const state = {
      inFrame: Boolean(inFrame),
      fresh: true,
      mode: this.mode,
      calibrated: this.calibrated,
      calibrating: this.calibrating,
      progress: progress ?? (this.calibrated ? 1 : 0),
      quality: visibilityScore(
        this.landmarks,
        this.mode === "upper" ? SHOULDER_INDICES : [...SHOULDER_INDICES, ...HIP_INDICES],
      ),

      jump: Boolean(engineState.jump) && this.mode === "full",
      ducking: Boolean(engineState.ducking) && this.mode === "full",
      lean,
      crouch,
      lift,

      hands: {
        left: this.left.snapshot(scale),
        right: this.right.snapshot(scale),
      },
      shoulder: sh ? { x: centerX, y: sh.centerY, width } : null,
      scale,
      landmarks: this.landmarks,
      debug: engineState.debug,
    };

    this.last = state;
    return state;
  }
}
