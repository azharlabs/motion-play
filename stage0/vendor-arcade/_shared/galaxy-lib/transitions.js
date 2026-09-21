(function () { /* de-moduled */
'use strict';
// ── Scene Transition Effects ────────────────────────────────


// ── Individual transition renderers ─────────────────────────

const fadeOut = (ctx, p, w, h, color) => {
  ctx.globalAlpha = p;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
};

const fadeIn = (ctx, p, w, h, color) => {
  ctx.globalAlpha = 1 - p;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
};

const wipeLeft = (ctx, p, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w * p, h);
};

const wipeRight = (ctx, p, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(w * (1 - p), 0, w * p, h);
};

const wipeDown = (ctx, p, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h * p);
};

const circleClose = (ctx, p, w, h, color) => {
  const cx = w / 2, cy = h / 2;
  const maxR = Math.hypot(cx, cy);
  const r = maxR * (1 - p);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.arc(cx, cy, Math.max(r, 0), 0, Math.PI * 2, true);
  ctx.fill('evenodd');
};

const circleOpen = (ctx, p, w, h, color) => {
  circleClose(ctx, 1 - p, w, h, color);
};

const scanlines = (ctx, p, w, h, color) => {
  ctx.fillStyle = color;
  const lineH = 4;
  const totalLines = Math.ceil(h / lineH);
  const activeLines = Math.floor(totalLines * p);
  for (let i = 0; i < activeLines; i++) {
    ctx.fillRect(0, i * lineH, w, lineH / 2);
  }
  // Fill solid once fully progressed
  if (p >= 1) ctx.fillRect(0, 0, w, h);
};

// Pre-generate a shuffled pixel-block order for dissolve (lazily cached)
let _dissolveOrder = null;
let _dissolveSize = 0;
const BLOCK = 8;

function getDissolveOrder(w, h) {
  const cols = Math.ceil(w / BLOCK), rows = Math.ceil(h / BLOCK);
  const total = cols * rows;
  if (_dissolveOrder && _dissolveSize === total) return _dissolveOrder;
  _dissolveOrder = Array.from({ length: total }, (_, i) => i);
  // Fisher-Yates with deterministic seed for consistency
  let seed = 42;
  for (let i = total - 1; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647;
    const j = seed % (i + 1);
    [_dissolveOrder[i], _dissolveOrder[j]] = [_dissolveOrder[j], _dissolveOrder[i]];
  }
  _dissolveSize = total;
  return _dissolveOrder;
}

const pixelDissolve = (ctx, p, w, h, color) => {
  const cols = Math.ceil(w / BLOCK);
  const order = getDissolveOrder(w, h);
  const count = Math.floor(order.length * p);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const idx = order[i];
    const bx = (idx % cols) * BLOCK;
    const by = Math.floor(idx / cols) * BLOCK;
    ctx.fillRect(bx, by, BLOCK, BLOCK);
  }
};

const glitch = (ctx, p, w, h, color) => {
  const sliceCount = 12;
  const sliceH = h / sliceCount;
  const intensity = Math.sin(p * Math.PI) * 0.15; // peaks at midpoint
  ctx.fillStyle = color;
  ctx.globalAlpha = p;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  if (intensity > 0.01) {
    for (let i = 0; i < sliceCount; i++) {
      const y = i * sliceH;
      // Pseudo-random offset per slice per frame based on progress
      const seed = Math.sin(i * 127.1 + p * 311.7) * 43758.5453;
      const offset = (seed - Math.floor(seed) - 0.5) * w * intensity;
      ctx.drawImage(ctx.canvas, 0, y, w, sliceH, offset, y, w, sliceH);
    }
  }
};

// ── Transition type registry ────────────────────────────────

const TYPES = {
  fadeOut, fadeIn, wipeLeft, wipeRight, wipeDown,
  circleClose, circleOpen, scanlines, pixelDissolve, glitch,
};

// ── TransitionManager ───────────────────────────────────────

class TransitionManager {
  #type = null;
  #renderFn = null;
  #duration = 0;
  #elapsed = 0;
  #callback = null;
  #callbackFired = false;
  #color = '#000';
  #isFade = false;

  /** Whether a transition is currently running. */
  get isActive() { return this.#type !== null; }

  /** Current progress from 0.0 to 1.0. */
  get progress() {
    if (!this.isActive) return 0;
    return clamp(this.#elapsed / this.#duration, 0, 1);
  }

  /**
   * Start a transition effect.
   * @param {string} type - Transition type name.
   * @param {number} duration - Duration in seconds.
   * @param {Function} [callback] - Called on completion (or at midpoint for 'fade').
   * @param {string} [color='#000'] - Fill color.
   */
  start(type, duration, callback, color = '#000') {
    this.#color = color;
    this.#callback = callback || null;
    this.#callbackFired = false;
    this.#elapsed = 0;

    if (type === 'fade') {
      this.#isFade = true;
      this.#type = 'fade';
      this.#duration = duration;
      this.#renderFn = null; // handled specially
    } else {
      if (!TYPES[type]) throw new Error(`Unknown transition: ${type}`);
      this.#isFade = false;
      this.#type = type;
      this.#duration = duration;
      this.#renderFn = TYPES[type];
    }
  }

  /**
   * Advance transition timer.
   * @param {number} dt - Delta time in seconds.
   */
  update(dt) {
    if (!this.isActive) return;
    this.#elapsed += dt;

    if (this.#isFade) {
      const half = this.#duration / 2;
      if (this.#elapsed >= half && !this.#callbackFired) {
        this.#callbackFired = true;
        this.#callback?.();
      }
      if (this.#elapsed >= this.#duration) this.#stop();
    } else {
      if (this.#elapsed >= this.#duration) {
        this.#elapsed = this.#duration;
        this.#callback?.();
        this.#stop();
      }
    }
  }

  /**
   * Render the transition overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   */
  render(ctx, width, height) {
    if (!this.isActive) return;
    ctx.save();

    if (this.#isFade) {
      const half = this.#duration / 2;
      let p;
      if (this.#elapsed < half) {
        p = easeInOutCubic(clamp(this.#elapsed / half, 0, 1));
        fadeOut(ctx, p, width, height, this.#color);
      } else {
        p = easeInOutCubic(clamp((this.#elapsed - half) / half, 0, 1));
        fadeIn(ctx, p, width, height, this.#color);
      }
    } else {
      const p = easeInOutCubic(this.progress);
      this.#renderFn(ctx, p, width, height, this.#color);
    }

    ctx.restore();
  }

  #stop() {
    this.#type = null;
    this.#renderFn = null;
  }
}

Object.assign(window, { TransitionManager });
})();
