import {
  ANKLE_INDICES,
  HIP_INDICES,
  SHOULDER_INDICES,
  averageVisibleY,
  visibilityScore,
} from "./landmarks.js";
import { OneEuroFilter, median } from "./filters.js";

/**
 * Turns raw pose landmarks into the two semantic events every mini-game uses.
 *
 * All thresholds are expressed as a fraction of the player's own torso length,
 * so the same jump reads identically whether they stand close to the camera or
 * across the room.
 */
export class MotionEngine {
  constructor(opts = {}) {
    this.minVis = opts.minVis ?? 0.35;
    this.calibrateMs = opts.calibrateMs ?? 1500;
    this.trackingGraceMs = opts.trackingGraceMs ?? 300;

    this.jumpRiseRatio = opts.jumpRiseRatio ?? 0.22;
    this.jumpFastRiseRatio = opts.jumpFastRiseRatio ?? 0.12;
    this.jumpFastVelocity = opts.jumpFastVelocity ?? 1.2;
    this.jumpCooldownMs = opts.jumpCooldownMs ?? 300;
    this.jumpRearmRatio = opts.jumpRearmRatio ?? 0.08;
    this.minRiseVelocity = opts.minRiseVelocity ?? 0.08;
    this.minQuality = opts.minQuality ?? 0.3;
    this.stuckRecoveryMs = opts.stuckRecoveryMs ?? 1500;

    this.duckEnterRatio = opts.duckEnterRatio ?? 0.35;
    this.duckExitRatio = opts.duckExitRatio ?? 0.2;

    this.driftRate = opts.driftRate ?? 0.01;
    this.reset();
  }

