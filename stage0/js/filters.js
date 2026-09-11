/** Robust middle value; rejects the outliers a mean would chase. */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return null;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function alphaFor(cutoff, dtSeconds) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtSeconds);
}

/**
 * 1-Euro filter: heavy smoothing while still, light smoothing while moving fast.
 * Beats a fixed EMA for pose input, which otherwise trades jitter for lag.
 */
export class OneEuroFilter {
  constructor({ minCutoff = 1.2, beta = 0.5, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  filter(x, tMs) {
    if (this.xPrev == null || this.tPrev == null) {
      this.xPrev = x;
      this.tPrev = tMs;
      this.dxPrev = 0;
      return x;
    }

    const dt = Math.max(1, tMs - this.tPrev) / 1000;
    this.tPrev = tMs;

    const dx = (x - this.xPrev) / dt;
    const dxHat = this.dxPrev + alphaFor(this.dCutoff, dt) * (dx - this.dxPrev);
    this.dxPrev = dxHat;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const xHat = this.xPrev + alphaFor(cutoff, dt) * (x - this.xPrev);
    this.xPrev = xHat;
    return xHat;
  }

  /** Smoothed rate of change, in units per second. */
  velocity() {
    return this.dxPrev;
  }
}
