/**
 * Keeps the frame rate honest on whatever device turns up, by adjusting how
 * many device pixels the game canvas is drawn at.
 *
 * It deliberately has only this one dial. Skipping pose detections also buys
 * back frame time, but it is paid for by the hand games: every skipped camera
 * frame is another 30-60ms before the game knows where your hand is, and
 * reaching for something you can see and missing it is far worse than a
 * slightly softer picture.
 *
 * This file is pure policy so it can be tested without a browser.
 */

/** Render scales tried in order, best looking first. */
export const SCALES = [2, 1.5, 1.25, 1];

export class PerfGovernor {
  /**
   * @param targetMs   a frame longer than this is a frame we failed to deliver
   * @param sampleSize frames to watch before changing anything
   * @param patience   consecutive good windows required before scaling back up
   */
  constructor({ targetMs = 20, sampleSize = 45, patience = 3, scales = SCALES } = {}) {
    this.targetMs = targetMs;
    this.sampleSize = sampleSize;
    this.patience = patience;
    this.scales = scales;
    this.index = 0;
    this.samples = [];
    this.goodWindows = 0;
    this.avgInferMs = 0;
  }

  get scale() {
    return this.scales[this.index];
  }

  /**
   * Record one frame. Returns true when the render scale changed, which is the
   * caller's cue to resize the canvas.
   */
  frame(ms) {
    // A frame spanning several seconds is a backgrounded tab, not slow drawing.
    if (!(ms > 0) || ms > 1000) return false;
    this.samples.push(ms);
    if (this.samples.length < this.sampleSize) return false;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.samples = [];

    if (median > this.targetMs && this.index < this.scales.length - 1) {
      this.index += 1;
      this.goodWindows = 0;
      return true;
    }

    // Only climb back up from comfortable headroom, and only after holding it
    // for a while, so a device on the edge does not flap between two scales.
    if (median < this.targetMs * 0.7 && this.index > 0) {
      this.goodWindows += 1;
      if (this.goodWindows >= this.patience) {
        this.index -= 1;
        this.goodWindows = 0;
        return true;
      }
      return false;
    }

    this.goodWindows = 0;
    return false;
  }

  /**
   * Track how long pose detection is taking. Nothing is throttled on the back
   * of it; it is reported so a slow device can be recognised as such instead
   * of guessed at.
   */
  poseCost(ms) {
    this.avgInferMs = this.avgInferMs ? this.avgInferMs * 0.92 + ms * 0.08 : ms;
    return this.avgInferMs;
  }

  /** What the debug panel shows, and what the tests read. */
  report() {
    return {
      scale: this.scale,
      avgInferMs: Math.round(this.avgInferMs * 10) / 10,
    };
  }
}