  reset() {
    this.calibrated = false;
    this.calibrating = false;
    this.calibStart = 0;
    this.samples = [];

    this.hipFilter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.5 });
    this.shoulderFilter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.5 });
    this.ankleFilter = new OneEuroFilter({ minCutoff: 0.8, beta: 0.3 });

    this.hipY = null;
    this.shoulderY = null;
    this.ankleY = null;

    this.standingHipY = null;
    this.standingShoulderY = null;
    this.floorY = null;
    this.torso = null;

    this.lastJumpAt = -Infinity;
    this.jumpArmed = true;
    this.aboveSince = null;
    this.belowSince = null;
    this.ducking = false;
    this.lastGoodAt = null;
    this.quality = 0;
    this.lastState = null;
  }

  startCalibration(now) {
    this.reset();
    this.calibrating = true;
    this.calibStart = now;
  }

  /** Restart calibration without discarding the current smoothing state. */
  recalibrate(now) {
    this.calibrating = true;
    this.calibrated = false;
    this.calibStart = now;
    this.samples = [];
  }

  update(landmarks, now) {
    const hipRaw = averageVisibleY(landmarks, HIP_INDICES, this.minVis);
    const shoulderRaw = averageVisibleY(landmarks, SHOULDER_INDICES, this.minVis);
    const ankleRaw = averageVisibleY(landmarks, ANKLE_INDICES, this.minVis);
    const tracked = hipRaw != null && shoulderRaw != null;

    if (!tracked) return this.#handleLostTracking(now);

    this.lastGoodAt = now;
    this.quality = visibilityScore(landmarks, [
      ...HIP_INDICES,
      ...SHOULDER_INDICES,
      ...ANKLE_INDICES,
    ]);

    this.hipY = this.hipFilter.filter(hipRaw, now);
    this.shoulderY = this.shoulderFilter.filter(shoulderRaw, now);
    this.ankleY = ankleRaw != null ? this.ankleFilter.filter(ankleRaw, now) : this.ankleY;

    if (this.calibrating) return this.#collectCalibration(now);
    if (!this.calibrated) return this.#state({ inFrame: true });

    const torso = this.torso;
    const riseRatio = (this.standingHipY - this.hipY) / torso;
    const dropRatio = (this.shoulderY - this.standingShoulderY) / torso;
    // Filters store dy/dt in image space, where up is negative.
    const riseVelocity = -this.hipFilter.velocity() / torso;

    this.ducking = this.ducking
      ? dropRatio > this.duckExitRatio
      : dropRatio >= this.duckEnterRatio;

    // The jump is edge-triggered: it must re-arm by coming back down, so a
    // pose that simply sits above the line cannot fire over and over.
    if (riseRatio < this.jumpRearmRatio) this.jumpArmed = true;

    let jump = false;
    const clearedCooldown = now - this.lastJumpAt >= this.jumpCooldownMs;
    const bigRise = riseRatio >= this.jumpRiseRatio;
    const fastRise =
      riseRatio >= this.jumpFastRiseRatio && riseVelocity >= this.jumpFastVelocity;
    const takingOff = riseVelocity >= this.minRiseVelocity;
    const confident = this.quality >= this.minQuality;

    if (
      this.jumpArmed &&
      takingOff &&
      confident &&
      !this.ducking &&
      clearedCooldown &&
      (bigRise || fastRise)
    ) {
      jump = true;
      this.jumpArmed = false;
      this.lastJumpAt = now;
    }

    this.#recoverStuckBaseline(riseRatio, dropRatio, now);
    this.#driftBaseline(riseRatio, dropRatio);

    return this.#state({
      inFrame: true,
      jump,
      ducking: this.ducking,
      riseRatio,
      dropRatio,
    });
  }

  #handleLostTracking(now) {
    const withinGrace =
      this.lastGoodAt != null && now - this.lastGoodAt <= this.trackingGraceMs;

    if (withinGrace && this.lastState) {
      return this.#state({
        inFrame: true,
        ducking: this.ducking,
        riseRatio: this.lastState.riseRatio,
        dropRatio: this.lastState.dropRatio,
      });
    }

    this.ducking = false;
    this.quality = 0;
    return this.#state({ inFrame: false });
  }

  #collectCalibration(now) {
    this.samples.push({
      hip: this.hipY,
      shoulder: this.shoulderY,
      ankle: this.ankleY ?? this.hipY,
    });

    const elapsed = now - this.calibStart;
    if (elapsed >= this.calibrateMs && this.samples.length >= 8) {
      this.standingHipY = median(this.samples.map((s) => s.hip));
      this.standingShoulderY = median(this.samples.map((s) => s.shoulder));
      this.floorY = median(this.samples.map((s) => s.ankle));
      this.torso = Math.max(0.05, this.standingHipY - this.standingShoulderY);
      this.calibrated = true;
      this.calibrating = false;
    }

    return this.#state({
      inFrame: true,
      progress: Math.min(1, elapsed / this.calibrateMs),
    });
  }

  /**
   * If the player parks far off the calibrated baseline for a while, the
   * calibration itself was wrong (captured mid-crouch, or they moved). Snap the
   * baseline to where they actually are rather than fighting them forever.
   */
  #recoverStuckBaseline(riseRatio, dropRatio, now) {
    const high = riseRatio >= this.jumpRiseRatio;
    const low = dropRatio >= this.duckEnterRatio;

    this.aboveSince = high ? (this.aboveSince ?? now) : null;
    this.belowSince = low ? (this.belowSince ?? now) : null;

    const stuckHigh = this.aboveSince != null && now - this.aboveSince >= this.stuckRecoveryMs;
    const stuckLow =
      this.belowSince != null && now - this.belowSince >= this.stuckRecoveryMs * 4;

    if (!stuckHigh && !stuckLow) return;

    this.standingHipY = this.hipY;
    this.standingShoulderY = this.shoulderY;
    this.torso = Math.max(0.05, this.standingHipY - this.standingShoulderY);
    if (this.ankleY != null) this.floorY = this.ankleY;
    this.aboveSince = null;
    this.belowSince = null;
    this.jumpArmed = true;
    this.ducking = false;
  }

  /** Slowly follow the player if they settle into a slightly new stance. */
  #driftBaseline(riseRatio, dropRatio) {
    const settled = Math.abs(riseRatio) < 0.06 && dropRatio < this.duckExitRatio;
    if (!settled) return;
    const r = this.driftRate;
    this.standingHipY += (this.hipY - this.standingHipY) * r;
    this.standingShoulderY += (this.shoulderY - this.standingShoulderY) * r;
    if (this.ankleY != null) this.floorY += (this.ankleY - this.floorY) * r;
    this.torso = Math.max(0.05, this.standingHipY - this.standingShoulderY);
  }

  #state({
    inFrame = false,
    jump = false,
    ducking = false,
    progress,
    riseRatio = 0,
    dropRatio = 0,
  } = {}) {
    const resolvedProgress =
      progress ?? (this.calibrated ? 1 : this.calibrating ? 0 : 0);

    const state = {
      inFrame,
      jump,
      ducking,
      calibrated: this.calibrated,
      calibrating: this.calibrating,
      progress: resolvedProgress,
      quality: this.quality,
      riseRatio,
      dropRatio,
      debug: {
        floorY: this.floorY,
        standingHipY: this.standingHipY,
        standingShoulderY: this.standingShoulderY,
        torso: this.torso,
        hipY: this.hipY,
        shoulderY: this.shoulderY,
        ankleY: this.ankleY,
        duckEnterY:
          this.standingShoulderY != null && this.torso != null
            ? this.standingShoulderY + this.duckEnterRatio * this.torso
            : null,
        jumpLineY:
          this.standingHipY != null && this.torso != null
            ? this.standingHipY - this.jumpRiseRatio * this.torso
            : null,
        riseRatio,
        dropRatio,
      },
    };

    this.lastState = state;
    return state;
  }
}
