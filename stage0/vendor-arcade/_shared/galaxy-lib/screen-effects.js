(function () { /* de-moduled */
'use strict';
/**
 * Screen effects manager for canvas arcade games.
 * Handles shake, flash, slow motion, freeze frame, CRT, and chromatic aberration.
 */

class ScreenEffects {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;

    // Shake state
    this._shakes = []; // { intensity, duration, elapsed }

    // Flash state
    this._flashes = []; // { color, duration, elapsed }

    // Slow motion state
    this._slowMo = null; // { factor, duration, elapsed, rampIn, rampOut }
    this._timeScale = 1;

    // Freeze frame state
    this._freeze = null; // { duration, elapsed }

    // CRT state
    this._crtEnabled = false;
    this._crtOverlay = null;
    this._crtVignette = null;
    this._cachedWidth = 0;
    this._cachedHeight = 0;

    // Chromatic aberration
    this._aberration = 0;
  }

  // ── Update ──────────────────────────────────────────────────────────

  /**
   * Update all active effects. Call once per frame.
   * @param {number} dt - delta time in seconds (real time, not scaled)
   */
  update(dt) {
    this._updateShake(dt);
    this._updateFlashes(dt);
    this._updateSlowMo(dt);
    this._updateFreeze(dt);

    // Keep canvas dimensions in sync
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.width = this.canvas.width;
      this.height = this.canvas.height;
      this._crtOverlay = null;
      this._crtVignette = null;
    }
  }

  // ── Apply (post-processing) ─────────────────────────────────────────

  /**
   * Apply post-processing effects after game renders. Call after all game
   * drawing is complete.
   * @param {CanvasRenderingContext2D} ctx
   */
  apply(ctx) {
    this._applyShake(ctx);
    this._applyFlashes(ctx);
    if (this._crtEnabled) {
      this._applyCRT(ctx);
    }
    if (this._aberration > 0) {
      this._applyAberration(ctx);
    }
  }

  // ── Screen Shake ────────────────────────────────────────────────────

  /**
   * Trigger a screen shake.
   * @param {number} intensity - max offset in pixels
   * @param {number} duration - duration in seconds
   */
  shake(intensity, duration) {
    this._shakes.push({ intensity, duration, elapsed: 0 });
  }

  _updateShake(dt) {
    for (let i = this._shakes.length - 1; i >= 0; i--) {
      this._shakes[i].elapsed += dt;
      if (this._shakes[i].elapsed >= this._shakes[i].duration) {
        this._shakes.splice(i, 1);
      }
    }
  }

  _applyShake(ctx) {
    if (this._shakes.length === 0) return;

    let totalX = 0;
    let totalY = 0;

    for (const s of this._shakes) {
      const progress = s.elapsed / s.duration;
      const decay = 1 - progress;
      const mag = s.intensity * decay;
      totalX += (Math.random() * 2 - 1) * mag;
      totalY += (Math.random() * 2 - 1) * mag;
    }

    ctx.save();
    ctx.translate(totalX, totalY);
  }

  /**
   * Call after rendering to restore the transform if shake was active.
   * Alternatively, wrap your render in save/restore yourself.
   */
  restoreShake(ctx) {
    if (this._shakes.length > 0) {
      ctx.restore();
    }
  }

  // ── Flash ───────────────────────────────────────────────────────────

  /**
   * Flash the screen with a color overlay that fades out.
   * @param {string} color - CSS color string
   * @param {number} duration - duration in seconds
   */
  flash(color, duration) {
    this._flashes.push({ color, duration, elapsed: 0 });
  }

  _updateFlashes(dt) {
    for (let i = this._flashes.length - 1; i >= 0; i--) {
      this._flashes[i].elapsed += dt;
      if (this._flashes[i].elapsed >= this._flashes[i].duration) {
        this._flashes.splice(i, 1);
      }
    }
  }

  _applyFlashes(ctx) {
    for (const f of this._flashes) {
      const progress = f.elapsed / f.duration;
      const alpha = 1 - progress;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  // ── Slow Motion ─────────────────────────────────────────────────────

  /**
   * Activate slow motion.
   * @param {number} factor - time scale (e.g., 0.25 = quarter speed)
   * @param {number} duration - total duration in seconds (real time)
   * @param {number} [rampIn=0.05] - ramp-in time in seconds
   * @param {number} [rampOut=0.15] - ramp-out time in seconds
   */
  slowMo(factor, duration, rampIn = 0.05, rampOut = 0.15) {
    this._slowMo = { factor, duration, elapsed: 0, rampIn, rampOut };
  }

  /**
   * Get the current time scale. Multiply your game dt by this value.
   * @returns {number}
   */
  getTimeScale() {
    return this._timeScale;
  }

  _updateSlowMo(dt) {
    if (!this._slowMo) {
      this._timeScale = 1;
      return;
    }

    const s = this._slowMo;
    s.elapsed += dt;

    if (s.elapsed >= s.duration) {
      this._slowMo = null;
      this._timeScale = 1;
      return;
    }

    // Smooth ramp in/out
    let t;
    if (s.elapsed < s.rampIn) {
      // Ramping in: lerp from 1 to factor
      t = s.elapsed / s.rampIn;
      this._timeScale = 1 + (s.factor - 1) * t;
    } else if (s.elapsed > s.duration - s.rampOut) {
      // Ramping out: lerp from factor to 1
      t = (s.duration - s.elapsed) / s.rampOut;
      this._timeScale = 1 + (s.factor - 1) * t;
    } else {
      this._timeScale = s.factor;
    }
  }

  // ── Freeze Frame ────────────────────────────────────────────────────

  /**
   * Freeze the game for a short duration (hit-stop).
   * @param {number} duration - freeze duration in seconds
   */
  freeze(duration) {
    this._freeze = { duration, elapsed: 0 };
  }

  /**
   * Check if the game should skip its update this frame.
   * @returns {boolean} true if frozen
   */
  isFrozen() {
    return this._freeze !== null;
  }

  _updateFreeze(dt) {
    if (!this._freeze) return;
    this._freeze.elapsed += dt;
    if (this._freeze.elapsed >= this._freeze.duration) {
      this._freeze = null;
    }
  }

  // ── CRT Effect ──────────────────────────────────────────────────────

  /**
   * Toggle the CRT post-processing effect.
   * @param {boolean} enabled
   */
  setCRT(enabled) {
    this._crtEnabled = enabled;
  }

  _buildCRTOverlay() {
    if (
      this._crtOverlay &&
      this._cachedWidth === this.width &&
      this._cachedHeight === this.height
    ) {
      return;
    }

    this._cachedWidth = this.width;
    this._cachedHeight = this.height;

    // Scanline overlay
    const scanCanvas = document.createElement('canvas');
    scanCanvas.width = this.width;
    scanCanvas.height = this.height;
    const sctx = scanCanvas.getContext('2d');
    sctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let y = 0; y < this.height; y += 2) {
      sctx.fillRect(0, y, this.width, 1);
    }
    this._crtOverlay = scanCanvas;

    // Vignette overlay
    const vigCanvas = document.createElement('canvas');
    vigCanvas.width = this.width;
    vigCanvas.height = this.height;
    const vctx = vigCanvas.getContext('2d');
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);
    const grad = vctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    vctx.fillStyle = grad;
    vctx.fillRect(0, 0, this.width, this.height);
    this._crtVignette = vigCanvas;
  }

  _applyCRT(ctx) {
    this._buildCRTOverlay();

    // Chromatic aberration (subtle RGB shift for CRT look)
    const shift = this._aberration > 0 ? 0 : 1;
    if (shift > 0) {
      this._doAberration(ctx, shift);
    }

    // Scanlines
    ctx.drawImage(this._crtOverlay, 0, 0);

    // Vignette
    ctx.drawImage(this._crtVignette, 0, 0);
  }

  // ── Chromatic Aberration ────────────────────────────────────────────

  /**
   * Set the chromatic aberration amount.
   * @param {number} amount - offset in pixels (0 to disable, 1-3 typical)
   */
  setAberration(amount) {
    this._aberration = amount;
  }

  _applyAberration(ctx) {
    this._doAberration(ctx, this._aberration);
  }

  _doAberration(ctx, amount) {
    if (amount <= 0) return;

    const w = this.width;
    const h = this.height;

    // Capture current canvas
    const imageData = ctx.getImageData(0, 0, w, h);
    const src = imageData.data;
    const output = ctx.createImageData(w, h);
    const dst = output.data;

    const offset = Math.round(amount);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;

        // Red channel shifted left
        const rx = Math.max(0, Math.min(w - 1, x - offset));
        const ri = (y * w + rx) * 4;

        // Green channel stays centered
        // Blue channel shifted right
        const bx = Math.max(0, Math.min(w - 1, x + offset));
        const bi = (y * w + bx) * 4;

        dst[i] = src[ri];         // R from left
        dst[i + 1] = src[i + 1]; // G centered
        dst[i + 2] = src[bi + 2]; // B from right
        dst[i + 3] = src[i + 3]; // A centered
      }
    }

    ctx.putImageData(output, 0, 0);
  }

  // ── Convenience Methods ─────────────────────────────────────────────

  /**
   * Quick hit effect: small shake + white flash.
   * @param {number} [intensity=3] - shake intensity
   */
  hit(intensity = 3) {
    this.shake(intensity, 0.15);
    this.flash('white', 0.08);
  }

  /**
   * Big explosion effect: large shake + bright flash + slow motion.
   */
  bigExplosion() {
    this.shake(10, 0.5);
    this.flash('white', 0.2);
    this.slowMo(0.2, 0.8, 0.02, 0.3);
  }
}

Object.assign(window, { ScreenEffects });
})();
